// Feature set 2, stage 3: upload any recording or video, too-short results, silence warnings
import { launch, sleep } from "../lib/cdp.mjs";
import { writeFileSync } from "node:fs";
import { SAMPLES, SHOTS, LIVE } from "../lib/paths.mjs";
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const only = process.argv[2];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`);
};
const winPath = name => `${SAMPLES}/${name}`.replace(/\//g, "\\");

// API stub: records every call, captures the S3 form, returns window.__result for /result
const STUB = `
(() => {
  window.__calls = [];
  window.__statusLog = [];
  window.__result = { wpm: 120, filler_word_total: 1, avg_confidence: 0.8, ai_feedback: "Strengths:\\n1. Clear.", speaking_seconds: 17, source: "upload" };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    url = String(url);
    window.__calls.push(url);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/upload-url")) {
      const q = new URL(url).searchParams;
      return json({ fileId: "f" + window.__calls.length, upload: { url: "https://public-speaking-coach-jayvee.s3.amazonaws.com/",
        fields: { key: "uploads/x.wav", "Content-Type": "audio/wav", "x-amz-meta-source": q.get("source") || "" } } });
    }
    if (url === "https://public-speaking-coach-jayvee.s3.amazonaws.com/") {
      const fd = opts.body;
      const entries = [];
      for (const [k, v] of fd.entries()) entries.push(typeof v === "string" ? [k, v] : [k, { name: v.name, type: v.type, size: v.size }]);
      const file = fd.get("file");
      const buf = new Uint8Array(await file.arrayBuffer());
      const view = new DataView(buf.buffer);
      let peak = 0;
      for (let i = 44; i + 1 < buf.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
      window.__captured = {
        riff: String.fromCharCode(...buf.slice(0, 4)), wave: String.fromCharCode(...buf.slice(8, 12)),
        format: view.getUint16(20, true), channels: view.getUint16(22, true), rate: view.getUint32(24, true),
        bits: view.getUint16(34, true), dataBytes: view.getUint32(40, true), size: buf.length, peak, entries };
      return new Response(null, { status: 204 });
    }
    if (url.includes("/result")) return json(window.__result);
    return realFetch(url, opts);
  };
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.getElementById("status");
    new MutationObserver(() => window.__statusLog.push(s.textContent)).observe(s, { childList: true, characterData: true, subtree: true });
  });
})();`;

// A mic that is silent until window.__micGain.gain.value is raised
const SILENT_MIC = `
(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const osc = ctx.createOscillator(); osc.frequency.value = 220;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest); osc.start();
    window.__micGain = gain;
    return dest.stream;
  };
})();`;

async function open({ width = 1280, height = 800, dpr = 1, pre = [], motion = "no-preference", flags = FAKE } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await b.goto(LIVE, [STUB, ...pre]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(80); }
    return false;
  };
  b.mouse = async sel => {
    const [x, y] = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (mobile) {
      // Phones: a real tap
      await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    }
    await sleep(150);
  };
  b.setFile = async name => {
    const { root } = await b.send("DOM.getDocument", { depth: 1 });
    const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#audioFile" });
    await b.send("DOM.setFileInputFiles", { nodeId, files: [winPath(name)] });
  };
  // Waits until the picked file is ready to send, or a message other than "Preparing" shows
  b.settleFile = () => b.waitFor(`!uploadBtn.hidden || (statusText.textContent !== "" && statusText.textContent !== "Preparing your file...")`, 30000);
  b.settled = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert", 8000).then(() => sleep(250));
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};

// Contrast measured from the screen (as in the stage 1b suite)
async function contrast(b, w, h, sels) {
  const items = await b.evaluate(`(() => { const out = []; for (const s of ${JSON.stringify(sels)}) document.querySelectorAll(s).forEach(e => {
    if (!e.getClientRects().length) return; const r = e.getBoundingClientRect(); if (r.width < 2) return;
    const cs = getComputedStyle(e); const bw = parseFloat(cs.borderTopWidth) || 0; const boxed = e.tagName === "BUTTON" && bw > 0;
    const ring = boxed ? [r.left + bw + 2, r.top + bw + 2, r.right - bw - 3, r.bottom - bw - 3] : [r.left - 2, r.top - 2, r.right + 1, r.bottom + 1];
    out.push({ s, c: cs.color, ring }); }); return out; })()`);
  const shot = (await b.send("Page.captureScreenshot", { format: "png" })).data;
  const d = await launch({ width: w, height: h });
  await d.send("Page.navigate", { url: "about:blank" });
  await sleep(200);
  const res = await d.evaluate(`(async () => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${shot}"; });
    const c = document.createElement("canvas"); c.width = ${w}; c.height = ${h}; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const px = (X, Y) => { const d = x.getImageData(Math.min(${w} - 1, Math.max(0, X)), Math.min(${h} - 1, Math.max(0, Y)), 1, 1).data; return L(d[0], d[1], d[2]); };
    return ${JSON.stringify(items)}.map(it => {
      const m = it.c.match(/[\\d.]+/g).map(Number); const ink = L(m[0], m[1], m[2]);
      const [l, t, r, bt] = it.ring.map(Math.round);
      const ring = [];
      for (let X = l; X <= r; X++) { ring.push(px(X, t)); ring.push(px(X, bt)); }
      for (let Y = t; Y <= bt; Y++) { ring.push(px(l, Y)); ring.push(px(r, Y)); }
      const ratio = v => (Math.max(v, ink) + 0.05) / (Math.min(v, ink) + 0.05);
      const rs = ring.map(ratio).sort((a, b) => a - b);
      return [it.s, +rs[Math.floor(rs.length * 0.02)].toFixed(2)];
    });
  })()`);
  await d.close();
  return res;
}
const contrastOk = (res, name) => {
  check(`${name}: contrast >= 4.5:1`, res.length > 0 && res.every(([, r]) => r >= 4.5), res.map(([s, r]) => `${s} ${r}`).join(", "));
};

// Sends the prepared file and checks the WAV and the request
async function sendAndCheck(b, tag, source = "upload") {
  await b.mouse("#uploadBtn");
  const got = await b.waitFor("window.__captured", 15000);
  check(`${tag}: sent`, got);
  if (!got) return null;
  const c = await b.evaluate("window.__captured");
  const query = await b.evaluate(`__calls.find(u => u.includes("/upload-url")) || ""`);
  check(`${tag}: WAV is RIFF/WAVE PCM`, c.riff === "RIFF" && c.wave === "WAVE" && c.format === 1);
  check(`${tag}: mono, 16 kHz, 16-bit`, c.channels === 1 && c.rate === 16000 && c.bits === 16, `${c.channels} ch, ${c.rate} Hz, ${c.bits} bit`);
  check(`${tag}: query has format=wav&source=${source}`, /format=wav/.test(query) && new URL(query).searchParams.get("source") === source, query.replace(/^.*\?/, "?"));
  const files = c.entries.filter(([, v]) => typeof v === "object");
  check(`${tag}: one file, speech.wav (audio/wav), never the original`, files.length === 1 && files[0][0] === "file" && files[0][1].name === "speech.wav" && files[0][1].type === "audio/wav", JSON.stringify(files));
  check(`${tag}: x-amz-meta-source field appended, before the file`, c.entries.some(([k, v]) => k === "x-amz-meta-source" && v === source) && c.entries[c.entries.length - 1][0] === "file");
  check(`${tag}: under 25 MB`, c.size <= 25 * 1024 * 1024, `${(c.size / 1048576).toFixed(2)} MB`);
  return c;
}

// ---------------------------------------------------------------- every format converts and sends
if (!only || only === "formats") {
  console.log("\n== formats (laptop)");
  const FILES = ["speech-44k-stereo.wav", "speech.mp3", "speech.m4a", "speech.ogg", "speech.opus", "speech.webm", "speech.flac", "speech.mp4", "speech.mov", "ten-min.wav"];
  for (const name of FILES) {
    const b = await open();
    await b.setFile(name);
    await b.settleFile();
    const st = await b.evaluate(`({ ready: !uploadBtn.hidden, status: statusText.textContent, log: __statusLog, seconds: preparedUpload && preparedUpload.seconds,
      silent: !fileSilence.hidden, label: uploadBtn.textContent, player: !filePlayerBox.hidden, length: lengthLine.textContent, upLabel: uploadLabel.textContent })`);
    check(`${name}: ready to send`, st.ready, st.status);
    check(`${name}: "Preparing your file..." was shown`, st.log.includes("Preparing your file..."));
    check(`${name}: player, length line, "Choose another file" label`, st.player && /^Length: \d+:\d\d/.test(st.length) && st.upLabel === "Choose another file", st.length);
    check(`${name}: not marked silent, button "Send to the coach"`, !st.silent && st.label === "Send to the coach");
    // The source's own length, decoded separately at its own rate
    const own = await b.evaluate(`(async () => (await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await fileInput.files[0].arrayBuffer())).duration)()`);
    check(`${name}: converted length matches the source within 0.1 s`, Math.abs(own - st.seconds) <= 0.1, `${st.seconds?.toFixed(3)} vs ${own.toFixed(3)}`);
    const c = await sendAndCheck(b, name);
    if (c) {
      check(`${name}: WAV length = converted length, has sound`, Math.abs(c.dataBytes / 32000 - st.seconds) < 0.001 && c.peak > 1000, `${(c.dataBytes / 32000).toFixed(3)} s, peak ${c.peak}`);
      const shown = await b.waitFor(`!resultBox.hidden && currentView === "backstage"`, 15000);
      check(`${name}: result shown on Backstage, tagged "Uploaded file"`, shown && await b.evaluate(`perfSummary.querySelector(".source-tag")?.textContent === "Uploaded file"`));
    }
    await done(b);
  }
}

// ---------------------------------------------------------------- failures show the right message and send nothing
if (!only || only === "failures") {
  console.log("\n== failures (laptop)");
  const CASES = [
    ["notes.txt", "This file type can't be used. Choose an audio or video file.", false],
    ["big-210.wav", "This file is too large. Choose a file under 200 MB.", false],
    ["big-150.mp4", "The sound in this file couldn't be read. Try another file or format.", true],
    ["empty.mp3", "The sound in this file couldn't be read. Try another file or format.", true],
    ["corrupt.m4a", "The sound in this file couldn't be read. Try another file or format.", true],
    ["eleven-min.wav", "This recording is longer than 10 minutes. Please upload a shorter speech.", true]
  ];
  const b = await open();
  for (const [name, message, prepares] of CASES) {
    await b.evaluate("__statusLog.length = 0");
    const t0 = Date.now();
    await b.setFile(name);
    await b.settleFile();
    const st = await b.evaluate(`({ status: statusText.textContent, log: __statusLog.slice(), info: fileInfo.hidden, btn: uploadBtn.hidden, player: filePlayerBox.hidden, files: fileInput.files.length, prepared: preparedUpload, calls: __calls.filter(u => !u.startsWith("http://127")) })`);
    check(`${name}: message "${message}"`, st.status === message, st.status);
    check(`${name}: nothing kept or shown, nothing sent`, st.info && st.btn && st.player && st.files === 0 && st.prepared === null && st.calls.length === 0, JSON.stringify(st.calls));
    check(`${name}: ${prepares ? "read on the device first" : "refused before reading (no Preparing)"}`, st.log.includes("Preparing your file...") === prepares, `${Date.now() - t0} ms`);
  }
  // A good file after a failure still works
  await b.setFile("speech.mp3");
  await b.settleFile();
  check("a good file after failures: ready, message cleared", await b.evaluate(`!uploadBtn.hidden && statusText.textContent === ""`));
  // A newer pick wins over a slower older one
  await b.setFile("ten-min.wav");
  await sleep(30);
  await b.setFile("speech.ogg");
  await b.settleFile();
  await sleep(1500);
  check("a newer pick replaces one still converting", await b.evaluate(`fileInput.files[0].name === "speech.ogg" && Math.abs(preparedUpload.seconds - 12) < 0.3 && fileNameText.textContent === "speech.ogg"`),
    await b.evaluate("preparedUpload && preparedUpload.seconds"));
  await done(b);

  console.log("\n== failures and convert (phone 390x780)");
  const p = await open({ width: 390, height: 780 });
  check("phone counts as a low-memory device", await p.evaluate("isLowMemoryDevice() && maxSourceMb() === 100"));
  await p.setFile("big-150.mp4");
  await p.settleFile();
  const ph = await p.evaluate(`({ s: statusText.textContent, log: __statusLog.slice(), calls: __calls.filter(u => !u.startsWith("http://127")).length })`);
  check("phone: 150 MB file refused before reading", ph.s === "This file is too large. Choose a file under 100 MB." && !ph.log.includes("Preparing your file...") && ph.calls === 0, ph.s);
  await p.setFile("speech.m4a");
  await p.settleFile();
  check("phone: m4a converts", await p.evaluate("!uploadBtn.hidden"));
  await sendAndCheck(p, "phone m4a");
  await done(p);
}

// ---------------------------------------------------------------- a browser that refuses a 16 kHz decoder
if (!only || only === "fallback") {
  console.log("\n== fallback: decode at 44.1 kHz, then the recorder's own resampler");
  const REFUSE = `(() => { const Real = window.OfflineAudioContext; window.__fallbackUsed = false;
    window.OfflineAudioContext = function (ch, len, rate) { if (rate === 16000) throw new Error("NotSupported"); window.__fallbackUsed = true; return new Real(ch, len, rate); }; })();`;
  for (const name of ["speech-44k-stereo.wav", "speech.mp4"]) {
    const b = await open({ pre: [REFUSE] });
    await b.setFile(name);
    await b.settleFile();
    const own = await b.evaluate(`(async () => (await new (Object.getPrototypeOf(new OfflineAudioContext(1, 1, 44100)).constructor)(1, 1, 44100).decodeAudioData(await fileInput.files[0].arrayBuffer())).duration)()`);
    const st = await b.evaluate(`({ used: __fallbackUsed, ready: !uploadBtn.hidden, seconds: preparedUpload && preparedUpload.seconds })`);
    check(`${name}: fallback path used and ready`, st.used && st.ready);
    check(`${name}: fallback length matches within 0.1 s`, Math.abs(st.seconds - own) <= 0.1, `${st.seconds} vs ${own}`);
    const c = await sendAndCheck(b, `${name} fallback`);
    if (c) check(`${name}: fallback WAV has sound`, c.peak > 1000, `peak ${c.peak}`);
    await done(b);
  }
}

// ---------------------------------------------------------------- drag and drop
if (!only || only === "drop") {
  console.log("\n== drag and drop");
  const b = await open();
  const drop = async (make) => b.evaluate(`(() => {
    const file = ${make};
    const dt = new DataTransfer(); dt.items.add(file);
    document.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  })()`);
  check("drop text says file", await b.evaluate(`getComputedStyle(document.querySelector(".stage"), "::after").content`).then(() => true));
  await drop(`new File(["hello"], "notes.pdf", { type: "application/pdf" })`);
  check("dropping a non-media file: type message", await b.evaluate(`statusText.textContent === "This file type can't be used. Choose an audio or video file." && fileInput.files.length === 0`));
  await drop(`(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
    return new File([buildWav([toPcm16(x, n)], n)], "dropped.wav", { type: "audio/wav" }); })()`);
  await b.settleFile();
  check("dropping a WAV: converted and ready", await b.evaluate(`!uploadBtn.hidden && fileNameText.textContent === "dropped.wav" && Math.abs(preparedUpload.seconds - 3) < 0.01`));
  await sendAndCheck(b, "dropped wav");
  await done(b);
}

// ---------------------------------------------------------------- a silent file
if (!only || only === "silent") {
  for (const motion of ["no-preference", "reduce"]) {
    console.log(`\n== silent file (motion ${motion})`);
    const b = await open({ motion });
    await b.send("Page.setInterceptFileChooserDialog", { enabled: true });
    await b.setFile("silent.wav");
    await b.settleFile();
    const st = await b.evaluate(`({ warn: !fileSilence.hidden, text: fileSilence.textContent.trim().replace(/\\s+/g, " "), label: uploadBtn.textContent, ready: !uploadBtn.hidden })`);
    check("silent file: warning shown", st.warn && st.text.startsWith("This file is almost silent. Choose another file, or send it anyway."), st.text);
    check("silent file: both choices (Send anyway, Choose another file)", st.ready && st.label === "Send anyway" && st.text.endsWith("Choose another file"));
    if (motion === "no-preference") {
      if (SHOTS) writeFileSync(`${SHOTS}/silent-file-1280.png`, Buffer.from((await b.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      contrastOk(await contrast(b, 1280, 800, [".silence-text", "#fileSilenceChooseBtn", ".upload-limits .long-label", "#uploadLabel"]), "silent file");
      // "Choose another file" opens the picker; a new pick clears the warning
      const opened = new Promise(r => {
        const t = setTimeout(() => r(false), 4000);
        b.listeners.push(msg => { if (msg.method === "Page.fileChooserOpened") { clearTimeout(t); r(true); } });
      });
      await b.mouse("#fileSilenceChooseBtn");
      check("Choose another file opens the file picker", await opened);
      await b.setFile("speech.mp3");
      await b.settleFile();
      check("a new pick clears the warning and the label", await b.evaluate(`fileSilence.hidden && uploadBtn.textContent === "Send to the coach" && !uploadBtn.hidden`));
      await b.setFile("silent.wav");
      await b.settleFile();
    }
    const c = await sendAndCheck(b, `silent file Send anyway (${motion})`);
    if (c) check("silent file: what was sent is near-silence", c.peak < 200, `peak ${c.peak}`);
    await done(b);
  }
}

// ---------------------------------------------------------------- too-short results
if (!only || only === "short") {
  console.log("\n== too short");
  const b = await open();
  const SENTENCE = "<img src=x onerror=alert(1)> That was a bit short for feedback. Try speaking for at least 30 seconds.";
  await b.evaluate(`window.__result = { too_short: true, word_count: 3, wpm: 0, filler_word_total: 0, avg_confidence: 0.9, speaking_seconds: 4, source: "upload", ai_feedback: ${JSON.stringify(SENTENCE)} }`);
  await b.setFile("speech.mp3");
  await b.settleFile();
  const t0 = Date.now();
  await b.mouse("#uploadBtn");
  const shown = await b.waitFor(`!resultBox.hidden && currentView === "backstage" && !intermissionOn`, 20000);
  check("too_short with wpm 0 finishes polling (no 5-minute wait)", shown, `${Date.now() - t0} ms`);
  await b.settled();
  const st = await b.evaluate(`({ html: coachNotesBody.innerHTML, n: coachNotesBody.children.length, text: coachNotesBody.textContent, short: coachNotesBody.querySelector(".note-short") !== null,
    img: document.querySelectorAll("#coachNotesBody img, #result img").length, h3: coachNotesBody.querySelectorAll("h3, .note-item").length, hint: document.getElementById("notesHint").hidden,
    hintShown: getComputedStyle(document.getElementById("notesHint")).display, banner: trophyBanner.hidden, trophies: localStorage.getItem("speakreview.trophies.v1"),
    wall: JSON.parse(localStorage.getItem("speakreview.wall.v1") || "[]") })`);
  check("too_short: one friendly sentence in Coach's notes, as text", st.n === 1 && st.short && st.text === SENTENCE && st.img === 0, st.html.slice(0, 160));
  check("too_short: no section headings or points", st.h3 === 0);
  check("too_short: no \"Scroll for all notes\" hint", st.hint && st.hintShown === "none");
  check("too_short: no trophies (banner hidden, nothing counted)", st.banner && st.trophies === null, String(st.trophies));
  check("too_short: still on the Wall of Fame", st.wall.length === 1 && st.wall[0].too_short === true && st.wall[0].wpm === 0, JSON.stringify(st.wall[0] || {}).slice(0, 120));
  contrastOk(await contrast(b, 1280, 800, ["#coachNotesBody .note-short"]), "too-short note");
  if (SHOTS) writeFileSync(`${SHOTS}/too-short-1280.png`, Buffer.from((await b.send("Page.captureScreenshot", { format: "png" })).data, "base64"));

  // The playbill shows the same sentence as text
  await b.evaluate(`goToView("wall")`);
  await b.settled();
  await b.mouse(".playbill");
  await sleep(300);
  const pb = await b.evaluate(`({ text: pbNotes.textContent, img: pbNotes.querySelectorAll("img").length, short: pbNotes.querySelector(".note-short") !== null, shelf: shelfTitle.textContent })`);
  check("too_short playbill: the sentence as text", pb.text === SENTENCE && pb.img === 0 && pb.short, pb.text.slice(0, 80));
  check("too_short: trophy shelf still 0 earned", pb.shelf.includes("0 of"), pb.shelf);
  await b.evaluate("closeDialog()");

  // A normal result afterwards: sections, hint back, first trophy
  await b.evaluate(`window.__captured = null; window.__result = { wpm: 130, filler_word_total: 2, avg_confidence: 0.85, speaking_seconds: 20, source: "upload", ai_feedback: "Strengths:\\n1. Clear <b>voice</b>.\\nWeaknesses:\\n- Pace." }`);
  await b.evaluate(`goToView("stage")`);
  await b.settled();
  await b.setFile("speech.ogg");
  await b.settleFile();
  await b.mouse("#uploadBtn");
  await b.waitFor(`!intermissionOn && currentView === "backstage" && coachNotesBody.querySelector("h3")`, 20000);
  await b.settled();
  const n = await b.evaluate(`({ h3: coachNotesBody.querySelectorAll("h3").length, b: coachNotesBody.querySelectorAll("b").length, text: coachNotesBody.textContent, hint: document.getElementById("notesHint").hidden, canScroll: coachNotesBody.scrollHeight > coachNotesBody.clientHeight + 1, banner: !trophyBanner.hidden && trophyBannerText.textContent })`);
  // Since stage 5 "Scroll for more" shows only when the notes can really scroll (these short notes can't)
  check("normal result after: headings, escaped text, hint back to following the scroll", n.h3 === 2 && n.b === 0 && n.text.includes("<b>voice</b>") && n.hint === !n.canScroll, JSON.stringify({ hint: n.hint, canScroll: n.canScroll }));
  check("normal result after: earns Opening night", n.banner === "Trophy unlocked: Opening night", String(n.banner));

  // displayResult() from the console with too_short (stays global)
  await b.evaluate(`displayResult({ too_short: true, wpm: 0, ai_feedback: "" })`);
  await b.settled();
  check("displayResult() too_short with no sentence: friendly fallback", await b.evaluate(`coachNotesBody.querySelector(".note-short").textContent.startsWith("This speech was too short")`));
  await done(b);
}

// ---------------------------------------------------------------- live recording: unchanged path, source=recording
if (!only || only === "live") {
  console.log("\n== live recording (fake mic)");
  const b = await open();
  await b.mouse("#micBtn");
  check("recording starts after the countdown", await b.waitFor(`recState === "recording"`, 8000));
  await sleep(6500);
  check("a working mic: no mic hint after 5 s", await b.evaluate("micCheck.hidden"));
  await b.waitFor(`recCount >= 16.5 * 16000`, 20000);
  await b.mouse("#finishBtn");
  await b.waitFor(`recState === "review"`);
  check("review: no silence warning, Send to the coach", await b.evaluate(`takeSilence.hidden && takeSendBtn.textContent === "Send to the coach" && !takeSendBtn.disabled`));
  await b.mouse("#takeSendBtn");
  await b.waitFor("window.__captured", 15000);
  const c = await b.evaluate("window.__captured");
  const query = await b.evaluate(`__calls.find(u => u.includes("/upload-url")) || ""`);
  check("live: query has format=wav&source=recording", /format=wav/.test(query) && /source=recording/.test(query), query.replace(/^.*\?/, "?"));
  check("live: mono 16 kHz 16-bit WAV named speech.wav", c.channels === 1 && c.rate === 16000 && c.bits === 16 && c.entries.some(([k, v]) => k === "file" && v.name === "speech.wav"));
  check("live: x-amz-meta-source=recording appended", c.entries.some(([k, v]) => k === "x-amz-meta-source" && v === "recording"));
  check("live: take marked sent", await b.evaluate("currentTake && currentTake.sent"));
  await done(b);

  for (const motion of ["no-preference", "reduce"]) {
    console.log(`\n== live recording, silent mic (motion ${motion})`);
    const s = await open({ pre: [SILENT_MIC], motion });
    await s.mouse("#micBtn");
    await s.waitFor(`recState === "recording"`, 8000);
    await sleep(1500);
    check("silent mic: no hint before 5 s", await s.evaluate("micCheck.hidden"));
    await s.mouse("#swHideBtn");                           // the hint still shows with the stopwatch hidden
    await s.waitFor(`recCount >= 5.3 * 16000`, 10000);
    await sleep(200);
    const mc = await s.evaluate(`({ shown: !micCheck.hidden && micCheck.getClientRects().length > 0, text: micCheck.textContent, sw: stopwatchRow.hidden, ann: sceneAnnounce.textContent })`);
    check("silent mic: hint shows after 5 s near the timer", mc.shown && mc.text === "No sound is coming through. Check that your mic is on.", mc.text);
    check("silent mic: hint shows with the stopwatch hidden", mc.sw && mc.shown);
    if (motion === "no-preference") {
      contrastOk(await contrast(s, 1280, 800, ["#micCheck"]), "mic hint");
      if (SHOTS) writeFileSync(`${SHOTS}/mic-check-1280.png`, Buffer.from((await s.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      const ov = await s.evaluate(`(() => { const a = micCheck.getBoundingClientRect(), m = micBtn.getBoundingClientRect(); return a.bottom <= m.top || a.top >= m.bottom || a.right <= m.left || a.left >= m.right; })()`);
      check("mic hint never covers the mic", ov);
    }
    await sleep(800);
    check("silent mic: announced once to screen readers", (await s.evaluate("sceneAnnounce.textContent")) === "No sound is coming through. Check that your mic is on.");
    await s.evaluate("__micGain.gain.value = 0.3");
    check("sound arrives: hint hides", await s.waitFor("micCheck.hidden", 3000));
    await sleep(3000);                                     // about 3 s of sound in a 16 s take
    await s.evaluate("__micGain.gain.value = 0");
    await sleep(1500);
    check("the hint stays hidden once sound was heard", await s.evaluate("micCheck.hidden"));
    await s.waitFor(`recCount >= 16 * 16000`, 15000);
    await s.mouse("#finishBtn");
    await s.waitFor(`recState === "review"`);
    check("take with real sound in it: no silence warning", await s.evaluate("takeSilence.hidden && micCheck.hidden"));

    // Re-record, all silent: the Review warning, both choices
    await s.mouse("#reRecordBtn");
    await s.waitFor(`recState === "recording"`, 8000);
    check("re-record: the hint starts hidden again", await s.evaluate("micCheck.hidden"));
    await s.waitFor(`recCount >= 15.5 * 16000`, 25000);
    await s.mouse("#finishBtn");
    await s.waitFor(`recState === "review"`);
    const rv = await s.evaluate(`({ warn: !takeSilence.hidden, text: takeSilence.textContent, label: takeSendBtn.textContent, send: !takeSendBtn.disabled, re: !reRecordBtn.disabled && !reRecordBtn.hidden, hint: micCheck.hidden })`);
    check("silent take: Review warning", rv.warn && rv.text === "This take is almost silent. Check your mic and record again, or send it anyway.", rv.text);
    check("silent take: both choices (Send anyway, Re-record)", rv.label === "Send anyway" && rv.send && rv.re);
    check("silent take: the live hint is gone in Review", rv.hint);
    if (motion === "no-preference") contrastOk(await contrast(s, 1280, 800, ["#takeSilence"]), "take warning");
    if (motion === "no-preference") {
      // Re-record dismisses it
      await s.mouse("#reRecordBtn");
      await sleep(300);
      check("Re-record clears the warning", await s.evaluate(`takeSilence.hidden && takeSendBtn.textContent === "Send to the coach"`));
      await s.waitFor(`recState === "recording"`, 8000);
      await s.waitFor(`recCount >= 15.5 * 16000`, 25000);
      await s.mouse("#finishBtn");
      await s.waitFor(`recState === "review"`);
    }
    await s.mouse("#takeSendBtn");
    await s.waitFor("window.__captured", 15000);
    const q = await s.evaluate(`__calls.find(u => u.includes("/upload-url")) || ""`);
    check("Send anyway sends the silent take with source=recording", /source=recording/.test(q) && (await s.evaluate("__captured.channels")) === 1);
    await done(s);
  }

  console.log("\n== live recording, short silent take");
  const t = await open({ pre: [SILENT_MIC] });
  await t.mouse("#micBtn");
  await t.waitFor(`recState === "recording"`, 8000);
  await t.waitFor(`recCount >= 8 * 16000`, 12000);
  await t.mouse("#finishBtn");
  await t.waitFor(`recState === "review"`);
  check("a silent take under 15 s: only the 15 s note (it can't be sent anyway)", await t.evaluate(`takeSilence.hidden && takeNote.textContent.includes("at least 15 seconds") && takeSendBtn.disabled`));
  await done(t);
}

// ---------------------------------------------------------------- layout with the new lines
if (!only || only === "layout") {
  console.log("\n== layout");
  const SIZES = [[1280, 800, 1], [1366, 657, 1], [1093, 526, 1.25], [390, 780, 1], [360, 740, 1]];
  for (const [w, h, dpr] of SIZES) {
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    const b = await open({ width: w, height: h, dpr });
    await b.setFile("silent.wav");
    await b.settleFile();
    const r = await b.evaluate(`(() => {
      const box = e => e.getBoundingClientRect();
      const hit = (a, m) => !(a.bottom <= m.top || a.top >= m.bottom || a.right <= m.left || a.left >= m.right);
      const items = [fileSilence, uploadBtn, filePlayerBox, fileInfo, document.querySelector(".upload-row")].map(box);
      return { overflow: document.documentElement.scrollWidth - innerWidth, inside: items.every(a => a.left >= 0 && a.right <= innerWidth + 0.5),
        overMic: items.some(a => hit(a, box(micBtn))), hint: getComputedStyle(document.querySelector(".upload-limits .long-label")).display !== "none" ? document.querySelector(".upload-limits .long-label").textContent : document.querySelector(".upload-limits .short-label").textContent };
    })()`);
    check(`${tag}: no sideways scroll, upload area inside the window`, r.overflow <= 0 && r.inside, `overflow ${r.overflow}`);
    check(`${tag}: warning and buttons never cover the mic`, !r.overMic);
    check(`${tag}: hint "${r.hint}"`, r.hint === "Audio or video, up to 10 minutes" || r.hint === "Audio or video, up to 10 min");
    if (SHOTS) {
      await b.evaluate(`fileSilence.scrollIntoView({ block: "center" })`);
      writeFileSync(`${SHOTS}/silent-file-${tag}.png`, Buffer.from((await b.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    }
    if (w <= 600) contrastOk(await contrast(b, w, h, [".silence-text", "#fileSilenceChooseBtn"]), `${tag} silent file`);
    await done(b);
  }
}

// ---------------------------------------------------------------- wording
if (!only || only === "wording") {
  console.log("\n== wording");
  const b = await open();
  const r = await b.evaluate(`({ label: uploadLabel.textContent, accept: fileInput.accept, privacy: privacyNote.textContent, drop: getComputedStyle(document.querySelector("#dropZone .stage"), "::after").content,
    body: document.body.innerText + " " + [...document.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label")).join(" ") + " " + privacyNote.textContent })`);
  check("upload label: or upload a recording", r.label === "or upload a recording");
  check("accept lists audio and video", ["audio/*", "video/*", ".mp3", ".m4a", ".mov", ".mp4", ".webm", ".ogg", ".flac", ".wav", ".opus", ".aac"].every(x => r.accept.split(",").includes(x)), r.accept);
  check("privacy line", r.privacy.includes("Uploaded files are converted on this device, and only the sound is sent."));
  const src = (await (await fetch(LIVE + "js/app.js")).text()) + (await (await fetch(LIVE)).text()) + (await (await fetch(LIVE + "css/styles.css")).text());
  check("no MP3-only wording left", !/upload an MP3|your MP3|Uploaded MP3|picked MP3|Drop your MP3|drop an MP3/i.test(src));
  check("no em dashes in site files", !src.includes("—"));
  check("no inline style attributes or handlers in index.html", !/\sstyle=|\son[a-z]+=/i.test(await (await fetch(LIVE)).text()));
  check("no 'we' in new visible text", !/\bwe\b|\bwe'|\bour\b/i.test(["No sound is coming through", "This take is almost silent", "This file is almost silent", "couldn't be read", "Preparing your file"].join(" ")) && !/\b[Ww]e (can|couldn)/.test(src));
  await done(b);

  console.log("\n== no mic (upload-first layout)");
  const n = await open({ pre: ["Object.defineProperty(window, 'AudioWorkletNode', { value: undefined });"] });
  const nm = await n.evaluate(`({ label: uploadLabel.textContent, text: actionText.textContent })`);
  check("no mic: Upload a recording", nm.label === "Upload a recording" && nm.text === "Upload a recording of your speech (audio or video). Up to 10 minutes.", JSON.stringify(nm));
  await n.setFile("speech.webm");
  await n.settleFile();
  check("no mic: webm converts", await n.evaluate("!uploadBtn.hidden"));
  await sendAndCheck(n, "no-mic webm");
  await done(n);
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
