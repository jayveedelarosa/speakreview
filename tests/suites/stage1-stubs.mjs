// Feature set 2, stage 1: the ticket stubs (Speaking time, Prep time): behaviour, saved choices, no mic, end to end.
// Retired: the comparison with the commit before stage 1 and the old ticket sizes (stage 1b replaced them; see stage1b-ticket).
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
  b.active = () => b.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.name + ':' + document.activeElement.value)");
  b.state = () => b.evaluate(`({ open: !settingsPanel.hidden, which: openSetting, time: timeTicketValue.textContent, prep: prepTicketValue.textContent,
    tLabel: timeTicket.getAttribute("aria-label"), pLabel: prepTicket.getAttribute("aria-label"),
    tExp: timeTicket.getAttribute("aria-expanded"), pExp: prepTicket.getAttribute("aria-expanded") })`);
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
const choice = (name, value) => `.choice:has(input[name=${name}][value="${value}"]) > span`;

// ---------------------------------------------------------------- 3. behaviour
if (!only || only === "behaviour") {
  console.log("\n== laptop behaviour");
  let b = await open(LIVE);
  let s = await b.state();
  check("defaults: No limit and None", s.time === "No limit" && s.prep === "None", `${s.time} / ${s.prep}`);
  check("accessible names", s.tLabel === "Speaking time: No limit. Click to change" && s.pLabel === "Prep time: None. Click to change", s.tLabel);
  check("aria-controls points at the panel", await b.evaluate(`timeTicket.getAttribute("aria-controls") === "settingsPanel" && prepTicket.getAttribute("aria-controls") === "settingsPanel"`));
  check("tickets are real buttons", await b.evaluate(`timeTicket.tagName === "BUTTON" && prepTicket.tagName === "BUTTON"`));

  await b.mouse("#timeTicket");
  s = await b.state();
  check("time ticket opens only Speaking time", s.open && s.which === "time" && s.tExp === "true" && s.pExp === "false" && await b.evaluate("!timePage.hidden && prepPage.hidden"));
  check("panel labelled by its title", await b.evaluate(`settingsPanel.getAttribute("aria-labelledby") === "speakingTimeLabel" && settingsPanel.getAttribute("role") === "dialog"`));
  check("focus on the checked choice", (await b.active()) === "timeLimit:0", await b.active());
  check("help text", await b.evaluate(`timePage.querySelector(".panel-help").textContent === "How long your speech should last. Going over is fine."`));
  check("Done hidden until Custom", !(await b.evaluate("settingsDoneBtn.getClientRects().length > 0")));
  await b.mouse("#prepSetting");
  s = await b.state();
  check("other ticket switches to Prep time", s.open && s.which === "prep" && s.tExp === "false" && s.pExp === "true" && await b.evaluate("timePage.hidden && !prepPage.hidden"));
  check("prep help text", await b.evaluate(`prepPage.querySelector(".panel-help").textContent === "Thinking time before recording starts."`));
  await b.mouse("#prepSetting");
  s = await b.state();
  check("clicking the open ticket closes it", !s.open && s.pExp === "false");

  await b.mouse("#timeTicket");
  await b.mouse(choice("timeLimit", 180));
  await sleep(100);
  s = await b.state();
  check("mouse pick closes and updates the ticket", !s.open && s.time === "3 minutes" && s.tLabel === "Speaking time: 3 minutes. Click to change", JSON.stringify(s));
  check("focus back on the ticket after a pick", (await b.active()) === "timeTicket", await b.active());
  check("saved after a pick", (await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)) === '{"time":"180","prep":"0"}');
  check("length logic sees 180", await b.evaluate("getTimeLimit().seconds === 180"));

  await b.mouse("#timeTicket");
  await b.key("Escape");
  s = await b.state();
  check("Escape closes, focus back on ticket", !s.open && (await b.active()) === "timeTicket");

  await b.mouse("#prepSetting");
  await b.mouseAt(290, 460);       // empty stage beside the tickets, nothing focusable there
  await sleep(100);
  s = await b.state();
  check("outside click closes, focus back on ticket", !s.open && (await b.active()) === "prepSetting", await b.active());

  await b.mouse("#prepSetting");
  await b.mouse("#topicInput");
  check("outside click on a field closes and leaves focus there", !(await b.state()).open && (await b.active()) === "topicInput", await b.active());

  // Keyboard: arrows move, Enter / Space pick
  await b.evaluate("timeTicket.focus()");
  await b.key("Enter");
  s = await b.state();
  check("Enter on ticket opens it", s.open && s.which === "time");
  await b.key("ArrowRight");
  s = await b.state();
  check("arrow key changes choice but keeps panel open", s.open && s.time === "5 minutes", s.time);
  await b.key("ArrowLeft");
  await b.key("Enter");
  await sleep(100);
  s = await b.state();
  check("Enter picks and closes", !s.open && s.time === "3 minutes" && (await b.active()) === "timeTicket", `${s.time} ${await b.active()}`);
  await b.evaluate("prepTicket.focus()");
  await b.key(" ");
  await sleep(100);
  check("Space on ticket opens prep", (await b.state()).which === "prep");
  await b.key("ArrowRight");
  await b.key(" ");
  await sleep(150);
  s = await b.state();
  check("Space picks and closes (and does not reopen)", !s.open && s.prep === "30 seconds" && (await b.active()) === "prepSetting", `${JSON.stringify(s)} ${await b.active()}`);
  check("line under the mic follows prep", (await b.evaluate("actionText.textContent")) === "Tap the mic to begin. You get 30 seconds to prepare, then recording starts.");

  // Tab away on laptop closes it
  await b.mouse("#timeTicket");
  for (let i = 0; i < 30 && (await b.state()).open; i++) await b.key("Tab");
  check("tabbing out of the panel closes it", !(await b.state()).open);

  // Custom
  await b.mouse("#timeTicket");
  await b.mouse(choice("timeLimit", "custom"));
  s = await b.state();
  check("Custom keeps it open with the controls and Done", s.open && await b.evaluate("!customTime.hidden && settingsDoneBtn.getClientRects().length > 0"));
  check("Custom default 2:00 shown as 2 minutes", s.time === "2 minutes", s.time);
  const setCustom = (mm, ss) => b.evaluate(`customMinutes.value = "${mm}"; customSeconds.value = "${ss}"; customMinutes.dispatchEvent(new Event("input")); customSeconds.dispatchEvent(new Event("input")); timeTicketValue.textContent`);
  const storedBefore = JSON.parse(await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)).time;
  check("0:20 rejected", (await setCustom(0, 20)) === "Custom" && (await b.evaluate("customTimeError.textContent")) === "Choose a time between 0:30 and 10:00.");
  await b.mouse("#settingsDoneBtn");
  check("Done with an invalid time stays open, focus on Minutes", (await b.state()).open && (await b.active()) === "customMinutes");
  check("10:01 rejected", (await setCustom(10, 1)) === "Custom");
  check("stored time unchanged while invalid", JSON.parse(await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)).time === storedBefore, storedBefore);
  check("0:45 shows 45 seconds", (await setCustom(0, 45)) === "45 seconds");
  check("4:00 shows 4 minutes", (await setCustom(4, 0)) === "4 minutes");
  check("2:30 shows 2 min 30 sec", (await setCustom(2, 30)) === "2 min 30 sec");
  await b.mouse('.stepper-btn[data-target="customSeconds"][data-step="1"]');
  check("stepper updates ticket and storage", (await b.state()).time === "2 min 31 sec" && JSON.parse(await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)).time === "151");
  await setCustom(2, 30);
  await b.mouse("#settingsDoneBtn");
  s = await b.state();
  check("Done closes, focus back on the ticket", !s.open && (await b.active()) === "timeTicket" && s.tLabel === "Speaking time: 2 min 30 sec. Click to change", s.tLabel);
  check("saved custom as 150 seconds", (await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)) === '{"time":"150","prep":"30"}');
  await done(b);

  console.log("\n== phone behaviour");
  b = await open(LIVE, { width: 390, height: 780 });
  s = await b.state();
  check("phone names say Tap", s.tLabel === "Speaking time: No limit. Tap to change", s.tLabel);
  await b.mouse("#timeTicket");
  check("sheet is modal with a backdrop", await b.evaluate(`settingsPanel.getAttribute("aria-modal") === "true" && !settingsBackdrop.hidden`));
  check("focus inside the sheet", await b.evaluate("settingsPanel.contains(document.activeElement)"));
  let escaped = false;
  for (let i = 0; i < 12; i++) { await b.key("Tab"); if (!(await b.evaluate("settingsPanel.contains(document.activeElement)"))) escaped = true; }
  for (let i = 0; i < 12; i++) { await b.key("Tab", true); if (!(await b.evaluate("settingsPanel.contains(document.activeElement)"))) escaped = true; }
  check("Tab and Shift+Tab stay inside the sheet", !escaped);
  await b.mouse(choice("timeLimit", "custom"));
  escaped = false;
  for (let i = 0; i < 14; i++) { await b.key("Tab"); if (!(await b.evaluate("settingsPanel.contains(document.activeElement)"))) escaped = true; }
  check("Tab stays inside with Custom open", !escaped);
  await b.mouse(choice("timeLimit", 60));
  s = await b.state();
  check("phone pick closes, ticket says 1 minute", !s.open && s.time === "1 minute" && (await b.active()) === "timeTicket");

  // Addition 3: above the tab bar, no page scroll behind
  await b.evaluate(`document.body.style.setProperty("min-height", "3000px")`);
  await b.mouse("#prepSetting");
  await sleep(400);
  const cover = await b.evaluate(`(() => {
    const nav = document.querySelector(".main-nav").getBoundingClientRect();
    const hit = document.elementFromPoint(nav.left + nav.width / 2, nav.top + nav.height / 2);
    const hitTop = document.elementFromPoint(20, 60);
    const sheet = settingsPanel.getBoundingClientRect();
    return { navHit: settingsPanel.contains(hit) || hit === settingsBackdrop, topHit: hitTop === settingsBackdrop, sheetBottom: sheet.bottom, h: innerHeight,
             z: getComputedStyle(document.getElementById("stepTime")).zIndex };
  })()`);
  check("sheet covers the tab bar", cover.navHit && Math.abs(cover.sheetBottom - cover.h) < 1, JSON.stringify(cover));
  check("backdrop covers the rest of the page", cover.topHit);
  check("page is at the top before the wheel", (await b.evaluate("scrollY")) === 0);
  await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 100, deltaX: 0, deltaY: 600 });
  await sleep(400);
  check("wheel does not scroll the page behind", (await b.evaluate("scrollY")) === 0, await b.evaluate("scrollY"));
  check("page overflow hidden while open", (await b.evaluate("getComputedStyle(document.documentElement).overflowY")) === "hidden");
  const [bx, by] = [195, 60];
  await b.mouseAt(bx, by);
  s = await b.state();
  check("tapping the backdrop closes, focus back on ticket", !s.open && (await b.active()) === "prepSetting", await b.active());
  await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 300, deltaX: 0, deltaY: 600 });
  await sleep(500);
  check("wheel scrolls the page again after closing", (await b.evaluate("scrollY")) > 0 && !(await b.evaluate(`document.documentElement.classList.contains("settings-lock")`)));
  await b.evaluate("window.scrollTo(0, 0)");
  await b.mouse("#prepSetting");
  // The sheet slides up when it opens: tap Done only once it is open and two readings 100ms apart agree
  const doneBox = () => b.evaluate(`!settingsPanel.hidden && JSON.stringify(settingsDoneBtn.getBoundingClientRect())`);
  let box = await doneBox();
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    const next = await doneBox();
    const settled = next && next === box;
    box = next;
    if (settled) break;
  }
  await b.mouse("#settingsDoneBtn");
  check("phone Done closes", !(await b.state()).open && (await b.active()) === "prepSetting" && !(await b.evaluate(`document.documentElement.classList.contains("settings-lock")`)));
  await b.mouse("#prepSetting");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  check("crossing the breakpoint closes it and unlocks scrolling", !(await b.state()).open && !(await b.evaluate(`document.documentElement.classList.contains("settings-lock")`)));
  check("names switch to Click", (await b.state()).tLabel.endsWith("Click to change"));
  await done(b);

  console.log("\n== reduced motion");
  b = await open(LIVE);
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.mouse("#timeTicket");
  check("laptop panel has no animation", (await b.evaluate("getComputedStyle(settingsPanel).animationName")) === "none");
  await b.key("Escape");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  await b.mouse("#timeTicket");
  check("phone sheet and backdrop have no animation", (await b.evaluate("getComputedStyle(settingsPanel).animationName + getComputedStyle(settingsBackdrop).animationName")) === "nonenone");
  await done(b);
}

// ---------------------------------------------------------------- 4. storage
if (!only || only === "storage") {
  console.log("\n== restoring saved choices");
  const KEY = "speakreview.settings.v1";
  const preset = v => `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(v)});`;
  const cases = [
    ['{"time":"180","prep":"30"}', "180", "30", "3 minutes", "30 seconds"],
    ['{"time":"60","prep":"0"}', "60", "0", "1 minute", "None"],
    ['{"time":"300","prep":"120"}', "300", "120", "5 minutes", "2 minutes"],
    ['{"time":"150","prep":"60"}', "custom", "60", "2 min 30 sec", "1 minute", [2, 30]],
    ['{"time":"240","prep":"0"}', "custom", "0", "4 minutes", "None", [4, 0]],
    ['{"time":"30","prep":"0"}', "custom", "0", "30 seconds", "None", [0, 30]],
    ['{"time":"600","prep":"0"}', "custom", "0", "10 minutes", "None", [10, 0]],
    ['{"time":"","prep":"120"}', "0", "120", "No limit", "2 minutes"],
    // invalid: each bad field falls back to its default
    ["not json", "0", "0", "No limit", "None"],
    ["[]", "0", "0", "No limit", "None"],
    ["null", "0", "0", "No limit", "None"],
    ['"180"', "0", "0", "No limit", "None"],
    ['{"time":"25","prep":"30"}', "0", "30", "No limit", "30 seconds"],
    ['{"time":"601"}', "0", "0", "No limit", "None"],
    ['{"time":"060","prep":"45"}', "0", "0", "No limit", "None"],
    ['{"time":180,"prep":30}', "0", "0", "No limit", "None"],
    ['{"time":"abc","prep":"45"}', "0", "0", "No limit", "None"],
    ['{"time":" 180","prep":"30 "}', "0", "0", "No limit", "None"],
    ['{"time":"<img src=x onerror=window.__xss=1>","prep":"<b>hi</b>"}', "0", "0", "No limit", "None"],
    ['{"__proto__":{"time":"180"}}', "0", "0", "No limit", "None"]
  ];
  for (const [stored, t, p, tText, pText, mmss] of cases) {
    const b = await open(LIVE, { pre: [preset(stored)] });
    const r = await b.evaluate(`({ t: document.querySelector('input[name=timeLimit]:checked').value, p: document.querySelector('input[name=prepTime]:checked').value,
      tt: timeTicketValue.textContent, pt: prepTicketValue.textContent, mm: customMinutes.value, ss: customSeconds.value,
      action: actionText.textContent, xss: !!window.__xss || !!document.querySelector("#stepTime img, #stepTime b") })`);
    let ok = r.t === t && r.p === p && r.tt === tText && r.pt === pText && !r.xss;
    if (mmss) ok = ok && r.mm === String(mmss[0]) && r.ss === String(mmss[1]);
    check(`stored ${stored}`, ok, JSON.stringify(r));
    if (p === "30") check("  line under the mic follows the restored prep", r.action === "Tap the mic to begin. You get 30 seconds to prepare, then recording starts.");
    check("  no errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors));
    await b.close();
  }

  console.log("\n== storage blocked");
  const BLOCK = `Storage.prototype.getItem = function () { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.setItem = function () { throw new DOMException("blocked", "SecurityError"); };`;
  let b = await open(LIVE, { pre: [BLOCK] });
  check("page loads with defaults", (await b.state()).time === "No limit");
  check("no remember note in the page", await b.evaluate("!document.getElementById('rememberNote') && !document.body.textContent.includes('Remembered')"));
  await b.mouse("#timeTicket");
  await b.mouse(choice("timeLimit", 60));
  check("picking still works", (await b.state()).time === "1 minute" && await b.evaluate("getTimeLimit().seconds === 60"));
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
  check("stored time is 150", JSON.parse(await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)).time === "150");
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
    if (w > 600) {
      const off = await b.evaluate(`(() => { const a = settingsPanel.querySelector(".panel-arrow").getBoundingClientRect(), t = timeTicket.getBoundingClientRect(); return Math.abs(a.left + a.width / 2 - t.left - t.width / 2); })()`);
      check(`${w}x${h} arrow points at the lone ticket`, off < 1.5, off.toFixed(1));
      if (SHOTS) await b.shot(`${SHOTS}/nomic-${w}x${h}-open.png`);
    }
    await done(b);
  }
}

// ---------------------------------------------------------------- 6. end to end
if (!only || only === "e2e") {
  console.log("\n== end to end: 1 minute and 30 seconds prep through the tickets");
  const b = await open(LIVE);
  await b.mouse("#timeTicket");
  await b.mouse(choice("timeLimit", 60));
  await b.mouse("#prepSetting");
  await b.mouse(choice("prepTime", 30));
  const s = await b.state();
  check("tickets show 1 minute and 30 seconds", s.time === "1 minute" && s.prep === "30 seconds");
  check("radios hold the values", await b.evaluate("getTimeLimit().seconds === 60 && getPrepSeconds() === 30"));
  await b.mouse("#micBtn");
  check("prep starts", await b.waitFor("recState === 'prep'", 8000));
  check("prep countdown starts at 0:30", ["0:30", "0:29"].includes(await b.evaluate("prepCount.textContent")), await b.evaluate("prepCount.textContent"));
  check("tickets disabled while preparing", await b.evaluate("timeTicket.disabled && prepTicket.disabled"));
  await b.mouse("#timeTicket");
  check("disabled ticket doesn't open", !(await b.state()).open);
  await sleep(1500);
  check("prep counting down from 0:30", ["0:29", "0:28", "0:27"].includes(await b.evaluate("prepCount.textContent")), await b.evaluate("prepCount.textContent"));
  await b.click("#prepStartBtn");
  check("recording", await b.waitFor("recState === 'recording'", 8000));
  check("tickets disabled while recording", await b.evaluate("timeTicket.disabled && prepTicket.disabled"));
  await sleep(1200);
  check("stopwatch limit / 1:00", (await b.evaluate("swLimit.textContent")) === " / 1:00", await b.evaluate("swLimit.textContent"));
  await sleep(15500);
  await b.click("#finishBtn");
  check("review", await b.waitFor("recState === 'review'", 5000));
  check("tickets enabled in review", await b.evaluate("!timeTicket.disabled"));
  await b.click("#takeSendBtn");
  check("tickets disabled while uploading", await b.waitFor("timeTicket.disabled && prepTicket.disabled", 3000));
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
  check("tickets enabled again after the result", await b.evaluate("!timeTicket.disabled && !prepTicket.disabled"));
  check("choices still remembered", (await b.evaluate(`localStorage.getItem("speakreview.settings.v1")`)) === '{"time":"60","prep":"30"}');
  await done(b);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
