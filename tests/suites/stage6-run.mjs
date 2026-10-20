// Stage 6: Your run so far, and the Long run trophy
import { launch, sleep, LIVE, BASE, only, check, finish, open, done, shot, COLOR_CONTRAST, contrastOk } from "../lib/page.mjs";
import { seedEntries } from "../lib/run-seed.mjs";

// ================================================================ Stage 6: Your run so far + Long run fix

async function wall(b, entries, extra = "") {
  await b.evaluate(`(() => { localStorage.setItem("speakreview.wall.v1", ${JSON.stringify(JSON.stringify(entries))}); ${extra} loadWall(); if (currentView === "wall") renderWall(); else goToView("wall"); })()`);
  await b.settled();
}
const BOARD = `(() => {
  const vis = e => e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none";
  const charts = [...document.querySelectorAll(".run-chart")].filter(vis);
  return {
    early: vis(document.getElementById("runEarly")), earlyText: document.getElementById("runEarlyText").textContent,
    lit: document.querySelectorAll(".run-bulb.is-lit").length, filters: vis(document.getElementById("runRange")),
    charts: charts.map(c => ({ metric: c.dataset.metric, tag: c.querySelector(".run-tag")?.textContent, headline: c.querySelector(".run-headline")?.textContent,
      sentence: c.querySelector(".run-sentence")?.textContent, dots: c.querySelectorAll(".run-dot").length,
      axis: [...c.querySelectorAll(".run-axis span")].map(s => s.textContent), labels: [...c.querySelectorAll(".run-dot")].map(d => d.getAttribute("aria-label")) })),
    all: [...document.querySelectorAll(".run-chart")].map(c => ({ metric: c.dataset.metric, sentence: c.querySelector(".run-sentence")?.textContent, dots: c.querySelectorAll(".run-dot").length,
      tag: c.querySelector(".run-tag")?.textContent, labels: [...c.querySelectorAll(".run-dot")].map(d => d.getAttribute("aria-label")),
      pressed: [...c.querySelectorAll(".run-dot[aria-pressed='true']")].map(d => d.dataset.key) })),
    selTitle: document.getElementById("runSelTitle").textContent, selTopic: document.getElementById("runSelTopic").textContent,
    selValues: document.getElementById("runSelValues").textContent, open: vis(document.getElementById("runOpenBtn")),
    note: document.getElementById("runNote").textContent
  };
})()`;
const pickRange = (b, v) => b.evaluate(`(() => { const r = document.querySelector('input[name="runRange"][value="${v}"]'); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); })()`);

if (!only || only === "counts") {
  console.log("\n== seeded counts");
  const b = await open();
  for (const n of [0, 2]) {
    await wall(b, seedEntries(n));
    const r = await b.evaluate(BOARD);
    const words = ["three", "two", "one"][n];
    check(`${n} performances: early state, ${n} bulbs lit, no filters`, r.early && r.lit === n && !r.filters && r.earlyText === `Your trends light up after 3 performances. ${n} of 3 done, ${words} more to go.`, r.earlyText);
  }
  await shot(b, "run-early-1280");
  await wall(b, seedEntries(3));
  let r = await b.evaluate(BOARD);
  check("3 performances: the charts light up", !r.early && r.charts.length === 3 && r.charts.every(c => c.dots === 3));
  await wall(b, seedEntries(5));
  r = await b.evaluate(BOARD);
  check("5 performances: Last 10 shows all 5", r.charts.every(c => c.dots === 5) && /^(Down from \d\.\d to \d\.\d on average |About the same, \d\.\d on average, )across your last 5 shows\.$/.test(r.charts[0].sentence), r.charts[0].sentence);
  await wall(b, seedEntries(12));
  for (const [range, dots] of [["prev", 2], ["5", 5], ["10", 10], ["all", 12]]) {
    await pickRange(b, range);
    r = await b.evaluate(BOARD);
    check(`12 performances, filter ${range}: ${dots} dots in each chart`, r.charts.every(c => c.dots === dots), r.charts.map(c => c.dots).join());
  }
  // 40 performances over about 10 weeks: All groups by week
  await wall(b, seedEntries(40, { spacing: 1.75 }));
  await pickRange(b, "all");
  r = await b.evaluate(BOARD);
  check("40 performances, All: one dot per week (at most 30)", r.charts[0].dots > 0 && r.charts[0].dots <= 30 && r.charts[0].dots < 40 && r.charts[0].labels[0].startsWith("Fillers per minute (um and uh), Week of "), `${r.charts[0].dots} dots; ${r.charts[0].labels[0]}`);
  check("40 performances, All: the note says so", r.note === "You have 40 shows, so All shows one dot per week (weekly averages) to stay readable. Tap any dot to see it.", r.note);
  check("40 performances, All: weekly sentence and axis", r.charts[0].sentence.endsWith("across all 40 shows.") && r.charts[1].sentence.endsWith(" weeks.") && r.charts[0].axis[0].startsWith("Wk of "), `${r.charts[0].sentence} / ${r.charts[1].sentence}`);
  check("40 performances, All: the Selected bar shows the week, without Open its playbill", /^Week of .+ \(\d+ shows?, averages\)$/.test(r.selTitle) && !r.open, r.selTitle);
  await shot(b, "run-40-all-1280");
  for (const [range, dots] of [["prev", 2], ["5", 5], ["10", 10]]) {
    await pickRange(b, range);
    r = await b.evaluate(BOARD);
    check(`40 performances, filter ${range}: ${dots} dots`, r.charts.every(c => c.dots === dots));
  }
  await done(b);
}

if (!only || only === "rules") {
  console.log("\n== rules: what counts, numbers, tags, sentences");
  const b = await open();
  // Untimed only: no timing data
  await wall(b, seedEntries(6, { untimed: true }));
  let r = await b.evaluate(BOARD);
  const t = r.all.find(c => c.metric === "off");
  check("untimed only: the timing chart has no dots and says why", t.dots === 0 && t.sentence === "No timed shows here yet. Set a speaking time to see this one." && t.tag === "Not enough yet", t.sentence);
  check("untimed only: the other charts work, Selected says Untimed", r.all.find(c => c.metric === "fillers").dots === 6 && r.selValues.endsWith("Untimed"), r.selValues);
  // Too short, tampered and partial entries
  const base = seedEntries(4).reverse();        // oldest first
  const odd = [
    { ...base[0], id: "short1", savedAt: "2026-08-25T12:00:00.000Z", too_short: true, wpm: 0, speaking_seconds: 600 },
    { ...base[0], id: "huge", savedAt: "2026-08-26T12:00:00.000Z", wpm: 5000 },
    { ...base[0], id: "str", savedAt: "2026-08-27T12:00:00.000Z", wpm: "fast" },
    { ...base[0], id: "neg", savedAt: "2026-08-28T12:00:00.000Z", speaking_seconds: -5 },
    { ...base[0], id: "nobreak", savedAt: "2026-08-29T12:00:00.000Z", filler_word_breakdown: null, wpm: 140 },
    { ...base[0], id: "exact", savedAt: "2026-08-30T12:00:00.000Z", speaking_seconds: 120, time_limit_seconds: 90, wpm: 150, filler_word_breakdown: { um: 3, uh: 1, like: 5, "you know": 2, so: 4 } }
  ];
  await wall(b, [...base, ...odd].reverse());
  await pickRange(b, "all");
  r = await b.evaluate(BOARD);
  const dots = c => r.all.find(x => x.metric === c).labels;
  check("too-short, huge-pace, text and negative entries are skipped", dots("pace").length === 6 && !dots("pace").some(l => l.includes("5000")), dots("pace").length + " pace dots");
  check("an entry without a filler breakdown counts for pace, not fillers", dots("fillers").length === 5 && dots("pace").length === 6);
  check("fillers per minute counts um and uh only: (3 + 1) / 2 min = 2.0", dots("fillers")[4] === "Fillers per minute (um and uh), Show 6, Aug 30: 2.0/min", dots("fillers")[4]);
  check("time accuracy: |120 - 90| = 0:30 off", dots("off")[5] === "Time accuracy, Show 6, Aug 30: 0:30 off", dots("off")[5]);
  // Tags, exactly at 10%
  const tag = (m, v) => b.evaluate(`runTag(${JSON.stringify(m)}, ${JSON.stringify(v)}).tag`);
  check("tag: 10% lower fillers = Improving", (await tag("fillers", [2, 2, 1.8, 1.8])) === "Improving");
  check("tag: 10% higher fillers = Slipping", (await tag("fillers", [2, 2, 2.2, 2.2])) === "Slipping");
  check("tag: 9.9% lower = Steady", (await tag("fillers", [2, 2, 1.802, 1.802])) === "Steady");
  check("tag: 9.9% higher = Steady", (await tag("off", [30, 30, 32.97, 32.97])) === "Steady");
  check("tag: exactly 10% on timing (0:30 to 0:27) = Improving", (await tag("off", [30, 27])) === "Improving");
  check("tag: odd count leaves out the middle (2, 9, 1.8)", (await tag("fillers", [2, 9, 1.8])) === "Improving");
  check("tag: one value = Not enough yet", (await tag("fillers", [2])) === "Not enough yet");
  check("pace band: 130 and 160 are In range", (await tag("pace", [100, 130])) === "In range" && (await tag("pace", [100, 160])) === "In range");
  check("pace band: 129 A bit slow, 161 A bit fast", (await tag("pace", [140, 129])) === "A bit slow" && (await tag("pace", [140, 161])) === "A bit fast");
  check("every tag has an icon and a word", await b.evaluate(`[...document.querySelectorAll(".run-tag")].every(t => t.querySelector("svg path") && t.textContent.trim().length > 2)`));
  // Sentences per filter
  await wall(b, seedEntries(12));
  const sentences = {};
  for (const range of ["prev", "5", "10", "all"]) {
    await pickRange(b, range);
    r = await b.evaluate(BOARD);
    sentences[range] = r.charts.map(c => [c.headline, c.sentence]);
  }
  check("Last vs previous: previous → latest and Last time / this time", /^\d\.\d → \d\.\d$/.test(sentences.prev[0][0]) && /^Last time \d\.\d, this time \d\.\d\.$/.test(sentences.prev[0][1]), JSON.stringify(sentences.prev[0]));
  check("Last 5 / Last 10 / All sentences", sentences["5"][0][1].endsWith("across your last 5 shows.") && sentences["10"][0][1].endsWith("across your last 10 shows.") && sentences.all[0][1].endsWith("across all your shows.") && sentences.all[2][1].endsWith("across all your timed shows."));
  check("pace sentence uses the band", /^In the comfortable band for \d+ of 12 shows\.$/.test(sentences.all[1][1]), sentences.all[1][1]);
  check("no em dashes in the board", !(await b.evaluate(`runBoard.textContent.includes("\\u2014")`)));
  await done(b);
}

if (!only || only === "dots") {
  console.log("\n== dots: mouse, touch and keyboard");
  const b = await open();
  await wall(b, seedEntries(12));
  await b.evaluate(`runBoard.scrollIntoView({ block: "start" })`);
  await sleep(200);
  await b.mouse('.run-chart[data-metric="fillers"] .run-dot');
  let r = await b.evaluate(BOARD);
  check("click a dot: that show is picked in all three charts", r.all.every(c => JSON.stringify(c.pressed) === '["run3"]'), JSON.stringify(r.all.map(c => c.pressed)));
  check("click a dot: the Selected bar shows it", r.selTitle === "Show 3, Aug 19" && r.selTopic === "  ·  What makes a good apology?" && /^Fillers \d\.\d\/min  ·  Pace \d+ wpm  ·  0:\d\d from limit$/.test(r.selValues), `${r.selTitle}${r.selTopic} | ${r.selValues}`);
  await b.mouse("#runOpenBtn");
  await sleep(300);
  check("Open its playbill opens that show's playbill", await b.evaluate(`!playbillDialog.hidden && pbTitle.textContent === "What makes a good apology?"`));
  await b.evaluate("closeDialog()");
  check("closing the playbill returns to Open its playbill", (await b.evaluate("document.activeElement.id")) === "runOpenBtn");
  // Keyboard on the dots
  await b.evaluate(`document.querySelector('.run-chart[data-metric="pace"] .run-dot[tabindex="0"]').focus()`);
  await b.key("ArrowRight");
  r = await b.evaluate(BOARD);
  check("ArrowRight moves to the next show and keeps focus in the chart", r.selTitle === "Show 4, Aug 20" && (await b.evaluate(`document.activeElement.classList.contains("run-dot") && document.activeElement.closest(".run-chart").dataset.metric === "pace" && document.activeElement.getAttribute("aria-pressed") === "true"`)), r.selTitle);
  await b.key("End");
  check("End goes to the latest show", (await b.evaluate(BOARD)).selTitle === "Show 12, Aug 28");
  await b.key("Home");
  check("Home goes to the first show in the range", (await b.evaluate(BOARD)).selTitle === "Show 3, Aug 19");
  check("only one Tab stop per chart", await b.evaluate(`[...document.querySelectorAll(".run-chart")].every(c => c.querySelectorAll('.run-dot[tabindex="0"]').length === 1)`));
  // Keyboard on the filters (native radios)
  await b.evaluate(`document.querySelector('input[name="runRange"]:checked').focus()`);
  await b.key("ArrowRight");
  r = await b.evaluate(BOARD);
  check("filters: ArrowRight from Last 10 picks All", (await b.evaluate(`document.querySelector('input[name="runRange"]:checked').value`)) === "all" && r.charts[0].dots === 12);
  await b.key("ArrowLeft"); await b.key("ArrowLeft");
  check("filters: ArrowLeft twice picks Last 5", (await b.evaluate(`document.querySelector('input[name="runRange"]:checked').value`)) === "5" && (await b.evaluate(BOARD)).charts[0].dots === 5);
  check("a new filter picks the latest show again", (await b.evaluate(BOARD)).selTitle === "Show 12, Aug 28");
  await done(b);

  console.log("\n== phone: tap a dot, switch the measurement");
  const p = await open({ width: 390, height: 780 });
  await wall(p, seedEntries(12));
  await p.evaluate(`runBoard.scrollIntoView({ block: "start" })`);
  await sleep(200);
  r = await p.evaluate(BOARD);
  check("phone: one measurement at a time (Fillers)", r.charts.length === 1 && r.charts[0].metric === "fillers");
  await p.mouse('.run-chart[data-metric="fillers"] .run-dot');
  check("phone: tapping a dot picks it", (await p.evaluate(BOARD)).selTitle === "Show 3, Aug 19");
  await p.evaluate("runTabFillers.focus()");
  await p.key("ArrowRight");
  r = await p.evaluate(BOARD);
  check("phone: switcher to Pace (keyboard), the pick stays", r.charts.length === 1 && r.charts[0].metric === "pace" && r.all.find(c => c.metric === "pace").pressed[0] === "run3");
  await p.mouse("#runTabOff");
  r = await p.evaluate(BOARD);
  check("phone: tap Timing", r.charts.length === 1 && r.charts[0].metric === "off");
  await shot(p, "run-phone-timing");
  await done(p);
}

if (!only || only === "trophy") {
  console.log("\n== Long run trophy");
  const b = await open();
  const rule = (perf) => b.evaluate(`TROPHIES.find(t => t.id === "long-run").earnedBy(emptyProgress(), trophyPerformance(${JSON.stringify(perf)}))`);
  check("silent 10-minute take (too short, 0 wpm): no Long run", !(await rule({ speaking_seconds: 600, wpm: 0, too_short: true })));
  check("10-minute take at 0 wpm (not too short): no Long run", !(await rule({ speaking_seconds: 600, wpm: 0 })));
  check("10-minute take at 59 wpm: no Long run", !(await rule({ speaking_seconds: 600, wpm: 59 })));
  check("5-minute take at 120 wpm: Long run", await rule({ speaking_seconds: 300, wpm: 120 }));
  check("the rule text says so", (await b.evaluate(`TROPHIES.find(t => t.id === "long-run").rule`)) === "5 min+ at a speaking pace");
  // The real path: a result arriving
  await b.evaluate(`localStorage.clear()`);
  const silent = await b.evaluate(`(() => { const r = recordTrophies({ speaking_seconds: 600, wpm: 0, filler_word_total: 0 }); return { names: r.map(t => t.id), earned: !!trophyProgress.earned["long-run"] }; })()`);
  check("recorded silent 10-minute take: no Long run", !silent.earned && !silent.names.includes("long-run"), JSON.stringify(silent));
  const real = await b.evaluate(`(() => { const r = recordTrophies({ speaking_seconds: 320, wpm: 130, filler_word_total: 3 }); return r.map(t => t.id); })()`);
  check("recorded real 5-minute take: Long run unlocked", real.includes("long-run"), JSON.stringify(real));
  await done(b);

  // The one-time catch-up uses the same rule
  for (const [name, entries, want] of [
    ["silent takes only", [{ id: "s1", savedAt: "2026-09-01T10:00:00.000Z", speaking_seconds: 600, wpm: 0, too_short: true }, { id: "s2", savedAt: "2026-09-02T10:00:00.000Z", speaking_seconds: 600, wpm: 0 }], false],
    ["a real long take", [{ id: "r1", savedAt: "2026-09-03T10:00:00.000Z", speaking_seconds: 330, wpm: 128 }], true]]) {
    const c = await open();
    await c.evaluate(`(() => { localStorage.clear(); localStorage.setItem("speakreview.wall.v1", ${JSON.stringify(JSON.stringify(entries))}); location.reload(); })()`);
    await c.waitFor("document.readyState === 'complete' && typeof trophyProgress !== 'undefined'");
    await sleep(500);
    check(`catch-up with ${name}: Long run ${want ? "earned" : "not earned"}`, (await c.evaluate(`!!trophyProgress.earned["long-run"]`)) === want);
    await done(c);
  }
  // Already earned stays earned
  const k = await open();
  await k.evaluate(`(() => { localStorage.setItem("speakreview.trophies.v1", JSON.stringify({ performances: 3, topicTypes: [], practiceDays: ["2026-09-01"], earned: { "opening-night": "2026-09-01T10:00:00.000Z", "long-run": "2026-09-01T10:00:00.000Z" } })); loadTrophies(); })()`);
  await wall(k, seedEntries(3));
  check("a Long run already earned stays earned on the shelf", await k.evaluate(`!!trophyProgress.earned["long-run"] && /Long run, earned/.test(trophyButtons.get("long-run").getAttribute("aria-label"))`));
  await done(k);
}

if (!only || only === "layout") {
  console.log("\n== layout");
  for (const [w, h] of [[1366, 641], [1280, 800], [1920, 1080], [683, 768], [390, 780], [360, 740]]) {
    const tag = `${w}x${h}`;
    const b = await open({ width: w, height: h });
    await wall(b, seedEntries(12));
    await b.evaluate(`runBoard.scrollIntoView({ block: "start" })`);
    await sleep(250);
    const m = await b.evaluate(`(() => {
      const box = e => e.getBoundingClientRect();
      const charts = [...document.querySelectorAll(".run-chart")].filter(c => c.getClientRects().length && getComputedStyle(c).display !== "none");
      const board = box(runBoard);
      const fonts = [...runBoard.querySelectorAll("*")].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest(".visually-hidden") && getComputedStyle(e).position !== "absolute").map(e => parseFloat(getComputedStyle(e).fontSize));
      return { charts: charts.length, sideways: document.documentElement.scrollWidth - innerWidth, boardIn: board.left >= 0 && board.right <= innerWidth,
        plotsFit: charts.every(c => { const p = box(c.querySelector(".run-plot")), t = box(c); return p.width <= t.width + 0.5 && [...c.querySelectorAll(".run-dot")].every(d => { const r = box(d); return r.left >= t.left - 4 && r.right <= t.right + 4; }); }),
        minFont: Math.min(...fonts),
        titlesOneLine: charts.every(c => { const n = c.querySelector(".run-name"); return n.getBoundingClientRect().height <= parseFloat(getComputedStyle(n).fontSize) * 1.7 && n.scrollWidth <= n.clientWidth + 1 && n.getBoundingClientRect().right <= c.getBoundingClientRect().right + 0.5; }),
        headlinesLevel: new Set(charts.map(c => Math.round(c.querySelector(".run-headline").getBoundingClientRect().top))).size === 1 };
    })()`);
    check(`${tag}: ${w >= 990 ? "three charts side by side" : "one chart with the switcher"}`, m.charts === (w >= 990 ? 3 : 1) && (w >= 990) === (await b.evaluate(`getComputedStyle(document.getElementById("runTabs")).display === "none"`)));
    check(`${tag}: no sideways scroll, board and charts inside, dots inside their tile`, m.sideways <= 0 && m.boardIn && m.plotsFit, JSON.stringify(m));
    check(`${tag}: text at least 11px`, m.minFont >= 11, String(m.minFont));
    check(`${tag}: chart titles on one line, inside their tile; headlines lined up`, m.titlesOneLine && m.headlinesLevel);
    contrastOk(await b.evaluate(COLOR_CONTRAST([".run-title", ".run-pill > span", ".run-name", ".run-tag", ".run-headline", ".run-axis span", ".run-sentence", ".run-selected-title", ".run-selected-topic", ".run-selected-values", ".run-open", ".run-note", ".run-tab"])), `${tag} board`);
    await shot(b, `run-${tag}`);
    await done(b);
  }
  const e = await open();
  await wall(e, seedEntries(2));
  contrastOk(await e.evaluate(COLOR_CONTRAST([".run-early-text", ".run-title"])), "early state");
  await done(e);

  console.log("\n== unchanged: the trophy shelf (pixels vs the previous commit)");
  for (const [w, h] of [[1280, 800], [1366, 641], [390, 780]]) {
    const pics = [];
    for (const url of [BASE, LIVE]) {
      const b = await launch({ width: w, height: h, flags: [], mobile: w <= 600 });
      await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await b.goto(url, []);
      await b.evaluate(`(() => { localStorage.setItem("speakreview.wall.v1", ${JSON.stringify(JSON.stringify(seedEntries(12)))}); loadWall(); goToView("wall"); })()`);
      for (let i = 0; i < 80 && await b.evaluate("document.body.classList.contains('curtains-closed') || appRoot.inert"); i++) await sleep(100);
      await b.evaluate("document.fonts.ready.then(() => true)");
      // Wait until the layout stops moving
      let last = "";
      for (let i = 0; i < 30; i++) {
        const now = await b.evaluate(`JSON.stringify(document.querySelector(".shelf").getBoundingClientRect())`);
        if (now === last) break;
        last = now;
        await sleep(200);
      }
      const m = await b.evaluate(`(() => { const r = e => { const x = e.getBoundingClientRect(); return [Math.floor(x.left), Math.floor(x.top), Math.ceil(x.right), Math.ceil(x.bottom)]; };
        return { shelf: r(document.querySelector(".shelf")), skip: r(trophyButtons.get("long-run")), board: document.getElementById("runBoard") ? r(runBoard) : null }; })()`);
      pics.push({ data: (await b.send("Page.captureScreenshot", { format: "png" })).data, ...m });
      await b.close();
    }
    const [before, after] = pics;
    const d = await launch({ width: w, height: h });
    await d.send("Page.navigate", { url: "about:blank" });
    await sleep(200);
    const cut = before.shelf[3];
    const res = await d.evaluate(`(async () => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
      const [A, B] = await Promise.all([load(${JSON.stringify(before.data)}), load(${JSON.stringify(after.data)})]);
      const px = img => { const k = document.createElement("canvas"); k.width = img.width; k.height = ${cut}; const x = k.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, ${cut}).data; };
      const skip = ${JSON.stringify(after.skip)};
      const P = px(A), Q = px(B); let n = 0;
      for (let i = 0; i < P.length; i += 4) { const x = (i / 4) % A.width, y = Math.floor(i / 4 / A.width); if (x >= skip[0] && x <= skip[2] && y >= skip[1] && y <= skip[3]) continue;
        if (Math.abs(P[i] - Q[i]) + Math.abs(P[i + 1] - Q[i + 1]) + Math.abs(P[i + 2] - Q[i + 2]) > 6) n++; }
      return n; })()`);
    await d.close();
    // Differences of a few colour levels (layer compositing next to the sign's shadow) are not visible, so they are ignored.
    // The Long run trophy's rule text changed on purpose ("5 min+ at a speaking pace"): only its own box is left out
    check(`${w}x${h}: header, title and trophy shelf identical to the eye and the same size (Long run's rule text excepted)`,
      res === 0 && JSON.stringify(before.shelf) === JSON.stringify(after.shelf) && JSON.stringify(before.skip) === JSON.stringify(after.skip), `${res} px differ; shelf ${before.shelf} / ${after.shelf}`);
    if (w > 600) check(`${w}x${h}: the board starts ${after.board[1] - after.shelf[3]}px under the shelf (its shadow stays off it)`, after.board[1] - after.shelf[3] >= 20);
  }
}

if (!only || only === "tidy") {
  console.log("\n== tidied text: subtitle, note, Fillers title, sentences agree with tags");
  const b = await open();
  await wall(b, seedEntries(12));
  let r = await b.evaluate(BOARD);
  check("no subtitle", await b.evaluate(`!document.querySelector(".run-sub") && !runBoard.textContent.includes("Measured, not judged")`));
  check("no generic note under the board", (await b.evaluate(`document.getElementById("runNote").hidden`)) && r.note === "" && !(await b.evaluate(`runBoard.textContent.includes("Tap any dot to see that show")`)));
  check("Fillers title: Fillers per minute · um, uh (caps like the others)", (await b.evaluate(`document.querySelector('.run-chart[data-metric="fillers"] .run-name').textContent`)) === "Fillers per minute · um, uh"
    && (await b.evaluate(`[...document.querySelectorAll(".run-name")].every(n => getComputedStyle(n).textTransform === "uppercase")`)));
  check("switcher pill stays Fillers", (await b.evaluate(`runTabFillers.textContent`)) === "Fillers");
  check("dots say um and uh to screen readers", r.all.find(c => c.metric === "fillers").labels.every(l => l.startsWith("Fillers per minute (um and uh), Show ")), r.all.find(c => c.metric === "fillers").labels[0]);
  await pickRange(b, "all");
  check("All with 12 shows: still no note", await b.evaluate(`document.getElementById("runNote").hidden`));
  await wall(b, seedEntries(40, { spacing: 1.75 }));
  await pickRange(b, "all");
  r = await b.evaluate(BOARD);
  check("All with 40 shows: the weekly note stays", !(await b.evaluate(`document.getElementById("runNote").hidden`)) && r.note === "You have 40 shows, so All shows one dot per week (weekly averages) to stay readable. Tap any dot to see it.", r.note);

  // The sentence uses the same numbers as the tag
  const say = (m, values, range = "10", view = { grouped: false, total: values.length }) => b.evaluate(`({ tag: runTag(${JSON.stringify(m)}, ${JSON.stringify(values)}).tag, text: runSentence(${JSON.stringify(m)}, ${JSON.stringify(range)}, ${JSON.stringify(values)}, ${JSON.stringify(view)}) })`);
  const CASES = [
    ["fillers 10% down (exact)", "fillers", [2, 2, 1.8, 1.8], "Improving", "Down from 2.0 to 1.8 on average across your last 4 shows."],
    ["fillers 10% up (exact)", "fillers", [2, 2, 2.2, 2.2], "Slipping", "Up from 2.0 to 2.2 on average across your last 4 shows."],
    ["fillers 9.9% down", "fillers", [2, 2, 1.802, 1.802], "Steady", "About the same, 1.9 on average, across your last 4 shows."],
    ["fillers odd count (middle left out)", "fillers", [2, 9, 1.8], "Improving", "Down from 2.0 to 1.8 on average across your last 3 shows."],
    ["fillers even count of 6", "fillers", [3, 2, 1, 1, 1, 1], "Improving", "Down from 2.0 to 1.0 on average across your last 6 shows."],
    ["timing 10% down (exact)", "off", [30, 30, 27, 27], "Improving", "Down from 0:30 to 0:27 on average across your last 4 timed shows."],
    ["timing two shows, 10% up", "off", [30, 33], "Slipping", "Up from 0:30 to 0:33 on average across your last 2 timed shows."],
    ["timing 9.9% up", "off", [30, 30, 32.97, 32.97], "Steady", "About the same, 0:31 on average, across your last 4 timed shows."],
    ["tiny fillers never read 0.0 to 0.0", "fillers", [0.04, 0.04, 0.02, 0.02], "Improving", "Down from 0.04 to 0.02 on average across your last 4 shows."],
    ["timing less than a second apart", "off", [4, 4, 3.5, 3.5], "Improving", "Down from 4.0s to 3.5s on average across your last 4 timed shows."]
  ];
  for (const [name, m, values, tag, text] of CASES) {
    const got = await say(m, values);
    check(`sentence matches tag: ${name}`, got.tag === tag && got.text === text, `${got.tag}: ${got.text}`);
  }
  let got = await say("fillers", [2, 2, 1.8, 1.8], "all", { grouped: true, total: 40 });
  check("weekly grouping: Down from ... across all 40 shows", got.text === "Down from 2.0 to 1.8 on average across all 40 shows.", got.text);
  got = await say("off", [30, 30, 27, 27], "all", { grouped: false, total: 4 });
  check("All: across all your timed shows", got.text === "Down from 0:30 to 0:27 on average across all your timed shows.", got.text);
  got = await say("fillers", [2, 1.5], "prev");
  check("Last vs previous keeps Last time / this time", got.text === "Last time 2.0, this time 1.5." && got.tag === "Improving", got.text);
  got = await say("pace", [150, 140, 120]);
  check("Pace keeps its band sentence", got.text === "In the comfortable band for 2 of 3 shows.", got.text);

  // On the page, for every filter, with 12 and 40 shows: Fillers and Timing sentences agree with their tags
  const START = { Improving: "Down from ", Slipping: "Up from ", Steady: "About the same, " };
  for (const [n, opts] of [[12, {}], [40, { spacing: 1.75 }]]) {
    await wall(b, seedEntries(n, opts));
    for (const range of ["5", "10", "all"]) {
      await pickRange(b, range);
      r = await b.evaluate(BOARD);
      const bad = r.all.filter(c => c.metric !== "pace" && c.dots > 1 && !c.sentence.startsWith(START[c.tag]));
      check(`${n} shows, ${range}: Fillers and Timing sentences agree with their tags`, bad.length === 0, r.all.filter(c => c.metric !== "pace").map(c => `${c.tag}: ${c.sentence}`).join(" | "));
    }
  }
  await done(b);
}

finish();
