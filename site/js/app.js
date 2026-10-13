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

// Live recording (the server only accepts WAV that is 16 kHz, mono, 16-bit)
const REC_SAMPLE_RATE = 16000;
const MAX_REC_SAMPLES = MAX_DURATION_MINUTES * 60 * REC_SAMPLE_RATE;   // exactly 10:00 of audio
const MIN_TAKE_SECONDS = 15;
const REC_WARNING_SECONDS = MAX_DURATION_MINUTES * 60 - 30;           // 9:30
const COUNTDOWN_FROM = 3;

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
const intermissionText = document.getElementById("intermissionText");
const intermissionDots = document.getElementById("intermissionDots");
const intermissionNote = document.getElementById("intermissionNote");
const sceneAnnounce = document.getElementById("sceneAnnounce");
const appRoot = document.querySelector(".app");
// Every topic and time control, so they can be locked while a speech is being analyzed
const optionControls = document.querySelectorAll("#stepTopic textarea, #stepTopic button, #stepTime input, #stepTime button");
const stageView = document.getElementById("stageView");
const onAir = document.getElementById("onAir");
const micBtn = document.getElementById("micBtn");
const stepSpeakTitle = document.getElementById("stepSpeakTitle");
const actionText = document.getElementById("actionText");
const prepSetting = document.getElementById("prepSetting");
const prepRadios = document.querySelectorAll('input[name="prepTime"]');
const recPanels = {
    idle: document.getElementById("recIdle"),
    prep: document.getElementById("recPrep"),
    countdown: document.getElementById("recCountdown"),
    recording: document.getElementById("recLive"),
    review: document.getElementById("recReview")
};
const prepCount = document.getElementById("prepCount");
const prepStartBtn = document.getElementById("prepStartBtn");
const prepCancelBtn = document.getElementById("prepCancelBtn");
const countNum = document.getElementById("countNum");
const countCancelBtn = document.getElementById("countCancelBtn");
const finishBtn = document.getElementById("finishBtn");
const startOverBtn = document.getElementById("startOverBtn");
const takePlayBtn = document.getElementById("takePlayBtn");
const takeTime = document.getElementById("takeTime");
const takeAudio = document.getElementById("takeAudio");
const takeLengthLine = document.getElementById("takeLengthLine");
const takeNote = document.getElementById("takeNote");
const takeSendBtn = document.getElementById("takeSendBtn");
const reRecordBtn = document.getElementById("reRecordBtn");
const discardBtn = document.getElementById("discardBtn");
const settingsStrip = document.getElementById("stepTime");
const livePanel = document.getElementById("livePanel");
const stopwatchSetting = document.getElementById("stopwatchSetting");
const stopwatchToggle = document.getElementById("stopwatchToggle");
const stopwatchWord = document.getElementById("stopwatchWord");
const stopwatchRow = document.getElementById("stopwatchRow");
const stopwatchOff = document.getElementById("stopwatchOff");
const swElapsed = document.getElementById("swElapsed");
const swLimit = document.getElementById("swLimit");
const swPill = document.getElementById("swPill");
const swHideBtn = document.getElementById("swHideBtn");
const swShowBtn = document.getElementById("swShowBtn");
const waveBars = document.querySelectorAll(".wave-bar");
const levelFill = document.getElementById("levelFill");
const filePlayerBox = document.getElementById("filePlayer");

// Playback stops before sending, so the speech isn't still playing behind the curtains
uploadBtn.addEventListener("click", () => {
    pausePlayers();
    upload();
});

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
    // The Send button and file details only appear once a file is picked
    fileInfo.hidden = !file;
    uploadBtn.hidden = !file;
    // With the mic as the main action, upload is the second choice
    uploadLabel.textContent = file ? "Choose another MP3" : (micSupported ? "or upload an MP3" : "Upload an MP3");
    // The player above the Send button: a new file replaces (and frees) the old one
    if (file) {
        filePlayer.load(URL.createObjectURL(file));
    } else {
        filePlayer.clear();
    }
    filePlayerBox.hidden = !file;
    updateLengthFromFile();
}

fileInput.addEventListener("change", showFileName);

// ---------------------------
// Drag and drop
// ---------------------------
// The highlight shows while a file is dragged anywhere over the window. Enter and leave events
// fire for every element the cursor crosses, so a counter on the document keeps it steady.
const DRAG_IDLE_MS = 150;      // files dragged from another app don't always send a final dragleave
let dragDepth = 0;
let dragIdleTimer = null;

function dragHasFiles(e) {
    return Boolean(e.dataTransfer) && Array.from(e.dataTransfer.types).includes("Files");
}

// Drops only work on the Stage with the controls unlocked (not on Backstage, during Intermission or an upload,
// and not while preparing, recording or reviewing a take)
function canDropFile() {
    return currentView === "stage" && !isBusy && !intermissionOn && !appRoot.inert && recState === "idle";
}

function stopDragHighlight() {
    dragDepth = 0;
    clearTimeout(dragIdleTimer);
    dropZone.classList.remove("dragging");
}

// Called on every dragenter and dragover with files. If they stop coming, the drag is over.
function keepDragHighlight() {
    dropZone.classList.toggle("dragging", canDropFile());
    clearTimeout(dragIdleTimer);
    dragIdleTimer = setTimeout(stopDragHighlight, DRAG_IDLE_MS);
}

document.addEventListener("dragenter", e => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    keepDragHighlight();
});

document.addEventListener("dragover", e => {
    if (!dragHasFiles(e)) return;
    keepDragHighlight();
});

document.addEventListener("dragleave", e => {
    if (!dragHasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) stopDragHighlight();      // the drag left the window
});

document.addEventListener("dragend", stopDragHighlight);

// While the highlight shows, a file dropped anywhere in the window counts as a drop on the stage
document.addEventListener("drop", e => {
    e.preventDefault();
    const accepted = dragHasFiles(e) && canDropFile();
    stopDragHighlight();
    if (!accepted) return;

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

// Stop the browser from opening the file wherever it's dropped
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
    takeSendBtn.disabled = true;
    micBtn.disabled = true;                         // and recording can't start with a half-rolled topic

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
    updateTakeButtons();
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
    updateTakeButtons();
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

// Updates both length lines: the chosen MP3's and the recorded take's
function renderLengthLine() {
    renderLength(lengthLine, fileLengthSeconds);
    renderLength(takeLengthLine, currentTake ? currentTake.seconds : null);
}

// Shows "Length: 4:12 / Limit: 3:00 (1:12 over)" in the given line, or hides it when seconds is null
function renderLength(line, seconds) {
    if (seconds === null) {
        line.hidden = true;
        line.textContent = "";
        return;
    }

    const { valid, seconds: limit } = getTimeLimit();
    line.textContent = `Length: ${formatTime(seconds)}`;

    if (valid && limit !== null) {
        const timing = describeTiming(seconds, limit);
        line.append(` / Limit: ${formatTime(limit)} `);
        const note = document.createElement("span");
        note.className = timing.className;
        note.textContent = `(${timing.text})`;
        line.append(note);
    }
    line.hidden = false;
}

// ---------------------------
// Lock the topic and time controls during analysis
// ---------------------------
function setOptionsDisabled(disabled) {
    isBusy = disabled;
    optionControls.forEach(control => {
        control.disabled = disabled;
    });
    updateTakeButtons();
}

// ---------------------------
// Upload and analysis
// ---------------------------
// Stops an upload: opens the curtains back on the Stage (if closed), shows the message and unlocks the controls
function failUpload(message) {
    endIntermission("stage");
    statusText.textContent = message;
    waitNote.style.display = "none";
    setOptionsDisabled(false);
    uploadBtn.disabled = !getTimeLimit().valid;
}

// Sends the chosen MP3, or a recorded take when one is given ({ blob, seconds }, sent as WAV)
async function upload(take) {
    const sendButton = take ? takeSendBtn : uploadBtn;
    // Locked before anything else, so a double click can't send the speech twice
    sendButton.disabled = true;
    const file = take ? take.blob : fileInput.files[0];

    if(!file) {
        sendButton.disabled = false;
        alert("Please select an audio file.");
        return;
    }
    if(take) takeAudio.pause();

    const timeLimit = getTimeLimit();
    if(!timeLimit.valid) {
        failUpload(TIME_LIMIT_ERROR);
        return;
    }

    const topic = topicInput.value.trim();
    if(topic.length > MAX_TOPIC_LENGTH) {
        failUpload(`Topics can be up to ${MAX_TOPIC_LENGTH} characters.`);
        return;
    }

    setOptionsDisabled(true);
    resultBox.style.display = "none";
    waitNote.style.display = "none";

    if(file.size > MAX_FILE_MB * 1024 * 1024) {
        failUpload(take
            ? `This recording is too large to send. Recordings can be up to ${MAX_FILE_MB} MB.`
            : `This file is too large. Please upload an MP3 under ${MAX_FILE_MB} MB.`);
        return;
    }

    statusText.innerText = "Checking your recording...";
    // A take's exact length is already known from its samples
    const durationSeconds = take ? take.seconds : await getAudioDurationSeconds(file);
    if(durationSeconds !== null && durationSeconds > MAX_DURATION_MINUTES * 60) {
        failUpload(`This recording is longer than ${MAX_DURATION_MINUTES} minutes. Please upload a shorter speech.`);
        return;
    }

    // The page checks passed: the curtains close right away while the speech uploads
    startIntermission();

    try {
        statusText.innerText = "Initializing Stage...";

        // Optional details, only added when they are set
        const params = new URLSearchParams();
        if(topic) params.set("topic", topic);
        if(topic && randomTopic && topic === randomTopic.text) params.set("topicType", randomTopic.type);
        if(timeLimit.seconds !== null) params.set("timeLimit", String(timeLimit.seconds));
        if(take) params.set("format", "wav");
        const query = params.toString();

        const response = await fetch(`${API_BASE}/upload-url${query ? "?" + query : ""}`);

        if(response.status === 429) {
            const limit = await response.json().catch(() => ({}));
            failUpload(limit.message || "Upload limit reached. Please try again later.");
            return;
        }

        if(response.status === 400) {
            const problem = await response.json().catch(() => ({}));
            failUpload(problem.message || "Please check your topic and time limit.");
            return;
        }

        if(!response.ok) throw new Error(`upload-url failed: ${response.status}`);

        const data = await response.json();

        // S3 presigned POST: the given fields first, the file last
        const formData = new FormData();
        Object.entries(data.upload.fields).forEach(([key, value]) => {
            formData.append(key, value);
        });
        if(take) {
            formData.append("file", file, "speech.wav");
        } else {
            formData.append("file", file);
        }

        const uploadResponse = await fetch(data.upload.url, {
            method: "POST",
            body: formData
        });

        if(!uploadResponse.ok) {
            console.error("S3 upload failed:", uploadResponse.status);
            failUpload(take
                ? "Upload failed. Please try again."
                : `Upload failed. Please make sure your MP3 is under ${MAX_FILE_MB} MB and try again.`);
            return;
        }

        // The take reached the server, so leaving the page no longer loses it
        if(take) markTakeSent(take);

        // Uploaded: Intermission now says the coach is reviewing the speech
        setIntermissionPhase("review");
        statusText.innerText = "Analyzing Performance Patterns...";
        waitNote.style.display = "block";
        pollResult(data.fileId);

    } catch(err) {
        console.error(err);
        failUpload("Technical error occurred.");    // never leaves the curtains closed
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

    // Clarity: how clearly the words came through (the server sends it as avg_confidence)
    const clarityRaw = Number(data.avg_confidence);
    const clarityScore = Number.isFinite(clarityRaw) ? Math.round(clarityRaw * 100) : 0;

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

    // Where the speech came from, shown beside the time line (older results don't say)
    const SOURCE_LABELS = { recording: "Live recording", upload: "Uploaded MP3" };
    const sourceLabel = Object.hasOwn(SOURCE_LABELS, data.source) ? SOURCE_LABELS[data.source] : null;
    const sourceHtml = sourceLabel ? `<span class="source-tag">${escapeHtml(sourceLabel)}</span>` : "";

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
        summaryHtml += `<div class="perf-time">${timeHtml}${sourceHtml}</div>`;
    } else if (sourceHtml) {
        summaryHtml += `<div class="perf-time">${sourceHtml}</div>`;
    }

    // A recording that reached the 10:00 maximum was cut off there
    if (data.cut_off === true) {
        summaryHtml += `<p class="perf-note">${escapeHtml(`Recording stopped at the ${formatTime(MAX_DURATION_MINUTES * 60)} maximum.`)}</p>`;
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
                <span class="stat-num">${clarityScore}%</span>
                <span class="stat-label"><span class="long-label">Clarity</span><span class="short-label" aria-hidden="true">clarity</span><span class="stat-hint">How clearly your words came through</span></span>
                <div class="score-bar-bg"><div id="clarityFill" class="score-fill" style="width: 0%"></div></div>
            </div>
        </div>`;

    perfSummary.innerHTML = summaryHtml;
    coachNotesBody.innerHTML = cleanFeedback;
    coachNotesBody.scrollTop = 0;

    setTimeout(() => {
        const fill = document.getElementById('clarityFill');
        if(fill) fill.style.width = clarityScore + '%';
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
    if (!isStage) pausePlayers();      // nothing keeps playing behind the curtains
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

// What Intermission says while the speech uploads, then while the coach reviews it
const INTERMISSION_PHASES = {
    upload: {
        text: "Taking your speech backstage...",
        dots: false,
        announce: "Taking your speech backstage."
    },
    review: {
        text: "Your coach is reviewing your speech",
        dots: true,
        announce: "Your coach is reviewing your speech. Longer speeches can take a few minutes to analyze. Please keep this page open."
    }
};
let intermissionPhase = "upload";

// Changes the Intermission text. It is announced once, only if Intermission is already showing
// (otherwise startIntermission announces it when the curtains finish closing).
function setIntermissionPhase(phase) {
    intermissionPhase = phase;
    const info = INTERMISSION_PHASES[phase];
    intermissionText.textContent = info.text;
    intermissionDots.hidden = !info.dots;
    intermissionNote.hidden = !info.dots;
    if (!intermission.hidden) announceScene(info.announce);
}

// The curtains close and Intermission shows over them while the speech uploads and the coach reviews it
function startIntermission() {
    if (intermissionOn) return;
    intermissionOn = true;
    setPrivacyOpen(false);
    setIntermissionPhase("upload");
    // inert: everything behind the closed curtains is unclickable and hidden from keyboards and screen readers
    appRoot.inert = true;
    queueScene(async () => {
        await setCurtains(true);
        if (!intermissionOn) return;         // it already ended while the curtains were closing
        intermission.hidden = false;
        announceScene("Intermission. " + INTERMISSION_PHASES[intermissionPhase].announce);
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
    if (recState === "review") discardTake();
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

// ---------------------------
// Live recording: the mic on the stage
// ---------------------------
// The flow: idle → starting (asking for the mic) → prep (optional) → countdown (3, 2, 1) → recording → review.
// The mic sound goes through recorder-worklet.js, gets converted to 16 kHz 16-bit samples here, and becomes a
// WAV file that stays on this device until "Send to the coach".
const micSupported = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioWorkletNode);
const LOCKED_STATES = ["starting", "prep", "countdown", "recording"];   // the page is locked in these
const WARNING_TEXT = "30 seconds left before recording stops.";
const INTERRUPTED_TEXT = "Recording was interrupted. You can listen back, re-record, or use what you have.";

let recState = "idle";
let currentTake = null;        // { blob, url, seconds, sent } after recording stops
let mic = null;                // { stream, context, node } while the mic is open
let micSession = 0;            // counts mic starts, so a slow start that was cancelled can't continue
let recChunks = [];            // the take so far, as 16-bit sample chunks
let recCount = 0;              // number of samples recorded so far (16000 per second)
let recWarned = false;
let resample = null;
let prepTimer = null;
let countTimer = null;
let wakeLock = null;
let wakeLockPending = false;

// Shows the panel for a state, sets the mic's label and glow, and locks or unlocks the page
function setRecState(name) {
    recState = name;
    const panel = name === "starting" ? "idle" : name;
    Object.entries(recPanels).forEach(([key, element]) => {
        element.hidden = key !== panel;
    });

    const locked = LOCKED_STATES.includes(name);
    stageView.dataset.rec = name;
    stageView.classList.toggle("recording", name === "recording");
    stageView.classList.toggle("rec-locked", locked);
    micBtn.setAttribute("aria-label", name === "recording" ? "Stop recording" : "Start recording");

    // Topic, time and prep controls, the menu and the file picker can't change while preparing or recording
    optionControls.forEach(control => {
        control.disabled = locked || isBusy;
    });
    navButtons.forEach(button => {
        button.disabled = locked;
    });
    fileInput.disabled = locked;
    if (locked) stopDragHighlight();

    // While recording, the stopwatch and sound wave take the settings strip's place
    const recording = name === "recording";
    settingsStrip.hidden = recording;
    livePanel.hidden = !recording;
    if (recording) {
        startLiveView();
    } else {
        stopLiveView();
    }

    updateTakeButtons();
    updateLeaveWarning();
    if (locked) {
        requestWakeLock();
    } else {
        releaseWakeLock();
    }
}

// Enables or disables the mic and the take's buttons for the current state
function updateTakeButtons() {
    const busy = isBusy || isRolling;
    micBtn.disabled = busy || recState === "starting" || recState === "countdown" || recState === "review";
    const longEnough = currentTake !== null && currentTake.seconds >= MIN_TAKE_SECONDS;
    takeSendBtn.disabled = busy || !longEnough || !getTimeLimit().valid;
    reRecordBtn.disabled = busy;
    discardBtn.disabled = busy;
}

// ---- Prep time ----
function getPrepSeconds() {
    const choice = document.querySelector('input[name="prepTime"]:checked');
    return choice ? Number(choice.value) : 0;
}

// For example 30 becomes "30 seconds" and 120 becomes "2 minutes"
function describePrep(seconds) {
    if (seconds % 60 !== 0) return `${seconds} seconds`;
    return seconds === 60 ? "1 minute" : `${seconds / 60} minutes`;
}

function updateActionText() {
    if (!micSupported) return;
    const prep = getPrepSeconds();
    actionText.textContent = prep > 0
        ? `Tap the mic to begin. You get ${describePrep(prep)} to prepare, then recording starts.`
        : "Tap the mic to begin.";
}

prepRadios.forEach(radio => radio.addEventListener("change", updateActionText));

// ---- Opening the mic ----
const MIC_ERRORS = {
    NotAllowedError: "SpeakReview needs microphone access. Allow it in your browser settings, then try again.",
    SecurityError: "SpeakReview needs microphone access. Allow it in your browser settings, then try again.",
    NotFoundError: "No microphone was found.",
    OverconstrainedError: "No microphone was found.",
    NotReadableError: "Your microphone is being used by another app.",
    AbortError: "Your microphone is being used by another app."
};

function micErrorMessage(err) {
    return MIC_ERRORS[err && err.name] || "The microphone could not start. Please try again.";
}

// Makes an audio context at the given sample rate (or the device's own rate). Returns null if the browser refuses.
function createAudioContext(sampleRate) {
    try {
        return sampleRate ? new AudioContext({ sampleRate }) : new AudioContext();
    } catch (err) {
        return null;
    }
}

async function startMic() {
    const session = ++micSession;
    statusText.textContent = "";
    setRecState("starting");

    // The audio context is created and started during the tap itself, because phones only let sound start from a tap
    const context = createAudioContext(REC_SAMPLE_RATE);
    if (context) context.resume().catch(() => {});
    mic = { stream: null, context, node: null };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        });
        if (session !== micSession || !mic) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        mic.stream = stream;

        // Some browsers (Firefox) can't connect a mic to a 16 kHz context. Then use the device's own rate
        // and convert to 16 kHz in createResampler().
        let source = null;
        if (mic.context) {
            try {
                source = mic.context.createMediaStreamSource(stream);
            } catch (err) {
                mic.context.close().catch(() => {});
                mic.context = null;
            }
        }
        if (!mic.context) {
            mic.context = createAudioContext();
            if (!mic.context) throw new Error("No audio context");
            source = mic.context.createMediaStreamSource(stream);
        }

        // Wait up to 3 seconds for the sound to start running
        if (mic.context.state !== "running") {
            await Promise.race([mic.context.resume(), wait(3000)]);
            if (mic.context.state !== "running") throw new Error("The audio context did not start");
        }

        await mic.context.audioWorklet.addModule("js/recorder-worklet.js");
        if (session !== micSession || !mic) return;

        const node = new AudioWorkletNode(mic.context, "recorder-processor");
        // Samples are only kept while recording. Anything heard during prep or the 3, 2, 1 is dropped.
        node.port.onmessage = e => {
            if (recState === "recording") addSamples(e.data);
        };
        source.connect(node);
        node.connect(mic.context.destination);   // keeps it running. It only outputs silence.
        mic.node = node;

        // A second, listen-only connection for the live sound wave. It doesn't change what is recorded.
        const analyser = mic.context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        mic.analyser = analyser;

        stream.getAudioTracks().forEach(track => track.addEventListener("ended", onMicInterrupted));
        mic.context.addEventListener("statechange", onContextStateChange);

        const prep = getPrepSeconds();
        if (prep > 0) {
            startPrep(prep);
        } else {
            startCountdown();
        }
    } catch (err) {
        if (session !== micSession) return;
        console.error(err);
        releaseMic();
        setRecState("idle");
        statusText.textContent = micErrorMessage(err);
    }
}

// Stops the mic and closes the audio context, so the browser's mic indicator turns off
function releaseMic() {
    if (!mic) return;
    const { stream, context, node, analyser } = mic;
    mic = null;
    stopLiveView();
    if (analyser) analyser.disconnect();
    if (node) {
        node.port.onmessage = null;
        node.disconnect();
    }
    if (stream) {
        stream.getTracks().forEach(track => {
            track.removeEventListener("ended", onMicInterrupted);
            track.stop();
        });
    }
    if (context) {
        context.removeEventListener("statechange", onContextStateChange);
        if (context.state !== "closed") context.close().catch(() => {});
    }
}

function clearRecTimers() {
    clearInterval(prepTimer);
    clearInterval(countTimer);
    prepTimer = null;
    countTimer = null;
}

// Cancel during prep or the 3, 2, 1: back to the start, mic off
function cancelRecording() {
    micSession++;
    clearRecTimers();
    releaseMic();
    setRecState("idle");
}

// ---- Prep and the 3, 2, 1 ----
function startPrep(seconds) {
    setRecState("prep");
    const endsAt = Date.now() + seconds * 1000;    // counted from the clock, so it never drifts
    function tick() {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        prepCount.textContent = formatTime(left);
        if (left === 0) startCountdown();
    }
    prepCount.textContent = formatTime(seconds);
    prepTimer = setInterval(tick, 250);
    announceScene(`Prepare your speech. ${describePrep(seconds)}.`);
}

function startCountdown() {
    clearRecTimers();
    setRecState("countdown");
    let number = COUNTDOWN_FROM;
    function show() {
        countNum.textContent = String(number);
        // Restart the small pop animation for each number (none with reduced motion)
        countNum.classList.remove("pop");
        void countNum.offsetWidth;
        countNum.classList.add("pop");
    }
    show();
    announceScene(`Recording starts in ${COUNTDOWN_FROM} seconds.`);
    countTimer = setInterval(() => {
        number--;
        if (number <= 0) {
            startRecording();
        } else {
            show();
        }
    }, 1000);
}

// ---- Recording ----
function startRecording() {
    clearRecTimers();
    if (!mic || !mic.context) {
        cancelRecording();
        return;
    }
    // A fresh take: nothing from before this moment is kept
    recChunks = [];
    recCount = 0;
    recWarned = false;
    resample = createResampler(mic.context.sampleRate);
    statusText.textContent = "";
    setRecState("recording");
    announceScene("Recording.");
}

// Adds a block of mic samples (any sample rate) to the take as 16 kHz 16-bit samples
function addSamples(input) {
    if (recState !== "recording") return;
    const samples = resample(input);
    const count = Math.min(samples.length, MAX_REC_SAMPLES - recCount);   // never past exactly 10:00
    if (count > 0) {
        const pcm = new Int16Array(count);
        for (let i = 0; i < count; i++) {
            // Clip to the allowed range, then scale to whole numbers from -32768 to 32767
            const s = Math.max(-1, Math.min(1, samples[i]));
            pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
        }
        recChunks.push(pcm);
        recCount += count;
    }

    if (!recWarned && recCount >= REC_WARNING_SECONDS * REC_SAMPLE_RATE) {
        recWarned = true;
        statusText.textContent = WARNING_TEXT;
    }
    if (recCount >= MAX_REC_SAMPLES) stopRecording("max");
}

// Ends the recording and shows the take. reason: null (finished), "max" or "interrupted".
function stopRecording(reason) {
    if (recState !== "recording") return;
    const chunks = recChunks;
    const count = recCount;
    recChunks = [];
    recCount = 0;
    releaseMic();

    setTake(buildWav(chunks, count), count / REC_SAMPLE_RATE);

    const notes = [];
    if (reason === "max") notes.push(`Recording stopped at the ${formatTime(MAX_REC_SAMPLES / REC_SAMPLE_RATE)} maximum.`);
    if (reason === "interrupted") notes.push(INTERRUPTED_TEXT);
    if (currentTake.seconds < MIN_TAKE_SECONDS) notes.push(`Recordings need at least ${MIN_TAKE_SECONDS} seconds.`);
    takeNote.textContent = notes.join(" ");
    takeNote.hidden = notes.length === 0;
    if (statusText.textContent === WARNING_TEXT) statusText.textContent = "";

    setRecState("review");
    // On short screens the take's buttons can be below the fold, so bring them into view
    recPanels.review.parentElement.scrollIntoView({ block: "nearest" });
    announceScene(`Recording stopped. Your take is ${formatTime(currentTake.seconds)}. ${notes.join(" ")}`.trim());
}

// "Start over" while recording: throw the samples away and count down again (no prep)
function restartRecording() {
    if (recState !== "recording") return;
    recChunks = [];
    recCount = 0;
    if (statusText.textContent === WARNING_TEXT) statusText.textContent = "";
    startCountdown();
}

// ---- Interruptions ----
function onMicInterrupted() {
    if (recState === "recording") {
        stopRecording("interrupted");
    } else if (LOCKED_STATES.includes(recState)) {
        cancelRecording();
        statusText.textContent = "The microphone stopped before recording started. Tap the mic to try again.";
    }
}

function onContextStateChange() {
    if (!mic || !mic.context) return;
    const state = mic.context.state;
    if (state === "suspended" || state === "interrupted") onMicInterrupted();
}

function isTouchDevice() {
    return window.matchMedia("(pointer: coarse)").matches;
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        // Phones pause or cut the mic when the page is hidden, so stop and keep what was recorded
        if (recState === "recording" && isTouchDevice()) onMicInterrupted();
    } else if (LOCKED_STATES.includes(recState)) {
        requestWakeLock();      // the browser drops the wake lock while the page is hidden
    }
});

// ---- Keep the screen awake while preparing and recording ----
async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock || wakeLockPending || document.hidden) return;
    wakeLockPending = true;
    try {
        const lock = await navigator.wakeLock.request("screen");
        if (LOCKED_STATES.includes(recState)) {
            wakeLock = lock;
            lock.addEventListener("release", () => {
                if (wakeLock === lock) wakeLock = null;
            });
        } else {
            lock.release().catch(() => {});     // recording already ended while asking
        }
    } catch (err) {
        // Not allowed right now (for example low battery). The page works without it.
    }
    wakeLockPending = false;
}

function releaseWakeLock() {
    if (!wakeLock) return;
    wakeLock.release().catch(() => {});
    wakeLock = null;
}

// ---- Warn before leaving the page while recording or with an unsent take ----
let leaveWarningOn = false;

function warnBeforeLeaving(e) {
    e.preventDefault();
    e.returnValue = "";        // older browsers need this to show the standard "Leave site?" prompt
}

function updateLeaveWarning() {
    const on = LOCKED_STATES.includes(recState) || (currentTake !== null && !currentTake.sent);
    if (on === leaveWarningOn) return;
    leaveWarningOn = on;
    if (on) {
        window.addEventListener("beforeunload", warnBeforeLeaving);
    } else {
        window.removeEventListener("beforeunload", warnBeforeLeaving);
    }
}

// ---- 16 kHz conversion ----
// Returns a function that turns mic samples at inRate into 16 kHz samples, one chunk at a time.
// First a low-pass filter removes sounds too high for 16 kHz (they would turn into noise), then
// every (inRate / 16000)th point is picked, blending the two nearest samples when it falls between them.
function createResampler(inRate) {
    if (inRate === REC_SAMPLE_RATE) return chunk => chunk;

    const step = inRate / REC_SAMPLE_RATE;
    const HALF = 31;
    const TAPS = HALF * 2 + 1;
    const cutoff = 7200 / inRate;          // keep sounds below 7.2 kHz
    const taps = new Float32Array(TAPS);
    let total = 0;
    for (let i = 0; i < TAPS; i++) {
        const k = i - HALF;
        const sinc = k === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k);
        const blackman = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (TAPS - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (TAPS - 1));
        taps[i] = sinc * blackman;
        total += taps[i];
    }
    for (let i = 0; i < TAPS; i++) taps[i] /= total;      // keeps the loudness the same

    function filterAt(buffer, center) {
        let sum = 0;
        const start = center - HALF;
        for (let k = 0; k < TAPS; k++) sum += taps[k] * buffer[start + k];
        return sum;
    }

    let history = new Float32Array(TAPS);   // the end of the previous chunk (silence at first)
    let position = TAPS;                    // where the next output sample falls, in history + chunk

    return function (chunk) {
        const buffer = new Float32Array(history.length + chunk.length);
        buffer.set(history);
        buffer.set(chunk, history.length);

        const out = new Float32Array(Math.ceil(chunk.length / step) + 2);
        let count = 0;
        while (Math.floor(position) + 1 + HALF < buffer.length) {
            const i = Math.floor(position);
            const fraction = position - i;
            const a = filterAt(buffer, i);
            out[count++] = fraction > 0 ? a + (filterAt(buffer, i + 1) - a) * fraction : a;
            position += step;
        }

        // Keep only what the next chunk still needs
        const keepFrom = Math.floor(position) - HALF;
        history = buffer.slice(keepFrom);
        position -= keepFrom;
        return out.subarray(0, count);
    };
}

// ---- WAV file ----
// WAV stores numbers with the smallest byte first ("little-endian"). Every current phone and laptop does too.
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

// Builds a WAV file: a 44-byte header that describes the sound, then the samples
function buildWav(chunks, count) {
    const dataBytes = count * 2;
    const header = new DataView(new ArrayBuffer(44));
    const writeText = (offset, text) => {
        for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i));
    };
    writeText(0, "RIFF");
    header.setUint32(4, 36 + dataBytes, true);              // file size minus these first 8 bytes
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    header.setUint32(16, 16, true);                         // size of this format section
    header.setUint16(20, 1, true);                          // 1 = plain PCM, not compressed
    header.setUint16(22, 1, true);                          // 1 channel (mono)
    header.setUint32(24, REC_SAMPLE_RATE, true);            // 16000 samples per second
    header.setUint32(28, REC_SAMPLE_RATE * 2, true);        // bytes per second
    header.setUint16(32, 2, true);                          // bytes per sample
    header.setUint16(34, 16, true);                         // bits per sample
    writeText(36, "data");
    header.setUint32(40, dataBytes, true);                  // size of the samples

    const parts = LITTLE_ENDIAN ? chunks : chunks.map(toLittleEndian);
    return new Blob([header.buffer, ...parts], { type: "audio/wav" });
}

function toLittleEndian(pcm) {
    const view = new DataView(new ArrayBuffer(pcm.length * 2));
    pcm.forEach((value, i) => view.setInt16(i * 2, value, true));
    return view.buffer;
}

// ---- The take: listen back, send, re-record or discard ----
function setTake(blob, seconds) {
    clearTake();
    currentTake = { blob, seconds, url: URL.createObjectURL(blob), sent: false };
    takePlayer.load(currentTake.url);
    renderLengthLine();
}

// Throws the take away and frees its memory
function clearTake() {
    takePlayer.clear();
    if (currentTake) URL.revokeObjectURL(currentTake.url);
    currentTake = null;
    takeNote.hidden = true;
    takeNote.textContent = "";
    renderLengthLine();
}

function discardTake() {
    clearTake();
    setRecState("idle");
}

function markTakeSent(take) {
    take.sent = true;
    updateLeaveWarning();
}

// ---- Players: listen to a take or a picked MP3, and move through it ----
// One player setup used twice. Back and Forward jump 5 seconds, the slider can be clicked or dragged,
// and on the slider the arrow keys also jump 5 seconds (Home and End go to the start and end).
const SKIP_SECONDS = 5;

function setupPlayer({ audio, playBtn, backBtn, fwdBtn, seek, time, name, getDuration, ownsUrl }) {
    let url = null;
    let dragging = false;

    const duration = () => {
        const seconds = getDuration();
        return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    };

    // Moves the slider and the "0:42 / 2:14" text to a position
    function show(position) {
        const total = duration();
        const at = Math.min(Math.max(0, position), total);
        seek.max = String(total);
        seek.value = String(at);
        seek.style.setProperty("--pos", total > 0 ? `${(at / total) * 100}%` : "0%");
        time.textContent = `${formatTime(Math.floor(at))} / ${formatTime(total)}`;
        seek.setAttribute("aria-valuetext", `${formatTime(Math.floor(at))} of ${formatTime(total)}`);
    }

    function seekTo(position) {
        const at = Math.min(Math.max(0, position), duration());
        if (url) audio.currentTime = at;
        show(at);
    }

    function showPlaying(playing) {
        playBtn.classList.toggle("playing", playing);
        playBtn.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${name}`);
    }

    playBtn.addEventListener("click", () => {
        if (!url) return;
        if (audio.paused) {
            if (audio.currentTime >= duration() - 0.05) audio.currentTime = 0;   // at the end: play from the start
            // AbortError only means playback was stopped (paused or a new file) before it began
            audio.play().catch(err => {
                if (err.name !== "AbortError") console.error(err);
            });
        } else {
            audio.pause();
        }
    });
    backBtn.addEventListener("click", () => seekTo(audio.currentTime - SKIP_SECONDS));
    fwdBtn.addEventListener("click", () => seekTo(audio.currentTime + SKIP_SECONDS));

    // Clicking or dragging the slider moves playback, and the time text follows while dragging
    seek.addEventListener("input", () => seekTo(Number(seek.value)));
    seek.addEventListener("pointerdown", () => {
        dragging = true;
        window.addEventListener("pointerup", () => { dragging = false; }, { once: true });
    });
    seek.addEventListener("keydown", e => {
        const jumps = { ArrowRight: SKIP_SECONDS, ArrowUp: SKIP_SECONDS, PageUp: SKIP_SECONDS,
                        ArrowLeft: -SKIP_SECONDS, ArrowDown: -SKIP_SECONDS, PageDown: -SKIP_SECONDS };
        if (e.key in jumps) {
            seekTo(audio.currentTime + jumps[e.key]);
        } else if (e.key === "Home") {
            seekTo(0);
        } else if (e.key === "End") {
            seekTo(duration());
        } else {
            return;
        }
        e.preventDefault();      // the browser's own slider step is replaced by the 5 second jump
    });

    audio.addEventListener("play", () => showPlaying(true));
    audio.addEventListener("pause", () => showPlaying(false));
    audio.addEventListener("timeupdate", () => {
        if (!dragging) show(audio.currentTime);
    });
    audio.addEventListener("loadedmetadata", () => show(audio.currentTime));
    audio.addEventListener("ended", () => {
        showPlaying(false);
        audio.currentTime = 0;
        show(0);
    });

    function clear() {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        if (ownsUrl && url) URL.revokeObjectURL(url);
        url = null;
        show(0);
    }

    return {
        // Never starts playing by itself: playback only starts from the play button
        load(newUrl) {
            clear();
            url = newUrl;
            audio.src = url;
            show(0);
        },
        clear,
        pause() {
            audio.pause();
        }
    };
}

const takePlayer = setupPlayer({
    audio: takeAudio,
    playBtn: takePlayBtn,
    backBtn: document.getElementById("takeBackBtn"),
    fwdBtn: document.getElementById("takeFwdBtn"),
    seek: document.getElementById("takeSeek"),
    time: takeTime,
    name: "your take",
    getDuration: () => (currentTake ? currentTake.seconds : 0),
    ownsUrl: false          // the take's URL is freed by clearTake()
});

const fileAudio = document.getElementById("fileAudio");
const filePlayer = setupPlayer({
    audio: fileAudio,
    playBtn: document.getElementById("filePlayBtn"),
    backBtn: document.getElementById("fileBackBtn"),
    fwdBtn: document.getElementById("fileFwdBtn"),
    seek: document.getElementById("fileSeek"),
    time: document.getElementById("fileTime"),
    name: "your MP3",
    getDuration: () => (Number.isFinite(fileAudio.duration) ? fileAudio.duration : (fileLengthSeconds ?? 0)),
    ownsUrl: true           // freed when the picked file changes or is cleared
});

function pausePlayers() {
    takePlayer.pause();
    filePlayer.pause();
}

// ---- Live view while recording: stopwatch and sound wave ----
const WAVE_STEP_MS = 50;       // a new bar every 50 ms, so the wave scrolls left
const WAVE_MIN = 0.06;         // a silent mic shows a flat line at this height
let liveFrame = null;          // the running animation frame, or null when stopped
let liveAnalyser = null;
let liveSamples = null;
let liveLevels = [];
let liveLastStep = 0;
let liveShownSecond = -1;
let showStopwatch = stopwatchToggle.getAttribute("aria-checked") === "true";

// How loud the mic is right now, from 0 (silent, -60 dB or quieter) to 1 (loud, -10 dB)
function micLevel(analyser) {
    if (!liveSamples || liveSamples.length !== analyser.fftSize) liveSamples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(liveSamples);
    let sum = 0;
    for (let i = 0; i < liveSamples.length; i++) sum += liveSamples[i] * liveSamples[i];
    const rms = Math.sqrt(sum / liveSamples.length);
    const decibels = 20 * Math.log10(rms || 1e-8);
    return Math.min(1, Math.max(0, (decibels + 60) / 50));
}

// Bars show the recent levels, newest on the right. With reduced motion only the level meter is shown.
function renderWave(level) {
    waveBars.forEach((bar, i) => {
        bar.style.transform = `scaleY(${Math.max(WAVE_MIN, liveLevels[i] || 0)})`;
    });
    levelFill.style.width = `${Math.round(level * 100)}%`;
}

// The stopwatch counts recorded samples, so it always matches the take. It only changes once a second.
function updateStopwatch() {
    const elapsed = Math.floor(recCount / REC_SAMPLE_RATE);
    if (elapsed === liveShownSecond) return;
    liveShownSecond = elapsed;
    swElapsed.textContent = formatTime(elapsed);

    const { valid, seconds: limit } = getTimeLimit();
    if (valid && limit !== null) {
        const over = elapsed > limit;
        swLimit.textContent = ` / ${formatTime(limit)}`;
        swElapsed.className = `sw-elapsed ${over ? "timing-over" : "timing-ok"}`;
        swPill.className = `sw-pill ${over ? "sw-over" : "sw-left"}`;
        swPill.textContent = over ? `+${formatTime(elapsed - limit)} over` : `${formatTime(limit - elapsed)} left`;
    } else {
        swLimit.textContent = "";
        swElapsed.className = "sw-elapsed";
        swPill.className = "sw-pill";
        swPill.textContent = "untimed";
    }
}

function liveTick(now) {
    if (recState !== "recording") {
        liveFrame = null;
        return;
    }
    if (now - liveLastStep >= WAVE_STEP_MS) {
        liveLastStep = now;
        const level = liveAnalyser ? micLevel(liveAnalyser) : 0;
        liveLevels.push(level);
        liveLevels.shift();
        renderWave(level);
    }
    updateStopwatch();
    liveFrame = requestAnimationFrame(liveTick);
}

function startLiveView() {
    stopLiveView();
    liveAnalyser = mic ? mic.analyser : null;
    liveShownSecond = -1;
    updateStopwatch();
    liveFrame = requestAnimationFrame(liveTick);
}

// Stops the animation loop and lets go of the analyser (it is disconnected in releaseMic)
function stopLiveView() {
    if (liveFrame !== null) cancelAnimationFrame(liveFrame);
    liveFrame = null;
    liveAnalyser = null;
    liveLevels = new Array(waveBars.length).fill(0);
    renderWave(0);
}

// The settings switch and the Hide / Show buttons all change the same choice.
// Only the Hide / Show buttons move focus (to the button that replaces the one just pressed).
function setStopwatchShown(on, fromLiveButton = false) {
    showStopwatch = on;
    stopwatchToggle.setAttribute("aria-checked", String(on));
    stopwatchWord.textContent = on ? "Show" : "Hidden";
    stopwatchRow.hidden = !on;
    stopwatchOff.hidden = on;
    if (fromLiveButton) (on ? swHideBtn : swShowBtn).focus();
}

stopwatchToggle.addEventListener("click", () => setStopwatchShown(!showStopwatch));
swHideBtn.addEventListener("click", () => setStopwatchShown(false, true));
swShowBtn.addEventListener("click", () => setStopwatchShown(true, true));

// ---- Buttons ----
micBtn.addEventListener("click", () => {
    if (recState === "idle") {
        startMic();
    } else if (recState === "prep") {
        startCountdown();
    } else if (recState === "recording") {
        stopRecording(null);
    }
});
prepStartBtn.addEventListener("click", startCountdown);
prepCancelBtn.addEventListener("click", cancelRecording);
countCancelBtn.addEventListener("click", cancelRecording);
finishBtn.addEventListener("click", () => stopRecording(null));
startOverBtn.addEventListener("click", restartRecording);
takeSendBtn.addEventListener("click", () => {
    pausePlayers();
    if (currentTake) upload(currentTake);
});
reRecordBtn.addEventListener("click", () => {
    clearTake();
    startMic();
});
discardBtn.addEventListener("click", discardTake);

// Browsers that can't record keep the upload-first layout
if (micSupported) {
    updateActionText();
} else {
    stageView.classList.add("no-mic");
    prepSetting.hidden = true;
    stopwatchSetting.hidden = true;
    stepSpeakTitle.textContent = "Your turn on stage";
    actionText.textContent = `Upload an MP3 of your speech. Up to ${MAX_DURATION_MINUTES} minutes and ${MAX_FILE_MB} MB.`;
    uploadLabel.textContent = "Upload an MP3";
}
updateTakeButtons();
