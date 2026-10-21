// Stage 7: hostile text from outside the page shows as plain text, runs nothing, keeps the layout
import { sleep, only, check, finish, open, done } from "../lib/page.mjs";
// Every value that comes from outside (typed, returned by the API, read back from storage, a file's name)
// must show as plain text, run nothing, and never break the layout.
const IMG = `<img src=x onerror="window.__pwn='img'">`;
const SCRIPT = `<script>window.__pwn='script'</script>`;
const SVG = `"'><svg onload="window.__pwn='svg'">`;
const AMP = `&amp; &lt;b&gt; "quoted" 'single'`;
const BOLD = `**<b onclick="window.__pwn='bold'">bold</b>**`;
const LONG = n => "W".repeat(n);                       // no spaces: the hardest case for wrapping
const SIZES = [[1280, 800], [390, 844], [360, 740]];

// Nothing ran, nothing was added as markup, nothing scrolls sideways, and every visible box stays
// inside the window (or inside a parent that clips it)
const SAFE = `(() => {
  const added = [...document.querySelectorAll("img, svg[onload], script:not([src]), b[onclick], iframe, object, embed")]
    .filter(e => !e.closest("svg:not([onload])") || e.matches("svg[onload]"));
  const handlers = [...document.querySelectorAll("*")].filter(e => [...e.attributes].some(a => /^on/i.test(a.name)));
  const clips = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/hidden|auto|scroll|clip/.test(o.overflowX + o.overflow)) return true; } return false; };
  const outside = [...document.querySelectorAll("body *")].filter(e => { if (!e.getClientRects().length) return false;
    const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.position === "fixed") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !clips(e) && !e.closest(".curtain, .drape, .audience, .floor, .valance, [aria-hidden=true]"); })
    .map(e => e.tagName + "." + String(e.className).slice(0, 30));
  const scrollers = [...document.querySelectorAll(".notes-body, .words-body, .review-panel, .perf-scroll, .pb-notes, .pb-review, .wall-scroll, .wall-frames")]
    .filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.className);
  return { pwn: window.__pwn ?? null, added: added.map(e => e.outerHTML.slice(0, 60)), handlers: handlers.map(e => e.tagName), sideways: document.documentElement.scrollWidth - innerWidth, outside, scrollers };
})()`;
async function safe(b, tag) {
  const s = await b.evaluate(SAFE);
  check(`${tag}: nothing ran, no markup or handlers added`, s.pwn === null && !s.added.length && !s.handlers.length, JSON.stringify(s));
  check(`${tag}: no sideways scroll, nothing sticks out`, s.sideways <= 0 && !s.outside.length && !s.scrollers.length, JSON.stringify({ sideways: s.sideways, outside: s.outside.slice(0, 5), scrollers: s.scrollers }));
}
const shows = (b, sel, text) => b.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].some(e => e.textContent.includes(${JSON.stringify(text)}))`);

const HOSTILE_RESULT = {
  wpm: 120, filler_word_total: 3, avg_confidence: 0.8, speaking_seconds: 30, source: "upload",
  topic: `${IMG} ${SVG}`, topic_type: SCRIPT,
  filler_word_breakdown: { [IMG]: 1, [LONG(60)]: 2 },
  ai_feedback: `Strengths:\n1. ${IMG}\n2. ${BOLD}\n3. ${AMP}\nWeaknesses:\n1. ${SCRIPT}\n2. ${LONG(300)}`,
  words: [["Hello", 0, 30, 99], [IMG, 40, 70, 95], [SCRIPT.slice(0, 100), 80, 120, 40], ["um", 130, 150, 95], [LONG(100), 160, 200, 95], [SVG, 210, 240, 95], ["end.", 250, 280, 99]],
  filler_flags: [3, "x", -1, 1e9, IMG, null],
  fillers_judged: true,
  review: { structure: { level: 2, reason: IMG }, clarity: { level: 3, reason: SCRIPT }, on_topic: { level: 4, reason: AMP }, word_choice: { level: 1, reason: LONG(160) } }
};

if (!only || only === "backstage") {
  console.log("\n== Backstage and the playbill: topic, coach's notes, breakdown, words, filler flags, review reasons");
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const b = await open({ width: w, height: h });
    await b.show(HOSTILE_RESULT);
    await safe(b, `${tag} Backstage`);
    check(`${tag}: topic shown literally`, await shows(b, ".perf-topic", `${IMG} ${SVG}`));
    check(`${tag}: unknown topic type shown literally`, await shows(b, ".perf-badge", SCRIPT));
    check(`${tag}: breakdown word shown literally`, await shows(b, ".stat-sub", IMG));
    check(`${tag}: coach's notes shown literally (markup, bold marks, entities)`, (await shows(b, "#coachNotesBody", IMG)) && (await shows(b, "#coachNotesBody", "<b onclick=")) && (await shows(b, "#coachNotesBody", AMP)) && (await shows(b, "#coachNotesBody", SCRIPT)));
    await b.click("#tabWords"); await sleep(250);
    await safe(b, `${tag} Your words`);
    check(`${tag}: words shown literally`, (await shows(b, "#wordsPanel", IMG)) && (await shows(b, "#wordsPanel", SVG)) && (await shows(b, "#wordsPanel", LONG(100))));
    check(`${tag}: bad filler flags ignored, the good one kept`, (await b.evaluate(`document.querySelectorAll("#wordsPanel .w-filler").length`)) >= 1);
    const review = w <= 600 ? "#reviewPanel" : "#perfReview";
    if (w <= 600) { await b.click("#tabReview"); await sleep(250); }
    await safe(b, `${tag} Review`);
    check(`${tag}: review reasons shown literally (160 characters, no spaces, wraps)`, (await shows(b, review, IMG)) && (await shows(b, review, SCRIPT)) && (await shows(b, review, AMP)) && (await shows(b, review, LONG(160))));
    await done(b);
  }
  // A 161-character reason is rejected: no review at all
  const b = await open({ width: 1280, height: 800 });
  await b.show({ ...HOSTILE_RESULT, review: { ...HOSTILE_RESULT.review, word_choice: { level: 1, reason: LONG(161) } } });
  check("a review reason over 160 characters: no review shown", !(await b.evaluate(`[...document.querySelectorAll("#perfReview, #reviewPanel")].some(e => e.textContent.includes("WWWW"))`)));
  // A 5,000-character topic and notes without spaces still wrap
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const p = await open({ width: w, height: h });
    await p.show({ ...HOSTILE_RESULT, topic: LONG(5000), ai_feedback: `Strengths:\n1. ${LONG(5000)}` });
    await safe(p, `${w}x${h} 5,000-character topic and notes`);
    await done(p);
  }
  await done(b);
}

// Hostile entries planted straight into storage, as another script or an old version could leave them
const planted = (n = 3) => Array.from({ length: n }, (_, i) => ({
  id: `${IMG}${i}`, savedAt: new Date(Date.now() - i * 86400000).toISOString(), wpm: 130 + i,
  topic: i === 0 ? LONG(500) : `${IMG} ${SCRIPT}`, topic_type: SVG, time_limit_seconds: 120, speaking_seconds: 100 + i, source: "upload",
  cut_off: false, too_short: false, filler_word_total: 2, filler_word_breakdown: { [IMG]: 1, [SCRIPT]: 1 }, avg_confidence: 0.8,
  ai_feedback: `Strengths:\n1. ${IMG}\n2. ${BOLD}\nWeaknesses:\n1. ${LONG(400)}`,
  words: HOSTILE_RESULT.words, filler_flags: [3], fillers_judged: true, review: HOSTILE_RESULT.review
}));
const BAD = [{ id: 5 }, "text", null, { id: "x", savedAt: "never", wpm: 1 }, { id: "y", savedAt: new Date().toISOString(), wpm: IMG },
  { id: "z", savedAt: new Date().toISOString(), wpm: 100, topic: LONG(501) }];

if (!only || only === "wall") {
  console.log("\n== Wall of Fame: entries read back from storage");
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const b = await open({ width: w, height: h });
    await b.evaluate(`localStorage.setItem("speakreview.wall.v1", ${JSON.stringify(JSON.stringify([...planted(), ...BAD]))}); localStorage.setItem("speakreview.trophies.v1", ${JSON.stringify(JSON.stringify({ days: [IMG], best: SCRIPT }))})`);
    await b.evaluate(`document.querySelector('.main-nav [data-view="wall"]').click()`);
    await sleep(300); await b.settled();
    await safe(b, `${tag} Wall`);
    check(`${tag}: only the 3 good entries hang, bad ones dropped`, (await b.evaluate(`document.querySelectorAll(".wall-row .playbill").length`)) === 3);
    check(`${tag}: frame topics and types shown literally`, (await shows(b, ".playbill-topic", `${IMG} ${SCRIPT}`)) && (await shows(b, ".playbill-type", SVG)));
    check(`${tag}: run board's selected show topic shown literally`, (await b.evaluate(`runSelTopic.textContent.includes("WWWW") || runSelTopic.textContent.includes("<img")`)));
    for (const n of [0, 1]) {
      await b.evaluate(`document.querySelectorAll(".wall-row .playbill")[${n}].click()`);
      await sleep(400);
      await safe(b, `${tag} playbill ${n + 1}`);
      if (n === 1) check(`${tag}: playbill title, type and notes shown literally`, (await shows(b, "#pbTitle", `${IMG} ${SCRIPT}`)) && (await shows(b, "#pbType", SVG)) && (await shows(b, "#pbNotes", "<b onclick=")) && (await shows(b, "#pbBreakdown", IMG)));
      for (const t of ["#pbTabWords", "#pbTabReview"]) {
        if (!(await b.evaluate(`!document.querySelector(${JSON.stringify(t)}).hidden`))) continue;
        await b.click(t); await sleep(250);
        await safe(b, `${tag} playbill ${n + 1} ${t.slice(6)}`);
      }
      await b.evaluate(`pbCloseX.click()`); await sleep(300);
    }
    await done(b);
  }
}

// A WAV built on the page, so the upload can run to the API call
const WAV = name => `(() => { const n = 16000 * 3, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
  return new File([buildWav([toPcm16(x, n)], n)], ${JSON.stringify(name)}, { type: "audio/wav" }); })()`;
const drop = (b, make) => b.evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(${make});
  dropZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);

if (!only || only === "upload") {
  console.log("\n== uploaded file names and API error messages");
  const NAME = `${IMG}${LONG(300)}.wav`;
  const ERRORS = [
    ["400 with a hostile message", 400, JSON.stringify({ message: `${IMG} ${LONG(2000)}` }), `${IMG} ${LONG(2000)}`],
    ["429 daily limit with a script message", 429, JSON.stringify({ error: "visitor_limit", message: SCRIPT }), SCRIPT],
    ["400 with broken JSON", 400, `{"message": "<img src=x onerror=1>`, "Please check your topic and time limit."],
    ["429 daily limit with a message that isn't text", 429, JSON.stringify({ error: "daily_limit", message: { html: IMG } }), null]
  ];
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const b = await open({ width: w, height: h });
    await b.settled();
    // The typed topic, as someone could paste it
    await b.evaluate(`topicInput.value = ${JSON.stringify((IMG + SVG).slice(0, 120))}; topicInput.dispatchEvent(new Event("input", { bubbles: true }))`);
    await sleep(200);
    await safe(b, `${tag} typed topic`);
    await drop(b, WAV(NAME));
    await b.waitFor(`!uploadBtn.hidden || statusText.textContent !== ""`, 30000);
    await safe(b, `${tag} file name`);
    check(`${tag}: file name shown literally, kept on one line inside its box`, await b.evaluate(`(() => { const r = fileNameText.getBoundingClientRect(), p = fileNameText.parentElement.getBoundingClientRect();
      return fileNameText.textContent === ${JSON.stringify(NAME)} && r.right <= p.right + 1 && r.height < 40; })()`));
    for (const [name, status, body, expect] of ERRORS) {
      // The API answers with an error: the message must show as text
      await b.evaluate(`(() => { const inner = window.fetch; window.fetch = async (url, opts) => String(url).includes("/upload-url")
        ? new Response(${JSON.stringify(body)}, { status: ${status}, headers: { "Content-Type": "application/json" } }) : inner(url, opts); window.__restore = () => { window.fetch = inner; }; })()`);
      await b.waitFor(`!uploadBtn.hidden && !uploadBtn.disabled`, 10000);
      await b.evaluate(`statusText.textContent = ""; uploadBtn.click()`);
      await b.waitFor(`statusText.textContent !== "" && !appRoot.inert && !intermissionOn`, 20000);
      await b.settled();
      const text = await b.evaluate(`statusText.textContent`);
      check(`${tag} ${name}: message shown as plain text`, expect === null ? typeof text === "string" && !text.includes("<img") : text === expect, text.slice(0, 80));
      await safe(b, `${tag} ${name}`);
      check(`${tag} ${name}: the message wraps inside its box`, await b.evaluate(`(() => { const r = statusText.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && statusText.scrollWidth <= statusText.clientWidth + 1; })()`));
      await b.evaluate(`window.__restore()`);
    }
    // The topic went to the API as a URL parameter, encoded
    check(`${tag}: typed topic sent encoded, never raw`, await b.evaluate(`__calls.filter(u => u.includes("/upload-url")).every(u => !u.includes("<") && new URL(u).searchParams.get("topic") === ${JSON.stringify((IMG + SVG).slice(0, 120))})`));
    await done(b);
  }
}

finish();
