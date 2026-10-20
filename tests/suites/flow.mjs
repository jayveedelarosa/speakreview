import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { SHOTS, LIVE } from "../lib/paths.mjs";
const URL_ = LIVE;
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const only = process.argv[2];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

// Records mic streams and audio contexts, state changes, announcements and status messages
const HOOKS = `(() => {
  window.__streams = []; window.__contexts = []; window.__states = []; window.__announce = []; window.__status = [];
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => {
    window.__gumConstraints = c;
    if (window.__gumError) throw new DOMException("stubbed", window.__gumError);
    const s = await gum(c); window.__streams.push(s); return s;
  };
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(o) { super(o); window.__contexts.push(this); } };
  document.addEventListener("DOMContentLoaded", () => {
    const stage = document.getElementById("stageView");
    new MutationObserver(() => window.__states.push([stage.dataset.rec, performance.now()])).observe(stage, { attributes: true, attributeFilter: ["data-rec"] });
    const sa = document.getElementById("sceneAnnounce");
    new MutationObserver(() => { if (sa.textContent) window.__announce.push(sa.textContent); }).observe(sa, { childList: true, characterData: true, subtree: true });
    const st = document.getElementById("status");
    new MutationObserver(() => window.__status.push(st.textContent)).observe(st, { childList: true, characterData: true, subtree: true });
  });
})();`;

const LEAVE = `(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()`;
const RELEASED = `window.__streams.every(s => s.getTracks().every(t => t.readyState === "ended")) && window.__contexts.every(c => c.state === "closed")`;

async function page(opts = {}, pre = [], first = []) {
  const b = await launch({ width: 1280, height: 800, flags: FAKE, ...opts });
  await b.goto(URL_, [...first, API_STUB, HOOKS, ...pre]);
  b.waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await b.evaluate(expr).catch(() => false)) return true;
      await sleep(100);
    }
    return false;
  };
  return b;
}

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { failures++; console.log("FAIL  threw: " + e.message); }
}

// ---------------------------------------------------------------
await test("full flow with 30 s prep", async () => {
  const b = await page();
  await b.evaluate("document.querySelector('input[name=prepTime][value=\"30\"]').click()");
  check("action text mentions prep", (await b.evaluate("actionText.textContent")) === "Tap the mic to begin. You get 30 seconds to prepare, then recording starts.");
  check("mic label idle", (await b.evaluate("micBtn.getAttribute('aria-label')")) === "Start recording");
  check("no leave warning when idle", !(await b.evaluate(LEAVE)));
  await b.click("#micBtn");
  check("reaches prep", await b.waitFor("recState === 'prep'"));
  check("constraints: mono + EC/NS/AGC", await b.evaluate("JSON.stringify(window.__gumConstraints.audio) === JSON.stringify({channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true})"));
  check("context at 16 kHz", await b.evaluate("window.__contexts.at(-1).sampleRate === 16000"));
  check("nav locked in prep", await b.evaluate("[...navButtons].every(x => x.disabled)"));
  check("topic + time + prep locked", await b.evaluate("[...optionControls].every(x => x.disabled) && topicInput.disabled"));
  check("file input locked, no drop", await b.evaluate("fileInput.disabled && !canDropFile()"));
  check("leave warning in prep", await b.evaluate(LEAVE));
  check("prep count shows 0:30 or 0:29", /^0:(30|29)$/.test(await b.evaluate("prepCount.textContent")));
  check("ON AIR dark in prep", (await b.evaluate("getComputedStyle(onAir).backgroundColor")) !== "rgb(229, 56, 59)");
  // Let prep run out by itself (30 s), then the 3, 2, 1
  check("countdown after prep ends", await b.waitFor("recState === 'countdown'", 33000));
  check("recording after 3, 2, 1", await b.waitFor("recState === 'recording'", 5000));
  await sleep(500);
  check("ON AIR lit", (await b.evaluate("getComputedStyle(onAir).backgroundColor")) === "rgb(229, 56, 59)");
  check("mic label recording", (await b.evaluate("micBtn.getAttribute('aria-label')")) === "Stop recording");
  check("mic glow red", (await b.evaluate("getComputedStyle(document.querySelector('.mic-glow')).fill")) === "rgba(229, 56, 59, 0.28)");
  await sleep(17000);
  const timing = await b.evaluate(`(() => { const start = window.__states.filter(s => s[0] === 'recording').at(-1)[1]; const now = performance.now(); finishBtn.click(); return { wall: (now - start) / 1000, take: currentTake.seconds, samples: currentTake.seconds * 16000 }; })()`);
  check("take length matches recording time only (no prep or countdown)", Math.abs(timing.take - timing.wall) < 0.3, `take ${timing.take.toFixed(3)} s vs recording ${timing.wall.toFixed(3)} s`);
  check("in review", (await b.evaluate("recState")) === "review");
  check("mic released after stop", await b.waitFor(RELEASED, 2000));
  check("send enabled", !(await b.evaluate("takeSendBtn.disabled")));
  check("length line", /^Length: 0:1[78]$/.test(await b.evaluate("takeLengthLine.textContent")), await b.evaluate("takeLengthLine.textContent"));
  check("no note", await b.evaluate("takeNote.hidden"));
  check("leave warning with unsent take", await b.evaluate(LEAVE));
  check("nav unlocked in review", await b.evaluate("[...navButtons].every(x => !x.disabled)"));
  check("drop blocked in review", !(await b.evaluate("canDropFile()")));
  // Listen back
  await b.click("#takePlayBtn");
  check("plays", await b.waitFor("takePlayBtn.classList.contains('playing') && takeAudio.currentTime > 0.3", 4000));
  check("pause label", (await b.evaluate("takePlayBtn.getAttribute('aria-label')")) === "Pause your take");
  await b.click("#takePlayBtn");
  check("paused", await b.waitFor("takeAudio.paused"));
  check("progress shown", /^0:0\d \/ 0:1\d$/.test(await b.evaluate("takeTime.textContent")), await b.evaluate("takeTime.textContent"));
  // Send
  const samples = await b.evaluate("Math.round(currentTake.seconds * 16000)");
  await b.click("#takeSendBtn");
  check("upload captured", await b.waitFor("window.__captured", 5000));
  const cap = await b.evaluate("window.__captured");
  const calls = await b.evaluate("window.__calls");
  const urlCall = calls.find(c => c.includes("/upload-url"));
  check("upload-url has format=wav", urlCall.includes("format=wav"), urlCall);
  check("file name speech.wav, type audio/wav", cap.name === "speech.wav" && cap.type === "audio/wav");
  check("presigned fields first, file last", cap.fields.at(-1) === "file" && cap.fields[0] === "key");
  const h = Buffer.from(cap.header);
  const str = (o, n) => h.toString("latin1", o, o + n);
  const dataBytes = samples * 2;
  const header = {
    riff: str(0, 4), riffSize: h.readUInt32LE(4), wave: str(8, 4), fmt: str(12, 4), fmtSize: h.readUInt32LE(16),
    pcm: h.readUInt16LE(20), channels: h.readUInt16LE(22), rate: h.readUInt32LE(24), byteRate: h.readUInt32LE(28),
    blockAlign: h.readUInt16LE(32), bits: h.readUInt16LE(34), data: str(36, 4), dataSize: h.readUInt32LE(40)
  };
  console.log("      header bytes:", h.toString("hex").match(/.{1,8}/g).join(" "));
  console.log("      parsed:", JSON.stringify(header), "total", cap.size);
  check("WAV header is correct",
    header.riff === "RIFF" && header.wave === "WAVE" && header.fmt === "fmt " && header.fmtSize === 16 &&
    header.pcm === 1 && header.channels === 1 && header.rate === 16000 && header.byteRate === 32000 &&
    header.blockAlign === 2 && header.bits === 16 && header.data === "data" &&
    header.dataSize === dataBytes && header.riffSize === 36 + dataBytes && cap.size === 44 + dataBytes);
  check("samples are not silent (fake mic tone)", cap.firstSamples.some(v => Math.abs(v) > 200), "max " + Math.max(...cap.firstSamples.map(Math.abs)));
  check("Backstage shown with result", await b.waitFor("currentView === 'backstage' && !resultBox.hidden", 12000));
  check("no leave warning after send", !(await b.evaluate(LEAVE)));
  check("announcements once each", (await b.evaluate("window.__announce")).filter(a => /^Recording/.test(a)).length >= 2, JSON.stringify(await b.evaluate("window.__announce.slice(0, 6)")));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

// ---------------------------------------------------------------
await test("short take, discard, re-record, cancel", async () => {
  const b = await page();
  await b.click("#micBtn");
  check("prep Off goes straight to countdown", await b.waitFor("recState === 'countdown'"));
  check("countdown shows 3", (await b.evaluate("countNum.textContent")) === "3");
  check("mic disabled in countdown", await b.evaluate("micBtn.disabled"));
  check("leave warning in countdown", await b.evaluate(LEAVE));
  await b.waitFor("recState === 'recording'", 5000);
  await sleep(5000);
  await b.click("#micBtn");          // the mic itself stops the recording
  check("mic stops recording", (await b.evaluate("recState")) === "review");
  check("min-length note", (await b.evaluate("takeNote.textContent")) === "Recordings need at least 15 seconds." && !(await b.evaluate("takeNote.hidden")));
  check("send disabled under 15 s", await b.evaluate("takeSendBtn.disabled"));
  check("mic disabled in review", await b.evaluate("micBtn.disabled"));
  const url = await b.evaluate("currentTake.url");
  await b.click("#discardBtn");
  check("discard returns to idle", (await b.evaluate("recState")) === "idle" && !(await b.evaluate("recPanels.idle.hidden")));
  check("upload visible after discard", await b.evaluate("document.querySelector('label.btn-upload').offsetParent !== null && uploadLabel.textContent === 'or upload a recording'"));
  check("take URL revoked", await b.evaluate(`window.__revoked.has(${JSON.stringify(url)})`));
  check("no leave warning after discard", !(await b.evaluate(LEAVE)));
  // Re-record: record, then Re-record goes straight back to countdown, then Cancel
  await b.click("#micBtn");
  await b.waitFor("recState === 'recording'", 6000);
  await sleep(2000);
  await b.click("#finishBtn");
  await b.click("#reRecordBtn");
  check("re-record restarts", await b.waitFor("recState === 'countdown'"));
  check("old take dropped", await b.evaluate("currentTake === null"));
  await b.click("#countCancelBtn");
  check("cancel → idle", (await b.evaluate("recState")) === "idle");
  check("mic released after cancel", await b.waitFor(RELEASED, 2000));
  check("controls unlocked after cancel", await b.evaluate("[...optionControls].every(x => !x.disabled) && [...navButtons].every(x => !x.disabled) && !fileInput.disabled"));
  check("no leave warning after cancel", !(await b.evaluate(LEAVE)));
  // Prep cancel
  await b.evaluate("document.querySelector('input[name=prepTime][value=\"60\"]').click()");
  check("prep 1 minute text", (await b.evaluate("actionText.textContent")).includes("You get 1 minute to prepare"));
  await b.click("#micBtn");
  await b.waitFor("recState === 'prep'");
  check("prep shows 1:00", /^(1:00|0:59)$/.test(await b.evaluate("prepCount.textContent")));
  await b.click("#prepCancelBtn");
  check("prep cancel → idle, released", (await b.evaluate("recState")) === "idle" && await b.waitFor(RELEASED, 2000));
  // Start now
  await b.click("#micBtn");
  await b.waitFor("recState === 'prep'");
  await b.click("#prepStartBtn");
  check("Start now skips prep", (await b.evaluate("recState")) === "countdown");
  await b.click("#countCancelBtn");
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

// ---------------------------------------------------------------
await test("start over while recording", async () => {
  const b = await page();
  await b.click("#micBtn");
  await b.waitFor("recState === 'recording'", 6000);
  await sleep(4000);
  await b.click("#startOverBtn");
  check("start over → countdown (no prep)", (await b.evaluate("recState")) === "countdown" && (await b.evaluate("recCount")) === 0);
  check("mic stays open", await b.evaluate("mic !== null && window.__streams.at(-1).getTracks()[0].readyState === 'live'"));
  await b.waitFor("recState === 'recording'", 5000);
  await sleep(3000);
  const t = await b.evaluate(`(() => { const start = window.__states.filter(s => s[0] === 'recording').at(-1)[1]; const now = performance.now(); finishBtn.click(); return { wall: (now - start) / 1000, take: currentTake.seconds }; })()`);
  check("take only has the second attempt", Math.abs(t.take - t.wall) < 0.3, `take ${t.take.toFixed(2)} vs ${t.wall.toFixed(2)}`);
  await b.close();
});

// ---------------------------------------------------------------
await test("10:00 cap and 9:30 warning", async () => {
  const b = await page();
  await b.click("#micBtn");
  await b.waitFor("recState === 'recording'", 6000);
  // Push synthetic 16 kHz samples (a quiet tone) through the same path the worklet uses
  const res = await b.evaluate(`(() => {
    const chunk = new Float32Array(16000);
    for (let i = 0; i < chunk.length; i++) chunk[i] = 0.25 * Math.sin(2 * Math.PI * 440 * i / 16000);
    let pushes = 0;
    // Up to 9:29 (the real mic adds a little too), then check, then past 9:30
    while (recCount < 569 * 16000) { addSamples(chunk.slice()); pushes++; }
    const before = statusText.textContent;
    while (recCount < 571 * 16000) { addSamples(chunk.slice()); pushes++; }
    const warning = statusText.textContent;
    while (recState === 'recording' && pushes < 700) { addSamples(chunk.slice()); pushes++; }
    return { pushes, before, warning, state: recState, size: currentTake.blob.size, seconds: currentTake.seconds, note: takeNote.textContent };
  })()`);
  check("stops by itself in review", res.state === "review", JSON.stringify(res));
  check("exactly 9,600,000 samples", res.size === 44 + 9600000 * 2 && res.seconds === 600, `size ${res.size}`);
  check("max note", res.note === "Recording stopped at the 10:00 maximum.");
  check("no warning before 9:30", res.before === "");
  check("9:30 warning shown in status", res.warning === "30 seconds left before recording stops.");
  check("warning cleared after stop", (await b.evaluate("statusText.textContent")) === "");
  check("mic released", await b.waitFor(RELEASED, 2000));
  check("send enabled for 10:00 take", !(await b.evaluate("takeSendBtn.disabled")));
  // The WAV header of the big file
  const hdr = await b.evaluate("currentTake.blob.slice(0, 44).arrayBuffer().then(b => Array.from(new Uint8Array(b)))");
  const h = Buffer.from(hdr);
  check("10:00 header sizes", h.readUInt32LE(40) === 19200000 && h.readUInt32LE(4) === 19200036);
  await b.close();
});

// ---------------------------------------------------------------
await test("interruptions", async () => {
  const b = await page();
  await b.click("#micBtn");
  await b.waitFor("recState === 'recording'", 6000);
  await sleep(2000);
  await b.evaluate("window.__streams.at(-1).getAudioTracks()[0].dispatchEvent(new Event('ended'))");
  check("track ended → review", (await b.evaluate("recState")) === "review");
  check("interrupted note", (await b.evaluate("takeNote.textContent")).startsWith("Recording was interrupted. You can listen back, re-record, or use what you have."));
  check("released", await b.waitFor(RELEASED, 2000));
  check("kept what was recorded", (await b.evaluate("currentTake.seconds")) > 1.5);
  await b.click("#discardBtn");
  // Context suspended while recording
  await b.click("#micBtn");
  await b.waitFor("recState === 'recording'", 6000);
  await sleep(1000);
  await b.evaluate("mic.context.suspend()");
  check("context suspended → review", await b.waitFor("recState === 'review'", 3000));
  await b.click("#discardBtn");
  // Interrupted before recording starts → idle with a message
  await b.evaluate("document.querySelector('input[name=prepTime][value=\"30\"]').click()");
  await b.click("#micBtn");
  await b.waitFor("recState === 'prep'");
  await b.evaluate("window.__streams.at(-1).getAudioTracks()[0].dispatchEvent(new Event('ended'))");
  check("interrupt in prep → idle + message", (await b.evaluate("recState")) === "idle" && (await b.evaluate("statusText.textContent")).includes("microphone stopped"));
  await b.close();
  // Hidden page on a touch device
  const p = await page({ width: 390, height: 780, mobile: true });
  await p.click("#micBtn");
  await p.waitFor("recState === 'recording'", 6000);
  await sleep(1500);
  check("touch device detected", await p.evaluate("isTouchDevice()"));
  await p.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))");
  check("hidden on phone → review, interrupted", (await p.evaluate("recState")) === "review" && (await p.evaluate("takeNote.textContent")).startsWith("Recording was interrupted"));
  await p.close();
});

// ---------------------------------------------------------------
await test("mic errors", async () => {
  for (const [name, text] of [
    ["NotFoundError", "No microphone was found."],
    ["NotReadableError", "Your microphone is being used by another app."],
    ["NotAllowedError", "SpeakReview needs microphone access. Allow it in your browser settings, then try again."]
  ]) {
    const b = await page();
    await b.evaluate(`window.__gumError = "${name}"`);
    await b.click("#micBtn");
    check(`${name} message`, await b.waitFor(`statusText.textContent === ${JSON.stringify(text)}`, 3000));
    check(`${name} back to idle, unlocked, released`, (await b.evaluate("recState")) === "idle" && await b.evaluate("[...navButtons].every(x => !x.disabled)") && await b.waitFor("window.__contexts.every(c => c.state === 'closed')", 2000));
    await b.close();
  }
  // Real permission denial from the browser (no fake-UI flag, permission set to denied)
  const b = await launch({ width: 1280, height: 800, flags: ["--use-fake-device-for-media-stream"] });
  await b.send("Browser.setPermission", { permission: { name: "microphone" }, setting: "denied", origin: "http://127.0.0.1:8765" });
  await b.goto(URL_, [API_STUB]);
  await b.click("#micBtn");
  await sleep(2500);
  check("real denial message", (await b.evaluate("statusText.textContent")) === "SpeakReview needs microphone access. Allow it in your browser settings, then try again.", await b.evaluate("statusText.textContent"));
  await b.close();
});

// ---------------------------------------------------------------
await test("no recording support", async () => {
  const b = await page({}, ["delete window.AudioWorkletNode;"]);
  check("no-mic class", await b.evaluate("stageView.classList.contains('no-mic')"));
  check("mic and ON AIR hidden", await b.evaluate("getComputedStyle(document.getElementById('micSpot')).display === 'none' && getComputedStyle(onAir).display === 'none'"));
  check("prep hidden", await b.evaluate("prepSetting.hidden"));
  check("old texts", (await b.evaluate("stepSpeakTitle.textContent")) === "Your turn on stage" && (await b.evaluate("actionText.textContent")) === "Upload a recording of your speech (audio or video). Up to 10 minutes." && (await b.evaluate("uploadLabel.textContent")) === "Upload a recording");
  check("full-size upload button", (await b.evaluate("document.querySelector('label.btn-upload').getBoundingClientRect().height")) === 44);
  check("drop allowed", await b.evaluate("canDropFile()"));
  await b.shot(SHOTS + "/nomic-1280x800.png");
  await b.close();
});

// ---------------------------------------------------------------
await test("reduced motion", async () => {
  const b = await page();
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  check("glow does not pulse", (await b.evaluate("getComputedStyle(document.querySelector('.mic-glow')).animationName")) === "none");
  await b.click("#micBtn");
  await b.waitFor("recState === 'countdown'");
  check("countdown number shown, no pop", (await b.evaluate("countNum.textContent")) === "3" && (await b.evaluate("getComputedStyle(countNum).animationName")) === "none");
  check("still records", await b.waitFor("recState === 'recording'", 5000));
  await b.close();
});

// ---------------------------------------------------------------
await test("MP3 path unchanged", async () => {
  const b = await page();
  await b.evaluate(`(() => { const t = new DataTransfer(); t.items.add(new File([buildWav([toPcm16(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5)), 16000)], 16000)], "speech.wav", { type: "audio/wav" })); fileInput.files = t.files; fileInput.dispatchEvent(new Event("change")); })()`);
  check("file shown, label changes", (await b.evaluate("fileNameText.textContent")) === "speech.wav" && (await b.evaluate("uploadLabel.textContent")) === "Choose another file");
  await (async () => { for (let i = 0; i < 100 && await b.evaluate("uploadBtn.hidden"); i++) await sleep(100); })(); await b.click("#uploadBtn");
  check("uploaded", await b.waitFor("window.__captured", 9000));
  const cap = await b.evaluate("window.__captured");
  const call = (await b.evaluate("window.__calls")).find(c => c.includes("/upload-url"));
  check("format=wav&source=upload", call.includes("format=wav") && call.includes("source=upload"), call);
  check("MP3 file name kept", cap.name === "speech.wav");
  check("Backstage shown", await b.waitFor("currentView === 'backstage'", 12000));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

// ---------------------------------------------------------------
await test("downsampler", async () => {
  const b = await page();
  const r = await b.evaluate(`(() => {
    const run = (rate, freq) => {
      const rs = createResampler(rate);
      const n = rate * 2; const out = [];
      for (let start = 0; start < n; start += 128) {
        const c = new Float32Array(Math.min(128, n - start));
        for (let i = 0; i < c.length; i++) c[i] = 0.5 * Math.sin(2 * Math.PI * freq * (start + i) / rate);
        out.push(...rs(c));
      }
      const mid = out.slice(4000, 28000);
      const rms = Math.sqrt(mid.reduce((s, v) => s + v * v, 0) / mid.length);
      // check the 1 kHz output is still a 1 kHz sine: zero crossings per second
      let crossings = 0; for (let i = 1; i < mid.length; i++) if ((mid[i - 1] < 0) !== (mid[i] < 0)) crossings++;
      return { len: out.length, rms: +rms.toFixed(4), hz: Math.round(crossings / 2 / (mid.length / 16000)) };
    };
    return { r48: run(48000, 1000), r441: run(44100, 1000), hi48: run(48000, 10000), hi441: run(44100, 10000), same: createResampler(16000)(new Float32Array(5)).length };
  })()`);
  console.log("      ", JSON.stringify(r));
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  check("48 kHz → 16 kHz length", near(r.r48.len, 32000, 40));
  check("44.1 kHz → 16 kHz length", near(r.r441.len, 32000, 40));
  check("1 kHz keeps its level (0.354 RMS)", near(r.r48.rms, 0.3536, 0.01) && near(r.r441.rms, 0.3536, 0.01));
  check("1 kHz stays 1 kHz", near(r.r48.hz, 1000, 5) && near(r.r441.hz, 1000, 5));
  check("10 kHz removed (above 8 kHz limit)", r.hi48.rms < 0.01 && r.hi441.rms < 0.01);
  check("16 kHz passes through", r.same === 5);
  await b.close();
});

// ---------------------------------------------------------------
await test("fallback: browser ignores the 16 kHz request", async () => {
  // Runs before HOOKS, so the context ignores the requested rate and runs at the device rate
  const b = await page({}, [], ["(() => { const AC = window.AudioContext; window.AudioContext = class extends AC { constructor() { super(); } }; })();"]);
  await b.click("#micBtn");
  check("recording", await b.waitFor("recState === 'recording'", 6000));
  const rate = await b.evaluate("mic.context.sampleRate");
  await sleep(16000);
  const t = await b.evaluate(`(() => { const start = window.__states.filter(s => s[0] === 'recording').at(-1)[1]; const now = performance.now(); finishBtn.click(); return { wall: (now - start) / 1000, take: currentTake.seconds }; })()`);
  check(`downsampled from ${rate} Hz, length right`, rate !== 16000 && Math.abs(t.take - t.wall) < 0.3, `take ${t.take.toFixed(3)} vs ${t.wall.toFixed(3)}`);
  const hdr = Buffer.from(await b.evaluate("currentTake.blob.slice(0, 44).arrayBuffer().then(x => Array.from(new Uint8Array(x)))"));
  check("header still says 16000 Hz", hdr.readUInt32LE(24) === 16000);
  const peak = await b.evaluate("currentTake.blob.slice(44 + 32000, 44 + 64000).arrayBuffer().then(x => Math.max(...new Int16Array(x).map(Math.abs)))");
  check("audio present", peak > 200, "peak " + peak);
  await b.close();
});

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
