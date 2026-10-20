// CSP-specific checks the Stage 3/4 suites don't cover
import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { CSP, PP } from "../lib/server.mjs";
import { LIVE } from "../lib/paths.mjs";
const URL_ = LIVE;
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};
const b = await launch({ width: 1280, height: 800, flags: FAKE });
await b.goto(URL_, [API_STUB]);
b.waitFor = async (expr, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(100); }
  return false;
};
const visible = sel => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0; })()`);

console.log("== headers and loading");
const h = b.docHeaders[0] || {};
const get = n => Object.entries(h).find(([k]) => k.toLowerCase() === n)?.[1];
check("CSP header sent exactly", get("content-security-policy") === CSP, get("content-security-policy"));
check("Permissions-Policy header sent exactly", get("permissions-policy") === PP);
check("page URL not upgraded to https", (await b.evaluate("location.href")) === URL_);
check("app.js and topics.js ran", await b.evaluate("typeof displayResult === 'function' && typeof escapeHtml === 'function' && Array.isArray(TOPICS)"));
check("styles.css applied", await b.evaluate("getComputedStyle(document.querySelector('.privacy-note')).position !== 'static' || getComputedStyle(document.body).margin === '0px'"));
await b.evaluate("document.fonts.ready");
await b.evaluate("document.fonts.load(\"600 16px 'JetBrains Mono'\")");   // used by the stopwatch, loads on first use
await sleep(500);
const fonts = await b.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))");
for (const fam of ["Fraunces", "Manrope", "JetBrains Mono"]) check(`font loaded: ${fam}`, fonts.includes(fam), [...new Set(fonts)].join(", "));

console.log("\n== start state (hidden attribute)");
check("#waitNote hidden and not shown", await b.evaluate("waitNote.hidden") && !(await visible("#waitNote")));
check("#result hidden and not shown", await b.evaluate("resultBox.hidden") && !(await visible("#result")));
check("no style attribute in the served HTML", await b.evaluate("fetch('/').then(r => r.text()).then(t => !/\sstyle=/i.test(t))"));
await b.click("#navBackstage");
await b.waitFor("currentView === 'backstage' && !document.body.classList.contains('curtains-closed')", 5000);
await sleep(900);
check("Backstage empty state shown", await visible("#resultPlaceholder"));
check("empty heading focused", await b.waitFor("document.activeElement === backstageEmptyTitle", 3000));
await b.click("#navStage");
await b.waitFor("currentView === 'stage'", 5000);
await sleep(900);

console.log("\n== privacy panel");
await b.click("#privacyBtn");
check("privacy note opens", await visible("#privacyNote") && (await b.evaluate("privacyBtn.getAttribute('aria-expanded')")) === "true");
await b.click("#privacyBtn");
check("privacy note closes", !(await visible("#privacyNote")));

console.log("\n== send an MP3: Intermission, wait note, Backstage");
await b.evaluate(`(async () => {
  const ctx = new OfflineAudioContext(1, 16000 * 4, 16000);
  const o = ctx.createOscillator(); o.connect(ctx.destination); o.start();
  await ctx.startRendering();
  const t = new DataTransfer(); t.items.add(new File([buildWav([toPcm16(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5)), 16000)], 16000)], "speech.wav", { type: "audio/wav" }));
  fileInput.files = t.files; fileInput.dispatchEvent(new Event("change"));
})()`);
await b.waitFor("!uploadBtn.hidden && !uploadBtn.disabled", 5000);
await b.click("#uploadBtn");
check("Intermission shows", await b.waitFor("intermissionOn", 5000));
check("wait note unhidden while analyzing", await b.waitFor("!waitNote.hidden", 5000));
check("Backstage with result", await b.waitFor("currentView === 'backstage' && !resultBox.hidden && !intermissionOn", 15000));
check("wait note hidden again", await b.evaluate("waitNote.hidden"));
check("#result is shown", await visible("#result"));
check("empty state hidden", !(await visible("#resultPlaceholder")));
check("clarity bar starts at 0 then grows to 80%", await b.waitFor("document.getElementById('clarityFill').style.width === '80%' && parseFloat(getComputedStyle(clarityFill).width) > 0", 3000));
check("API and S3 really requested (stubbed by CDP)", b.netCalls.some(c => c.startsWith("GET https://jhfndh1s03.execute-api.us-east-1.amazonaws.com/upload-url"))
  && b.netCalls.some(c => c === "POST https://public-speaking-coach-jayvee.s3.amazonaws.com/")
  && b.netCalls.some(c => c.includes("/result?speech_id=")), b.netCalls.join(" | "));
check("notes heading focused", await b.waitFor("document.activeElement === coachNotesTitle", 3000));

console.log("\n== control: the collector catches real violations");
const before = b.violations.length;
await b.evaluate(`document.body.insertAdjacentHTML("beforeend", '<div id="ctl" style="color:red" onclick="1"></div>'); document.getElementById("ctl").click(); true`);
await b.evaluate(`window.__nativeFetch("https://example.com/").catch(() => 0)`);
// DevTools lifts the eval check while it evaluates, so eval runs later from a timer
await b.evaluate(`setTimeout(() => { try { eval("1"); window.__ev = "ran"; } catch (e) { window.__ev = "blocked"; } }, 0); true`);
await sleep(200);
check("eval blocked", (await b.evaluate("window.__ev")) === "blocked");
await sleep(500);
const ctl = b.violations.slice(before);
check("inline style reported", ctl.some(v => v.includes("style-src")), ctl.length + " reported");
check("inline handler reported", ctl.some(v => v.includes("script-src") && v.includes("inline")));
check("eval reported", ctl.some(v => v.includes("eval")));
check("unknown origin reported", ctl.some(v => v.includes("connect-src") && v.includes("example.com")));
b.violations.splice(before);   // expected ones, not counted

const errs = b.consoleErrors.filter(e => !/example\.com|Failed to fetch|EvalError|unsafe-eval/i.test(e));
check("no console errors", errs.length === 0, errs.join(" | "));
check("no CSP violations in normal use", b.violations.length === 0, b.violations.join(" | "));
await b.close();
console.log(`\n${failures ? failures + " FAILED" : "ALL PASSED"}`);
process.exit(failures ? 1 : 0);
