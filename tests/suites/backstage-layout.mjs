// Backstage laid out as in the mockup (number row, buttons at the bottom right)
import { launch, sleep, LIVE, BASE, only, check, finish, WORDS, open, done, shot, COLOR_CONTRAST, contrastOk } from "../lib/page.mjs";
// ================================================================ Backstage layout to match the mockup
const REVIEW = {
  structure: { level: 3, reason: "Clear position up front, story in the middle." },
  clarity: { level: 2, reason: "Easy to follow, but the point repeated twice." },
  on_topic: { level: 4, reason: "Every sentence answered the question." },
  word_choice: { level: 1, reason: "\"Basically\" softened your strongest lines." }
};
const NORMAL = { wpm: 132, filler_word_total: 5, filler_word_breakdown: { um: 3, uh: 2 }, avg_confidence: 0.84, ai_feedback: "Strengths:\n1. Clear position.\nWeaknesses:\n1. Fillers at transitions.",
  speaking_seconds: 222, time_limit_seconds: 180, source: "recording", topic: "Is failure a better teacher than success?", topic_type: "persuade", review: REVIEW, words: WORDS.slice(0, 18) };
const LONG = { ...NORMAL, topic: "How do our habits shape who we become, and what small daily choices end up mattering most over a whole lifetime?", topic_type: "explain",
  cut_off: true, time_limit_seconds: 300, speaking_seconds: 600, filler_word_total: 14,
  filler_word_breakdown: { um: 4, uh: 3, like: 2, "you know": 2, so: 1, actually: 1, basically: 1 },
  ai_feedback: "Strengths:\n" + Array.from({ length: 12 }, (_, i) => `${i + 1}. A strength about the speech, number ${i + 1}.`).join("\n") };

const MEASURE = `(() => {
  const g = document.querySelector(".mirror-glass").getBoundingClientRect();
  const inGlass = r => r.top >= g.top - 0.5 && r.bottom <= g.bottom + 0.5 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5;
  const box = e => e.getBoundingClientRect();
  const back = box(backToStageBtn), again = box(tryAgainBtn), row = box(document.querySelector("#result .perf-buttons"));
  const notes = box(document.querySelector(".notes")), perf = box(document.querySelector(".perf")), s = box(perfScroll);
  const overlap = (a, b) => !(a.right <= b.left + 0.5 || a.left >= b.right - 0.5 || a.bottom <= b.top + 0.5 || a.top >= b.bottom - 0.5);
  const openPanel = [coachNotesBody, wordsPanel].find(p => !p.hidden);
  const stats = [...document.querySelectorAll(".perf-stats .stat")].map(box);
  const bar = box(document.querySelector(".perf-stats .score-bar-bg"));
  const fonts = [...document.querySelectorAll(".perf-summary *")].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .map(e => [e.className, parseFloat(getComputedStyle(e).fontSize)]);
  return {
    buttonsInMirror: inGlass(back) && inGlass(again) && back.height > 30 && again.height > 30,
    rightColumn: back.left >= notes.left - 0.5 && again.left >= notes.left - 0.5 && back.right <= notes.right + 0.5 && again.right <= notes.right + 0.5,
    underBoth: back.top >= Math.max(notes.bottom, perf.bottom) - 0.5 && again.top >= Math.max(notes.bottom, perf.bottom) - 0.5,
    outside: [["left column", perf], ["notes", notes], ["tab row", box(document.getElementById("backstageTabs"))], ["buttons", row]].filter(([, r]) => !inGlass(r)).map(([n, r]) => n + " by " + Math.round(Math.max(r.right - g.right, g.left - r.left, r.bottom - g.bottom, g.top - r.top)) + "px"),
    goldRight: Math.abs(back.right - notes.right) < 1.5,
    layout: back.top === again.top ? (again.right <= back.left ? "side by side, gold on the right" : "side by side, WRONG order") : (again.top >= back.bottom ? "wrapped, gold first, Try under it" : "wrapped, WRONG order"),
    buttonsOverlap: overlap(back, again),
    panelAbove: openPanel ? box(openPanel).bottom <= row.top + 0.5 : false,
    noteOverButtons: overlap(notes, back) || overlap(notes, again),
    perfInMirror: inGlass(perf) && inGlass(s), notesInMirror: inGlass(notes),
    oneRow: stats.length === 3 && stats.every(r => Math.abs(r.top - stats[0].top) < 1),
    bar: { w: Math.round(bar.width), h: bar.height, inView: bar.top >= s.top - 0.5 && bar.bottom <= s.bottom - (perfScroll.classList.contains("is-scrollable") ? 40 : 0) },
    minFont: Math.min(...fonts.map(f => f[1])), smallest: fonts.sort((a, b) => a[1] - b[1])[0],
    scrolls: perfScroll.classList.contains("is-scrollable"),
    sideways: document.documentElement.scrollWidth - innerWidth,
    hint: !perfHint.hidden ? perfHint.textContent : null
  };
})()`;
const REVIEW_SPOT = `(() => { const s = perfScroll.getBoundingClientRect(), c = document.querySelector("#perfReview .review"); const r = c.getBoundingClientRect(), pin = c.querySelector(".review-pin").getBoundingClientRect();
  const rows = [...c.querySelectorAll(".review-row")]; const last = rows[rows.length - 1].getBoundingClientRect();
  const fade = perfScroll.classList.contains("is-scrollable") ? 40 : 0;
  return { pinIn: pin.top >= s.top - 0.5, top: r.top >= s.top - 0.5, lastAbove: last.bottom <= s.bottom - fade + 0.5, all: r.top >= s.top - 0.5 && r.bottom <= s.bottom - fade + 4, sides: r.left >= s.left && r.right <= s.right }; })()`;

if (!only || only === "long") {
  console.log("\n== long result (laptop and the narrow sizes)");
  const SIZES = [[1366, 641, 1, "1366x641"], [1093, 526, 1.25, "1366x657 at 125%"], [1280, 800, 1, "1280x800"], [1920, 1080, 1, "1920x1080"],
    [1024, 768, 1, "1024x768"]];          // 683x768 and 768x1024 now use the one-column Backstage (test-narrow)
  for (const [w, h, dpr, tag] of SIZES) {
    const b = await open({ width: w, height: h, dpr });
    await b.show(LONG);
    let m = await b.evaluate(MEASURE);
    await shot(b, `layout-long-${w}x${h}`);
    console.log(`      ${tag}: buttons ${m.layout}; left column ${m.scrolls ? "scrolls" : "fits"}; bar ${m.bar.w}px; smallest text ${m.minFont}px`);
    const narrow = w < 900;
    console.log(`      ${tag}: outside the mirror: ${m.outside.length ? m.outside.join(", ") : "nothing"}`);
    check(`${tag}: both buttons fully inside the mirror, ${narrow ? "along the bottom under both columns" : "in the right column"}, not overlapping`, m.buttonsInMirror && (narrow ? m.underBoth : m.rightColumn) && !m.buttonsOverlap && !m.noteOverButtons, JSON.stringify(m).slice(0, 200));
    check(`${tag}: gold "Back to the stage" right-aligned, "Try this topic again" before it or wrapped under it`, m.goldRight && !/WRONG/.test(m.layout), m.layout);
    check(`${tag}: the notes panel ends above the buttons`, m.panelAbove);
    await b.mouse("#tabWords");
    check(`${tag}: the words panel ends above the buttons`, (await b.evaluate(MEASURE)).panelAbove);
    await b.mouse("#tabNotes");
    if (w === 683) {
      // Known since Stage 4: the notes column is about 120px wide here, so the tab row and "Scroll for all notes"
      // stick out (39px of sideways scroll on the previous commit). This change must not make it worse.
      console.log(`      ${tag}: sideways scroll ${m.sideways}px (39px on the previous commit)`);
      check(`${tag}: left column and notes inside the mirror, sideways scroll no worse than before`, m.perfInMirror && m.notesInMirror && m.sideways <= 39, JSON.stringify({ perf: m.perfInMirror, notes: m.notesInMirror, sideways: m.sideways }));
    } else {
      check(`${tag}: left column and notes inside the mirror, no sideways scroll`, m.perfInMirror && m.notesInMirror && m.sideways <= 0, JSON.stringify({ perf: m.perfInMirror, notes: m.notesInMirror, sideways: m.sideways }));
    }
    if (narrow) console.log(`      ${tag}: clarity bar ${m.bar.inView ? "visible above the fade" : "at or under the fade at first (reachable by scrolling)"}`);
    check(`${tag}: numbers in one row of three, clarity bar ${narrow ? "there" : "visible"}`, m.oneRow && m.bar.w >= 30 && m.bar.h >= 4 && (narrow || m.bar.inView), JSON.stringify(m.bar));
    check(`${tag}: all text in the summary at least 11px`, m.minFont >= 11, JSON.stringify(m.smallest));
    // The full review is reachable
    if (m.scrolls) {
      check(`${tag}: "Scroll for the review" while it is below the fold`, m.hint === "Scroll for the review");
      await b.evaluate(`perfScroll.scrollTop = perfReview.offsetTop - perfScroll.offsetTop - 10`);
      await sleep(200);
      const top = await b.evaluate(REVIEW_SPOT);
      check(`${tag}: scrolled to the review: pin and masthead visible`, top.pinIn && top.top && top.sides);
      await b.evaluate(`perfScroll.scrollTop = 1e9`);
      await sleep(200);
      const end = await b.evaluate(REVIEW_SPOT);
      check(`${tag}: at the bottom: the last row above the fade, hint gone`, end.lastAbove && (await b.evaluate("perfHint.hidden")));
    } else {
      check(`${tag}: the whole review visible without scrolling`, (await b.evaluate(REVIEW_SPOT)).all);
    }
    if (w === 1366 && dpr === 1) {
      contrastOk(await b.evaluate(COLOR_CONTRAST([".perf-stats .stat-num", ".perf-stats .stat-label .long-label", ".perf-stats .stat-sub", ".perf-stats .stat-hint", ".perf-elapsed", ".perf-limit", ".perf-topic"])), `${tag} numbers and time`);
      // Keyboard order: left column, tabs, panel, then the two buttons
      await b.evaluate("perfScroll.scrollTop = 0; perfScroll.focus()");
      const order = [];
      for (let i = 0; i < 4; i++) {
        await b.key("Tab");
        order.push(await b.evaluate("document.activeElement.id || document.activeElement.className"));
      }
      check(`${tag}: keyboard order: left column, tabs, panel, Back to the stage, Try this topic again`, JSON.stringify(order) === JSON.stringify(["tabNotes", "coachNotesBody", "backToStageBtn", "tryAgainBtn"]), order.join(" > "));
    }
    await done(b);
  }
}

if (!only || only === "normal") {
  console.log("\n== normal result fits without scrolling");
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    const b = await open({ width: w, height: h });
    await b.show(NORMAL);
    const m = await b.evaluate(MEASURE);
    const r = await b.evaluate(REVIEW_SPOT);
    check(`${w}x${h}: no scrolling, the whole review visible, buttons visible`, !m.scrolls && r.all && m.buttonsInMirror && m.hint === null, JSON.stringify(r));
    await shot(b, `layout-normal-${w}x${h}`);
    await done(b);
  }
}

if (!only || only === "same") {
  console.log("\n== unchanged: phones and the playbill (pixels vs the previous commit)");
  async function pic(url, w, h, how) {
    const b = await launch({ width: w, height: h, flags: [], mobile: w <= 600 });
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await b.goto(url, []);
    if (how === "playbill") {
      await b.evaluate(`(() => { localStorage.setItem("speakreview.wall.v1", JSON.stringify([{ id: "fixed1", savedAt: "2026-10-01T10:00:00.000Z", ...${JSON.stringify(LONG)} }])); loadWall(); goToView("wall"); })()`);
      for (let i = 0; i < 80 && await b.evaluate("document.body.classList.contains('curtains-closed') || appRoot.inert"); i++) await sleep(100);
      await b.evaluate(`wallButtons.get("fixed1").click()`);
      await sleep(600);
    } else {
      await b.evaluate(`displayResult(${JSON.stringify(how)})`);
      for (let i = 0; i < 80 && await b.evaluate("document.body.classList.contains('curtains-closed') || appRoot.inert"); i++) await sleep(100);
      await sleep(2200);
    }
    const data = (await b.send("Page.captureScreenshot", { format: "png" })).data;
    await b.close();
    return data;
  }
  async function diff(a, c, w, h) {
    const d = await launch({ width: w, height: h });
    await d.send("Page.navigate", { url: "about:blank" });
    await sleep(200);
    const r = await d.evaluate(`(async () => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
      const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(c)})]);
      const px = img => { const k = document.createElement("canvas"); k.width = img.width; k.height = img.height; const x = k.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
      const P = px(A), Q = px(B); let n = 0, first = null;
      for (let i = 0; i < P.length; i += 4) if (P[i] !== Q[i] || P[i + 1] !== Q[i + 1] || P[i + 2] !== Q[i + 2]) { n++; if (!first) first = [(i / 4) % A.width, Math.floor(i / 4 / A.width)]; }
      return { n, first };
    })()`);
    await d.close();
    return r;
  }
  for (const [w, h, how, name] of [[390, 780, LONG, "phone, long result"], [390, 780, NORMAL, "phone, normal result"], [360, 740, LONG, "phone, long result"], [1280, 800, "playbill", "playbill"], [390, 780, "playbill", "phone playbill"]]) {
    const d = await diff(await pic(BASE, w, h, how), await pic(LIVE, w, h, how), w, h);
    check(`${w}x${h} ${name}: pixel-identical to the previous commit`, d.n === 0, `${d.n} px differ, first ${JSON.stringify(d.first)}`);
  }
}

finish();
