// Feature set 3, stage 5: Beta tools.
//   stamp    the Beta stamp after the name (header, and the ticket on the phone Stage), its look, tap area and red light
//   note     the note from the producer: focus, Tab, Escape, outside click, the light gone for good, one paper note at a time
//   device   the device code: made once, kept, sent as device=<code> on every GET /upload-url and nowhere else
// Every API call is answered by the fake API stub; nothing reaches AWS.
import { launch, sleep, LIVE, STUB, RESULT, check, finish, only, shot } from "../lib/page.mjs";

const SEEN_KEY = "speakreview.betaSeen.v1";
const FORM = "https://forms.gle/pDd4x4mFGkh8L27L6";
const BLOCK = `Storage.prototype.getItem = function () { throw new DOMException("blocked", "SecurityError"); };
  Storage.prototype.setItem = function () { throw new DOMException("blocked", "SecurityError"); };
  Storage.prototype.removeItem = function () { throw new DOMException("blocked", "SecurityError"); };`;
const KEYS = { Tab: [9, "Tab"], Escape: [27, "Escape"] };
const SIZES = [[1280, 800], [1093, 526], [390, 780]];

async function open({ width = 1280, height = 800, pre = [], motion = "no-preference" } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: [], mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await b.goto(LIVE, [STUB, `window.__result = ${JSON.stringify(RESULT)};`, ...pre]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(60); }
    return false;
  };
  b.mouse = async (sel, dx = 0, dy = 0) => {
    const [x, y] = typeof sel === "string"
      ? await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`)
      : sel;
    if (mobile) {
      await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x + dx, y: y + dy }] });
      await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + dx, y: y + dy });
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x + dx, y: y + dy, button: "left", clickCount: 1 });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", clickCount: 1 });
    }
    await sleep(200);
  };
  b.key = async (key, shift = false) => {
    const [code, name] = KEYS[key];
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(120);
  };
  b.reload = async () => {
    await b.send("Page.reload");
    await sleep(500);
    await b.waitFor("document.readyState === 'complete' && typeof micSupported !== 'undefined'", 15000);
    await sleep(300);
  };
  await b.waitFor("document.readyState === 'complete' && typeof micSupported !== 'undefined'", 15000);
  await sleep(300);
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
// The stamp that shows now (the header's, or the ticket's on the phone Stage)
const SHOWN = `betaStamps.find(s => s.getClientRects().length > 0 && getComputedStyle(s).visibility !== "hidden")`;
const STAMP = `(() => { const s = ${SHOWN}; if (!s) return null; const light = s.nextElementSibling, cs = getComputedStyle(s), ls = getComputedStyle(light);
  return { id: s.id, label: s.getAttribute("aria-label"), expanded: s.getAttribute("aria-expanded"), text: s.textContent, height: Math.round(s.offsetHeight),
    border: [cs.borderTopStyle, cs.borderTopWidth], transform: cs.transform, upper: cs.textTransform, font: [cs.fontSize, cs.fontWeight],
    light: !light.hidden && light.getClientRects().length > 0, lightHidden: light.getAttribute("aria-hidden"), anim: ls.animationName, glow: ls.boxShadow }; })()`;
const NOTE = `(() => { const r = betaNote.getBoundingClientRect(), s = betaOpener && betaOpener.getBoundingClientRect();
  return { open: !betaNote.hidden, focus: document.activeElement && (document.activeElement.id || document.activeElement.className),
    left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width),
    below: s ? r.top > s.bottom : null, seen: (() => { try { return localStorage.getItem(${JSON.stringify(SEEN_KEY)}); } catch (e) { return "blocked"; } })() }; })()`;

// ---------------------------------------------------------------- the stamp
if (!only || only === "stamp") {
  for (const [w, h] of [...SIZES, [360, 740]]) {
    const tag = `${w}x${h}`;
    console.log(`\n== the Beta stamp (${tag})`);
    const b = await open({ width: w, height: h });
    const where = await b.evaluate(`({ brand: [...document.querySelector(".site-header .brand").children].map(e => e.className),
      h1: document.querySelector(".site-header h1").textContent.replace(/\\s+/g, " ").trim(),
      ticket: document.querySelector(".stage-brand .stage-logo").nextElementSibling.className })`);
    check(`${tag}: a stamp right after the name, not part of the heading`, JSON.stringify(where.brand) === '["logo","beta"]' && where.h1 === "SpeakReview" && where.ticket === "beta", JSON.stringify(where));
    const s = await b.evaluate(STAMP);
    check(`${tag}: the Stage shows ${w <= 600 ? "the ticket's" : "the header's"} stamp`, s && s.id === (w <= 600 ? "stageBetaBtn" : "betaBtn"), JSON.stringify(s));
    check(`${tag}: "Beta", 22px, 3px double border, turned, 800 10px uppercase`, s.text === "Beta" && s.height === 22 && s.border[0] === "double" && s.border[1] === "3px"
      && s.transform !== "none" && s.upper === "uppercase" && s.font[0] === "10px" && s.font[1] === "800", JSON.stringify(s));
    check(`${tag}: first visit: the red light shows (hidden from screen readers) and pulses`, s.light && s.lightHidden === "true" && s.anim === "betaLight", JSON.stringify(s));
    check(`${tag}: its name: "Beta, new note from the producer", collapsed`, s.label === "Beta, new note from the producer" && s.expanded === "false");
    if (w <= 600) {
      // Phones: at least 44px to tap, around the middle of the stamp
      const tap = await b.evaluate(`(() => { const s = ${SHOWN}, r = s.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = (dx, dy) => !!(document.elementFromPoint(x + dx, y + dy) || document.body).closest(".beta-stamp");
        return { up: hit(0, -21.5), down: hit(0, 21.5), left: hit(-21.5, 0), right: hit(21.5, 0) }; })()`);
      check(`${tag}: at least 44px to tap`, Object.values(tap).every(Boolean), JSON.stringify(tap));
      await b.evaluate(`goToView("wall"); true`);
      await b.waitFor(`currentView === "wall" && !document.body.classList.contains("curtains-closed") && !appRoot.inert`, 8000);
      await sleep(400);
      const wall = await b.evaluate(STAMP);
      check(`${tag}: on the Wall of Fame the header's stamp shows with the name`, wall && wall.id === "betaBtn", JSON.stringify(wall));
      const gap = await b.evaluate(`(() => { const s = betaBtn.getBoundingClientRect(), p = privacyBtn.getBoundingClientRect(), l = betaBtn.nextElementSibling.getBoundingClientRect();
        return Math.round(p.left - Math.max(s.right, l.right)); })()`);
      check(`${tag}: the stamp and its light clear of Privacy`, gap >= 4, `${gap}px`);
    }
    await shot(b, `beta-stamp-${tag}`);
    await done(b);
  }
  console.log("\n== reduced motion");
  const b = await open({ motion: "reduce" });
  const s = await b.evaluate(STAMP);
  check("reduced motion: the light is steady (no pulse) and still glows", s.light && s.anim === "none" && s.glow !== "none", JSON.stringify(s));
  await done(b);
}

// ---------------------------------------------------------------- the note from the producer
if (!only || only === "note") {
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const phone = w <= 600;
    console.log(`\n== the note from the producer (${tag})`);
    const b = await open({ width: w, height: h });
    const sel = phone ? "#stageBetaBtn" : "#betaBtn";
    await b.mouse(sel);
    let n = await b.evaluate(NOTE);
    let s = await b.evaluate(STAMP);
    check(`${tag}: the stamp opens the note, focus on Got it`, n.open && n.focus === "betaGotIt" && s.expanded === "true", JSON.stringify(n));
    check(`${tag}: the light goes and the name becomes "Beta. What this means" (remembered)`, !s.light && s.label === "Beta. What this means" && n.seen === "1", JSON.stringify(s));
    check(`${tag}: under the stamp, fully on screen with 18px sides`, n.below && n.left >= 18 - 3 && n.right <= w - 18 + 3 && n.top >= 0 && n.bottom <= h, JSON.stringify(n));
    if (phone) check(`${tag}: the note is 300px wide, centred under the stamp as far as the sides allow`, Math.abs(n.width - 300) <= 4, JSON.stringify(n));
    const text = await b.evaluate(`(() => { const share = document.getElementById("betaShare");
      return { role: betaNote.getAttribute("role"), label: document.getElementById(betaNote.getAttribute("aria-labelledby")).textContent,
        kicker: betaNote.querySelector(".beta-kicker").textContent, line: betaNote.querySelector(".beta-line").textContent,
        share: [share.href, share.target, share.rel, share.textContent.trim()] }; })()`);
    check(`${tag}: a dialog named "SpeakReview is in beta." with the producer's words`, text.role === "dialog" && text.label === "SpeakReview is in beta." && text.kicker === "A note from the producer"
      && text.line === "It's free while it's being tested. Some things may change or break, and your feedback shapes what comes next.", JSON.stringify(text));
    check(`${tag}: Share feedback opens the form in a new tab with noopener`, text.share[0] === FORM && text.share[1] === "_blank" && /\bnoopener\b/.test(text.share[2]) && text.share[3] === "Share feedback", JSON.stringify(text.share));
    await shot(b, `beta-note-${tag}`);
    // Tab stays inside
    await b.key("Tab");
    const t1 = await b.evaluate("document.activeElement.id");
    await b.key("Tab");
    const t2 = await b.evaluate("document.activeElement.id");
    await b.key("Tab", true);
    const t3 = await b.evaluate("document.activeElement.id");
    check(`${tag}: Tab goes to Share feedback, then wraps to Got it; Shift+Tab wraps back`, t1 === "betaShare" && t2 === "betaGotIt" && t3 === "betaShare", [t1, t2, t3].join());
    // Escape
    await b.key("Escape");
    n = await b.evaluate(NOTE);
    check(`${tag}: Escape closes it, focus back on the stamp`, !n.open && n.focus === sel.slice(1), JSON.stringify(n));
    // A click outside
    await b.mouse(sel);
    await b.mouse([Math.round(w / 2), 4]);          // the very top of the page: nothing to press there
    await sleep(100);
    n = await b.evaluate(NOTE);
    check(`${tag}: a click outside closes it`, !n.open, JSON.stringify(n));
    // Got it
    await b.mouse(sel);
    await b.mouse("#betaGotIt");
    n = await b.evaluate(NOTE);
    check(`${tag}: Got it closes it, focus back on the stamp`, !n.open && n.focus === sel.slice(1), JSON.stringify(n));
    // The stamp again closes it too
    await b.mouse(sel);
    await b.mouse(sel);
    check(`${tag}: the stamp closes an open note`, !(await b.evaluate(NOTE)).open);
    // Gone for good on this device
    await b.reload();
    s = await b.evaluate(STAMP);
    check(`${tag}: after a reload the light stays gone, named "Beta. What this means"`, !s.light && s.label === "Beta. What this means", JSON.stringify(s));

    // One paper note at a time
    if (!phone) {
      await b.mouse("#timeTicket");
      check(`${tag}: (Tonight's programme open)`, await b.evaluate("programmeOpen"));
      await b.evaluate("scrollTo(0, 0); true");      // short windows scroll the paper into view; the stamp is at the top
      await sleep(150);
      await b.mouse(sel);
      check(`${tag}: opening the note closes Tonight's programme`, await b.evaluate("!programmeOpen && !betaNote.hidden && document.activeElement === betaGotIt"));
      await b.mouse("#timeTicket");
      check(`${tag}: opening Tonight's programme closes the note`, await b.evaluate("programmeOpen && betaNote.hidden"));
      await b.evaluate("closeProgramme(false); scrollTo(0, 0); true");
      await sleep(150);
    } else {
      await b.evaluate(`openProgramme("time", timeTicket); true`);
      await b.evaluate(`openBetaNote(stageBetaBtn); true`);
      check(`${tag}: opening the note closes the programme sheet`, await b.evaluate("!programmeOpen && !betaNote.hidden && settingsBackdrop.hidden"));
      await b.evaluate(`openProgramme("time", timeTicket); true`);
      check(`${tag}: opening the programme sheet closes the note`, await b.evaluate("programmeOpen && betaNote.hidden"));
      await b.evaluate("closeProgramme(false); true");
    }
    await b.mouse(sel);
    check(`${tag}: the Coming back note waits while the Beta note is open`, await b.evaluate("!calmForNote()"));
    await b.evaluate(`showComebackNote({ entry: { id: "beta-test", at: Date.now(), topic: "A topic", freely: false }, result: { speaking_seconds: 30 } }); true`);
    check(`${tag}: the Coming back note opening closes the Beta note`, await b.evaluate("!comebackDialog.hidden && betaNote.hidden"));
    await b.mouse("#cbNotNow");
    check(`${tag}: (Coming back closed, the Stage calm again)`, await b.evaluate("comebackDialog.hidden && calmForNote()"));
    await done(b);
  }

  console.log("\n== storage blocked");
  const b = await open({ pre: [BLOCK] });
  let s = await b.evaluate(STAMP);
  check("blocked: the light shows", s.light && s.label === "Beta, new note from the producer");
  await b.mouse("#betaBtn");
  s = await b.evaluate(STAMP);
  check("blocked: the note opens, and the light goes for this visit", (await b.evaluate(NOTE)).open && !s.light && s.label === "Beta. What this means");
  await b.key("Escape");
  await b.reload();
  s = await b.evaluate(STAMP);
  check("blocked: the next visit shows the light again", s.light && s.label === "Beta, new note from the producer", JSON.stringify(s));
  await done(b);

  console.log("\n== a stored value that isn't exactly \"1\"");
  const c = await open({ pre: [`localStorage.setItem(${JSON.stringify(SEEN_KEY)}, "yes<img src=x onerror=window.__xss=1>");`] });
  s = await c.evaluate(STAMP);
  check("anything else stored counts as not seen yet", s.light && !(await c.evaluate("!!window.__xss")));
  await done(c);
}

// ---------------------------------------------------------------- the device code
const DEVICE_KEY = "speakreview.device.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Sends a short WAV straight through upload() and waits until its notes show in Backstage
async function sendAndShow(b, seconds = 6) {
  await b.evaluate(`(() => { const n = 16000 * ${seconds}, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
    upload({ blob: buildWav([toPcm16(x, n)], n), seconds: ${seconds}, source: "upload" }); return true; })()`);
  const shown = await b.waitFor("currentView === 'backstage' && !intermissionOn && !appRoot.inert && !document.body.classList.contains('curtains-closed')", 20000);
  await sleep(600);
  return shown;
}
const DEVICE = `(() => { const ups = __calls.filter(u => u.includes("/upload-url")).map(u => new URL(u).searchParams.get("device"));
  let stored; try { stored = localStorage.getItem(${JSON.stringify(DEVICE_KEY)}); } catch (e) { stored = "blocked"; }
  return { ups, stored, elsewhere: __calls.filter(u => !u.includes("/upload-url") && u.includes("device")).length }; })()`;

if (!only || only === "device") {
  console.log("\n== the device code");
  const b = await open();
  let d = await b.evaluate(DEVICE);
  check("nothing made before the first upload", d.stored === null && d.ups.length === 0, JSON.stringify(d));
  check("first upload", await sendAndShow(b));
  d = await b.evaluate(DEVICE);
  check("first upload: a random code (UUID v4) is made, kept and sent as device=<code>", UUID.test(d.stored) && d.ups.length === 1 && d.ups[0] === d.stored, JSON.stringify(d));
  check("second upload", await sendAndShow(b));
  d = await b.evaluate(DEVICE);
  check("second upload: the same code", d.ups.length === 2 && d.ups.every(u => u === d.stored), JSON.stringify(d));
  const first = d.stored;
  await b.reload();
  check("after a reload", await sendAndShow(b));
  d = await b.evaluate(DEVICE);
  check("after a reload: the same code again", d.ups.length === 1 && d.ups[0] === first && d.stored === first, JSON.stringify(d));
  check("sent only with GET /upload-url (not /result or the upload itself)", d.elsewhere === 0, JSON.stringify(d));
  await done(b);

  console.log("\n== a bad stored code");
  for (const bad of ["not-a-code", "<img src=x onerror=window.__xss=1>", "11111111-1111-1111-1111-111111111111", "{}"]) {
    const c = await open({ pre: [`localStorage.setItem(${JSON.stringify(DEVICE_KEY)}, ${JSON.stringify(bad)});`] });
    await sendAndShow(c);
    d = await c.evaluate(DEVICE);
    check(`${JSON.stringify(bad)} is replaced by a new code`, UUID.test(d.stored) && d.ups[0] === d.stored && !(await c.evaluate("!!window.__xss")), JSON.stringify(d));
    await done(c);
  }

  console.log("\n== storage blocked (device code)");
  const k = await open({ pre: [BLOCK] });
  check("blocked: the upload still works", await sendAndShow(k));
  check("blocked: a second upload", await sendAndShow(k));
  d = await k.evaluate(DEVICE);
  check("blocked: a code is still sent, the same one for this visit", d.ups.length === 2 && UUID.test(d.ups[0]) && d.ups[1] === d.ups[0], JSON.stringify(d));
  const visit1 = d.ups[0];
  await k.reload();
  await sendAndShow(k);
  d = await k.evaluate(DEVICE);
  check("blocked: the next visit gets a new code", UUID.test(d.ups[0]) && d.ups[0] !== visit1, JSON.stringify(d));
  await done(k);
}

finish();
