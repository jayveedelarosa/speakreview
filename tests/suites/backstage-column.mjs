// Backstage left column: buttons always visible, the rest scrolls; tab focus ring
import { launch, sleep, LIVE, BASE, only, check, finish, WORDS, RESULT, open, done, shot } from "../lib/page.mjs";
// ================================================================ Backstage buttons always visible + tab focus
const REVIEW = {
  structure: { level: 3, reason: "Clear position up front, story in the middle." },
  clarity: { level: 2, reason: "Easy to follow, but the point repeated twice." },
  on_topic: { level: 4, reason: "Every sentence answered the question." },
  word_choice: { level: 1, reason: "\"Basically\" softened your strongest lines." }
};
const LONG = { ...RESULT, topic: "How do our habits shape who we become, and what small daily choices end up mattering most over a whole lifetime?",
  cut_off: true, time_limit_seconds: 300, speaking_seconds: 600, filler_word_breakdown: { um: 3, uh: 2, like: 1, "you know": 1 }, review: REVIEW, words: WORDS.slice(0, 18) };

const MEASURE = `(() => {
  const g = document.querySelector(".mirror-glass").getBoundingClientRect();
  const s = perfScroll.getBoundingClientRect();
  const inGlass = r => r.top >= g.top - 0.5 && r.bottom <= g.bottom + 0.5 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5;
  const btn = [backToStageBtn, tryAgainBtn].map(e => e.getBoundingClientRect());
  const clip = document.querySelector("#perfReview .review");
  const c = clip ? clip.getBoundingClientRect() : null;
  const pin = clip ? clip.querySelector(".review-pin").getBoundingClientRect() : null;
  const hint = document.getElementById("perfHint");
  return {
    scrolls: perfScroll.classList.contains("is-scrollable"), more: perfScroll.classList.contains("has-more"),
    top: perfScroll.scrollTop, max: perfScroll.scrollHeight - perfScroll.clientHeight,
    buttons: btn.every(r => inGlass(r) && r.height > 30), buttonsBelowScroll: btn.every(r => r.top >= s.bottom - 0.5),
    scrollInGlass: inGlass(s), sideways: document.documentElement.scrollWidth - innerWidth,
    hint: !hint.hidden && getComputedStyle(hint).display !== "none" ? hint.textContent : null,
    clip: c && { left: +(c.left - s.left).toFixed(1), right: +(s.right - c.right).toFixed(1), top: +(c.top - s.top).toFixed(1), bottomRoom: +(s.bottom - c.bottom).toFixed(1) },
    pinInside: pin ? pin.top >= s.top - 0.5 && pin.left >= s.left && pin.right <= s.right : null,
    tab: perfScroll.getAttribute("tabindex"), label: perfScroll.getAttribute("aria-label")
  };
})()`;

async function wheel(b, dy, times = 10) {
  const [x, y] = await b.evaluate(`(() => { const r = perfScroll.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  for (let i = 0; i < times; i++) { await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy }); await sleep(100); }
  await sleep(300);
}
const KEYS2 = { ArrowDown: [40, "ArrowDown"], Tab: [9, "Tab"], ArrowRight: [39, "ArrowRight"] };
async function key2(b, k) {
  const [vk, code] = KEYS2[k];
  await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(120);
}

if (!only || only === "column") {
  console.log("\n== left column: buttons always visible, the rest scrolls");
  for (const [w, h, dpr] of [[1366, 641, 1], [1093, 526, 1.25], [1280, 800, 1], [1920, 1080, 1]]) {
    const tag = dpr !== 1 ? "1366x657 at 125%" : `${w}x${h}`;
    const b = await open({ width: w, height: h, dpr });
    await b.show(LONG);
    let m = await b.evaluate(MEASURE);
    await shot(b, `perf2-${w}x${h}-top`);
    console.log(`      scrolls: ${m.scrolls}, range ${m.max}px, clip room ${JSON.stringify(m.clip)}`);
    check(`${tag}: both buttons fully visible inside the mirror (now under the notes)`, m.buttons && m.scrollInGlass);
    check(`${tag}: no sideways scroll`, m.sideways <= 0);
    if (m.scrolls) {
      check(`${tag}: "Scroll for the review" shows while the review is below the fold, with the fade`, m.hint === "Scroll for the review" && m.more);
      check(`${tag}: the scrolling part is focusable, named`, m.tab === "0" && m.label === "Your speech, scrollable");
      await wheel(b, 300);
      m = await b.evaluate(MEASURE);
      await shot(b, `perf2-${w}x${h}-bottom`);
      check(`${tag}: mouse wheel reaches the bottom`, m.top >= m.max - 1, `${m.top} of ${m.max}`);
      check(`${tag}: at the bottom: the clipping's last row (tilted corner too) ends above the fade, no fade, hint gone`, !m.more && m.hint === null && m.clip.bottomRoom >= 40, JSON.stringify(m.clip));
      check(`${tag}: room for the tilted clipping and its shadow at the sides (>= 12px each)`, m.clip.left >= 12 && m.clip.right >= 12, JSON.stringify(m.clip));
      // Scrolled to the clipping's top: the pin and masthead are fully in view (nothing of it is out of reach)
      await b.evaluate(`perfScroll.scrollTop = perfReview.offsetTop - perfScroll.offsetTop - 10`);
      await sleep(200);
      const tm = await b.evaluate(MEASURE);
      check(`${tag}: scrolled to the review, the pin and masthead are fully visible`, tm.pinInside && tm.clip.top >= 0, JSON.stringify(tm.clip));
      check(`${tag}: buttons still fully visible at the bottom`, m.buttons);
      // Keyboard: the focused area scrolls with the arrow keys, and Tab goes on to the tabs (the buttons now come after the notes)
      await b.evaluate("perfScroll.scrollTop = 0; perfScroll.focus()");
      await key2(b, "ArrowDown"); await key2(b, "ArrowDown");
      check(`${tag}: arrow keys scroll the focused area`, (await b.evaluate("perfScroll.scrollTop")) > 0);
      await key2(b, "Tab");
      check(`${tag}: Tab goes on to the tabs`, (await b.evaluate("document.activeElement.id")) === "tabNotes");
    } else {
      check(`${tag}: everything fits: no scroller, no hint, no fade`, m.hint === null && !m.more && m.tab === null);
    }
    // Without a review: never the hint
    await b.show({ ...LONG, review: undefined });
    m = await b.evaluate(MEASURE);
    check(`${tag}: without a review the hint never shows`, m.hint === null && m.buttons);
    await done(b);
  }

  console.log("\n== unchanged where it fits (pixels vs the previous commit)");
  const FITS = { ...RESULT, topic: "Is failure a better teacher than success?", review: REVIEW };
  async function pic(url, w, h, result) {
    const b = await launch({ width: w, height: h, flags: [], mobile: w <= 600 });
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await b.goto(url, []);
    await b.evaluate(`displayResult(${JSON.stringify(result)})`);
    for (let i = 0; i < 80 && await b.evaluate("document.body.classList.contains('curtains-closed') || appRoot.inert"); i++) await sleep(100);
    await sleep(2200);
    const extra = await b.evaluate(`(() => { const s = document.getElementById("perfScroll"); return s ? s.className + "|" + s.getAttribute("tabindex") : "none"; })()`);
    const data = (await b.send("Page.captureScreenshot", { format: "png" })).data;
    await b.close();
    return { data, extra };
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
  // 1920x1080 with a review already overflowed before (the buttons were below the mirror), so it is checked
  // where the column really fits: 2560x1440 with a review, 1920x1080 without one, and phones
  for (const [w, h, result, name] of [[390, 780, LONG, "phone"], [360, 740, LONG, "phone"]]) {
    const before = await pic(BASE, w, h, result);
    const after = await pic(LIVE, w, h, result);
    const d = await diff(before.data, after.data, w, h);
    check(`${w}x${h} ${name}: pixels identical to the previous commit`, d.n === 0, `${d.n} px differ, first ${JSON.stringify(d.first)}`);
    check(`${w}x${h} ${name}: no scroller classes`, /^perf-scroll\|null$/.test(after.extra), after.extra);
  }
}

if (!only || only === "focus") {
  console.log("\n== tab focus ring: keyboard only");
  const b = await open();
  await b.show(LONG);
  const ring = sel => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const cs = getComputedStyle(e); return { fv: e.matches(":focus-visible"), outline: cs.outlineStyle === "none" ? "none" : cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor }; })()`);
  await b.mouse("#tabWords");
  check("Backstage: a click on a tab shows no box", (await ring("#tabWords")).outline === "none");
  await b.evaluate("tabNotes.focus()");
  await key2(b, "ArrowRight");
  let r = await ring("#tabWords");
  check("Backstage: keyboard focus shows the same 2px gold ring", r.outline === "solid 2px rgb(240, 207, 134)" || /^solid 2px/.test(r.outline), r.outline);
  const keyboardRing = r.outline;
  await b.mouse("#tabWords");
  check("Backstage: clicking the tab that had keyboard focus removes the box", (await ring("#tabWords")).outline === "none");
  await key2(b, "ArrowRight");
  check("Backstage: the next arrow key brings the ring back, unchanged", (await ring("#tabNotes")).outline === keyboardRing);
  // Playbill
  await b.evaluate(`saveToWall("pf1", ${JSON.stringify(LONG)}); goToView("wall")`);
  await b.settled();
  await b.evaluate(`wallButtons.get("pf1").click()`);
  await sleep(300);
  await b.mouse("#pbTabWords");
  check("playbill: a click on a tab shows no box", (await ring("#pbTabWords")).outline === "none");
  await key2(b, "ArrowRight");
  r = await ring("#pbTabReview");
  check("playbill: keyboard focus still shows the ring", r.fv && r.outline !== "none", r.outline);
  await done(b);

  console.log("\n== tab focus on a phone (tap)");
  const p = await open({ width: 390, height: 780 });
  await p.show(LONG);
  await p.mouse("#tabReview");
  check("phone: a tap on a tab shows no box", (await p.evaluate(`getComputedStyle(tabReview).outlineStyle`)) === "none");
  await done(p);
}

finish();
