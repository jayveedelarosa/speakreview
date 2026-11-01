// Makes the README screenshots in docs/screenshots/ with the test tools' Chrome and fake API.
// Never deployed. No AWS call is made: the page's fetch is replaced by the tests' stub, and Chrome
// answers any API or S3 address itself (tests/lib/cdp.mjs). Run from anywhere after `cd tests && npm install` once:
//   node design/feature-set-3/make-readme-screenshots.mjs
// Shot names after the command make only those shots (no names = all), so the other files stay as they are:
//   node design/feature-set-3/make-readme-screenshots.mjs stage-phone
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import { launch, sleep } from "../../tests/lib/cdp.mjs";
import { startServer } from "../../tests/lib/server.mjs";
import { STUB } from "../../tests/lib/page.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "screenshots");
const PORT = 8775;                   // its own port, so a test run can go on at the same time
const URL_ = `http://127.0.0.1:${PORT}/`;
const MAX_BYTES = 400 * 1024;
mkdirSync(OUT, { recursive: true });

// ---- The sample speech: "Hire me", about 50 seconds
const SPEECH = "Good evening. Um, I want to tell you why you should hire me. Three years ago I joined a small team that was, like, " +
  "drowning in support tickets. I didn't wait to be asked. I built a simple dashboard, I trained two new people, and within six months " +
  "our reply time dropped by half. So, uh, what does that mean for you? It means I notice problems early, I fix them without fuss, " +
  "and I bring people along with me. I am curious, I am reliable, and I actually enjoy the hard parts of the job. Hire me, and you get " +
  "someone who will make your team's day a little easier, every single day. Thank you.";
const UNCLEAR = new Set(["drowning", "dashboard,"]);
// [word, start, end, confidence], times in hundredths of a second
function speechWords() {
  const list = [];
  let t = 40;
  for (const w of SPEECH.split(" ")) {
    const len = 22 + Math.min(w.length, 10) * 3;
    list.push([w, t, t + len, UNCLEAR.has(w) ? 48 : 96]);
    t += len + (/[.?]$/.test(w) ? 55 : /,$/.test(w) ? 25 : 8);
  }
  return list;
}
const WORDS = speechWords();
const SECONDS = Math.ceil(WORDS.at(-1)[2] / 100) + 1;
const RESULT = {
  wpm: Math.round(WORDS.length / (SECONDS / 60)), filler_word_total: 4, filler_word_breakdown: { um: 1, uh: 1, like: 1, actually: 1 },
  avg_confidence: 0.91, speaking_seconds: SECONDS, time_limit_seconds: 60, source: "recording", topic: "Hire me",
  ai_feedback: [
    "Strengths:",
    "1. You opened with a clear promise: why they should hire you.",
    "2. The support ticket story gives real proof, with numbers (reply time cut by half).",
    "3. A strong, short close that repeats the ask.",
    "Weaknesses:",
    "1. A few fillers (um, uh, like) in the first half soften the start.",
    "2. The middle lists three qualities quickly, so none of them sticks.",
    "Improvement tips:",
    "1. Pause instead of saying um after the greeting.",
    "2. Pick one quality and give it a ten-second example.",
    "Staying on topic:",
    "1. Every part answered the question of why you should be hired.",
    "Time management:",
    "1. Just under a minute, inside your time, with room for one more example."
  ].join("\n"),
  review: {
    structure: { level: 4, reason: "Promise, proof, then the ask: easy to follow." },
    clarity: { level: 3, reason: "Clear sentences, a little rushed in the middle." },
    on_topic: { level: 4, reason: "Every sentence argued for hiring you." },
    word_choice: { level: 2, reason: "\"Like\" and \"actually\" weakened two strong lines." }
  },
  words: WORDS
};

// ---- Opening the page with the fake API
async function open(width, height) {
  const b = await launch({ width, height, mobile: width <= 600 });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.goto(URL_, [STUB, `window.__result = null;`]);
  b.waitFor = async (expr, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(100); }
    throw new Error(`waited too long for: ${expr}`);
  };
  b.calm = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert");
  await b.calm();
  return b;
}
// Sends a tone of the speech's length through the app's own upload(), so the replay radio has a recording
const send = b => b.evaluate(`(() => { const n = 16000 * ${SECONDS}, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (0.2 + 0.2 * Math.sin(i / 8000)) * Math.sin(i / 5);
  upload({ blob: buildWav([toPcm16(x, n)], n), seconds: ${SECONDS}, source: "recording" }); return true; })()`);
const typeTopic = b => b.evaluate(`(() => { topicInput.value = "Hire me"; topicInput.dispatchEvent(new Event("input", { bubbles: true })); topicInput.blur(); return true; })()`);
// Types the topic, sends the speech, lets the fake API answer with the result, and waits for Backstage
async function toBackstage(b) {
  await typeTopic(b);
  await b.evaluate(`window.__result = ${JSON.stringify(RESULT)}; true`);
  await send(b);
  await b.waitFor("currentView === 'backstage' && !intermissionOn");
  await b.calm();
  await sleep(1500);
}

// ---- Lossless PNG squeeze: the same pixels, each row re-filtered (the filter giving the smallest sum) and deflated at level 9
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function squeeze(png) {
  const chunks = [];
  for (let i = 8; i < png.length;) { const len = png.readUInt32BE(i); chunks.push({ type: png.toString("latin1", i + 4, i + 8), data: png.subarray(i + 8, i + 8 + len) }); i += 12 + len; }
  const ihdr = chunks[0].data, w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), bpp = { 2: 3, 6: 4 }[ihdr[9]];
  if (ihdr[8] !== 8 || !bpp || ihdr[12] !== 0) return png;            // only 8-bit RGB or RGBA, not interlaced
  const src = inflateSync(Buffer.concat(chunks.filter(c => c.type === "IDAT").map(c => c.data)));
  const stride = w * bpp, raw = Buffer.alloc(h * stride), out = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {                                        // undo Chrome's filters
    const f = src[y * (stride + 1)], row = src.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? raw[y * stride + x - bpp] : 0, b = y ? raw[(y - 1) * stride + x] : 0, c = x >= bpp && y ? raw[(y - 1) * stride + x - bpp] : 0;
      raw[y * stride + x] = (row[x] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;
    }
  }
  const cand = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {                                        // pick the best filter for each row
    let best = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? raw[y * stride + x - bpp] : 0, b = y ? raw[(y - 1) * stride + x] : 0, c = x >= bpp && y ? raw[(y - 1) * stride + x - bpp] : 0;
        const v = (raw[y * stride + x] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;
        cand[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < best) { best = sum; out[y * (stride + 1)] = f; cand.copy(out, y * (stride + 1) + 1); }
    }
  }
  const idat = deflateSync(out, { level: 9, memLevel: 9 });
  return Buffer.concat([png.subarray(0, 8), chunk("IHDR", ihdr), ...chunks.filter(c => !["IHDR", "IDAT", "IEND"].includes(c.type)).map(c => chunk(c.type, c.data)),
    chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// PNG under 400 KB (squeezed if needed); otherwise the same picture as a JPG at quality 85 (same size)
async function save(b, name) {
  await b.evaluate("document.fonts.ready.then(() => true)");
  await b.evaluate("document.activeElement && document.activeElement.blur(); true");   // no focus ring in the picture
  await sleep(400);
  let data = Buffer.from((await b.send("Page.captureScreenshot", { format: "png" })).data, "base64");
  let file = `${name}.png`;
  if (data.length > MAX_BYTES) {
    const squeezed = squeeze(data);
    console.log(`${file}  ${Math.round(data.length / 1024)} KB from Chrome, ${Math.round(squeezed.length / 1024)} KB squeezed`);
    data = squeezed;
  }
  if (data.length > MAX_BYTES) {
    data = Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality: 85 })).data, "base64");
    file = `${name}.jpg`;
  }
  writeFileSync(join(OUT, file), data);
  console.log(`${file}  ${Math.round(data.length / 1024)} KB`);
  await b.close();
}

const SHOTS = {
  // 1. The Stage, with the topic typed
  "stage-laptop": async () => {
    const b = await open(1440, 900);
    await typeTopic(b);
    await save(b, "stage-laptop");
  },
  // 2. Intermission on Act II: the upload is done, and /result keeps answering "not ready"
  "intermission": async () => {
    const b = await open(1440, 900);
    await typeTopic(b);
    await send(b);
    await b.waitFor(`document.querySelector('.ib-act[data-act="2"]').dataset.state === "now"`);
    await sleep(800);
    await save(b, "intermission");
  },
  // 3. Backstage: the coach's notes and the numbers
  "coach-notes": async () => {
    const b = await open(1440, 900);
    await toBackstage(b);
    await save(b, "coach-notes");
  },
  // 4. Your words: the replay radio, and one word highlighted by jumping the replay to it
  "word-replay": async () => {
    const b = await open(1440, 900);
    await toBackstage(b);
    await b.evaluate("document.getElementById('tabWords').click(); true");
    await sleep(600);
    await b.evaluate(`(() => { const w = [...wordsPanel.querySelectorAll("[data-t]")].find(e => e.textContent.startsWith("dashboard")); w.click(); return true; })()`);
    await sleep(600);
    await save(b, "word-replay");
  },
  // 5. The results on a phone
  "phone": async () => {
    const b = await open(390, 844);
    await toBackstage(b);
    await save(b, "phone");
  },
  // 6. The Stage on a phone, with the topic typed
  "stage-phone": async () => {
    const b = await open(390, 844);
    await typeTopic(b);
    await save(b, "stage-phone");
  }
};

const names = process.argv.slice(2);
const pick = names.length ? names : Object.keys(SHOTS);
const unknown = pick.filter(n => !SHOTS[n]);
if (unknown.length) {
  console.error(`Unknown shot: ${unknown.join(", ")}. Shots: ${Object.keys(SHOTS).join(", ")}`);
  process.exit(1);
}

const server = await startServer({ port: PORT });
for (const n of pick) await SHOTS[n]();
server.close();
