// Stage 7: phone scrolling (stable heights, scenery under the scene, no overscroll), polish
import { launch, sleep, only, check, finish, longWords, RESULT, open, done, shot, contrast } from "../lib/page.mjs";
import { join } from "node:path";
import { SITE } from "../lib/paths.mjs";
import { readFileSync } from "node:fs";
const CSS_FILE = join(SITE, "css", "styles.css");
const SIZES = [[390, 700], [390, 780], [390, 844], [360, 740], [412, 915]];
const TOOLBAR = 56;   // how much taller the window gets when the browser toolbar hides
const FEEDBACK = "Strengths:\n" + Array.from({ length: 8 }, (_, i) => `${i + 1}. Point number ${i + 1} about the opening, the story and the close, written out at length.`).join("\n")
  + "\nWeaknesses:\n" + Array.from({ length: 8 }, (_, i) => `${i + 1}. Something to work on, number ${i + 1}, with a full sentence of advice.`).join("\n");
const FULL = { ...RESULT, ai_feedback: FEEDBACK, words: longWords(600), speaking_seconds: 240,
  review: { structure: { level: 3, reason: "Clear position up front." }, clarity: { level: 2, reason: "Easy to follow." },
    on_topic: { level: 4, reason: "Every sentence answered the question." }, word_choice: { level: 1, reason: "A few soft words." } } };

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const dark = (c, k) => c.map(v => v * k);
// The page background expected under each room (styles.css, html and html:has(...))
const SCENERY = {
  stage: { main: [dark(rgb("#6B3F22"), 0.4), dark(rgb("#7A4A2A"), 0.4)], all: [dark(rgb("#6B3F22"), 0.4), dark(rgb("#7A4A2A"), 0.4), dark(rgb("#43260F"), 0.4)] },
  backstage: { main: [rgb("#3A0E14")], all: [rgb("#3A0E14"), rgb("#2A080D")] },
  wall: { main: [rgb("#3E0F16"), rgb("#380D13")], all: [rgb("#3E0F16"), rgb("#380D13")] }
};
const BG = rgb("#1A0B0A");
const near = (p, c, t = 4) => Math.abs(p[0] - c[0]) <= t && Math.abs(p[1] - c[1]) <= t && Math.abs(p[2] - c[2]) <= t;
// The scenery colour, or the same colour under a soft shadow (the mirror's shadow reaches into the gap)
const shaded = (p, c) => { const k = (p[0] + p[1] + p[2]) / (c[0] + c[1] + c[2]); return k >= 0.7 && k <= 1.03 && near(p, c.map(v => v * k), 3); };

// Screen pixels at the given points (decoded in a separate blank page, as the contrast helper does)
async function pixels(b, w, points) {
  const data = (await b.send("Page.captureScreenshot", { format: "png" })).data;
  const d = await launch({ width: 400, height: 300 });
  await d.send("Page.navigate", { url: "about:blank" });
  await sleep(200);
  const out = await d.evaluate(`(async () => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${data}"; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const k = img.width / ${w};
    return ${JSON.stringify(points)}.map(([X, Y]) => Array.from(x.getImageData(Math.round(X * k), Math.round(Y * k), 1, 1).data.slice(0, 3)));
  })()`);
  await d.close();
  return out;
}

// The scene of the open room, in page coordinates, and the bottom bar
const GEOMETRY = `(() => {
  const view = document.querySelector(".app").dataset.view || "stage";
  const box = sel => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect();
    return [r.left, r.top + scrollY, r.width, r.height].map(v => +v.toFixed(1)); };
  const parts = view === "stage" ? { stage: ".stage", floor: ".floor", audience: ".audience-phone", mic: ".mic-btn" }
    : view === "backstage" ? { room: ".backstage", mirror: ".mirror", glass: ".mirror-glass" }
    : { room: ".wall", frames: ".wall-frames" };
  const boxes = {}; for (const k in parts) boxes[k] = box(parts[k]);
  const scene = document.querySelector(view === "stage" ? ".stage" : view === "backstage" ? ".backstage" : ".wall").getBoundingClientRect();
  const nav = document.querySelector(".main-nav").getBoundingClientRect();
  // The round Stage button rises above the bar: its columns are left out of the gap's pixel check
  const raised = [...document.querySelectorAll(".main-nav *")].map(e => e.getBoundingClientRect()).filter(r => r.top < nav.top - 0.5).map(r => [r.left - 12, r.right + 12]);
  return { view, boxes, sceneBottom: scene.bottom, navTop: nav.top, raised, inner: innerHeight, sideways: document.documentElement.scrollWidth - innerWidth,
    docH: document.documentElement.scrollHeight };
})()`;

async function resize(b, w, h) {
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
  await sleep(350);
}

if (!only || only === "toolbar") {
  console.log("\n== toolbar hides and shows: the scene keeps still, the gap shows scenery");
  const cssText = readFileSync(CSS_FILE, "utf8");
  check("styles.css: no dvh heights left", !/\d+dvh/.test(cssText));
  check("styles.css: 100vh only as the svh fallback (and the body)", (cssText.match(/100vh/g) || []).length === 2 && /--stable-h: 100vh;\s*--stable-h: 100svh;/.test(cssText));
  for (const [w, h] of SIZES.filter(([w, h]) => !process.env.ONLY_SIZE || process.env.ONLY_SIZE === `${w}x${h}`)) {
    const tag = `${w}x${h}`;
    for (const room of ["stage", "backstage-notes", "backstage-words", "wall"].filter(r => !process.env.ONLY_ROOM || process.env.ONLY_ROOM === r)) {
      const b = await open({ width: w, height: h });
      await b.settled();
      if (room.startsWith("backstage")) {
        await b.show(FULL);
        if (room === "backstage-words") { await b.click("#tabWords"); await sleep(250); }
      }
      if (room === "wall") {
        await b.evaluate(`document.querySelector('.main-nav [data-view="wall"]').click()`);
        await sleep(300);
        await b.settled();
      }
      // A real phone keeps svh at the toolbar-shown height; emulation can't slide a toolbar, so hold it there
      await b.evaluate(`document.documentElement.style.setProperty("--stable-h", "${h}px")`);
      await sleep(250);
      const shown = await b.evaluate(GEOMETRY);
      const view = shown.view;
      check(`${tag} ${room}: the room fills the window down to the bar, and the page is no longer than the window`, Math.abs(shown.sceneBottom - shown.navTop) <= 1 && shown.docH <= h, `${shown.sceneBottom} vs ${shown.navTop}, page ${shown.docH}`);
      check(`${tag} ${room}: no sideways scroll`, shown.sideways <= 0, String(shown.sideways));
      // Toolbar hides: the window grows
      await resize(b, w, h + TOOLBAR);
      await b.evaluate("scrollTo(0, document.documentElement.scrollHeight)");
      await sleep(200);
      const hidden = await b.evaluate(GEOMETRY);
      check(`${tag} ${room}: toolbar hidden: nothing in the scene moves or resizes`, JSON.stringify(hidden.boxes) === JSON.stringify(shown.boxes), JSON.stringify(shown.boxes) + " -> " + JSON.stringify(hidden.boxes));
      check(`${tag} ${room}: toolbar hidden: no sideways scroll`, hidden.sideways <= 0, String(hidden.sideways));
      check(`${tag} ${room}: toolbar hidden: the page still doesn't scroll`, hidden.docH <= h + TOOLBAR, String(hidden.docH));
      // The gap, clear of the bar's own upward shadow (8px up, 18px blur), which is part of the design
      const top = Math.ceil(hidden.sceneBottom) + 2, bottom = Math.floor(hidden.navTop) - 28;
      if (bottom - top >= 4) {
        const pts = [];
        for (let y = top; y <= bottom; y += Math.max(1, Math.floor((bottom - top) / 4)))
          for (let x = 1; x < w - 1; x += 3) if (!hidden.raised.some(([l, r]) => x >= l && x <= r)) pts.push([x, y]);
        const px = await pixels(b, w, pts);
        const s = SCENERY[view];
        const inScene = px.filter(p => s.all.some(c => shaded(p, c))).length / px.length;
        const main = px.filter(p => s.main.some(c => shaded(p, c))).length / px.length;
        const darkBand = px.filter(p => near(p, BG, 2) && !s.all.some(c => near(p, c, 2))).length / px.length;
        await shot(b, `phone-${tag}-${room}-hidden`);
        check(`${tag} ${room}: the ${bottom - top + 5}px gap above the bar shows the ${view === "stage" ? "wooden floor" : "wall"}, not a dark band`,
          inScene >= 0.98 && main >= 0.9 && darkBand === 0, `${(inScene * 100).toFixed(1)}% scenery, ${(main * 100).toFixed(1)}% main colour, ${(darkBand * 100).toFixed(1)}% dark; first ${JSON.stringify(px[0])}`);
      } else {
        check(`${tag} ${room}: a gap opens when the toolbar hides`, false, `${hidden.sceneBottom} to ${hidden.navTop}`);
      }
      // Toolbar shows again
      await resize(b, w, h);
      const again = await b.evaluate(GEOMETRY);
      check(`${tag} ${room}: toolbar shown again: same scene as before`, JSON.stringify(again.boxes) === JSON.stringify(shown.boxes));
      await done(b);
    }
  }
}

if (!only || only === "overscroll") {
  console.log("\n== no pull past the end; panels still scroll");
  const b = await open({ width: 390, height: 780 });
  await b.settled();
  check("page: overscroll-behavior-y none", (await b.evaluate(`getComputedStyle(document.documentElement).overscrollBehaviorY`)) === "none");
  await b.show(FULL);
  const PANELS = `(() => [...document.querySelectorAll(".notes-body, .words-body, .review-panel, .perf-scroll.is-scrollable, .wall-frames, .wall-scroll, .pb-notes, .pb-review, .settings-panel")]
    .map(e => ({ c: e.className, ob: getComputedStyle(e).overscrollBehaviorY, ov: getComputedStyle(e).overflowY })))()`;
  const all = await b.evaluate(PANELS);
  const scrollers = all.filter(p => p.ov === "auto");
  check("every scrolling panel contains its pull", scrollers.length >= 2 && scrollers.every(p => p.ob === "contain"), JSON.stringify(scrollers));
  // Each tab's panel still scrolls
  for (const [tab, sel] of [["#tabNotes", "#coachNotesBody"], ["#tabWords", "#wordsPanel .words-body"], ["#tabReview", "#reviewPanel"]]) {
    await b.click(tab); await sleep(250);
    const r = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const max = e.scrollHeight - e.clientHeight; e.scrollTop = 60; return { max, top: e.scrollTop }; })()`);
    if (r.max > 4) check(`${tab}: its panel still scrolls`, r.top > 0, JSON.stringify(r));
  }
  await done(b);
}

if (!only || only === "fade") {
  console.log("\n== soft top fade while a panel is scrolled down");
  for (const [w, h] of [[390, 780], [768, 1024], [1280, 800]]) {
    const b = await open({ width: w, height: h });
    await b.show(FULL);
    for (const [tab, sel] of [["#tabNotes", "#coachNotesBody"], ["#tabWords", "#wordsPanel .words-body"]]) {
      await b.click(tab); await sleep(250);
      const at = top => b.evaluate(`(async () => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollTop = ${top}; await new Promise(r => setTimeout(r, 120));
        const cs = getComputedStyle(e); return { scrolls: e.scrollHeight > e.clientHeight + 1, cls: e.classList.contains("is-scrolled"), fade: cs.getPropertyValue("--fade-top").trim(), mask: cs.maskImage || cs.webkitMaskImage }; })()`);
      const down = await at(80);
      if (!down.scrolls) continue;
      await shot(b, `phone-fade-${w}-${tab.slice(4)}`);
      check(`${w}x${h} ${tab}: scrolled down: a 16px fade at the top, the bottom fade kept`, down.cls && down.fade === "16px" && /16px/.test(down.mask) && /calc\(100% - \d+px\)|8[02]%/.test(down.mask), JSON.stringify(down));
      const up = await at(0);
      check(`${w}x${h} ${tab}: back at the top: no top fade`, !up.cls && up.fade === "0px", JSON.stringify(up));
    }
    await done(b);
  }
}

if (!only || only === "polish") {
  console.log("\n== polish: 11px number labels, Scroll for more");
  for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [683, 768]]) {
    const b = await open({ width: w, height: h });
    await b.show({ ...FULL, filler_word_breakdown: { um: 3, uh: 2, like: 1, "you know": 1 } });
    const m = await b.evaluate(`(() => {
      const labels = [...document.querySelectorAll("#result .stat-label, #result .stat-sub")].filter(e => e.getClientRects().length);
      const row = document.querySelector("#result .perf-stats"); const rr = row.getBoundingClientRect();
      const stats = [...row.querySelectorAll(".stat")].map(s => s.getBoundingClientRect());
      return { sizes: [...new Set(labels.map(e => getComputedStyle(e).fontSize))], fits: row.scrollWidth <= row.clientWidth + 1 && stats.every(s => s.left >= rr.left - 0.5 && s.right <= rr.right + 0.5),
        clipped: labels.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent), overlap: stats.some((s, i) => i && s.left < stats[i - 1].right - 0.5 && s.top < stats[i - 1].bottom) };
    })()`);
    check(`${w}x${h}: number labels 11px`, m.sizes.length === 1 && m.sizes[0] === "11px", m.sizes.join());
    check(`${w}x${h}: the number row still fits (nothing clipped or overlapping)`, m.fits && !m.clipped.length && !m.overlap, JSON.stringify(m));
    await done(b);
  }
  for (const [w, h] of [[1280, 800], [1024, 768], [990, 768], [768, 1024], [683, 768], [390, 844]]) {
    const b = await open({ width: w, height: h });
    await b.show(FULL);
    const m = await b.evaluate(`(() => { const e = notesHint; const vis = !e.hidden && getComputedStyle(e).display !== "none" && e.getClientRects().length > 0;
      const r = e.getBoundingClientRect(), row = e.parentElement.getBoundingClientRect();
      const tabs = [...document.querySelectorAll("#backstageTabs .feedback-tab")].filter(t => t.getClientRects().length).map(t => t.getBoundingClientRect());
      return { vis, text: e.textContent, lines: vis ? Math.round((r.height - parseFloat(getComputedStyle(e).paddingBottom)) / parseFloat(getComputedStyle(e).lineHeight)) : 0,
        inRow: r.left >= row.left - 0.5 && r.right <= row.right + 0.5, clear: tabs.every(t => t.right <= r.left - 4 || t.bottom <= r.top || t.top >= r.bottom),
        tabsFit: tabs.every(t => t.right <= row.right + 0.5) }; })()`);
    check(`${w}x${h}: hint text "Scroll for more"`, m.text === "Scroll for more", m.text);
    if (m.vis) check(`${w}x${h}: hint on one line, inside the tab row, clear of the tabs`, m.lines === 1 && m.inRow && m.clear && m.tabsFit, JSON.stringify(m));
    await done(b);
  }
  const html = readFileSync(CSS_FILE.replace(/css[\\/]styles\.css$/, "index.html"), "utf8") + readFileSync(CSS_FILE.replace(/css[\\/]styles\.css$/, "js/app.js"), "utf8");
  check("no \"Scroll for all notes\" left anywhere", !html.includes("Scroll for all notes"));
}

finish();
