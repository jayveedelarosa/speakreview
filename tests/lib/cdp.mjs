// Minimal Chrome DevTools Protocol driver (no dependencies; uses Node 22's global WebSocket).
// The API is never called for real: suites stub fetch inside the page, and any request that still goes
// to the API or S3 addresses is answered here by Chrome's Fetch domain (see launch()).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { OUTPUT, SHOTS } from "./paths.mjs";

// Google Chrome: the CHROME environment variable, or the usual Windows install folders
const CHROME = [process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")]
  .find(path => path && existsSync(path));
if (!CHROME) throw new Error("Google Chrome not found. Install it, or set CHROME to the path of chrome.exe.");
// A page call that takes longer than this fails instead of hanging the run
const EVAL_TIMEOUT = 90000;
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Stubs the API inside the page, so nothing real is uploaded
export const API_STUB = `
(() => {
  window.__calls = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    url = String(url);
    window.__calls.push(url);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/upload-url")) {
      const wav = url.includes("format=wav");
      return json({ fileId: "test1", upload: { url: "https://public-speaking-coach-jayvee.s3.amazonaws.com/", fields: { key: "uploads/test1." + (wav ? "wav" : "mp3"), "Content-Type": wav ? "audio/wav" : "audio/mpeg" } } });
    }
    if (url === "https://public-speaking-coach-jayvee.s3.amazonaws.com/") {
      const fd = opts.body;
      const file = fd.get("file");
      const buf = new Uint8Array(await file.arrayBuffer());
      const fields = [];
      for (const [k, v] of fd.entries()) fields.push(k);
      window.__captured = { header: Array.from(buf.slice(0, 44)), size: buf.length, name: file.name, type: file.type, fields,
        firstSamples: [new Int16Array(buf.buffer.slice(44, 44 + Math.floor((buf.length - 44) / 2) * 2)).reduce((m, v) => Math.max(m, Math.abs(v)), 0)] };
      return new Response(null, { status: 204 });
    }
    if (url.includes("/result")) return json({ wpm: 120, filler_word_total: 1, avg_confidence: 0.8, ai_feedback: "Strengths:\\n1. Clear.", speaking_seconds: 17 });
    return realFetch(url, opts);
  };
})();`;

// CSP harness: violations are reported through a CDP binding (survives reloads), and every API / S3
// call is first sent for real to the real origin (answered by CDP Fetch), so connect-src is checked.
const COLLECTOR = `
  if (!window.__collectorOn) {
  window.__collectorOn = true;     // goto() can register this twice in one page; it runs once
  window.__nativeFetch = window.fetch;
  // Records revoked object URLs, so tests don't need fetch(blob:) (which connect-src blocks) to check revocation
  window.__revoked = new Set();
  const realRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = u => { window.__revoked.add(String(u)); return realRevoke.call(URL, u); };
  document.addEventListener("securitypolicyviolation", e => __cspReport(JSON.stringify({
    directive: e.violatedDirective, blocked: e.blockedURI, file: e.sourceFile, line: e.lineNumber, sample: e.sample })), true);
  }`;
const PROBE = `
(() => {
  const inner = window.fetch, native = window.__nativeFetch;
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith("https://jhfndh1s03.execute-api.us-east-1.amazonaws.com/") || u.startsWith("https://public-speaking-coach-jayvee.s3.")) await native(u, opts);
    return inner(url, opts);
  };
})();`;
export const allViolations = [];
export const S3_URL = "https://public-speaking-coach-jayvee.s3.amazonaws.com/";

export async function launch({ width = 1280, height = 800, flags = [], mobile = false } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "srchrome-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required",
    `--window-size=${width},${height}`, ...flags, "about:blank"
  ], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 150; i++) {
    try {
      // Never wait long on one try: a stalled Chrome must fail the suite, not hang it
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
      target = list.find(t => t.type === "page");
      if (target) break;
    } catch {}
    await sleep(200);
  }
  if (!target) { proc.kill(); throw new Error(`Chrome didn't start (${CHROME})`); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const opened = await new Promise(r => {
    ws.addEventListener("open", () => r(true), { once: true });
    ws.addEventListener("error", () => r(false), { once: true });
    setTimeout(() => r(false), 15000);
  });
  if (!opened) { proc.kill(); throw new Error(`Chrome didn't start (${CHROME}): its DevTools connection didn't open`); }
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach(l => l(msg));
    }
  });
  const send = (method, params = {}, timeout = EVAL_TIMEOUT) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { if (pending.delete(mid)) reject(new Error(`${method} took longer than ${timeout / 1000}s`)); }, timeout);
    pending.set(mid, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const consoleErrors = [];
  listeners.push(msg => {
    if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push(msg.params.args.map(a => a.value ?? a.description).join(" "));
  });
  const violations = [], netCalls = [], docHeaders = [];
  listeners.push(msg => {
    if (msg.method === "Runtime.bindingCalled" && msg.params.name === "__cspReport") violations.push("event " + msg.params.payload);
    if (msg.method === "Log.entryAdded" && /Content.Security.Policy|Refused to|Permissions.policy/i.test(msg.params.entry.text)) violations.push("log " + msg.params.entry.text);
    if (msg.method === "Network.responseReceived" && msg.params.type === "Document") docHeaders.push(msg.params.response.headers);
    if (msg.method === "Fetch.requestPaused") {
      const { requestId, request } = msg.params;
      netCalls.push(request.method + " " + request.url);
      const isS3 = request.url.includes(".s3.");
      // (the methods and headers answer the CORS preflight of POST /rating, as the real API does)
      send("Fetch.fulfillRequest", { requestId, responseCode: isS3 ? 204 : 200,
        responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { name: "Access-Control-Allow-Headers", value: "content-type" }, { name: "Content-Type", value: "application/json" }],
        body: isS3 ? "" : Buffer.from("{}").toString("base64") }).catch(() => {});
    }
  });
  await send("Runtime.enable");
  await send("Runtime.addBinding", { name: "__cspReport" });
  await send("Log.enable");
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [
    { urlPattern: "https://jhfndh1s03.execute-api.us-east-1.amazonaws.com/*" },
    { urlPattern: "https://public-speaking-coach-jayvee.s3*" }] });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function goto(url, preScripts = []) {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: COLLECTOR });
    for (const source of preScripts) await send("Page.addScriptToEvaluateOnNewDocument", { source });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
    await send("Page.navigate", { url });
    for (let i = 0; i < 50; i++) {
      await sleep(200);
      if (await evaluate("document.readyState === 'complete' && typeof micSupported !== 'undefined'").catch(() => false)) break;
    }
    await evaluate("document.fonts.ready.then(() => true)");
    await sleep(300);
  }
  // Screenshots go to .output/shots (a suite may pass "shots/name.png" or a full path in that folder)
  async function shot(path) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, basename(String(path))), Buffer.from(r.data, "base64"));
  }
  async function click(selector) {
    return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("missing ${selector}"); if (el.disabled) return "disabled"; el.click(); return "clicked"; })()`);
  }
  async function close() {
    await sleep(300);
    const where = new Error().stack.split(/\r?\n/)[2].trim();
    if (violations.length) {
      console.log(`  !! ${violations.length} CSP/permissions violation(s) (${where}):`);
      violations.forEach(v => console.log("     " + v));
      mkdirSync(OUTPUT, { recursive: true });
      appendFileSync(join(OUTPUT, "violations.log"), violations.map(v => where + " " + v).join(String.fromCharCode(10)) + String.fromCharCode(10));
    }
    allViolations.push(...violations);
    // The browser can exit before it answers, so never wait more than a second for the reply
    try { await Promise.race([send("Browser.close"), sleep(1000)]); } catch {}
    proc.kill();
    // The throwaway browser profile; Chrome may still hold it for a moment, so this never fails the test
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
  return { send, evaluate, goto, shot, click, close, consoleErrors, violations, netCalls, docHeaders, listeners };
}
