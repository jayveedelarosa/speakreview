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
  await b.goto(LIVE, [...pre, STUB, HOOKS]);
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
  await shot(b, "ib-giveup");
  await done(b);
}

finish();
