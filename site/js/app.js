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

// Uploads: any audio or video file is converted on this device to the same WAV as a live recording.
// The original file's size is checked before it is read (phones have less memory to decode it in).
const MAX_SOURCE_MB_LAPTOP = 200;
const MAX_SOURCE_MB_PHONE = 100;
const UPLOAD_LENGTH_GRACE_SECONDS = 0.5;    // encoders add a few ms of padding, so a file shown as 10:00 still fits
const UPLOAD_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "webm", "flac", "mp4", "mov", "m4v", "3gp", "wma", "amr", "aif", "aiff", "caf", "mkv"];
const UNREADABLE_TEXT = "The sound in this file couldn't be read. Try another file or format.";
const TOO_LONG_TEXT = `This recording is longer than ${MAX_DURATION_MINUTES} minutes. Please upload a shorter speech.`;

// Silence checks, all on this device. A 50 ms stretch is "near-silence" when its loudness (RMS) is below
// -50 dB: room noise after the mic's noise suppression is about -60 to -70 dB, quiet speech about -40 to -30.
// A take or file is "almost silent" when 95% or more of it is near-silence (normal speech is 20-40% pauses).
const SILENCE_DB = -50;
const SILENCE_LEVEL = Math.pow(10, SILENCE_DB / 20) * 32768;      // the same in 16-bit sample units (about 104)
const SILENCE_FRAME_SECONDS = 0.05;
const ALMOST_SILENT_SHARE = 0.95;
const MIC_CHECK_SECONDS = 5;               // while recording: nothing heard for this long shows the mic hint

// Your words: the transcript with its marks. Each word from the server is [word, start, end, confidence],
// with times in hundredths of a second and confidence from 0 to 100.
const LONG_PAUSE_HUNDREDTHS = 300;         // a gap of 3 seconds or more between two words is a long pause
const UNCLEAR_CONFIDENCE = 50;             // below this, the transcription was unsure about the word
// Filler sounds, matched after lowercasing and removing punctuation ("Um," counts). "Ah" is left out on
// purpose: it is often a real word ("Ah, I see").
const FILLER_SOUNDS = ["um", "umm", "ummm", "uhm", "uh", "uhh", "uhhh", "er", "err", "erm"];
const WORDS_MAX = 5000;                    // most words kept (10 minutes at a fast 250 per minute is 2,500)
const WORD_MAX_LENGTH = 100;
const WORD_MAX_TIME = 360000;              // one hour, in hundredths of a second
const WALL_WORDS_ENTRIES = 30;             // only the newest playbills keep their words

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

// Wall of Fame: past performances, saved only in this browser (localStorage)
const WALL_KEY = "speakreview.wall.v1";
const WALL_MAX_ENTRIES = 100;
const WALL_MAX_ID = 200;               // longest id kept
const WALL_MAX_TOPIC = 500;            // longest topic or topic type kept
const WALL_MAX_FEEDBACK = 20000;       // longest Coach's notes kept
const WALL_MAX_FILLER_WORDS = 30;      // most filler words kept in the breakdown
const WALL_MAX_SECONDS = 3600;

// Trophies: progress saved in this browser, separate from the wall, so removing playbills never lowers it
const TROPHY_KEY = "speakreview.trophies.v1";
const TROPHY_MAX_DAYS = 60;            // practice days kept

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
const topicArea = document.getElementById("stepTopic");
const showLabel = document.getElementById("showLabel");
const openMicLine = document.getElementById("openMicLine");
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
// The room switchers: the bottom bar buttons and the marquee signs (all .nav-item)
const navButtons = document.querySelectorAll(".nav-item");
const signs = document.querySelectorAll(".sign");
const signBackstage = document.getElementById("signBackstage");
const signWall = document.getElementById("signWall");
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
const wallView = document.getElementById("wallView");
const wallTitle = document.getElementById("wallTitle");
const wallStorageNote = document.getElementById("wallStorageNote");
const wallEmpty = document.getElementById("wallEmpty");
const wallGroups = document.getElementById("wallGroups");
const wallStageBtn = document.getElementById("wallStageBtn");
const clearWallBtn = document.getElementById("clearWallBtn");
const playbillDialog = document.getElementById("playbillDialog");
const clearWallDialog = document.getElementById("clearWallDialog");
const shelfTitle = document.getElementById("shelfTitle");
const shelfList = document.getElementById("shelfList");
const trophyPopover = document.getElementById("trophyPopover");
const trophyBanner = document.getElementById("trophyBanner");
const trophyBannerText = document.getElementById("trophyBannerText");
const clearTrophiesBox = document.getElementById("clearTrophiesBox");
// Ticket stubs for Speaking time and Prep time, and the panel (laptop) or sheet (phone) they open
const timeTicket = document.getElementById("timeTicket");
const prepTicket = prepSetting;
const timeTicketValue = document.getElementById("timeTicketValue");
const prepTicketValue = document.getElementById("prepTicketValue");
const settingsPanel = document.getElementById("settingsPanel");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const timePage = document.getElementById("timePage");
const prepPage = document.getElementById("prepPage");
const settingsDoneBtn = document.getElementById("settingsDoneBtn");
const phoneQuery = window.matchMedia("(max-width: 600px)");
const fileSilence = document.getElementById("fileSilence");
const fileSilenceChooseBtn = document.getElementById("fileSilenceChooseBtn");
const micCheck = document.getElementById("micCheck");
const takeSilence = document.getElementById("takeSilence");
const notesHint = document.getElementById("notesHint");

// Playback stops before sending, so the speech isn't still playing behind the curtains
uploadBtn.addEventListener("click", () => {
    pausePlayers();
    if (preparedUpload) upload(preparedUpload);
});

// ---------------------------
// Show the chosen file name, then convert it
// ---------------------------
let preparedUpload = null;     // { blob, seconds, source: "upload" } once the picked file is converted
let prepareRequest = 0;        // counts picks, so a slow old conversion can't replace a newer one

function showFileName() {
    const file = fileInput.files[0];
    const request = ++prepareRequest;
    preparedUpload = null;
    fileLengthSeconds = null;
    setFileSilence(false);
    // A conversion that was still running is dropped, so its "Preparing" line goes too
    if (statusText.textContent === "Preparing your file...") statusText.textContent = "";
    fileInfo.removeAttribute("aria-busy");
    if (file) {
        fileNameText.textContent = file.name;
        fileNameText.title = file.name;
        fileNameText.classList.add("has-file");
    } else {
        fileNameText.textContent = "No File Chosen";
        fileNameText.title = "";
        fileNameText.classList.remove("has-file");
    }
    // The name shows right away. The player and the Send button wait until the file is converted.
    fileInfo.hidden = !file;
    uploadBtn.hidden = true;
    filePlayer.clear();
    filePlayerBox.hidden = true;
    // With the mic as the main action, upload is the second choice
    uploadLabel.textContent = file ? "Choose another file" : (micSupported ? "or upload a recording" : "Upload a recording");
    renderLengthLine();
    if (file) prepareUpload(file, request);
}

fileInput.addEventListener("change", showFileName);

// Clears the picked file and shows why (nothing is sent)
function rejectFile(message, request) {
    if (request !== prepareRequest) return;
    fileInput.value = "";
    showFileName();
    statusText.textContent = message;
}

// Audio or video, by its type or (when the browser doesn't say) its name
function isMediaFile(file) {
    if (/^(audio|video)\//.test(file.type)) return true;
    const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return Boolean(match) && UPLOAD_EXTENSIONS.includes(match[1]);
}

function maxSourceMb() {
    return isLowMemoryDevice() ? MAX_SOURCE_MB_PHONE : MAX_SOURCE_MB_LAPTOP;
}

// Decodes the sound of a file at 16 kHz (the browser resamples it). Returns an AudioBuffer, or null if the
// sound can't be read. If the browser refuses a 16 kHz context, it decodes at its own rate instead.
async function decodeAtRecRate(bytes) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return null;
    let context = null;
    try {
        context = new Offline(1, 1, REC_SAMPLE_RATE);
    } catch (err) {
        try {
            context = new Offline(1, 1, 44100);
        } catch (err2) {
            return null;
        }
    }
    try {
        return await context.decodeAudioData(bytes);
    } catch (err) {
        return null;
    }
}

// Mixes every channel down to one, converts to 16 kHz if needed, and returns 16-bit chunks
function bufferToPcmChunks(buffer) {
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) mono[i] += data[i];
    }
    if (buffer.numberOfChannels > 1) {
        for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
    }
    let samples = mono;
    if (buffer.sampleRate !== REC_SAMPLE_RATE) {
        // The same converter the live recorder uses, with silence at the end to flush its last samples
        const resampler = createResampler(buffer.sampleRate);
        const head = resampler(mono);
        const tail = resampler(new Float32Array(64));
        const wanted = Math.round(length * REC_SAMPLE_RATE / buffer.sampleRate);
        samples = new Float32Array(wanted);
        samples.set(head.subarray(0, wanted));
        if (head.length < wanted) samples.set(tail.subarray(0, wanted - head.length), head.length);
    }
    return [toPcm16(samples, samples.length)];
}

// Checks and converts a picked file on this device: type, size (before reading it), length, then a
// mono, 16-bit, 16 kHz WAV. Only that WAV is ever sent; the original file never leaves the device.
async function prepareUpload(file, request) {
    if (!isMediaFile(file)) {
        rejectFile("This file type can't be used. Choose an audio or video file.", request);
        return;
    }
    const maxMb = maxSourceMb();
    if (file.size > maxMb * 1024 * 1024) {
        rejectFile(`This file is too large. Choose a file under ${maxMb} MB.`, request);
        return;
    }

    statusText.textContent = "Preparing your file...";
    fileInfo.setAttribute("aria-busy", "true");
    try {
        // A quick look at the file's own length first, so a very long video is never decoded into memory
        const listed = await getAudioDurationSeconds(file);
        if (request !== prepareRequest) return;
        if (listed !== null && listed > MAX_DURATION_MINUTES * 60 + UPLOAD_LENGTH_GRACE_SECONDS) {
            rejectFile(TOO_LONG_TEXT, request);
            return;
        }

        const buffer = file.size > 0 ? await decodeAtRecRate(await file.arrayBuffer()) : null;
        if (request !== prepareRequest) return;
        if (!buffer || buffer.length === 0) {
            rejectFile(UNREADABLE_TEXT, request);
            return;
        }
        if (buffer.duration > MAX_DURATION_MINUTES * 60 + UPLOAD_LENGTH_GRACE_SECONDS) {
            rejectFile(TOO_LONG_TEXT, request);
            return;
        }

        const chunks = bufferToPcmChunks(buffer);
        const count = chunks[0].length;
        const blob = buildWav(chunks, count);
        if (blob.size > MAX_FILE_MB * 1024 * 1024) {
            rejectFile("This file is too large to send. Choose a shorter one.", request);
            return;
        }

        preparedUpload = { blob, seconds: count / REC_SAMPLE_RATE, source: "upload" };
        fileLengthSeconds = preparedUpload.seconds;
        statusText.textContent = "";
        filePlayer.load(URL.createObjectURL(blob));
        filePlayer.setPeaks(peaksFromChunks(chunks));
        filePlayerBox.hidden = false;
        uploadBtn.hidden = false;
        uploadBtn.disabled = isBusy || isRolling || !getTimeLimit().valid;
        setFileSilence(isAlmostSilent(chunks));
        renderLengthLine();
    } catch (err) {
        console.error(err);
        rejectFile(UNREADABLE_TEXT, request);
    } finally {
        if (request === prepareRequest) fileInfo.removeAttribute("aria-busy");
    }
}

// The "almost silent" warning under a converted file: "Send anyway" or "Choose another file"
function setFileSilence(on) {
    fileSilence.hidden = !on;
    uploadBtn.textContent = on ? "Send anyway" : "Send to the coach";
}

fileSilenceChooseBtn.addEventListener("click", () => fileInput.click());

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

    if (!isMediaFile(file)) {
        statusText.textContent = "This file type can't be used. Choose an audio or video file.";
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

// The ticket reads "Tonight's show", or "Open mic night" with its line under the topic when there is no topic
function updateShowState() {
    showLabel.textContent = speakFreely ? "Open mic night" : "Tonight's show";
    openMicLine.hidden = !speakFreely;
    topicArea.classList.toggle("is-open-mic", speakFreely);
}

// The placeholder doubles as the big heading when there is no topic
function updateTopicPlaceholder() {
    if (document.activeElement === topicInput) {
        topicInput.placeholder = "Type your own topic";
    } else if (speakFreely) {
        topicInput.placeholder = "Speak on anything you like";
    } else {
        topicInput.placeholder = "Roll a topic, or write your own";
    }
    updateShowState();
    fitTopicHeight();
}

let isRolling = false;         // true while the random topic animation is running

// The height of the ticket's topic box (--topic-lines lines at the full topic size: 2 on laptops, 3 on
// phones), including padding and borders
function threeLineHeight() {
    const style = getComputedStyle(topicInput);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const lines = parseInt(style.getPropertyValue("--topic-lines"), 10) || 3;
    return lineHeight * lines + padding + borders;
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

// Makes the topic fit in the ticket's fixed topic box (--topic-lines full-size lines). Long topics get a
// smaller font (up to three steps; the last one only matters on narrow phones), so a smaller topic may use
// an extra line inside that same space instead of being cut off.
function fitTopicHeight() {
    topicInput.classList.remove("topic-long", "topic-longer", "topic-longest");
    const maxHeight = threeLineHeight();
    if (sizeTopicBox(maxHeight)) return;
    topicInput.classList.add("topic-long");
    if (sizeTopicBox(maxHeight)) return;
    topicInput.classList.add("topic-longer");
    if (sizeTopicBox(maxHeight)) return;
    topicInput.classList.add("topic-longest");
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
    updateShowState();
    fitTopicHeight();
});

// "Write your own": edit the big topic in place. The text is selected, so typing replaces it.
// Writing a topic also ends Open mic night.
writeTopicBtn.addEventListener("click", () => {
    speakFreely = false;
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
    updateTickets();
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
let fileLengthSeconds = null;    // the converted file's exact length (set by prepareUpload)

// Updates both length lines: the converted file's and the recorded take's
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
    if (disabled) closeSettings(false);
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
    waitNote.hidden = true;
    setOptionsDisabled(false);
    uploadBtn.disabled = !getTimeLimit().valid;
}

// Sends a WAV: a recorded take or a converted file ({ blob, seconds, source: "recording" or "upload" })
async function upload(take) {
    const isRecording = take && take.source === "recording";
    const sendButton = isRecording ? takeSendBtn : uploadBtn;
    // Locked before anything else, so a double click can't send the speech twice
    sendButton.disabled = true;
    const file = take ? take.blob : null;

    if(!file) {
        sendButton.disabled = false;
        alert("Please select an audio file.");
        return;
    }
    if(isRecording) takeAudio.pause();

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
    resultBox.hidden = true;
    waitNote.hidden = true;

    if(file.size > MAX_FILE_MB * 1024 * 1024) {
        failUpload(isRecording
            ? `This recording is too large to send. Recordings can be up to ${MAX_FILE_MB} MB.`
            : "This file is too large to send. Choose a shorter one.");
        return;
    }

    statusText.innerText = "Checking your recording...";
    // The exact length is already known from the samples (a converted file gets a little encoder padding)
    const maxSeconds = MAX_DURATION_MINUTES * 60 + (isRecording ? 0 : UPLOAD_LENGTH_GRACE_SECONDS);
    if(take.seconds > maxSeconds) {
        failUpload(TOO_LONG_TEXT);
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
        // Both are 16 kHz mono WAV made on this device; source says which way it was made
        params.set("format", "wav");
        params.set("source", isRecording ? "recording" : "upload");
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
        formData.append("file", file, "speech.wav");

        const uploadResponse = await fetch(data.upload.url, {
            method: "POST",
            body: formData
        });

        if(!uploadResponse.ok) {
            console.error("S3 upload failed:", uploadResponse.status);
            failUpload("Upload failed. Please try again.");
            return;
        }

        // The take reached the server, so leaving the page no longer loses it
        if(isRecording) markTakeSent(take);

        // Uploaded: Intermission now says the coach is reviewing the speech
        setIntermissionPhase("review");
        statusText.innerText = "Analyzing Performance Patterns...";
        waitNote.hidden = false;
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
            waitNote.hidden = true;
            statusText.innerText = "This is taking longer than expected. Please try again in a few minutes.";
            uploadBtn.disabled = false;
            setOptionsDisabled(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/result?speech_id=${speechId}`);
            const result = await res.json();

            if(stopped) return;

            // A too-short speech is finished too, even with no words per minute
            if(result && (result.wpm || result.too_short === true)) {
                stopped = true;
                showingResult = true;
                clearInterval(interval);
                waitNote.hidden = true;
                uploadBtn.disabled = false;
                setOptionsDisabled(false);
                statusText.innerText = "Spotlight Ready.";
                // Never throw; only real results get here, not console tests. A performance already
                // on the wall is never counted toward trophies twice.
                const isNew = saveToWall(speechId, result);
                // Too-short speeches go on the wall but never count toward trophies
                const unlocked = isNew && result.too_short !== true ? recordTrophies(result) : [];
                displayResult(result);      // fills Backstage and opens the curtains on it
                showTrophyBanner(unlocked);
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
                waitNote.hidden = true;
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
    resultBox.hidden = false;
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
    const SOURCE_LABELS = { recording: "Live recording", upload: "Uploaded file" };
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
                <div class="score-bar-bg"><div id="clarityFill" class="score-fill"></div></div>
            </div>
        </div>`;

    perfSummary.innerHTML = summaryHtml;
    // A too-short speech gets one plain sentence instead of coaching sections (set as text, never as HTML)
    const tooShort = data.too_short === true;
    if (tooShort) {
        coachNotesBody.replaceChildren(tooShortNote(data.ai_feedback));
    } else {
        coachNotesBody.innerHTML = cleanFeedback;
    }
    notesHintOnNotes = !tooShort;
    coachNotesBody.scrollTop = 0;
    perfColumn.scrollTop = 0;
    // Your words (too-short speeches show theirs too). Every new result opens on Coach's notes.
    wordsPanel.replaceChildren(buildWordsView(cleanWords(data.words)));
    backstageTabs.select("tabNotes");

    setTimeout(() => {
        const fill = document.getElementById('clarityFill');
        if(fill) fill.style.width = clarityScore + '%';
    }, 100);

    // Open Backstage on the notes (through Intermission if it is showing)
    revealNotes();
}

const TOO_SHORT_FALLBACK = "This speech was too short for full notes. Try speaking for a little longer next time.";

// The friendly message for a too-short speech, as a paragraph made with textContent
function tooShortNote(feedback) {
    const note = document.createElement("p");
    note.className = "note-text note-short";
    note.textContent = typeof feedback === "string" && feedback.trim() !== "" ? feedback.trim() : TOO_SHORT_FALLBACK;
    return note;
}

// ---------------------------
// Your words: the transcript with fillers, long pauses and unclear words marked
// ---------------------------
// Words come from the server or from storage, so both are untrusted: cleanWords() keeps only well-formed
// [word, start, end, confidence] items, and every word is put on the page with textContent.
// Returns null when there are no words at all (older results), or a list (possibly empty).
function cleanWords(raw) {
    if (!Array.isArray(raw)) return null;
    const time = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= WORD_MAX_TIME;
    const words = [];
    for (const item of raw) {
        if (words.length >= WORDS_MAX) break;
        if (!Array.isArray(item) || item.length < 4) continue;
        const [word, start, end, confidence] = item;
        if (typeof word !== "string" || word.trim() === "" || word.length > WORD_MAX_LENGTH) continue;
        if (!time(start) || !time(end) || end < start) continue;
        if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) continue;
        words.push([word.trim(), Math.round(start), Math.round(end), Math.round(confidence)]);
    }
    return words;
}

function isFillerSound(word) {
    return FILLER_SOUNDS.includes(word.toLowerCase().replace(/[^a-z]/g, ""));
}

// The small pause icon from the design (two bars)
function pauseIcon() {
    const svg = svgPart("svg", { class: "w-pause-icon", width: "9", height: "9", viewBox: "0 0 10 10", "aria-hidden": "true", focusable: "false" });
    svg.append(
        svgPart("rect", { x: "1", y: "1", width: "3", height: "8", rx: "1", fill: "currentColor" }),
        svgPart("rect", { x: "6", y: "1", width: "3", height: "8", rx: "1", fill: "currentColor" })
    );
    return svg;
}

// A pause pill, for example "3.4s" (read out as "Long pause, 3.4 seconds")
function pausePill(seconds) {
    const text = `${seconds.toFixed(1)}s`;
    const pill = document.createElement("span");
    pill.className = "w-pause";
    pill.setAttribute("role", "img");
    pill.setAttribute("aria-label", `Long pause, ${seconds.toFixed(1)} seconds`);
    pill.append(pauseIcon(), document.createTextNode(text));
    return pill;
}

// A marked word: the mark's look plus words for screen readers, so color is never the only signal
function markedWord(kind, word) {
    const element = document.createElement(kind === "filler" ? "mark" : "span");
    element.className = kind === "filler" ? "w-filler" : "w-unclear";
    if (kind === "unclear") element.title = "The transcription was unsure about this word";
    element.append(document.createTextNode(word), makeSpan("visually-hidden", kind === "filler" ? " (filler)" : " (unclear)"));
    return element;
}

// One legend item: a sample mark, then its name and count
function legendItem(sample, long, short, count) {
    const item = document.createElement("span");
    item.className = "words-key";
    const label = document.createElement("span");
    label.append(makeSpan("long-label", `${long}, ${count}`));
    const shortLabel = makeSpan("short-label", `${short} ${count}`);
    shortLabel.setAttribute("aria-hidden", "true");
    label.append(shortLabel);
    item.append(sample, label);
    return item;
}

// Builds the Your words view for a list of words (or null). Returns a fragment for a panel.
function buildWordsView(words) {
    const view = document.createDocumentFragment();
    if (!words || words.length === 0) {
        const empty = document.createElement("p");
        empty.className = "words-empty";
        empty.textContent = words ? "No words were picked up in this take." : "The word-by-word view isn't available for this performance.";
        view.append(empty);
        return view;
    }

    const text = document.createElement("p");
    text.className = "words-text";
    let plain = "";                 // plain words are joined into one text node until the next mark
    const flush = () => {
        if (plain) text.append(document.createTextNode(plain));
        plain = "";
    };
    let fillers = 0, pauses = 0, unclear = 0;
    words.forEach(([word, start, , confidence], i) => {
        const gap = i > 0 ? start - words[i - 1][2] : 0;
        if (gap >= LONG_PAUSE_HUNDREDTHS) {
            flush();
            text.append(document.createTextNode(" "), pausePill(gap / 100));
            pauses++;
        }
        const space = i > 0 ? " " : "";
        if (isFillerSound(word)) {             // a filler wins over unclear (the transcription is often unsure about "um")
            plain += space;
            flush();
            text.append(markedWord("filler", word));
            fillers++;
        } else if (confidence < UNCLEAR_CONFIDENCE) {
            plain += space;
            flush();
            text.append(markedWord("unclear", word));
            unclear++;
        } else {
            plain += space + word;
        }
    });
    flush();

    const sampleFiller = makeSpan("w-filler", "um");
    const samplePause = document.createElement("span");
    samplePause.className = "w-pause";
    samplePause.append(pauseIcon(), document.createTextNode("3s+"));
    const sampleUnclear = makeSpan("w-unclear", "word");
    [sampleFiller, samplePause, sampleUnclear].forEach(sample => sample.setAttribute("aria-hidden", "true"));

    const legend = document.createElement("p");
    legend.className = "words-legend";
    legend.append(
        legendItem(sampleFiller, "Filler", "Filler", fillers),
        legendItem(samplePause, "Long pause", "Pause", pauses),
        legendItem(sampleUnclear, "Unclear", "Unclear", unclear)
    );

    // The only part of the view that scrolls (no visible scrollbar, a fade at the bottom)
    const body = document.createElement("div");
    body.className = "words-body";
    body.tabIndex = 0;
    body.setAttribute("aria-label", "Your words, scrollable");
    body.append(text);

    // The note sits under the words on laptops, and at the end of the words on phones (CSS shows one of the two)
    const NOTE = "Long pauses are 3 seconds or more, and are not a mistake: pausing is often better than saying um. Unclear words are ones the transcription was unsure about.";
    const note = document.createElement("p");
    note.className = "words-note";
    note.textContent = NOTE;
    const inlineNote = document.createElement("p");
    inlineNote.className = "words-note words-note-inline";
    inlineNote.textContent = NOTE;
    body.append(inlineNote);

    view.append(legend, body, note);
    return view;
}

// ---------------------------
// Tabs (Backstage and the open playbill)
// ---------------------------
// Accessible tabs: a click picks one; Left and Right move and pick (wrapping), Home and End go to the
// first and last. Only the picked tab is a Tab stop. Each tab shows the panel named by its aria-controls.
// Works for any number of tabs. Returns { select(id), selected() }.
function setupTabs(tablist, onChange) {
    const tabs = () => Array.from(tablist.querySelectorAll('[role="tab"]'));
    function select(id, focus = false) {
        tabs().forEach(tab => {
            const on = tab.id === id;
            tab.setAttribute("aria-selected", String(on));
            tab.tabIndex = on ? 0 : -1;
            document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
            if (on && focus) tab.focus();
        });
        if (onChange) onChange(id);
    }
    tablist.addEventListener("click", e => {
        const tab = e.target.closest('[role="tab"]');
        if (tab) select(tab.id);
    });
    tablist.addEventListener("keydown", e => {
        const list = tabs();
        const at = list.indexOf(document.activeElement);
        if (at < 0) return;
        let next = null;
        if (e.key === "ArrowRight") next = list[(at + 1) % list.length];
        else if (e.key === "ArrowLeft") next = list[(at - 1 + list.length) % list.length];
        else if (e.key === "Home") next = list[0];
        else if (e.key === "End") next = list[list.length - 1];
        if (!next) return;
        e.preventDefault();
        select(next.id, true);
    });
    return {
        select,
        selected: () => tabs().find(tab => tab.getAttribute("aria-selected") === "true")?.id || null
    };
}

// "Scroll for all notes" follows the open tab: Coach's notes as before, Your words only when it scrolls
let notesHintOnNotes = true;
function updateNotesHint(id) {
    if (id === "tabWords") {
        const body = wordsPanel.querySelector(".words-body");
        notesHint.hidden = !body || body.scrollHeight <= body.clientHeight + 1;
    } else {
        notesHint.hidden = !notesHintOnNotes;
    }
}

const wordsPanel = document.getElementById("wordsPanel");
const backstageTabs = setupTabs(document.getElementById("backstageTabs"), updateNotesHint);

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
    if (!isStage) {
        pausePlayers();                // nothing keeps playing behind the curtains
        closeSettings(false);
    }
    currentView = name;
    dropZone.hidden = !isStage;
    backstageView.hidden = name !== "backstage";
    wallView.hidden = name !== "wall";
    appRoot.dataset.view = name;
    navButtons.forEach(button => {
        if (button.dataset.view === name) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
    if (name === "backstage") {
        // A new upload hides the old results, so the empty state shows until new ones arrive
        resultPlaceholder.hidden = !resultBox.hidden;
        restartBulbs();
    }
    if (name === "wall") {
        loadWall();             // read again, in case another tab changed it
        loadTrophies();
        renderWall();
    } else {
        closeTrophyPopover(false);
    }
    if (isStage) fitTopicHeight();      // the topic may have changed while the stage was hidden
    layoutSignBulbs();                  // the new room's sign was hidden until now
    window.scrollTo(0, 0);
}

// The bulbs flicker softly 3 times each time Backstage opens, then stay lit
function restartBulbs() {
    mirror.classList.remove("bulbs-on");
    void mirror.offsetWidth;   // makes the browser notice the class was removed, so the animation starts over
    mirror.classList.add("bulbs-on");
}

// ---- Backstage left column: scrolls inside the mirror only when it doesn't fit ----
// The summary and buttons can be taller than the mirror on short windows. Then the column becomes a
// scroller like Coach's notes (focusable, so arrow keys scroll it too) with a fade while there is more
// below. On phones the column is display: contents and nothing here applies.
const perfColumn = document.querySelector(".perf");
const perfButtons = perfColumn.querySelector(".perf-buttons");
const PERF_FOCUS_ROOM = 6;     // the bottom padding added while scrolling (room for the last focus ring)

function updatePerfScroll() {
    const style = getComputedStyle(perfColumn);
    const box = style.display !== "contents" && perfColumn.clientHeight > 0;
    // What the content needs, measured the same way with or without the classes, so it never flips back and forth
    const needed = perfSummary.offsetHeight + (parseFloat(style.rowGap) || 0) + perfButtons.offsetHeight + PERF_FOCUS_ROOM;
    const scrollable = box && needed > perfColumn.clientHeight;
    perfColumn.classList.toggle("is-scrollable", scrollable);
    if (scrollable) {
        perfColumn.setAttribute("tabindex", "0");
    } else {
        perfColumn.removeAttribute("tabindex");
        perfColumn.scrollTop = 0;
    }
    perfColumn.classList.toggle("has-more", scrollable && perfColumn.scrollTop + perfColumn.clientHeight < perfColumn.scrollHeight - 1);
}

// Window size, zoom, Backstage opening and new content (now or added later) all change one of these sizes
const perfObserver = new ResizeObserver(updatePerfScroll);
[perfColumn, perfSummary, perfButtons].forEach(element => perfObserver.observe(element));
perfColumn.addEventListener("scroll", updatePerfScroll, { passive: true });

function focusBackstageHeading() {
    const heading = resultBox.hidden ? backstageEmptyTitle : coachNotesTitle;
    heading.focus({ preventScroll: true });
}

// Switches screens: the curtains close, the screen changes, then they open (instant with reduced motion)
function goToView(name) {
    return queueScene(async () => {
        if (intermissionOn) return;          // during Intermission, its end decides where the curtains open
        const from = currentView;
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
        if (name === "wall") wallTitle.focus({ preventScroll: true });
        if (name === "stage" && from !== "stage") focusSignBack(from);
    });
}

// Laptop signs vanish with their room. If the one just used took focus with it, focus goes to the
// Stage sign that leads back to the room just left (phones keep focus on the bottom bar, as before).
function focusSignBack(from) {
    const active = document.activeElement;
    if (active && active !== document.body && active.getClientRects().length > 0) return;
    const sign = from === "wall" ? signWall : signBackstage;
    if (sign.getClientRects().length > 0 && !sign.disabled) sign.focus({ preventScroll: true });
}

// Each sign's bulbs, spaced along its top and bottom edges for its current width (as in the design:
// about every 13px between the tip and the far end)
const SIGN_TIP = 22;
function layoutSignBulbs() {
    signs.forEach(sign => {
        const w = sign.offsetWidth;
        const h = sign.offsetHeight;
        if (!w) return;                       // hidden: laid out again when it shows
        const left = sign.classList.contains("sign-left");
        const x0 = left ? SIGN_TIP + 6 : 8;
        const x1 = left ? w - 12 : w - SIGN_TIP - 10;
        const n = Math.max(3, Math.floor((x1 - x0) / 13));
        const row = sign.querySelector(".sign-bulbs");
        row.textContent = "";
        for (let k = 0; k <= n; k++) {
            const x = x0 + (k / n) * (x1 - x0) - 3;
            [5, h - 11].forEach(y => {
                const bulb = document.createElement("span");
                bulb.className = "sign-bulb";
                bulb.style.setProperty("left", `${x.toFixed(1)}px`);
                bulb.style.setProperty("top", `${y}px`);
                row.append(bulb);
            });
        }
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
window.addEventListener("resize", layoutSignBulbs);
layoutSignBulbs();
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
// Wall of Fame: past performances, saved only in this browser
// ---------------------------
// Saved under WALL_KEY as a JSON array of entries, newest first. Anything read back from storage is
// untrusted (it can be edited by hand or by another script), so every entry goes through
// cleanWallEntry() and every value is shown with textContent. The Coach's notes go through
// escapeHtml() first and then the same formatter as Backstage.
const WALL_TILTS = [-1.2, 0.8, -0.6, 1.1, -0.9];       // degrees, as in the design
const WALL_SOURCES = { recording: "Live recording", upload: "Uploaded file" };
const WALL_BAD = Symbol("bad");                        // marks a value with the wrong type or size
let wallEntries = [];
let wallSavingWorks = true;    // false once reading or writing storage fails (blocked or full)
let wallOrder = [];            // the entries in the order they are shown, for moving focus after a removal
let wallButtons = new Map();   // entry id → its playbill button

// A string (null when missing or blank), or WALL_BAD
function wallString(value, maxLength) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > maxLength) return WALL_BAD;
    return value.trim() === "" ? null : value;
}

// A number from min to max (a plain number written as text also counts), null when missing, or WALL_BAD
function wallNumber(value, min, max) {
    if (value === undefined || value === null) return null;
    let number = value;
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) number = Number(value);
    if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) return WALL_BAD;
    return number;
}

// Filler word counts, for example { um: 3, uh: 1 }, or null, or WALL_BAD
function wallBreakdown(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "object" || Array.isArray(value)) return WALL_BAD;
    const pairs = Object.entries(value);
    if (pairs.length > WALL_MAX_FILLER_WORDS) return WALL_BAD;
    const clean = Object.create(null);   // no prototype, so a word like "__proto__" is just a word
    for (const [word, count] of pairs) {
        const number = wallNumber(count, 0, 100000);
        if (word.length > 40 || number === null || number === WALL_BAD) return WALL_BAD;
        clean[word] = number;
    }
    return clean;
}

// Returns a new entry with only the allowed fields, or null if anything is missing or the wrong type.
// Used both when saving and when reading back, so nothing else (audio, a transcript) can ever be kept.
function cleanWallEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (typeof raw.id !== "string" || raw.id === "" || raw.id.length > WALL_MAX_ID) return null;
    if (typeof raw.savedAt !== "string" || raw.savedAt.length > 40) return null;
    const savedAt = Date.parse(raw.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    const wpm = wallNumber(raw.wpm, 0, 10000);
    if (wpm === null || wpm === WALL_BAD) return null;

    let source = null;
    if (raw.source !== undefined && raw.source !== null) {
        if (typeof raw.source !== "string") return null;
        source = Object.hasOwn(WALL_SOURCES, raw.source) ? raw.source : null;   // unknown names are just not shown
    }
    let cutOff = null;
    if (raw.cut_off !== undefined && raw.cut_off !== null) {
        if (typeof raw.cut_off !== "boolean") return null;
        cutOff = raw.cut_off;
    }
    let tooShort = null;
    if (raw.too_short !== undefined && raw.too_short !== null) {
        if (typeof raw.too_short !== "boolean") return null;
        tooShort = raw.too_short;
    }

    const entry = {
        id: raw.id,
        savedAt: new Date(savedAt).toISOString(),
        topic: wallString(raw.topic, WALL_MAX_TOPIC),
        topic_type: wallString(raw.topic_type, WALL_MAX_TOPIC),
        time_limit_seconds: wallNumber(raw.time_limit_seconds, 0, WALL_MAX_SECONDS),
        speaking_seconds: wallNumber(raw.speaking_seconds, 0, WALL_MAX_SECONDS),
        source,
        cut_off: cutOff,
        too_short: tooShort,
        wpm,
        filler_word_total: wallNumber(raw.filler_word_total, 0, 100000),
        filler_word_breakdown: wallBreakdown(raw.filler_word_breakdown),
        avg_confidence: wallNumber(raw.avg_confidence, 0, 1),
        ai_feedback: wallString(raw.ai_feedback, WALL_MAX_FEEDBACK),
        // Your words: badly formed words are dropped, but the rest of the entry is kept
        words: cleanWords(raw.words)
    };
    return Object.values(entry).includes(WALL_BAD) ? null : entry;
}

// Cleans a list: drops bad entries, keeps the newest of any repeated id, newest first, at most 100.
// Only the newest WALL_WORDS_ENTRIES keep their words.
function tidyWall(list) {
    const seen = new Set();
    const tidy = list
        .map(cleanWallEntry)
        .filter(Boolean)
        .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
        .filter(entry => {
            if (seen.has(entry.id)) return false;
            seen.add(entry.id);
            return true;
        })
        .slice(0, WALL_MAX_ENTRIES);
    return wallWordsFor(tidy, WALL_WORDS_ENTRIES);
}

// The same list with words kept only on the newest "keep" entries (the others keep everything else)
function wallWordsFor(list, keep) {
    return list.map((entry, i) => (i < keep || entry.words === null ? entry : { ...entry, words: null }));
}

// Reads the wall from storage. Once saving has failed (storage blocked or full), storage no longer
// matches what this visit has, so the entries in memory are kept instead.
function loadWall() {
    if (!wallSavingWorks) return;
    let saved;
    try {
        saved = localStorage.getItem(WALL_KEY);
    } catch (err) {
        wallSavingWorks = false;
        return;
    }
    let list = [];
    if (saved) {
        try {
            list = JSON.parse(saved);
        } catch (err) {
            list = [];           // damaged: start again (it is replaced on the next save)
        }
    }
    wallEntries = tidyWall(Array.isArray(list) ? list : []);
}

// When storage is nearly full, words are kept on fewer playbills (20, then 10, then none) before giving up.
// What is kept in memory then matches what was saved.
const WALL_WORDS_FALLBACK = [20, 10, 0];

function writeWall() {
    try {
        if (wallEntries.length === 0) {
            localStorage.removeItem(WALL_KEY);
        } else {
            let list = wallEntries;
            const steps = [...WALL_WORDS_FALLBACK];
            for (;;) {
                try {
                    localStorage.setItem(WALL_KEY, JSON.stringify(list));
                    break;
                } catch (err) {
                    if (steps.length === 0) throw err;
                    list = wallWordsFor(wallEntries, steps.shift());
                }
            }
            wallEntries = list;
        }
        wallSavingWorks = true;
    } catch (err) {
        wallSavingWorks = false;  // blocked or full: the page keeps working without saving
    }
}

// Adds a finished performance to the wall. Only what the page already shows is kept. Never throws.
// Returns true only when this performance was not on the wall yet (checked against the saved list, or
// the list in memory when storage is blocked or full), so trophies never count it twice.
function saveToWall(fileId, result) {
    try {
        loadWall();              // start from what is saved now (another tab may have added some)
        const entry = cleanWallEntry({
            id: String(fileId),
            savedAt: new Date().toISOString(),
            topic: result.topic,
            topic_type: result.topic_type,
            time_limit_seconds: result.time_limit_seconds,
            speaking_seconds: result.speaking_seconds,
            source: result.source,
            cut_off: result.cut_off,
            too_short: result.too_short,
            // A too-short speech may come without a pace; it still goes on the wall
            wpm: result.too_short === true ? (result.wpm ?? 0) : result.wpm,
            filler_word_total: result.filler_word_total,
            filler_word_breakdown: result.filler_word_breakdown,
            avg_confidence: result.avg_confidence,
            ai_feedback: result.ai_feedback,
            words: result.words
        });
        if (!entry) return false;
        const isNew = !wallEntries.some(saved => saved.id === entry.id);
        wallEntries = tidyWall([entry, ...wallEntries.filter(saved => saved.id !== entry.id)]);
        writeWall();
        return isNew;
    } catch (err) {
        console.error(err);
        return false;
    }
}

// Groups entries by the visitor's own calendar day
function wallDayKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// "Today", "Yesterday", or the full date like "Thursday, October 1" (with the year if it isn't this year)
function wallDayLabel(date) {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (wallDayKey(date) === wallDayKey(today)) return "Today";
    if (wallDayKey(date) === wallDayKey(yesterday)) return "Yesterday";
    const options = { weekday: "long", month: "long", day: "numeric" };
    if (date.getFullYear() !== today.getFullYear()) options.year = "numeric";
    return date.toLocaleDateString("en-US", options);
}

function wallClockTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// The words shown for an entry on its playbill and in the open playbill
function describeWallEntry(entry) {
    let type = "Free speech";
    if (entry.topic) {
        if (entry.topic_type && Object.hasOwn(TOPIC_TYPE_INFO, entry.topic_type)) {
            type = TOPIC_TYPE_INFO[entry.topic_type].label;
        } else {
            type = entry.topic_type || "Own topic";
        }
    }

    let time = null;
    let status = null;
    let statusClass = "";
    if (entry.speaking_seconds !== null) {
        if (entry.time_limit_seconds) {
            const timing = describeTiming(entry.speaking_seconds, entry.time_limit_seconds);
            time = `${formatTime(entry.speaking_seconds)} / ${formatTime(entry.time_limit_seconds)}`;
            status = timing.text;
            statusClass = timing.className;
        } else {
            time = formatTime(entry.speaking_seconds);
            status = "Untimed";
        }
    }

    return {
        type,
        title: entry.topic || "Spoke freely",
        time,
        status,
        statusClass,
        source: entry.source ? WALL_SOURCES[entry.source] : null
    };
}

function makeSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
}

// One framed playbill (a real button) hanging from a nail
function buildPlaybill(entry, index) {
    const info = describeWallEntry(entry);
    const item = document.createElement("li");
    item.className = "wall-item";

    const nail = document.createElement("span");
    nail.className = "wall-nail";
    nail.setAttribute("aria-hidden", "true");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "playbill";
    button.style.setProperty("--tilt", `${WALL_TILTS[index % WALL_TILTS.length]}deg`);
    button.setAttribute("aria-label", `Open performance: ${info.title}, ${wallClockTime(new Date(entry.savedAt))}`);

    const paper = makeSpan("playbill-paper", "");
    paper.append(
        makeSpan("playbill-presents", "SpeakReview presents"),
        makeSpan("playbill-type", info.type),
        makeSpan("playbill-topic", info.title)
    );
    if (info.source) paper.append(makeSpan("playbill-source", info.source));
    if (info.time) {
        const foot = makeSpan("playbill-foot", "");
        foot.append(makeSpan("playbill-time", info.time), makeSpan(`playbill-status ${info.statusClass}`.trim(), info.status));
        paper.append(foot);
    }
    button.append(paper);
    button.addEventListener("click", () => openPlaybill(entry, button));

    item.append(nail, button);
    wallButtons.set(entry.id, button);
    return item;
}

// Draws the whole wall: a brass plaque for each day, newest day first, then its playbills
function renderWall() {
    wallStorageNote.hidden = wallSavingWorks && trophySavingWorks;
    renderShelf();
    wallGroups.replaceChildren();
    wallButtons = new Map();
    wallOrder = wallEntries.slice();
    const empty = wallEntries.length === 0;
    wallEmpty.hidden = !empty;
    clearWallBtn.hidden = empty;

    let dayKey = null;
    let row = null;
    wallEntries.forEach((entry, index) => {
        const date = new Date(entry.savedAt);
        if (wallDayKey(date) !== dayKey) {
            dayKey = wallDayKey(date);
            const group = document.createElement("section");
            group.className = "wall-group";
            const plaque = document.createElement("h3");
            plaque.className = "wall-plaque";
            plaque.textContent = wallDayLabel(date);
            row = document.createElement("ul");
            row.className = "wall-row";
            group.append(plaque, row);
            wallGroups.append(group);
        }
        row.append(buildPlaybill(entry, index));
    });
}

// ---- Dialogs: the open playbill and "Clear the wall" ----
// While one is open the page behind it is inert, Tab stays inside it, and Escape closes it.
let openOverlay = null;
let dialogReturnFocus = null;
let openEntry = null;          // the entry shown in the open playbill

function openDialog(overlay, focusTarget, returnTo) {
    setPrivacyOpen(false);
    openOverlay = overlay;
    dialogReturnFocus = returnTo;
    overlay.hidden = false;
    appRoot.inert = true;
    focusTarget.focus();
}

// Focus goes back to where the dialog was opened from, or to focusTarget, or nowhere when it is false
function closeDialog(focusTarget) {
    if (!openOverlay) return;
    openOverlay.hidden = true;
    openOverlay = null;
    openEntry = null;
    appRoot.inert = false;
    const target = focusTarget === undefined ? dialogReturnFocus : focusTarget;
    dialogReturnFocus = null;
    if (target && target.isConnected) target.focus();
}

function dialogFocusables(overlay) {
    return Array.from(overlay.querySelectorAll('button, input, [tabindex="0"]'))
        .filter(element => !element.disabled && element.getClientRects().length > 0);
}

document.addEventListener("keydown", e => {
    if (!openOverlay) return;
    if (e.key === "Escape") {
        e.preventDefault();
        onDialogEscape();
    } else if (e.key === "Tab") {
        const items = dialogFocusables(openOverlay);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const inside = openOverlay.contains(document.activeElement);
        if (e.shiftKey && (!inside || document.activeElement === first)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
            e.preventDefault();
            first.focus();
        }
    }
});

// ---- The open playbill ----
const pbTitle = document.getElementById("pbTitle");
const pbButtons = document.getElementById("pbButtons");
const pbConfirm = document.getElementById("pbConfirm");
const pbReplace = document.getElementById("pbReplace");
const pbReplaceText = document.getElementById("pbReplaceText");
const pbNotes = document.getElementById("pbNotes");
const pbWords = document.getElementById("pbWords");
const playbillTabs = setupTabs(document.getElementById("pbTabs"));
const pbPracticeBtn = document.getElementById("pbPracticeBtn");
const pbRemoveBtn = document.getElementById("pbRemoveBtn");
const pbKeepBtn = document.getElementById("pbKeepBtn");
const pbReplaceKeepBtn = document.getElementById("pbReplaceKeepBtn");
const clearWallKeepBtn = document.getElementById("clearWallKeepBtn");

// Shows one row of buttons at the bottom of the open playbill: the normal buttons, the remove
// question or the replace question
function showPlaybillRow(name, focusTarget) {
    pbButtons.hidden = name !== "buttons";
    pbConfirm.hidden = name !== "confirm";
    pbReplace.hidden = name !== "replace";
    if (focusTarget) focusTarget.focus();
}

function onDialogEscape() {
    if (openOverlay === playbillDialog && !pbConfirm.hidden) {
        showPlaybillRow("buttons", pbRemoveBtn);       // Escape means "Keep it"
    } else if (openOverlay === playbillDialog && !pbReplace.hidden) {
        showPlaybillRow("buttons", pbPracticeBtn);     // Escape means "Keep it"
    } else {
        closeDialog();
    }
}

function setField(id, text) {
    const element = document.getElementById(id);
    element.textContent = text || "";
    element.hidden = !text;
    return element;
}

function openPlaybill(entry, button) {
    const info = describeWallEntry(entry);
    const date = new Date(entry.savedAt);
    openEntry = entry;

    pbTitle.textContent = info.title;
    setField("pbType", info.type);
    setField("pbWhen", `${wallDayLabel(date)}, ${wallClockTime(date)}`);
    setField("pbTime", info.time);
    setField("pbStatus", info.status).className = `pb-status ${info.statusClass}`.trim();
    setField("pbSource", info.source);
    setField("pbCutOff", entry.cut_off === true ? `Recording stopped at the ${formatTime(MAX_DURATION_MINUTES * 60)} maximum.` : null);

    // The numbers, worked out the same way as on Backstage
    document.getElementById("pbWpm").textContent = String(entry.wpm);
    document.getElementById("pbFillers").textContent = String(entry.filler_word_total ?? 0);
    const breakdown = entry.filler_word_breakdown
        ? Object.entries(entry.filler_word_breakdown).map(([word, count]) => `${word} ${count}`).join(", ")
        : "";
    setField("pbBreakdown", breakdown);
    const clarity = entry.avg_confidence !== null ? Math.round(entry.avg_confidence * 100) : 0;
    document.getElementById("pbClarity").textContent = `${clarity}%`;

    // Coach's notes: escaped FIRST, then formatted line by line by the Backstage formatter.
    // A too-short speech's single sentence is shown as plain text.
    if (entry.too_short === true) {
        pbNotes.replaceChildren(tooShortNote(entry.ai_feedback));
    } else if (entry.ai_feedback) {
        pbNotes.innerHTML = escapeHtml(entry.ai_feedback)
            .trim()
            .split(/\r?\n/)
            .map(formatNoteLine)
            .join("");
    } else {
        const none = document.createElement("p");
        none.className = "note-text";
        none.textContent = "No notes were saved for this performance.";
        pbNotes.replaceChildren(none);
    }
    pbNotes.scrollTop = 0;
    // Your words (only the newest playbills keep them); the playbill always opens on Coach's notes
    pbWords.replaceChildren(buildWordsView(entry.words));
    playbillTabs.select("pbTabNotes");

    showPlaybillRow("buttons");
    openDialog(playbillDialog, pbTitle, button);
}

pbRemoveBtn.addEventListener("click", () => showPlaybillRow("confirm", pbKeepBtn));
pbKeepBtn.addEventListener("click", () => showPlaybillRow("buttons", pbRemoveBtn));
document.getElementById("pbCloseBtn").addEventListener("click", () => closeDialog());
document.getElementById("pbCloseX").addEventListener("click", () => closeDialog());

// "Remove": takes it off the wall, then focus moves to the next playbill (or the one before it)
document.getElementById("pbConfirmRemoveBtn").addEventListener("click", () => {
    if (!openEntry) return;
    const id = openEntry.id;
    const at = wallOrder.findIndex(entry => entry.id === id);
    const neighbour = wallOrder[at + 1] || wallOrder[at - 1] || null;

    loadWall();
    wallEntries = wallEntries.filter(entry => entry.id !== id);
    writeWall();
    renderWall();

    const next = neighbour ? wallButtons.get(neighbour.id) : null;
    closeDialog(next || (wallEmpty.hidden ? wallTitle : wallStageBtn));
    announceScene("Removed from your wall.");
});

// "Practice this topic again": never throws away an unsent take or a picked file without asking
pbPracticeBtn.addEventListener("click", () => {
    const takeUnsent = currentTake !== null && !currentTake.sent;
    const filePicked = Boolean(fileInput.files[0]);
    if (takeUnsent || filePicked) {
        pbReplaceText.textContent = takeUnsent ? "This replaces your unsent take." : "This replaces your picked file.";
        showPlaybillRow("replace", pbReplaceKeepBtn);
        return;
    }
    practiceOpenEntry();
});
document.getElementById("pbReplaceBtn").addEventListener("click", practiceOpenEntry);
pbReplaceKeepBtn.addEventListener("click", () => showPlaybillRow("buttons", pbPracticeBtn));

// Selects a time limit on the Stage: a preset, untimed, or Custom minutes and seconds
function selectTimeLimit(limit) {
    const seconds = limit ? Math.round(limit) : 0;
    let value = "0";
    if ([60, 180, 300].includes(seconds)) {
        value = String(seconds);
    } else if (seconds >= MIN_TIME_LIMIT_SECONDS && seconds <= MAX_TIME_LIMIT_SECONDS) {
        value = "custom";
        customMinutes.value = String(Math.floor(seconds / 60));
        customSeconds.value = String(seconds % 60);
    }
    timeRadios.forEach(radio => {
        radio.checked = radio.value === value;
    });
    onTimeChange();
}

// Back to the Stage with the entry's topic, type and time limit, and nothing recorded or picked
function practiceOpenEntry() {
    const entry = openEntry;
    if (!entry) return;

    fileInput.value = "";
    showFileName();
    if (recState === "review") discardTake();
    statusText.textContent = "";

    if (entry.topic) {
        topicInput.value = entry.topic.replace(/[\r\n]+/g, " ");
        const type = entry.topic_type;
        randomTopic = type && Object.hasOwn(TOPIC_TYPE_INFO, type) ? { text: topicInput.value, type } : null;
        speakFreely = false;
        if (randomTopic) {
            showTopicBadge(type);
        } else {
            topicBadge.hidden = true;
        }
        topicAnnounce.textContent = topicInput.value;
    } else {
        topicInput.value = "";
        randomTopic = null;
        speakFreely = true;
        topicBadge.hidden = true;
        topicAnnounce.textContent = "No topic. Speak on anything you like.";
    }
    updateTopicPlaceholder();
    selectTimeLimit(entry.time_limit_seconds);
    saveSettings();                     // the remembered choice matches the ticket

    closeDialog(false);
    goToView("stage");
}

// ---- Clear the wall ----
clearWallBtn.addEventListener("click", () => {
    clearTrophiesBox.checked = false;      // trophies are only removed when asked for each time
    openDialog(clearWallDialog, clearWallKeepBtn, clearWallBtn);
});
clearWallKeepBtn.addEventListener("click", () => closeDialog());
document.getElementById("clearWallConfirmBtn").addEventListener("click", () => {
    const alsoTrophies = clearTrophiesBox.checked;
    wallEntries = [];
    writeWall();
    if (alsoTrophies) resetTrophies();
    renderWall();
    closeDialog(wallTitle);
    announceScene(alsoTrophies ? "Your wall, trophies and progress are clear." : "Your wall is clear.");
});

wallStageBtn.addEventListener("click", () => goToView("stage"));

// Another tab changed the wall: show it, unless a dialog is open (it is drawn again when this tab opens the wall)
window.addEventListener("storage", e => {
    if (e.key !== WALL_KEY && e.key !== TROPHY_KEY && e.key !== null) return;
    if (currentView !== "wall" || openOverlay) return;
    loadWall();
    loadTrophies();
    renderWall();
});

// ---------------------------
// Trophies: the shelf on the Wall of Fame
// ---------------------------
// Progress is saved under TROPHY_KEY as { performances, topicTypes, practiceDays, earned }, apart from
// the wall, so removing playbills never lowers it. Only real results count (from pollResult, never
// displayResult() from the console), and each performance only once. Like the wall, what is read back
// is untrusted: cleanProgress() checks every piece, and the shelf only uses textContent.
const TROPHY_GOLD = { fill: "#E3B65A", base: "#9C7232" };
const TROPHY_GREY = { fill: "#6A5A52", base: "#4A3C36" };
const TROPHY_MAX_PERFORMANCES = 1000000;
const TOPIC_TYPE_COUNT = Object.keys(TOPIC_TYPE_INFO).length;

// "rule" is shown under an earned trophy; "progress" (or the rule) under a locked one.
// earnedBy() gets the progress after this performance was added, and the performance itself.
const TROPHIES = [
    { id: "opening-night", name: "Opening night", cup: true, rule: "First performance",
      earnedBy: p => p.performances >= 1, progress: () => null },
    { id: "five-shows", name: "Five shows", cup: true, rule: "5 performances",
      earnedBy: p => p.performances >= 5, progress: p => `${Math.min(p.performances, 5)} of 5` },
    { id: "ten-shows", name: "Ten shows", cup: true, rule: "10 performances",
      earnedBy: p => p.performances >= 10, progress: p => `${Math.min(p.performances, 10)} of 10` },
    // A recording stopped by the 10:00 maximum never counts as "on cue"
    { id: "right-on-cue", name: "Right on cue", cup: false, rule: "Within 10 seconds of the limit",
      earnedBy: (p, perf) => perf.limit !== null && perf.limit > 0 && perf.speaking !== null && !perf.cutOff
          && Math.abs(perf.speaking - perf.limit) <= 10,
      progress: () => null },
    // At least 60 words per minute too, so a long silence with a couple of words can't earn it
    { id: "clean-delivery", name: "Clean delivery", cup: false, rule: "1 min+ of speech, 2 fillers or fewer",
      earnedBy: (p, perf) => perf.speaking !== null && perf.speaking >= 60 && perf.wpm !== null && perf.wpm >= 60
          && perf.fillers !== null && perf.fillers <= 2,
      progress: () => null },
    { id: "full-repertoire", name: "Full repertoire", cup: false, rule: `All ${TOPIC_TYPE_COUNT} topic types`,
      earnedBy: p => p.topicTypes.length >= TOPIC_TYPE_COUNT, progress: p => `${p.topicTypes.length} of ${TOPIC_TYPE_COUNT} types` },
    { id: "long-run", name: "Long run", cup: false, rule: "Speak 5 minutes or more",
      earnedBy: (p, perf) => perf.speaking !== null && perf.speaking >= 300, progress: () => null },
    { id: "three-night-run", name: "Three-night run", cup: true, rule: "3 days in a row",
      earnedBy: p => longestRun(p.practiceDays) >= 3, progress: p => `${Math.min(currentRun(p.practiceDays), 3)} of 3 days` }
];

let trophyProgress = emptyProgress();
let trophySavingWorks = true;  // false once reading or writing storage fails (blocked or full)

function emptyProgress() {
    return { performances: 0, topicTypes: [], practiceDays: [], earned: {} };
}

// Local calendar days as "2026-10-14"
function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function isRealDay(key) {
    return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key) && dayKey(dayFromKey(key)) === key;
}

function nextDayKey(key) {
    const date = dayFromKey(key);
    date.setDate(date.getDate() + 1);
    return dayKey(date);
}

// The most days in a row anywhere in the (sorted) list
function longestRun(days) {
    let best = 0;
    let run = 0;
    days.forEach((day, i) => {
        run = i > 0 && nextDayKey(days[i - 1]) === day ? run + 1 : 1;
        best = Math.max(best, run);
    });
    return best;
}

// The streak still going: days in a row ending today or yesterday (0 if it has lapsed)
function currentRun(days) {
    if (days.length === 0) return 0;
    const today = dayKey(new Date());
    const last = days[days.length - 1];
    if (last !== today && nextDayKey(last) !== today) return 0;
    let run = 1;
    for (let i = days.length - 1; i > 0 && nextDayKey(days[i - 1]) === days[i]; i--) run++;
    return run;
}

// Keeps only well-formed pieces of saved progress; anything else starts from empty
function cleanProgress(raw) {
    const progress = emptyProgress();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return progress;
    if (Number.isInteger(raw.performances) && raw.performances >= 0 && raw.performances <= TROPHY_MAX_PERFORMANCES) {
        progress.performances = raw.performances;
    }
    if (Array.isArray(raw.topicTypes)) {
        progress.topicTypes = [...new Set(raw.topicTypes.filter(type => typeof type === "string" && Object.hasOwn(TOPIC_TYPE_INFO, type)))];
    }
    if (Array.isArray(raw.practiceDays)) {
        progress.practiceDays = [...new Set(raw.practiceDays.filter(isRealDay))].sort().slice(-TROPHY_MAX_DAYS);
    }
    if (raw.earned && typeof raw.earned === "object" && !Array.isArray(raw.earned)) {
        TROPHIES.forEach(trophy => {
            if (!Object.hasOwn(raw.earned, trophy.id)) return;
            const when = raw.earned[trophy.id];
            if (typeof when === "string" && when.length <= 40 && Number.isFinite(Date.parse(when))) {
                progress.earned[trophy.id] = new Date(Date.parse(when)).toISOString();
            }
        });
    }
    return progress;
}

// Once saving has failed, the progress in memory is kept instead (as with the wall)
function loadTrophies() {
    if (!trophySavingWorks) return;
    let saved;
    try {
        saved = localStorage.getItem(TROPHY_KEY);
    } catch (err) {
        trophySavingWorks = false;
        return;
    }
    let raw = null;
    if (saved) {
        try {
            raw = JSON.parse(saved);
        } catch (err) {
            raw = null;
        }
    }
    trophyProgress = cleanProgress(raw);
}

function writeTrophies() {
    try {
        localStorage.setItem(TROPHY_KEY, JSON.stringify(trophyProgress));
        trophySavingWorks = true;
    } catch (err) {
        trophySavingWorks = false;
    }
}

// What the rules need from a result or a wall entry (both use the same field names). Times and fillers
// always come from the result, never from the page's own stopwatch.
function trophyPerformance(source) {
    const number = (value, max) => {
        const parsed = wallNumber(value, 0, max);
        return parsed === WALL_BAD ? null : parsed;
    };
    return {
        topicType: typeof source.topic_type === "string" && Object.hasOwn(TOPIC_TYPE_INFO, source.topic_type) ? source.topic_type : null,
        limit: number(source.time_limit_seconds, WALL_MAX_SECONDS),
        speaking: number(source.speaking_seconds, WALL_MAX_SECONDS),
        fillers: number(source.filler_word_total, 100000),
        wpm: number(source.wpm, 10000),
        cutOff: source.cut_off === true
    };
}

// Adds one performance at the time "when" and marks every trophy it newly earns. Returns those trophies.
function applyPerformance(progress, perf, when) {
    progress.performances = Math.min(progress.performances + 1, TROPHY_MAX_PERFORMANCES);
    if (perf.topicType && !progress.topicTypes.includes(perf.topicType)) progress.topicTypes.push(perf.topicType);
    const day = dayKey(when);
    if (!progress.practiceDays.includes(day)) {
        progress.practiceDays = [...progress.practiceDays, day].sort().slice(-TROPHY_MAX_DAYS);
    }
    const unlocked = [];
    TROPHIES.forEach(trophy => {
        if (!progress.earned[trophy.id] && trophy.earnedBy(progress, perf)) {
            progress.earned[trophy.id] = when.toISOString();
            unlocked.push(trophy);
        }
    });
    return unlocked;
}

// A new real result: count it and return the trophies it unlocked. Never throws.
function recordTrophies(result) {
    try {
        loadTrophies();
        const unlocked = applyPerformance(trophyProgress, trophyPerformance(result), new Date());
        writeTrophies();
        return unlocked;
    } catch (err) {
        console.error(err);
        return [];
    }
}

function resetTrophies() {
    trophyProgress = emptyProgress();
    writeTrophies();           // an empty record (not a missing one), so the catch-up below never runs again
}

// One time only: the wall existed before trophies did (part 1), so the first time the page finds wall
// entries but no trophy record, the progress is built from those entries, at the times they were saved.
// No banner for these.
function initTrophies() {
    try {
        let saved;
        try {
            saved = localStorage.getItem(TROPHY_KEY);
        } catch (err) {
            trophySavingWorks = false;
            return;
        }
        if (saved !== null) {
            loadTrophies();
            return;
        }
        loadWall();
        if (wallEntries.length === 0) return;   // the record is written with the first performance
        const progress = emptyProgress();
        wallEntries.slice().reverse().forEach(entry => {
            if (entry.too_short === true) return;          // too-short speeches earn no trophies
            applyPerformance(progress, trophyPerformance(entry), new Date(entry.savedAt));
        });
        trophyProgress = progress;
        writeTrophies();
    } catch (err) {
        console.error(err);
    }
}

// ---- The shelf ----
const SVG_NS = "http://www.w3.org/2000/svg";
const trophyButtons = new Map();
let openTrophyId = null;

function svgPart(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
}

// The cup or the medal from the design, in gold or grey
function trophyIcon(cup, colors) {
    const svg = svgPart("svg", { class: "trophy-icon", viewBox: "0 0 64 64", "aria-hidden": "true", focusable: "false" });
    if (cup) {
        svg.append(
            svgPart("path", { d: "M20 8h24v14a12 12 0 0 1-24 0z", fill: colors.fill }),
            svgPart("path", { d: "M20 12h-7a7 7 0 0 0 9 10M44 12h7a7 7 0 0 1-9 10", fill: "none", stroke: colors.fill, "stroke-width": "3" }),
            svgPart("rect", { x: "29", y: "33", width: "6", height: "11", fill: colors.fill }),
            svgPart("rect", { x: "21", y: "44", width: "22", height: "6", rx: "2", fill: colors.fill }),
            svgPart("rect", { x: "17", y: "50", width: "30", height: "8", rx: "2", fill: colors.base })
        );
    } else {
        svg.append(
            svgPart("path", { d: "M22 2h8l6 18h-8zM42 2h-8l-6 18h8z", fill: "#8C1426" }),
            svgPart("circle", { cx: "32", cy: "40", r: "17", fill: colors.fill }),
            svgPart("circle", { cx: "32", cy: "40", r: "12", fill: "none", stroke: colors.base, "stroke-width": "2" }),
            svgPart("path", { d: "M32 32l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z", fill: colors.base })
        );
    }
    return svg;
}

// "October 14" (with the year when it isn't this year)
function trophyDate(iso) {
    const date = new Date(iso);
    const options = { month: "long", day: "numeric" };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
    return date.toLocaleDateString("en-US", options);
}

function trophyState(trophy) {
    const earnedAt = trophyProgress.earned[trophy.id] || null;
    const progress = earnedAt ? null : trophy.progress(trophyProgress);
    return { earnedAt, progress, line: earnedAt ? trophy.rule : (progress || trophy.rule) };
}

function renderShelf() {
    closeTrophyPopover(false);
    const earnedCount = TROPHIES.filter(trophy => trophyProgress.earned[trophy.id]).length;
    shelfTitle.textContent = `Trophy shelf, ${earnedCount} of ${TROPHIES.length} earned`;
    shelfList.replaceChildren();
    trophyButtons.clear();

    TROPHIES.forEach(trophy => {
        const { earnedAt, progress, line } = trophyState(trophy);
        const item = document.createElement("li");
        item.className = "trophy";

        const button = document.createElement("button");
        button.type = "button";
        button.className = earnedAt ? "trophy-btn" : "trophy-btn is-locked";
        button.setAttribute("aria-label", earnedAt
            ? `${trophy.name}, earned ${trophyDate(earnedAt)}`
            : `${trophy.name}, not earned yet, ${line}`);
        button.append(trophyIcon(trophy.cup, earnedAt ? TROPHY_GOLD : TROPHY_GREY),
            makeSpan("trophy-name", trophy.name), makeSpan("trophy-line", line));
        item.append(button);

        // The rule is also read out when the name doesn't already say it
        if (earnedAt || progress) {
            const rule = makeSpan("", trophy.rule);
            rule.id = `trophyRule-${trophy.id}`;
            rule.hidden = true;
            button.setAttribute("aria-describedby", rule.id);
            item.append(rule);
        }

        // A tap or click toggles it. Enter or Space (detail 0) only opens it, since focus already did.
        button.addEventListener("click", e => {
            if (openTrophyId === trophy.id && e.detail !== 0) {
                closeTrophyPopover(false);
            } else {
                openTrophyPopover(trophy.id);
            }
        });
        // Keyboard focus opens it too (a tap is handled by the click above)
        button.addEventListener("focus", () => {
            if (button.matches(":focus-visible")) openTrophyPopover(trophy.id);
        });
        shelfList.append(item);
        trophyButtons.set(trophy.id, button);
    });
}

// ---- The small card under a trophy ----
function openTrophyPopover(id) {
    const trophy = TROPHIES.find(item => item.id === id);
    const button = trophyButtons.get(id);
    if (!trophy || !button) return;
    const { earnedAt, progress } = trophyState(trophy);
    document.getElementById("trophyPopName").textContent = trophy.name;
    document.getElementById("trophyPopRule").textContent = trophy.rule;
    const state = document.getElementById("trophyPopState");
    state.textContent = earnedAt ? `Earned on ${trophyDate(earnedAt)}` : (progress ? `So far: ${progress}` : "Not earned yet");
    state.classList.toggle("is-earned", Boolean(earnedAt));
    trophyPopover.hidden = false;
    openTrophyId = id;

    // Under the trophy, but never past the edges of the window
    const shelf = trophyPopover.parentElement.getBoundingClientRect();
    const spot = button.getBoundingClientRect();
    const width = trophyPopover.offsetWidth;
    const margin = 8;
    const left = Math.max(margin, Math.min(spot.left + spot.width / 2 - width / 2, window.innerWidth - margin - width));
    trophyPopover.style.left = `${left - shelf.left}px`;
    trophyPopover.style.top = `${spot.bottom - shelf.top + 8}px`;
}

// Escape puts focus back on the trophy (refocus true)
function closeTrophyPopover(refocus) {
    if (!openTrophyId) return;
    const button = trophyButtons.get(openTrophyId);
    trophyPopover.hidden = true;
    openTrophyId = null;
    if (refocus && button) button.focus();
}

// A tap or click anywhere else closes it
document.addEventListener("pointerdown", e => {
    if (openTrophyId && !e.target.closest(".trophy-btn") && !trophyPopover.contains(e.target)) closeTrophyPopover(false);
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape" && openTrophyId && !openOverlay) closeTrophyPopover(true);
});

// Tabbing away from the trophies closes it as well
shelfList.addEventListener("focusout", e => {
    if (!e.relatedTarget || !shelfList.contains(e.relatedTarget)) closeTrophyPopover(false);
});

window.addEventListener("resize", () => closeTrophyPopover(false));

// ---- "Trophy unlocked" on Backstage ----
let trophyAnnounceTimer = null;

// Shows the banner above Coach's notes for the trophies this result unlocked (hidden when there are none).
// It is announced once, a moment after "Your coach's notes are ready.", once the curtains are open.
function showTrophyBanner(unlocked) {
    try {
        hideTrophyBanner();
        if (!unlocked || unlocked.length === 0) return;
        const text = `${unlocked.length === 1 ? "Trophy" : "Trophies"} unlocked: ${unlocked.map(trophy => trophy.name).join(", ")}`;
        trophyBannerText.textContent = text;
        trophyBanner.hidden = false;
        queueScene(() => {
            clearTimeout(trophyAnnounceTimer);
            trophyAnnounceTimer = setTimeout(() => {
                if (!trophyBanner.hidden) announceScene(`${text}.`);
            }, 1500);
        });
    } catch (err) {
        console.error(err);
    }
}

function hideTrophyBanner() {
    clearTimeout(trophyAnnounceTimer);
    trophyBanner.hidden = true;
}

document.getElementById("trophyBannerBtn").addEventListener("click", () => goToView("wall"));

// The banner goes away when another performance starts (recording or sending)
[micBtn, reRecordBtn, uploadBtn, takeSendBtn].forEach(button => button.addEventListener("click", hideTrophyBanner));

initTrophies();

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
let micHeard = false;          // true once anything louder than near-silence was recorded in this take
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
    if (locked) closeSettings(false);
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

prepRadios.forEach(radio => radio.addEventListener("change", () => {
    updateActionText();
    updateTickets();
    saveSettings();
}));

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
    micHeard = false;
    micCheck.hidden = true;
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
        const pcm = toPcm16(samples, count);
        recChunks.push(pcm);
        recCount += count;
        if (!micHeard && frameIsLoud(pcm, 0, pcm.length)) {
            micHeard = true;
            micCheck.hidden = true;          // sound is coming through
        }
    }
    // Nothing heard in the first seconds of the take: a small hint near the timer, until sound comes through
    if (!micHeard && micCheck.hidden && recCount >= MIC_CHECK_SECONDS * REC_SAMPLE_RATE) {
        micCheck.hidden = false;
        announceScene(micCheck.textContent);
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
    micCheck.hidden = true;

    setTake(buildWav(chunks, count), count / REC_SAMPLE_RATE, chunks);
    // Almost all silence: a warning, with both choices kept (send anyway, or record again)
    setTakeSilence(currentTake.seconds >= MIN_TAKE_SECONDS && isAlmostSilent(chunks));

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
    micCheck.hidden = true;
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

// Turns float samples (-1 to 1) into 16-bit whole numbers: clipped to the allowed range, then scaled
// to -32768 to 32767. Used by the live recorder and by converted uploads.
function toPcm16(samples, count) {
    const pcm = new Int16Array(count);
    for (let i = 0; i < count; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
    }
    return pcm;
}

// ---- Silence ----
// True when the 16-bit samples from..to are louder (RMS) than near-silence
function frameIsLoud(pcm, from, to) {
    if (to <= from) return false;
    let sum = 0;
    for (let i = from; i < to; i++) sum += pcm[i] * pcm[i];
    return Math.sqrt(sum / (to - from)) >= SILENCE_LEVEL;
}

// True when ALMOST_SILENT_SHARE or more of the 50 ms stretches are near-silence
function isAlmostSilent(chunks) {
    const frame = Math.round(SILENCE_FRAME_SECONDS * REC_SAMPLE_RATE);
    let frames = 0;
    let quiet = 0;
    let sum = 0;
    let filled = 0;
    const endFrame = () => {
        frames++;
        if (Math.sqrt(sum / filled) < SILENCE_LEVEL) quiet++;
        sum = 0;
        filled = 0;
    };
    for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
            sum += chunk[i] * chunk[i];
            if (++filled === frame) endFrame();
        }
    }
    if (filled > 0) endFrame();
    return frames > 0 && quiet / frames >= ALMOST_SILENT_SHARE;
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
function setTake(blob, seconds, chunks) {
    clearTake();
    currentTake = { blob, seconds, url: URL.createObjectURL(blob), sent: false, source: "recording" };
    takePlayer.load(currentTake.url);
    takePlayer.setPeaks(chunks ? peaksFromChunks(chunks) : null);    // the waveform, from the recorded samples
    renderLengthLine();
}

// Throws the take away and frees its memory
function clearTake() {
    takePlayer.clear();
    if (currentTake) URL.revokeObjectURL(currentTake.url);
    currentTake = null;
    takeNote.hidden = true;
    takeNote.textContent = "";
    setTakeSilence(false);
    renderLengthLine();
}

// The "almost silent" warning in Review: the Send button then reads "Send anyway", Re-record stays
function setTakeSilence(on) {
    takeSilence.hidden = !on;
    takeSendBtn.textContent = on ? "Send anyway" : "Send to the coach";
}

function discardTake() {
    clearTake();
    setRecState("idle");
}

function markTakeSent(take) {
    take.sent = true;
    updateLeaveWarning();
}

// ---- Players: listen to a take or a converted file, and move through it ----
// One player setup used twice. The position is shown as the recording's waveform (like a voice note):
// click, tap or drag anywhere on it to move there. An invisible slider lies on top of it for keyboards and
// screen readers: its arrow keys jump 5 seconds (Home and End go to the start and end). Back and Forward
// also jump 5 seconds.
const SKIP_SECONDS = 5;
const PEAK_BINS = 800;               // fine-grained loudness values kept per recording, drawn as fewer bars
const WAVE_BARS_LAPTOP = 64;
const WAVE_BARS_PHONE = 40;
const WAVE_MIN_SLOT_PX = 3.5;          // narrowest space per bar that still leaves a visible gap
const TOUCH_SLOP_PX = 8;             // a finger must move this far before it counts as a drag
const WAVE_PLAYED = "#D9AE52";
const WAVE_REST = "rgba(246, 234, 211, 0.28)";
const WAVE_PLAYHEAD = "#F0CF86";

// Scales loudness values so the loudest one is full height. Near silence stays as it is (a flat line).
function normalizePeaks(peaks) {
    let loudest = 0;
    for (let i = 0; i < peaks.length; i++) loudest = Math.max(loudest, peaks[i]);
    if (loudest < 0.01) return peaks;
    for (let i = 0; i < peaks.length; i++) peaks[i] /= loudest;
    return peaks;
}

// The loudest sample in each of PEAK_BINS slices of a take (its 16-bit chunks)
function peaksFromChunks(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const peaks = new Float32Array(PEAK_BINS);
    if (total === 0) return peaks;
    let position = 0;
    for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++, position++) {
            const bin = Math.floor(position * PEAK_BINS / total);
            const level = Math.abs(chunk[i]) / 32768;
            if (level > peaks[bin]) peaks[bin] = level;
        }
    }
    return normalizePeaks(peaks);
}

// Phones and low-memory devices: smaller upload files (decoding needs memory)
function isLowMemoryDevice() {
    return window.matchMedia("(pointer: coarse)").matches
        || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 4);
}

function setupPlayer({ audio, playBtn, backBtn, fwdBtn, seek, time, name, getDuration, ownsUrl }) {
    let url = null;
    let dragging = false;
    let peaks = null;              // null: a flat line
    let plain = false;             // true: the plain slider look (no waveform available)
    let shownShare = 0;            // how much has played, from 0 to 1
    let pointer = null;            // the press currently on the waveform
    const waveBox = seek.closest(".wave-seek");
    const canvas = waveBox.querySelector(".wave-canvas");

    const duration = () => {
        const seconds = getDuration();
        return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    };

    // Draws the waveform: bars from the loudness values, gold up to the playhead, muted after it
    function draw() {
        if (plain) return;
        const width = waveBox.clientWidth;
        const height = waveBox.clientHeight;
        if (width === 0 || height === 0) return;            // hidden: drawn when it appears
        const ratio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // About 64 bars on laptop and 40 on phones, fewer only if the box is too narrow for clear gaps
        const target = window.matchMedia("(max-width: 600px)").matches ? WAVE_BARS_PHONE : WAVE_BARS_LAPTOP;
        const bars = Math.max(1, Math.min(target, Math.floor(width / WAVE_MIN_SLOT_PX)));
        const slot = width / bars;
        const barWidth = Math.max(2, slot * 0.55);
        const playX = shownShare * width;
        for (let i = 0; i < bars; i++) {
            let level = 0;
            if (peaks) {
                const from = Math.floor(i * peaks.length / bars);
                const to = Math.max(from + 1, Math.floor((i + 1) * peaks.length / bars));
                for (let j = from; j < to; j++) level = Math.max(level, peaks[j]);
            }
            const barHeight = Math.max(2, level * (height - 4));      // silence: a flat line
            ctx.fillStyle = (i + 0.5) * slot <= playX ? WAVE_PLAYED : WAVE_REST;
            // Whole device pixels keep the bars crisp, with a clean gap between them
            const left = Math.round((i * slot + (slot - barWidth) / 2) * ratio) / ratio;
            const top = Math.round(((height - barHeight) / 2) * ratio) / ratio;
            ctx.fillRect(left, top, Math.max(1, Math.round(barWidth * ratio)) / ratio, Math.max(1, Math.round(barHeight * ratio)) / ratio);
        }
        // A thin playhead at the current position
        ctx.fillStyle = WAVE_PLAYHEAD;
        ctx.fillRect(Math.round(Math.min(Math.max(playX - 1, 0), width - 2) * ratio) / ratio, 0, 2, height);
    }

    new ResizeObserver(draw).observe(waveBox);

    // Moves the slider, the waveform and the "0:42 / 2:14" text to a position
    function show(position) {
        const total = duration();
        const at = Math.min(Math.max(0, position), total);
        seek.max = String(total);
        seek.value = String(at);
        seek.style.setProperty("--pos", total > 0 ? `${(at / total) * 100}%` : "0%");
        time.textContent = `${formatTime(Math.floor(at))} / ${formatTime(total)}`;
        seek.setAttribute("aria-valuetext", `${formatTime(Math.floor(at))} of ${formatTime(total)}`);
        shownShare = total > 0 ? at / total : 0;
        draw();
    }

    function seekTo(position) {
        const at = Math.min(Math.max(0, position), duration());
        if (url) audio.currentTime = at;
        show(at);
    }

    // Seeks to the point under the pointer
    function seekAt(clientX) {
        const box = waveBox.getBoundingClientRect();
        const share = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
        seekTo(share * duration());
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

    // Pointer on the waveform. A mouse or pen seeks as soon as it presses and follows while dragging.
    // A finger only seeks on a tap, or once it clearly moves sideways: a mostly up-and-down swipe
    // scrolls the page (the browser takes it over) and never changes the position.
    function endPointer() {
        pointer = null;
        dragging = false;
    }

    waveBox.addEventListener("pointerdown", e => {
        if (plain || !url) return;
        if (e.pointerType === "touch") {
            pointer = { id: e.pointerId, touch: true, x0: e.clientX, y0: e.clientY, drag: false };
            return;
        }
        if (e.button !== 0) return;
        pointer = { id: e.pointerId, touch: false, drag: true };
        dragging = true;
        waveBox.setPointerCapture(e.pointerId);
        seekAt(e.clientX);
        e.preventDefault();
    });
    waveBox.addEventListener("pointermove", e => {
        if (!pointer || e.pointerId !== pointer.id) return;
        if (pointer.drag) {
            seekAt(e.clientX);
            return;
        }
        const dx = e.clientX - pointer.x0;
        const dy = e.clientY - pointer.y0;
        if (Math.abs(dx) > TOUCH_SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
            pointer.drag = true;
            dragging = true;
            waveBox.setPointerCapture(e.pointerId);
            seekAt(e.clientX);
        }
    });
    waveBox.addEventListener("pointerup", e => {
        if (!pointer || e.pointerId !== pointer.id) return;
        if (pointer.touch && !pointer.drag
            && Math.hypot(e.clientX - pointer.x0, e.clientY - pointer.y0) < TOUCH_SLOP_PX) {
            seekAt(e.clientX);            // a tap
        }
        endPointer();
    });
    waveBox.addEventListener("pointercancel", endPointer);    // the page scrolled instead

    // The plain slider (when there is no waveform) works by itself; the time text follows while dragging
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

    function setPlain(on) {
        plain = on;
        waveBox.classList.toggle("plain", on);
        draw();
    }

    function clear() {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        if (ownsUrl && url) URL.revokeObjectURL(url);
        url = null;
        peaks = null;
        endPointer();
        setPlain(false);
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
        },
        // Loudness values from 0 to 1 (null draws a flat line)
        setPeaks(values) {
            peaks = values;
            setPlain(false);
        },
        setPlain
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
    name: "your file",
    getDuration: () => (preparedUpload ? preparedUpload.seconds : 0),
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
const STOPWATCH_KEY = "speakreview.stopwatch";

// The stopwatch choice is remembered on this device. Shown unless it was hidden before (or storage is blocked).
function readStopwatchChoice() {
    try {
        return localStorage.getItem(STOPWATCH_KEY) !== "hidden";
    } catch (err) {
        return true;
    }
}

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
    setStopwatchShown(readStopwatchChoice());       // each recording uses the remembered choice
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

// Shows or hides the stopwatch in the live panel. A press on Hide / Show remembers the choice and moves
// focus to the button that replaces the one just pressed.
function setStopwatchShown(on, fromLiveButton = false) {
    stopwatchRow.hidden = !on;
    stopwatchOff.hidden = on;
    if (!fromLiveButton) return;
    try {
        localStorage.setItem(STOPWATCH_KEY, on ? "shown" : "hidden");
    } catch (err) {
        // Storage is blocked: the choice still applies to this recording
    }
    (on ? swHideBtn : swShowBtn).focus();
}

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

// ---------------------------
// Speaking time and Prep time, on the topic ticket's stub
// ---------------------------
// Each stub button (RUNTIME, CURTAIN IN) opens only its own setting: a wooden panel under the ticket on laptops,
// a bottom sheet on phones. The radio buttons inside still hold the values, so everything that reads the settings is unchanged.
// The last choice is remembered under SETTINGS_KEY, for example {"time":"180","prep":"30"}: time in seconds
// ("" for no limit), prep in seconds ("0" for none). It is checked strictly when read back.
const SETTINGS_KEY = "speakreview.settings.v1";
const PREP_CHOICES = ["0", "30", "60", "120"];
let openSetting = null;        // "time" or "prep" while its panel or sheet is open

// For example "No limit", "3 minutes", "2 min 30 sec", "4 minutes" or "45 seconds"
function describeTimeLimit() {
    const { valid, seconds } = getTimeLimit();
    if (!valid) return "Custom";
    if (seconds === null) return "No limit";
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (rest === 0) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
    if (minutes === 0) return `${rest} seconds`;
    return `${minutes} min ${rest} sec`;
}

function describePrepChoice() {
    const prep = getPrepSeconds();
    return prep > 0 ? describePrep(prep) : "None";
}

function ticketFor(which) {
    return which === "prep" ? prepTicket : timeTicket;
}

// Shows the current values on the tickets (with textContent) and keeps their names and states in step
function updateTickets() {
    const action = phoneQuery.matches ? "Tap to change" : "Click to change";
    const time = describeTimeLimit();
    const prep = describePrepChoice();
    timeTicketValue.textContent = time;
    prepTicketValue.textContent = prep;
    timeTicket.setAttribute("aria-label", `Speaking time: ${time}. ${action}`);
    prepTicket.setAttribute("aria-label", `Prep time: ${prep}. ${action}`);
    timeTicket.setAttribute("aria-expanded", String(openSetting === "time"));
    prepTicket.setAttribute("aria-expanded", String(openSetting === "prep"));
    const isCustom = document.querySelector('input[name="timeLimit"]:checked')?.value === "custom";
    settingsPanel.classList.toggle("is-custom", openSetting === "time" && isCustom);
}

// Laptop: the small arrow on the panel points at the middle of the open ticket
function placePanelArrow() {
    if (!openSetting || phoneQuery.matches) return;
    const ticket = ticketFor(openSetting).getBoundingClientRect();
    const panel = settingsPanel.getBoundingClientRect();
    // The arrow is placed from inside the panel's border, so the border width (clientLeft) is taken off
    settingsPanel.style.setProperty("--arrow-x", `${Math.round(ticket.left + ticket.width / 2 - panel.left - settingsPanel.clientLeft)}px`);
}

function openSettings(which) {
    const phone = phoneQuery.matches;
    setPrivacyOpen(false);
    openSetting = which;
    const page = which === "prep" ? prepPage : timePage;
    timePage.hidden = which !== "time";
    prepPage.hidden = which !== "prep";
    settingsPanel.setAttribute("aria-labelledby", which === "prep" ? "prepTimeLabel" : "speakingTimeLabel");
    settingsPanel.hidden = false;
    stageView.classList.add("settings-open");
    if (phone) {
        // A modal sheet: the stage behind is dimmed and doesn't scroll
        settingsPanel.setAttribute("aria-modal", "true");
        settingsBackdrop.hidden = false;
        document.documentElement.classList.add("settings-lock");
    } else {
        settingsPanel.removeAttribute("aria-modal");
        settingsBackdrop.hidden = true;
        document.documentElement.classList.remove("settings-lock");
    }
    updateTickets();
    placePanelArrow();
    // On short laptop windows the panel can open below the fold or under the bottom bar: bring it into view
    // (only as far as needed; its scroll-margin keeps it clear of the bar)
    if (!phone) settingsPanel.scrollIntoView({ block: "nearest" });
    const checked = page.querySelector("input:checked");
    if (checked) checked.focus({ preventScroll: true });
}

// returnFocus: put focus back on the ticket that opened it
function closeSettings(returnFocus) {
    if (!openSetting) return;
    const ticket = ticketFor(openSetting);
    openSetting = null;
    settingsPanel.hidden = true;
    settingsBackdrop.hidden = true;
    settingsPanel.removeAttribute("aria-modal");
    stageView.classList.remove("settings-open");
    document.documentElement.classList.remove("settings-lock");
    updateTickets();
    if (returnFocus && !ticket.disabled) ticket.focus({ preventScroll: true });
}

// After a pick: closes once the radio has been checked, then focus goes back to the ticket
function closeAfterPick() {
    setTimeout(() => closeSettings(true), 0);
}

[timeTicket, prepTicket].forEach(ticket => {
    ticket.addEventListener("click", () => {
        const which = ticket === prepTicket ? "prep" : "time";
        if (openSetting === which) {
            closeSettings(true);
        } else {
            openSettings(which);        // the other ticket switches the panel to its setting
        }
    });
});

// A mouse click or a tap on a choice picks it and closes the panel (Custom stays open for its controls).
// Arrow keys move through a radio group by checking each choice on the way, so they only change the
// choice (the ticket follows) and never close the panel. Enter or Space picks the focused choice and closes.
settingsPanel.querySelectorAll(".choice-group").forEach(group => {
    group.addEventListener("click", e => {
        if (e.detail === 0) return;            // a click made by the keyboard, or passed on from a label
        const input = e.target.closest(".choice")?.querySelector("input");
        if (!input || input.disabled) return;
        if (input.value !== "custom") closeAfterPick();
    });

    group.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.target.type !== "radio") return;
        e.preventDefault();
        if (!e.target.checked) {
            e.target.checked = true;
            e.target.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (e.target.value === "custom") {
            customMinutes.focus();
        } else {
            closeAfterPick();
        }
    });

    // Space checks the radio when the key comes back up, so close after that
    group.addEventListener("keyup", e => {
        if (e.key !== " " || e.target.type !== "radio") return;
        if (e.target.value === "custom") {
            setTimeout(() => customMinutes.focus(), 0);
        } else {
            closeAfterPick();
        }
    });
});

// Done: closes, unless the custom time isn't valid yet (then the message shows and Minutes gets focus)
settingsDoneBtn.addEventListener("click", () => {
    if (!getTimeLimit().valid) {
        onTimeChange();
        customMinutes.focus();
        return;
    }
    closeSettings(true);
});

// The phone backdrop closes the sheet. preventDefault stops the tap's mouse events from moving focus away.
settingsBackdrop.addEventListener("pointerdown", e => {
    e.preventDefault();
    closeSettings(true);
});

// A click or tap anywhere outside the stub buttons and the panel closes it. If that click doesn't land on
// something focusable, focus goes back to the ticket.
document.addEventListener("pointerdown", e => {
    if (!openSetting || e.target === settingsBackdrop) return;
    if (settingsPanel.contains(e.target) || e.target.closest(".stub-btn")) return;
    const ticket = ticketFor(openSetting);
    closeSettings(false);
    setTimeout(() => {
        const active = document.activeElement;
        if ((!active || active === document.body) && !ticket.disabled && !appRoot.inert) ticket.focus({ preventScroll: true });
    }, 0);
});

// Laptop: tabbing away from the stub buttons and the panel closes it
function leftSettings(e) {
    if (!openSetting || phoneQuery.matches || !e.relatedTarget) return;
    if (!settingsStrip.contains(e.relatedTarget) && !e.relatedTarget.closest(".stub-btn")) closeSettings(false);
}
settingsStrip.addEventListener("focusout", leftSettings);
[timeTicket, prepTicket].forEach(button => button.addEventListener("focusout", leftSettings));

// Escape closes it. On phones Tab stays inside the sheet.
document.addEventListener("keydown", e => {
    if (!openSetting || openOverlay) return;
    if (e.key === "Escape") {
        e.preventDefault();
        closeSettings(true);
    } else if (e.key === "Tab" && phoneQuery.matches) {
        // Only the checked radio of a group is a Tab stop
        const items = dialogFocusables(settingsPanel).filter(element => element.type !== "radio" || element.checked);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const inside = settingsPanel.contains(document.activeElement);
        if (e.shiftKey && (!inside || document.activeElement === first)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
            e.preventDefault();
            first.focus();
        }
    }
});

// Switching between the laptop and phone layouts closes it; "Click" becomes "Tap" in the tickets' names
phoneQuery.addEventListener("change", () => {
    closeSettings(false);
    updateTickets();
});
window.addEventListener("resize", placePanelArrow);

// ---- Remembering the choice on this device ----
// An unfinished custom time is not saved. If storage is blocked, everything still works; the choice just
// isn't remembered.
function saveSettings() {
    const { valid, seconds } = getTimeLimit();
    if (!valid) return;
    const data = { time: seconds === null ? "" : String(seconds), prep: String(getPrepSeconds()) };
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (err) {
        // Storage is blocked or full: the choice still applies, it just isn't remembered
    }
}

timeRadios.forEach(radio => radio.addEventListener("change", saveSettings));
customMinutes.addEventListener("input", saveSettings);
customSeconds.addEventListener("input", saveSettings);
stepperButtons.forEach(button => button.addEventListener("click", saveSettings));

// Reads the saved choice. Stored data is untrusted: each value must be exactly one the page can make,
// anything else falls back to the default (No limit, None). Returns { time, prep }, null for each bad value.
function readSavedSettings() {
    let text = null;
    try {
        text = localStorage.getItem(SETTINGS_KEY);
    } catch (err) {
        return { time: null, prep: null };
    }
    let data = null;
    try {
        data = text === null ? null : JSON.parse(text);
    } catch (err) {
        data = null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { time: null, prep: null };

    const seconds = Number(data.time);
    const timeOk = typeof data.time === "string"
        && (data.time === "" || (/^[1-9]\d{1,2}$/.test(data.time) && seconds >= MIN_TIME_LIMIT_SECONDS && seconds <= MAX_TIME_LIMIT_SECONDS));
    const prepOk = typeof data.prep === "string" && PREP_CHOICES.includes(data.prep);
    return { time: timeOk ? data.time : null, prep: prepOk ? data.prep : null };
}

// 60, 180 and 300 select their own radio; any other valid time selects Custom with the minutes and seconds
function loadSettings() {
    const saved = readSavedSettings();
    if (saved.time !== null) selectTimeLimit(saved.time === "" ? 0 : Number(saved.time));
    if (saved.prep !== null && micSupported) {
        prepRadios.forEach(radio => {
            radio.checked = radio.value === saved.prep;
        });
    }
    updateActionText();
    updateTickets();
}

// Browsers that can't record keep the upload-first layout
if (micSupported) {
    updateActionText();
} else {
    stageView.classList.add("no-mic");
    prepSetting.hidden = true;
    stepSpeakTitle.textContent = "Your turn on stage";
    actionText.textContent = `Upload a recording of your speech (audio or video). Up to ${MAX_DURATION_MINUTES} minutes.`;
    uploadLabel.textContent = "Upload a recording";
}
updateTakeButtons();
loadSettings();
