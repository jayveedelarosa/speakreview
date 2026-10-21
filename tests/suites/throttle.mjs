// Feature set 3, stage 1: API Gateway throttling (429) handled calmly.
//   result   GET /result answers 429 (some with hostile bodies) while waiting: no error, gaps grow then reset
//   upload   GET /upload-url throttled once, three times, network errors, our daily limits, hostile bodies
//   take     the same for a recorded take: busy message, take kept, Send works again
// Every reply is scripted inside the page (fake API stub); nothing reaches AWS.
import { launch, sleep, LIVE, STUB, RESULT, XSS, check, finish, only, done, shot } from "../lib/page.mjs";

const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const BUSY = "SpeakReview is busy right now. Please try again in a moment.";
const SCRIPT = "<script>window.__xss=1</script>";

// Scripted replies per path, used before the fake API: { status, body } or "reject" (a network error, as a
// 429 without CORS headers looks to the page). Call times and every status message are recorded.
const CTRL = `(() => {
  window.__plan = { "/upload-url": [], "/result": [] };
  window.__times = { "/upload-url": [], "/result": [] };
  window.__status = [];
  window.__result = ${JSON.stringify(RESULT)};
  const inner = window.fetch;
  window.fetch = async (url, opts) => {
    const u = String(url);
    for (const path of Object.keys(window.__plan)) if (u.includes(path)) {
      window.__times[path].push(performance.now());
      const next = window.__plan[path].shift();
      if (next === "reject") throw new TypeError("Failed to fetch");
      if (next) return new Response(next.body, { status: next.status, headers: { "Content-Type": "application/json" } });
    }
    return inner(url, opts);
  };
  document.addEventListener("DOMContentLoaded", () => {
    const st = document.getElementById("status");
    new MutationObserver(() => window.__status.push(st.textContent)).observe(st, { childList: true, characterData: true, subtree: true });
  });
})();`;

async function page() {
  const b = await launch({ width: 1280, height: 800, flags: FAKE });
  await b.goto(LIVE, [STUB, CTRL]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(100); }
    return false;
  };
  b.settled = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert && !intermissionOn", 15000).then(() => sleep(300));
  await b.settled();
  return b;
}

const plan = (b, path, replies) => b.evaluate(`window.__plan[${JSON.stringify(path)}] = ${JSON.stringify(replies)}; window.__times[${JSON.stringify(path)}] = []; true`);
const T429 = { status: 429, body: JSON.stringify({ message: "Too Many Requests" }) };
const gaps = times => times.slice(1).map((t, i) => (t - times[i]) / 1000);
const near = (got, want, tol) => got.length === want.length && got.every((g, i) => Math.abs(g - want[i]) <= tol);
const fmt = list => list.map(g => g.toFixed(2)).join(", ");
// Nothing from a hostile body reached the page
const CLEAN = `(() => !window.__xss && !document.querySelector("img[src=x]") && !document.body.textContent.includes("onerror")
  && !document.body.textContent.includes("Too Many") && !document.body.textContent.includes("<script>"))()`;

// A WAV built on the page and dropped on the drop zone
const dropWav = b => b.evaluate(`(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
  const file = new File([buildWav([toPcm16(x, n)], n)], "throttle.wav", { type: "audio/wav" });
  const dt = new DataTransfer(); dt.items.add(file);
  dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
async function fileReady(b) {
  if (!(await b.evaluate("!!preparedUpload && !uploadBtn.hidden"))) await dropWav(b);
  return b.waitFor("!!preparedUpload && !uploadBtn.hidden && !uploadBtn.disabled", 20000);
}
// Sends and waits for the curtains to open again; returns where they opened
async function send(b, button, ms = 30000) {
  await b.evaluate(`window.__status = []; ${button}.click(); true`);
  await b.waitFor("intermissionOn", 5000);
  await b.waitFor("!intermissionOn && !appRoot.inert", ms);
  await b.settled();
  return b.evaluate("currentView");
}
const backToStage = async b => { await b.evaluate("backToStageBtn.click()"); await b.waitFor("currentView === 'stage'", 5000); await b.settled(); };
const unlocked = b => b.evaluate("!isBusy && [...optionControls].every(c => !c.disabled)");

// ---------------------------------------------------------------- 1. waiting for the result
if (!only || only === "result") {
  console.log("\n== GET /result throttled while waiting");
  const b = await page();
  await fileReady(b);
  // Throttles (one plain, one hostile JSON, one not JSON), then not finished, then the result
  await plan(b, "/result", [T429, { status: 429, body: JSON.stringify({ message: XSS, error: SCRIPT }) }, { status: 429, body: `${SCRIPT}<b>Too Many</b>` },
    { status: 200, body: "null" }]);
  await b.evaluate(`window.__status = []; uploadBtn.click(); true`);
  // While the 429s come back, Intermission stays up with no error
  let quiet = true;
  for (let i = 0; i < 40 && (await b.evaluate("__times['/result'].length")) < 4; i++) {
    await sleep(500);
    if (!(await b.evaluate("intermissionOn && appRoot.inert"))) quiet = false;
  }
  check("Intermission stays up through the 429s", quiet);
  check("still waiting on the review message", (await b.evaluate("statusText.textContent")) === "Analyzing Performance Patterns...", await b.evaluate("statusText.textContent"));
  check("Backstage opens with the result", await b.waitFor("currentView === 'backstage' && !intermissionOn", 20000));
  await b.settled();
  const g = gaps(await b.evaluate("__times['/result']"));
  check("gaps grow after 429s (8, 10, 10 s) then reset to 4 s", near(g, [8, 10, 10, 4], 0.8), fmt(g));
  const seen = await b.evaluate("__status");
  check("no error or busy message while waiting", seen.every(s => !/error|busy|longer|Too Many|</i.test(s)), JSON.stringify(seen));
  check("result shown", (await b.evaluate("statusText.textContent")) === "Spotlight Ready.");
  check("nothing from the 429 bodies in the page", await b.evaluate(CLEAN));
  await shot(b, "throttle-result");
  await done(b);
}

// ---------------------------------------------------------------- 2. sending an uploaded file
if (!only || only === "upload") {
  console.log("\n== GET /upload-url throttled (uploaded file)");
  const b = await page();

  // Throttled once, then OK
  await fileReady(b);
  await plan(b, "/upload-url", [T429]);
  await b.evaluate(`window.__status = []; uploadBtn.click(); true`);
  check("throttled once: goes through to Backstage", await b.waitFor("currentView === 'backstage' && !intermissionOn", 30000));
  await b.settled();
  let g = gaps(await b.evaluate("__times['/upload-url']"));
  check("throttled once: one retry about 1 s later", near(g, [1], 0.5), fmt(g));
  check("throttled once: no busy message", (await b.evaluate("__status")).every(s => s !== BUSY));
  await backToStage(b);

  // Throttled three times: the calm message, the file kept, Send works again
  await fileReady(b);
  await plan(b, "/upload-url", [T429, T429, T429]);
  let where = await send(b, "uploadBtn");
  g = gaps(await b.evaluate("__times['/upload-url']"));
  check("throttled 3 times: 3 calls, gaps about 1 s then 2 s", near(g, [1, 2], 0.5), fmt(g));
  check("throttled 3 times: busy message on the Stage", where === "stage" && (await b.evaluate("statusText.textContent")) === BUSY, await b.evaluate("statusText.textContent"));
  check("throttled 3 times: controls unlocked", await unlocked(b));
  check("throttled 3 times: file kept, Send enabled", await b.evaluate("!!preparedUpload && fileNameText.textContent === 'throttle.wav' && !uploadBtn.hidden && !uploadBtn.disabled"));
  await shot(b, "throttle-busy-file");
  where = await send(b, "uploadBtn");
  check("Send again goes through", where === "backstage" && (await b.evaluate("statusText.textContent")) === "Spotlight Ready.");
  await backToStage(b);

  // Network errors (a 429 without CORS headers): twice then OK, and three times
  await fileReady(b);
  await plan(b, "/upload-url", ["reject", "reject"]);
  where = await send(b, "uploadBtn");
  g = gaps(await b.evaluate("__times['/upload-url']"));
  check("network error twice: goes through on the third try", where === "backstage" && near(g, [1, 2], 0.5), `${where}; ${fmt(g)}`);
  await backToStage(b);
  await fileReady(b);
  await plan(b, "/upload-url", ["reject", "reject", "reject"]);
  where = await send(b, "uploadBtn");
  check("network error 3 times: busy message, file kept", where === "stage" && (await b.evaluate("statusText.textContent")) === BUSY
    && (await b.evaluate("!!preparedUpload && !uploadBtn.disabled")) && (await unlocked(b)));

  // Our own daily limits: exactly as before, no retry
  const LIMITS = [
    ["visitor_limit", { error: "visitor_limit", message: "You have reached today's limit of 5 speeches. Please come back tomorrow." }, "You have reached today's limit of 5 speeches. Please come back tomorrow."],
    ["daily_limit", { error: "daily_limit", message: "SpeakReview has reached its limit for today. Please try again tomorrow." }, "SpeakReview has reached its limit for today. Please try again tomorrow."],
    ["daily_limit without a message", { error: "daily_limit" }, "Upload limit reached. Please try again later."]
  ];
  for (const [name, body, expect] of LIMITS) {
    await fileReady(b);
    await plan(b, "/upload-url", [{ status: 429, body: JSON.stringify(body) }]);
    where = await send(b, "uploadBtn");
    const text = await b.evaluate("statusText.textContent");
    check(`${name}: same message as before, on the Stage`, where === "stage" && text === expect, text);
    check(`${name}: no retry`, (await b.evaluate("__times['/upload-url'].length")) === 1);
    check(`${name}: file kept, controls unlocked`, (await b.evaluate("!!preparedUpload && !uploadBtn.disabled")) && (await unlocked(b)));
  }

  // Hostile throttle bodies: only the calm message shows
  const HOSTILE = [
    ["hostile JSON message", JSON.stringify({ message: XSS })],
    ["body that isn't JSON", `${SCRIPT}<b>Too Many</b>`],
    ["unknown error with a script message", JSON.stringify({ error: "other", message: SCRIPT })]
  ];
  for (const [name, body] of HOSTILE) {
    await fileReady(b);
    const r = { status: 429, body };
    await plan(b, "/upload-url", [r, r, r]);
    where = await send(b, "uploadBtn");
    check(`${name}: only the busy message`, where === "stage" && (await b.evaluate("statusText.textContent")) === BUSY, await b.evaluate("statusText.textContent"));
    check(`${name}: nothing from the body in the page`, await b.evaluate(CLEAN));
  }
  await done(b);
}

// ---------------------------------------------------------------- 3. sending a recorded take
if (!only || only === "take") {
  console.log("\n== GET /upload-url throttled (recorded take)");
  const b = await page();
  await b.evaluate("micBtn.click()");
  check("recording", await b.waitFor("recState === 'recording'", 10000));
  await sleep(16500);
  await b.evaluate("finishBtn.click()");
  check("review", await b.waitFor("recState === 'review' && !!currentTake && !takeSendBtn.disabled", 5000));
  const take = () => b.evaluate("recState === 'review' && !!currentTake && !currentTake.sent && !takeSendBtn.disabled && currentView === 'stage'");

  await plan(b, "/upload-url", [T429, T429, T429]);
  let where = await send(b, "takeSendBtn");
  check("throttled 3 times: busy message on the Stage", where === "stage" && (await b.evaluate("statusText.textContent")) === BUSY, await b.evaluate("statusText.textContent"));
  check("throttled 3 times: take kept, Send enabled, controls unlocked", (await take()) && (await unlocked(b)));
  await shot(b, "throttle-busy-take");

  await plan(b, "/upload-url", ["reject", "reject", "reject"]);
  where = await send(b, "takeSendBtn");
  check("network error 3 times: busy message, take kept", where === "stage" && (await b.evaluate("statusText.textContent")) === BUSY && (await take()));

  await plan(b, "/upload-url", ["reject", "reject"]);
  where = await send(b, "takeSendBtn");
  check("Send again (network error twice) goes through", where === "backstage" && (await b.evaluate("statusText.textContent")) === "Spotlight Ready." && (await b.evaluate("currentTake && currentTake.sent")));
  check("nothing from any body in the page", await b.evaluate(CLEAN));
  await done(b);
}

finish();
