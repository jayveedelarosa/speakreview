// Feature set 3, stage 2: the stage name and Tonight's programme (one paper form for Cast, Runtime and Curtain in).
//   open      opening from the show label, RUNTIME and CURTAIN IN; the red highlight following what is touched
//   time      No limit, − and + snapping, typed times, the exact seconds on the ticket, stopwatch and upload
//   name      the stage name rules, the ticket label, hostile names, never sent
//   storage   stored values field by field, prep 120 becoming 60, storage blocked
//   phone     the sheet fits 390x780 and 360x740, the on-screen keyboard, the focus trap
//   laptop    the paper at 1280x800 and 1366x657 at 125%
//   look      contrast, 44px targets, focus rings, tap highlight, reduced motion, markup
// Every API call is answered by the fake API stub; nothing reaches AWS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep, LIVE, check, finish, only, shot, contrast } from "../lib/page.mjs";
import { API_STUB } from "../lib/cdp.mjs";
import { SITE } from "../lib/paths.mjs";

const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const KEY = "speakreview.settings.v1";
const ERROR = "Pick a time from 0:30 to 10:00.";
const XSS = "<img src=x onerror=window.__xss=1>";
const KEYS = { Enter: [13, "Enter", "\r"], " ": [32, "Space", " "], ArrowRight: [39, "ArrowRight"], ArrowLeft: [37, "ArrowLeft"], Tab: [9, "Tab"], Escape: [27, "Escape"], Shift: [16, "ShiftLeft"] };

// Records every request body's values (so the stage name can be looked for in what is sent)
const BODIES = `(() => {
  window.__sent = [];
  const inner = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const values = opts.body && typeof opts.body.entries === "function" ? [...opts.body.entries()].map(([k, v]) => k + "=" + (typeof v === "string" ? v : v.name)) : [];
    window.__sent.push(String(url) + " " + values.join("&") + " " + JSON.stringify(opts.headers || {}));
    return inner(url, opts);
  };
})();`;

// A stand-in for the browser's visual viewport, so the on-screen keyboard can be imitated:
// __keyboard(300) makes the visible area 300px shorter, __keyboard(0) gives it back
const VIEWPORT = `(() => {
  const listeners = { resize: new Set(), scroll: new Set() };
  let shrink = 0;
  const fake = {
    get width() { return innerWidth; }, get height() { return innerHeight - shrink; },
    offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
    removeEventListener(type, fn) { listeners[type] && listeners[type].delete(fn); }
  };
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  window.__keyboard = px => { shrink = px; listeners.resize.forEach(fn => fn(new Event("resize"))); };
})();`;

async function open({ width = 1280, height = 800, dpr = 1, pre = [], motion = "no-preference" } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: FAKE, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await b.goto(LIVE, [API_STUB, BODIES, ...pre]);
  b.waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(100); }
    return false;
  };
  b.mouseAt = async (x, y) => {
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(120);
  };
  b.mouse = async sel => {
    const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.mouseAt(x, y);
  };
  b.key = async (key, shift = false) => {
    const [code, name, text] = KEYS[key];
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await b.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text } : {}) });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(60);
  };
  // Types into the focused box as a keyboard would (one input event per character)
  b.type = async text => { for (const ch of text) { await b.send("Input.insertText", { text: ch }); await sleep(15); } await sleep(60); };
  // Clears a box and types into it
  b.fill = async (sel, text) => { await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select(); })()`); await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 }); await b.type(text); };
  b.active = () => b.evaluate("(e => e && (e.id || (e.dataset.prep !== undefined ? 'prep:' + e.dataset.prep : e.tagName)))(document.activeElement)");
  b.still = async sel => {
    const box = () => b.evaluate(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`);
    let last = await box();
    for (let i = 0; i < 30; i++) { await sleep(100); const next = await box(); if (next === last) break; last = next; }
  };
  b.ticket = () => b.evaluate(`({ time: timeTicketValue.textContent, prep: prepTicketValue.textContent, show: showLabel.textContent, mm: progMin.value, ss: progSec.value,
    error: progTimeError.textContent, noLimit: progNoLimit.getAttribute("aria-pressed"), seconds: getTimeLimit().seconds, section: programme.dataset.section, open: !programme.hidden })`);
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
const stored = b => b.evaluate(`localStorage.getItem(${JSON.stringify(KEY)})`);
// The section's number box is filled and its label red, the others plain
const HIGHLIGHT = `(() => { const out = {}; document.querySelectorAll(".prog-sec").forEach(s => { const n = getComputedStyle(s.querySelector(".prog-num")), l = getComputedStyle(s.querySelector(".prog-label"));
  out[s.dataset.section] = n.backgroundColor === "rgb(122, 18, 34)" && n.color === "rgb(255, 246, 227)" && l.color === "rgb(122, 18, 34)" ? "on"
    : n.backgroundColor === "rgba(0, 0, 0, 0)" && l.color === "rgb(90, 67, 48)" ? "off" : "odd"; }); return out; })()`;
const lit = (h, which) => Object.entries(h).every(([k, v]) => v === (k === which ? "on" : "off"));

// ---------------------------------------------------------------- opening, and the highlight
if (!only || only === "open") {
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const phone = w <= 600;
    const tag = phone ? "phone" : "laptop";
    console.log(`\n== opening from the three spots (${tag})`);
    const b = await open({ width: w, height: h });
    for (const [opener, section, focus] of [["showLabelBtn", "cast", phone ? "programme" : "progName"], ["timeTicket", "time", "progNoLimit"], ["prepSetting", "prep", "prep:0"]]) {
      await b.mouse("#" + opener);
      await sleep(300);
      const t = await b.ticket();
      const exp = await b.evaluate(`[showLabelBtn, timeTicket, prepTicket].map(e => e.getAttribute("aria-expanded")).join()`);
      const want = ["cast", "time", "prep"].map(s => String(s === section)).join();
      check(`${tag} ${opener} opens the programme on ${section}`, t.open && t.section === section && exp === want, `${t.section} ${exp}`);
      check(`${tag} ${opener}: its section is highlighted`, lit(await b.evaluate(HIGHLIGHT), section), JSON.stringify(await b.evaluate(HIGHLIGHT)));
      check(`${tag} ${opener}: focus on ${focus}`, (await b.active()) === focus, await b.active());
      await b.mouse("#progDoneBtn");
      check(`${tag} ${opener}: DONE closes, focus back on ${opener}`, !(await b.ticket()).open && (await b.active()) === opener, await b.active());
    }
    // The highlight follows the last thing touched
    await b.mouse("#prepSetting");
    await b.still("#programme");
    await b.mouse("#progName");
    check(`${tag} touching the name box moves the highlight to Cast`, lit(await b.evaluate(HIGHLIGHT), "cast") && (await b.ticket()).section === "cast" && (await b.evaluate("showLabelBtn.getAttribute('aria-expanded')")) === "true");
    await b.mouse("#progMin");
    check(`${tag} the minutes box: Runtime`, lit(await b.evaluate(HIGHLIGHT), "time") && (await b.evaluate("timeTicket.getAttribute('aria-expanded')")) === "true");
    await b.mouse('#progPrep [data-prep="30"]');
    check(`${tag} a prep box: Curtain in`, lit(await b.evaluate(HIGHLIGHT), "prep"));
    await b.mouse("#progPlus");
    check(`${tag} +: Runtime`, lit(await b.evaluate(HIGHLIGHT), "time"));
    await b.evaluate("progName.focus()");
    await b.type("A");
    check(`${tag} typing a name: Cast`, lit(await b.evaluate(HIGHLIGHT), "cast"));
    await b.evaluate("progNoLimit.focus()");
    check(`${tag} focusing No limit: Runtime`, lit(await b.evaluate(HIGHLIGHT), "time"));
    await shot(b, `prog-${tag}-open`);
    // Clicking the button of the section on show closes it; the others switch
    await b.mouse("#timeTicket");
    check(`${tag} the button of the section on show closes it, without undoing`, !(await b.ticket()).open && (await b.ticket()).show === "A's show" && (await b.ticket()).time === "3 minutes");
    // Laptop: another button switches the section (the paper is pinned over the show label, so the stubs are
    // used). Phone: the sheet is modal, so a tap on the ticket lands on the backdrop and closes it.
    await b.mouse("#timeTicket");
    await b.still("#programme");
    await b.mouse("#prepSetting");
    if (phone) {
      check(`${tag} a tap on the ticket behind the sheet closes it, focus back on RUNTIME`, !(await b.ticket()).open && (await b.active()) === "timeTicket", await b.active());
    } else {
      check(`${tag} another button switches the section`, (await b.ticket()).open && (await b.ticket()).section === "prep");
      await b.key("Escape");
      check(`${tag} Escape closes, focus back on the button that opened it last`, !(await b.ticket()).open && (await b.active()) === "prepSetting", await b.active());
    }
    await done(b);
  }
}

// ---------------------------------------------------------------- the time
if (!only || only === "time") {
  console.log("\n== No limit, − and +, typed times");
  const b = await open();
  await b.mouse("#timeTicket");
  let t = await b.ticket();
  check("starts with No limit ticked and 03:00 waiting", t.noLimit === "true" && t.seconds === null && t.mm === "03" && t.ss === "00" && await b.evaluate("programme.classList.contains('no-limit')"), JSON.stringify(t));
  await b.mouse("#progNoLimit");
  t = await b.ticket();
  check("unticking No limit brings 3:00 (the default)", t.noLimit === "false" && t.seconds === 180 && t.time === "3 minutes" && !(await b.evaluate("programme.classList.contains('no-limit')")));
  for (let i = 0; i < 3; i++) await b.mouse("#progPlus");
  t = await b.ticket();
  check("+ three times: 4:30", t.seconds === 270 && t.time === "4 min 30 sec" && t.mm === "04" && t.ss === "30", JSON.stringify(t));
  await b.mouse("#progNoLimit");
  t = await b.ticket();
  check("ticking No limit: No limit on the ticket, 04:30 still shown", t.seconds === null && t.time === "No limit" && t.mm === "04" && t.ss === "30");
  check("  stored as no limit", JSON.parse(await stored(b)).time === "");
  await b.mouse("#progNoLimit");
  check("unticking it again brings back 4:30, not 3:00", (await b.ticket()).seconds === 270);
  await b.mouse("#progNoLimit");
  await b.mouse("#progMinus");
  t = await b.ticket();
  check("− while No limit is ticked only unticks it (4:30 stays)", t.seconds === 270 && t.noLimit === "false");

  // Snapping to the half minute
  // Both boxes at once (typing one box at a time would pass through other valid times on the way)
  const typed = async (mm, ss) => { await b.evaluate(`progMin.value = "${mm}"; progSec.value = "${ss}"; progSec.focus(); progSec.dispatchEvent(new Event("input", { bubbles: true })); true`); return b.ticket(); };
  const steps = [["03", "15", "#progPlus", 210], ["03", "15", "#progMinus", 180], ["00", "45", "#progMinus", 30], ["00", "30", "#progMinus", 30],
    ["09", "45", "#progPlus", 600], ["10", "00", "#progPlus", 600], ["02", "00", "#progPlus", 150], ["02", "00", "#progMinus", 90]];
  for (const [mm, ss, btn, want] of steps) {
    await typed(mm, ss);
    await b.mouse(btn);
    t = await b.ticket();
    check(`${mm}:${ss} then ${btn === "#progPlus" ? "+" : "−"} gives ${Math.floor(want / 60)}:${String(want % 60).padStart(2, "0")}`, t.seconds === want && t.mm === String(Math.floor(want / 60)).padStart(2, "0") && t.ss === String(want % 60).padStart(2, "0"), JSON.stringify(t));
  }

  // Typed times
  t = await typed("04", "45");
  check("typed 4:45: used right away", t.seconds === 285 && t.time === "4 min 45 sec" && t.error === "" && JSON.parse(await stored(b)).time === "285", JSON.stringify(t));
  for (const [mm, ss] of [["00", "20"], ["10", "01"], ["07", "61"], ["11", "00"]]) {
    t = await typed(mm, ss);
    const invalid = await b.evaluate(`progMin.getAttribute("aria-invalid") === "true" && progTimeError.getAttribute("role") === "alert" && progTimeError.getClientRects().length > 0`);
    check(`typed ${mm}:${ss}: the error shows and 4:45 stays in use`, t.error === ERROR && invalid && t.seconds === 285 && t.time === "4 min 45 sec" && JSON.parse(await stored(b)).time === "285", JSON.stringify(t));
  }
  await b.fill("#progMin", "ab");
  t = await b.ticket();
  check("letters can't be typed (the box empties), the error shows, 4:45 stays", t.mm === "" && t.error === ERROR && t.seconds === 285, JSON.stringify(t));
  await b.evaluate("progDoneBtn.focus()");
  t = await b.ticket();
  check("leaving the boxes puts back 04:45 and clears the error", t.mm === "04" && t.ss === "45" && t.error === "", JSON.stringify(t));
  await b.fill("#progSec", "7");
  await b.evaluate("progPlus.focus()");
  check("a one-digit time is written back with two digits", (await b.ticket()).ss === "07" && (await b.ticket()).seconds === 247);
  // The cursor moves on after two minute digits
  await b.fill("#progMin", "05");
  check("after two minute digits the cursor is in the seconds box, selected", (await b.active()) === "progSec" && await b.evaluate("progSec.selectionStart === 0 && progSec.selectionEnd === progSec.value.length"), await b.active());
  await b.type("30");
  check("typing on gives 5:30", (await b.ticket()).seconds === 330);
  // Typing a valid time ticks off No limit
  await b.mouse("#progNoLimit");
  t = await typed("01", "15");
  check("typing a valid time while No limit is ticked unticks it", t.noLimit === "false" && t.seconds === 75 && t.time === "1 min 15 sec");
  // Closing with an unfinished time keeps the last valid one
  await b.fill("#progSec", "9");
  await b.fill("#progMin", "");
  await b.key("Escape");
  t = await b.ticket();
  check("Escape with an unfinished time: boxes back to 01:09", !t.open && t.mm === "01" && t.ss === "09" && t.error === "" && t.seconds === 69, JSON.stringify(t));
  await done(b);

  console.log("\n== the exact seconds reach the stopwatch and the upload");
  const r = await open();
  await r.mouse("#timeTicket");
  await r.fill("#progMin", "02");
  await r.fill("#progSec", "47");
  await r.mouse("#progDoneBtn");
  check("ticket shows 2 min 47 sec", (await r.ticket()).time === "2 min 47 sec");
  await r.evaluate("micBtn.click()");
  check("recording", await r.waitFor("recState === 'recording'", 10000));
  await sleep(1200);
  check("stopwatch limit / 2:47", (await r.evaluate("swLimit.textContent")) === " / 2:47", await r.evaluate("swLimit.textContent"));
  check("stopwatch pill counts down from 2:47", /^2:4[56] left$/.test(await r.evaluate("swPill.textContent")), await r.evaluate("swPill.textContent"));
  await sleep(15500);
  await r.evaluate("finishBtn.click()");
  check("review", await r.waitFor("recState === 'review'", 5000));
  check("the take's line shows the 2:47 limit", (await r.evaluate("takeLengthLine.textContent")).includes("/ Limit: 2:47"), await r.evaluate("takeLengthLine.textContent"));
  await r.evaluate("takeSendBtn.click()");
  await r.waitFor("window.__calls.some(u => u.includes('/upload-url'))", 8000);
  const url = await r.evaluate("window.__calls.find(u => u.includes('/upload-url'))");
  check("upload request has timeLimit=167", /[?&]timeLimit=167(&|$)/.test(url), url);
  check("Backstage opens", await r.waitFor("currentView === 'backstage'", 20000));
  await done(r);
}

// ---------------------------------------------------------------- the stage name
if (!only || only === "name") {
  console.log("\n== the stage name");
  const b = await open({ pre: [`window.__xss = 0;`] });
  check("no name: Tonight's show, × hidden, 0 / 16", (await b.ticket()).show === "Tonight's show" && await b.evaluate(`progNameClear.hidden && progNameCount.textContent === "0 / 16"`));
  check("no name: the button's name", (await b.evaluate("showLabelBtn.getAttribute('aria-label')")) === "No stage name yet. Click to open tonight's programme");
  await b.mouse("#showLabelBtn");
  await b.type("Jayvee");
  let t = await b.ticket();
  check("typed Jayvee: Jayvee's show on the ticket right away", t.show === "Jayvee's show" && await b.evaluate(`progNameCount.textContent === "6 / 16" && !progNameClear.hidden`), t.show);
  check("  the button's name", (await b.evaluate("showLabelBtn.getAttribute('aria-label')")) === "Stage name: Jayvee. Click to open tonight's programme");
  check("  shown in uppercase by CSS only", (await b.evaluate("getComputedStyle(showLabelBtn).textTransform")) === "uppercase" && t.show === "Jayvee's show");
  check("  saved", JSON.parse(await stored(b)).name === "Jayvee");
  await b.evaluate("clearTopicBtn.click()");
  check("Speak freely with a name: Jayvee's open mic", (await b.ticket()).show === "Jayvee's open mic");
  await b.evaluate("randomTopicBtn.click()");
  await b.waitFor("!isRolling", 3000);
  check("rolling a topic: back to Jayvee's show", (await b.ticket()).show === "Jayvee's show");
  check("the programme is still open", (await b.ticket()).open);
  const cases = [
    ["James", "James", "James's show"],
    ["Jay!vee<>@#", "Jayvee", "Jayvee's show"],
    ["ABCDEFGHIJKLMNOPQRS", "ABCDEFGHIJKLMNOP", "ABCDEFGHIJKLMNOP's show"],
    ["Ana   Lu", "Ana Lu", "Ana Lu's show"],
    ["   Ana", "Ana", "Ana's show"],
    ["O’Neil-Smith", "O’Neil-Smith", "O’Neil-Smith's show"],
    ["D'Arcy 2", "D'Arcy 2", "D'Arcy 2's show"],
    ["Zoë Ñúñez", "Zoë Ñúñez", "Zoë Ñúñez's show"],
    ["ज़ोया", "ज़ोया", "ज़ोया's show"],
    ["李小龍", "李小龍", "李小龍's show"],
    ["Ana ", "Ana ", "Ana's show"],
    [XSS, "img srcx onerror", "img srcx onerror's show"]
  ];
  for (const [typed, field, show] of cases) {
    await b.fill("#progName", typed);
    t = await b.ticket();
    const f = await b.evaluate("progName.value");
    check(`typed ${JSON.stringify(typed)}: field ${JSON.stringify(field)}, ticket ${JSON.stringify(show)}`, f === field && t.show === show, `${JSON.stringify(f)} / ${JSON.stringify(t.show)}`);
  }
  check("the hostile name made no element and ran nothing", await b.evaluate(`showLabel.children.length === 0 && !document.querySelector("#stepTopic img, #programme img") && !window.__xss`));
  // Set straight on the field (as a paste would), with characters typing can't make
  await b.evaluate(`progName.value = ${JSON.stringify(XSS + "\t\n")}; progName.dispatchEvent(new Event("input", { bubbles: true })); true`);
  check("set straight on the field: cleaned the same way", (await b.evaluate("progName.value")) === "img srcx onerror" && (await b.ticket()).show === "img srcx onerror's show");
  // A caret in the middle stays in place when a symbol is removed
  await b.fill("#progName", "Jayvee");
  await b.evaluate("progName.setSelectionRange(3, 3)");
  await b.type("!");
  check("removing a typed symbol keeps the cursor where it was", await b.evaluate(`progName.value === "Jayvee" && progName.selectionStart === 3`));
  // × removes the name
  await b.mouse("#progNameClear");
  t = await b.ticket();
  check("× removes the name: Tonight's show, × hidden, focus in the name box", t.show === "Tonight's show" && await b.evaluate(`progNameClear.hidden && progName.value === "" && document.activeElement === progName`) && JSON.parse(await stored(b)).name === "");
  // Never sent (a name found nowhere else: the bucket's address itself contains "jayvee")
  await b.fill("#progName", "Zelphine");
  await b.key("Escape");
  await b.evaluate(`(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
    const dt = new DataTransfer(); dt.items.add(new File([buildWav([toPcm16(x, n)], n)], "a.wav", { type: "audio/wav" }));
    dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
  await b.waitFor("!!preparedUpload && !uploadBtn.disabled", 20000);
  await b.evaluate("uploadBtn.click()");
  await b.waitFor("currentView === 'backstage' && !intermissionOn", 30000);
  const sent = await b.evaluate("window.__sent");
  check("the upload went out", sent.some(s => s.includes("/upload-url")) && sent.some(s => s.includes(".s3.")), sent.length);
  check("the stage name is in no request (address, form fields or headers)", sent.length > 0 && sent.every(s => !/zelphine/i.test(s)), sent.join(" | ").slice(0, 300));
  check("the name is still on the ticket after the show", (await b.ticket()).show === "Zelphine's show");
  await done(b);
}

// ---------------------------------------------------------------- storage
if (!only || only === "storage") {
  console.log("\n== stored values");
  const preset = v => `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(v)});`;
  let b = await open({ pre: [preset('{"time":"","prep":"120","name":"Jayvee"}')] });
  await b.mouse("#prepSetting");
  check("prep 120: 1 min is ticked", await b.evaluate(`document.querySelector('#progPrep [data-prep="60"]').getAttribute("aria-checked") === "true" && prepTicketValue.textContent === "1 minute"`));
  check("  and stored as 60, the name kept", (await stored(b)) === '{"time":"","prep":"60","name":"Jayvee"}', await stored(b));
  check("  the 2 minutes choice is gone", await b.evaluate(`[...document.querySelectorAll("#progPrep [role=radio]")].map(e => e.textContent.trim()).join() === "None,30 sec,1 min"`));
  // Arrow keys wrap round the three choices
  await b.key("ArrowRight");
  check("ArrowRight from 1 min wraps to None", (await b.active()) === "prep:0" && (await b.ticket()).prep === "None");
  await b.key("ArrowLeft");
  check("ArrowLeft from None wraps to 1 min", (await b.active()) === "prep:60" && (await b.ticket()).prep === "1 minute");
  check("only the ticked choice is a Tab stop", await b.evaluate(`[...document.querySelectorAll("#progPrep [role=radio]")].map(e => e.tabIndex).join() === "-1,-1,0"`));
  await done(b);

  for (const [data, want] of [
    ['{"time":"9999","prep":"abc","name":"Ana"}', { seconds: null, prep: "None", show: "Ana's show" }],
    ['{"time":"200","prep":"30","name":{"x":1}}', { seconds: 200, prep: "30 seconds", show: "Tonight's show" }],
    ['{"time":"95","prep":30,"name":"Bo"}', { seconds: 95, prep: "None", show: "Bo's show" }],
    [`{"name":${JSON.stringify(XSS)}}`, { seconds: null, prep: "None", show: "img srcx onerror's show" }]
  ]) {
    b = await open({ pre: [preset(data), "window.__xss = 0;"] });
    const t = await b.ticket();
    check(`stored ${data}: each field on its own`, t.seconds === want.seconds && t.prep === want.prep && t.show === want.show && await b.evaluate("!window.__xss && showLabel.children.length === 0 && progName.value === showLabel.textContent.replace(/'s show$/, '').replace(/^Tonight$/, '')"), JSON.stringify(t));
    await b.close();
  }

  console.log("\n== storage blocked");
  const BLOCK = `Storage.prototype.getItem = function () { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.setItem = function () { throw new DOMException("blocked", "SecurityError"); };`;
  b = await open({ pre: [BLOCK] });
  await b.mouse("#showLabelBtn");
  await b.type("Ana");
  await b.mouse("#progNoLimit");
  await b.mouse('#progPrep [data-prep="30"]');
  const t = await b.ticket();
  check("everything works, nothing remembered", t.show === "Ana's show" && t.seconds === 180 && t.prep === "30 seconds");
  await done(b);
}

// ---------------------------------------------------------------- phones
if (!only || only === "phone") {
  for (const [w, h] of [[390, 780], [360, 740]]) {
    console.log(`\n== phone ${w}x${h}`);
    const b = await open({ width: w, height: h, pre: [VIEWPORT] });
    for (const opener of ["showLabelBtn", "timeTicket", "prepSetting"]) {
      await b.mouse("#" + opener);
      await b.still("#programme");
      const r = await b.evaluate(`(() => { const p = programme.getBoundingClientRect(), d = progDoneBtn.getBoundingClientRect();
        return { top: p.top, bottom: p.bottom, h: innerHeight, inner: programme.scrollHeight - programme.clientHeight, page: scrollY, hScroll: document.documentElement.scrollWidth > innerWidth,
          done: d.bottom <= innerHeight && d.top >= p.top, left: p.left, right: p.right }; })()`);
      check(`${w}x${h} ${opener}: the whole sheet fits, no scrolling inside or behind`, r.top >= 0 && Math.abs(r.bottom - r.h) < 1 && r.inner <= 0 && r.page === 0 && !r.hScroll && r.done && r.left === 0 && r.right === w, JSON.stringify(r));
      await shot(b, `prog-${w}x${h}-${opener}`);
      await b.mouse("#progDoneBtn");
    }
    // A long name on the ticket: two lines at most, inside the ticket
    await b.evaluate(`progName.value = "Maximilianoooooo"; progName.dispatchEvent(new Event("input", { bubbles: true })); clearTopicBtn.click(); true`);
    await sleep(150);
    await shot(b, `prog-${w}x${h}-long-name`);
    check(`${w}x${h} no page scroll with a long name on the ticket`, await b.evaluate("document.documentElement.scrollHeight <= innerHeight"));

    // The on-screen keyboard: the focused box stays above it
    await b.mouse("#showLabelBtn");
    await b.still("#programme");
    await b.mouse("#progName");
    await b.evaluate("__keyboard(300)");
    await sleep(150);
    const inView = sel => b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(), p = programme.getBoundingClientRect();
      return { ok: r.top >= p.top && r.bottom <= innerHeight - 300 + 0.5 && r.top >= 0, top: Math.round(r.top), bottom: Math.round(r.bottom), sheetBottom: Math.round(p.bottom), sheetTop: Math.round(p.top) }; })()`);
    let k = await inView("#progName");
    check(`${w}x${h} keyboard open: the sheet sits on it and the name box is in view`, k.ok && Math.abs(k.sheetBottom - (h - 300)) <= 1 && k.sheetTop >= 0, JSON.stringify(k));
    await shot(b, `prog-${w}x${h}-keyboard-name`);
    await b.evaluate("progSec.focus()");
    await sleep(150);
    k = await inView("#progSec");
    check(`${w}x${h} keyboard open: the seconds box is in view`, k.ok, JSON.stringify(k));
    await shot(b, `prog-${w}x${h}-keyboard-time`);
    await b.evaluate("__keyboard(0)");
    await sleep(150);
    const back = await b.evaluate(`(() => { const p = programme.getBoundingClientRect(); return { bottom: p.bottom, cls: programme.classList.contains("over-keyboard") }; })()`);
    check(`${w}x${h} keyboard closed: the sheet is back at the bottom`, Math.abs(back.bottom - h) < 1 && !back.cls, JSON.stringify(back));
    // Tab stays inside, and DONE gives focus back
    let escaped = false;
    for (let i = 0; i < 14; i++) { await b.key("Tab"); if (!(await b.evaluate("programme.contains(document.activeElement)"))) escaped = true; }
    for (let i = 0; i < 14; i++) { await b.key("Tab", true); if (!(await b.evaluate("programme.contains(document.activeElement)"))) escaped = true; }
    check(`${w}x${h} focus stays inside the sheet`, !escaped);
    await b.evaluate("__keyboard(300)");
    await b.evaluate("progDoneBtn.click()");
    check(`${w}x${h} closing with the keyboard up resets the sheet`, await b.evaluate(`programme.hidden && !programme.classList.contains("over-keyboard") && document.activeElement === showLabelBtn`));
    await b.evaluate("__keyboard(0)");
    await done(b);
  }
}

// ---------------------------------------------------------------- laptops
if (!only || only === "laptop") {
  for (const [w, h, dpr] of [[1280, 800, 1], [1093, 526, 1.25]]) {
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    console.log(`\n== laptop ${tag}`);
    const b = await open({ width: w, height: h, dpr });
    for (const opener of ["showLabelBtn", "timeTicket", "prepSetting"]) {
      await b.evaluate("window.scrollTo(0, 0)");
      await b.mouse("#" + opener);
      await b.still("#programme");
      const r = await b.evaluate(`(() => { const p = programme.getBoundingClientRect(), hd = document.querySelector(".site-header .logo").getBoundingClientRect(), pv = privacyBtn.getBoundingClientRect();
        const bar = document.querySelector(".main-nav"), br = bar.getBoundingClientRect(), barShown = getComputedStyle(bar).display !== "none" && br.height > 0;
        const over = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
        return { inside: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight, header: over(p, hd) || over(p, pv), bar: barShown && over(p, br),
          inner: document.querySelector(".prog-form").scrollHeight > document.querySelector(".prog-form").clientHeight, top: Math.round(p.top), bottom: Math.round(p.bottom) }; })()`);
      check(`${tag} ${opener}: the whole paper in the window, clear of the logo, Privacy and the bottom bar`, r.inside && !r.header && !r.bar, JSON.stringify(r));
      if (w === 1280) check(`${tag} ${opener}: the form doesn't need to scroll`, !r.inner);
      // DONE can always be reached (scrolled into view inside the form on very short windows)
      await b.evaluate(`progDoneBtn.scrollIntoView({ block: "nearest" })`);
      const d = await b.evaluate(`(() => { const r = progDoneBtn.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return document.elementFromPoint(x, y) === progDoneBtn || progDoneBtn.contains(document.elementFromPoint(x, y)); })()`);
      check(`${tag} ${opener}: DONE can be reached and clicked`, d);
      await shot(b, `prog-${tag}-${opener}`);
      await b.mouse("#progDoneBtn");
      check(`${tag} ${opener}: closed`, !(await b.ticket()).open);
    }
    await done(b);
  }
}

// ---------------------------------------------------------------- look
if (!only || only === "look") {
  // Contrast worked out from the colours: text against the darkest paper it can sit on (the bottom of the paper's
  // gradient under its faint lines, and the header's tint), and the filled number box
  const RATIO = `(() => {
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const over = (top, a, under) => under.map((u, i) => top[i] * a + u * (1 - a));
    const paper = over([110, 80, 40], 0.03, [234, 217, 182]);
    const header = over([42, 26, 14], 0.05, paper);
    const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
    const opacity = e => { let o = 1; for (let n = e; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
    const out = [];
    for (const e of programme.querySelectorAll(".prog-company, .prog-title, .prog-formno-label, .prog-formno-value, .prog-label, .prog-note, .prog-line, .prog-count, .prog-check, .prog-or, .prog-step, .prog-digits, .prog-unit, .prog-colon, .prog-error, .prog-privacy, .prog-done, .prog-name")) {
      if (!e.getClientRects().length) continue;
      const c = getComputedStyle(e).color.match(/[\\d.]+/g).map(Number);
      const bg = e.closest(".prog-num") ? [122, 18, 34] : (e.closest(".prog-header") ? header : paper);
      out.push([e.className.baseVal === undefined ? e.className + (e.id ? "#" + e.id : "") : "", +ratio(c, bg).toFixed(2), opacity(e)]);
    }
    for (const e of programme.querySelectorAll(".prog-num")) {
      const s = getComputedStyle(e), c = s.color.match(/[\\d.]+/g).map(Number), b = s.backgroundColor.match(/[\\d.]+/g).map(Number);
      out.push(["prog-num " + e.textContent, +ratio(c, b[3] === 0 ? paper : b).toFixed(2), 1]);
    }
    const ph = getComputedStyle(progName, "::placeholder").color.match(/[\\d.]+/g).map(Number);
    out.push(["placeholder", +ratio(ph, paper).toFixed(2), 1]);
    return out; })()`;
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const tag = w <= 600 ? "phone" : "laptop";
    console.log(`\n== look (${tag})`);
    const b = await open({ width: w, height: h });
    const hit = await b.evaluate(`(() => { const r = showLabelBtn.getBoundingClientRect(), x = r.left + 20, y = r.top + r.height / 2; return [-21, 21].every(d => showLabelBtn.contains(document.elementFromPoint(x, y + d))); })()`);
    check(`${tag} the 28px show label answers taps across 44px`, hit);
    await b.mouse("#timeTicket");
    await b.still("#programme");
    await b.evaluate(`progTimeError.textContent = ${JSON.stringify(ERROR)}; true`);   // so the error line is measured too
    for (const state of ["No limit ticked (dimmed time)", "a time set"]) {
      if (state === "a time set") await b.mouse("#progNoLimit");
      const res = await b.evaluate(RATIO);
      const bad = res.filter(([, r, o]) => r < 4.5 || o !== 1);
      check(`${tag} ${state}: every text on the paper >= 4.5:1 at full opacity`, res.length > 20 && bad.length === 0, bad.length ? JSON.stringify(bad) : `${res.length} items, worst ${Math.min(...res.map(r => r[1]))}`);
    }
    await b.evaluate(`progTimeError.textContent = ""; true`);
    // Measured from the screen as well, for text with clear paper around it (with the tilt off, so the ring
    // around each line doesn't cross the rows next to it)
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await sleep(150);
    const scr = await contrast(b, w, h, [".prog-company", ".prog-title", ".prog-line", ".prog-privacy"]);
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    check(`${tag} measured from the screen: >= 4.5:1`, scr.length >= 4 && scr.every(([, r]) => r >= 4.5), JSON.stringify(scr));
    // Targets
    const small = await b.evaluate(`[...programme.querySelectorAll("button, input")].filter(e => e.getClientRects().length).map(e => [e.id || e.className, e.offsetWidth, e.offsetHeight]).filter(([, w, h]) => w < 44 || h < 44)`);
    check(`${tag} every control on the paper is at least 44x44px`, small.length === 0, JSON.stringify(small));
    // Focus rings and tap highlight
    const rings = [];
    for (const sel of ["#progName", "#progNoLimit", "#progMinus", "#progMin", "#progSec", "#progPlus", '#progPrep [aria-checked="true"]', "#progDoneBtn", "#showLabelBtn"]) {
      await b.key("Shift");
      await b.evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`);
      rings.push(await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), c = getComputedStyle(e);
        return [${JSON.stringify(sel)}, e.matches(":focus-visible"), c.outlineStyle, c.outlineWidth, c.outlineColor, c.webkitTapHighlightColor].join(" "); })()`));
    }
    check(`${tag} burgundy 2px focus rings, no tap highlight`, rings.every(r => r.endsWith("true solid 2px rgb(122, 18, 34) rgba(0, 0, 0, 0)")), rings.join(" | "));
    await done(b);
  }

  console.log("\n== reduced motion");
  const b = await open({ motion: "reduce" });
  await b.mouse("#showLabelBtn");
  check("no tilt on the paper or DONE, no animation", await b.evaluate(`getComputedStyle(programme).transform === "none" && getComputedStyle(progDoneBtn).transform === "none" && getComputedStyle(programme).animationName === "none"`));
  await done(b);

  console.log("\n== markup and wording");
  const html = readFileSync(join(SITE, "index.html"), "utf8");
  const js = readFileSync(join(SITE, "js", "app.js"), "utf8");
  check("no style attributes or inline handlers", !/\sstyle=|\son[a-z]+=/i.test(html));
  check("no em dashes in the page or the script's text", !html.includes("—") && !js.includes("—"));
  check("Caveat 600 loaded from Google Fonts (no other new address)", /fonts\.googleapis\.com\/css2\?family=Caveat:wght@600&amp;family=Fraunces/.test(html));
  check("the programme's wording", ["Tonight's programme", "The SpeakReview Players", "Your stage name", "How long your speech should last. Going over is fine.", "Thinking time before recording starts.",
    "Your stage name stays on this device. It is never sent anywhere.", "Write your name", "Remove my name"].every(t => html.includes(t)) && js.includes("Pick a time from"));
  check("the privacy note mentions the stage name", /An optional stage name can be saved on this device, and it is never sent anywhere\./.test(html));
  check("the stage name never goes into innerHTML", !/innerHTML[^;\n]*(stageName|progName)/.test(js) && !/insertAdjacentHTML[^;\n]*(stageName|progName)/.test(js));
}

finish();
