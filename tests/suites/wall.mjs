import { launch, sleep } from "../lib/cdp.mjs";
import { readFileSync } from "node:fs";
import { LIVE, SHOTS } from "../lib/paths.mjs";
const URL_ = LIVE;
const SEED = readFileSync(new URL("../lib/seed.js", import.meta.url), "utf8");
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
// Screenshots go to .output/shots, never next to the suite
const OUT = SHOTS + "/";
const only = process.argv[2];
let failures = 0;
const open = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + (typeof detail === "string" ? detail : JSON.stringify(detail)) + ")" : ""}`);
};

// API stub: the result carries extra fields (transcript, audio) that must never be saved
const STUB = `
(() => {
  window.__alerted = false;
  window.alert = () => { window.__alerted = true; };
  window.__fileId = "test1";
  window.fetch = async (url, opts = {}) => {
    url = String(url);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/upload-url")) return json({ fileId: window.__fileId, upload: { url: "https://public-speaking-coach-jayvee.s3.amazonaws.com/", fields: { key: "k" } } });
    if (url === "https://public-speaking-coach-jayvee.s3.amazonaws.com/") return new Response(null, { status: 204 });
    if (url.includes("/result")) return json({ wpm: 120, filler_word_total: 2, filler_word_breakdown: { um: 2 }, avg_confidence: 0.8,
      ai_feedback: "Strengths:\\n1. Clear.", speaking_seconds: 75, time_limit_seconds: 60, topic: "What makes a good apology?",
      topic_type: "explain", source: "upload", cut_off: false, transcript: "SECRET TRANSCRIPT", audio_url: "https://x/audio.mp3", speech_id: "test1" });
    throw new Error("unexpected fetch " + url);
  };
})();`;

async function page(opts = {}, pre = []) {
  const b = await launch({ width: 1280, height: 800, flags: FAKE, ...opts });
  open.push(b);
  const realClose = b.close;
  let closed = false;
  b.close = async () => { if (closed) return; closed = true; await Promise.race([realClose(), sleep(3000)]); };
  await b.goto(URL_, [STUB, ...pre]);
  b.waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(100); }
    return false;
  };
  b.key = async (k, shift = false) => {
    const codes = { Tab: 9, Escape: 27, Enter: 13 };
    for (const type of ["rawKeyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: codes[k], modifiers: shift ? 8 : 0 });
    await sleep(60);
  };
  b.settled = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert && !intermissionOn", 8000).then(() => sleep(800));
  b.go = async view => { await b.click({ stage: "#navStage", backstage: "#navBackstage", wall: "#navWall" }[view]); await b.waitFor(`currentView === '${view}'`); await b.settled(); };
  b.pickMp3 = () => b.evaluate(`(() => { const t = new DataTransfer(); t.items.add(new File([buildWav([toPcm16(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5)), 16000)], 16000)], "speech.wav", { type: "audio/wav" })); fileInput.files = t.files; showFileName(); return true; })()`);
  b.sendMp3 = async () => { await b.pickMp3(); await (async () => { for (let i = 0; i < 100 && await b.evaluate("uploadBtn.hidden"); i++) await sleep(100); })(); await b.click("#uploadBtn"); };
  b.stored = () => b.evaluate(`JSON.parse(localStorage.getItem("speakreview.wall.v1"))`);
  b.active = () => b.evaluate(`(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; })()`);
  b.openCard = id => b.evaluate(`(() => { wallButtons.get(${JSON.stringify(id)}).click(); return true; })()`);
  return b;
}
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { failures++; console.log("FAIL  threw: " + e.message); }
  while (open.length) await open.pop().close().catch(() => {});
}
// Feature set 2 added too_short (stage 3), words (stage 4), filler_flags, fillers_judged and review (stage 5)
const FIELDS = ["id", "savedAt", "topic", "topic_type", "time_limit_seconds", "speaking_seconds", "source", "cut_off", "too_short", "wpm", "filler_word_total", "filler_word_breakdown", "avg_confidence", "ai_feedback",
  "words", "filler_flags", "fillers_judged", "review"].sort().join(",");

await test("empty wall, tab and privacy", async () => {
  const b = await page();
  check("Wall tab visible", await b.evaluate(`!document.getElementById('navWall').hidden && getComputedStyle(navWall).display !== 'none'`));
  check("privacy sentence", await b.evaluate(`privacyNote.textContent.includes("results after 30 days. Your Wall of Fame and trophies are saved only in this browser on this device.") && privacyNote.textContent.endsWith("saved on this device for your latest 30 performances.")`));
  await b.go("wall");
  check("empty state shown", await b.evaluate(`!wallEmpty.hidden && wallEmpty.textContent.includes("Your wall is empty. Take the stage to hang your first playbill.")`));
  check("clear hidden when empty", await b.evaluate(`clearWallBtn.hidden`));
  check("storage note hidden", await b.evaluate(`wallStorageNote.hidden`));
  check("focus on title", (await b.active()) === "wallTitle");
  check("nav current", await b.evaluate(`navWall.getAttribute('aria-current') === 'page'`));
  check("no floor/stage visible", await b.evaluate(`dropZone.hidden && backstageView.hidden && !wallView.hidden`));
  await b.shot(OUT + "wall-empty-1280.png");
  await b.click("#wallStageBtn"); await b.settled();
  check("Go to the stage works", await b.evaluate(`currentView === 'stage'`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("saving from a real result", async () => {
  const b = await page();
  await b.sendMp3();
  check("intermission locks the wall tab", await b.waitFor(`intermissionOn && appRoot.inert`, 4000));
  await b.waitFor(`currentView === 'backstage' && !intermissionOn`, 15000); await b.settled();
  const s = await b.stored();
  check("one entry saved", Array.isArray(s) && s.length === 1, s && s.length);
  check("only the listed fields", s && Object.keys(s[0]).sort().join(",") === FIELDS, s && Object.keys(s[0]).join(","));
  check("id is the fileId", s && s[0].id === "test1");
  check("no transcript or audio anywhere", !JSON.stringify(s).includes("SECRET") && !JSON.stringify(s).includes("audio"));
  check("values kept", s && s[0].wpm === 120 && s[0].topic_type === "explain" && s[0].source === "upload" && s[0].time_limit_seconds === 60);
  // same fileId again replaces it
  await b.evaluate(`fileInput.value = ""; showFileName(); true`);
  await b.go("stage");
  await b.sendMp3();
  await b.waitFor(`currentView === 'backstage' && !intermissionOn`, 15000); await b.settled();
  const s2 = await b.stored();
  check("same id replaces (still one)", s2.length === 1 && s2[0].savedAt >= s[0].savedAt);
  // a different id is added first
  await b.evaluate(`window.__fileId = "test2"; true`);
  await b.go("stage");
  await b.sendMp3();
  await b.waitFor(`currentView === 'backstage' && !intermissionOn`, 15000); await b.settled();
  const s3 = await b.stored();
  check("new id added first", s3.length === 2 && s3[0].id === "test2");
  // console test never saves
  const before = await b.evaluate(`localStorage.getItem("speakreview.wall.v1")`);
  await b.evaluate(`displayResult({ wpm: 99, topic: "console", ai_feedback: "x" }); true`);
  await sleep(1500);
  check("displayResult() from the console saves nothing", before === await b.evaluate(`localStorage.getItem("speakreview.wall.v1")`));
  check("console displayResult still works", await b.evaluate(`perfSummary.textContent.includes("console")`));
  await b.go("wall");
  check("wall shows 2 playbills", await b.evaluate(`document.querySelectorAll('.playbill').length === 2`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("cap at 100 and malformed storage", async () => {
  const b = await page();
  await b.evaluate(`(() => { for (let i = 0; i < 105; i++) saveToWall("cap" + i, { wpm: 100 + i }); return true; })()`);
  const s = await b.stored();
  check("kept 100", s.length === 100);
  check("newest first, oldest dropped", s[0].id === "cap104" && !s.some(e => e.id === "cap0" || e.id === "cap4") && s.some(e => e.id === "cap5"));
  const now = new Date().toISOString();
  await b.evaluate(`localStorage.setItem("speakreview.wall.v1", JSON.stringify([
    { id: "ok", savedAt: "${now}", wpm: 1 },
    { id: 5, savedAt: "${now}", wpm: 1 },
    { id: "baddate", savedAt: "nope", wpm: 1 },
    { id: "badwpm", savedAt: "${now}", wpm: "abc" },
    { id: "nowpm", savedAt: "${now}" },
    { id: "objtopic", savedAt: "${now}", wpm: 1, topic: {} },
    { id: "badbool", savedAt: "${now}", wpm: 1, cut_off: "yes" },
    { id: "badsource", savedAt: "${now}", wpm: 1, source: { x: 1 } },
    { id: "hugetopic", savedAt: "${now}", wpm: 1, topic: "x".repeat(5000) },
    { id: "badbreak", savedAt: "${now}", wpm: 1, filler_word_breakdown: { um: "lots" } },
    { id: "conf2", savedAt: "${now}", wpm: 1, avg_confidence: 2 },
    { id: "extra", savedAt: "${now}", wpm: "7", transcript: "secret", audio: "data", __proto__x: 1, source: "telepathy" },
    "string", null, 42, []
  ]))`);
  await b.go("wall");
  const ids = await b.evaluate(`wallEntries.map(e => e.id)`);
  check("only valid entries kept", JSON.stringify(ids.sort()) === JSON.stringify(["extra", "ok"]), ids);
  const extra = await b.evaluate(`wallEntries.find(e => e.id === "extra")`);
  check("extra fields dropped, numeric text accepted, unknown source = null", !("transcript" in extra) && !("audio" in extra) && extra.wpm === 7 && extra.source === null);
  for (const bad of ["{not json", '{"a":1}', '"text"']) {
    await b.evaluate(`localStorage.setItem("speakreview.wall.v1", ${JSON.stringify(bad)}); true`);
    await b.evaluate(`loadWall(); renderWall(); true`);
    check(`damaged storage ${bad} reads as empty`, await b.evaluate(`wallEntries.length === 0 && !wallEmpty.hidden`));
  }
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("seeded wall: groups, cards, centering, tilt, security", async () => {
  const b = await page();
  console.log("  seed: " + await b.evaluate(SEED));
  await b.go("wall");
  const plaques = await b.evaluate(`Array.from(document.querySelectorAll('.wall-plaque')).map(p => p.textContent)`);
  const d3 = new Date(); d3.setDate(d3.getDate() - 3);
  const expect3 = d3.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  check("plaques", JSON.stringify(plaques) === JSON.stringify(["Today", "Yesterday", expect3]), plaques);
  const cards = await b.evaluate(`wallEntries.map(e => { const p = wallButtons.get(e.id); const q = s => p.querySelector(s)?.textContent ?? null; return { id: e.id, type: q('.playbill-type'), topic: q('.playbill-topic'), time: q('.playbill-time'), status: q('.playbill-status'), cls: p.querySelector('.playbill-status')?.className ?? null, source: q('.playbill-source'), label: p.getAttribute('aria-label') }; })`);
  const by = Object.fromEntries(cards.map(c => [c.id, c]));
  check("order newest first", cards.map(c => c.id).join() === "seed-1,seed-2,seed-xss,seed-3,seed-4,seed-5,seed-6", cards.map(c => c.id).join());
  check("timed over", by["seed-1"].type === "Persuade" && by["seed-1"].time === "3:42 / 3:00" && by["seed-1"].status === "0:42 over" && by["seed-1"].cls.includes("timing-over") && by["seed-1"].source === "Live recording");
  check("typed topic, under", by["seed-2"].type === "Own topic" && by["seed-2"].status === "0:12 under" && by["seed-2"].cls.includes("timing-ok") && by["seed-2"].source === "Uploaded file");
  check("untimed", by["seed-3"].time === "4:10" && by["seed-3"].status === "Untimed");
  check("no topic", by["seed-4"].type === "Free speech" && by["seed-4"].topic === "Spoke freely" && by["seed-4"].status === "on time");
  check("no source label when unknown", by["seed-6"].source === null && by["seed-6"].time === "2:21 / 2:30");
  check("xss topic shown as text", by["seed-xss"].topic === "<img src=x onerror=alert('hacked')>" && by["seed-xss"].label.startsWith("Open performance: <img"));
  check("presents line", await b.evaluate(`getComputedStyle(document.querySelector('.playbill-presents')).textTransform === 'uppercase'`));
  check("no <img> on the wall", await b.evaluate(`document.querySelectorAll('img').length === 0`));
  const center = await b.evaluate(`Array.from(document.querySelectorAll('.wall-row')).map(r => { const rb = r.getBoundingClientRect(); const items = r.querySelectorAll('.wall-item'); const f = items[0].getBoundingClientRect(), l = items[items.length - 1].getBoundingClientRect(); return [Math.round(f.left - rb.left), Math.round(rb.right - l.right)]; })`);
  check("rows centered", center.every(([a, c]) => Math.abs(a - c) <= 2), center);
  check("tilted", await b.evaluate(`getComputedStyle(wallButtons.get('seed-1')).transform !== 'none'`));
  check("no horizontal scroll", await b.evaluate(`document.documentElement.scrollWidth <= innerWidth`));
  check("wall area scrolls itself", await b.evaluate(`(() => { const s = document.querySelector('.wall-scroll'); return s.scrollHeight > s.clientHeight && getComputedStyle(s).overflowY === 'auto' && document.documentElement.scrollHeight <= innerHeight + 1; })()`));
  check("scrollbar hidden", await b.evaluate(`(() => { const s = document.querySelector('.wall-scroll'); return s.offsetWidth === s.clientWidth; })()`));
  await b.shot(OUT + "wall-1280.png");
  await b.evaluate(`document.querySelector('.wall-scroll').scrollTop = 99999; true`); await sleep(200);
  await b.shot(OUT + "wall-1280-bottom.png");
  await b.evaluate(`document.querySelector('.wall-scroll').scrollTop = 0; true`);
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await sleep(200);
  check("no tilt with reduced motion", await b.evaluate(`getComputedStyle(wallButtons.get('seed-1')).transform === 'none'`));
  await b.send("Emulation.setEmulatedMedia", { features: [] });

  // the xss playbill's dialog
  await b.openCard("seed-xss"); await sleep(300);
  check("no <img> in the open playbill", await b.evaluate(`document.querySelectorAll('img').length === 0`));
  check("xss notes shown as text", await b.evaluate(`pbNotes.textContent.includes("<img src=x onerror=alert('hacked')>") && pbNotes.querySelector('strong') !== null`));
  check("xss breakdown shown as text", await b.evaluate(`document.getElementById('pbBreakdown').textContent.includes("<img")`));
  check("xss title as text", await b.evaluate(`pbTitle.textContent === "<img src=x onerror=alert('hacked')>"`));
  await sleep(500);
  check("no alert ran", !(await b.evaluate(`window.__alerted`)));
  await b.key("Escape");
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("open playbill dialog: content, focus, remove", async () => {
  const b = await page();
  await b.evaluate(SEED);
  await b.go("wall");
  await b.openCard("seed-1"); await sleep(400);
  const d = await b.evaluate(`(() => { const f = document.querySelector('#playbillDialog [role=dialog]'); return { shown: !playbillDialog.hidden, modal: f.getAttribute('aria-modal'), label: document.getElementById(f.getAttribute('aria-labelledby')).textContent, inert: appRoot.inert,
    type: pbType.textContent, when: pbWhen.textContent, time: pbTime.textContent, status: pbStatus.textContent, source: pbSource.textContent, wpm: pbWpm.textContent, fillers: pbFillers.textContent, breakdown: pbBreakdown.textContent, clarity: pbClarity.textContent,
    cut: pbCutOff.hidden, headings: Array.from(pbNotes.querySelectorAll('.note-heading')).map(h => h.className + ':' + getComputedStyle(h).color), only: getComputedStyle(pbNotes).overflowY }; })()`);
  console.log("  " + JSON.stringify(d));
  check("dialog shown, modal, labelled by topic", d.shown && d.modal === "true" && d.label === "Is failure a better teacher than success?" && d.inert);
  check("dialog numbers", d.wpm === "132" && d.fillers === "4" && d.breakdown === "um 3, uh 1" && d.clarity === "76%" && d.time === "3:42 / 3:00" && d.status === "0:42 over" && d.source === "Live recording" && d.when.startsWith("Today, "));
  check("note sections colored", d.headings.length === 4 && d.headings[0].includes("note-good") && d.headings[1].includes("note-over") && d.headings[2].includes("note-tip"));
  check("cut-off hidden when false", d.cut === true);
  check("focus moved in", (await b.active()) === "pbTitle");
  const seen = [];
  for (let i = 0; i < 9; i++) { await b.key("Tab"); seen.push(await b.evaluate(`playbillDialog.contains(document.activeElement) ? (document.activeElement.id || document.activeElement.className) : 'OUTSIDE:' + document.activeElement.tagName`)); }
  check("Tab stays inside", seen.every(s => !s.startsWith("OUTSIDE")), seen);
  await b.evaluate(`pbCloseX.focus(); true`);
  await b.key("Tab", true);
  check("Shift+Tab from first wraps to last", (await b.active()) === "pbCloseBtn", await b.active());
  await b.key("Escape");
  check("Escape closes and returns focus", await b.evaluate(`playbillDialog.hidden && !appRoot.inert && document.activeElement === wallButtons.get('seed-1')`));
  await b.openCard("seed-1"); await sleep(200);
  await b.click("#pbCloseBtn");
  check("Close returns focus", await b.evaluate(`playbillDialog.hidden && document.activeElement === wallButtons.get('seed-1')`));
  await b.openCard("seed-5"); await sleep(200);
  check("cut-off note", await b.evaluate(`!pbCutOff.hidden && pbCutOff.textContent === "Recording stopped at the 10:00 maximum."`));
  await b.shot(OUT + "dialog-1280.png");
  await b.click("#pbCloseX");
  // remove
  await b.openCard("seed-2"); await sleep(200);
  await b.click("#pbRemoveBtn");
  check("confirm row", await b.evaluate(`!pbConfirm.hidden && pbButtons.hidden && pbConfirm.textContent.includes("Remove this performance from your wall? This can't be undone.")`));
  check("focus on Keep it", (await b.active()) === "pbKeepBtn");
  await b.shot(OUT + "dialog-confirm-1280.png");
  await b.key("Escape");
  check("Escape in confirm = Keep it", await b.evaluate(`!playbillDialog.hidden && pbConfirm.hidden && !pbButtons.hidden && document.activeElement === pbRemoveBtn`));
  await b.click("#pbRemoveBtn");
  await b.click("#pbKeepBtn");
  check("Keep it restores buttons", await b.evaluate(`pbConfirm.hidden && !pbButtons.hidden`));
  await b.click("#pbRemoveBtn");
  await b.click("#pbConfirmRemoveBtn");
  await sleep(200);
  const s = await b.stored();
  check("removed from storage", s.length === 6 && !s.some(e => e.id === "seed-2"));
  check("focus on the next playbill", await b.evaluate(`playbillDialog.hidden && document.activeElement === wallButtons.get('seed-xss')`));
  // remove the last one: focus goes to the previous
  await b.openCard("seed-6"); await sleep(100);
  await b.click("#pbRemoveBtn"); await b.click("#pbConfirmRemoveBtn"); await sleep(100);
  check("last removed: focus on previous", await b.evaluate(`document.activeElement === wallButtons.get('seed-5')`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("practice this topic again", async () => {
  const b = await page();
  await b.evaluate(SEED);
  await b.go("wall");
  await b.openCard("seed-6"); await sleep(100);
  await b.click("#pbPracticeBtn");
  await b.settled();
  let st = await b.evaluate(`({ view: currentView, topic: topicInput.value, rt: randomTopic, badge: !topicBadge.hidden && topicBadgeType.textContent, radio: document.querySelector('input[name=timeLimit]:checked').value, min: customMinutes.value, sec: customSeconds.value, custom: !customTime.hidden, file: fileInput.files.length, dialog: playbillDialog.hidden, inert: appRoot.inert, h: topicInput.offsetHeight })`);
  console.log("  " + JSON.stringify(st));
  check("type explain + custom 2:30", st.view === "stage" && st.topic === "What makes a good apology?" && st.rt?.type === "explain" && st.badge === "Explain" && st.radio === "custom" && st.min === "2" && st.sec === "30" && st.custom && st.file === 0 && st.dialog && !st.inert && st.h > 30);
  await b.go("wall"); await b.openCard("seed-4"); await b.click("#pbPracticeBtn"); await b.settled();
  st = await b.evaluate(`({ topic: topicInput.value, free: speakFreely, rt: randomTopic, radio: document.querySelector('input[name=timeLimit]:checked').value, ph: topicInput.placeholder })`);
  check("no topic + 1 min", st.topic === "" && st.free && st.rt === null && st.radio === "60" && st.ph === "Speak on anything you like", st);
  await b.go("wall"); await b.openCard("seed-2"); await b.click("#pbPracticeBtn"); await b.settled();
  st = await b.evaluate(`({ topic: topicInput.value, rt: randomTopic, badge: topicBadge.hidden, radio: document.querySelector('input[name=timeLimit]:checked').value })`);
  check("typed topic + 3 min", st.topic === "Why my grandmother's garden still matters" && st.rt === null && st.badge && st.radio === "180", st);
  await b.go("wall"); await b.openCard("seed-3"); await b.click("#pbPracticeBtn"); await b.settled();
  st = await b.evaluate(`({ rt: randomTopic, radio: document.querySelector('input[name=timeLimit]:checked').value })`);
  check("imagine + untimed", st.rt.type === "imagine" && st.radio === "0", st);
  // the topic is really sent with its type and limit
  await b.sendMp3();
  await b.waitFor(`currentView === 'backstage' && !intermissionOn`, 15000); await b.settled();

  // picked MP3 pending
  await b.go("stage");
  await b.pickMp3();
  await b.go("wall"); await b.openCard("seed-1"); await sleep(100);
  await b.click("#pbPracticeBtn");
  check("asks before replacing MP3", await b.evaluate(`!pbReplace.hidden && pbButtons.hidden && pbReplaceText.textContent === "This replaces your picked file." && document.activeElement === pbReplaceKeepBtn`));
  await b.shot(OUT + "dialog-replace-1280.png");
  await b.key("Escape");
  check("Escape keeps it", await b.evaluate(`!playbillDialog.hidden && pbReplace.hidden && !pbButtons.hidden && document.activeElement === pbPracticeBtn && fileInput.files.length === 1`));
  await b.click("#pbPracticeBtn"); await b.click("#pbReplaceKeepBtn");
  check("Keep it keeps it", await b.evaluate(`pbReplace.hidden && fileInput.files.length === 1`));
  await b.click("#pbPracticeBtn"); await b.click("#pbReplaceBtn"); await b.settled();
  check("Replace it clears and continues", await b.evaluate(`currentView === 'stage' && fileInput.files.length === 0 && topicInput.value === "Is failure a better teacher than success?" && document.querySelector('input[name=timeLimit]:checked').value === '180'`));

  // unsent take pending
  await b.evaluate(`setTake(new Blob([new Uint8Array(1000)], { type: 'audio/wav' }), 20, null); setRecState('review'); true`);
  await b.go("wall"); await b.openCard("seed-3"); await sleep(100);
  await b.click("#pbPracticeBtn");
  check("asks before replacing take", await b.evaluate(`!pbReplace.hidden && pbReplaceText.textContent === "This replaces your unsent take."`));
  await b.click("#pbReplaceKeepBtn");
  await b.click("#pbCloseBtn");
  check("take kept", await b.evaluate(`currentTake !== null && recState === 'review'`));
  await b.openCard("seed-3"); await b.click("#pbPracticeBtn"); await b.click("#pbReplaceBtn"); await b.settled();
  check("take replaced", await b.evaluate(`currentTake === null && recState === 'idle' && currentView === 'stage' && randomTopic.type === 'imagine'`));
  // sent take does not ask
  await b.evaluate(`setTake(new Blob([new Uint8Array(1000)], { type: 'audio/wav' }), 20, null); setRecState('review'); currentTake.sent = true; true`);
  await b.go("wall"); await b.openCard("seed-1"); await b.click("#pbPracticeBtn"); await b.settled();
  check("sent take does not ask", await b.evaluate(`currentView === 'stage' && currentTake === null`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("clear the wall", async () => {
  const b = await page();
  await b.evaluate(SEED);
  await b.go("wall");
  check("clear shown", await b.evaluate(`!clearWallBtn.hidden`));
  await b.click("#clearWallBtn");
  check("confirm dialog, focus on Keep them", await b.evaluate(`!clearWallDialog.hidden && document.activeElement === clearWallKeepBtn && document.getElementById(clearWallDialog.querySelector('[role=dialog]').getAttribute('aria-labelledby')).textContent === "Clear every performance from your wall? This can't be undone."`));
  await b.shot(OUT + "clear-1280.png");
  for (let i = 0; i < 3; i++) await b.key("Tab");
  check("Tab trapped in clear dialog", await b.evaluate(`clearWallDialog.contains(document.activeElement)`));
  await b.key("Escape");
  check("Escape keeps them, focus back", await b.evaluate(`clearWallDialog.hidden && document.activeElement === clearWallBtn && wallEntries.length === 7`));
  await b.click("#clearWallBtn"); await b.click("#clearWallKeepBtn");
  check("Keep them", await b.evaluate(`wallEntries.length === 7`));
  await b.click("#clearWallBtn"); await b.click("#clearWallConfirmBtn");
  check("cleared", await b.evaluate(`localStorage.getItem("speakreview.wall.v1") === null && !wallEmpty.hidden && clearWallBtn.hidden && document.activeElement === wallTitle`));
  await b.close();
});

await test("storage blocked", async () => {
  const b = await page({}, [`Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });`]);
  await b.go("wall");
  check("note shown", await b.evaluate(`!wallStorageNote.hidden && !wallEmpty.hidden`));
  await b.shot(OUT + "wall-blocked-1280.png");
  await b.go("stage");
  await b.sendMp3();
  check("result still shows", await b.waitFor(`currentView === 'backstage' && !intermissionOn && perfSummary.textContent.includes('apology')`, 15000));
  await b.settled();
  await b.go("wall");
  check("this visit's result shown in memory", await b.evaluate(`document.querySelectorAll('.playbill').length === 1 && !wallStorageNote.hidden`));
  check("stopwatch storage still fine", await b.evaluate(`readStopwatchChoice() === true`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("storage full", async () => {
  const b = await page({}, [`(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "speakreview.wall.v1") throw new DOMException("full", "QuotaExceededError"); return real.call(this, k, v); }; })();`]);
  await b.sendMp3();
  await b.waitFor(`currentView === 'backstage' && !intermissionOn`, 15000); await b.settled();
  check("result shown", await b.evaluate(`perfSummary.textContent.includes('apology')`));
  await b.go("wall");
  check("note shown, entry in memory", await b.evaluate(`!wallStorageNote.hidden && document.querySelectorAll('.playbill').length === 1`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
  await b.close();
});

await test("tab locked while preparing and recording", async () => {
  const b = await page();
  await b.evaluate(`document.querySelector('input[name=prepTime][value="30"]').click(); true`);
  await b.click("#micBtn");
  await b.waitFor(`recState === 'prep'`, 6000);
  check("locked in prep", await b.evaluate(`navWall.disabled`));
  await b.click("#prepStartBtn");
  await b.waitFor(`recState === 'recording'`, 6000);
  check("locked while recording", await b.evaluate(`navWall.disabled`));
  await b.click("#finishBtn"); await sleep(300);
  check("unlocked in review", await b.evaluate(`!navWall.disabled`));
  await b.close();
});

await test("layouts and screenshots", async () => {
  for (const [w, h, mobile, name] of [[1440, 900, false, "1440"], [1280, 720, false, "1280x720"], [390, 780, true, "phone"], [360, 740, true, "phone360"]]) {
    const b = await page({ width: w, height: h, mobile });
    await b.evaluate(SEED);
    await b.go("wall");
    const m = await b.evaluate(`(() => { const f = document.getElementById('wallFrames'); const s = document.querySelector('.wall-scroll'); const pb = document.querySelector('.playbill').getBoundingClientRect(); const row = document.querySelector('.wall-row'); const perRow = new Set(Array.from(row.querySelectorAll('.wall-item')).map(p => p.offsetTop)).size;
      return { hscroll: document.documentElement.scrollWidth > innerWidth, pageScroll: document.documentElement.scrollHeight - innerHeight, framesScroll: f.scrollHeight > f.clientHeight, framesOverflow: getComputedStyle(f).overflowY, scrollOverflow: getComputedStyle(s).overflowY, width: document.querySelector('.playbill').offsetWidth, titleTop: Math.round(wallTitle.getBoundingClientRect().top), rows: perRow,
        minFont: Math.min(...Array.from(document.querySelectorAll('#wallView *')).filter(e => e.childNodes.length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length).map(e => parseFloat(getComputedStyle(e).fontSize))) }; })()`);
    console.log(`  ${name}: ${JSON.stringify(m)}`);
    check(`${name}: no horizontal scroll`, !m.hscroll);
    check(`${name}: page itself does not scroll`, m.pageScroll <= 1, m.pageScroll);
    if (mobile) {
      check(`${name}: only frames scroll`, m.framesOverflow === "auto" && m.framesScroll && m.scrollOverflow === "visible");
      check(`${name}: 156px frames, two per row`, m.width >= 150 && m.width <= 156 && m.rows === 2);
      check(`${name}: text 11px or more`, m.minFont >= 11, m.minFont);
      await b.evaluate(`document.getElementById('wallFrames').scrollTop = 200; true`); await sleep(200);
      check(`${name}: title stays when frames scroll`, await b.evaluate(`Math.round(wallTitle.getBoundingClientRect().top)`) === m.titleTop);
      await b.evaluate(`document.getElementById('wallFrames').scrollTop = 0; true`);
    } else {
      check(`${name}: text 11px or more (the minimum)`, m.minFont >= 11, m.minFont);
      check(`${name}: about 210px frames`, m.width === 210, m.width);
    }
    await b.shot(OUT + `wall-${name}.png`);
    await b.openCard("seed-1"); await sleep(500);
    const dm = await b.evaluate(`(() => { const r = document.querySelector('#playbillDialog .pb-frame').getBoundingClientRect(); const n = pbNotes; return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= innerHeight, notesScroll: n.scrollHeight > n.clientHeight, buttonsH: Array.from(document.querySelectorAll('#pbButtons button')).map(x => Math.round(x.getBoundingClientRect().height)) }; })()`);
    console.log(`  ${name} dialog: ${JSON.stringify(dm)}`);
    check(`${name}: dialog fits the window`, dm.inView);
    check(`${name}: buttons tall enough`, dm.buttonsH.every(x => x >= (mobile ? 34 : 44)));
    await b.shot(OUT + `dialog-${name}.png`);
    await b.key("Escape");
    if (mobile) {
      await b.evaluate(`localStorage.removeItem("speakreview.wall.v1"); loadWall(); renderWall(); true`);
      await b.shot(OUT + `wall-empty-${name}.png`);
    }
    check(`${name}: no console errors`, b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
    await b.close();
  }
});

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILURE(S)"}`);
process.exit(0);
