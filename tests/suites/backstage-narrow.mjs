// One-column Backstage below 990px
import { launch, sleep, LIVE, BASE, only, check, finish, longWords, open, done, shot } from "../lib/page.mjs";
// ================================================================ One-column Backstage on narrow windows
const BREAK = 990;                              // two columns from here up
const REVIEW = {
  structure: { level: 3, reason: "Clear position up front, story in the middle." },
  clarity: { level: 2, reason: "Easy to follow, but the point repeated twice." },
  on_topic: { level: 4, reason: "Every sentence answered the question." },
  word_choice: { level: 1, reason: "\"Basically\" softened your strongest lines." }
};
const LONG = { wpm: 132, filler_word_total: 14, filler_word_breakdown: { um: 4, uh: 3, like: 2, "you know": 2, so: 1, actually: 1, basically: 1 }, avg_confidence: 0.84,
  ai_feedback: "Strengths:\n" + Array.from({ length: 12 }, (_, i) => `${i + 1}. A strength about the speech, number ${i + 1}.`).join("\n"),
  speaking_seconds: 600, time_limit_seconds: 300, cut_off: true, source: "recording",
  topic: "How do our habits shape who we become, and what small daily choices end up mattering most over a whole lifetime?", topic_type: "explain", review: REVIEW,
  words: longWords(400) };

const MEASURE = `(() => {
  const g = document.querySelector(".mirror-glass").getBoundingClientRect();
  const box = e => e.getBoundingClientRect();
  const inGlass = r => r.top >= g.top - 0.5 && r.bottom <= g.bottom + 0.5 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5;
  const overlap = (a, b) => !(a.right <= b.left + 0.5 || a.left >= b.right - 0.5 || a.bottom <= b.top + 0.5 || a.top >= b.bottom - 0.5);
  const tabs = [...document.querySelectorAll("#backstageTabs .feedback-tab")].filter(t => t.getClientRects().length);
  const hint = document.getElementById("notesHint");
  const parts = [["summary", perfSummary], ["tab row", document.getElementById("backstageTabs")], ["notes", document.querySelector(".notes")],
    ["buttons", document.querySelector("#result .perf-buttons")], ...(hint.getClientRects().length && getComputedStyle(hint).display !== "none" ? [["hint", hint]] : [])];
  const back = box(backToStageBtn), again = box(tryAgainBtn);
  const panel = [coachNotesBody, wordsPanel, reviewPanel].find(p => !p.hidden);
  return {
    oneColumn: getComputedStyle(document.querySelector(".perf")).display === "contents",
    sideways: document.documentElement.scrollWidth - innerWidth,
    outside: parts.filter(([, e]) => !inGlass(box(e))).map(([n]) => n),
    tabs: tabs.map(t => { const spans = [...t.children].filter(c => getComputedStyle(c).position !== "absolute" && getComputedStyle(c).display !== "none"); return (spans.length ? spans.map(c => c.textContent).join("") : t.textContent).trim(); }),
    tabsOk: tabs.every(t => { const r = box(t); return inGlass(r) && r.height >= 30 && t.scrollWidth <= t.clientWidth + 1; }),
    buttonsOk: inGlass(back) && inGlass(again) && back.height >= 30 && again.height >= 30 && !overlap(back, again) && back.width >= backToStageBtn.scrollWidth - 1,
    panelAboveButtons: panel ? box(panel).bottom <= Math.min(back.top, again.top) + 0.5 : false,
    panelInGlass: panel ? inGlass(box(panel)) && box(panel).height >= 100 : false
  };
})()`;

if (!only || only === "sizes") {
  console.log("\n== narrow sizes (long result)");
  for (const [w, h] of [[683, 768], [768, 1024], [900, 700], [1024, 768]]) {
    const tag = `${w}x${h}`;
    const one = w < BREAK;
    const b = await open({ width: w, height: h });
    await b.show(LONG);
    let m = await b.evaluate(MEASURE);
    await shot(b, `narrow-${w}x${h}-notes`);
    console.log(`      ${tag}: ${m.oneColumn ? "one column" : "two columns"}; tabs ${JSON.stringify(m.tabs)}; outside the mirror: ${m.outside.length ? m.outside.join(", ") : "nothing"}; sideways ${m.sideways}px`);
    check(`${tag}: ${one ? "one column (phone layout)" : "two columns"}`, m.oneColumn === one);
    check(`${tag}: no sideways scroll, nothing outside the mirror`, m.sideways <= 0 && m.outside.length === 0, JSON.stringify(m.outside));
    check(`${tag}: all tabs fully visible, not cut off`, m.tabsOk && JSON.stringify(m.tabs) === (one ? '["Notes","Your words","Review"]' : '["Coach\'s notes","Your words"]'), JSON.stringify(m.tabs));
    check(`${tag}: both buttons fully visible, not overlapping, panel ends above them`, m.buttonsOk && m.panelAboveButtons);
    check(`${tag}: Coach's notes panel inside the mirror (scrolls when longer than it)`, m.panelInGlass);
    // Keyboard on the tabs
    await b.evaluate("tabNotes.focus()");
    await b.key("ArrowRight");
    check(`${tag}: ArrowRight to Your words, which scroll inside their panel`, (await b.evaluate(`document.activeElement.id === "tabWords" && !wordsPanel.hidden && (() => { const s = wordsPanel.querySelector(".words-body"); return s.scrollHeight > s.clientHeight; })()`)) && (await b.evaluate(MEASURE)).panelInGlass);
    await shot(b, `narrow-${w}x${h}-words`);
    if (one) {
      await b.key("End");
      check(`${tag}: End to Review, which opens the clipping`, await b.evaluate(`document.activeElement.id === "tabReview" && !reviewPanel.hidden && !!reviewPanel.querySelector(".review")`));
      m = await b.evaluate(MEASURE);
      check(`${tag}: Review panel inside the mirror, above the buttons`, m.panelInGlass && m.panelAboveButtons && m.outside.length === 0);
      await b.evaluate(`reviewPanel.scrollTop = 0`);
      await sleep(150);
      check(`${tag}: review top: pin and masthead visible`, await b.evaluate(`(() => { const p = reviewPanel.getBoundingClientRect(), pin = reviewPanel.querySelector(".review-pin").getBoundingClientRect(); return pin.top >= p.top - 0.5; })()`));
      await b.evaluate(`reviewPanel.scrollTop = 1e9`);
      await sleep(150);
      check(`${tag}: review bottom: the last row above the fade`, await b.evaluate(`(() => { const p = reviewPanel.getBoundingClientRect(), rows = reviewPanel.querySelectorAll(".review-row"), last = rows[rows.length - 1].getBoundingClientRect(); return last.bottom <= p.bottom - 26 + 4; })()`));
      await shot(b, `narrow-${w}x${h}-review`);
      await b.key("ArrowRight");
      check(`${tag}: ArrowRight from Review wraps to Notes`, (await b.evaluate("document.activeElement.id")) === "tabNotes");
      await b.key("Home");
      check(`${tag}: Home stays on Notes`, (await b.evaluate("document.activeElement.id")) === "tabNotes");
      await b.key("ArrowLeft");
      check(`${tag}: ArrowLeft wraps to Review`, (await b.evaluate("document.activeElement.id")) === "tabReview");
    } else {
      check(`${tag}: the review is in the left column, no Review tab`, await b.evaluate(`!perfReview.hidden && tabReview.getClientRects().length === 0`));
    }
    await done(b);
  }
}

if (!only || only === "resize") {
  console.log("\n== resizing across the breakpoint");
  const b = await open({ width: 683, height: 768 });
  await b.show(LONG);
  await b.mouse("#tabReview");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  check("one column to two with Review open: back to Coach's notes", await b.evaluate(`backstageTabs.selected() === "tabNotes" && !coachNotesBody.hidden && reviewPanel.hidden && !perfReview.hidden`));
  await done(b);
  const p = await open({ width: 390, height: 780 });
  await p.show(LONG);
  await p.mouse("#tabReview");
  await p.send("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  check("phone to 768px with Review open: Review stays open", await p.evaluate(`backstageTabs.selected() === "tabReview" && !reviewPanel.hidden && reviewPanel.getClientRects().length > 0`));
  await done(p);
}

if (!only || only === "same") {
  console.log("\n== unchanged (pixels vs the previous commit)");
  const FIXED = JSON.stringify([{ id: "fixed1", savedAt: "2026-10-01T10:00:00.000Z", ...LONG, words: null }]);
  async function pic(url, w, h, how) {
    const b = await launch({ width: w, height: h, flags: [], mobile: w <= 600 });
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await b.goto(url, []);
    const settle = async () => { for (let i = 0; i < 80 && await b.evaluate("document.body.classList.contains('curtains-closed') || appRoot.inert"); i++) await sleep(100); await sleep(600); };
    if (how === "stage") {
      await sleep(600);
    } else if (how === "wall" || how === "playbill") {
      await b.evaluate(`(() => { localStorage.setItem("speakreview.wall.v1", ${JSON.stringify(FIXED)}); loadWall(); goToView("wall"); })()`);
      await settle();
      if (how === "playbill") { await b.evaluate(`wallButtons.get("fixed1").click()`); await sleep(600); }
    } else {
      await b.evaluate(`displayResult(${JSON.stringify(LONG)})`);
      await settle();
      await sleep(1600);
      if (how === "review") { await b.evaluate(`backstageTabs.select("tabReview")`); await sleep(300); }
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
  const CASES = [
    [390, 780, "backstage", "phone Backstage"], [390, 780, "review", "phone Backstage, Review tab"], [390, 780, "playbill", "phone playbill"],
    [360, 740, "backstage", "phone Backstage"], [360, 740, "review", "phone Backstage, Review tab"], [360, 740, "playbill", "phone playbill"],
    [1280, 800, "backstage", "laptop Backstage"], [1366, 641, "backstage", "laptop Backstage"], [1920, 1080, "backstage", "laptop Backstage"],
    [683, 768, "stage", "Stage"], [683, 768, "wall", "Wall of Fame"], [768, 1024, "stage", "Stage"], [768, 1024, "wall", "Wall of Fame"], [768, 1024, "playbill", "playbill"], [683, 768, "playbill", "playbill"]
  ];
  for (const [w, h, how, name] of CASES) {
    const d = await diff(await pic(BASE, w, h, how), await pic(LIVE, w, h, how), w, h);
    check(`${w}x${h} ${name}: pixel-identical to the previous commit`, d.n === 0, `${d.n} px differ, first ${JSON.stringify(d.first)}`);
  }
}

finish();
