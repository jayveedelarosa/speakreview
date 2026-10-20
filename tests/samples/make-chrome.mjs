// Makes webm/opus, m4a (AAC), mp4 video, mov video (in Chrome's MediaRecorder) and ogg/opus (WebCodecs + a small Ogg writer)
import { launch } from "../lib/cdp.mjs";
import { LIVE } from "../lib/paths.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const b = await launch();
await b.send("Page.navigate", { url: LIVE });
await new Promise(r => setTimeout(r, 1500));

const rec = await b.evaluate(`(async () => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 200;
  const lp = ctx.createBiquadFilter(); lp.frequency.value = 1200;
  const gain = ctx.createGain(); gain.gain.value = 0;
  const t0 = ctx.currentTime + 0.05;
  for (let t = 0; t < 14; t += 0.65) { gain.gain.setValueAtTime(0.3, t0 + t); gain.gain.setValueAtTime(0, t0 + t + 0.4); }
  const dest = ctx.createMediaStreamDestination();
  osc.connect(lp).connect(gain).connect(dest); osc.start();
  const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
  const g = canvas.getContext("2d"); let k = 0;
  const draw = setInterval(() => { g.fillStyle = "hsl(" + (k++ * 7 % 360) + ",60%,40%)"; g.fillRect(0, 0, 320, 240); }, 66);
  const video = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const jobs = [["webm", "audio/webm;codecs=opus", dest.stream], ["m4a", "audio/mp4;codecs=mp4a.40.2", dest.stream], ["mp4", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", video]];
  const results = await Promise.all(jobs.map(([ext, type, stream]) => new Promise(res => {
    const r = new MediaRecorder(stream, { mimeType: type }); const parts = [];
    r.ondataavailable = e => parts.push(e.data);
    r.onstop = async () => { const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ""; for (const x of buf) s += String.fromCharCode(x); res([ext, btoa(s)]); };
    r.start(); setTimeout(() => r.stop(), 12000);
  })));
  clearInterval(draw);
  return results;
})()`);
for (const [ext, b64] of rec) writeFileSync(`${OUT}/speech.${ext}`, Buffer.from(b64, "base64"));

// mov: the same mp4 with the QuickTime brand ("qt  ") in its ftyp box
const mp4 = Buffer.from(rec.find(r => r[0] === "mp4")[1], "base64");
const mov = Buffer.from(mp4);
if (mov.toString("latin1", 4, 8) === "ftyp") mov.write("qt  ", 8, "latin1");
writeFileSync(`${OUT}/speech.mov`, mov);

// ogg/opus: WebCodecs packets, wrapped in Ogg pages here
const enc = await b.evaluate(`(async () => {
  const rate = 48000, n = rate * 12, x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / rate, c = t % 0.65, f = 180 + 120 * Math.sin(t * 1.3);
    x[i] = c < 0.4 ? Math.sin(Math.PI * c / 0.4) * 0.3 * Math.sin(2 * Math.PI * f * t) : 0; }
  const packets = [];
  const e = new AudioEncoder({ output: ch => { const d = new Uint8Array(ch.byteLength); ch.copyTo(d); let s = ""; for (const v of d) s += String.fromCharCode(v); packets.push([btoa(s), ch.duration]); }, error: err => { throw err; } });
  e.configure({ codec: "opus", sampleRate: rate, numberOfChannels: 1, bitrate: 48000 });
  for (let i = 0; i < n; i += 4800) e.encode(new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: Math.min(4800, n - i), numberOfChannels: 1, timestamp: i / rate * 1e6, data: x.slice(i, i + 4800) }));
  await e.flush();
  return packets;
})()`);
const CRC = new Uint32Array(256).map((_, i) => { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04C11DB7 : r << 1; return r >>> 0; });
const crc = buf => { let c = 0; for (const x of buf) c = ((c << 8) ^ CRC[((c >>> 24) ^ x) & 0xFF]) >>> 0; return c; };
let seq = 0;
function page(data, granule, flags) {
  const lace = []; let L = data.length; while (L >= 255) { lace.push(255); L -= 255; } lace.push(L);
  const h = Buffer.alloc(27 + lace.length);
  h.write("OggS", 0); h[5] = flags; h.writeBigUInt64LE(BigInt(granule), 6); h.writeUInt32LE(0x5352, 14); h.writeUInt32LE(seq++, 18);
  h[26] = lace.length; Buffer.from(lace).copy(h, 27);
  const p = Buffer.concat([h, data]); p.writeUInt32LE(crc(p), 22); return p;
}
const head = Buffer.alloc(19); head.write("OpusHead", 0); head[8] = 1; head[9] = 1; head.writeUInt16LE(312, 10); head.writeUInt32LE(48000, 12);
const vendor = "speakreview-test", tags = Buffer.alloc(16 + vendor.length); tags.write("OpusTags", 0); tags.writeUInt32LE(vendor.length, 8); tags.write(vendor, 12);
const pages = [page(head, 0, 2), page(tags, 0, 0)];
let gran = 312;
enc.forEach(([b64, dur], i) => { gran += Math.round(dur * 48000 / 1e6); pages.push(page(Buffer.from(b64, "base64"), gran, i === enc.length - 1 ? 4 : 0)); });
writeFileSync(`${OUT}/speech.ogg`, Buffer.concat(pages));
writeFileSync(`${OUT}/speech.opus`, Buffer.concat(pages));
console.log("made", rec.map(r => r[0]).join(" "), "mov ogg opus;", enc.length, "opus packets");
await b.close();
