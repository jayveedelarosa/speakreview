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

console.log("\n== icons");
const icons = await b.evaluate(`Promise.all([...document.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon'], link[rel='manifest']")]
  .map(l => fetch(l.href).then(r => ({ rel: l.rel, href: l.getAttribute("href"), status: r.status, type: r.headers.get("content-type") })))
  .concat(["icon-192.png", "icon-512.png"].map(h => fetch(h).then(r => ({ rel: "manifest icon", href: h, status: r.status, type: r.headers.get("content-type") })))))`);
const ICON_TYPES = { "favicon.ico": "image/x-icon", "favicon.svg": "image/svg+xml", "apple-touch-icon.png": "image/png",
  "manifest.json": "application/json", "icon-192.png": "image/png", "icon-512.png": "image/png" };
check("every icon link is in the head once", icons.length === 6 && Object.keys(ICON_TYPES).every(f => icons.filter(i => i.href === f).length === 1), icons.map(i => i.href).join(", "));
for (const i of icons) check(`${i.href} served with its type`, i.status === 200 && i.type === ICON_TYPES[i.href], `${i.status} ${i.type}`);
const icoSizes = await b.evaluate(`fetch("favicon.ico").then(r => r.arrayBuffer()).then(a => {
  const v = new DataView(a);
  return v.getUint16(2, true) === 1 ? Array.from({ length: v.getUint16(4, true) }, (_, i) => v.getUint8(6 + 16 * i)) : [];
})`);
check("favicon.ico holds 16, 32 and 48", icoSizes.join() === "16,32,48", icoSizes.join());
const mf = await b.evaluate(`fetch("manifest.json").then(r => r.json())`);
check("manifest.json fields", mf.name === "SpeakReview" && mf.short_name === "SpeakReview" && mf.start_url === "/" && mf.display === "browser"
  && mf.background_color === "#1A0B0A" && mf.theme_color === "#1A0B0A", JSON.stringify(mf));
check("manifest icons: 192, 512 and 512 maskable", JSON.stringify(mf.icons.map(i => [i.src, i.sizes, i.purpose || "any"]))
  === JSON.stringify([["icon-192.png", "192x192", "any"], ["icon-512.png", "512x512", "any"], ["icon-512.png", "512x512", "maskable"]]));
check("one theme-color", await b.evaluate(`[...document.querySelectorAll("meta[name='theme-color']")].map(m => m.content).join() === "#1A0B0A"`));

console.log("\n== title and share tags");
const TITLE = "SpeakReview: practice your speech with an AI coach";
const DESC = "Record or upload a speech and get coach's notes, a word-by-word replay and a nightly review. Free while in beta.";
const IMG = "https://speakreview.jayveedelarosa.dev/og-image.png";
const ALT = "SpeakReview: practice your speech with an AI coach. A microphone on a theatre stage.";
const TAGS = { "name=description": DESC, "property=og:type": "website", "property=og:site_name": "SpeakReview",
  "property=og:url": "https://speakreview.jayveedelarosa.dev/", "property=og:title": TITLE, "property=og:description": DESC,
  "property=og:image": IMG, "property=og:image:width": "1200", "property=og:image:height": "630", "property=og:image:alt": ALT,
  "name=twitter:card": "summary_large_image", "name=twitter:title": TITLE, "name=twitter:description": DESC,
  "name=twitter:image": IMG, "name=twitter:image:alt": ALT };
const metas = await b.evaluate(`[...document.querySelectorAll("title, meta[name], meta[property]")]
  .map(m => m.tagName === "TITLE" ? ["title", m.textContent] : [m.hasAttribute("property") ? "property=" + m.getAttribute("property") : "name=" + m.name, m.content])`);
check("one title, the new one", JSON.stringify(metas.filter(m => m[0] === "title")) === JSON.stringify([["title", TITLE]]));
for (const [key, value] of Object.entries(TAGS)) {
  const found = metas.filter(m => m[0] === key);
  check(`${key} once, as designed`, found.length === 1 && found[0][1] === value, JSON.stringify(found));
}
check("no other og: or twitter: tags", metas.every(m => !/=(og|twitter):/.test(m[0]) || m[0] in TAGS), metas.map(m => m[0]).join(", "));
const og = await b.evaluate(`fetch("og-image.png").then(async r => { const a = await r.arrayBuffer(); const v = new DataView(a);
  return { status: r.status, type: r.headers.get("content-type"), bytes: a.byteLength, w: v.getUint32(16), h: v.getUint32(20) }; })`);
check("og-image.png is 1200x630 PNG under 600 KB", og.status === 200 && og.type === "image/png" && og.w === 1200 && og.h === 630 && og.bytes < 600 * 1024, JSON.stringify(og));
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
