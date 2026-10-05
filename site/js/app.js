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

// Pauses between topics in the random topic roll, getting longer so it slows down (770 ms in total)
const ROLL_DELAYS_MS = [40, 40, 45, 50, 60, 70, 85, 100, 125, 155];

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
const topicAnnounce = document.getElementById("topicAnnounce");
const resultPlaceholder = document.getElementById("resultPlaceholder");
const stepperButtons = document.querySelectorAll(".stepper-btn");
const writeTopicBtn = document.getElementById("writeTopicBtn");
const fileInfo = document.getElementById("fileInfo");
const uploadLabel = document.getElementById("uploadLabel");
const privacyBtn = document.getElementById("privacyBtn");
const privacyNote = document.getElementById("privacyNote");
const navButtons = document.querySelectorAll(".nav-item");
const backstageView = document.getElementById("backstageView");
const backToStageBtn = document.getElementById("backToStageBtn");
const tryAgainBtn = document.getElementById("tryAgainBtn");
const goToStageBtn = document.getElementById("goToStageBtn");
const perfSummary = document.getElementById("perfSummary");
const coachNotesBody = document.getElementById("coachNotesBody");
const coachNotesTitle = document.getElementById("coachNotesTitle");
const backstageEmptyTitle = document.getElementById("backstageEmptyTitle");
const mirror = document.getElementById("mirror");
const intermission = document.getElementById("intermission");
const sceneAnnounce = document.getElementById("sceneAnnounce");
const appRoot = document.querySelector(".app");
// Every topic and time control, so they can be locked while a speech is being analyzed
const optionControls = document.querySelectorAll("#stepTopic textarea, #stepTopic button, #stepTime input, #stepTime button");

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
    // The Begin button and file details only appear once a file is picked
    fileInfo.hidden = !file;
    uploadBtn.hidden = !file;
    uploadLabel.textContent = file ? "Choose another MP3" : "Upload an MP3";
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

let speakFreely = false;       // true after "Speak freely, no topic"

// The placeholder doubles as the big heading when there is no topic
function updateTopicPlaceholder() {
    if (document.activeElement === topicInput) {
        topicInput.placeholder = "Type your own topic";
    } else if (speakFreely) {
        topicInput.placeholder = "Speak on anything you like";
    } else {
        topicInput.placeholder = "Roll a topic, or write your own";
    }
    fitTopicHeight();
}

let isRolling = false;         // true while the random topic animation is running

// The height of 3 lines at the current font size, including padding and borders
function threeLineHeight() {
    const style = getComputedStyle(topicInput);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    return lineHeight * 3 + padding + borders;
}

// Sets the topic box height for its text, up to maxHeight. Returns false if the text needs more.
function sizeTopicBox(maxHeight) {
    const style = getComputedStyle(topicInput);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

    // When empty, measure the placeholder instead, since it is shown as the heading
    const text = topicInput.value;
    if (text === "") topicInput.value = topicInput.placeholder;
    topicInput.style.height = "auto";
    const needed = topicInput.scrollHeight + borders;
    if (text === "") topicInput.value = "";

    topicInput.style.height = Math.min(needed, maxHeight) + "px";
    const tooLong = needed > maxHeight + 1;
    topicInput.style.overflowY = tooLong ? "auto" : "hidden";
    topicInput.classList.toggle("is-scrolling", tooLong);
    return !tooLong;
}

// Makes the topic fit in the space of 3 full-size lines. Long typed topics get a smaller font
// (two steps), so a smaller topic may use a 4th line inside that same space instead of being cut off.
function fitTopicHeight() {
    topicInput.classList.remove("topic-long", "topic-longer");
    const maxHeight = threeLineHeight();
    if (sizeTopicBox(maxHeight)) return;
    topicInput.classList.add("topic-long");
    if (sizeTopicBox(maxHeight)) return;
    topicInput.classList.add("topic-longer");
    sizeTopicBox(maxHeight);
}

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pickRandomTopic() {
    if (isRolling) return;

    // The final topic is chosen first. Keep picking until it differs from the last one.
    let index;
    do {
        index = Math.floor(Math.random() * TOPICS.length);
    } while (TOPICS.length > 1 && index === lastTopicIndex);
    lastTopicIndex = index;
    const finalTopic = TOPICS[index];

    if (prefersReducedMotion()) {
        landTopic(finalTopic);
    } else {
        rollToTopic(finalTopic);
    }
}

// Slot machine effect: other topics flick past, slowing down, then the chosen one lands
function rollToTopic(finalTopic) {
    isRolling = true;
    topicBadge.hidden = true;
    topicInput.readOnly = true;
    topicInput.setAttribute("aria-busy", "true");   // tells screen readers to wait for the final text
    topicInput.classList.add("rolling");
    randomTopicBtn.disabled = true;
    writeTopicBtn.disabled = true;
    clearTopicBtn.disabled = true;
    uploadBtn.disabled = true;                      // so a half-rolled topic can't be sent

    let step = 0;
    let shownIndex = -1;
    function showNext() {
        if (step >= ROLL_DELAYS_MS.length) {
            landTopic(finalTopic);
            return;
        }
        // Any other topic, not the previous flick and not the final one
        let next;
        do {
            next = Math.floor(Math.random() * TOPICS.length);
        } while (TOPICS.length > 2 && (next === shownIndex || TOPICS[next] === finalTopic));
        shownIndex = next;
        topicInput.value = TOPICS[next].text;
        setTimeout(showNext, ROLL_DELAYS_MS[step]);
        step++;
    }
    showNext();
}

function landTopic(topic) {
    randomTopic = topic;
    topicInput.value = topic.text;
    topicInput.classList.remove("rolling");
    topicInput.removeAttribute("aria-busy");
    topicInput.readOnly = false;
    isRolling = false;
    speakFreely = false;

    showTopicBadge(topic.type);
    topicAnnounce.textContent = topic.text;         // the only topic screen readers hear
    updateTopicPlaceholder();

    randomTopicBtn.disabled = isBusy;
    writeTopicBtn.disabled = isBusy;
    clearTopicBtn.disabled = isBusy;
    uploadBtn.disabled = isBusy || !getTimeLimit().valid;
}

randomTopicBtn.addEventListener("click", pickRandomTopic);

// The topic is one line of text, so Enter must not add a new line
topicInput.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault();
});

// Any edit turns the topic into the user's own topic
topicInput.addEventListener("input", () => {
    // Pasted text can contain line breaks, so turn them into spaces
    if (/[\r\n]/.test(topicInput.value)) {
        topicInput.value = topicInput.value.replace(/[\r\n]+/g, " ");
    }
    randomTopic = null;
    speakFreely = false;
    topicBadge.hidden = true;
    fitTopicHeight();
});

// "Write your own": edit the big topic in place. The text is selected, so typing replaces it.
writeTopicBtn.addEventListener("click", () => {
    topicInput.focus();
    topicInput.select();
});

topicInput.addEventListener("focus", updateTopicPlaceholder);
topicInput.addEventListener("blur", updateTopicPlaceholder);

// "Speak freely, no topic": no topic is sent with the speech
clearTopicBtn.addEventListener("click", () => {
    topicInput.value = "";
    randomTopic = null;
    speakFreely = true;
    topicBadge.hidden = true;
    topicAnnounce.textContent = "No topic. Speak on anything you like.";
    updateTopicPlaceholder();
});

window.addEventListener("resize", fitTopicHeight);
fitTopicHeight();
// The topic font downloads after the page loads, so measure again once it is ready
if (document.fonts) document.fonts.ready.then(fitTopicHeight);

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

    if (!isBusy && !isRolling) uploadBtn.disabled = !valid;
    renderLengthLine();
}

timeRadios.forEach(radio => radio.addEventListener("change", onTimeChange));
customMinutes.addEventListener("input", onTimeChange);
customSeconds.addEventListener("input", onTimeChange);

// − and + buttons beside the custom minutes and seconds boxes
stepperButtons.forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);
        const step = Number(button.dataset.step);
        const current = /^\d+$/.test(input.value.trim()) ? Number(input.value) : 0;
        // Stay inside the box's own min and max (minutes 0 to 10, seconds 0 to 59)
        const next = Math.min(Number(input.max), Math.max(Number(input.min), current + step));
        input.value = String(next);
        onTimeChange();
    });
});

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
        // The curtains close and Intermission shows while the coach works
        startIntermission();

    } catch(err) {
        console.error(err);
        endIntermission("stage");       // never leave the curtains closed (does nothing if they are open)
        statusText.innerText = "Technical error occurred.";
        waitNote.style.display = "none";
        uploadBtn.disabled = false;
        setOptionsDisabled(false);
    }
}

async function pollResult(speechId) {
    let attempts = 0;
    let stopped = false;   // ignores replies that arrive after we've finished
    let showingResult = false;   // true once a result arrived and is being shown
    const interval = setInterval(async () => {
        if(stopped) return;
        attempts++;

        // Checked before the request so a failing connection still gives up
        if(attempts > MAX_POLL_ATTEMPTS) {
            stopped = true;
            clearInterval(interval);
            endIntermission("stage");   // curtains open back on the Stage before the message shows
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
                showingResult = true;
                clearInterval(interval);
                waitNote.style.display = "none";
                uploadBtn.disabled = false;
                setOptionsDisabled(false);
                statusText.innerText = "Spotlight Ready.";
                displayResult(result);      // fills Backstage and opens the curtains on it
                return;
            }
        } catch(err) {
            console.error("Polling...", err);
            // A network or server error while still polling just tries again on the next tick (as before),
            // and the timeout above opens the curtains if it never succeeds. But if a result arrived and
            // showing it failed, nothing will try again, so open the curtains on the Stage and show the
            // existing error message.
            if(showingResult) {
                endIntermission("stage");
                waitNote.style.display = "none";
                statusText.innerText = "Technical error occurred.";
                uploadBtn.disabled = false;
                setOptionsDisabled(false);
            }
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
    resultPlaceholder.hidden = true;

    const confidenceRaw = Number(data.avg_confidence);
    const confidenceScore = Number.isFinite(confidenceRaw) ? Math.round(confidenceRaw * 100) : 0;

    // Coach's notes. The AI's text is escaped FIRST, then its formatting (headings, numbered points,
    // **bold**) is turned into notes line by line. Every tag added after escaping is a fixed string.
    const cleanFeedback = data.ai_feedback
        ? escapeHtml(data.ai_feedback)
            .trim()
            .split(/\r?\n/)
            .map(formatNoteLine)
            .join("")
        : '<p class="note-text">Analysis is being finalized.</p>';

    // Filler word breakdown, for example "um 3, uh 1"
    let breakdownText = '';
    if (data.filler_word_breakdown) {
        breakdownText = Object.entries(data.filler_word_breakdown)
            .map(([word, count]) => `${escapeHtml(word)} ${escapeHtml(count)}`)
            .join(", ");
    }

    // Topic and type badge (older results don't have them)
    let summaryHtml = `<p class="eyebrow">Tonight's performance</p>`;
    if (data.topic) {
        const typeInfo = TOPIC_TYPE_INFO[data.topic_type];
        summaryHtml += `<p class="perf-topic">${escapeHtml(data.topic)}</p>`;
        if (data.topic_type) {
            summaryHtml += `<span class="topic-badge perf-badge">${escapeHtml(typeInfo ? typeInfo.label : data.topic_type)}</span>`;
        }
    }

    // Time line, for example "3:42 / 3:00" with "0:42 over", or "4:10 (untimed)"
    const speakingSeconds = Number(data.speaking_seconds);
    if (data.speaking_seconds != null && Number.isFinite(speakingSeconds)) {
        const limitSeconds = Number(data.time_limit_seconds);
        let timeHtml;
        if (data.time_limit_seconds != null && Number.isFinite(limitSeconds) && limitSeconds > 0) {
            const timing = describeTiming(speakingSeconds, limitSeconds);
            timeHtml = `<span class="perf-elapsed ${timing.className}">${escapeHtml(formatTime(speakingSeconds))}</span>`
                + `<span class="perf-limit">/ ${escapeHtml(formatTime(limitSeconds))}</span>`
                + `<span class="time-pill ${timing.className}">${escapeHtml(timing.text)}</span>`;
        } else {
            timeHtml = `<span class="perf-elapsed">${escapeHtml(formatTime(speakingSeconds))}</span>`
                + `<span class="perf-limit">(untimed)</span>`;
        }
        summaryHtml += `<div class="perf-time">${timeHtml}</div>`;
    }

    // The three numbers. Phones show the short labels (screen readers always hear the long ones).
    summaryHtml += `
        <div class="perf-stats">
            <div class="stat">
                <span class="stat-num">${escapeHtml(data.wpm ?? "0")}</span>
                <span class="stat-label"><span class="long-label">Words per minute</span><span class="short-label" aria-hidden="true">words per min</span></span>
            </div>
            <div class="stat">
                <span class="stat-num">${escapeHtml(data.filler_word_total ?? "0")}</span>
                <span class="stat-label"><span class="long-label">Filler words</span><span class="short-label" aria-hidden="true">fillers</span>${breakdownText ? `<span class="stat-sub">${breakdownText}</span>` : ''}</span>
            </div>
            <div class="stat">
                <span class="stat-num">${confidenceScore}%</span>
                <span class="stat-label"><span class="long-label">Confidence score</span><span class="short-label" aria-hidden="true">confidence</span></span>
                <div class="score-bar-bg"><div id="confidenceFill" class="score-fill" style="width: 0%"></div></div>
            </div>
        </div>`;

    perfSummary.innerHTML = summaryHtml;
    coachNotesBody.innerHTML = cleanFeedback;
    coachNotesBody.scrollTop = 0;

    setTimeout(() => {
        const fill = document.getElementById('confidenceFill');
        if(fill) fill.style.width = confidenceScore + '%';
    }, 100);

    // Open Backstage on the notes (through Intermission if it is showing)
    revealNotes();
}

// Section names the coach uses, so a plain "Strengths:" line also counts as a heading
const NOTE_SECTIONS = /^(strengths?|weaknesses?|improvement tips?|areas? (for|to) improve(ment)?|staying on topic|time management|tips?|summary|overall)$/i;

// Turns ONE line of the feedback into Coach's notes HTML.
// Only ever give it text that already went through escapeHtml(): it adds tags around that text.
function formatNoteLine(line) {
    const text = line.trim();
    if (text === "") return "";
    const bold = s => s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    let match;

    // Section headings: "# Strengths", "**Strengths**" or "Strengths:"
    let heading = null;
    if ((match = text.match(/^#{1,6}\s*(.+)$/))) heading = match[1];
    else if ((match = text.match(/^\*\*([^*]+)\*\*:?$/))) heading = match[1];
    else if ((match = text.match(/^([A-Za-z][A-Za-z ]{2,40}):$/)) && NOTE_SECTIONS.test(match[1].trim())) heading = match[1];
    if (heading !== null) {
        heading = heading.replace(/\*\*/g, "").replace(/:\s*$/, "").trim();
        return `<h3 class="note-heading ${noteColor(heading)}">${heading}</h3>`;
    }

    // Numbered points: "1. Clear position: ..."
    if ((match = text.match(/^(\d{1,2})[.)]\s+(.*)$/))) {
        return `<div class="note-item"><span class="note-num">${match[1]}</span><span>${bold(match[2])}</span></div>`;
    }

    // Bullet points: "- ..." or "* ..."
    if ((match = text.match(/^[-*•]\s+(.*)$/))) {
        return `<div class="note-item"><span class="note-num" aria-hidden="true">•</span><span>${bold(match[1])}</span></div>`;
    }

    return `<p class="note-text">${bold(text)}</p>`;
}

// Picks a heading color class (always one of these fixed names, never text from the feedback)
function noteColor(heading) {
    if (/strength/i.test(heading)) return "note-good";
    if (/weak/i.test(heading)) return "note-over";
    if (/improv|tip/i.test(heading)) return "note-tip";
    return "note-gold";
}

// ---------------------------
// Scenes: Stage and Backstage, curtains and Intermission
// ---------------------------
const CURTAIN_MS = 720;        // how long the curtains take to close or to open
const CURTAIN_PAUSE_MS = 160;  // short pause with the curtains closed before they open again
let currentView = "stage";
let intermissionOn = false;
// Scene changes wait for each other in this queue, so two quick clicks (or a result arriving
// in the middle of a sweep) can never tangle the curtains
let sceneQueue = Promise.resolve();

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function queueScene(step) {
    sceneQueue = sceneQueue.then(step).catch(err => console.error(err));
    return sceneQueue;
}

// Closes or opens the curtains and waits until they finish. With reduced motion they move instantly.
async function setCurtains(closed) {
    document.body.classList.toggle("curtains-closed", closed);
    if (!prefersReducedMotion()) await wait(CURTAIN_MS);
}

// Tells screen readers about a scene change, once
function announceScene(text) {
    sceneAnnounce.textContent = "";
    setTimeout(() => { sceneAnnounce.textContent = text; }, 50);
}

// Shows one view right away and marks its menu item as the current page
function showView(name) {
    const isStage = name === "stage";
    currentView = name;
    dropZone.hidden = !isStage;
    backstageView.hidden = isStage;
    appRoot.dataset.view = name;
    navButtons.forEach(button => {
        if (button.dataset.view === name) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
    if (!isStage) {
        // A new upload hides the old results, so the empty state shows until new ones arrive
        resultPlaceholder.hidden = resultBox.style.display !== "none";
        restartBulbs();
    }
    window.scrollTo(0, 0);
}

// The bulbs flicker softly 3 times each time Backstage opens, then stay lit
function restartBulbs() {
    mirror.classList.remove("bulbs-on");
    void mirror.offsetWidth;   // makes the browser notice the class was removed, so the animation starts over
    mirror.classList.add("bulbs-on");
}

function focusBackstageHeading() {
    const heading = resultBox.style.display === "none" ? backstageEmptyTitle : coachNotesTitle;
    heading.focus({ preventScroll: true });
}

// Switches screens: the curtains close, the screen changes, then they open (instant with reduced motion)
function goToView(name) {
    return queueScene(async () => {
        if (intermissionOn) return;          // during Intermission, its end decides where the curtains open
        if (name !== currentView) {
            if (prefersReducedMotion()) {
                showView(name);
            } else {
                appRoot.inert = true;        // nothing can be clicked while the curtains move
                await setCurtains(true);
                showView(name);
                await wait(CURTAIN_PAUSE_MS);
                await setCurtains(false);
                appRoot.inert = false;
            }
        }
        if (name === "backstage") focusBackstageHeading();
    });
}

// The curtains close and Intermission shows over them while the coach reviews the speech
function startIntermission() {
    if (intermissionOn) return;
    intermissionOn = true;
    setPrivacyOpen(false);
    // inert: everything behind the closed curtains is unclickable and hidden from keyboards and screen readers
    appRoot.inert = true;
    queueScene(async () => {
        await setCurtains(true);
        if (!intermissionOn) return;         // it already ended while the curtains were closing
        intermission.hidden = false;
        announceScene("Intermission. Your coach is reviewing your speech. Longer speeches can take a few minutes to analyze. Please keep this page open.");
    });
}

// Ends Intermission and opens the curtains on "stage" or "backstage".
// Safe to call any time: it does nothing when no Intermission is running.
function endIntermission(target) {
    if (!intermissionOn) return Promise.resolve();
    intermissionOn = false;
    appRoot.inert = false;                   // the page is usable again right away, so messages are heard
    return queueScene(async () => {
        intermission.hidden = true;
        showView(target);
        if (!prefersReducedMotion()) await wait(CURTAIN_PAUSE_MS);
        await setCurtains(false);
    });
}

// Opens Backstage on the new notes, announces them once and moves focus to "Coach's notes"
function revealNotes() {
    const done = intermissionOn ? endIntermission("backstage") : goToView("backstage");
    done.then(() => {
        announceScene("Your coach's notes are ready.");
        focusBackstageHeading();
    });
}

navButtons.forEach(button => {
    button.addEventListener("click", () => goToView(button.dataset.view));
});
backToStageBtn.addEventListener("click", () => goToView("stage"));
goToStageBtn.addEventListener("click", () => goToView("stage"));

// Same topic and time limit, but a fresh start: the picked file is cleared
tryAgainBtn.addEventListener("click", () => {
    fileInput.value = "";
    showFileName();
    statusText.textContent = "";
    goToView("stage");
});

// ---------------------------
// Privacy note: a small panel under the "Privacy" link at the top right
// ---------------------------
const privacyWrap = document.getElementById("privacyWrap");

function setPrivacyOpen(open) {
    privacyNote.hidden = !open;
    privacyBtn.setAttribute("aria-expanded", String(open));
}

privacyBtn.addEventListener("click", () => {
    setPrivacyOpen(privacyNote.hidden);
});

// A click or tap anywhere outside the link and its panel closes the panel
document.addEventListener("click", e => {
    if (!privacyNote.hidden && !privacyWrap.contains(e.target)) {
        setPrivacyOpen(false);
    }
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !privacyNote.hidden) {
        setPrivacyOpen(false);
        privacyBtn.focus();
    }
});
