// Feature set 3, stage 4: replay in Your words.
//   keep     the exact WAV that was sent stays in memory for the latest speech only, and nothing else frees it
// Every API call is answered by the fake API stub; nothing reaches AWS.
import { launch, sleep, LIVE, STUB, RESULT, check, finish, only } from "../lib/page.mjs";

const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

// Keeps the bytes of the file that reached the S3 stub
const HOOKS = `(() => {
  const inner = window.fetch;
  window.fetch = async (url, opts = {}) => {
    if (String(url).includes(".s3.") && opts.body && typeof opts.body.get === "function") {
      window.__sentBytes = new Uint8Array(await opts.body.get("file").arrayBuffer());
    }
    return inner(url, opts);
  };
})();`;

async function open({ width = 1280, height = 800, dpr = 1, pre = [], motion = "no-preference" } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: FAKE, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await b.goto(LIVE, [STUB, HOOKS, `window.__result = ${JSON.stringify(RESULT)};`, ...pre]);
  b.waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(60); }
    return false;
  };
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
// Sends a WAV of `seconds` (a tone that changes, so its waveform isn't flat) straight through upload()
const send = (b, seconds = 6, source = "upload") => b.evaluate(`(() => { const n = 16000 * ${seconds}, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (0.2 + 0.2 * Math.sin(i / 8000)) * Math.sin(i / 5);
  upload({ blob: buildWav([toPcm16(x, n)], n), seconds: ${seconds}, source: ${JSON.stringify(source)} }); return true; })()`);
// Sends one speech and waits until its notes show in Backstage
async function sendAndShow(b, seconds = 6, source = "upload") {
  await send(b, seconds, source);
  return b.waitFor("currentView === 'backstage' && !intermissionOn && !appRoot.inert", 20000);
}
// Can the kept recording still be played? (its URL loads in a fresh audio element)
const PLAYABLE = `new Promise(resolve => { if (!replayRecording) return resolve(false); const a = new Audio(); a.onloadedmetadata = () => resolve(a.duration > 0);
  a.onerror = () => resolve(false); a.src = replayRecording.url; setTimeout(() => resolve(false), 4000); })`;

// ---------------------------------------------------------------- keeping the recording
if (!only || only === "keep") {
  console.log("\n== the sent recording is kept in memory");
  const b = await open();
  const storedBefore = await b.evaluate("Object.keys(localStorage).sort().join()");
  for (const source of ["recording", "upload"]) {
    await sendAndShow(b, 6, source);
    const r = await b.evaluate(`(async () => { const kept = new Uint8Array(await replayRecording.blob.arrayBuffer()), sent = window.__sentBytes;
      return { id: replayRecording.id, sameBytes: kept.length === sent.length && kept.every((v, i) => v === sent[i]), seconds: replayRecording.seconds, size: kept.length,
        wall: JSON.parse(localStorage.getItem("speakreview.wall.v1") || "[]").map(e => e.id) }; })()`);
    check(`${source}: kept with its speech ID, byte for byte the WAV that was sent`, r.sameBytes && r.size > 44 && r.seconds === 6 && r.wall.includes(r.id), JSON.stringify(r));
    await b.evaluate("goToView('stage')");
    await b.waitFor("currentView === 'stage' && !appRoot.inert", 5000);
  }
  // Nothing that runs after sending frees it
  await b.evaluate(`clearTake(); discardTake(); true`);
  await b.evaluate(`(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
    const dt = new DataTransfer(); dt.items.add(new File([buildWav([toPcm16(x, n)], n)], "other.wav", { type: "audio/wav" }));
    dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
  await b.waitFor("!!preparedUpload", 15000);
  await b.evaluate(`showFileName(); true`);
  check("clearing the take, discarding it and picking (then dropping) another file leave it playable", await b.evaluate(PLAYABLE) && !(await b.evaluate("window.__revoked.has(replayRecording.url)")));
  // A new send replaces it and frees the old one
  const firstUrl = await b.evaluate("replayRecording.url");
  const firstId = await b.evaluate("replayRecording.id");
  await sendAndShow(b, 4);
  check("a new send replaces it and frees the old recording", (await b.evaluate("replayRecording.id")) !== firstId && (await b.evaluate("replayRecording.seconds")) === 4
    && await b.evaluate(`window.__revoked.has(${JSON.stringify(firstUrl)})`) && await b.evaluate(PLAYABLE));
  const stored = await b.evaluate(`Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k).length, localStorage.getItem(k).includes("RIFF")])`);
  check("never written to storage (no new key, nothing large, no WAV data)", stored.every(([k, n, wav]) => !wav && (k.startsWith("speakreview.wall") || n < 5000))
    && stored.map(([k]) => k).every(k => storedBefore.split(",").includes(k) || /^speakreview\.(wall|trophies|pending|settings)/.test(k)), JSON.stringify(stored));
  await done(b);
}

finish();
