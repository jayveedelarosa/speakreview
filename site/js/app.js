const API_BASE = "https://jhfndh1s03.execute-api.us-east-1.amazonaws.com";

// Upload limits (keep in sync with the backend)
const MAX_FILE_MB = 25;
const MAX_DURATION_MINUTES = 10;
const MAX_POLL_ATTEMPTS = 75;          // 75 × 4 s ≈ 5 minutes
const POLL_INTERVAL_MS = 4000;
const DURATION_CHECK_TIMEOUT_MS = 5000;
const MAX_TOPIC_LENGTH = 120;
const MIN_TIME_LIMIT_SECONDS = 30;
const MAX_TIME_LIMIT_SECONDS = 600;

// Label and hint shown for each type of random topic
const TOPIC_TYPE_INFO = {
    persuade: { label: "Persuade", hint: "Take a side and back it up" },
    story:    { label: "Story",    hint: "Tell a story with a point" },
    explain:  { label: "Explain",  hint: "Make an idea clear" },
    reflect:  { label: "Reflect",  hint: "Speak honestly about yourself" },
    imagine:  { label: "Imagine",  hint: "Think on your feet" }
};

const uploadBtn = document.getElementById("uploadBtn");
const statusText = document.getElementById("status");
const waitNote = document.getElementById("waitNote");
const resultBox = document.getElementById("result");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("audioFile");
const fileNameText = document.getElementById("fileName");
const lengthLine = document.getElementById("lengthLine");
const topicInput = document.getElementById("topicInput");
const clearTopicBtn = document.getElementById("clearTopicBtn");
const randomTopicBtn = document.getElementById("randomTopicBtn");
const topicBadge = document.getElementById("topicBadge");
const topicBadgeType = document.getElementById("topicBadgeType");
const topicBadgeHint = document.getElementById("topicBadgeHint");
const timeRadios = document.querySelectorAll('input[name="timeLimit"]');
const customTime = document.getElementById("customTime");
const customMinutes = document.getElementById("customMinutes");
const customSeconds = document.getElementById("customSeconds");
const customTimeError = document.getElementById("customTimeError");
// Every topic and time control, so they can be locked while a speech is being analyzed
const optionControls = document.querySelectorAll("#stepTopic input, #stepTopic button, #stepTime input");

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
    updateLengthFromFile();
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
// Time helpers
// ---------------------------
// Turns a number of seconds into minutes:seconds, for example 252 becomes "4:12"
function formatTime(seconds) {
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
}

// Compares a speech length with a time limit, for example "1:12 over" or "on time"
function describeTiming(actualSeconds, limitSeconds) {
    const difference = Math.round(actualSeconds) - limitSeconds;
    if (difference > 0) return { text: `${formatTime(difference)} over`, className: "timing-over" };
    if (difference < 0) return { text: `${formatTime(-difference)} under`, className: "timing-ok" };
    return { text: "on time", className: "timing-ok" };
}

// ---------------------------
// Topic
// ---------------------------
let randomTopic = null;        // the picked random topic, or null if the topic was typed or edited
let lastTopicIndex = -1;

function showTopicBadge(type) {
    const info = TOPIC_TYPE_INFO[type];
    if (!info) {
        topicBadge.hidden = true;
        return;
    }
    topicBadgeType.textContent = info.label;
    topicBadgeHint.textContent = info.hint;
    topicBadge.hidden = false;
}

function updateClearButton() {
    clearTopicBtn.hidden = topicInput.value === "";
}

function pickRandomTopic() {
    let index;
    // Keep picking until the topic differs from the last one
    do {
        index = Math.floor(Math.random() * TOPICS.length);
    } while (TOPICS.length > 1 && index === lastTopicIndex);

    lastTopicIndex = index;
    randomTopic = TOPICS[index];
    topicInput.value = randomTopic.text;
    showTopicBadge(randomTopic.type);
    updateClearButton();
    randomTopicBtn.textContent = "New topic";
}

randomTopicBtn.addEventListener("click", pickRandomTopic);

// Any edit turns the topic into the user's own topic
topicInput.addEventListener("input", () => {
    randomTopic = null;
    topicBadge.hidden = true;
    updateClearButton();
});

clearTopicBtn.addEventListener("click", () => {
    topicInput.value = "";
    randomTopic = null;
    topicBadge.hidden = true;
    updateClearButton();
    topicInput.focus();
});

// ---------------------------
// Time limit
// ---------------------------
const TIME_LIMIT_ERROR = `Choose a time between ${formatTime(MIN_TIME_LIMIT_SECONDS)} and ${formatTime(MAX_TIME_LIMIT_SECONDS)}.`;
let isBusy = false;            // true while a speech is uploading or being analyzed

// Returns { valid, seconds }. seconds is null when the speech is untimed.
function getTimeLimit() {
    const choice = document.querySelector('input[name="timeLimit"]:checked');
    if (!choice || choice.value !== "custom") {
        const seconds = choice ? Number(choice.value) : 0;
        return { valid: true, seconds: seconds > 0 ? seconds : null };
    }

    // Number inputs give "" when the box is empty or not a number
    const isWholeNumber = text => /^\d+$/.test(text.trim());
    if (!isWholeNumber(customMinutes.value) || !isWholeNumber(customSeconds.value)) {
        return { valid: false, seconds: null };
    }
    const minutes = Number(customMinutes.value);
    const seconds = Number(customSeconds.value);
    const total = minutes * 60 + seconds;
    const valid = minutes <= 10 && seconds <= 59
        && total >= MIN_TIME_LIMIT_SECONDS && total <= MAX_TIME_LIMIT_SECONDS;
    return { valid, seconds: valid ? total : null };
}

function onTimeChange() {
    const isCustom = document.querySelector('input[name="timeLimit"]:checked')?.value === "custom";
    customTime.hidden = !isCustom;

    const { valid } = getTimeLimit();
    customTimeError.textContent = valid ? "" : TIME_LIMIT_ERROR;
    customMinutes.setAttribute("aria-invalid", String(!valid));
    customSeconds.setAttribute("aria-invalid", String(!valid));

    if (!isBusy) uploadBtn.disabled = !valid;
    renderLengthLine();
}

timeRadios.forEach(radio => radio.addEventListener("change", onTimeChange));
customMinutes.addEventListener("input", onTimeChange);
customSeconds.addEventListener("input", onTimeChange);

// ---------------------------
// Length line under the file name
// ---------------------------
let fileLengthSeconds = null;
let lengthRequest = 0;         // counts reads, so a slow old read can't replace a newer one

async function updateLengthFromFile() {
    const file = fileInput.files[0];
    const request = ++lengthRequest;
    fileLengthSeconds = null;
    renderLengthLine();
    if (!file) return;

    const seconds = await getAudioDurationSeconds(file);
    if (request !== lengthRequest) return;
    fileLengthSeconds = seconds;
    renderLengthLine();
}

function renderLengthLine() {
    if (fileLengthSeconds === null) {
        lengthLine.hidden = true;
        lengthLine.textContent = "";
        return;
    }

    const { valid, seconds: limit } = getTimeLimit();
    lengthLine.textContent = `Length: ${formatTime(fileLengthSeconds)}`;

    if (valid && limit !== null) {
        const timing = describeTiming(fileLengthSeconds, limit);
        lengthLine.append(` / Limit: ${formatTime(limit)} `);
        const note = document.createElement("span");
        note.className = timing.className;
        note.textContent = `(${timing.text})`;
        lengthLine.append(note);
    }
    lengthLine.hidden = false;
}

// ---------------------------
// Lock the topic and time controls during analysis
// ---------------------------
function setOptionsDisabled(disabled) {
    isBusy = disabled;
    optionControls.forEach(control => {
        control.disabled = disabled;
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

    const timeLimit = getTimeLimit();
    if(!timeLimit.valid) {
        statusText.textContent = TIME_LIMIT_ERROR;
        return;
    }

    const topic = topicInput.value.trim();
    if(topic.length > MAX_TOPIC_LENGTH) {
        statusText.textContent = `Topics can be up to ${MAX_TOPIC_LENGTH} characters.`;
        return;
    }

    uploadBtn.disabled = true;
    setOptionsDisabled(true);
    resultBox.style.display = "none";
    waitNote.style.display = "none";

    if(file.size > MAX_FILE_MB * 1024 * 1024) {
        statusText.innerText = `This file is too large. Please upload an MP3 under ${MAX_FILE_MB} MB.`;
        uploadBtn.disabled = false;
        setOptionsDisabled(false);
        return;
    }

    statusText.innerText = "Checking your recording...";
    const durationSeconds = await getAudioDurationSeconds(file);
    if(durationSeconds !== null && durationSeconds > MAX_DURATION_MINUTES * 60) {
        statusText.innerText = `This recording is longer than ${MAX_DURATION_MINUTES} minutes. Please upload a shorter speech.`;
        uploadBtn.disabled = false;
        setOptionsDisabled(false);
        return;
    }

    try {
        statusText.innerText = "Initializing Stage...";

        // Optional details, only added when they are set
        const params = new URLSearchParams();
        if(topic) params.set("topic", topic);
        if(topic && randomTopic && topic === randomTopic.text) params.set("topicType", randomTopic.type);
        if(timeLimit.seconds !== null) params.set("timeLimit", String(timeLimit.seconds));
        const query = params.toString();

        const response = await fetch(`${API_BASE}/upload-url${query ? "?" + query : ""}`);

        if(response.status === 429) {
            const limit = await response.json().catch(() => ({}));
            statusText.innerText = limit.message || "Upload limit reached. Please try again later.";
            uploadBtn.disabled = false;
            setOptionsDisabled(false);
            return;
        }

        if(response.status === 400) {
            const problem = await response.json().catch(() => ({}));
            statusText.textContent = problem.message || "Please check your topic and time limit.";
            uploadBtn.disabled = false;
            setOptionsDisabled(false);
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
            setOptionsDisabled(false);
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
        setOptionsDisabled(false);
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
            setOptionsDisabled(false);
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
                setOptionsDisabled(false);
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

    // Topic and time details (older results don't have them)
    let detailsHtml = '';
    if (data.topic) {
        const typeInfo = TOPIC_TYPE_INFO[data.topic_type];
        const typeBadge = data.topic_type
            ? ` <span class="topic-badge">${escapeHtml(typeInfo ? typeInfo.label : data.topic_type)}</span>`
            : '';
        detailsHtml += `<p class="result-detail"><span class="detail-label">Topic:</span> ${escapeHtml(data.topic)}${typeBadge}</p>`;
    }
    const speakingSeconds = Number(data.speaking_seconds);
    if (data.speaking_seconds != null && Number.isFinite(speakingSeconds)) {
        const limitSeconds = Number(data.time_limit_seconds);
        let timeText;
        if (data.time_limit_seconds != null && Number.isFinite(limitSeconds) && limitSeconds > 0) {
            const timing = describeTiming(speakingSeconds, limitSeconds);
            timeText = `${escapeHtml(formatTime(speakingSeconds))} / ${escapeHtml(formatTime(limitSeconds))} `
                + `<span class="${timing.className}">(${escapeHtml(timing.text)})</span>`;
        } else {
            timeText = `${escapeHtml(formatTime(speakingSeconds))} (untimed)`;
        }
        detailsHtml += `<p class="result-detail"><span class="detail-label">Time:</span> ${timeText}</p>`;
    }
    if (detailsHtml) detailsHtml = `<div class="result-details">${detailsHtml}</div>`;

    resultBox.innerHTML = `
        <h2 class="card-title">Results</h2>

        ${detailsHtml}

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
