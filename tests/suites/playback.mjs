// Feature set 3, stage 4: replay in Your words.
//   keep     the exact WAV that was sent stays in memory for the latest speech only, and nothing else frees it
//   radio    the console radio: where it shows, play and pause, speed, the dial, the end, pausing, sizes
// Every API call is answered by the fake API stub; nothing reaches AWS.
import { launch, sleep, LIVE, STUB, RESULT as BASE_RESULT, WORDS, check, finish, only, shot } from "../lib/page.mjs";

// A result with words, so Your words has something to follow
const RESULT = { ...BASE_RESULT, words: WORDS };

const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

// Keeps the bytes of the file that reached the S3 stub
const HOOKS = `(() => {
  const inner = window.fetch;
  window.fetch = async (url, opts = {}) => {
    if (String(url).includes(".s3.") && opts.body && typeof opts.body.get === "function") {
      window.__sentBytes = new Uint8Array(await opts.body.get("file").arrayBuffer());
    }
    return inner(url, opts);
  };
})();`;

async function open({ width = 1280, height = 800, dpr = 1, pre = [], motion = "no-preference" } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: FAKE, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await b.goto(LIVE, [STUB, HOOKS, `window.__result = ${JSON.stringify(RESULT)};`, ...pre]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(60); }
    return false;
  };
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
// Sends a WAV of `seconds` (a tone that changes, so its waveform isn't flat) straight through upload()
const send = (b, seconds = 6, source = "upload") => b.evaluate(`(() => { const n = 16000 * ${seconds}, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (0.2 + 0.2 * Math.sin(i / 8000)) * Math.sin(i / 5);
  upload({ blob: buildWav([toPcm16(x, n)], n), seconds: ${seconds}, source: ${JSON.stringify(source)} }); return true; })()`);
// Sends one speech and waits until its notes show in Backstage
async function sendAndShow(b, seconds = 6, source = "upload") {
  await send(b, seconds, source);
  return b.waitFor("currentView === 'backstage' && !intermissionOn && !appRoot.inert", 20000);
}
// Can the kept recording still be played? (its URL loads in a fresh audio element)
const PLAYABLE = `new Promise(resolve => { if (!replayRecording) return resolve(false); const a = new Audio(); a.onloadedmetadata = () => resolve(a.duration > 0);
  a.onerror = () => resolve(false); a.src = replayRecording.url; setTimeout(() => resolve(false), 4000); })`;

// ---------------------------------------------------------------- keeping the recording
if (!only || only === "keep") {
  console.log("\n== the sent recording is kept in memory");
  const b = await open();
  const storedBefore = await b.evaluate("Object.keys(localStorage).sort().join()");
  for (const source of ["recording", "upload"]) {
    await sendAndShow(b, 6, source);
    const r = await b.evaluate(`(async () => { const kept = new Uint8Array(await replayRecording.blob.arrayBuffer()), sent = window.__sentBytes;
      return { id: replayRecording.id, sameBytes: kept.length === sent.length && kept.every((v, i) => v === sent[i]), seconds: replayRecording.seconds, size: kept.length,
        wall: JSON.parse(localStorage.getItem("speakreview.wall.v1") || "[]").map(e => e.id) }; })()`);
    check(`${source}: kept with its speech ID, byte for byte the WAV that was sent`, r.sameBytes && r.size > 44 && r.seconds === 6 && r.wall.includes(r.id), JSON.stringify(r));
    await b.evaluate("goToView('stage')");
    await b.waitFor("currentView === 'stage' && !appRoot.inert", 5000);
  }
  // Nothing that runs after sending frees it
  await b.evaluate(`clearTake(); discardTake(); true`);
  await b.evaluate(`(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
    const dt = new DataTransfer(); dt.items.add(new File([buildWav([toPcm16(x, n)], n)], "other.wav", { type: "audio/wav" }));
    dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
  await b.waitFor("!!preparedUpload", 15000);
  await b.evaluate(`showFileName(); true`);
  check("clearing the take, discarding it and picking (then dropping) another file leave it playable", await b.evaluate(PLAYABLE) && !(await b.evaluate("window.__revoked.has(replayRecording.url)")));
  // A new send replaces it and frees the old one
  const firstUrl = await b.evaluate("replayRecording.url");
  const firstId = await b.evaluate("replayRecording.id");
  await sendAndShow(b, 4);
  check("a new send replaces it and frees the old recording", (await b.evaluate("replayRecording.id")) !== firstId && (await b.evaluate("replayRecording.seconds")) === 4
    && await b.evaluate(`window.__revoked.has(${JSON.stringify(firstUrl)})`) && await b.evaluate(PLAYABLE));
  const stored = await b.evaluate(`Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k).length, localStorage.getItem(k).includes("RIFF")])`);
  check("never written to storage (no new key, nothing large, no WAV data)", stored.every(([k, n, wav]) => !wav && (k.startsWith("speakreview.wall") || n < 5000))
    && stored.map(([k]) => k).every(k => storedBefore.split(",").includes(k) || /^speakreview\.(wall|trophies|pending|settings)/.test(k)), JSON.stringify(stored));
  await done(b);
}

// ---------------------------------------------------------------- the radio
const openWords = async b => {
  await b.evaluate("document.getElementById('tabWords').click()");
  await sleep(200);
};
const RADIO = `({ radio: replayBox.isConnected && !replayBox.hidden && wordsPanel.firstElementChild === replayBox, gone: replayGone.isConnected && !replayGone.hidden,
  playing: !replayAudio.paused, t: replayAudio.currentTime,
  knob: [replayBox.querySelector('#replayPlayKnob').classList.contains("playing"), replayBox.querySelector('#replayPlayKnob').getAttribute("aria-label"), replayPlayLabel.textContent].join("|"),
  key: [replayPlayKey.classList.contains("playing"), replayPlayKey.getAttribute("aria-label"), replayPlayKey.textContent].join("|"),
  glow: replayBox.classList.contains("is-playing") })`;

if (!only || only === "radio") {
  for (const [w, h, dpr] of [[1280, 800, 1], [1093, 526, 1.25], [390, 780, 1]]) {
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    const phone = w <= 600;
    console.log(`\n== the replay radio (${tag})`);
    const b = await open({ width: w, height: h, dpr });
    await sendAndShow(b, 6);
    await openWords(b);
    let r = await b.evaluate(RADIO);
    check(`${tag} the radio for the speech just sent, at the top of Your words, no note`, r.radio && !r.gone, JSON.stringify(r));
    const fit = await b.evaluate(`(() => { const box = e => e.getBoundingClientRect(); const radio = box(replayBox), body = box(wordsPanel.querySelector(".words-body")), back = box(backToStageBtn);
      const bar = document.querySelector(".main-nav"), barTop = getComputedStyle(bar).display === "none" ? innerHeight : box(bar).top;
      return { radio: radio.top >= 0 && radio.bottom <= barTop && radio.left >= 0 && radio.right <= innerWidth, body: Math.round(body.height), back: back.bottom <= barTop + 0.5 && back.top >= 0,
        keys: [...document.querySelectorAll(".replay-key")].map(k => k.offsetWidth + "x" + k.offsetHeight).join(), knobs: [...document.querySelectorAll(".replay-knob")].map(k => k.offsetWidth + "x" + k.offsetHeight).join(),
        dial: document.querySelector(".replay-dial").offsetHeight }; })()`);
    // Nothing of Your words reaches the buttons (the project's rule from backstage-layout: the open panel ends above
    // them, and they stay inside the mirror). On short screens the cloth goes and the panel may scroll.
    for (const banner of [false, true]) {
      await b.evaluate(`trophyBanner.hidden = ${!banner}; true`);
      await sleep(150);
      const m = await b.evaluate(`(() => { const box = e => e.getBoundingClientRect(); const row = box(document.querySelector("#result .perf-buttons")), p = box(wordsPanel), g = box(document.querySelector(".mirror-glass"));
        const kids = [...wordsPanel.children].filter(e => e.getClientRects().length).map(box);
        const spill = wordsPanel.scrollHeight > wordsPanel.clientHeight + 1 && getComputedStyle(wordsPanel).overflowY === "visible";
        const back = box(backToStageBtn);
        return { above: p.bottom <= row.top + 0.5, spill, inMirror: back.top >= g.top - 0.5 && back.bottom <= g.bottom + 0.5,
          cloth: getComputedStyle(replayBox.querySelector(".replay-cloth")).display, scrolls: wordsPanel.scrollHeight > wordsPanel.clientHeight + 1,
          body: Math.round(box(wordsPanel.querySelector(".words-body")).height) }; })()`);
      const short = phone || h <= 700;
      check(`${tag}${banner ? " with the trophy banner" : ""}: Your words ends above the buttons and never spills onto them${short ? ", no cloth, the panel scrolls if it must" : ", the full radio fixed"}`,
        m.above && !m.spill && m.inMirror && m.cloth === (short ? "none" : "block") && (short || !m.scrolls) && m.body >= 40, JSON.stringify(m));
    }
    await b.evaluate("trophyBanner.hidden = true; true");
    check(`${tag} the radio sits inside the window`, fit.radio, JSON.stringify(fit));
    check(`${tag} keys 60x36, knobs 44x44, dial ${phone ? 48 : 54}px`, fit.keys === "60x36,60x36,60x36" && fit.knobs === "44x44,44x44" && fit.dial === (phone ? 48 : 54), JSON.stringify(fit));
    await shot(b, `replay-${tag}-paused`);

    // Play from the knob, pause from the key: both always show the same state
    await b.evaluate("replayPlayKnob.click()");
    await b.waitFor("!replayAudio.paused && replayAudio.currentTime > 0.3", 5000);
    r = await b.evaluate(RADIO);
    check(`${tag} the knob plays; the knob and the key both read Pause; the cloth glows`, r.playing && r.knob === "true|Pause|Pause" && r.key === "true|Pause|Pause" && r.glow, JSON.stringify(r));
    await shot(b, `replay-${tag}-playing`);
    await b.evaluate("replayPlayKey.click()");
    r = await b.evaluate(RADIO);
    check(`${tag} the key pauses; both read Play again; no glow`, !r.playing && r.knob === "false|Play your speech|Play" && r.key === "false|Play your speech|Play" && !r.glow, JSON.stringify(r));

    if (w === 1280) {
      // Speed: all seven steps and back, the pointer turning, the pitch kept
      const seen = [];
      for (let i = 0; i < 7; i++) {
        await b.evaluate("replaySpeedBtn.click()");
        seen.push(await b.evaluate(`[replayAudio.playbackRate, replaySpeedBtn.getAttribute("aria-label"), replaySpeedLabel.textContent, replaySpeedBtn.querySelector(".replay-pointer").style.getPropertyValue("--turn")].join("|")`));
      }
      const want = [[1.25, 0], [1.5, 40], [1.75, 80], [2, 120], [0.5, -120], [0.75, -80], [1, -40]].map(([s, d]) => `${s}|Playback speed, ${s}×|Speed ${s}×|${d}deg`);
      check("speed goes 1.25, 1.5, 1.75, 2, 0.5, 0.75, then 1 again, the pointer turning 40 degrees a step", seen.join() === want.join(), seen.join(" ; "));
      check("the voice keeps its pitch", await b.evaluate("replayAudio.preservesPitch === true"));
      // The dial as a slider for keyboards
      await b.evaluate("replaySeek.focus()");
      const key = async name => { const code = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 }[name];
        await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code: name, windowsVirtualKeyCode: code });
        await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }); await sleep(120); };
      const at = () => b.evaluate(`[Math.round(replayAudio.currentTime * 10) / 10, replayBox.querySelector('#replaySeek').getAttribute("aria-valuetext"), replayBox.querySelector('#replayTime').textContent].join("|")`);
      await key("Home");
      await key("ArrowRight");
      const a1 = await at();
      await key("ArrowLeft");
      const a2 = await at();
      await key("End");
      const a3 = await at();
      await key("Home");
      const a4 = await at();
      check("the dial: arrows move 5 s, Home and End go to the start and end, and the time is read out", a1 === "5|0:05 of 0:06|0:05 / 0:06" && a2 === "0|0:00 of 0:06|0:00 / 0:06" && a3 === "6|0:06 of 0:06|0:06 / 0:06" && a4 === "0|0:00 of 0:06|0:00 / 0:06", [a1, a2, a3, a4].join(" ; "));
      check("the dial shows keyboard focus", await b.evaluate(`getComputedStyle(document.querySelector(".replay-dial")).outlineStyle === "solid"`));
      // The end: it stops there, and Play starts again from 0
      await b.evaluate("replayPlayer.seekTo(5.2); replayPlayKey.click(); true");
      check("it stops at the end, the needle stays there", await b.waitFor("replayAudio.paused && replayAudio.ended", 6000) && (await b.evaluate("Number(replayBox.querySelector('#replaySeek').value)")) === 6);
      await b.evaluate("replayPlayKey.click()");
      await sleep(300);
      check("Play again starts from the beginning", await b.evaluate("!replayAudio.paused && replayAudio.currentTime < 1"));
      // Pausing: another tab, then leaving Backstage
      await b.evaluate("document.getElementById('tabNotes').click()");
      check("switching to Coach's notes pauses it", await b.evaluate("replayAudio.paused"));
      await openWords(b);
      await b.evaluate("replayPlayKey.click()");
      await b.waitFor("!replayAudio.paused", 3000);
      await b.evaluate("goToView('stage')");
      check("leaving Backstage pauses it", await b.waitFor("replayAudio.paused", 3000));
      await b.waitFor("currentView === 'stage' && !appRoot.inert", 5000);
      await b.evaluate("goToView('backstage')");
      await b.waitFor("currentView === 'backstage' && !appRoot.inert", 5000);
      await openWords(b);
      check("Back to the stage, then Backstage: the radio is still there", (await b.evaluate(RADIO)).radio);
      // Other results: the note instead
      await b.evaluate(`displayResult(${JSON.stringify(RESULT)}, "an-older-speech"); true`);
      await b.waitFor("!appRoot.inert", 5000);
      await openWords(b);
      r = await b.evaluate(RADIO);
      check("a result for another speech (as from the Coming back note): the note, no radio", !r.radio && r.gone && (await b.evaluate("replayGone.textContent")) === "Playback is only for the speech you just gave. Recordings are never saved, so past shows can be read but not played.", JSON.stringify(r));
      await shot(b, "replay-gone-laptop");
      await b.evaluate(`displayResult(${JSON.stringify(RESULT)}); true`);
      r = await b.evaluate(RADIO);
      check("displayResult() from the console: the note too", !r.radio && r.gone);
      await b.evaluate(`displayResult(${JSON.stringify({ ...RESULT, words: undefined })}); true`);
      r = await b.evaluate(RADIO);
      check("no words: neither the radio nor the note", !r.radio && !r.gone && (await b.evaluate(`wordsPanel.textContent.includes("isn't available")`)));
      // An older show on the Wall of Fame: the playbill is unchanged
      await b.evaluate("goToView('wall')");
      await b.waitFor("currentView === 'wall' && !appRoot.inert", 5000);
      await b.evaluate(`document.querySelector(".wall-row .playbill").click()`);
      await sleep(400);
      check("a Wall of Fame playbill: no radio and no note (replay stays in Backstage)", await b.evaluate(`!playbillDialog.hidden && !playbillDialog.contains(replayBox) && !playbillDialog.contains(replayGone)`));
      // A reload: no recording any more
      await b.send("Page.reload");
      await sleep(800);
      await b.waitFor("document.readyState === 'complete' && typeof micSupported !== 'undefined'", 15000);
      check("after a reload: no recording, no radio", await b.evaluate("replayRecording === null && !replayBox.isConnected || replayBox.hidden"));
    }
    await done(b);
  }
}

finish();
