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

// API stub: each send gets a new fileId (unless __fixedId is set); the result can be replaced with __result
const STUB = `
(() => {
  window.__n = 0;
  window.__fixedId = null;
  window.__result = null;
  window.__announced = [];
  new MutationObserver(() => { const t = document.getElementById('sceneAnnounce')?.textContent; if (t) window.__announced.push(t); })
    .observe(document, { subtree: true, childList: true, characterData: true });
  window.fetch = async (url, opts = {}) => {
    url = String(url);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/upload-url")) return json({ fileId: window.__fixedId || ("t" + (++window.__n)), upload: { url: "https://public-speaking-coach-jayvee.s3.amazonaws.com/", fields: { key: "k" } } });
    if (url === "https://public-speaking-coach-jayvee.s3.amazonaws.com/") return new Response(null, { status: 204 });
    if (url.includes("/result")) return json(window.__result || { wpm: 120, filler_word_total: 5, avg_confidence: 0.8, ai_feedback: "Strengths:\\n1. Clear.", speaking_seconds: 40, time_limit_seconds: null, source: "upload" });
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
    await sleep(80);
  };
  b.settled = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert && !intermissionOn", 8000).then(() => sleep(800));
  b.go = async view => { await b.click({ stage: "#navStage", backstage: "#navBackstage", wall: "#navWall" }[view]); await b.waitFor(`currentView === '${view}'`); await b.settled(); };
  b.perform = async result => {
    if (result) await b.evaluate(`window.__result = ${JSON.stringify(result)}; true`);
    if (await b.evaluate(`currentView !== 'stage'`)) await b.go("stage");
    await b.evaluate(`(() => { const t = new DataTransfer(); t.items.add(new File([buildWav([toPcm16(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5)), 16000)], 16000)], "speech.wav", { type: "audio/wav" })); fileInput.files = t.files; showFileName(); return true; })()`);
    await (async () => { for (let i = 0; i < 100 && await b.evaluate("uploadBtn.hidden"); i++) await sleep(100); })(); await b.click("#uploadBtn");
    await b.waitFor(`intermissionOn`, 4000);
    await b.waitFor(`currentView === 'backstage' && !intermissionOn`, 15000);
    await b.settled();
  };
  b.progress = () => b.evaluate(`JSON.parse(localStorage.getItem("speakreview.trophies.v1"))`);
  b.active = () => b.evaluate(`(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('aria-label') || a.className || a.tagName) : null; })()`);
  return b;
}
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { failures++; console.log("FAIL  threw: " + e.message); }
  while (open.length) await open.pop().close().catch(() => {});
}
// Earned ids after recording these results one by one on a fresh progress
const RUN = results => `(() => {
  localStorage.removeItem("speakreview.trophies.v1"); trophySavingWorks = true; trophyProgress = emptyProgress();
  return ${JSON.stringify(results)}.map(r => recordTrophies(r).map(t => t.id));
})()`;
const earnedAfter = async (b, results) => (await b.evaluate(RUN(results))).flat();

await test("rules: just meeting and just missing", async () => {
  const b = await page();
  const base = { wpm: 120, filler_word_total: 5, speaking_seconds: 40 };
  check("first performance: Opening night", JSON.stringify(await earnedAfter(b, [base])) === '["opening-night"]');
  const cue = async r => (await earnedAfter(b, [{ ...base, ...r }])).includes("right-on-cue");
  check("cue: 70 of 60 (10 over) earns", await cue({ time_limit_seconds: 60, speaking_seconds: 70 }));
  check("cue: 71 of 60 (11 over) misses", !(await cue({ time_limit_seconds: 60, speaking_seconds: 71 })));
  check("cue: 50 of 60 (10 under) earns", await cue({ time_limit_seconds: 60, speaking_seconds: 50 }));
  check("cue: 49 of 60 (11 under) misses", !(await cue({ time_limit_seconds: 60, speaking_seconds: 49 })));
  check("cue: untimed misses", !(await cue({ time_limit_seconds: null, speaking_seconds: 60 })));
  check("cue: exactly on the limit but cut_off true misses", !(await cue({ time_limit_seconds: 600, speaking_seconds: 600, cut_off: true })));
  check("cue: same time without cut_off earns", await cue({ time_limit_seconds: 600, speaking_seconds: 600, cut_off: false }));
  const clean = async r => (await earnedAfter(b, [{ ...base, ...r }])).includes("clean-delivery");
  check("clean: 60s, 2 fillers, 60 wpm earns", await clean({ speaking_seconds: 60, filler_word_total: 2, wpm: 60 }));
  check("clean: 3 fillers misses", !(await clean({ speaking_seconds: 60, filler_word_total: 3, wpm: 120 })));
  check("clean: 59 wpm misses", !(await clean({ speaking_seconds: 90, filler_word_total: 0, wpm: 59 })));
  check("clean: 59 seconds misses", !(await clean({ speaking_seconds: 59, filler_word_total: 0, wpm: 120 })));
  check("clean: fillers unknown misses", !(await clean({ speaking_seconds: 90, filler_word_total: null, wpm: 120 })));
  check("clean: numbers as text still count", await clean({ speaking_seconds: "75", filler_word_total: "1", wpm: "130" }));
  const long = async s => (await earnedAfter(b, [{ ...base, speaking_seconds: s }])).includes("long-run");
  check("long run: 299 misses", !(await long(299)));
  check("long run: 300 earns", await long(300));
  const shows = await earnedAfter(b, Array(10).fill(base));
  check("five and ten shows at the 5th and 10th", JSON.stringify(shows) === '["opening-night","five-shows","ten-shows"]');
  const counts = await b.evaluate(RUN(Array(10).fill(base)));
  check("five on the 5th, ten on the 10th", counts[4][0] === "five-shows" && counts[9][0] === "ten-shows" && counts[3].length === 0 && counts[8].length === 0);
  const types = await b.evaluate(RUN(["persuade", "story", "story", "bogus", "explain", "reflect", "imagine"].map(t => ({ ...base, topic_type: t }))));
  check("repertoire on the 5th real type (repeats and unknown types ignored)", types[6].includes("full-repertoire") && !types.slice(0, 6).flat().includes("full-repertoire"));
  check("topic types stored", JSON.stringify(await b.evaluate(`trophyProgress.topicTypes`)) === '["persuade","story","explain","reflect","imagine"]');
  // days, with the performance time given directly (a fake clock)
  const days = await b.evaluate(`(() => {
    const at = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; };
    const perf = trophyPerformance({ wpm: 100 });
    const p = emptyProgress();
    const r1 = applyPerformance(p, perf, at(2)).map(t => t.id);
    const r2 = applyPerformance(p, perf, at(1)).map(t => t.id);
    const mid = TROPHIES.find(t => t.id === 'three-night-run').progress(p);
    const r3 = applyPerformance(p, perf, at(1)).map(t => t.id);
    const r4 = applyPerformance(p, perf, at(0)).map(t => t.id);
    const gap = emptyProgress();
    [5, 4, 2, 1].forEach(n => applyPerformance(gap, perf, at(n)));
    const lapsed = emptyProgress();
    [4, 3].forEach(n => applyPerformance(lapsed, perf, at(n)));
    return { r2, mid, r3, r4, days: p.practiceDays.length, gapEarned: Boolean(gap.earned['three-night-run']), gapProgress: TROPHIES.find(t => t.id === 'three-night-run').progress(gap), lapsed: TROPHIES.find(t => t.id === 'three-night-run').progress(lapsed), earnedAt: p.earned['three-night-run'] };
  })()`);
  console.log("  " + JSON.stringify(days));
  check("2 days in a row: 2 of 3 days, not earned", !days.r2.includes("three-night-run") && days.mid === "2 of 3 days");
  check("same day twice adds no day", days.r3.length === 0 && days.days === 3);
  check("3rd day in a row earns, dated that performance", days.r4.includes("three-night-run") && new Date(days.earnedAt).getHours() === 12);
  check("a gap breaks the run", !days.gapEarned && days.gapProgress === "2 of 3 days");
  check("a lapsed streak shows 0 of 3 days", days.lapsed === "0 of 3 days");
  check("only the last 60 days kept", await b.evaluate(`(() => { const p = emptyProgress(); const perf = trophyPerformance({ wpm: 1 }); for (let n = 80; n >= 0; n--) { const d = new Date(); d.setDate(d.getDate() - n); applyPerformance(p, perf, d); } return p.practiceDays.length === 60 && p.performances === 81; })()`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("real results: banner, counting once, console", async () => {
  const b = await page();
  await b.perform({ wpm: 120, filler_word_total: 4, speaking_seconds: 40, source: "upload" });
  let p = await b.progress();
  check("counted", p.performances === 1 && Boolean(p.earned["opening-night"]));
  check("banner shows", await b.evaluate(`!trophyBanner.hidden && trophyBannerText.textContent === "Trophy unlocked: Opening night"`));
  check("banner above Coach's notes", await b.evaluate(`trophyBanner.getBoundingClientRect().bottom <= coachNotesTitle.getBoundingClientRect().top`));
  await sleep(2200);
  const ann = await b.evaluate(`window.__announced.filter((t, i, a) => a.indexOf(t) === i)`);
  console.log("  announced: " + JSON.stringify(ann));
  const notesAt = ann.indexOf("Your coach's notes are ready."), trophyAt = ann.indexOf("Trophy unlocked: Opening night.");
  check("announced once, after the notes", notesAt >= 0 && trophyAt > notesAt && (await b.evaluate(`window.__announced.filter(t => t.startsWith("Trophy")).length`)) === 1);
  await b.shot(OUT + "banner-1280.png");
  // console test
  const before = await b.evaluate(`localStorage.getItem("speakreview.trophies.v1")`);
  await b.evaluate(`displayResult({ wpm: 150, speaking_seconds: 400, filler_word_total: 0, time_limit_seconds: 400 }); true`);
  await sleep(1500);
  check("console displayResult changes no progress", before === await b.evaluate(`localStorage.getItem("speakreview.trophies.v1")`));
  check("console displayResult leaves the banner alone", await b.evaluate(`!trophyBanner.hidden`));
  // See your wall
  await b.click("#trophyBannerBtn"); await b.settled();
  check("See your wall opens the wall", await b.evaluate(`currentView === 'wall' && shelfTitle.textContent === 'Trophy shelf, 1 of 8 earned'`));
  // same id twice
  await b.evaluate(`window.__fixedId = "same"; true`);
  await b.perform({ wpm: 120, filler_word_total: 4, speaking_seconds: 40 });
  await b.perform({ wpm: 120, filler_word_total: 0, speaking_seconds: 90 });
  p = await b.progress();
  check("same performance counted once", p.performances === 2, p.performances);
  check("no banner for a repeat", await b.evaluate(`trophyBanner.hidden`));
  check("wall still has 2", await b.evaluate(`JSON.parse(localStorage.getItem("speakreview.wall.v1")).length === 2`));
  // several at once
  await b.evaluate(`window.__fixedId = null; trophyProgress = Object.assign(emptyProgress(), { performances: 4, topicTypes: ["persuade","story","explain","reflect"], earned: { "opening-night": new Date().toISOString() } }); writeTrophies(); true`);
  await b.perform({ wpm: 130, filler_word_total: 1, speaking_seconds: 175, time_limit_seconds: 180, topic: "Imagine this", topic_type: "imagine" });
  check("plural banner", await b.evaluate(`trophyBannerText.textContent`) === "Trophies unlocked: Five shows, Right on cue, Clean delivery, Full repertoire", await b.evaluate(`trophyBannerText.textContent`));
  await b.shot(OUT + "banner-plural-1280.png");
  // removing playbills never lowers progress
  const pBefore = await b.progress();
  await b.evaluate(`loadWall(); wallEntries = []; writeWall(); true`);
  await b.go("wall");
  check("removing playbills keeps progress", JSON.stringify(await b.progress()) === JSON.stringify(pBefore));
  // banner hides when another performance starts
  await b.go("backstage");
  check("banner still there", await b.evaluate(`!trophyBanner.hidden`));
  await b.go("stage");
  await b.click("#micBtn"); await sleep(400);
  check("mic tap hides the banner", await b.evaluate(`trophyBanner.hidden`));
  await b.evaluate(`cancelRecording(); showTrophyBanner([TROPHIES[0]]); true`);
  await b.evaluate(`(() => { const t = new DataTransfer(); t.items.add(new File([buildWav([toPcm16(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5)), 16000)], 16000)], "speech.wav", { type: "audio/wav" })); fileInput.files = t.files; showFileName(); return true; })()`);
  await (async () => { for (let i = 0; i < 100 && await b.evaluate("uploadBtn.hidden"); i++) await sleep(100); })(); await b.click("#uploadBtn");
  check("sending hides the banner", await b.evaluate(`trophyBanner.hidden`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("reduced motion banner", async () => {
  const b = await page();
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.evaluate(`showTrophyBanner([TROPHIES[0]]); true`);
  check("no banner animation", await b.evaluate(`getComputedStyle(trophyBanner).animationName === 'none'`));
});

await test("counting once with storage blocked", async () => {
  const b = await page({}, [`Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });`]);
  await b.evaluate(`window.__fixedId = "same"; true`);
  await b.perform();
  await b.perform();
  check("counted once in memory", await b.evaluate(`trophyProgress.performances === 1 && wallEntries.length === 1`));
  await b.evaluate(`window.__fixedId = "other"; true`);
  await b.perform();
  check("a new one still counts", await b.evaluate(`trophyProgress.performances === 2`));
  await b.go("wall");
  check("shelf shows and note shows", await b.evaluate(`shelfTitle.textContent === 'Trophy shelf, 1 of 8 earned' && !wallStorageNote.hidden`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("storage full", async () => {
  const b = await page({}, [`(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "speakreview.trophies.v1") throw new DOMException("full", "QuotaExceededError"); return real.call(this, k, v); }; })();`]);
  await b.perform();
  check("result shown, progress in memory", await b.evaluate(`perfSummary.textContent.length > 0 && trophyProgress.performances === 1 && !trophyBanner.hidden`));
  await b.go("wall");
  check("note shows", await b.evaluate(`!wallStorageNote.hidden`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("catch-up from an existing wall", async () => {
  // seed the wall before the page runs, with no trophy record
  const seedPre = `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.removeItem('speakreview.trophies.v1'); ${SEED.replace("if (currentView === \"wall\") { loadWall(); renderWall(); }", "")} }`;
  const b = await page({}, [seedPre]);
  const p = await b.progress();
  const wall = await b.evaluate(`JSON.parse(localStorage.getItem("speakreview.wall.v1"))`);
  const at = id => wall.find(e => e.id === id).savedAt;
  console.log("  " + JSON.stringify(p));
  check("built from 7 entries", p && p.performances === 7);
  check("dated with the entries", p.earned["opening-night"] === at("seed-6") && p.earned["right-on-cue"] === at("seed-6") && p.earned["long-run"] === at("seed-5") && p.earned["clean-delivery"] === at("seed-4") && p.earned["five-shows"] === at("seed-xss") && p.earned["full-repertoire"] === at("seed-1"));
  check("cut-off entry did not earn on cue by itself", p.earned["right-on-cue"] !== at("seed-5"));
  check("not earned: ten shows, three-night run", !p.earned["ten-shows"] && !p.earned["three-night-run"]);
  check("no banner for the catch-up", await b.evaluate(`trophyBanner.hidden`));
  // runs only once: change the record, reload, it stays as changed
  await b.evaluate(`localStorage.setItem("speakreview.trophies.v1", JSON.stringify({ performances: 3, topicTypes: [], practiceDays: [], earned: {} })); true`);
  await b.goto(URL_);
  check("catch-up does not run again", (await b.progress()).performances === 3);
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("malformed progress", async () => {
  const b = await page();
  const cleaned = await b.evaluate(`cleanProgress({ performances: 4.5, topicTypes: ["story", "story", "bogus", 3, "__proto__", "imagine"], practiceDays: ["2026-02-30", "2026-10-01", "not a day", "2026-10-01", 5, "2026-09-30"], earned: { "opening-night": "2026-10-01T10:00:00.000Z", "fake-trophy": "2026-10-01T10:00:00.000Z", "long-run": "nope", "ten-shows": 5 }, extra: "<img src=x onerror=alert(1)>" })`);
  console.log("  " + JSON.stringify(cleaned));
  check("bad pieces dropped", cleaned.performances === 0 && JSON.stringify(cleaned.topicTypes) === '["story","imagine"]' && JSON.stringify(cleaned.practiceDays) === '["2026-09-30","2026-10-01"]' && JSON.stringify(Object.keys(cleaned.earned)) === '["opening-night"]' && !("extra" in cleaned));
  for (const bad of ["{oops", "[]", "null", '"text"', "42"]) {
    await b.evaluate(`localStorage.setItem("speakreview.trophies.v1", ${JSON.stringify(bad)}); loadTrophies(); true`);
    check(`damaged ${bad} reads as empty`, await b.evaluate(`trophyProgress.performances === 0 && Object.keys(trophyProgress.earned).length === 0`));
  }
  await b.go("wall");
  check("shelf renders", await b.evaluate(`document.querySelectorAll('.trophy-btn').length === 8`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("clear the wall option", async () => {
  const b = await page();
  await b.evaluate(SEED);
  await b.evaluate(`trophyProgress = Object.assign(emptyProgress(), { performances: 7, earned: { "opening-night": new Date().toISOString() } }); writeTrophies(); true`);
  await b.go("wall");
  await b.click("#clearWallBtn");
  check("box unchecked by default", await b.evaluate(`!clearTrophiesBox.checked && clearTrophiesBox.closest('label').textContent.trim() === 'Also remove my trophies and progress'`));
  const tabs = [];
  for (let i = 0; i < 3; i++) { await b.key("Tab"); tabs.push(await b.active()); }
  check("checkbox in the Tab loop", tabs.includes("clearTrophiesBox"), tabs);
  await b.shot(OUT + "clear-trophies-1280.png");
  await b.click("#clearWallConfirmBtn");
  check("unchecked: progress kept", (await b.progress()).performances === 7);
  await b.evaluate(SEED); await b.evaluate(`loadWall(); renderWall(); true`);
  await b.click("#clearWallBtn");
  await b.evaluate(`clearTrophiesBox.click(); true`);
  await b.click("#clearWallKeepBtn");
  await b.click("#clearWallBtn");
  check("box unchecked again on reopen", await b.evaluate(`!clearTrophiesBox.checked`));
  await b.evaluate(`clearTrophiesBox.click(); true`);
  await b.click("#clearWallConfirmBtn");
  const p = await b.progress();
  check("checked: progress reset to an empty record", p && p.performances === 0 && Object.keys(p.earned).length === 0);
  check("shelf shows 0 of 8 on an empty wall", await b.evaluate(`shelfTitle.textContent === 'Trophy shelf, 0 of 8 earned' && !wallEmpty.hidden`));
  await b.goto(URL_);
  check("no catch-up after a reset", (await b.progress()).performances === 0);
});

await test("shelf on laptop: names, lines, popover", async () => {
  const b = await page();
  await b.evaluate(SEED);
  const oct14 = `new Date(new Date().getFullYear(), 9, 14, 12).toISOString()`;
  const yday = `(() => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); })()`;
  await b.evaluate(`trophyProgress = Object.assign(emptyProgress(), { performances: 7, topicTypes: ["persuade","story","explain","reflect"], practiceDays: [(() => { const d = new Date(); d.setDate(d.getDate() - 2); return dayKey(d); })(), ${yday}], earned: { "opening-night": ${oct14}, "five-shows": ${oct14}, "right-on-cue": ${oct14}, "clean-delivery": ${oct14} } }); writeTrophies(); true`);
  await b.go("wall");
  const shelf = await b.evaluate(`({ title: shelfTitle.textContent, transform: getComputedStyle(shelfTitle).textTransform, items: Array.from(document.querySelectorAll('.trophy-btn')).map(x => ({ label: x.getAttribute('aria-label'), line: x.querySelector('.trophy-line').textContent, locked: x.classList.contains('is-locked'), desc: x.getAttribute('aria-describedby') ? document.getElementById(x.getAttribute('aria-describedby')).textContent : null, opacity: getComputedStyle(x.querySelector('svg')).opacity })) })`);
  console.log("  " + JSON.stringify(shelf.items.map(i => i.label)));
  check("title", shelf.title === "Trophy shelf, 4 of 8 earned" && shelf.transform === "uppercase");
  const L = shelf.items.map(i => i.label);
  check("earned name", L[3] === "Right on cue, earned October 14");
  check("locked with count", L[2] === "Ten shows, not earned yet, 7 of 10");
  check("locked with types", L[5] === "Full repertoire, not earned yet, 4 of 5 types");
  check("locked with days", L[7] === "Three-night run, not earned yet, 2 of 3 days");
  check("locked with rule only", L[6] === "Long run, not earned yet, 5 min+ at a speaking pace");
  check("lines", shelf.items.map(i => i.line).join("|") === "First performance|5 performances|7 of 10|Within 10 seconds of the limit|1 min+ of speech, 2 fillers or fewer|4 of 5 types|5 min+ at a speaking pace|2 of 3 days");
  check("rules as descriptions", shelf.items[3].desc === "Within 10 seconds of the limit" && shelf.items[2].desc === "10 performances" && shelf.items[6].desc === null);
  check("locked greyed", shelf.items[2].locked && shelf.items[2].opacity === "0.55" && !shelf.items[0].locked && shelf.items[0].opacity === "1");
  check("cup/medal shapes", await b.evaluate(`Array.from(document.querySelectorAll('.trophy-btn svg')).map(s => s.querySelector('circle') ? 'm' : 'c').join('') === 'cccmmmmc'`));
  await b.shot(OUT + "shelf-1280.png");
  // popover by click
  await b.evaluate(`trophyButtons.get('ten-shows').click(); true`); await sleep(100);
  check("click opens the card", await b.evaluate(`!trophyPopover.hidden && trophyPopName.textContent === 'Ten shows' && trophyPopRule.textContent === '10 performances' && trophyPopState.textContent === 'So far: 7 of 10'`));
  await b.shot(OUT + "popover-1280.png");
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 780, button: "left", clickCount: 1 });
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 640, y: 780, button: "left", clickCount: 1 });
  await sleep(100);
  check("click outside closes it", await b.evaluate(`trophyPopover.hidden`));
  // keyboard
  await b.evaluate(`wallTitle.focus(); true`);
  let guard = 0;
  while (guard++ < 15 && !(await b.evaluate(`document.activeElement.classList.contains('trophy-btn')`))) await b.key("Tab");
  check("keyboard focus opens it", await b.evaluate(`!trophyPopover.hidden && trophyPopName.textContent === 'Opening night' && trophyPopState.textContent.startsWith('Earned on October 14')`));
  await b.key("Enter");
  check("Enter keeps it open", await b.evaluate(`!trophyPopover.hidden`));
  await b.key("Tab");
  check("next trophy switches it", await b.evaluate(`!trophyPopover.hidden && trophyPopName.textContent === 'Five shows'`));
  await b.key("Escape");
  check("Escape closes, focus stays", await b.evaluate(`trophyPopover.hidden && document.activeElement === trophyButtons.get('five-shows')`));
  check("hint hidden on laptop", await b.evaluate(`getComputedStyle(document.querySelector('.shelf-hint')).display === 'none'`));
  check("no console errors", b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
});

await test("phones and short laptop", async () => {
  for (const [w, h, mobile, name] of [[390, 780, true, "phone"], [360, 740, true, "phone360"], [1280, 720, false, "1280x720"]]) {
    const b = await page({ width: w, height: h, mobile });
    await b.evaluate(SEED);
    await b.evaluate(`trophyProgress = Object.assign(emptyProgress(), { performances: 7, earned: { "opening-night": new Date().toISOString(), "right-on-cue": new Date().toISOString() } }); writeTrophies(); true`);
    await b.go("wall");
    const m = await b.evaluate(`(() => { const btns = Array.from(document.querySelectorAll('.trophy-btn')); const r = btns.map(x => x.getBoundingClientRect()); return { tops: [...new Set(r.map(x => Math.round(x.top)))].length, left: Math.round(r[0].left), right: Math.round(innerWidth - r[7].right), w: Math.round(r[0].width), h: Math.round(r[0].height), hscroll: document.documentElement.scrollWidth > innerWidth, pageScroll: document.documentElement.scrollHeight - innerHeight, hint: getComputedStyle(document.querySelector('.shelf-hint')).display, names: getComputedStyle(document.querySelector('.trophy-name')).display, framesScroll: getComputedStyle(document.getElementById('wallFrames')).overflowY }; })()`);
    console.log(`  ${name}: ${JSON.stringify(m)}`);
    check(`${name}: no horizontal scroll, no page scroll`, !m.hscroll && m.pageScroll <= 1);
    if (mobile) {
      check(`${name}: one centered row of 8`, m.tops === 1 && Math.abs(m.left - m.right) <= 2);
      check(`${name}: 36x40 icon buttons, names hidden, hint shown`, m.w === 36 && m.h === 40 && m.names === "none" && m.hint === "block");
      const shelfTop = await b.evaluate(`Math.round(document.querySelector('.shelf').getBoundingClientRect().top)`);
      await b.evaluate(`document.getElementById('wallFrames').scrollTop = 300; true`); await sleep(150);
      check(`${name}: shelf stays while frames scroll`, shelfTop === await b.evaluate(`Math.round(document.querySelector('.shelf').getBoundingClientRect().top)`));
      await b.evaluate(`document.getElementById('wallFrames').scrollTop = 0; true`);
      // tap the last trophy
      const r = await b.evaluate(`(() => { const x = trophyButtons.get('three-night-run').getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2 }; })()`);
      for (const type of ["touchStart", "touchEnd"]) await b.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchStart" ? [{ x: r.x, y: r.y }] : [] });
      await sleep(300);
      const pop = await b.evaluate(`(() => { const p = trophyPopover.getBoundingClientRect(); return { shown: !trophyPopover.hidden, name: trophyPopName.textContent, inView: p.left >= 0 && p.right <= innerWidth, state: trophyPopState.textContent }; })()`);
      check(`${name}: tap opens the card, on screen`, pop.shown && pop.name === "Three-night run" && pop.inView, pop);
      check(`${name}: card above the playbills`, await b.evaluate(`(() => { const p = trophyPopover.getBoundingClientRect(); const el = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2); return trophyPopover.contains(el); })()`));
      await b.shot(OUT + `popover-${name}.png`);
      for (const type of ["touchStart", "touchEnd"]) await b.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchStart" ? [{ x: 20, y: h - 120 }] : [] });
      await sleep(300);
      check(`${name}: tap outside closes`, await b.evaluate(`trophyPopover.hidden`));
    } else {
      check(`${name}: trophies on one row`, m.tops === 1, m.tops);
    }
    await b.shot(OUT + `shelf-${name}.png`);
    await b.evaluate(`localStorage.removeItem("speakreview.wall.v1"); loadWall(); renderWall(); true`);
    check(`${name}: shelf shows on an empty wall`, await b.evaluate(`!wallEmpty.hidden && document.querySelector('.shelf').getClientRects().length > 0`));
    await b.shot(OUT + `shelf-empty-${name}.png`);
    if (mobile) {
      await b.evaluate(`showTrophyBanner([TROPHIES[1], TROPHIES[4]]); true`);
      await b.go("backstage");
      await b.evaluate(`displayResult({ wpm: 120, speaking_seconds: 75, filler_word_total: 1, ai_feedback: "Strengths:\\n1. Good." }); true`);
      await b.settled();
      check(`${name}: banner fits`, await b.evaluate(`(() => { const r = trophyBanner.getBoundingClientRect(); return !trophyBanner.hidden && r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()`));
      await b.shot(OUT + `banner-${name}.png`);
    }
    check(`${name}: no console errors`, b.consoleErrors.length === 0, b.consoleErrors.join(" | "));
    await b.close();
  }
});

await test("privacy text", async () => {
  const b = await page();
  check("privacy sentence", await b.evaluate(`privacyNote.textContent.includes("results after 30 days. Your Wall of Fame and trophies are saved only in this browser on this device.") && privacyNote.textContent.endsWith("saved on this device for your latest 30 performances.")`));
});

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILURE(S)"}`);
process.exit(0);
