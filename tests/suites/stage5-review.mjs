// Stage 5: words used as filler and The Nightly Review
import { sleep, LIVE, only, check, finish, longWords, RESULT, open, done, shot, COLOR_CONTRAST, contrastOk } from "../lib/page.mjs";
// ================================================================ Stage 5: judged fillers + The Nightly Review
const REVIEW = {
  structure: { level: 3, reason: "Clear position up front, story in the middle." },
  clarity: { level: 2, reason: "Easy to follow, but the point repeated twice." },
  on_topic: { level: 4, reason: "Every sentence answered the question." },
  word_choice: { level: 1, reason: "\"Basically\" softened your strongest lines." }
};
// Words with like/so/actually/basically/you know, an um, a malformed item in the middle (to check remapping)
const JW = [
  ["So", 0, 20, 99], ["um,", 30, 60, 30], ["I", 70, 80, 98], ["think,", 85, 120, 97], ["like,", 125, 150, 95],
  ["BAD"],                                                               // raw index 5, dropped by cleaning
  ["failure", 160, 210, 45], ["teaches.", 215, 260, 96], ["You", 270, 290, 95], ["know,", 295, 320, 95],
  ["it", 330, 340, 99], ["actually", 345, 380, 95], ["basically", 385, 430, 40], ["works.", 435, 470, 99],
  ["you", 480, 500, 95], ["know", 510, 530, 95]
];
// raw indexes: 0 So, 4 like, 8 You, 9 know, 11 actually, 12 basically (also unclear: dotted wins), 1 um (stays um),
// 5 BAD (dropped), out of range 99, negative, fraction, duplicate, string. 14 "you" alone (15 "know" not flagged).
const FLAGS = [0, 4, 8, 9, 11, 12, 1, 5, 99, -1, 2.5, 4, "7", 14];
const BASE_RESULT = { ...RESULT, words: JW, filler_flags: FLAGS, fillers_judged: true, review: REVIEW };

const REVIEW_READ = scope => `(() => {
  const r = document.querySelector(${JSON.stringify(scope)} + " .review");
  if (!r) return null;
  const clone = r.cloneNode(true); clone.querySelectorAll(".visually-hidden").forEach(e => e.remove());
  return {
    title: r.querySelector(".review-title").textContent, titleShown: getComputedStyle(r.querySelector(".review-title")).textTransform,
    sub: r.querySelector(".review-sub").textContent,
    rows: [...r.querySelectorAll(".review-row")].map(row => [row.querySelector(".review-name").textContent, row.querySelector(".review-level").firstChild.textContent,
      row.querySelectorAll(".review-seg.is-on").length, row.querySelector(".review-reason").textContent, row.querySelector(".review-level .visually-hidden").textContent,
      row.querySelector(".review-meter").getAttribute("aria-hidden")]),
    transform: getComputedStyle(r).transform, pin: !!r.querySelector(".review-pin[aria-hidden='true']"),
    img: r.querySelectorAll("img").length, label: r.getAttribute("aria-label")
  };
})()`;
const WORDS_READ = scope => `(() => {
  const t = document.querySelector(${JSON.stringify(scope)} + " .words-text");
  return {
    maybe: [...t.querySelectorAll(".w-maybe")].map(e => e.firstChild.textContent),
    maybeSr: [...t.querySelectorAll(".w-maybe .visually-hidden")].map(e => e.textContent),
    fillers: [...t.querySelectorAll(".w-filler")].map(e => e.firstChild.textContent),
    unclear: [...t.querySelectorAll(".w-unclear")].map(e => e.firstChild.textContent),
    legend: [...document.querySelectorAll(${JSON.stringify(scope)} + " .words-key .long-label")].map(e => e.textContent),
    note: document.querySelector(${JSON.stringify(scope)} + " > .words-note")?.textContent ?? null,
    info: [...document.querySelectorAll(${JSON.stringify(scope)} + " .words-info li")].map(e => e.textContent),
    style: (() => { const e = t.querySelector(".w-maybe"); if (!e) return null; const cs = getComputedStyle(e); return [cs.borderBottomStyle, cs.borderBottomWidth, cs.borderBottomColor, cs.backgroundColor]; })()
  };
})()`;

if (!only || only === "review") {
  console.log("\n== The Nightly Review (laptop)");
  const b = await open();
  await b.show(BASE_RESULT);
  const r = await b.evaluate(REVIEW_READ("#perfReview"));
  check("left column: clipping under the numbers", r && (await b.evaluate(`!perfReview.hidden && perfSummary.nextElementSibling === perfReview && perfReview.parentElement === perfScroll && perfScroll.nextElementSibling === perfHint && document.querySelector(".notes").parentElement === backstageScroll && backstageScroll.nextElementSibling.classList.contains("perf-buttons")`)));
  check("masthead THE NIGHTLY REVIEW and subtitle", r.title === "The Nightly Review" && r.titleShown === "uppercase" && r.sub === "Your coach's rating. A rough guide, not a grade." && r.label === "The Nightly Review");
  const want = [["Structure", "Strong", 3, REVIEW.structure.reason], ["Clarity of message", "Solid", 2, REVIEW.clarity.reason], ["Staying on topic", "Outstanding", 4, REVIEW.on_topic.reason], ["Word choice", "Developing", 1, REVIEW.word_choice.reason]];
  check("four rows: names, level words, lit segments, reasons", JSON.stringify(r.rows.map(x => x.slice(0, 4))) === JSON.stringify(want), JSON.stringify(r.rows.map(x => x.slice(0, 3))));
  check("meter decorative, screen readers hear (n of 4)", r.rows.every(x => x[5] === "true") && JSON.stringify(r.rows.map(x => x[4])) === JSON.stringify([" (3 of 4)", " (2 of 4)", " (4 of 4)", " (1 of 4)"]));
  const deg = m => { const v = m.match(/matrix\(([^,]+), ([^,]+)/); return v ? +(Math.atan2(+v[2], +v[1]) * 180 / Math.PI).toFixed(2) : 0; };
  check("tilted about -1 degree, with a decorative brass pin", Math.abs(deg(r.transform) + 1.2) < 0.05 && r.pin, String(deg(r.transform)));
  check("no Review tab on laptop (and arrows skip it)", await b.evaluate(`tabReview.getClientRects().length === 0`));
  await b.evaluate("tabNotes.focus()");
  await b.key("ArrowRight"); await b.key("ArrowRight");
  check("laptop: ArrowRight twice wraps Notes -> Your words -> Notes", (await b.evaluate("document.activeElement.id")) === "tabNotes");
  await b.key("End");
  check("laptop: End goes to Your words (Review is not reachable)", (await b.evaluate("document.activeElement.id")) === "tabWords" && (await b.evaluate("reviewPanel.hidden")));
  await shot(b, "review-1280");
  contrastOk(await b.evaluate(COLOR_CONTRAST(["#perfReview .review-title", "#perfReview .review-sub", "#perfReview .review-name", "#perfReview .review-level", "#perfReview .review-reason"]).replace("const background = e =>", "const background0 = e =>").replace("const out = [];", `const background = e => { const c = parse(getComputedStyle(document.querySelector("#perfReview .review")).backgroundImage.match(/rgb[^)]*\\)/g)[1]); return c; }; const out = [];`)), "clipping text (on its darker end, #EAD9B6)");
  // No topic: Staying on point
  await b.show({ ...BASE_RESULT, topic: undefined, topic_type: undefined });
  check("no topic: the row reads Staying on point", (await b.evaluate(REVIEW_READ("#perfReview"))).rows[2][0] === "Staying on point");
  // <img onerror> in a reason
  await b.show({ ...BASE_RESULT, review: { ...REVIEW, clarity: { level: 2, reason: "<img src=x onerror=window.__xss=1> fine" } } });
  const x = await b.evaluate(REVIEW_READ("#perfReview"));
  check("a reason with <img onerror> shows as text, nothing runs", x.img === 0 && x.rows[1][3] === "<img src=x onerror=window.__xss=1> fine" && !(await b.evaluate("window.__xss === 1")));
  // Malformed reviews: hidden completely
  const BAD = {
    "level 5": { ...REVIEW, structure: { level: 5, reason: "x" } },
    "level \"2\"": { ...REVIEW, clarity: { level: "2", reason: "x" } },
    "level 2.5": { ...REVIEW, clarity: { level: 2.5, reason: "x" } },
    "missing key": { structure: REVIEW.structure, clarity: REVIEW.clarity, on_topic: REVIEW.on_topic },
    "300-char reason": { ...REVIEW, on_topic: { level: 3, reason: "a".repeat(300) } },
    "empty reason": { ...REVIEW, word_choice: { level: 3, reason: "   " } },
    "not an object": "great",
    "a list": [1, 2, 3, 4],
    "missing": undefined
  };
  for (const [name, review] of Object.entries(BAD)) {
    await b.show({ ...BASE_RESULT, review });
    const hid = await b.evaluate(`perfReview.hidden && perfReview.children.length === 0 && reviewPanel.children.length === 0 && tabReview.hidden && !document.querySelector(".review")`);
    check(`review ${name}: hidden everywhere`, hid);
  }
  await b.show({ ...BASE_RESULT, review: { ...REVIEW, structure: { level: 3, reason: "b".repeat(160) } } });
  check("a 160-character reason is still fine", (await b.evaluate(`!perfReview.hidden`)));
  // Reduced motion: no tilt
  await done(b);
  const m = await open({ motion: "reduce" });
  await m.show(BASE_RESULT);
  check("reduced motion: the clipping is not tilted", (await m.evaluate(REVIEW_READ("#perfReview"))).transform === "none");
  await done(m);
}

if (!only || only === "fillers") {
  console.log("\n== judged fillers (dotted)");
  const b = await open();
  await b.show(BASE_RESULT);
  await b.mouse("#tabWords");
  let w = await b.evaluate(WORDS_READ("#wordsPanel"));
  check("dotted: So, like, You know (one mark), actually, basically, and a lone flagged you", JSON.stringify(w.maybe) === JSON.stringify(["So", "like,", "You know,", "actually", "basically", "you"]), JSON.stringify(w.maybe));
  check("a flagged um keeps its um mark; um/uh unchanged", JSON.stringify(w.fillers) === JSON.stringify(["um,"]));
  check("flags after the dropped word land on the right words (remapping)", w.maybe.includes("You know,") && !w.maybe.includes("failure") && !w.maybe.includes("teaches."));
  check("out of range, negative, fraction, string flags ignored", !w.maybe.includes("I") && !w.maybe.includes("think,") && !w.maybe.includes("it"));
  check("dotted wins over unclear (basically, 40)", !w.unclear.includes("basically") && JSON.stringify(w.unclear) === JSON.stringify(["failure"]));
  check("screen readers hear (used as filler)", w.maybeSr.length === 6 && w.maybeSr.every(t => t === " (used as filler)"));
  check("legend: Filler, Used as filler, Long pause, Unclear (with counts)", JSON.stringify(w.legend) === JSON.stringify(["Filler, 1", "Used as filler, 6", "Long pause, 0", "Unclear, 1"]), JSON.stringify(w.legend));
  // Backstage: no note under the words since the stage 4 update; the "i" card lists the marks instead
  check("the info card starts with the dotted words line (no note under the words)", w.note === null && w.info.length === 3 && w.info[0] === "Dotted words are marked only when used as filler.", JSON.stringify(w.info));
  check("dotted look: 2px dotted gold, no highlight", w.style[0] === "dotted" && w.style[1] === "2px" && w.style[2] === "rgb(217, 174, 82)" && w.style[3] === "rgba(0, 0, 0, 0)", JSON.stringify(w.style));
  check("you know counts once: 6 marks for 7 flagged words (know not flagged at the end stays plain)", (await b.evaluate(`[...wordsPanel.querySelectorAll(".words-text .w-maybe")].length`)) === 6 && !w.maybe.includes("know"));
  contrastOk(await b.evaluate(COLOR_CONTRAST(["#wordsPanel .w-maybe"])), "dotted words (dark)");
  await shot(b, "dotted-1280");
  // Not judged, or flags not a list: exactly as Stage 4
  for (const [name, extra] of [["no fillers_judged", { fillers_judged: undefined }], ["fillers_judged false", { fillers_judged: false }], ["flags not a list", { filler_flags: "0,4" }], ["flags missing", { filler_flags: undefined }]]) {
    await b.show({ ...BASE_RESULT, ...extra });
    await b.mouse("#tabWords");
    w = await b.evaluate(WORDS_READ("#wordsPanel"));
    check(`${name}: no dotted marks, Stage 4 legend, and no dotted line in the info card`, w.maybe.length === 0 && JSON.stringify(w.legend) === JSON.stringify(["Filler, 1", "Long pause, 0", "Unclear, 2"]) && w.note === null && w.info.length === 2 && !w.info.some(t => t.startsWith("Dotted")), JSON.stringify(w.info));
  }
  // Judged with no flags: the legend says 0
  await b.show({ ...BASE_RESULT, filler_flags: [] });
  await b.mouse("#tabWords");
  w = await b.evaluate(WORDS_READ("#wordsPanel"));
  check("judged, nothing flagged: Used as filler, 0", w.legend[1] === "Used as filler, 0" && w.maybe.length === 0);
  // A long pause splits "you know"
  await b.show({ ...BASE_RESULT, words: [["you", 0, 20, 95], ["know", 400, 420, 95]], filler_flags: [0, 1] });
  await b.mouse("#tabWords");
  w = await b.evaluate(WORDS_READ("#wordsPanel"));
  check("a long pause between you and know keeps them as two marks", JSON.stringify(w.maybe) === JSON.stringify(["you", "know"]));
  await done(b);
}

if (!only || only === "phone") {
  console.log("\n== phone: Notes | Your words | Review");
  for (const [w, h] of [[390, 780], [360, 740]]) {
    const b = await open({ width: w, height: h });
    await b.show(BASE_RESULT);
    const t = await b.evaluate(`({ tabs: [...document.querySelectorAll("#backstageTabs .feedback-tab")].filter(t => t.getClientRects().length).map(t => { const spans = [...t.children].filter(c => getComputedStyle(c).position !== "absolute" && getComputedStyle(c).display !== "none"); return (spans.length ? spans.map(c => c.textContent).join("") : t.textContent).trim(); }),
      oneLine: [...document.querySelectorAll("#backstageTabs .feedback-tab")].every(t => !t.getClientRects().length || (t.getBoundingClientRect().height <= 36 && t.scrollWidth <= t.clientWidth)),
      left: getComputedStyle(perfReview).display })`);
    check(`${w}x${h}: three tabs Notes | Your words | Review, each on one line`, JSON.stringify(t.tabs) === '["Notes","Your words","Review"]' && t.oneLine, JSON.stringify(t));
    check(`${w}x${h}: no clipping in the column on phones`, t.left === "none");
    await b.evaluate("tabNotes.focus()");
    await b.key("End");
    check(`${w}x${h}: End selects Review, its panel shows the clipping`, (await b.evaluate(`document.activeElement.id === "tabReview" && !reviewPanel.hidden && coachNotesBody.hidden && wordsPanel.hidden && !!reviewPanel.querySelector(".review")`)));
    const r = await b.evaluate(REVIEW_READ("#reviewPanel"));
    check(`${w}x${h}: phone clipping tilted about -0.8 deg`, /matrix/.test(r.transform) && r.rows.length === 4);
    const inside = await b.evaluate(`(() => { const g = document.querySelector(".mirror-glass").getBoundingClientRect(), p = backstageScroll.getBoundingClientRect(); return p.top >= g.top - 0.5 && p.bottom <= g.bottom + 0.5 && document.documentElement.scrollWidth <= innerWidth; })()`);
    check(`${w}x${h}: Review (in the shared scrolling area) inside the mirror, no sideways scroll`, inside);
    await b.evaluate(`backstageScroll.scrollTop = 1e9`);
    await sleep(150);
    check(`${w}x${h}: the whole clipping is reachable above the fade`, await b.evaluate(`(() => { const p = backstageScroll.getBoundingClientRect(), last = reviewPanel.querySelector(".review").getBoundingClientRect(); return last.bottom <= p.bottom - 26 + 12; })()`));
    await shot(b, `review-${w}x${h}`);
    contrastOk(await b.evaluate(COLOR_CONTRAST(["#backstageTabs .feedback-tab"])), `${w}x${h} tabs`);
    await b.key("ArrowRight");
    check(`${w}x${h}: ArrowRight from Review wraps to Notes`, (await b.evaluate("document.activeElement.id")) === "tabNotes");
    // Without a review: two tabs, and arrows skip the hidden one
    await b.show({ ...BASE_RESULT, review: undefined });
    check(`${w}x${h}: without a review, the Review tab is gone`, await b.evaluate(`tabReview.hidden && tabReview.getClientRects().length === 0`));
    await b.evaluate("tabWords.focus()");
    await b.key("ArrowRight");
    check(`${w}x${h}: ArrowRight from Your words wraps to Notes (skips the hidden tab)`, (await b.evaluate("document.activeElement.id")) === "tabNotes");
    await done(b);
  }
  // Phone to laptop while Review is open: back to Coach's notes
  const s = await open({ width: 390, height: 780 });
  await s.show(BASE_RESULT);
  await s.mouse("#tabReview");
  await s.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  check("phone to laptop with Review open: back to Coach's notes", await s.evaluate(`backstageTabs.selected() === "tabNotes" && !coachNotesBody.hidden && reviewPanel.hidden && !perfReview.hidden`));
  await done(s);
}

if (!only || only === "wall") {
  console.log("\n== Wall of Fame and the playbill");
  const b = await open();
  await b.evaluate(`(async () => { for (let i = 1; i <= 32; i++) { saveToWall("r" + i, ${JSON.stringify(BASE_RESULT)}); await new Promise(r => setTimeout(r, 4)); } saveToWall("r33", ${JSON.stringify({ ...BASE_RESULT, review: { ...REVIEW, structure: { level: 9, reason: "x" } } })}); })()`);
  const st = await b.evaluate(`(() => { const list = JSON.parse(localStorage.getItem("speakreview.wall.v1"));
    return { n: list.length, reviews: list.filter(e => e.review).length, words: list.filter(e => e.words).length, flagsWithWords: list.every(e => (e.words === null) === (e.filler_flags === null) && (e.words === null) === (e.fillers_judged === null)),
      first: list.find(e => e.id === "r32"), bad: list.find(e => e.id === "r33") }; })()`);
  check("review saved with every entry (a bad one dropped, entry kept)", st.n === 33 && st.reviews === 32 && st.bad && st.bad.review === null, `${st.reviews} of ${st.n}`);
  check("flags and judged saved only together with words (newest 30)", st.words === 30 && st.flagsWithWords);
  check("saved flags are positions in the clean words", JSON.stringify(st.first.filler_flags) === JSON.stringify([0, 1, 4, 7, 8, 10, 11, 13]) && st.first.fillers_judged === true, JSON.stringify(st.first.filler_flags));
  await b.evaluate(`goToView("wall")`);
  await b.settled();
  await b.evaluate(`wallButtons.get("r32").click()`);
  await sleep(300);
  check("playbill: three tabs, opens on Coach's notes", await b.evaluate(`!pbTabReview.hidden && pbTabNotes.getAttribute("aria-selected") === "true" && pbReview.hidden`));
  await b.mouse("#pbTabWords");
  const pw = await b.evaluate(WORDS_READ("#pbWords"));
  check("playbill Your words: the same dotted marks", JSON.stringify(pw.maybe) === JSON.stringify(["So", "like,", "You know,", "actually", "basically", "you"]) && pw.legend[1] === "Used as filler, 6");
  contrastOk(await b.evaluate(COLOR_CONTRAST(["#pbWords .w-maybe"])), "dotted words (paper)");
  await b.evaluate("pbTabWords.focus()");
  await b.key("ArrowRight");
  const pr = await b.evaluate(REVIEW_READ("#pbReview"));
  check("playbill Review tab (arrow key): the clipping with all four rows", (await b.evaluate(`document.activeElement.id === "pbTabReview" && !pbReview.hidden`)) && pr.rows.length === 4 && pr.rows[0][1] === "Strong");
  await shot(b, "playbill-review-1280");
  contrastOk(await b.evaluate(COLOR_CONTRAST(["#pbTabs .feedback-tab"])), "playbill tabs");
  await b.evaluate("closeDialog()");
  await b.evaluate(`wallButtons.get("r33").click()`);
  await sleep(300);
  check("playbill without a review: no Review tab, arrows skip it", (await b.evaluate(`pbTabReview.hidden`)) && await (async () => { await b.evaluate("pbTabWords.focus()"); await b.key("ArrowRight"); return b.evaluate(`document.activeElement.id === "pbTabNotes"`); })());
  await b.evaluate("closeDialog()");
  await b.evaluate(`wallButtons.get("r1").click()`);
  await sleep(300);
  await b.mouse("#pbTabWords");
  check("an old playbill (past 30): words gone, review kept", (await b.evaluate(`pbWords.textContent === "The word-by-word view isn't available for this performance." && !pbTabReview.hidden`)));
  await b.evaluate("closeDialog()");
  // Tampered storage
  await b.evaluate(`(() => { const list = JSON.parse(localStorage.getItem("speakreview.wall.v1"));
    list[0].review = { structure: { level: 3, reason: "<b>x</b>" } }; list[1].filler_flags = [999, -3, "1", 0]; list[2].fillers_judged = "yes";
    list[3].review = { ...list[3].review, clarity: { level: 2, reason: 42 } };
    localStorage.setItem("speakreview.wall.v1", JSON.stringify(list)); loadWall(); })()`);
  const tm = await b.evaluate(`({ n: wallEntries.length, r0: wallEntries[0].review, f1: wallEntries[1].filler_flags, j2: wallEntries[2].fillers_judged, f2: wallEntries[2].filler_flags, r3: wallEntries[3].review })`);
  check("tampered storage: bad review dropped, bad flags dropped, entries kept", tm.n === 33 && tm.r0 === null && JSON.stringify(tm.f1) === "[0]" && tm.j2 === null && tm.f2 === null && tm.r3 === null, JSON.stringify(tm).slice(0, 160));
  await done(b);
}

if (!only || only === "hint") {
  console.log("\n== the \"Scroll for all notes\" hint");
  const b = await open();
  const hint = () => b.evaluate(`!document.getElementById("notesHint").hidden && getComputedStyle(document.getElementById("notesHint")).display !== "none"`);
  await b.show({ ...RESULT, ai_feedback: "Strengths:\n1. Clear.", words: [["Hello", 0, 30, 95], ["there.", 35, 70, 95]] });
  check("short Coach's notes: no hint", !(await hint()));
  await b.mouse("#tabWords");
  check("short Your words: no hint", !(await hint()));
  await b.mouse("#tabNotes");
  const longNotes = Array.from({ length: 40 }, (_, i) => `${i + 1}. A long point number ${i + 1} about the speech.`).join("\n");
  await b.show({ ...RESULT, ai_feedback: "Strengths:\n" + longNotes, words: longWords() });
  check("long Coach's notes: the hint shows right after Backstage opens", await hint());
  await b.mouse("#tabWords");
  check("1,500 words: the hint shows", await hint());
  await b.show({ ...RESULT, ai_feedback: "Strengths:\n" + longNotes, words: [["Hi.", 0, 30, 95]] });
  await b.mouse("#tabWords");
  check("long notes, short words: hint follows the open tab (hidden on Your words)", !(await hint()));
  await b.mouse("#tabNotes");
  check("... and back on Coach's notes it shows", await hint());
  // After a resize: a tall window where the notes fit
  await b.show({ ...RESULT, ai_feedback: "Strengths:\n" + Array.from({ length: 9 }, (_, i) => `${i + 1}. Point ${i + 1}.`).join("\n") });
  const before = await hint();
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1400, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const after = await hint();
  const fits = await b.evaluate(`coachNotesBody.scrollHeight <= coachNotesBody.clientHeight + 1`);
  check("after a resize the hint matches whether the notes scroll", after === !fits, `before ${before}, after ${after}, fits ${fits}`);
  await b.show({ too_short: true, wpm: 0, ai_feedback: "Short.", words: longWords() });
  check("too short: no hint on Coach's notes", !(await hint()));
  await done(b);
}

if (!only || only === "layout") {
  console.log("\n== layout");
  for (const [w, h] of [[1366, 641], [1280, 800], [1920, 1080], [390, 780], [360, 740]]) {
    const tag = `${w}x${h}`;
    const b = await open({ width: w, height: h });
    await b.show({ ...BASE_RESULT, topic: "How do our habits shape who we become, and what small daily choices end up mattering most?", cut_off: true, time_limit_seconds: 300, speaking_seconds: 600 });
    const tabs = w <= 600 ? ["tabNotes", "tabWords", "tabReview"] : ["tabNotes", "tabWords"];
    for (const tab of tabs) {
      await b.mouse(`#${tab}`);
      await sleep(200);
      const m = await b.evaluate(`(() => {
        const g = document.querySelector(".mirror-glass").getBoundingClientRect();
        const inside = r => r.top >= g.top - 0.5 && r.bottom <= g.bottom + 0.5 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5;
        // (below 990px the panel scrolls with the summary and tabs, so the shared area is what must fit)
        const panel = (backstageOneColumn.matches ? backstageScroll : { tabNotes: coachNotesBody, tabWords: wordsPanel, tabReview: reviewPanel }[${JSON.stringify(tab)}]).getBoundingClientRect();
        const perf = document.querySelector(".perf");
        return { panel: inside(panel) && panel.height >= 100, perf: innerWidth > 600 ? inside(perf.getBoundingClientRect()) : true, sideways: document.documentElement.scrollWidth - innerWidth,
          scrolls: perfScroll.classList.contains("is-scrollable"), buttons: [backToStageBtn, tryAgainBtn].every(e => inside(e.getBoundingClientRect())) };
      })()`);
      check(`${tag} ${tab}: panel and left column inside the mirror, no sideways scroll`, m.panel && m.perf && m.buttons && m.sideways <= 0, JSON.stringify(m));
      await shot(b, `f5-${tag}-${tab}`);
    }
    if (w > 600) {
      // The left column with the clipping: scroll to the bottom, the buttons fully visible
      const lc = await b.evaluate(`(() => { const perf = document.querySelector(".perf"); perfScroll.scrollTop = 1e9; return new Promise(r => setTimeout(() => { const p = perf.getBoundingClientRect(); const ok = [backToStageBtn, tryAgainBtn].every(e => { const x = e.getBoundingClientRect(); return x.top >= p.top - 0.5 && x.bottom <= p.bottom + 0.5; });
        const c = perfReview.getBoundingClientRect(); r({ ok, scrolls: perfScroll.classList.contains("is-scrollable"), more: perfScroll.classList.contains("has-more"), clipLeft: c.left >= p.left - 0.5, clipRight: c.right <= p.right + 0.5 }); }, 200)); })()`);
      check(`${tag}: left column with the clipping: buttons reachable at the bottom, no fade on them`, lc.ok && !lc.more, JSON.stringify(lc));
      check(`${tag}: the tilted clipping fits the column width`, lc.clipLeft && lc.clipRight);
      await shot(b, `f5-${tag}-left-bottom`);
    }
    await done(b);
  }
  const t = await open();
  const src = (await (await fetch(LIVE + "js/app.js")).text()) + (await (await fetch(LIVE)).text()) + (await (await fetch(LIVE + "css/styles.css")).text());
  check("no em dashes", !src.includes("—"));
  check("no inline style attributes or handlers in index.html", !/\sstyle=|\son[a-z]+=/i.test(await (await fetch(LIVE)).text()));
  check("review and words never set with innerHTML", !/(perfReview|reviewPanel|pbReview|wordsPanel|pbWords)\.innerHTML/.test(src));
  await done(t);
}

finish();
