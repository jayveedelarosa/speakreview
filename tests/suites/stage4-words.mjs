// Stage 4: Your words (the transcript), tabs, Wall words, full storage
import { sleep, LIVE, SHOTS, only, check, finish, XSS, WORDS, VISIBLE, longWords, RESULT, open, done, shot, contrast, COLOR_CONTRAST, MARKS, contrastOk, READ } from "../lib/page.mjs";
// ---------------------------------------------------------------- rendering
if (!only || only === "render") {
  console.log("\n== rendering the marks");
  const b = await open();
  await b.show({ ...RESULT, words: WORDS });
  check("opens on Coach's notes (default tab)", await b.evaluate(`tabNotes.getAttribute("aria-selected") === "true" && !coachNotesBody.hidden && wordsPanel.hidden`));
  await b.mouse("#tabWords");
  const r = await b.evaluate(READ);
  check("words shown as flowing text, punctuation kept", r.visible === VISIBLE, r.visible);
  check("fillers marked: um, Umm, uh., erm (filler wins over unclear)", JSON.stringify(r.fillers) === JSON.stringify(["um,", "Umm", "uh.", "erm"]), JSON.stringify(r.fillers));
  check("Ah, and ahh are not fillers", !r.fillers.some(w => /^ah/i.test(w)) && !r.unclear.some(w => /^ah/i.test(w)));
  check("unclear: below 50 only (49 marked, 50 not)", JSON.stringify(r.unclear) === JSON.stringify(["failure", "mumble"]), JSON.stringify(r.unclear));
  check("one 3.4s pause pill with icon; 2.9s gap shows none", r.pauses.length === 1 && r.pauses[0][0] === "3.4s" && r.pauses[0][1] === "Long pause, 3.4 seconds" && r.pauses[0][2] === "img" && r.pauses[0][3], JSON.stringify(r.pauses));
  check("screen readers hear (filler) and (unclear); unclear has a title", r.srFiller.every(t => t === " (filler)") && r.srFiller.length === 4 && r.srUnclear.length === 2 && r.title === "The transcription was unsure about this word");
  check("legend counts: Filler 4, Long pause 1, Unclear 2", JSON.stringify(r.legend) === JSON.stringify(["Filler, 4", "Long pause, 1", "Unclear, 2"]), JSON.stringify(r.legend));
  check("note under the words", r.note === "Long pauses are 3 seconds or more, and are not a mistake: pausing is often better than saying um. Unclear words are ones the transcription was unsure about.");
  check("<img onerror> word is text: no img, nothing ran", r.img === 0 && !r.xss && r.visible.includes(XSS));
  check("malformed items skipped", (await b.evaluate(`cleanWords(${JSON.stringify(WORDS)}).length`)) === 18);
  const marks = await b.evaluate(`(() => { const s = e => getComputedStyle(e); const f = s(document.querySelector("#wordsPanel .words-text .w-filler")), u = s(document.querySelector("#wordsPanel .words-text .w-unclear")), p = s(document.querySelector("#wordsPanel .words-text .w-pause"));
    return { filler: [f.borderBottomStyle, f.borderBottomWidth, f.backgroundColor], unclear: [u.fontStyle, u.borderBottomStyle], pause: [p.borderTopStyle, p.borderRadius] }; })()`);
  check("not color alone: filler solid underline + highlight, unclear italic + dashed, pause dashed pill", marks.filler[0] === "solid" && marks.filler[1] === "2px" && marks.unclear[0] === "italic" && marks.unclear[1] === "dashed" && marks.pause[0] === "dashed", JSON.stringify(marks));
  if (SHOTS) await shot(b, "words-1280");
  contrastOk(await contrast(b, 1280, 800, [".feedback-tab", "#wordsPanel .words-key", "#wordsPanel > .words-note"]), "words view (dark): tabs, legend, note");
  contrastOk(await b.evaluate(COLOR_CONTRAST(MARKS("#wordsPanel"))), "words view (dark): text and marks");

  // Empty, missing, too short
  await b.show({ ...RESULT, words: [] });
  await b.mouse("#tabWords");
  check("empty list: plain line, no legend", (await b.evaluate(`wordsPanel.textContent`)) === "No words were picked up in this take." && (await b.evaluate(`wordsPanel.querySelector(".words-legend") === null`)));
  await b.show({ ...RESULT });
  await b.mouse("#tabWords");
  check("missing field: older-result line", (await b.evaluate(`wordsPanel.textContent`)) === "The word-by-word view isn't available for this performance.");
  await b.show({ ...RESULT, words: "junk" });
  await b.mouse("#tabWords");
  check("a non-list words field counts as missing", (await b.evaluate(`wordsPanel.textContent`)) === "The word-by-word view isn't available for this performance.");
  await b.show({ too_short: true, wpm: 0, ai_feedback: "That was short.", words: [["Hello", 0, 40, 95], ["there.", 45, 90, 95]] });
  check("too short: Coach's notes as in Stage 3", (await b.evaluate(`coachNotesBody.querySelector(".note-short")?.textContent === "That was short." && document.getElementById("notesHint").hidden`)));
  await b.mouse("#tabWords");
  check("too short: words still shown", (await b.evaluate(READ)).visible === "Hello there.");
  await done(b);

  // The real path: polling a result with words
  console.log("\n== polling path");
  const p = await open();
  await p.evaluate(`window.__result = ${JSON.stringify({ ...RESULT, words: WORDS })}`);
  await p.evaluate(`(() => { const n = 16000 * 2, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i / 5);
    const t = new DataTransfer(); t.items.add(new File([buildWav([toPcm16(x, n)], n)], "s.wav", { type: "audio/wav" })); fileInput.files = t.files; showFileName(); })()`);
  await p.waitFor("!uploadBtn.hidden");
  await p.mouse("#uploadBtn");
  check("polled result reaches Backstage", await p.waitFor(`currentView === "backstage" && !intermissionOn`, 20000));
  await p.settled();
  await p.mouse("#tabWords");
  check("polled result: words rendered", (await p.evaluate(READ)).visible === VISIBLE);
  const saved = await p.evaluate(`JSON.parse(localStorage.getItem("speakreview.wall.v1"))[0].words.length`);
  check("polled result: words saved on the wall (cleaned)", saved === 18, String(saved));
  await done(p);
}

// ---------------------------------------------------------------- 1,500 words
if (!only || only === "long") {
  console.log("\n== 1,500 words (10 minutes)");
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const b = await open({ width: w, height: h });
    const words = longWords();
    const ms = await b.evaluate(`(() => { const t = performance.now(); const f = buildWordsView(cleanWords(${JSON.stringify(words)})); return performance.now() - t; })()`);
    check(`${w}x${h}: builds in well under a second`, ms < 300, `${ms.toFixed(1)} ms`);
    await b.show({ ...RESULT, speaking_seconds: 600, words });
    await b.mouse("#tabWords");
    await sleep(200);
    const s = await b.evaluate(`(() => { const body = wordsPanel.querySelector(".words-body"); return { sh: body.scrollHeight, ch: body.clientHeight, mask: getComputedStyle(body).maskImage || getComputedStyle(body).webkitMaskImage,
      count: [...wordsPanel.querySelectorAll(".words-text .w-filler")].length, hint: !document.getElementById("notesHint").hidden }; })()`);
    check(`${w}x${h}: scrolls inside the panel with the fade`, s.sh > s.ch * 3 && /gradient/.test(s.mask), `${s.sh} / ${s.ch}`);
    check(`${w}x${h}: "Scroll for more" hint shows on Your words when it scrolls (laptop; phones use the fade only)`, w <= 600 ? true : s.hint);
    await b.evaluate(`wordsPanel.querySelector(".words-body").scrollTop = 1e9`);
    await sleep(200);
    const end = await b.evaluate(`(() => { const body = wordsPanel.querySelector(".words-body"), r = body.getBoundingClientRect();
      const t = wordsPanel.querySelector(".words-text"); const range = document.createRange(); range.selectNodeContents(t); const rects = range.getClientRects(); const last = rects[rects.length - 1];
      const fadeStart = r.bottom - (innerWidth <= 600 ? 26 : 40); return { lastBottom: last.bottom, fadeStart, bottom: r.bottom }; })()`);
    check(`${w}x${h}: the last line is reachable, above the fade`, end.lastBottom <= end.fadeStart + 1, JSON.stringify(end));
    await shot(b, `words-long-${w}x${h}`);
    await done(b);
  }
}

// ---------------------------------------------------------------- tabs by keyboard
if (!only || only === "tabs") {
  console.log("\n== tabs by keyboard");
  const b = await open();
  await b.show({ ...RESULT, words: WORDS });
  const state = () => b.evaluate(`({ sel: [tabNotes, tabWords].map(t => t.getAttribute("aria-selected")).join(), tabi: [tabNotes.tabIndex, tabWords.tabIndex].join(), notes: coachNotesBody.hidden, words: wordsPanel.hidden, focus: document.activeElement.id })`);
  check("roles: tablist, tab, tabpanel linked", await b.evaluate(`backstageTabs.selected() === "tabNotes" && document.getElementById("backstageTabs").getAttribute("role") === "tablist" && tabWords.getAttribute("aria-controls") === "wordsPanel" && wordsPanel.getAttribute("aria-labelledby") === "tabWords" && coachNotesBody.getAttribute("role") === "tabpanel"`));
  await b.evaluate("tabNotes.focus()");
  let s = await state();
  check("start: Coach's notes selected, only it is a Tab stop", s.sel === "true,false" && s.tabi === "0,-1" && !s.notes && s.words, JSON.stringify(s));
  await b.key("ArrowRight"); s = await state();
  check("ArrowRight: Your words selected and focused", s.sel === "false,true" && s.tabi === "-1,0" && s.notes && !s.words && s.focus === "tabWords", JSON.stringify(s));
  await b.key("ArrowRight"); s = await state();
  check("ArrowRight wraps to Coach's notes", s.sel === "true,false" && s.focus === "tabNotes");
  await b.key("ArrowLeft"); s = await state();
  check("ArrowLeft wraps to Your words", s.sel === "false,true" && s.focus === "tabWords");
  await b.key("Home"); s = await state();
  check("Home: first tab", s.sel === "true,false" && s.focus === "tabNotes");
  await b.key("End"); s = await state();
  check("End: last tab", s.sel === "false,true" && s.focus === "tabWords");
  await b.key("Tab");
  check("Tab from the tabs goes into the words (scrollable, focusable)", await b.evaluate(`document.activeElement.classList.contains("words-body")`));
  await b.key("Tab", true);
  check("Shift+Tab back to the selected tab", (await b.evaluate("document.activeElement.id")) === "tabWords");
  await b.show({ ...RESULT, words: WORDS });
  s = await state();
  check("a new result opens on Coach's notes again", s.sel === "true,false" && !s.notes && s.words);
  check("focus goes to the (hidden) feedback heading as before", (await b.evaluate("document.activeElement.id")) === "coachNotesTitle");
  await done(b);
}

// ---------------------------------------------------------------- wall
if (!only || only === "wall") {
  console.log("\n== Wall of Fame: words for the latest 30 only");
  const b = await open();
  const words = longWords();
  await b.evaluate(`(async () => { for (let i = 1; i <= 35; i++) { saveToWall("p" + i, ${JSON.stringify({ ...RESULT, speaking_seconds: 600, words })}); await new Promise(r => setTimeout(r, 4)); } })()`);
  const st = await b.evaluate(`(() => { const raw = localStorage.getItem("speakreview.wall.v1"); const list = JSON.parse(raw);
    return { n: list.length, withWords: list.filter(e => Array.isArray(e.words)).map(e => e.id), size: raw.length, order: list.map(e => e.id).slice(0, 3) }; })()`);
  const expect = Array.from({ length: 30 }, (_, i) => "p" + (35 - i));
  check("35 saved, all on the wall", st.n === 35, String(st.n));
  check("only the newest 30 keep their words", JSON.stringify(st.withWords) === JSON.stringify(expect), st.withWords.slice(-3).join());
  check(`storage size stays safe (${(st.size / 1048576).toFixed(2)} M characters for 35 shows of 1,500 words)`, st.size < 2.5 * 1048576);
  // The playbill
  await b.evaluate(`goToView("wall")`);
  await b.settled();
  await b.evaluate(`wallButtons.get("p35").click()`);
  await sleep(300);
  check("playbill opens on Coach's notes", await b.evaluate(`pbTabNotes.getAttribute("aria-selected") === "true" && !pbNotes.hidden && pbWords.hidden`));
  await b.evaluate("pbTabNotes.focus()");
  await b.key("ArrowRight");
  const pb = await b.evaluate(`({ sel: pbTabWords.getAttribute("aria-selected"), focus: document.activeElement.id, shown: !pbWords.hidden, notes: pbNotes.hidden, n: pbWords.querySelectorAll(".w-filler").length, legend: pbWords.querySelector(".words-legend") !== null })`);
  check("playbill: arrow key to Your words, same view", pb.sel === "true" && pb.focus === "pbTabWords" && pb.shown && pb.notes && pb.n > 30 && pb.legend, JSON.stringify(pb));
  await shot(b, "playbill-words-1280");
  contrastOk(await contrast(b, 1280, 800, ["#pbTabs .feedback-tab", "#pbWords .words-key", "#pbWords > .words-note"]), "playbill (paper): tabs, legend, note");
  contrastOk(await b.evaluate(COLOR_CONTRAST(MARKS("#pbWords"))), "playbill (paper): text and marks");
  check("Tab inside the dialog stays in it", await (async () => { for (let i = 0; i < 8; i++) await b.key("Tab"); return b.evaluate(`playbillDialog.contains(document.activeElement)`); })());
  await b.evaluate("closeDialog()");
  await b.evaluate(`wallButtons.get("p1").click()`);
  await sleep(300);
  await b.mouse("#pbTabWords");
  check("an older playbill (past 30): the not-available line", (await b.evaluate("pbWords.textContent")) === "The word-by-word view isn't available for this performance.");
  await b.evaluate("closeDialog()");
  // Tampered storage: bad words drop the words, the entry stays
  await b.evaluate(`(() => { const list = JSON.parse(localStorage.getItem("speakreview.wall.v1")); list[0].words = "junk"; list[1].words = [[1, 2], { a: 1 }, ["<b>x</b>", 1, 2, 90]]; localStorage.setItem("speakreview.wall.v1", JSON.stringify(list)); loadWall(); })()`);
  const t = await b.evaluate(`({ n: wallEntries.length, w0: wallEntries[0].words, w1: wallEntries[1].words })`);
  check("tampered words: entries kept, bad words dropped", t.n === 35 && t.w0 === null && JSON.stringify(t.w1) === JSON.stringify([["<b>x</b>", 1, 2, 90]]), JSON.stringify(t).slice(0, 150));
  await done(b);
}

// ---------------------------------------------------------------- full storage
if (!only || only === "full") {
  console.log("\n== full localStorage");
  const b = await open();
  const words = longWords();
  // 30 shows with words, then fill the rest of the storage with junk
  await b.evaluate(`(async () => { for (let i = 1; i <= 30; i++) { saveToWall("q" + i, ${JSON.stringify({ ...RESULT, speaking_seconds: 600, words })}); await new Promise(r => setTimeout(r, 4)); } })()`);
  const filled = await b.evaluate(`(() => { let n = 0, size = 262144; while (size >= 16) { try { localStorage.setItem("junk" + n, "x".repeat(size)); n++; } catch (e) { size = Math.floor(size / 2); } } return n; })()`);
  check("storage filled to the brim", filled > 0, `${filled} junk items`);
  await b.show({ ...RESULT, words: WORDS });
  const saved = await b.evaluate(`(() => { const ok = saveToWall("new1", ${JSON.stringify({ ...RESULT, speaking_seconds: 600, words })}); const list = JSON.parse(localStorage.getItem("speakreview.wall.v1"));
    return { ok, n: list.length, first: list[0].id, withWords: list.filter(e => Array.isArray(e.words)).length, works: wallSavingWorks, mem: wallEntries.filter(e => Array.isArray(e.words)).length }; })()`);
  check("nearly full: the new show is saved, with words on fewer shows", saved.works && saved.first === "new1" && saved.n === 31 && saved.withWords > 0 && saved.withWords < 30, JSON.stringify(saved));
  check("memory matches what was saved", saved.mem === saved.withWords);
  await b.mouse("#tabWords");
  check("Backstage still shows the words", (await b.evaluate(READ)).visible === VISIBLE);
  await done(b);

  const c = await open();
  await c.evaluate(`(() => { let n = 0, size = 262144; while (size >= 1) { try { localStorage.setItem("junk" + n, "x".repeat(size)); n++; } catch (e) { size = Math.floor(size / 2); } } })()`);
  const res = await c.evaluate(`(() => { const isNew = saveToWall("z1", ${JSON.stringify({ ...RESULT, words: WORDS })}); return { isNew, works: wallSavingWorks, kept: wallEntries.length }; })()`);
  check("completely full: no error, the show kept in memory, saving marked as not working", res.works === false && res.kept === 1, JSON.stringify(res));
  await c.show({ ...RESULT, words: WORDS });
  await c.mouse("#tabWords");
  check("completely full: Backstage still renders the words", (await c.evaluate(READ)).visible === VISIBLE);
  await c.evaluate(`goToView("wall")`);
  await c.settled();
  check("completely full: the wall shows its storage note", await c.evaluate(`!wallStorageNote.hidden`));
  await done(c);
}

// ---------------------------------------------------------------- layout
if (!only || only === "layout") {
  console.log("\n== layout");
  const SIZES = [[1366, 641], [1280, 800], [1920, 1080], [390, 780], [360, 740]];
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const b = await open({ width: w, height: h });
    const long = { ...RESULT, topic: "How do our habits shape who we become, and what small daily choices end up mattering most over a whole lifetime?", cut_off: true, time_limit_seconds: 300, speaking_seconds: 600, words: [...WORDS.slice(0, 18), ...longWords(600).map(([a, s, e, c]) => [a, s + 1300, e + 1300, c])] };
    await b.show(long);
    for (const tab of ["tabNotes", "tabWords"]) {
      await b.mouse(`#${tab}`);
      await sleep(200);
      const m = await b.evaluate(`(() => {
        const g = document.querySelector(".mirror-glass").getBoundingClientRect();
        const inside = r => r.top >= g.top - 0.5 && r.bottom <= g.bottom + 0.5 && r.left >= g.left - 0.5 && r.right <= g.right + 0.5;
        const panel = (${JSON.stringify(tab)} === "tabWords" ? wordsPanel : coachNotesBody).getBoundingClientRect();
        const tabs = document.getElementById("backstageTabs").getBoundingClientRect();
        const perf = document.querySelector(".perf");
        const buttons = [backToStageBtn, tryAgainBtn].map(e => e.getBoundingClientRect());
        return { panel: inside(panel) && panel.height >= 100, tabs: inside(tabs), tabH: tabNotes.getBoundingClientRect().height,
          perf: innerWidth > 600 ? inside(perf.getBoundingClientRect()) : true, buttons: buttons.every(inside),
          sideways: document.documentElement.scrollWidth - innerWidth, labels: [...document.querySelectorAll("#backstageTabs .feedback-tab")].filter(t => t.getClientRects().length > 0).map(t => { const spans = [...t.children].filter(c => getComputedStyle(c).position !== "absolute" && getComputedStyle(c).display !== "none"); return (spans.length ? spans.map(c => c.textContent).join("") : t.textContent).trim(); }),
          ph: Math.round(panel.height) };
      })()`);
      check(`${tag} ${tab}: tabs and panel inside the mirror, panel ${m.ph}px tall`, m.panel && m.tabs);
      check(`${tag} ${tab}: buttons inside, left column inside, no sideways scroll`, m.buttons && m.perf && m.sideways <= 0, JSON.stringify(m));
      if (tab === "tabNotes") check(`${tag}: tab labels ${JSON.stringify(m.labels)}`, JSON.stringify(m.labels) === (w <= 600 ? '["Notes","Your words"]' : '["Coach\'s notes","Your words"]'));
      await shot(b, `layout-${tag}-${tab}`);
    }
    // Left column still scrolls on short laptop windows (Backstage column fix)
    if (w === 1366) check(`${tag}: left column inside the mirror (scrolls only if needed)`, await b.evaluate(`(() => { const g = document.querySelector(".mirror-glass").getBoundingClientRect(), s = perfScroll.getBoundingClientRect(); return s.top >= g.top - 0.5 && s.bottom <= g.bottom + 0.5; })()`));
    if (w <= 600) {
      contrastOk(await contrast(b, w, h, ["#wordsPanel .words-key .short-label"]), `${tag} (phone): legend`);
      contrastOk(await b.evaluate(COLOR_CONTRAST(["#backstageTabs .feedback-tab", ...MARKS("#wordsPanel")])), `${tag} (phone): tabs, text and marks`);
      check(`${tag}: each tab label on one line and not cut off`, await b.evaluate(`[...document.querySelectorAll("#backstageTabs .feedback-tab")].every(t => t.getBoundingClientRect().height <= 36 && t.scrollWidth <= t.clientWidth)`));
      await b.evaluate(`wordsPanel.querySelector(".words-body").scrollTop = 1e9`);
      await sleep(200);
      check(`${tag}: the note comes at the end of the words`, await b.evaluate(`(() => { const n = wordsPanel.querySelector(".words-note-inline"); const r = n.getBoundingClientRect(), body = wordsPanel.querySelector(".words-body").getBoundingClientRect(); return getComputedStyle(n).display === "block" && getComputedStyle(wordsPanel.querySelector(":scope > .words-note")).display === "none" && r.bottom <= body.bottom; })()`));
      await shot(b, `layout-${tag}-words-end`);
    }
    await done(b);
  }

  console.log("\n== reduced motion");
  const r = await open({ motion: "reduce" });
  await r.show({ ...RESULT, words: WORDS });
  await r.mouse("#tabWords");
  check("reduced motion: words tab works, nothing animates in the panel", (await r.evaluate(READ)).visible === VISIBLE && (await r.evaluate(`[...wordsPanel.querySelectorAll("*")].every(e => getComputedStyle(e).animationName === "none")`)));
  await done(r);

  console.log("\n== wording");
  const t = await open();
  const src = (await (await fetch(LIVE + "js/app.js")).text()) + (await (await fetch(LIVE)).text()) + (await (await fetch(LIVE + "css/styles.css")).text());
  check("privacy line", await t.evaluate(`privacyNote.textContent.includes("The words of your speech are shown and saved on this device for your latest 30 performances.")`));
  check("no em dashes", !src.includes("—"));
  check("no inline style attributes or handlers in index.html", !/\sstyle=|\son[a-z]+=/i.test(await (await fetch(LIVE)).text()));
  check("words never set with innerHTML", !/words[A-Za-z]*\.innerHTML|pbWords\.innerHTML|wordsPanel\.innerHTML/.test(src));
  await done(t);
}

finish();
