// Shared helpers for the Feature set 2 suites: checks, a page opened with the fake API, sample results,
// screenshots and contrast measurement. A suite imports what it needs and ends with finish().
import { mkdirSync, writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";
import { LIVE, BASE } from "./paths.mjs";
export { launch, sleep, LIVE, BASE };
// Screenshots are only saved when SHOTS names a folder (run-all.mjs --shots sets it)
export const SHOTS = process.env.SHOTS;
// "node suites/x.mjs part" runs only that part of a suite
export const only = process.argv[2];
let failures = 0;
export const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`);
};
// The last line of every suite: the result, and the exit code run-all.mjs reads
export function finish() {
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

// [word, start, end, confidence] in hundredths of a second, confidence 0-100
export const XSS = "<img src=x onerror=window.__xss=1>";
export const WORDS = [
  ["So", 0, 30, 99], ["um,", 40, 70, 30], ["I", 80, 90, 98], ["think", 95, 130, 97], ["failure", 135, 190, 45],
  ["is", 195, 205, 99], ["a", 210, 215, 99], ["better", 220, 260, 96], ["teacher.", 265, 320, 98],
  ["Umm", 660, 700, 90], ["uh.", 710, 740, 92], ["erm", 750, 780, 95], ["Ah,", 790, 820, 95], ["ahh", 830, 850, 95],
  ["clear", 855, 890, 50], ["mumble", 900, 930, 49], [XSS, 940, 970, 95], ["end.", 1260, 1290, 99],
  // malformed: all skipped
  ["bad"], [5, 1, 2, 3], ["neg", -1, 2, 50], ["back", 10, 5, 50], ["conf", 1, 2, 101], ["", 1, 2, 50], "text", null
];
export const VISIBLE = `So um, I think failure is a better teacher. 3.4s Umm uh. erm Ah, ahh clear mumble ${XSS} end.`;

// 1,500 words over 10 minutes, with some fillers, a few long pauses and some unclear words
export function longWords(n = 1500) {
  const list = [];
  let t = 0;
  const vocab = ["practice", "makes", "progress,", "and", "every", "speech", "teaches", "something", "new.", "When", "you", "stand", "up", "the", "room", "listens."];
  for (let i = 0; i < n; i++) {
    const w = i % 37 === 5 ? "um" : i % 53 === 7 ? "uh," : vocab[i % vocab.length];
    const conf = i % 41 === 3 ? 30 : 95;
    t += i % 250 === 249 ? 350 : 10;
    list.push([w, t, t + 28, conf]);
    t += 28;
  }
  return list;
}

export const RESULT = { wpm: 120, filler_word_total: 4, filler_word_breakdown: { um: 2, uh: 1, erm: 1 }, avg_confidence: 0.8,
  ai_feedback: "Strengths:\n1. Clear.\nWeaknesses:\n1. Fillers.", speaking_seconds: 13, source: "recording", topic: "Is failure a better teacher than success?", topic_type: "persuade" };

export const STUB = `
(() => {
  window.__calls = [];
  window.__result = null;
  window.alert = () => { window.__alerted = true; };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    url = String(url);
    window.__calls.push(url);
    const json = obj => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/upload-url")) return json({ fileId: "f" + window.__calls.length, upload: { url: "https://public-speaking-coach-jayvee.s3.amazonaws.com/", fields: { key: "k" } } });
    if (url === "https://public-speaking-coach-jayvee.s3.amazonaws.com/") return new Response(null, { status: 204 });
    if (url.includes("/result")) return json(window.__result);
    return realFetch(url, opts);
  };
})();`;

export async function open({ width = 1280, height = 800, dpr = 1, motion = "no-preference" } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: [], mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await b.goto(LIVE, [STUB]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(60); }
    return false;
  };
  b.settled = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert && !intermissionOn", 10000).then(() => sleep(250));
  b.mouse = async sel => {
    const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (mobile) {
      await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    }
    await sleep(150);
  };
  const KEYS = { Tab: [9, "Tab"], ArrowRight: [39, "ArrowRight"], ArrowLeft: [37, "ArrowLeft"], Home: [36, "Home"], End: [35, "End"] };
  b.key = async (key, shift = false) => {
    const [code, name] = KEYS[key];
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(100);
  };
  b.show = async (result) => {
    await b.evaluate(`displayResult(${JSON.stringify(result)})`);
    await b.settled();
  };
  return b;
}
export const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
export const shot = async (b, name) => {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  if (SHOTS) writeFileSync(`${SHOTS}/${name}.png`, Buffer.from((await b.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
};

// Contrast measured from the screen (as in the earlier suites). "inside" items are measured against
// their own background, just inside their edge.
export async function contrast(b, w, h, sels, inside = []) {
  const items = await b.evaluate(`(() => { const out = []; const inside = ${JSON.stringify(inside)};
    for (const s of ${JSON.stringify(sels)}) document.querySelectorAll(s).forEach((e, n) => {
      if (n > 2 || !e.getClientRects().length) return; const r = e.getClientRects()[0]; if (r.width < 2 || r.top < 0 || r.bottom > innerHeight) return;
      const cs = getComputedStyle(e); const bw = parseFloat(cs.borderTopWidth) || 0;
      const ring = inside.includes(s) ? [r.left + bw + 2, r.top + bw + 2, r.right - bw - 3, r.bottom - bw - 3] : [r.left - 2, r.top - 2, r.right + 1, r.bottom + 1];
      out.push({ s, c: cs.color, ring }); }); return out; })()`);
  const data = (await b.send("Page.captureScreenshot", { format: "png" })).data;
  const d = await launch({ width: w, height: h });
  await d.send("Page.navigate", { url: "about:blank" });
  await sleep(200);
  const res = await d.evaluate(`(async () => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${data}"; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const k = img.width / ${w};
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const px = (X, Y) => { const d = x.getImageData(Math.round(X * k), Math.round(Y * k), 1, 1).data; return L(d[0], d[1], d[2]); };
    return ${JSON.stringify(items)}.map(it => {
      const m = it.c.match(/[\\d.]+/g).map(Number); const ink = L(m[0], m[1], m[2]);
      const [l, t, r, bt] = it.ring;
      const ring = [];
      for (let X = l; X <= r; X++) { ring.push(px(X, t)); ring.push(px(X, bt)); }
      for (let Y = t; Y <= bt; Y++) { ring.push(px(l, Y)); ring.push(px(r, Y)); }
      const ratio = v => (Math.max(v, ink) + 0.05) / (Math.min(v, ink) + 0.05);
      const rs = ring.map(ratio).sort((a, b) => a - b);
      return [it.s, +rs[Math.floor(rs.length * 0.02)].toFixed(2)];
    });
  })()`);
  await d.close();
  return res;
}

// Inline marks sit in running text (and pill tabs have round corners), where a ring of screen pixels
// touches other things, so their contrast is worked out from the colors: the text against the background
// colors of the element and its parents, blended down to the first solid one (the glass or the paper).
export const COLOR_CONTRAST = sels => `(() => {
  const parse = c => { const m = c.match(/[0-9.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  const background = e => { const layers = []; for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; }
    return layers.reverse().reduce((under, top) => over(top, under), { r: 0, g: 0, b: 0, a: 1 }); };
  const out = [];
  for (const s of ${JSON.stringify(sels)}) document.querySelectorAll(s).forEach((e, n) => { if (n > 3) return; const bg = background(e); out.push([s, +ratio(over(parse(getComputedStyle(e).color), bg), bg).toFixed(2)]); });
  return out;
})()`;
export const MARKS = scope => [".words-text", ".w-filler", ".w-unclear", ".w-pause"].map(s => `${scope} ${s}`);
export const contrastOk = (res, name) => {
  const worst = Object.values(res.reduce((m, [s, r]) => { m[s] = Math.min(m[s] ?? 99, r); return m; }, {}));
  check(`${name}: contrast >= 4.5:1`, res.length > 0 && res.every(([, r]) => r >= 4.5), [...new Set(res.map(([s]) => s))].map(s => `${s} ${Math.min(...res.filter(x => x[0] === s).map(x => x[1]))}`).join(", "));
  return worst;
};

// Visible text of the words (without the screen-reader-only words), and what screen readers get
export const READ = `(() => {
  const t = document.querySelector("#wordsPanel .words-text");
  if (!t) return null;
  const clone = t.cloneNode(true); clone.querySelectorAll(".visually-hidden").forEach(e => e.remove());
  return {
    visible: clone.textContent.replace(/\\s+/g, " ").trim(),
    fillers: [...t.querySelectorAll("mark.w-filler")].map(e => e.firstChild.textContent),
    unclear: [...t.querySelectorAll(".w-unclear")].map(e => e.firstChild.textContent),
    pauses: [...t.querySelectorAll(".w-pause")].map(e => [e.textContent, e.getAttribute("aria-label"), e.getAttribute("role"), !!e.querySelector("svg")]),
    srFiller: [...t.querySelectorAll("mark.w-filler .visually-hidden")].map(e => e.textContent),
    srUnclear: [...t.querySelectorAll(".w-unclear .visually-hidden")].map(e => e.textContent),
    title: t.querySelector(".w-unclear")?.title,
    legend: [...document.querySelectorAll("#wordsPanel .words-key .long-label")].map(e => e.textContent),
    note: document.querySelector("#wordsPanel > .words-note")?.textContent,
    img: document.querySelectorAll("#wordsPanel img, #result img").length,
    xss: window.__xss === 1 || window.__alerted === true
  };
})()`;

