const API_BASE = "https://jhfndh1s03.execute-api.us-east-1.amazonaws.com";

// Upload limits (keep in sync with the backend)
const MAX_FILE_MB = 25;
const MAX_DURATION_MINUTES = 10;
const MAX_POLL_ATTEMPTS = 75;          // 75 × 4 s ≈ 5 minutes
const POLL_INTERVAL_MS = 4000;
const DURATION_CHECK_TIMEOUT_MS = 5000;

const uploadBtn = document.getElementById("uploadBtn");
const statusText = document.getElementById("status");
const waitNote = document.getElementById("waitNote");
const resultBox = document.getElementById("result");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("audioFile");
const fileNameText = document.getElementById("fileName");

uploadBtn.addEventListener("click", upload);

// ---------------------------
// Show the chosen file name
// ---------------------------
function showFileName() {
    const file = fileInput.files[0];
    if (file) {
        fileNameText.textContent = file.name;
        fileNameText.title = file.name;
        fileNameText.classList.add("has-file");
    } else {
        fileNameText.textContent = "No File Chosen";
        fileNameText.title = "";
        fileNameText.classList.remove("has-file");
    }
}

fileInput.addEventListener("change", showFileName);

// ---------------------------
// Drag and drop
// ---------------------------
["dragenter", "dragover"].forEach(evt => {
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.classList.add("dragging");
    });
});

["dragleave", "drop"].forEach(evt => {
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.classList.remove("dragging");
    });
});

dropZone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".mp3")) {
        statusText.innerText = "Please drop an MP3 file.";
        return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    statusText.innerText = "";
    showFileName();
});

// Stop the browser from opening the file if it's dropped outside the box
["dragover", "drop"].forEach(evt => {
    window.addEventListener(evt, e => e.preventDefault());
});

// ---------------------------
// Read the audio length in the browser
// ---------------------------
// Returns the length in seconds, or null if it can't be read in time
function getAudioDurationSeconds(file) {
    return new Promise(resolve => {
        const audio = new Audio();
        const objectUrl = URL.createObjectURL(file);
        let done = false;

        function finish(seconds) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            URL.revokeObjectURL(objectUrl);
            resolve(Number.isFinite(seconds) ? seconds : null);
        }

        const timer = setTimeout(() => finish(null), DURATION_CHECK_TIMEOUT_MS);
        audio.addEventListener("loadedmetadata", () => finish(audio.duration));
        audio.addEventListener("error", () => finish(null));
        audio.preload = "metadata";
        audio.src = objectUrl;
    });
}

// ---------------------------
// Upload and analysis
// ---------------------------
async function upload() {
    const file = fileInput.files[0];

    if(!file) {
        alert("Please select an audio file.");
        return;
    }

    uploadBtn.disabled = true;
    resultBox.style.display = "none";
    waitNote.style.display = "none";

    if(file.size > MAX_FILE_MB * 1024 * 1024) {
        statusText.innerText = `This file is too large. Please upload an MP3 under ${MAX_FILE_MB} MB.`;
        uploadBtn.disabled = false;
        return;
    }

    statusText.innerText = "Checking your recording...";
    const durationSeconds = await getAudioDurationSeconds(file);
    if(durationSeconds !== null && durationSeconds > MAX_DURATION_MINUTES * 60) {
        statusText.innerText = `This recording is longer than ${MAX_DURATION_MINUTES} minutes. Please upload a shorter speech.`;
        uploadBtn.disabled = false;
        return;
    }

    try {
        statusText.innerText = "Initializing Stage...";
        const response = await fetch(`${API_BASE}/upload-url`);

        if(response.status === 429) {
            const limit = await response.json().catch(() => ({}));
            statusText.innerText = limit.message || "Upload limit reached. Please try again later.";
            uploadBtn.disabled = false;
            return;
        }

        if(!response.ok) throw new Error(`upload-url failed: ${response.status}`);

        const data = await response.json();

        // S3 presigned POST: the given fields first, the file last
        const formData = new FormData();
        Object.entries(data.upload.fields).forEach(([key, value]) => {
            formData.append(key, value);
        });
        formData.append("file", file);

        const uploadResponse = await fetch(data.upload.url, {
            method: "POST",
            body: formData
        });

        if(!uploadResponse.ok) {
            console.error("S3 upload failed:", uploadResponse.status);
            statusText.innerText = `Upload failed. Please make sure your MP3 is under ${MAX_FILE_MB} MB and try again.`;
            uploadBtn.disabled = false;
            return;
        }

        statusText.innerText = "Analyzing Performance Patterns...";
        waitNote.style.display = "block";
        pollResult(data.fileId);

    } catch(err) {
        console.error(err);
        statusText.innerText = "Technical error occurred.";
        waitNote.style.display = "none";
        uploadBtn.disabled = false;
    }
}

async function pollResult(speechId) {
    let attempts = 0;
    let stopped = false;   // ignores replies that arrive after we've finished
    const interval = setInterval(async () => {
        if(stopped) return;
        attempts++;

        // Checked before the request so a failing connection still gives up
        if(attempts > MAX_POLL_ATTEMPTS) {
            stopped = true;
            clearInterval(interval);
            waitNote.style.display = "none";
            statusText.innerText = "This is taking longer than expected. Please try again in a few minutes.";
            uploadBtn.disabled = false;
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/result?speech_id=${speechId}`);
            const result = await res.json();

            if(stopped) return;

            if(result && result.wpm) {
                stopped = true;
                clearInterval(interval);
                waitNote.style.display = "none";
                uploadBtn.disabled = false;
                statusText.innerText = "Spotlight Ready.";
                displayResult(result);
                return;
            }
        } catch(err) {
            console.error("Polling...", err);
        }
    }, POLL_INTERVAL_MS);
}

// Makes text safe to put inside HTML by turning special characters into harmless codes
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function displayResult(data) {
    resultBox.style.display = "block";

    const confidenceRaw = Number(data.avg_confidence);
    const confidenceScore = Number.isFinite(confidenceRaw) ? Math.round(confidenceRaw * 100) : 0;

    // Escapes the AI's text first, then turns its formatting (#, ##, ###, **bold**) into real bold text
    const cleanFeedback = data.ai_feedback
        ? escapeHtml(data.ai_feedback)
            .trim()
            .replace(/^#{1,6}\s*(.*)$/gm, '<strong>$1</strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\s*\n/g, '<br><br>')
            .replace(/\n/g, '<br>')
        : "Analysis is being finalized.";

    // Filler word breakdown
    let breakdownHtml = '';
    if (data.filler_word_breakdown) {
        Object.entries(data.filler_word_breakdown).forEach(([word, count]) => {
            breakdownHtml += `<div class="filler-tag">${escapeHtml(word)}: ${escapeHtml(count)}</div>`;
        });
    }

    resultBox.innerHTML = `
        <h2 class="card-title">Results</h2>

        <div class="metrics-grid">
            <div class="metric-tile">
                <span class="metric-label">Pacing (WPM)</span>
                <span class="metric-value">${escapeHtml(data.wpm ?? "0")}</span>
            </div>
            <div class="metric-tile">
                <span class="metric-label">Total Filler Words</span>
                <span class="metric-value">${escapeHtml(data.filler_word_total ?? "0")}</span>
            </div>
            <div class="metric-tile">
                <span class="metric-label">Confidence Score</span>
                <span class="metric-value">${confidenceScore}%</span>
                <div class="score-bar-bg">
                    <div id="confidenceFill" class="score-fill" style="width: 0%"></div>
                </div>
            </div>
        </div>

        <div class="breakdown-area">
            ${breakdownHtml}
        </div>

        <div class="feedback-area">
            <h3>SpeakReview Feedback</h3>
            <div class="feedback-content">${cleanFeedback}</div>
        </div>
    `;

    setTimeout(() => {
        const fill = document.getElementById('confidenceFill');
        if(fill) fill.style.width = confidenceScore + '%';
    }, 100);
}
