// Feature set 3, stage 4: replay in Your words.
//   keep     the exact WAV that was sent stays in memory for the latest speech only, and nothing else frees it
//   radio    the console radio: where it shows, play and pause, speed, the dial, the end, pausing, sizes
//   words    the boxed word follows the time, the sentence stays bright, clicking a word, auto-scroll
//   hide     Hide replay and Show replay, remembered on the device
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
  const shown = await b.waitFor("currentView === 'backstage' && !intermissionOn && !appRoot.inert && !document.body.classList.contains('curtains-closed')", 20000);
  await sleep(1000);       // the curtains finish opening, then the page puts focus on Coach's notes
  return shown;
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

// ---------------------------------------------------------------- the words follow the replay
// What is boxed and bright now
const HEARD = `(() => { const t = wordsPanel.querySelector(".words-text"); const heard = t.querySelectorAll(".is-heard");
  const dim = [...t.querySelectorAll(".w:not(.is-sentence)")].map(e => getComputedStyle(e).color);
  const bright = [...t.querySelectorAll(".w.is-sentence:not(.is-heard)")].map(e => getComputedStyle(e).color);
  return { live: t.classList.contains("is-live"), count: heard.length, word: heard[0] ? heard[0].firstChild.textContent : null, box: heard[0] ? getComputedStyle(heard[0]).boxShadow : "",
    dim: [...new Set(dim)], bright: [...new Set(bright)], sentence: [...t.querySelectorAll(".is-sentence")].map(e => e.firstChild.textContent).join(" ") }; })()`;

if (!only || only === "words") {
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const phone = w <= 600;
    const tag = phone ? "phone" : "laptop";
    console.log(`\n== the words follow the replay (${tag})`);
    const b = await open({ width: w, height: h });
    await sendAndShow(b, 14);
    await openWords(b);
    let r = await b.evaluate(HEARD);
    check(`${tag} before playing: the first word boxed, the first sentence bright, other plain words dimmed`, r.live && r.count === 1 && r.word === "So" && r.box.includes("rgb(217, 174, 82)")
      && r.sentence === "So um, I think failure is a better teacher." && r.dim.join() === "rgb(184, 164, 140)" && r.bright.join() === "rgb(232, 216, 192)", JSON.stringify(r));
    check(`${tag} the hint: "${phone ? "Tap" : "Click"} any word to hear it"`, await b.evaluate(`[...wordsPanel.querySelectorAll(".replay-hint > span")].filter(e => getComputedStyle(e).display !== "none" && getComputedStyle(e).position !== "absolute").map(e => e.textContent).join("")`) === (phone ? "Tap any word to hear it" : "Click any word to hear it"));
    if (!phone) {
      // The dimmed colour on the lightest part of the panel (#1E0F0C under a 5% white sheen)
      const ratio = await b.evaluate(`(() => { const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); const bg = [30, 15, 12].map(v => 255 * 0.05 + v * 0.95), fg = [184, 164, 140];
        return +((L(fg) + 0.05) / (L(bg) + 0.05)).toFixed(2); })()`);
      check(`the dimmed words (#B8A48C) pass 4.5:1 on the panel`, ratio >= 4.5, ratio);
      // The box follows the time
      for (const [at, word] of [[0.85, "I"], [2.7, "teacher."], [6.7, "Umm"], [9.45, "<img src=x onerror=window.__xss=1>"], [12.7, "end."]]) {
        await b.evaluate(`replayPlayer.seekTo(${at}); true`);
        // the box moves once the seek has landed
        await b.waitFor(`(wordsPanel.querySelector(".is-heard") || {}).firstChild?.textContent === ${JSON.stringify(word)}`, 2000);
        r = await b.evaluate(HEARD);
        check(`at ${at} s the box is on "${word}"`, r.count === 1 && r.word === word, r.word);
      }
      await b.evaluate("replayPlayer.seekTo(6.7); true");
      await sleep(150);
      check("marks keep their own look under the box", await b.evaluate(`(() => { const m = wordsPanel.querySelector("mark.is-heard"); return !!m && getComputedStyle(m).backgroundColor !== "rgba(217, 174, 82, 0.3)" && getComputedStyle(m).boxShadow.includes("rgb(217, 174, 82)"); })()`));
      check("the hostile word stays text", await b.evaluate("!window.__xss && !wordsPanel.querySelector('.words-text img')"));
      // Playing at 2×: the box is always on the word whose time has come
      await b.evaluate(`replaySpeedBtn.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); replayPlayer.seekTo(6.6); replayPlayKey.click(); true`);
      await sleep(900);
      const follow = await b.evaluate(`(() => { const t = replayAudio.currentTime * 100; const items = [...wordsPanel.querySelectorAll(".words-text [data-s]")];
        const want = items.filter(e => Number(e.dataset.t) <= t).pop(); return { rate: replayAudio.playbackRate, t: Math.round(t), heard: wordsPanel.querySelector(".is-heard") === want || Math.abs(Number(want.dataset.t) - t) < 30 }; })()`);
      check("at 2× the box keeps up with the time", follow.rate === 2 && follow.t > 700 && follow.heard, JSON.stringify(follow));
      await b.evaluate("replayPlayKey.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); true");
      // Clicking a word jumps there; it keeps the play state
      const clickWord = word => b.evaluate(`(() => { const e = [...wordsPanel.querySelectorAll(".words-text [data-t]")].find(x => x.firstChild && x.firstChild.textContent === ${JSON.stringify(word)});
        const r = e.getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; })()`);
      let [x, y] = await clickWord("better");
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(200);
      r = await b.evaluate(HEARD);
      check("paused: a click on a word jumps there and stays paused", r.word === "better" && await b.evaluate("replayAudio.paused && Math.abs(replayAudio.currentTime - 2.2) < 0.05"), JSON.stringify(r));
      await b.evaluate("replayPlayKey.click()");
      await b.waitFor("!replayAudio.paused", 3000);
      [x, y] = await b.evaluate(`(() => { const r = wordsPanel.querySelector(".words-text .w-pause").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(150);
      check("playing: a click on the long pause jumps to where it starts and keeps playing", await b.evaluate("!replayAudio.paused && replayAudio.currentTime >= 3.2 && replayAudio.currentTime < 3.9"), await b.evaluate("replayAudio.currentTime"));
      await b.evaluate("replayPlayKey.click()");
      check("the words are not Tab stops", await b.evaluate(`[...wordsPanel.querySelectorAll(".words-text [data-t]")].every(e => e.tabIndex < 0 && !e.matches("button, a, [tabindex]"))`));
    }
    await done(b);
  }

  console.log("\n== scrolling: only when the boxed word would leave view, and not after scrolling by hand");
  const b = await open({ width: 1280, height: 800 });
  // A long speech: 300 words over about 100 s, so the transcript must scroll
  const long = Array.from({ length: 300 }, (_, i) => [i % 12 === 11 ? "end." : "word", i * 33, i * 33 + 25, 95]);
  await b.evaluate(`window.__result = ${JSON.stringify({ ...RESULT, words: long })}; true`);
  await sendAndShow(b, 100);
  await openWords(b);
  const scroll = () => b.evaluate("wordsPanel.querySelector('.words-body').scrollTop");
  const inView = () => b.evaluate(`(() => { const v = wordsPanel.querySelector(".words-body").getBoundingClientRect(), e = wordsPanel.querySelector(".is-heard").getBoundingClientRect(); return e.top >= v.top && e.bottom <= v.bottom - 40; })()`);
  await b.evaluate("replayPlayer.seekTo(1); replayPlayKey.click(); true");
  await sleep(600);
  check("near the top: no scrolling while the boxed word is in view", (await scroll()) === 0);
  await b.evaluate("replayPlayer.seekTo(60); true");
  await sleep(1200);
  const s1 = await scroll();
  check("the boxed word leaves view: the transcript scrolls to show it", s1 > 0 && await inView(), s1);
  // Scrolling by hand (the mouse wheel) while it plays
  const [wx, wy] = await b.evaluate(`(() => { const r = wordsPanel.querySelector(".words-body").getBoundingClientRect(); return [r.left + 40, r.top + 20]; })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: wx, y: wy, deltaX: 0, deltaY: -2000 });
  await sleep(400);
  const s2 = await scroll();
  await b.evaluate("replayPlayer.seekTo(90); true");
  await sleep(1200);
  check("after scrolling by hand, auto-scrolling waits (the transcript stays where it was put)", s2 < s1 && Math.abs((await scroll()) - s2) < 2, `${s1} > ${s2}, now ${await scroll()}`);
  // A word click brings it back
  const [cx, cy] = await b.evaluate(`(() => { const r = wordsPanel.querySelector(".words-text [data-t]").getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
  await b.evaluate("replayPlayer.seekTo(80); true");
  await sleep(1200);
  check("a word click starts auto-scrolling again", await inView());
  await b.evaluate("replayPlayKey.click()");
  await done(b);
}

// ---------------------------------------------------------------- Hide replay
const TOOLS = `(() => { const t = wordsPanel.querySelector(".replay-toggle"); const text = wordsPanel.querySelector(".words-text");
  return { toggle: t ? t.textContent : null, radio: replayBox.isConnected && !replayBox.hidden, live: !!text && text.classList.contains("is-live"), heard: wordsPanel.querySelectorAll(".is-heard").length,
    dim: !!text && [...text.querySelectorAll(".w")].some(e => getComputedStyle(e).color === "rgb(184, 164, 140)"),
    hint: !!wordsPanel.querySelector(".replay-hint") && !wordsPanel.querySelector(".replay-hint").hidden, gone: replayGone.isConnected && !replayGone.hidden,
    stored: (() => { try { return localStorage.getItem("speakreview.replay"); } catch (e) { return "blocked"; } })(), focus: document.activeElement === t }; })()`;

if (!only || only === "hide") {
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const tag = w <= 600 ? "phone" : "laptop";
    console.log(`\n== Hide replay (${tag})`);
    const b = await open({ width: w, height: h });
    await sendAndShow(b, 14);
    await openWords(b);
    let r = await b.evaluate(TOOLS);
    check(`${tag} with a recording: "Hide replay" at the end of the legend row`, r.toggle === "Hide replay" && r.radio && r.live && r.hint && r.stored === null
      && (await b.evaluate(`wordsPanel.querySelector(".words-legend").lastElementChild.classList.contains("replay-tools")`)), JSON.stringify(r));
    if (w <= 600) check("phone: the link is at least 44px tall, on the hint's line", await b.evaluate(`(() => { const t = wordsPanel.querySelector(".replay-toggle").getBoundingClientRect(), hint = wordsPanel.querySelector(".replay-hint").getBoundingClientRect();
      return t.height >= 44 && Math.abs((t.top + t.bottom) / 2 - (hint.top + hint.bottom) / 2) < 4 && t.left > hint.right; })()`));
    // Set a place and a speed, play, then hide
    await b.evaluate(`replaySpeedBtn.click(); replaySpeedBtn.click(); replayPlayer.seekTo(3); replayPlayKey.click(); true`);
    await b.waitFor("!replayAudio.paused", 3000);
    await b.evaluate("wordsPanel.querySelector('.replay-toggle').click()");
    await sleep(200);
    r = await b.evaluate(TOOLS);
    const at = await b.evaluate("replayAudio.currentTime");
    check(`${tag} Hide replay: no radio, paused, no box, no dimming, no hint; the link reads Show replay and keeps focus; remembered`,
      !r.radio && !r.live && r.heard === 0 && !r.dim && !r.hint && !r.gone && r.toggle === "Show replay" && r.focus && r.stored === "hidden" && (await b.evaluate("replayAudio.paused")), JSON.stringify(r));
    const [x, y] = await b.evaluate(`(() => { const e = wordsPanel.querySelector(".words-text [data-t]"); const r = e.getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(150);
    check(`${tag} while hidden, clicking a word does nothing`, Math.abs((await b.evaluate("replayAudio.currentTime")) - at) < 0.01);
    await shot(b, `replay-hidden-${tag}`);
    await b.evaluate("wordsPanel.querySelector('.replay-toggle').click()");
    await sleep(200);
    r = await b.evaluate(TOOLS);
    check(`${tag} Show replay: everything back, at the same place and speed`, r.radio && r.live && r.heard === 1 && r.hint && r.toggle === "Hide replay" && r.stored === null && r.focus
      && Math.abs((await b.evaluate("replayAudio.currentTime")) - at) < 0.01 && (await b.evaluate("replayAudio.playbackRate")) === 1.5
      && (await b.evaluate("wordsPanel.firstElementChild === replayBox")), JSON.stringify(r));
    await done(b);
  }

  console.log("\n== Hide replay is remembered");
  const b = await open();
  await sendAndShow(b, 6);
  await openWords(b);
  await b.evaluate("wordsPanel.querySelector('.replay-toggle').click()");
  await b.send("Page.reload");
  await sleep(800);
  await b.waitFor("document.readyState === 'complete' && typeof micSupported !== 'undefined'", 15000);
  await sendAndShow(b, 6);
  await openWords(b);
  let r = await b.evaluate(TOOLS);
  check("after a reload and a new speech: still hidden, the link reads Show replay", !r.radio && !r.live && r.toggle === "Show replay" && r.stored === "hidden", JSON.stringify(r));
  await b.evaluate(`displayResult(${JSON.stringify(RESULT)}, "an-older-speech"); true`);
  await b.waitFor("!appRoot.inert", 5000);
  r = await b.evaluate(TOOLS);
  check("a result without a recording: no link at all, just the note", r.toggle === null && r.gone && !r.radio, JSON.stringify(r));
  await done(b);

  console.log("\n== storage blocked");
  const BLOCK = `Storage.prototype.getItem = function () { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.setItem = function () { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.removeItem = function () { throw new DOMException("blocked", "SecurityError"); };`;
  const c = await open({ pre: [BLOCK] });
  await sendAndShow(c, 6);
  await openWords(c);
  r = await c.evaluate(TOOLS);
  check("blocked storage: shown by default", r.radio && r.toggle === "Hide replay", JSON.stringify(r));
  await c.evaluate("wordsPanel.querySelector('.replay-toggle').click()");
  check("and hiding still works", !(await c.evaluate(TOOLS)).radio);
  await done(c);
}

finish();
