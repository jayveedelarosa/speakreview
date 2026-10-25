// Feature set 3, stage 3: Intermission's three acts, smarter checking of /result, the tab title, and the
// Coming back note.
//   acts      act order and wording, never moving back, footer lines, layout, contrast, announcements, glow
//   timing    4 s gaps in Act II, 2 s in Act III, a direct jump to the result
//   title     the tab title when the notes arrive while the page is hidden, and checking straight away on return
//   giveup    giving up after 5 minutes (a fake clock fast-forwards, so it runs in seconds)
// Every API call is answered by the fake API stub; nothing reaches AWS.
import { launch, sleep, LIVE, STUB, RESULT, check, finish, only, shot } from "../lib/page.mjs";
import { CLOCK } from "../lib/clock.mjs";

const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const KEEP = "Keep this page open until your recording is sent.";
const WAIT_LAPTOP = "Usually under a minute. You can switch tabs or close the page: your notes will be waiting.";
const WAIT_PHONE = "Usually under a minute. You can switch apps or close the page: your notes will be waiting.";
const PAGE_TITLE = "SpeakReview | AI Speech Feedback";
const READY_TITLE = "Your notes are ready · SpeakReview";

// Holds the S3 upload until the test lets it go (so Act I can be seen), records /result call times and
// every announcement, and stands in for document.hidden
const HOOKS = `(() => {
  window.__resultTimes = [];
  window.__announced = [];
  let release;
  window.__holdUpload = false;
  const held = new Promise(r => { release = r; });
  window.__releaseUpload = () => release();
  const inner = window.fetch;
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("/result")) window.__resultTimes.push(performance.now());
    if (u.includes(".s3.") && window.__holdUpload) await held;
    return inner(url, opts);
  };
  let hidden = false;
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
  window.__setHidden = value => { hidden = value; document.dispatchEvent(new Event("visibilitychange")); };
  document.addEventListener("DOMContentLoaded", () => {
    const sa = document.getElementById("sceneAnnounce");
    new MutationObserver(() => { if (sa.textContent) window.__announced.push(sa.textContent); }).observe(sa, { childList: true, characterData: true, subtree: true });
  });
})();`;

async function open({ width = 1280, height = 800, dpr = 1, pre = [], motion = "no-preference" } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: FAKE, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  // pre-scripts run after the fake API, so they can set its replies before the page's own first check
  await b.goto(LIVE, [STUB, HOOKS, ...pre]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(50); }
    return false;
  };
  // What the board shows now
  b.board = () => b.evaluate(`({ acts: [...document.querySelectorAll("#ibActs .ib-act")].map(a => ({ state: a.dataset.state,
      kicker: a.querySelector(".ib-kicker").textContent, title: a.querySelector(".ib-title").textContent, sub: a.querySelector(".ib-sub").textContent,
      word: a.querySelector(".ib-state").textContent, link: a.querySelector(".ib-link")?.dataset.reached ?? null })),
    keep: !ibKeep.hidden, wait: !ibWait.hidden, waitShown: [...ibWait.children].filter(e => getComputedStyle(e).display !== "none" && e.getClientRects().length && getComputedStyle(e).position !== "absolute").map(e => e.textContent).join(""),
    on: intermissionOn, shown: !intermission.hidden })`);
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
// Sends a 3-second WAV straight through upload(), as the Upload button does
const SEND = `(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
  upload({ blob: buildWav([toPcm16(x, n)], n), seconds: 3, source: "upload" }); return true; })()`;
const states = board => board.acts.map(a => a.state).join(",");
const gaps = times => times.slice(1).map((t, i) => (t - times[i]) / 1000);

// ---------------------------------------------------------------- the acts
if (!only || only === "acts") {
  for (const [w, h, dpr] of [[1280, 800, 1], [1093, 526, 1.25], [390, 780, 1], [360, 740, 1]]) {
    const phone = w <= 600;
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    console.log(`\n== the acts (${tag})`);
    const b = await open({ width: w, height: h, dpr });
    await b.evaluate(`window.__holdUpload = true; window.__resultSteps = [{}, { progress: "coach" }, {}]; window.__result = ${JSON.stringify(RESULT)}; true`);
    await b.evaluate(SEND);
    check(`${tag} Intermission shows`, await b.waitFor("!intermission.hidden", 5000));
    await sleep(600);
    let s = await b.board();
    check(`${tag} Act I: Sending, now playing; Acts II and III next`, states(s) === "now,next,next" && s.acts[0].title === "Sending" && s.acts[0].sub === "Sending your recording to your coach"
      && s.acts.map(a => a.word).join() === "Now playing,Next,Next" && s.acts.map(a => a.kicker).join() === "Act I,Act II,Act III", JSON.stringify(s.acts));
    check(`${tag} Act I: the keep-open line, not the waiting line`, s.keep && !s.wait && (await b.evaluate("ibKeep.textContent")) === KEEP);
    check(`${tag} Act I: the lines to the next acts are not reached`, s.acts[0].link === "false" && s.acts[1].link === "false");
    // Layout
    const lay = await b.evaluate(`(() => { const r = [...document.querySelectorAll("#ibActs .ib-act")].map(a => a.getBoundingClientRect());
      const box = e => e.getBoundingClientRect(); const brand = box(document.querySelector(".intermission-brand")), foot = box(ibKeep), board = box(document.querySelector(".ib-board"));
      return { tops: r.map(x => Math.round(x.top)), lefts: r.map(x => Math.round(x.left)), boardW: Math.round(board.width), inside: brand.top >= 0 && foot.bottom <= innerHeight && board.left >= 0 && board.right <= innerWidth,
        bulbs: [...document.querySelectorAll(".ib-bulbs-top .ib-bulb")].filter(e => e.getClientRects().length).length }; })()`);
    if (phone) {
      check(`${tag} phone: the acts are stacked, the board full width less 18px each side, 9 bulbs a row`, lay.tops[0] < lay.tops[1] && lay.tops[1] < lay.tops[2] && new Set(lay.lefts).size === 1 && lay.boardW === w - 36 && lay.bulbs === 9, JSON.stringify(lay));
    } else {
      check(`${tag} laptop: the acts side by side on a 786px board, 17 bulbs a row`, new Set(lay.tops).size === 1 && lay.lefts[0] < lay.lefts[1] && lay.lefts[1] < lay.lefts[2] && lay.boardW === 786 && lay.bulbs === 17, JSON.stringify(lay));
    }
    check(`${tag} everything fits in the window`, lay.inside, JSON.stringify(lay));
    check(`${tag} the Now playing bulb glows`, (await b.evaluate(`getComputedStyle(document.querySelector('.ib-act[data-state="now"] .ib-bulb-big')).animationName`)) === "ibGlow");
    await shot(b, `ib-${tag}-act1`);

    // Act II once the upload has finished
    await b.evaluate("window.__releaseUpload()");
    check(`${tag} Act II begins when the upload finishes`, await b.waitFor(`document.querySelector('.ib-act[data-act="2"]').dataset.state === "now"`, 5000));
    s = await b.board();
    check(`${tag} Act I: Arrived, Your coach has it, done`, states(s) === "done,now,next" && s.acts[0].title === "Arrived" && s.acts[0].sub === "Your coach has it" && s.acts[0].word === "Done" && s.acts[0].link === "true" && s.acts[1].link === "false", JSON.stringify(s.acts));
    check(`${tag} Act II: Transcribing, Writing down every word`, s.acts[1].title === "Transcribing" && s.acts[1].sub === "Writing down every word" && s.acts[1].word === "Now playing");
    check(`${tag} from Act II: the ${phone ? "phone (switch apps)" : "laptop (switch tabs)"} line`, !s.keep && s.wait && s.waitShown === (phone ? WAIT_PHONE : WAIT_LAPTOP), s.waitShown);
    await shot(b, `ib-${tag}-act2`);

    // Act III once a reply says the coach has started; then a reply without progress doesn't move it back
    check(`${tag} Act III begins with the progress reply`, await b.waitFor(`document.querySelector('.ib-act[data-act="3"]').dataset.state === "now"`, 12000));
    s = await b.board();
    check(`${tag} Act III: Coach's notes, Reading and writing your feedback`, states(s) === "done,done,now" && s.acts[2].title === "Coach's notes" && s.acts[2].sub === "Reading and writing your feedback" && s.acts[1].link === "true", JSON.stringify(s.acts));
    await shot(b, `ib-${tag}-act3`);
    await b.waitFor("window.__resultSteps.length === 0", 5000);
    await sleep(300);
    check(`${tag} a later reply without progress doesn't move it back`, states(await b.board()) === "done,done,now");

    // Contrast of the words on the dark panel (worked out from the colours, against the panel's lightest point)
    const ratios = await b.evaluate(`(() => {
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const panel = [28, 14, 11].map(v => 255 * 0.08 + v * 0.92);
      const out = [];
      for (const state of ["done", "now", "next"]) {
        const act = document.querySelector('.ib-act[data-act="1"]');
        act.dataset.state = state;
        for (const sel of [".ib-kicker", ".ib-title", ".ib-sub", ".ib-state"]) {
          const c = getComputedStyle(act.querySelector(sel)).color.match(/[\\d.]+/g).map(Number);
          out.push([state + " " + sel, +((Math.max(L(c), L(panel)) + 0.05) / (Math.min(L(c), L(panel)) + 0.05)).toFixed(2)]);
        }
      }
      renderActs();
      return out; })()`);
    check(`${tag} every act's words >= 4.5:1 on the panel (done, now and next)`, ratios.every(([, r]) => r >= 4.5), JSON.stringify(ratios.filter(([, r]) => r < 6)));

    check(`${tag} the result opens Backstage`, await b.waitFor("currentView === 'backstage' && !intermissionOn", 10000));
    const said = await b.evaluate("window.__announced");
    const acts = ["Act I, Sending", "Act II, Transcribing", "Act III, Coach's notes"].map(t => said.filter(x => x.includes(t)).length);
    check(`${tag} each act announced once`, acts.join() === "1,1,1", JSON.stringify(said));
    check(`${tag} "keep this page open" is never announced after Act I`, said.filter(x => /keep this page open/i.test(x)).every(x => x.includes("Act I, Sending")) && !said.some(x => /Please keep/.test(x)), JSON.stringify(said));
    await done(b);
  }

  console.log("\n== reduced motion");
  const b = await open({ motion: "reduce" });
  await b.evaluate(`window.__holdUpload = true; true`);
  await b.evaluate(SEND);
  await b.waitFor("!intermission.hidden", 5000);
  check("no glow pulse with reduced motion", (await b.evaluate(`getComputedStyle(document.querySelector('.ib-act[data-state="now"] .ib-bulb-big')).animationName`)) === "none");
  await b.evaluate("window.__releaseUpload()");
  await done(b);
}

// ---------------------------------------------------------------- the gaps
if (!only || only === "timing") {
  console.log("\n== checking every 4 s in Act II, every 2 s in Act III");
  let b = await open();
  await b.evaluate(`window.__resultSteps = [{}, {}, { progress: "coach" }, { progress: "coach" }, {}]; window.__result = ${JSON.stringify(RESULT)}; true`);
  await b.evaluate(SEND);
  check("the result opens Backstage", await b.waitFor("currentView === 'backstage' && !intermissionOn", 30000));
  const g = gaps(await b.evaluate("window.__resultTimes"));
  // (±0.9 s: enough to tell 2 s from 4 s on a busy computer)
  check("gaps: 4, 4 in Act II, then 2, 2, 2 in Act III", g.length === 5 && g.slice(0, 2).every(x => Math.abs(x - 4) <= 0.9) && g.slice(2).every(x => Math.abs(x - 2) <= 0.9), g.map(x => x.toFixed(2)).join(", "));
  await done(b);

  console.log("\n== a reply that jumps straight to the result");
  b = await open();
  await b.evaluate(`window.__result = ${JSON.stringify(RESULT)}; true`);
  await b.evaluate(SEND);
  check("straight to Backstage after one check, Act III never shown", await b.waitFor("currentView === 'backstage' && !intermissionOn", 15000)
    && (await b.evaluate("window.__resultTimes.length")) === 1 && !(await b.evaluate("window.__announced")).some(x => x.includes("Act III")));
  await done(b);
}

// ---------------------------------------------------------------- the tab title
if (!only || only === "title") {
  console.log("\n== the notes arrive while the tab is hidden");
  let b = await open();
  await b.evaluate(`window.__result = ${JSON.stringify(RESULT)}; true`);
  await b.evaluate(SEND);
  await b.waitFor("intermissionAct === 2", 5000);
  await b.evaluate("__setHidden(true)");
  check("the title while hidden and waiting is unchanged", (await b.evaluate("document.title")) === PAGE_TITLE);
  check("the title says the notes are ready", await b.waitFor(`document.title === ${JSON.stringify(READY_TITLE)}`, 10000), await b.evaluate("document.title"));
  await b.evaluate("__setHidden(false)");
  check("back on the page: the normal title", (await b.evaluate("document.title")) === PAGE_TITLE);
  await done(b);

  console.log("\n== the notes arrive while the page is showing");
  b = await open();
  await b.evaluate(`window.__result = ${JSON.stringify(RESULT)}; true`);
  await b.evaluate(SEND);
  await b.waitFor("currentView === 'backstage' && !intermissionOn", 15000);
  check("the title stays the same", (await b.evaluate("document.title")) === PAGE_TITLE);
  await done(b);

  console.log("\n== coming back to the page checks straight away");
  b = await open();
  await b.evaluate(SEND);
  await b.waitFor("intermissionAct === 2", 5000);
  await b.evaluate("__setHidden(true)");
  await sleep(1000);
  const before = await b.evaluate("window.__resultTimes.length");
  const at = await b.evaluate("performance.now()");
  await b.evaluate("__setHidden(false)");
  await sleep(500);
  const times = await b.evaluate("window.__resultTimes");
  check("a check within half a second of coming back (not 3 s later)", before === 0 && times.length === 1 && times[0] - at < 500, JSON.stringify({ before, times, at }));
  await sleep(4300);
  check("then the usual 4 s gap", Math.abs(((await b.evaluate("window.__resultTimes"))[1] - times[0]) / 1000 - 4) <= 0.6);
  await done(b);
}

// ---------------------------------------------------------------- giving up after 5 minutes
if (!only || only === "giveup") {
  console.log("\n== giving up after 5 minutes (fake clock)");
  const b = await open({ pre: [CLOCK] });
  await b.evaluate(`window.__result = {}; true`);
  await b.evaluate(SEND);
  check("the upload goes through (Act II)", await b.waitFor("intermissionAct === 2", 10000));
  const started = await b.evaluate("__clock.now()");
  // 4:50 in one-second steps: still waiting
  for (let t = 0; t < 290; t++) await b.evaluate("__clock.tick(1000)");
  const mid = await b.evaluate(`({ on: intermissionOn, shown: !intermission.hidden, calls: window.__resultTimes.length, status: statusText.textContent })`);
  check("at 4:50 still in Intermission, checking every 4 s", mid.on && mid.shown && mid.calls >= 70 && mid.calls <= 73 && !mid.status.includes("longer"), JSON.stringify(mid));
  for (let t = 0; t < 15; t++) await b.evaluate("__clock.tick(1000)");
  const end = await b.evaluate(`({ on: intermissionOn, status: statusText.textContent, calls: window.__resultTimes.length, view: currentView, upload: !uploadBtn.disabled, busy: isBusy, elapsed: __clock.now() - ${started} })`);
  check("after 5 minutes: the curtains open on the Stage with the message", !end.on && end.view === "stage" && end.status === "This is taking longer than expected. Please try again in a few minutes." && !end.busy, JSON.stringify(end));
  for (let t = 0; t < 30; t++) await b.evaluate("__clock.tick(1000)");
  check("and the checks stop", (await b.evaluate("window.__resultTimes.length")) === end.calls);
  check("the pending entry stays after giving up (a later visit can still show the note)", (await b.evaluate(`localStorage.getItem("speakreview.pending.v1")`)) !== null);
  await shot(b, "ib-giveup");
  await done(b);
}

// ---------------------------------------------------------------- Coming back
const PENDING = "speakreview.pending.v1";
const XSS = "<img src=x onerror=window.__xss=1>";
// Puts a pending entry in storage once (a reload keeps what the page did with it). at is "now minus ago ms".
const seedPending = (entry, ago) => `if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1");
  localStorage.setItem(${JSON.stringify(PENDING)}, typeof ${JSON.stringify(entry)} === "string" ? ${JSON.stringify(entry)} : JSON.stringify(Object.assign(${JSON.stringify(entry)}, ${ago === null ? "{}" : `{ at: Date.now() - ${ago} }`}))); }`;
const note = b => b.evaluate(`({ open: !comebackDialog.hidden, topic: cbTopic.textContent, meta: cbMeta.textContent, focus: document.activeElement && document.activeElement.id,
  pending: localStorage.getItem(${JSON.stringify(PENDING)}), wall: JSON.parse(localStorage.getItem("speakreview.wall.v1") || "[]").map(e => e.id),
  trophies: localStorage.getItem("speakreview.trophies.v1"), calls: window.__resultTimes.length, view: currentView, inter: intermissionOn, xss: !!window.__xss })`);
const reload = async b => {
  await b.send("Page.reload");
  await sleep(500);
  await b.waitFor("document.readyState === 'complete' && typeof micSupported !== 'undefined'", 15000);
  await sleep(300);
};
const TOPIC = "Is failure a better teacher than success?";
const META_TODAY = /^Today, \d{1,2}:\d{2}\s[ap]m · 2:47$/;

if (!only || only === "comeback") {
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const tag = w <= 600 ? "phone" : "laptop";
    console.log(`\n== Coming back: the notes are ready (${tag})`);
    const b = await open({ width: w, height: h, pre: [seedPending({ id: "cb-1", topic: TOPIC, freely: false }, 90 * 1000), `window.__result = ${JSON.stringify({ ...RESULT, topic: TOPIC, speaking_seconds: 167 })};`] });
    check(`${tag} the note opens on load`, await b.waitFor("!comebackDialog.hidden", 8000));
    let n = await note(b);
    check(`${tag} the topic and "Today, h:mm pm · 2:47"`, n.topic === TOPIC && META_TODAY.test(n.meta), `${n.topic} / ${n.meta}`);
    check(`${tag} saved on the Wall once, the entry cleared, Intermission never shown`, n.wall.filter(id => id === "cb-1").length === 1 && n.pending === null && !n.inter && n.calls === 1, JSON.stringify(n));
    check(`${tag} a dialog with focus on See your notes`, n.focus === "cbSee" && await b.evaluate(`comebackDialog.querySelector("[role=dialog]").getAttribute("aria-modal") === "true" && appRoot.inert`));
    check(`${tag} the words`, await b.evaluate(`[...comebackDialog.querySelectorAll(".cb-kicker, .cb-title, .cb-line, .cb-label, .cb-not-now, .cb-see")].map(e => e.textContent.trim()).join("|")`)
      === "A note from backstage|Your last performance is ready.|The coach finished your notes while you were away.|Topic|Not now|See your notes");
    const sizes = await b.evaluate(`[cbNotNow, cbSee].map(e => e.getBoundingClientRect().height)`);
    check(`${tag} both buttons at least 44px tall`, sizes.every(x => x >= 44), JSON.stringify(sizes));
    const box = await b.evaluate(`(() => { const r = comebackDialog.querySelector(".cb-card").getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: comebackDialog.querySelector(".cb-card").offsetWidth }; })()`);
    check(`${tag} the card inside the window, ${w <= 600 ? "full width less 18px each side" : "450px wide"}`, box.left >= 0 && box.right <= w && box.top >= 0 && box.bottom <= h && box.w === (w <= 600 ? w - 36 : 450), JSON.stringify(box));
    let escaped = false;
    for (let i = 0; i < 6; i++) {
      await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: i % 2 ? 8 : 0 });
      await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await sleep(60);
      if (!(await b.evaluate("comebackDialog.contains(document.activeElement)"))) escaped = true;
    }
    check(`${tag} Tab stays inside the note`, !escaped);
    await shot(b, `cb-${tag}`);
    const trophiesBefore = n.trophies;
    check(`${tag} trophies counted for it`, trophiesBefore !== null && trophiesBefore.length > 2);
    await b.evaluate("cbSee.click()");
    check(`${tag} See your notes opens Backstage on that performance`, await b.waitFor("currentView === 'backstage' && !resultBox.hidden && !document.body.classList.contains('curtains-closed') && !appRoot.inert", 8000)
      && (await b.evaluate("comebackDialog.hidden && !appRoot.inert")));
    check(`${tag} with its trophy banner`, await b.evaluate("!trophyBanner.hidden"));
    // Never twice: a reload shows nothing and counts nothing
    await reload(b);
    await sleep(1500);
    n = await note(b);
    check(`${tag} after a reload: no note, no check, the Wall and trophies unchanged`, !n.open && n.calls === 0 && n.wall.filter(id => id === "cb-1").length === 1 && n.trophies === trophiesBefore, JSON.stringify(n));
    // The same speech again (already on the Wall): dropped, no note, no check, no trophies
    await b.evaluate(`localStorage.setItem(${JSON.stringify(PENDING)}, JSON.stringify({ id: "cb-1", at: Date.now() - 60000, topic: "", freely: true })); true`);
    await reload(b);
    await sleep(1500);
    n = await note(b);
    check(`${tag} an entry already on the Wall: dropped quietly, trophies not counted twice`, !n.open && n.calls === 0 && n.pending === null && n.trophies === trophiesBefore, JSON.stringify(n));
    await done(b);
  }

  console.log("\n== Coming back: still in progress on load");
  let b = await open({ pre: [seedPending({ id: "cb-2", topic: "", freely: true }, 30 * 1000), `window.__resultSteps = [{}, { progress: "coach" }]; window.__result = ${JSON.stringify({ ...RESULT, topic: undefined, speaking_seconds: 75 })};`] });
  await b.evaluate(`randomTopicBtn.focus(); true`);
  await sleep(1000);
  check("no note while it isn't ready", !(await note(b)).open);
  check("the note opens once the result arrives in the background", await b.waitFor("!comebackDialog.hidden", 15000));
  let n = await note(b);
  check("no topic: Spoke freely; 1:15 from speaking_seconds", n.topic === "Spoke freely" && /^Today, .* · 1:15$/.test(n.meta) && !n.inter && n.calls === 3, JSON.stringify(n));
  await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(200);
  n = await note(b);
  check("Escape closes it, focus back on Roll a new topic, the Stage usable", !n.open && n.focus === "randomTopicBtn" && n.view === "stage" && !(await b.evaluate("appRoot.inert")), JSON.stringify(n));
  await done(b);

  console.log("\n== Coming back: Not now");
  b = await open({ pre: [seedPending({ id: "cb-3", topic: "Why I love Sundays", freely: false }, 2 * 24 * 3600 * 1000), `window.__result = ${JSON.stringify({ ...RESULT, topic: undefined, speaking_seconds: 30 })};`] });
  check("an entry from 2 days ago shows when its result is ready at the first check", await b.waitFor("!comebackDialog.hidden", 10000));
  n = await note(b);
  const shortDate = await b.evaluate(`new Date(Date.now() - 2 * 24 * 3600 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })`);
  check(`the entry's topic and a short date ("${shortDate}")`, n.topic === "Why I love Sundays" && n.meta.startsWith(shortDate + ", ") && /^[A-Z][a-z]{2} \d{1,2}, /.test(n.meta), n.meta);
  await b.evaluate("cbNotNow.click()");
  n = await note(b);
  check("Not now closes it, focus back where it was (the page, as it opened on load), still on the Stage, saved on the Wall", !n.open && (await b.evaluate("document.activeElement === document.body")) && n.view === "stage" && n.wall.includes("cb-3"), JSON.stringify(n));
  await done(b);

  console.log("\n== Coming back: yesterday");
  b = await open({ pre: [seedPending({ id: "cb-4", topic: TOPIC, freely: false }, 24 * 3600 * 1000), `window.__result = ${JSON.stringify({ ...RESULT, topic: TOPIC, speaking_seconds: 167 })};`] });
  await b.waitFor("!comebackDialog.hidden", 8000);
  check("Yesterday", /^Yesterday, \d{1,2}:\d{2}\s[ap]m · 2:47$/.test((await note(b)).meta), (await note(b)).meta);
  await done(b);

  console.log("\n== Coming back: the note waits while a recording runs");
  b = await open({ pre: [seedPending({ id: "cb-5", topic: TOPIC, freely: false }, 20 * 1000), `window.__resultSteps = [{}]; window.__result = ${JSON.stringify(RESULT)};`] });
  await b.evaluate(`micBtn.click(); true`);
  check("recording", await b.waitFor("recState === 'recording'", 10000));
  check("the result arrives and is saved on the Wall", await b.waitFor(`JSON.parse(localStorage.getItem("speakreview.wall.v1") || "[]").some(e => e.id === "cb-5")`, 10000));
  await sleep(1500);
  check("no note while recording", !(await note(b)).open);
  await b.evaluate("finishBtn.click()");
  await b.waitFor("recState === 'review'", 5000);
  await sleep(1500);
  check("no note while a take waits in review", !(await note(b)).open);
  await b.evaluate("discardBtn.click()");
  check("the note opens once the Stage is calm again", await b.waitFor("!comebackDialog.hidden", 5000));
  await done(b);

  console.log("\n== Coming back: the live flow keeps and clears the entry");
  b = await open();
  await b.evaluate(`topicInput.value = "My own topic"; topicInput.dispatchEvent(new Event("input")); window.__resultSteps = [{}]; window.__result = ${JSON.stringify(RESULT)}; true`);
  await b.evaluate(SEND);
  await b.waitFor("intermissionAct === 2", 5000);
  let saved = JSON.parse(await b.evaluate(`localStorage.getItem(${JSON.stringify(PENDING)})`));
  check("kept at the start of Act II: id, time, topic", saved && typeof saved.id === "string" && saved.topic === "My own topic" && saved.freely === false && Math.abs(saved.at - (await b.evaluate("Date.now()"))) < 5000, JSON.stringify(saved));
  await b.waitFor("currentView === 'backstage' && !intermissionOn", 15000);
  check("cleared when the result shows", (await b.evaluate(`localStorage.getItem(${JSON.stringify(PENDING)})`)) === null);
  await b.evaluate("goToView('stage')");
  await b.waitFor("currentView === 'stage' && !document.body.classList.contains('curtains-closed')", 5000);
  await sleep(500);
  await b.evaluate(`clearTopicBtn.click(); window.__resultSteps = [{}]; true`);
  await b.evaluate(SEND);
  await b.waitFor("intermissionAct === 2", 5000);
  saved = JSON.parse(await b.evaluate(`localStorage.getItem(${JSON.stringify(PENDING)})`));
  check("Speak freely: kept with no topic", saved && saved.topic === "" && saved.freely === true, JSON.stringify(saved));
  await b.waitFor("currentView === 'backstage' && !intermissionOn", 15000);
  await done(b);
}

if (!only || only === "broken") {
  console.log("\n== Coming back: entries that are dropped");
  for (const [name, entry, ago, steps] of [
    ["the server has no record (404)", { id: "gone-1", topic: "", freely: true }, 30 * 1000, [{ status: 404 }]],
    ["past 5 minutes and still not ready", { id: "late-1", topic: "", freely: true }, 6 * 60 * 1000, [{}]]
  ]) {
    const b = await open({ pre: [seedPending(entry, ago), `window.__resultSteps = ${JSON.stringify(steps)}; window.__result = {};`] });
    await sleep(2500);
    const n = await note(b);
    check(`${name}: one check, then dropped quietly`, !n.open && n.calls === 1 && n.pending === null && !n.wall.includes(entry.id), JSON.stringify(n));
    await sleep(4500);
    check(`${name}: no more checks`, (await note(b)).calls === 1);
    await done(b);
  }

  console.log("\n== broken or old entries: ignored and removed, no check");
  const day = 24 * 3600 * 1000;
  for (const [name, entry, ago] of [
    ["not JSON", "{oops", null],
    ["an array", "[]", null],
    ["null", "null", null],
    ["an id that isn't text", { id: 5, topic: "", freely: true }, 1000],
    ["an id with a slash", { id: "a/b", topic: "", freely: true }, 1000],
    ["an id with a query", { id: "a?speech_id=b", topic: "", freely: true }, 1000],
    ["an empty id", { id: "", topic: "", freely: true }, 1000],
    ["a time in the future", { id: "f-1", topic: "", freely: true }, -3600 * 1000],
    ["31 days old", { id: "o-1", topic: "", freely: true }, 31 * day],
    ["a time that isn't a number", JSON.stringify({ id: "t-1", at: "yesterday", topic: "", freely: true }), null],
    ["a topic that isn't text", { id: "t-2", topic: 7, freely: false }, 1000],
    ["a 500-character topic", { id: "t-3", topic: "x".repeat(500), freely: false }, 1000],
    ["freely that isn't true or false", { id: "t-4", topic: "", freely: "yes" }, 1000]
  ]) {
    const b = await open({ pre: [seedPending(entry, ago)] });
    await sleep(1200);
    const n = await note(b);
    check(`${name}: no check, no note, removed`, n.calls === 0 && !n.open && n.pending === null && n.wall.length === 0, JSON.stringify(n));
    await b.close();
  }

  console.log("\n== hostile topics");
  for (const [name, entryTopic, resultTopic] of [["from storage", XSS, undefined], ["from the server", "", XSS]]) {
    const b = await open({ pre: [seedPending({ id: "x-1", topic: entryTopic, freely: false }, 30 * 1000), "window.__xss = 0;", `window.__result = ${JSON.stringify({ ...RESULT, topic: resultTopic })};`] });
    await b.waitFor("!comebackDialog.hidden", 8000);
    const n = await note(b);
    check(`a hostile topic ${name}: shown as text, nothing made or run`, n.open && n.topic === XSS && !n.xss && (await b.evaluate("!comebackDialog.querySelector('img') && cbTopic.children.length === 0")), JSON.stringify(n));
    await done(b);
  }
}

finish();
