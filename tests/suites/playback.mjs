// Feature set 3, stage 4: replay in Your words.
//   keep     the exact WAV that was sent stays in memory for the latest speech only, and nothing else frees it
//   radio    the console radio: where it shows, play and pause, speed, the dial, the end, pausing, sizes
//   words    the boxed word follows the time, the sentence stays bright, clicking a word, auto-scroll
//   always   no Hide replay or hint any more; an old stored choice is cleared and the radio shows
//   info     the "i" card in Backstage's Your words: what it says, opening and closing, sizes
//   space    one column: the summary, tabs and tab scroll as one area, with the tabs (and radio and legend) sticky
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
  playButtons: replayBox.querySelectorAll("button").length, glow: replayBox.classList.contains("is-playing") })`;
// The play knob (the only Play button)
const PLAY = "replayBox.querySelector('#replayPlayKnob').click()";
// Where the dial and the knobs are (nothing may move when the speed or the play state changes)
const PLACES = `[".replay-dial", "#replaySpeedBtn", "#replayPlayKnob", "#replaySpeedLabel", "#replayPlayLabel"].map(s => { const r = replayBox.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10]; })`;

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
        knobs: [...replayBox.querySelectorAll(".replay-knob")].map(k => k.offsetWidth + "x" + k.offsetHeight).join(), columns: [...replayBox.querySelectorAll(".replay-knob-box")].map(k => k.offsetWidth).join(),
        skips: [...replayBox.querySelectorAll(".replay-cloth > .replay-skip")].map(k => k.textContent + " " + k.offsetWidth + "x" + k.offsetHeight + " " + k.getAttribute("aria-label")).join(" | "),
        order: [...replayBox.querySelector(".replay-cloth").children].map(e => e.className).join(),
        noKeys: !replayBox.querySelector(".replay-keys, .replay-key, #replayPlayKey"), dial: replayBox.querySelector(".replay-dial").offsetHeight,
        height: Math.round(radio.height), labels: [replaySpeedLabel.textContent, replayPlayLabel.textContent].join() }; })()`);
    // Nothing of Your words reaches the buttons (the project's rule from backstage-layout: the open panel ends above
    // them, and they stay inside the mirror). If it doesn't all fit, the panel scrolls; the cloth always stays.
    for (const banner of [false, true]) {
      await b.evaluate(`trophyBanner.hidden = ${!banner}; true`);
      await sleep(150);
      // (one column: the shared scrolling area is what has to end above the buttons)
      const m = await b.evaluate(`(() => { const box = e => e.getBoundingClientRect(); const row = box(document.querySelector("#result .perf-buttons")), g = box(document.querySelector(".mirror-glass"));
        const one = backstageOneColumn.matches, p = box(one ? backstageScroll : wordsPanel);
        const kids = [...wordsPanel.children].filter(e => e.getClientRects().length).map(box);
        const spill = one ? getComputedStyle(backstageScroll).overflowY !== "auto" : wordsPanel.scrollHeight > wordsPanel.clientHeight + 1 && getComputedStyle(wordsPanel).overflowY === "visible";
        const back = box(backToStageBtn);
        return { above: p.bottom <= row.top + 0.5, spill, inMirror: back.top >= g.top - 0.5 && back.bottom <= g.bottom + 0.5,
          cloth: getComputedStyle(replayBox.querySelector(".replay-cloth")).display, scrolls: wordsPanel.scrollHeight > wordsPanel.clientHeight + 1,
          body: one ? 999 : Math.round(box(wordsPanel.querySelector(".words-body")).height) }; })()`);
      check(`${tag}${banner ? " with the trophy banner" : ""}: Your words ends above the buttons and never spills onto them, the cloth always there${w === 1280 && !banner ? ", nothing scrolls" : ""}`,
        m.above && !m.spill && m.inMirror && m.cloth === "flex" && (w !== 1280 || banner || !m.scrolls) && m.body >= 40, JSON.stringify(m));
    }
    await b.evaluate("trophyBanner.hidden = true; true");
    check(`${tag} the radio sits inside the window`, fit.radio, JSON.stringify(fit));
    check(`${tag} −5s and +5s in the cloth either side of the wordmark, 52x30, named for screen readers`, fit.order === "replay-skip,replay-wordmark,replay-skip"
      && fit.skips === "−5s 52x30 Back 5 seconds | +5s 52x30 Forward 5 seconds", JSON.stringify(fit));
    check(`${tag} no key row; knobs 44x44 in 56px columns; labels "1×" and "Play"; dial 48px`, fit.noKeys && fit.knobs === "44x44,44x44" && fit.columns === "56,56" && fit.labels === "1×,Play" && fit.dial === 48, JSON.stringify(fit));
    if (!phone) check(`${tag} the radio is about 120px tall`, fit.height >= 110 && fit.height <= 125, fit.height);
    if (phone) check(`${tag} the skip keys answer to taps across 44px`, await b.evaluate(`[...replayBox.querySelectorAll(".replay-skip")].every(k => { const r = k.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return [-21, 21].every(d => k === document.elementFromPoint(x, y + d)); })`));
    await shot(b, `replay-${tag}-paused`);

    // Play and pause from the knob; nothing moves as the state changes
    const placesBefore = JSON.stringify(await b.evaluate(PLACES));
    await b.evaluate(PLAY);
    await b.waitFor("!replayAudio.paused && replayAudio.currentTime > 0.3", 5000);
    r = await b.evaluate(RADIO);
    check(`${tag} the knob plays and reads Pause; the cloth glows; −5s, the speed knob, Play and +5s are the only buttons`, r.playing && r.knob === "true|Pause|Pause" && r.glow && r.playButtons === 4, JSON.stringify(r));
    await shot(b, `replay-${tag}-playing`);
    const placesPlaying = JSON.stringify(await b.evaluate(PLACES));
    await b.evaluate(PLAY);
    r = await b.evaluate(RADIO);
    check(`${tag} the knob pauses and reads Play again; no glow`, !r.playing && r.knob === "false|Play your speech|Play" && !r.glow, JSON.stringify(r));
    // Every speed: the dial and the knobs never move
    const placesSpeeds = [];
    for (let i = 0; i < 7; i++) {
      await b.evaluate("replaySpeedBtn.click()");
      placesSpeeds.push(JSON.stringify(await b.evaluate(PLACES)));
    }
    check(`${tag} nothing moves when the speed or the play state changes`, placesPlaying === placesBefore && placesSpeeds.every(p => p === placesBefore), placesBefore);

    if (w === 1280) {
      // Speed: all seven steps and back, the pointer turning, the pitch kept
      const seen = [];
      for (let i = 0; i < 7; i++) {
        await b.evaluate("replaySpeedBtn.click()");
        seen.push(await b.evaluate(`[replayAudio.playbackRate, replaySpeedBtn.getAttribute("aria-label"), replaySpeedLabel.textContent, replaySpeedBtn.querySelector(".replay-pointer").style.getPropertyValue("--turn")].join("|")`));
      }
      const want = [[1.25, 0], [1.5, 40], [1.75, 80], [2, 120], [0.5, -120], [0.75, -80], [1, -40]].map(([s, d]) => `${s}|Playback speed, ${s}×|${s}×|${d}deg`);
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
      await b.evaluate("replayPlayer.seekTo(5.2); replayBox.querySelector('#replayPlayKnob').click(); true");
      check("it stops at the end, the needle stays there", await b.waitFor("replayAudio.paused && replayAudio.ended", 6000) && (await b.evaluate("Number(replayBox.querySelector('#replaySeek').value)")) === 6);
      await b.evaluate("replayBox.querySelector('#replayPlayKnob').click()");
      await sleep(300);
      check("Play again starts from the beginning", await b.evaluate("!replayAudio.paused && replayAudio.currentTime < 1"));
      // Pausing: another tab, then leaving Backstage
      await b.evaluate("document.getElementById('tabNotes').click()");
      check("switching to Coach's notes pauses it", await b.evaluate("replayAudio.paused"));
      await openWords(b);
      await b.evaluate("replayBox.querySelector('#replayPlayKnob').click()");
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
      await b.waitFor(`!!wordsPanel.querySelector("mark.is-heard")`, 2000);
      check("marks keep their own look under the box", await b.evaluate(`(() => { const m = wordsPanel.querySelector("mark.is-heard"); return !!m && getComputedStyle(m).backgroundColor !== "rgba(217, 174, 82, 0.3)" && getComputedStyle(m).boxShadow.includes("rgb(217, 174, 82)"); })()`));
      check("the hostile word stays text", await b.evaluate("!window.__xss && !wordsPanel.querySelector('.words-text img')"));
      // Playing at 2×: the box is always on the word whose time has come
      await b.evaluate(`replaySpeedBtn.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); replayPlayer.seekTo(6.6); replayBox.querySelector('#replayPlayKnob').click(); true`);
      await b.waitFor("!replayAudio.paused && replayAudio.currentTime > 7.2", 5000);
      const follow = await b.evaluate(`(() => { const t = replayAudio.currentTime * 100; const items = [...wordsPanel.querySelectorAll(".words-text [data-s]")];
        const want = items.filter(e => Number(e.dataset.t) <= t).pop(); return { rate: replayAudio.playbackRate, t: Math.round(t), heard: wordsPanel.querySelector(".is-heard") === want || Math.abs(Number(want.dataset.t) - t) < 30 }; })()`);
      check("at 2× the box keeps up with the time", follow.rate === 2 && follow.t > 700 && follow.heard, JSON.stringify(follow));
      await b.evaluate("replayBox.querySelector('#replayPlayKnob').click(); replaySpeedBtn.click(); replaySpeedBtn.click(); replaySpeedBtn.click(); true");
      // Clicking a word jumps there; it keeps the play state
      const clickWord = word => b.evaluate(`(() => { const e = [...wordsPanel.querySelectorAll(".words-text [data-t]")].find(x => x.firstChild && x.firstChild.textContent === ${JSON.stringify(word)});
        const r = e.getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; })()`);
      let [x, y] = await clickWord("better");
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(200);
      r = await b.evaluate(HEARD);
      check("paused: a click on a word jumps there and stays paused", r.word === "better" && await b.evaluate("replayAudio.paused && Math.abs(replayAudio.currentTime - 2.2) < 0.05"), JSON.stringify(r));
      await b.evaluate("replayBox.querySelector('#replayPlayKnob').click()");
      await b.waitFor("!replayAudio.paused", 3000);
      [x, y] = await b.evaluate(`(() => { const r = wordsPanel.querySelector(".words-text .w-pause").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(150);
      check("playing: a click on the long pause jumps to where it starts and keeps playing", await b.evaluate("!replayAudio.paused && replayAudio.currentTime >= 3.2 && replayAudio.currentTime < 3.9"), await b.evaluate("replayAudio.currentTime"));
      await b.evaluate("replayBox.querySelector('#replayPlayKnob').click()");
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
  await b.evaluate("replayPlayer.seekTo(1); replayBox.querySelector('#replayPlayKnob').click(); true");
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
  await b.evaluate("replayBox.querySelector('#replayPlayKnob').click()");
  await done(b);
}

// ---------------------------------------------------------------- the radio always shows (Hide replay is gone)
if (!only || only === "always") {
  console.log("\n== no Hide replay, no hint; an old stored choice is cleared");
  const b = await open({ pre: [`localStorage.setItem("speakreview.replay", "hidden");`] });
  check("the old \"hidden\" choice is cleared when the page loads", (await b.evaluate(`localStorage.getItem("speakreview.replay")`)) === null);
  await sendAndShow(b, 6);
  await openWords(b);
  const r = await b.evaluate(`({ radio: replayBox.isConnected && !replayBox.hidden, hint: !!document.querySelector(".replay-hint, .replay-tools, .replay-toggle"),
    text: /Hide replay|Show replay|any word to hear it/.test(document.body.textContent) })`);
  check("the radio shows; no hint row and no Hide replay / Show replay anywhere", r.radio && !r.hint && !r.text, JSON.stringify(r));
  await done(b);
}

// ---------------------------------------------------------------- the "i" card
const INFO = `(() => { const btn = wordsPanel.querySelector(".words-info-btn"), card = wordsPanel.querySelector(".words-info"), tip = card.querySelector(".words-info-tip");
  const legend = wordsPanel.querySelector(".words-legend"), kids = [...legend.children];
  return { open: !card.hidden, expanded: btn.getAttribute("aria-expanded"), name: btn.getAttribute("aria-label"), lastItem: kids[kids.length - 2] === btn && kids[kids.length - 1] === card,
    tip: tip.hidden ? null : tip.textContent, items: [...card.querySelectorAll("li")].map(e => e.textContent), focus: document.activeElement === btn,
    textTop: Math.round(wordsPanel.querySelector(".words-text").getBoundingClientRect().top), note: !!wordsPanel.querySelector(".words-note") }; })()`;
const BULLETS = ["Dotted words are marked only when used as filler.", "Pauses of 3 seconds or more are shown, but they're not mistakes. A pause is better than saying \"um\".",
  "Unclear words are ones the transcription wasn't sure about."];

if (!only || only === "info") {
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const phone = w <= 600;
    const tag = phone ? "phone" : "laptop";
    console.log(`
== the "i" card (${tag})`);
    const b = await open({ width: w, height: h, pre: [`window.__result = ${JSON.stringify({ ...RESULT, fillers_judged: true, filler_flags: [] })};`] });
    await sendAndShow(b, 6);
    await openWords(b);
    let r = await b.evaluate(INFO);
    check(`${tag} the "i" button at the end of the legend, named "What the marks mean"; the card starts closed; no grey note`, r.lastItem && !r.open && r.expanded === "false" && r.name === "What the marks mean" && !r.note, JSON.stringify(r));
    const top = await b.evaluate(`Math.round(wordsPanel.querySelector(".words-text").getBoundingClientRect().top - wordsPanel.querySelector(".words-legend").getBoundingClientRect().bottom)`);
    const click = async sel => { const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (phone) { await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      else { await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); }
      await sleep(200); };
    await click(".words-info-btn");
    r = await b.evaluate(INFO);
    check(`${tag} opened: the bold tip "${phone ? "Tap" : "Click"} any word to jump there in the replay." and the three lines`, r.open && r.expanded === "true"
      && r.tip === `${phone ? "Tap" : "Click"} any word to jump there in the replay.` && JSON.stringify(r.items) === JSON.stringify(BULLETS), JSON.stringify(r));
    // It lies over the words (they don't move inside the panel), and the whole card can be seen
    await sleep(500);
    const box = await b.evaluate(`(() => { const c = wordsPanel.querySelector(".words-info").getBoundingClientRect(), l = wordsPanel.querySelector(".words-legend").getBoundingClientRect(), p = (backstageOneColumn.matches ? backstageScroll : wordsPanel).getBoundingClientRect();
      const t = wordsPanel.querySelector(".words-text").getBoundingClientRect(), lg = l;
      return { w: Math.round(c.width), left: Math.round(c.left - l.left), right: Math.round(l.right - c.right), inside: c.left >= 0 && c.right <= innerWidth && c.top >= p.top - 0.5 && c.bottom <= p.bottom + 0.5,
        textUnderLegend: Math.round(t.top - lg.bottom) }; })()`);
    check(`${tag} the card lies over the words without pushing them down`, box.textUnderLegend === top, `${top} -> ${box.textUnderLegend}`);
    check(`${tag} ${phone ? "full width" : "340px wide, on the right"}, all of it in view`, box.inside && (phone ? box.left === 0 && box.right === 0 : box.w === 340 && box.right === 0), JSON.stringify(box));
    await shot(b, `info-${tag}`);
    // The colours on the card
    const ratio = await b.evaluate(`(() => { const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); const bg = [42, 23, 18];
      return [".words-info li", ".words-info-tip"].map(sel => { const c = getComputedStyle(wordsPanel.querySelector(sel)).color.match(/[\\d.]+/g).map(Number); return +((L(c) + 0.05) / (L(bg) + 0.05)).toFixed(2); }); })()`);
    check(`${tag} the card's text at least 4.5:1`, ratio.every(x => x >= 4.5), JSON.stringify(ratio));
    // Closing: the button again, Escape, outside
    await click(".words-info-btn");
    check(`${tag} the button closes it`, !(await b.evaluate(INFO)).open);
    await click(".words-info-btn");
    await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(150);
    r = await b.evaluate(INFO);
    check(`${tag} Escape closes it and focus goes back to the button`, !r.open && r.expanded === "false" && r.focus, JSON.stringify(r));
    await click(".words-info-btn");
    await click(".perf-summary");
    check(`${tag} a ${phone ? "tap" : "click"} outside closes it`, !(await b.evaluate(INFO)).open);
    // Starts closed each time Backstage opens
    await click(".words-info-btn");
    await b.evaluate("goToView('stage')");
    await b.waitFor("currentView === 'stage' && !appRoot.inert", 5000);
    await b.evaluate("goToView('backstage')");
    await b.waitFor("currentView === 'backstage' && !appRoot.inert", 5000);
    check(`${tag} closed again when Backstage opens again`, !(await b.evaluate(INFO)).open);
    if (phone) {
      const hit = await b.evaluate(`(() => { const btn = wordsPanel.querySelector(".words-info-btn"), r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return [[-21, 0], [21, 0], [0, -21], [0, 21]].every(([dx, dy]) => btn === document.elementFromPoint(x + dx, y + dy)); })()`);
      check("phone: the 22px button answers to taps across 44px", hit);
    } else {
      // A past show: the card has no tip
      await b.evaluate(`displayResult(${JSON.stringify({ ...RESULT, fillers_judged: true, filler_flags: [] })}, "an-older-speech"); true`);
      await b.waitFor("!appRoot.inert", 5000);
      await openWords(b);
      await click(".words-info-btn");
      r = await b.evaluate(INFO);
      check("a past show: the card opens without the replay tip", r.open && r.tip === null && r.items.length === 3, JSON.stringify(r));
    }
    await done(b);
  }
}

// ---------------------------------------------------------------- one scrolling area (one column)
const LONG_WORDS = Array.from({ length: 200 }, (_, i) => [i % 12 === 11 ? "end." : (i % 7 === 3 ? "um" : "word"), i * 30, i * 30 + 20, 95]);
const LONG_NOTES = "Strengths:\n" + Array.from({ length: 10 }, (_, i) => `${i + 1}. A strength about the speech, number ${i + 1}, with some words.`).join("\n");
const REVIEW = { structure: { level: 3, reason: "Clear start and end." }, clarity: { level: 2, reason: "Some words ran together." },
  on_topic: { level: 4, reason: "Stayed on the question." }, word_choice: { level: 3, reason: "Plain and direct." } };
const SPACE_RESULT = { ...RESULT, words: LONG_WORDS, ai_feedback: LONG_NOTES, review: REVIEW };
// Where things are, relative to the top of the shared scrolling area
const SPACE = `(() => { const area = backstageScroll.getBoundingClientRect(), box = e => e.getBoundingClientRect(), rel = e => Math.round(box(e).top - area.top);
  const head = document.querySelector("#result .notes-head"), legend = wordsPanel.querySelector(".words-legend");
  return { top: backstageScroll.scrollTop, header: backstageHeaderHeight(), tabs: rel(head), tabsBottom: Math.round(box(head).bottom - area.top),
    radio: replayBox.isConnected && !replayBox.hidden && !wordsPanel.hidden ? [rel(replayBox), Math.round(box(replayBox).bottom - area.top)] : null,
    legend: legend && !wordsPanel.hidden ? [rel(legend), Math.round(box(legend).bottom - area.top)] : null,
    stuck: backstageScroll.classList.contains("is-stuck"), scrolled: backstageScroll.classList.contains("is-scrolled"),
    fade: getComputedStyle(backstageScroll).getPropertyValue("--fade-top").trim(),
    bg: [head, legend].filter(e => e && e.getClientRects().length).map(e => getComputedStyle(e).backgroundColor) }; })()`;

if (!only || only === "space") {
  for (const [w, h] of [[390, 780], [360, 740]]) {
    console.log(`\n== one scrolling area (${w}x${h})`);
    const b = await open({ width: w, height: h, pre: [`window.__result = ${JSON.stringify(SPACE_RESULT)};`] });
    await sendAndShow(b, 60);
    await b.evaluate("trophyBanner.hidden = true; true");
    const layout = await b.evaluate(`(() => { const area = backstageScroll.getBoundingClientRect(), row = document.querySelector("#result .perf-buttons").getBoundingClientRect();
      return { inside: backstageScroll.contains(perfSummary) && backstageScroll.contains(document.querySelector("#result .notes-head")) && !backstageScroll.contains(backToStageBtn),
        above: area.bottom <= row.top + 0.5, scrolls: getComputedStyle(backstageScroll).overflowY, bar: backstageScroll.offsetWidth - backstageScroll.clientWidth,
        hint: [...perfSummary.querySelectorAll(".stat-hint")].map(e => getComputedStyle(e).display).join(), sideways: document.documentElement.scrollWidth - innerWidth }; })()`);
    check(`${w}x${h} the summary, tabs and tab scroll together; the buttons stay below, outside it; no scrollbar, nothing sideways`,
      layout.inside && layout.above && layout.scrolls === "auto" && layout.bar === 0 && layout.sideways <= 0, JSON.stringify(layout));
    check(`${w}x${h} no "How clearly your words came through" in this layout`, layout.hint === "none", layout.hint);
    for (const tab of ["tabNotes", "tabWords", "tabReview"]) {
      await b.evaluate(`backstageScroll.scrollTop = 0; document.getElementById("${tab}").click(); true`);
      await sleep(250);
      let r = await b.evaluate(SPACE);
      check(`${w}x${h} ${tab}: at the top the summary shows and the tabs sit under it`, r.top === 0 && r.tabs > 100 && !r.stuck && r.fade === "0px", JSON.stringify(r));
      await b.evaluate("backstageScroll.scrollTop = 40; true");
      await sleep(250);
      r = await b.evaluate(SPACE);
      check(`${w}x${h} ${tab}: scrolled a little: the 16px top fade, tabs not stuck yet`, r.scrolled && !r.stuck && r.fade === "16px", JSON.stringify(r));
      await b.evaluate("backstageScroll.scrollTop = 700; true");
      await sleep(300);
      r = await b.evaluate(SPACE);
      const words = tab === "tabWords";
      check(`${w}x${h} ${tab}: scrolled: the tabs stick at the top${words ? ", the radio and legend right under them" : ""}, on #1E0F0C, no top fade`,
        r.top >= r.header && r.tabs === 0 && r.stuck && r.fade === "0px" && r.bg.every(c => c === "rgb(30, 15, 12)")
        && (!words || (r.radio && Math.abs(r.radio[0] - r.tabsBottom) <= 1 && Math.abs(r.legend[0] - r.radio[1]) <= 1)), JSON.stringify(r));
      await shot(b, `space-${w}-${tab}`);
    }
    // Switching tabs never moves the tabs
    for (const [from, to] of [["tabWords", "tabNotes"], ["tabNotes", "tabReview"], ["tabReview", "tabWords"]]) {
      await b.evaluate(`document.getElementById("${from}").click(); backstageScroll.scrollTop = 700; true`);
      await sleep(250);
      const before = await b.evaluate(SPACE);
      await b.evaluate(`document.getElementById("${to}").click()`);
      await sleep(250);
      const after = await b.evaluate(SPACE);
      check(`${w}x${h} scrolled: ${from} to ${to} keeps the tabs exactly in place, the summary still away`, before.tabs === 0 && after.tabs === 0 && after.top === after.header, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      await b.evaluate(`backstageScroll.scrollTop = 0; document.getElementById("${from}").click(); true`);
      await sleep(150);
      await b.evaluate(`document.getElementById("${to}").click()`);
      await sleep(250);
      check(`${w}x${h} at the top: ${from} to ${to} keeps the summary showing`, (await b.evaluate(SPACE)).top === 0);
    }
    // The "i" card opens under the sticky block, all of it in view
    await b.evaluate(`document.getElementById("tabWords").click(); backstageScroll.scrollTop = 700; true`);
    await sleep(250);
    await b.evaluate(`wordsPanel.querySelector(".words-info-btn").click()`);
    await sleep(300);
    const card = await b.evaluate(`(() => { const c = wordsPanel.querySelector(".words-info").getBoundingClientRect(), l = wordsPanel.querySelector(".words-legend").getBoundingClientRect(), a = backstageScroll.getBoundingClientRect();
      return { below: c.top >= l.bottom - 0.5 - (c.top - l.bottom < 0 ? 0 : 0), inView: c.bottom <= a.bottom + 0.5, top: !!document.elementFromPoint(c.left + 20, c.top + 12).closest(".words-info") }; })()`);
    check(`${w}x${h} the "i" card opens under the sticky block, fully in view, nothing over it`, card.inView && card.top, JSON.stringify(card));
    await shot(b, `space-${w}-info`);
    await b.evaluate(`wordsPanel.querySelector(".words-info-btn").click()`);
    // Auto-scroll while playing keeps the gold box below the sticky block; scrolling by hand pauses it
    await b.evaluate(`backstageScroll.scrollTop = 0; replayPlayer.seekTo(1); ${PLAY}; true`);
    await b.waitFor("!replayAudio.paused", 3000);
    await b.evaluate("replayPlayer.seekTo(40); true");
    await sleep(1500);
    const seen = await b.evaluate(`(() => { const e = wordsPanel.querySelector(".is-heard").getBoundingClientRect(), l = wordsPanel.querySelector(".words-legend").getBoundingClientRect(), a = backstageScroll.getBoundingClientRect();
      return { below: e.top >= l.bottom - 0.5, above: e.bottom <= a.bottom, top: backstageScroll.scrollTop }; })()`);
    check(`${w}x${h} while playing, the area scrolls to keep the gold box in view below the sticky block`, seen.below && seen.above && seen.top > 0, JSON.stringify(seen));
    const [x, y] = await b.evaluate(`(() => { const r = backstageScroll.getBoundingClientRect(); return [r.left + 40, r.bottom - 60]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: -300 });
    await sleep(500);
    const handTop = await b.evaluate("backstageScroll.scrollTop");
    await b.evaluate("replayPlayer.seekTo(55); true");
    await sleep(1200);
    check(`${w}x${h} after scrolling by hand, the area stays where it was put`, Math.abs((await b.evaluate("backstageScroll.scrollTop")) - handTop) < 2, handTop);
    await b.evaluate(PLAY);
    // A past show (no radio): only the tabs and the legend stick
    await b.evaluate(`displayResult(${JSON.stringify(SPACE_RESULT)}, "an-older-speech"); true`);
    await b.waitFor("!appRoot.inert", 5000);
    await b.evaluate(`document.getElementById("tabWords").click(); backstageScroll.scrollTop = 700; true`);
    await sleep(300);
    const past = await b.evaluate(SPACE);
    check(`${w}x${h} no recording: the tabs and the legend stick, no radio`, past.radio === null && past.tabs === 0 && past.legend && Math.abs(past.legend[0] - past.tabsBottom) <= 1, JSON.stringify(past));
    await done(b);
  }

  for (const [w, h] of [[1280, 800], [1093, 526]]) {
    console.log(`\n== laptop keeps two columns, legend on one line (${w}x${h})`);
    const b = await open({ width: w, height: h, pre: [`window.__result = ${JSON.stringify(SPACE_RESULT)};`] });
    await sendAndShow(b, 60);
    check(`${w}x${h}: the scrolling area has no box of its own, and Clarity keeps its line`, await b.evaluate(`getComputedStyle(backstageScroll).display === "contents" && [...perfSummary.querySelectorAll(".stat-hint")].some(e => getComputedStyle(e).display !== "none" && e.getClientRects().length > 0)`));
    await b.evaluate(`document.getElementById("tabWords").click(); true`);
    await sleep(250);
    const l = await b.evaluate(`(() => { const legend = wordsPanel.querySelector(".words-legend"), keys = [...legend.querySelectorAll(".words-key")], info = legend.querySelector(".words-info-btn");
      const mid = e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }, rows = [...keys, info].map(mid);
      return { oneRow: Math.max(...rows) - Math.min(...rows) <= 4, shown: keys.map(k => k.querySelector(".short-label").getClientRects().length ? k.querySelector(".short-label").textContent : null),
        long: keys.map(k => { const e = k.querySelector(".long-label"); return [e.textContent, e.getBoundingClientRect().width <= 1]; }), gap: getComputedStyle(legend).gap }; })()`);
    check(`${w}x${h}: legend items and the "i" on one row`, l.oneRow, JSON.stringify(l));
    check(`${w}x${h}: short labels shown, like "Filler 5", with 6px 12px gaps`, l.shown.every(t => t && /^[A-Za-z ]+ \d+$/.test(t)) && l.gap === "6px 12px", JSON.stringify(l.shown) + " " + l.gap);
    check(`${w}x${h}: the long labels stay for screen readers only`, l.long.every(([t, hidden]) => /, \d+$/.test(t) && hidden), JSON.stringify(l.long));
    await shot(b, `space-legend-${w}x${h}`);
    await done(b);
  }
}

finish();
