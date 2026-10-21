// Feature set 2, stage 1: the ticket stubs (Speaking time, Prep time): behaviour, saved choices, no mic, end to end.
// Since Feature set 3 stage 2 the stubs open Tonight's programme (one paper form) on their own section; the form's
// own details (name, typed times, −/+, highlight, sizes) are in programme.mjs.
// Retired: the comparison with the commit before stage 1 and the old ticket sizes (stage 1b replaced them; see
// stage1b-ticket), and the wooden panel's "a pick closes it", Custom page and arrow (stage 2 of feature set 3).
import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { readFileSync } from "node:fs";
import { SHOTS, LIVE } from "../lib/paths.mjs";
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const only = process.argv[2];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`);
};
const SEED = readFileSync(new URL("../lib/seed.js", import.meta.url), "utf8");
const KEYS = { Enter: [13, "Enter", "\r"], " ": [32, "Space", " "], ArrowRight: [39, "ArrowRight"], ArrowLeft: [37, "ArrowLeft"], Tab: [9, "Tab"], Escape: [27, "Escape"] };
const KEY = "speakreview.settings.v1";
const stored = b => b.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`);

async function open(url = LIVE, { width = 1280, height = 800, pre = [], dpr = 1, flags = FAKE } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  // The motion setting comes from the computer (Windows "Show animations"), so pin it: motion allowed
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.goto(url, [API_STUB, ...pre]);
  b.waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(100); }
    return false;
  };
  b.center = sel => b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  b.mouseAt = async (x, y) => {
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(120);
  };
  b.mouse = async sel => { const [x, y] = await b.center(sel); await b.mouseAt(x, y); };
  b.key = async (key, shift = false) => {
    const [code, name, text] = KEYS[key];
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await b.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text } : {}) });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(80);
  };
  b.active = () => b.evaluate("(e => e && (e.id || (e.dataset.prep !== undefined ? 'prep:' + e.dataset.prep : e.tagName)))(document.activeElement)");
  b.state = () => b.evaluate(`({ open: !programme.hidden, which: programmeOpen ? programme.dataset.section : null, time: timeTicketValue.textContent, prep: prepTicketValue.textContent,
    tLabel: timeTicket.getAttribute("aria-label"), pLabel: prepTicket.getAttribute("aria-label"),
    tExp: timeTicket.getAttribute("aria-expanded"), pExp: prepTicket.getAttribute("aria-expanded"), sExp: showLabelBtn.getAttribute("aria-expanded") })`);
  // The paper or sheet animates in: wait until two readings 100ms apart agree
  b.still = async sel => {
    const box = () => b.evaluate(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`);
    let last = await box();
    for (let i = 0; i < 30; i++) { await sleep(100); const next = await box(); if (next === last) break; last = next; }
  };
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};

// ---------------------------------------------------------------- 3. behaviour
if (!only || only === "behaviour") {
  console.log("\n== laptop behaviour");
  let b = await open(LIVE);
  let s = await b.state();
  check("defaults: No limit and None", s.time === "No limit" && s.prep === "None", `${s.time} / ${s.prep}`);
  check("accessible names", s.tLabel === "Speaking time: No limit. Click to change" && s.pLabel === "Prep time: None. Click to change", s.tLabel);
  check("aria-controls points at the programme", await b.evaluate(`[timeTicket, prepTicket, showLabelBtn].every(e => e.getAttribute("aria-controls") === "programme")`));
  check("tickets are real buttons", await b.evaluate(`timeTicket.tagName === "BUTTON" && prepTicket.tagName === "BUTTON"`));

  await b.mouse("#timeTicket");
  s = await b.state();
  check("RUNTIME opens the programme on Runtime", s.open && s.which === "time" && s.tExp === "true" && s.pExp === "false" && s.sExp === "false", JSON.stringify(s));
  check("a dialog named by its title", await b.evaluate(`programme.getAttribute("aria-labelledby") === "progTitle" && programme.getAttribute("role") === "dialog" && progTitle.textContent === "Tonight's programme"`));
  check("focus on No limit", (await b.active()) === "progNoLimit", await b.active());
  check("help text", await b.evaluate(`document.querySelector('.prog-sec[data-section="time"] .prog-line').textContent === "How long your speech should last. Going over is fine."`));
  check("DONE always shown", await b.evaluate("progDoneBtn.getClientRects().length > 0"));
  await b.mouse("#prepSetting");
  s = await b.state();
  check("CURTAIN IN switches it to Curtain in", s.open && s.which === "prep" && s.tExp === "false" && s.pExp === "true", JSON.stringify(s));
  check("focus on the ticked prep choice", (await b.active()) === "prep:0", await b.active());
  check("prep help text", await b.evaluate(`document.querySelector('.prog-sec[data-section="prep"] .prog-line').textContent === "Thinking time before recording starts."`));
  await b.mouse("#prepSetting");
  s = await b.state();
  check("clicking the button of the open section closes it", !s.open && s.pExp === "false");

  await b.mouse("#timeTicket");
  await b.mouse("#progPlus");
  s = await b.state();
  check("+ with No limit ticked brings back 3:00 and keeps it open", s.open && s.time === "3 minutes" && s.tLabel === "Speaking time: 3 minutes. Click to change", JSON.stringify(s));
  check("saved right away", (await stored(b)) === '{"time":"180","prep":"0","name":""}', await stored(b));
  check("length logic sees 180", await b.evaluate("getTimeLimit().seconds === 180"));

  await b.key("Escape");
  s = await b.state();
  check("Escape closes without undoing, focus back on the ticket", !s.open && s.time === "3 minutes" && (await b.active()) === "timeTicket");

  await b.mouse("#prepSetting");
  await b.mouseAt(1000, 470);      // empty stage beside the paper, nothing focusable there
  await sleep(100);
  s = await b.state();
  check("outside click closes, focus back on the ticket", !s.open && (await b.active()) === "prepSetting", await b.active());

  await b.mouse("#prepSetting");
  await b.mouse("#signBackstage .sign-face");
  await b.waitFor("currentView === 'backstage'", 5000);
  await b.evaluate("goToView('stage')");
  await b.waitFor("currentView === 'stage' && !document.body.classList.contains('curtains-closed')", 5000);
  await sleep(600);
  check("changing rooms closes it", !(await b.state()).open);

  await b.mouse("#prepSetting");
  // The paper is pinned over the left of the ticket, so click the topic where it still shows
  const [tx, ty] = await b.evaluate(`(() => { const r = topicInput.getBoundingClientRect(), p = programme.getBoundingClientRect(); return [(Math.max(r.left, p.right) + r.right) / 2, r.top + r.height / 2]; })()`);
  await b.mouseAt(tx, ty);
  check("outside click on a field closes and leaves focus there", !(await b.state()).open && (await b.active()) === "topicInput", await b.active());

  // Keyboard
  await b.evaluate("timeTicket.focus()");
  await b.key("Enter");
  s = await b.state();
  check("Enter on RUNTIME opens it", s.open && s.which === "time" && (await b.active()) === "progNoLimit");
  await b.key(" ");
  s = await b.state();
  check("Space ticks No limit, the ticket follows, still open", s.open && s.time === "No limit", s.time);
  await b.key(" ");
  check("Space again brings back 3 minutes", (await b.state()).time === "3 minutes");
  await b.key("Escape");
  await b.evaluate("prepTicket.focus()");
  await b.key(" ");
  await sleep(100);
  check("Space on CURTAIN IN opens it", (await b.state()).which === "prep");
  await b.key("ArrowRight");
  await sleep(100);
  s = await b.state();
  check("arrow key ticks 30 sec and keeps it open", s.open && s.prep === "30 seconds" && (await b.active()) === "prep:30", `${JSON.stringify(s)} ${await b.active()}`);
  check("line under the mic follows prep", (await b.evaluate("actionText.textContent")) === "Tap the mic to begin. You get 30 seconds to prepare, then recording starts.");
  await b.mouse("#progDoneBtn");
  s = await b.state();
  check("DONE closes, focus back on the ticket", !s.open && (await b.active()) === "prepSetting" && s.prep === "30 seconds");

  // Tab away on laptop closes it
  await b.mouse("#timeTicket");
  for (let i = 0; i < 30 && (await b.state()).open; i++) await b.key("Tab");
  check("tabbing out of the programme closes it", !(await b.state()).open);
  check("saved as 180 and 30", (await stored(b)) === '{"time":"180","prep":"30","name":""}', await stored(b));
  await done(b);

  console.log("\n== phone behaviour");
  b = await open(LIVE, { width: 390, height: 780 });
  s = await b.state();
  check("phone names say Tap", s.tLabel === "Speaking time: No limit. Tap to change" && (await b.evaluate("showLabelBtn.getAttribute('aria-label')")) === "No stage name yet. Tap to open tonight's programme", s.tLabel);
  await b.mouse("#timeTicket");
  check("sheet is modal with a backdrop", await b.evaluate(`programme.getAttribute("aria-modal") === "true" && !settingsBackdrop.hidden`));
  check("focus inside the sheet", await b.evaluate("programme.contains(document.activeElement)"));
  let escaped = false;
  for (let i = 0; i < 14; i++) { await b.key("Tab"); if (!(await b.evaluate("programme.contains(document.activeElement)"))) escaped = true; }
  for (let i = 0; i < 14; i++) { await b.key("Tab", true); if (!(await b.evaluate("programme.contains(document.activeElement)"))) escaped = true; }
  check("Tab and Shift+Tab stay inside the sheet", !escaped);
  await b.still("#programme");
  await b.mouse("#progPlus");
  s = await b.state();
  check("a change shows on the ticket and the sheet stays open", s.open && s.time === "3 minutes");

  // Above the tab bar, no page scroll behind
  await b.mouse("#progDoneBtn");
  await b.evaluate(`document.body.style.setProperty("min-height", "3000px")`);
  await b.mouse("#prepSetting");
  await b.still("#programme");
  const cover = await b.evaluate(`(() => {
    const nav = document.querySelector(".main-nav").getBoundingClientRect();
    const hit = document.elementFromPoint(nav.left + 20, nav.top + nav.height / 2);
    const hitTop = document.elementFromPoint(20, 60);
    const sheet = programme.getBoundingClientRect();
    return { navHit: programme.contains(hit) || hit === settingsBackdrop, topHit: hitTop === settingsBackdrop, sheetBottom: sheet.bottom, h: innerHeight };
  })()`);
  check("sheet covers the tab bar", cover.navHit && Math.abs(cover.sheetBottom - cover.h) < 1, JSON.stringify(cover));
  check("backdrop covers the rest of the page", cover.topHit);
  check("page is at the top before the wheel", (await b.evaluate("scrollY")) === 0);
  await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 100, deltaX: 0, deltaY: 600 });
  await sleep(400);
  check("wheel does not scroll the page behind", (await b.evaluate("scrollY")) === 0, await b.evaluate("scrollY"));
  check("page overflow hidden while open", (await b.evaluate("getComputedStyle(document.documentElement).overflowY")) === "hidden");
  await b.mouseAt(195, 60);
  s = await b.state();
  check("tapping the backdrop closes without undoing, focus back on the ticket", !s.open && s.time === "3 minutes" && (await b.active()) === "prepSetting", await b.active());
  await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 300, deltaX: 0, deltaY: 600 });
  await sleep(500);
  check("wheel scrolls the page again after closing", (await b.evaluate("scrollY")) > 0 && !(await b.evaluate(`document.documentElement.classList.contains("settings-lock")`)));
  await b.evaluate("window.scrollTo(0, 0)");
  await b.mouse("#prepSetting");
  await b.still("#programme");
  await b.mouse("#progDoneBtn");
  check("phone DONE closes", !(await b.state()).open && (await b.active()) === "prepSetting" && !(await b.evaluate(`document.documentElement.classList.contains("settings-lock")`)));
  await b.mouse("#prepSetting");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  check("crossing the breakpoint closes it and unlocks scrolling", !(await b.state()).open && !(await b.evaluate(`document.documentElement.classList.contains("settings-lock")`)));
  check("names switch to Click", (await b.state()).tLabel.endsWith("Click to change") && (await b.evaluate("showLabelBtn.getAttribute('aria-label')")).includes("Click to open"));
  await done(b);

  console.log("\n== reduced motion");
  b = await open(LIVE);
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.mouse("#timeTicket");
  check("laptop paper: no animation, no tilt, DONE not tilted", await b.evaluate(`getComputedStyle(programme).animationName === "none" && getComputedStyle(programme).transform === "none" && getComputedStyle(progDoneBtn).transform === "none"`));
  await b.key("Escape");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  await b.mouse("#timeTicket");
  check("phone sheet and backdrop have no animation", (await b.evaluate("getComputedStyle(programme).animationName + getComputedStyle(settingsBackdrop).animationName")) === "nonenone");
  await done(b);
}

// ---------------------------------------------------------------- 4. storage
if (!only || only === "storage") {
  console.log("\n== restoring saved choices");
  const preset = v => `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(v)});`;
  // [stored, seconds (null = no limit), prep, time stub, prep stub, minutes and seconds boxes, show label]
  const SHOW = "Tonight's show";
  const cases = [
    ['{"time":"180","prep":"30"}', 180, 30, "3 minutes", "30 seconds", "03:00", SHOW],
    ['{"time":"60","prep":"0"}', 60, 0, "1 minute", "None", "01:00", SHOW],
    ['{"time":"150","prep":"60"}', 150, 60, "2 min 30 sec", "1 minute", "02:30", SHOW],
    ['{"time":"167","prep":"0"}', 167, 0, "2 min 47 sec", "None", "02:47", SHOW],
    ['{"time":"45","prep":"0"}', 45, 0, "45 seconds", "None", "00:45", SHOW],
    ['{"time":"30","prep":"0"}', 30, 0, "30 seconds", "None", "00:30", SHOW],
    ['{"time":"600","prep":"0"}', 600, 0, "10 minutes", "None", "10:00", SHOW],
    // the 2 minutes prep is gone: it becomes 1 minute
    ['{"time":"300","prep":"120"}', 300, 60, "5 minutes", "1 minute", "05:00", SHOW],
    ['{"time":"","prep":"120"}', null, 60, "No limit", "1 minute", "03:00", SHOW],
    // the stage name
    ['{"time":"","prep":"0","name":"Jayvee"}', null, 0, "No limit", "None", "03:00", "Jayvee's show"],
    ['{"time":"","prep":"0","name":"James"}', null, 0, "No limit", "None", "03:00", "James's show"],
    ['{"time":"","prep":"0","name":"  Ja<b>y</b>  vee!!  "}', null, 0, "No limit", "None", "03:00", "Jabyb vee's show"],
    ['{"time":"","prep":"0","name":"Maximilianoooooooooooo"}', null, 0, "No limit", "None", "03:00", "Maximilianoooooo's show"],
    ['{"time":"","prep":"0","name":"<img src=x onerror=window.__xss=1>"}', null, 0, "No limit", "None", "03:00", "img srcx onerror's show"],
    ['{"time":"","prep":"0","name":"   "}', null, 0, "No limit", "None", "03:00", SHOW],
    // each bad field falls back to its default, the others still load
    ['{"time":"180","prep":"30","name":["Jayvee"]}', 180, 30, "3 minutes", "30 seconds", "03:00", SHOW],
    ['{"time":"180","prep":"30","name":5}', 180, 30, "3 minutes", "30 seconds", "03:00", SHOW],
    ['{"time":"25","prep":"30","name":"Ana"}', null, 30, "No limit", "30 seconds", "03:00", "Ana's show"],
    ['{"time":"601","name":"Ana"}', null, 0, "No limit", "None", "03:00", "Ana's show"],
    ['{"time":"060","prep":"45"}', null, 0, "No limit", "None", "03:00", SHOW],
    ['{"time":180,"prep":30}', null, 0, "No limit", "None", "03:00", SHOW],
    ['{"time":"abc","prep":"90"}', null, 0, "No limit", "None", "03:00", SHOW],
    ['{"time":" 180","prep":"30 "}', null, 0, "No limit", "None", "03:00", SHOW],
    ['{"time":"<img src=x onerror=window.__xss=1>","prep":"<b>hi</b>"}', null, 0, "No limit", "None", "03:00", SHOW],
    ['{"__proto__":{"time":"180"}}', null, 0, "No limit", "None", "03:00", SHOW],
    ["not json", null, 0, "No limit", "None", "03:00", SHOW],
    ["[]", null, 0, "No limit", "None", "03:00", SHOW],
    ["null", null, 0, "No limit", "None", "03:00", SHOW],
    ['"180"', null, 0, "No limit", "None", "03:00", SHOW]
  ];
  for (const [data, t, p, tText, pText, mmss, show] of cases) {
    const b = await open(LIVE, { pre: [preset(data)] });
    const r = await b.evaluate(`({ t: getTimeLimit().seconds, p: getPrepSeconds(), tt: timeTicketValue.textContent, pt: prepTicketValue.textContent,
      mmss: progMin.value + ":" + progSec.value, show: showLabel.textContent, action: actionText.textContent,
      xss: !!window.__xss || !!document.querySelector("#stepTopic img, #stepTopic b") })`);
    check(`stored ${data}`, r.t === t && r.p === p && r.tt === tText && r.pt === pText && r.mmss === mmss && r.show === show && !r.xss, JSON.stringify(r));
    if (p === 30) check("  line under the mic follows the restored prep", r.action === "Tap the mic to begin. You get 30 seconds to prepare, then recording starts.");
    if (data.includes('"120"')) check("  1 minute is stored in its place", JSON.parse(await stored(b)).prep === "60", await stored(b));
    check("  no errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors));
    await b.close();
  }

  console.log("\n== storage blocked");
  const BLOCK = `Storage.prototype.getItem = function () { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.setItem = function () { throw new DOMException("blocked", "SecurityError"); };`;
  let b = await open(LIVE, { pre: [BLOCK] });
  check("page loads with defaults", (await b.state()).time === "No limit" && (await b.evaluate("showLabel.textContent")) === "Tonight's show");
  check("no remember note in the page", await b.evaluate("!document.getElementById('rememberNote') && !document.body.textContent.includes('Remembered')"));
  await b.mouse("#timeTicket");
  await b.mouse("#progPlus");
  await b.mouse("#progMinus");
  await b.mouse("#progMinus");
  check("−/+ still work", (await b.state()).time === "2 minutes" && await b.evaluate("getTimeLimit().seconds === 120"));
  await b.evaluate(`progName.value = "Ana"; progName.dispatchEvent(new Event("input", { bubbles: true })); true`);
  check("the name still shows on the ticket", (await b.evaluate("showLabel.textContent")) === "Ana's show");
  await done(b);

  console.log("\n== Practice this topic again saves the time");
  b = await open(LIVE, { pre: [preset('{"time":"","prep":"0"}')] });
  await b.evaluate(SEED);
  await b.click("#navWall");
  await b.waitFor("currentView === 'wall' && !document.body.classList.contains('curtains-closed')", 5000);
  await sleep(900);
  await b.evaluate(`wallButtons.get("seed-6").click()`);
  await sleep(300);
  await b.click("#pbPracticeBtn");
  await b.waitFor("currentView === 'stage' && !document.body.classList.contains('curtains-closed')", 5000);
  await sleep(900);
  check("ticket shows 2 min 30 sec", (await b.state()).time === "2 min 30 sec");
  check("the boxes show 02:30, No limit unticked", await b.evaluate(`progMin.value === "02" && progSec.value === "30" && progNoLimit.getAttribute("aria-pressed") === "false"`));
  check("stored time is 150", JSON.parse(await stored(b)).time === "150");
  await done(b);
}

// ---------------------------------------------------------------- 5. no mic: only the time stub, still in the ticket's stub column
// (Stage 1 centred it on the stage; since stage 1b the stubs live on the ticket, so that check was retired)
if (!only || only === "nomic") {
  console.log("\n== no mic support");
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const b = await open(LIVE, { width: w, height: h, pre: ["delete window.AudioWorkletNode;"], flags: [] });
    const r = await b.evaluate(`(() => { const t = timeTicket.getBoundingClientRect(), s = document.getElementById("stepTime").getBoundingClientRect();
      const c = timeTicket.closest(".ticket-stub").getBoundingClientRect();
      return { hidden: prepTicket.hidden && prepTicket.getClientRects().length === 0, inStub: t.width > 0 && t.left >= c.left - 0.5 && t.right <= c.right + 0.5 && t.top >= c.top - 0.5 && t.bottom <= c.bottom + 0.5,
        inWindow: t.left >= 0 && t.right <= innerWidth, noMic: stageView.classList.contains("no-mic") }; })()`);
    check(`${w}x${h} prep ticket hidden`, r.noMic && r.hidden);
    check(`${w}x${h} time stub shown inside the ticket's stub column`, r.inStub && r.inWindow, JSON.stringify(r));
    if (SHOTS) await b.shot(`${SHOTS}/nomic-${w}x${h}.png`);
    await b.mouse("#timeTicket");
    check(`${w}x${h} the programme opens on Runtime, without Curtain in`, await b.evaluate(`!programme.hidden && programme.dataset.section === "time" && document.querySelector('.prog-sec[data-section="prep"]').getClientRects().length === 0`));
    if (SHOTS) await b.shot(`${SHOTS}/nomic-${w}x${h}-open.png`);
    await done(b);
  }
}

// ---------------------------------------------------------------- 6. end to end
if (!only || only === "e2e") {
  console.log("\n== end to end: 1 minute and 30 seconds prep through the programme");
  const b = await open(LIVE);
  await b.mouse("#timeTicket");
  await b.evaluate(`progMin.value = "01"; progMin.dispatchEvent(new Event("input", { bubbles: true })); progSec.value = "00"; progSec.dispatchEvent(new Event("input", { bubbles: true })); true`);
  await b.mouse("#prepSetting");
  await b.mouse('#progPrep [data-prep="30"]');
  await b.mouse("#progDoneBtn");
  const s = await b.state();
  check("tickets show 1 minute and 30 seconds", s.time === "1 minute" && s.prep === "30 seconds" && !s.open);
  check("the values are in use", await b.evaluate("getTimeLimit().seconds === 60 && getPrepSeconds() === 30"));
  await b.mouse("#micBtn");
  check("prep starts", await b.waitFor("recState === 'prep'", 8000));
  check("prep countdown starts at 0:30", ["0:30", "0:29"].includes(await b.evaluate("prepCount.textContent")), await b.evaluate("prepCount.textContent"));
  check("tickets and show label disabled while preparing", await b.evaluate("timeTicket.disabled && prepTicket.disabled && showLabelBtn.disabled"));
  await b.mouse("#timeTicket");
  check("disabled ticket doesn't open", !(await b.state()).open);
  await sleep(1500);
  check("prep counting down from 0:30", ["0:29", "0:28", "0:27"].includes(await b.evaluate("prepCount.textContent")), await b.evaluate("prepCount.textContent"));
  await b.click("#prepStartBtn");
  check("recording", await b.waitFor("recState === 'recording'", 8000));
  check("tickets and show label disabled while recording", await b.evaluate("timeTicket.disabled && prepTicket.disabled && showLabelBtn.disabled"));
  await sleep(1200);
  check("stopwatch limit / 1:00", (await b.evaluate("swLimit.textContent")) === " / 1:00", await b.evaluate("swLimit.textContent"));
  await sleep(15500);
  await b.click("#finishBtn");
  check("review", await b.waitFor("recState === 'review'", 5000));
  check("tickets enabled in review", await b.evaluate("!timeTicket.disabled && !showLabelBtn.disabled"));
  await b.click("#takeSendBtn");
  check("tickets disabled while uploading", await b.waitFor("timeTicket.disabled && prepTicket.disabled && showLabelBtn.disabled", 3000));
  check("intermission shows", await b.waitFor("intermissionOn && !intermission.hidden", 5000));
  check("tickets disabled during Intermission", await b.evaluate("timeTicket.disabled && appRoot.inert"));
  await b.waitFor("window.__calls.some(u => u.includes('/upload-url'))", 8000);
  const url = await b.evaluate("window.__calls.find(u => u.includes('/upload-url'))");
  check("upload request has timeLimit=60", /[?&]timeLimit=60(&|$)/.test(url), url);
  check("upload request is a WAV", /[?&]format=wav(&|$)/.test(url), url);
  check("Backstage opens", await b.waitFor("currentView === 'backstage'", 20000));
  await b.click("#backToStageBtn");
  await b.waitFor("currentView === 'stage' && !document.body.classList.contains('curtains-closed')", 5000);
  await sleep(900);
  check("tickets enabled again after the result", await b.evaluate("!timeTicket.disabled && !prepTicket.disabled && !showLabelBtn.disabled"));
  check("choices still remembered", (await stored(b)) === '{"time":"60","prep":"30","name":""}', await stored(b));
  await done(b);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
