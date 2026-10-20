// Writes the sample files that Node can make directly (WAV, FLAC, MP3, edge cases)
import { writeFileSync, openSync, ftruncateSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
const OUT = process.argv[2];
const require = createRequire(import.meta.url);

// Speech-like: 400 ms bursts of a buzzy tone, 250 ms gaps
export function speech(rate, seconds, ch = 1) {
  const n = Math.round(rate * seconds), out = [];
  for (let c = 0; c < ch; c++) out.push(new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const t = i / rate, cyc = t % 0.65, on = cyc < 0.4;
    const f = 180 + 120 * Math.sin(t * 1.3);
    const env = on ? Math.sin(Math.PI * cyc / 0.4) : 0;
    const v = env * 0.3 * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)) / 1.75;
    for (let c = 0; c < ch; c++) out[c][i] = v * (c === 0 ? 1 : 0.8);
  }
  return out;
}
function noise(rate, seconds, db) {
  const a = Math.pow(10, db / 20), n = Math.round(rate * seconds), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * a * 1.7;
  return [x];
}
const i16 = v => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
function wav(chs, rate) {
  const n = chs[0].length, c = chs.length, data = n * c * 2, b = Buffer.alloc(44 + data);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(data, 40);
  let o = 44; for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) { b.writeInt16LE(i16(chs[k][i]), o); o += 2; }
  return b;
}
// Minimal FLAC: STREAMINFO plus VERBATIM (uncompressed) frames, mono 16-bit
function crc8(buf) { let c = 0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xFF : (c << 1) & 0xFF; } return c; }
function crc16(buf) { let c = 0; for (const x of buf) { c ^= x << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xFFFF : (c << 1) & 0xFFFF; } return c; }
function flac(x, rate) {
  const BS = 4096, parts = [Buffer.from("fLaC")];
  const si = Buffer.alloc(38); si[0] = 0x80; si.writeUIntBE(34, 1, 3);
  si.writeUInt16BE(BS, 4); si.writeUInt16BE(BS, 6);
  const packed = (BigInt(rate) << 44n) | (0n << 41n) | (15n << 36n) | BigInt(x.length);
  si.writeBigUInt64BE(packed, 14); parts.push(si);
  for (let f = 0, s = 0; s < x.length; f++, s += BS) {
    const len = Math.min(BS, x.length - s);
    const num = f < 0x80 ? [f] : [0xC0 | (f >> 6), 0x80 | (f & 0x3F)];
    const head = Buffer.from([0xFF, 0xF8, 0x79, 0x08, ...num, ((len - 1) >> 8) & 0xFF, (len - 1) & 0xFF]);
    const body = Buffer.alloc(1 + len * 2); body[0] = 0x02;
    for (let i = 0; i < len; i++) body.writeInt16BE(i16(x[s + i]), 1 + i * 2);
    const frame = Buffer.concat([head, Buffer.from([crc8(head)]), body]);
    const foot = Buffer.alloc(2); foot.writeUInt16BE(crc16(frame)); parts.push(frame, foot);
  }
  return Buffer.concat(parts);
}
function mp3(chs, rate) {
  const vm = require("node:vm"); const ctx = {}; vm.createContext(ctx); vm.runInContext(require("node:fs").readFileSync(require.resolve("lamejs/lame.all.js"), "utf8") + ";this.lamejs = lamejs;", ctx); const lamejs = ctx.lamejs;
  const enc = new lamejs.Mp3Encoder(chs.length, rate, 128), out = [];
  const L = Int16Array.from(chs[0], i16), R = chs[1] ? Int16Array.from(chs[1], i16) : null;
  for (let i = 0; i < L.length; i += 1152) {
    const d = R ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : enc.encodeBuffer(L.subarray(i, i + 1152));
    if (d.length) out.push(Buffer.from(d));
  }
  out.push(Buffer.from(enc.flush()));
  return Buffer.concat(out);
}
function sparse(name, mb) { const fd = openSync(`${OUT}/${name}`, "w"); ftruncateSync(fd, mb * 1024 * 1024); closeSync(fd); }

writeFileSync(`${OUT}/speech-44k-stereo.wav`, wav(speech(44100, 20, 2), 44100));
writeFileSync(`${OUT}/silent.wav`, wav(noise(44100, 20, -75), 44100));
writeFileSync(`${OUT}/eleven-min.wav`, wav(speech(8000, 660), 8000));
writeFileSync(`${OUT}/ten-min.wav`, wav(speech(8000, 600), 8000));
writeFileSync(`${OUT}/speech.flac`, flac(speech(44100, 15)[0], 44100));
try { writeFileSync(`${OUT}/speech.mp3`, mp3(speech(44100, 15, 2), 44100)); } catch (e) { console.log("mp3 failed:", e.message); }
writeFileSync(`${OUT}/empty.mp3`, Buffer.alloc(0));
const junk = Buffer.alloc(200000); for (let i = 0; i < junk.length; i++) junk[i] = (i * 2654435761) >>> 24;
writeFileSync(`${OUT}/corrupt.m4a`, junk);
writeFileSync(`${OUT}/notes.txt`, "not audio");
sparse("big-150.mp4", 150);
sparse("big-210.wav", 210);
console.log("done");
