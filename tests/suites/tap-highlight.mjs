// Tap highlight removed; focus rings and hover/press styles unchanged (compared with the previous commit)
import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { readFileSync } from "node:fs";
import { SITE, BASE_SITE, LIVE, BASE } from "../lib/paths.mjs";
import { join } from "node:path";
let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`); };

// [label, selector of the element that is tapped / focused, selector of where its ring shows]
const PHONE = [
  ["bar: Backstage", "#navBackstage", "#navBackstage"], ["bar: Stage", "#navStage", "#navStage .stage-disc"], ["bar: Wall of Fame", "#navWall", "#navWall"],
  ["stub: Speaking time", "#timeTicket", "#timeTicket"], ["stub: Prep time", "#prepSetting", "#prepSetting"],
  ["Roll a new topic", "#randomTopicBtn", "#randomTopicBtn"], ["Write your own", "#writeTopicBtn", "#writeTopicBtn"], ["Speak freely", "#clearTopicBtn", "#clearTopicBtn"],
  ["mic", "#micBtn", "#micBtn"], ["upload label", "#audioFile", ".btn-upload"], ["Privacy", "#privacyBtn", "#privacyBtn"]
];
const CHOICES = [["choice: 3 minutes", '#timePage input[value="180"]', '#timePage .choice:has(input[value="180"]) > span'], ["Done", "#settingsDoneBtn", "#settingsDoneBtn"]];
const LAPTOP = [["sign: Backstage", "#signBackstage", "#signBackstage"], ["sign: Wall of Fame", "#signWall", "#signWall"], ...PHONE.slice(3)];

async function snapshot(url, w, h, items, openPanel) {
  const b = await launch({ width: w, height: h, flags: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], mobile: w <= 600 });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.goto(url, [API_STUB]);
  if (openPanel) { await b.evaluate("timeTicket.click()"); await sleep(400); await b.evaluate(`document.querySelector('#timePage input[value="custom"]').click()`); await sleep(200); }
  const out = {};
  for (const [label, sel, ringSel] of items) {
    // tap highlight on the element and on everything inside it
    const tap = await b.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel + ", " + sel + " *")})].map(e => getComputedStyle(e).webkitTapHighlightColor)`);
    // keyboard focus ring: a key press first, so the browser treats the focus as keyboard focus
    await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
    await b.evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`);
    const ring = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), r = document.querySelector(${JSON.stringify(ringSel)}); const c = getComputedStyle(r);
      return [e.matches(":focus-visible"), c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset].join(" "); })()`);
    await b.evaluate("document.activeElement.blur()");
    // hover (the site's "pressed" look comes from hover; there are no :active styles)
    const rect = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(ringSel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect[0], y: rect[1] });
    await sleep(250);
    const hover = await b.evaluate(`(() => { const c = getComputedStyle(document.querySelector(${JSON.stringify(ringSel)})); return [c.backgroundImage, c.backgroundColor, c.color, c.borderTopStyle, c.borderTopColor, c.opacity].join(" | "); })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await sleep(100);
    out[label] = { tap, ring, hover };
  }
  const errors = b.consoleErrors, violations = b.violations;
  await b.close();
  return { out, errors, violations };
}

for (const [w, h, items, tag] of [[390, 780, PHONE, "phone"], [390, 780, CHOICES, "phone sheet"], [1280, 800, LAPTOP, "laptop"], [1280, 800, CHOICES, "laptop panel"]]) {
  console.log(`\n== ${tag} (${w}x${h})`);
  const panel = tag.includes("sheet") || tag.includes("panel");
  const before = await snapshot(BASE, w, h, items, panel);
  const after = await snapshot(LIVE, w, h, items, panel);
  for (const [label] of items) {
    const a = after.out[label], bf = before.out[label];
    check(`${tag} ${label}: no tap highlight`, a.tap.length > 0 && a.tap.every(c => c === "rgba(0, 0, 0, 0)"), [...new Set(a.tap)].join());
    check(`${tag} ${label}: keyboard focus ring unchanged`, a.ring === bf.ring && a.ring.startsWith("true solid"), a.ring);
    check(`${tag} ${label}: hover / pressed look unchanged`, a.hover === bf.hover, a.hover.slice(0, 120));
  }
  check(`${tag} no console errors or CSP violations`, after.errors.length === 0 && after.violations.length === 0);
}

// A real tap on the bar still switches rooms (touch events, as on Android)
console.log("\n== real taps (390x780, touch)");
const b = await launch({ width: 390, height: 780, mobile: true });
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await b.goto(LIVE, [API_STUB]);
for (const [id, view] of [["navBackstage", "backstage"], ["navWall", "wall"], ["navStage", "stage"]]) {
  const [x, y] = await b.evaluate(`(() => { const r = (document.querySelector("#${id} .stage-disc") || document.getElementById("${id}")).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(500);
  check(`tap on ${id} opens ${view}, aria-current moves`, (await b.evaluate("currentView")) === view && (await b.evaluate(`document.getElementById("${id}").getAttribute("aria-current")`)) === "page");
}
await b.close();

const css = readFileSync(join(SITE, "css", "styles.css"), "utf8");
// Compared with the last commit's styles (run-all.mjs extracts them into .output/base)
const old = readFileSync(join(BASE_SITE, "css", "styles.css"), "utf8");
check("no new outline: none in styles.css since the last commit", (css.match(/outline:\s*none/g) || []).length === (old.match(/outline:\s*none/g) || []).length);
console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
