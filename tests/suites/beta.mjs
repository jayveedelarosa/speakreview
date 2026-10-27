// Feature set 3, stage 5: Beta tools.
//   stamp    the Beta stamp after the name (header, and the ticket on the phone Stage), its look, tap area and red light
//   note     the note from the producer: focus, Tab, Escape, outside click, the light gone for good, one paper note at a time
//   device   the device code: made once, kept, sent as device=<code> on every GET /upload-url and nowhere else
//   rate     "How was the coach tonight?": only for real coaching, the answer, thanks, POST /rating, one retry, kept with the speech
//   privacy  the code, rating and form sentences in the privacy note, and the note still fits on screen
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

// ---------------------------------------------------------------- "How was the coach tonight?"
const API = "https://jhfndh1s03.execute-api.us-east-1.amazonaws.com";
const WALL_KEY = "speakreview.wall.v1";
const LABELS = { bravo: "Bravo!", clap: "Polite clap", boo: "Boo" };
const RATE = `(() => { const box = coachNotesBody.querySelector(".rate"); if (!box) return null;
  const btns = [...box.querySelectorAll(".rate-btn")], live = box.querySelector('[role="status"]'), more = box.querySelector(".rate-more"), cs = getComputedStyle(box);
  return { last: coachNotesBody.lastElementChild === box, group: [box.getAttribute("role"), box.getAttribute("aria-label")], title: box.querySelector(".rate-title").textContent,
    border: [cs.borderTopStyle, cs.borderTopWidth, cs.borderRadius], labels: btns.map(b => b.textContent.trim()), heights: btns.map(b => Math.round(b.getBoundingClientRect().height)),
    icons: btns.map(b => { const s = b.querySelector("svg"); return s && s.getAttribute("aria-hidden") === "true" && s.getAttribute("stroke") === "currentColor" && s.getAttribute("stroke-width") === "1.6"; }),
    verdict: (box.querySelector(".rate-verdict") || {}).textContent || null, strong: (box.querySelector(".rate-verdict strong") || {}).textContent || null,
    more: more ? [more.href, more.target, more.rel, more.textContent] : null, live: live ? live.textContent : null, focus: document.activeElement === more,
    xss: !!window.__xss }; })()`;
const POSTS = `__posts.map(p => ({ url: p.url, method: p.method, type: p.headers["Content-Type"], body: p.body }))`;
const wallRating = id => `(() => { try { const e = JSON.parse(localStorage.getItem(${JSON.stringify(WALL_KEY)}) || "[]").find(e => e.id === ${JSON.stringify(id)}); return e ? (e.rating ?? null) : "missing"; } catch (err) { return "blocked"; } })()`;
// Puts the box in view (it is at the end of the notes) and taps one answer
async function rate(b, rating) {
  await b.evaluate(`document.getElementById("tabNotes").click(); coachNotesBody.querySelector('.rate-btn[data-rating="${rating}"]').scrollIntoView({ block: "center" }); true`);
  await sleep(300);
  await b.mouse(`#coachNotesBody .rate-btn[data-rating="${rating}"]`);
}

if (!only || only === "rate") {
  for (const [[w, h], rating] of [[[1280, 800], "bravo"], [[1093, 526], "clap"], [[390, 780], "boo"]]) {
    const tag = `${w}x${h}`;
    console.log(`\n== How was the coach tonight? (${tag})`);
    const b = await open({ width: w, height: h });
    check(`${tag}: a speech is sent`, await sendAndShow(b));
    const id = await b.evaluate("backstageSpeech.id");
    let r = await b.evaluate(RATE);
    check(`${tag}: at the very end of the Coach's notes, a group named "How was the coach tonight?"`, r && r.last && r.group[0] === "group" && r.group[1] === "How was the coach tonight?" && r.title === "How was the coach tonight?", JSON.stringify(r));
    check(`${tag}: a dashed box with Bravo! / Polite clap / Boo, each 44px tall with a thin line icon (hidden from screen readers)`, r.border[0] === "dashed" && r.border[2] === "12px"
      && JSON.stringify(r.labels) === '["Bravo!","Polite clap","Boo"]' && r.heights.every(x => x >= 44) && r.icons.every(Boolean), JSON.stringify(r));
    await b.evaluate(`coachNotesBody.querySelector(".rate").scrollIntoView({ block: "center" }); true`);
    await sleep(300);
    await shot(b, `beta-rate-${tag}`);
    await rate(b, rating);
    r = await b.evaluate(RATE);
    check(`${tag}: ${LABELS[rating]}: the thanks with "Your verdict: ${LABELS[rating]}" replaces the buttons`, r.title === "Thanks for the review!" && r.labels.length === 0
      && r.verdict === `Your verdict: ${LABELS[rating]}` && r.strong === LABELS[rating], JSON.stringify(r));
    check(`${tag}: announced politely, focus on "Say more in a short form" (the form, new tab, noopener)`, r.live === `Thanks for the review! Your verdict: ${LABELS[rating]}` && r.focus
      && r.more[0] === FORM && r.more[1] === "_blank" && /\bnoopener\b/.test(r.more[2]) && r.more[3] === "Say more in a short form", JSON.stringify(r));
    await b.waitFor("__posts.length >= 1", 3000);
    const posts = await b.evaluate(POSTS);
    check(`${tag}: POST /rating with exactly {"speech_id","rating"} as JSON`, posts.length === 1 && posts[0].url === `${API}/rating` && posts[0].method === "POST"
      && posts[0].type === "application/json" && posts[0].body === JSON.stringify({ speech_id: id, rating }), JSON.stringify(posts));
    check(`${tag}: saved with that speech on its Wall of Fame entry`, (await b.evaluate(wallRating(id))) === rating);
    await shot(b, `beta-rate-thanks-${tag}`);
    // Reopened later: the thanks, not the question, and nothing sent again
    await b.reload();
    await b.evaluate(`displayResult(window.__result, ${JSON.stringify(id)}); true`);
    await sleep(300);
    r = await b.evaluate(RATE);
    check(`${tag}: reopening the speech shows the thanks (not announced again), nothing sent`, r && r.title === "Thanks for the review!" && r.strong === LABELS[rating] && r.live === ""
      && (await b.evaluate("__posts.length")) === 0, JSON.stringify(r));
    await done(b);
  }

  console.log("\n== only for real coaching");
  const b = await open();
  const cases = [
    ["real coaching", {}, "s1", true],
    ["no speech ID (from the console)", {}, null, false],
    ["too short", { too_short: true, ai_feedback: "That was a little short for the coach." }, "s2", false],
    ["no notes", { ai_feedback: null }, "s3", false],
    ["empty notes", { ai_feedback: "   " }, "s4", false],
    ["AI feedback unavailable", { ai_feedback: "AI feedback unavailable." }, "s5", false],
    ["ai FEEDBACK unavailable (any case, spaces first)", { ai_feedback: "  ai FEEDBACK unavailable: the coach timed out" }, "s6", false],
    ["notes that mention it later", { ai_feedback: "Strengths:\n1. Clear. AI feedback unavailable is not the start." }, "s7", true]
  ];
  for (const [name, change, id, shows] of cases) {
    await b.evaluate(`displayResult(Object.assign({}, window.__result, ${JSON.stringify(change)}), ${JSON.stringify(id)}); true`);
    check(`${name}: ${shows ? "asks" : "no question"}`, (await b.evaluate("!!coachNotesBody.querySelector('.rate')")) === shows);
  }
  await done(b);

  console.log("\n== sending fails: one more try, never an error");
  const f = await open();
  for (const [name, replies, tries] of [["500 then 200", [500, 200], 2], ["network error twice", ["reject", "reject"], 2], ["429 twice", [429, 429], 2], ["503 then 200", [503], 2],
    ["404 (results gone)", [404], 1], ["400", [400], 1], ["200", [200], 1]]) {
    await f.evaluate(`__posts.length = 0; __ratingReplies = ${JSON.stringify(replies)}; true`);
    await sendAndShow(f);
    const id = await f.evaluate("backstageSpeech.id");
    await rate(f, "clap");
    await sleep(5500);          // the retry comes about 4 seconds later
    const p = await f.evaluate(POSTS);
    const r = await f.evaluate(RATE);
    check(`${name}: ${tries === 2 ? "tried once more" : "not tried again"} (${p.length} sent), the same body`, p.length === tries && p.every(x => x.body === JSON.stringify({ speech_id: id, rating: "clap" })), JSON.stringify(p));
    check(`${name}: the thanks stays, no error shown`, r.title === "Thanks for the review!" && !(await f.evaluate("!!window.__alerted")) && (await f.evaluate(wallRating(id))) === "clap", JSON.stringify(r));
  }
  await sleep(4500);
  check("never more than one retry", (await f.evaluate("__posts.length")) === 1);
  await done(f);

  console.log("\n== storage blocked (rating)");
  const k = await open({ pre: [BLOCK] });
  await sendAndShow(k);
  const kid = await k.evaluate("backstageSpeech.id");
  await rate(k, "bravo");
  await k.waitFor("__posts.length >= 1", 3000);
  await k.evaluate(`displayResult(window.__result, ${JSON.stringify(kid)}); true`);
  const kr = await k.evaluate(RATE);
  check("blocked: sent, and the speech shows the thanks again for this visit", kr && kr.strong === "Bravo!" && (await k.evaluate("__posts.length")) === 1, JSON.stringify(kr));
  await done(k);

  console.log("\n== a stored answer is untrusted");
  const entry = rating => ({ id: "seeded", savedAt: new Date().toISOString(), wpm: 120, ai_feedback: "Strengths:\n1. Clear.", rating });
  for (const [stored, shows] of [["boo", "Boo"], ["great", null], ["<img src=x onerror=window.__xss=1>", null], [1, null], [{ a: 1 }, null]]) {
    const c = await open({ pre: [`localStorage.setItem(${JSON.stringify(WALL_KEY)}, ${JSON.stringify(JSON.stringify([entry(stored)]))});`] });
    await c.evaluate(`displayResult(window.__result, "seeded"); true`);
    const r = await c.evaluate(RATE);
    const kept = await c.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(WALL_KEY)}) || "[]").length === 1 || wallEntries.some(e => e.id === "seeded")`);
    check(`stored ${JSON.stringify(stored)}: ${shows ? `the thanks with ${shows}` : "dropped (the question shows), the entry kept"}`,
      r && !r.xss && kept && (shows ? r.strong === shows : r.title === "How was the coach tonight?"), JSON.stringify(r));
    await done(c);
  }

  console.log("\n== saving the speech again keeps the answer");
  const s = await open();
  await sendAndShow(s);
  const sid = await s.evaluate("backstageSpeech.id");
  await rate(s, "boo");
  await s.evaluate(`saveToWall(${JSON.stringify(sid)}, window.__result); true`);
  check("a second save of the same speech keeps its answer", (await s.evaluate(wallRating(sid))) === "boo");
  await done(s);
}

// ---------------------------------------------------------------- the privacy note
const PRIVACY_NEW = [
  "The sound of your speech, used only to create your feedback. Deleted after 7 days.",
  "Your results, including your \"How was the coach tonight?\" answer. Deleted after 30 days. A count of the answers is kept.",
  "A random code made by this browser, used only to count how many people come back. It isn't linked to your name.",
  "Run by Google Forms, separately from SpeakReview. It asks for no name or email."
];
if (!only || only === "privacy") {
  for (const [w, h] of [[1280, 800], [1093, 526], [390, 780], [360, 740]]) {
    const tag = `${w}x${h}`;
    console.log(`\n== the privacy note (${tag})`);
    const b = await open({ width: w, height: h });
    await b.mouse("#privacyBtn");
    const p = await b.evaluate(`(() => { const r = privacyNote.getBoundingClientRect(); return { text: privacyNote.textContent, open: !privacyNote.hidden,
      inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; })()`);
    check(`${tag}: the code, rating and form sentences are there`, p.open && PRIVACY_NEW.every(t => p.text.includes(t)), p.text);
    check(`${tag}: ends with the clearing line, no "we", no em dashes`, p.text.trim().endsWith("Clearing this site's data removes everything stored on this device and resets the code.")
      && !/\bwe\b/i.test(p.text) && !p.text.includes("—"));
    check(`${tag}: the longer note still fits on screen`, p.inside, JSON.stringify(p).slice(-80));
    await shot(b, `beta-privacy-${tag}`);
    await done(b);
  }
}

finish();
