// Feature set 2, stage 1b: the topic ticket
import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { readFileSync } from "node:fs";
import { SITE, LIVE, BASE } from "../lib/paths.mjs";
import { join } from "node:path";
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const only = process.argv[2];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`);
};
const KEYS = { Enter: [13, "Enter", "\r"], Escape: [27, "Escape"] };

async function open(url = LIVE, { width = 1280, height = 800, pre = [], dpr = 1, flags = FAKE } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  // The motion setting comes from the computer (Windows "Show animations"), so pin it: motion allowed
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.goto(url, [API_STUB, ...pre]);
  b.waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(60); }
    return false;
  };
  b.mouse = async sel => {
    const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(150);
  };
  b.key = async key => {
    const [code, name, text] = KEYS[key];
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await b.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text } : {}) });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(80);
  };
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
const angle = t => { const v = t.match(/matrix\(([^,]+), ([^,]+)/); return v ? Math.atan2(+v[2], +v[1]) * 180 / Math.PI : 0; };
// Unrotated box of the ticket (offset values ignore the tilt)
const TICKET_BOX = `(() => { const w = document.querySelector(".ticket-wrap"); const r = w.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  return { left: cx - w.offsetWidth / 2, right: cx + w.offsetWidth / 2, top: cy - w.offsetHeight / 2, bottom: cy + w.offsetHeight / 2, h: w.offsetHeight, w: w.offsetWidth }; })()`;

// ---------------------------------------------------------------- viewports
if (!only || only === "sizes") {
  console.log("\n== viewports");
  const SIZES = [[1280, 800, 1], [1366, 657, 1], [1093, 526, 1.25], [1920, 1080, 1], [390, 780, 1], [360, 740, 1], [412, 915, 1]];
  const SCENERY = [".curtain-left", ".curtain-right", ".tieback-left", ".tieback-right", ".valance", ".scallops", "#onAir", ".mic-spot", ".floor"];
  for (const [w, h, dpr] of SIZES) {
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    const phone = w <= 600;
    const rects = {};
    for (const [name, url] of [["before", BASE], ["after", LIVE]]) {
      const b = await open(url, { width: w, height: h, dpr });
      rects[name] = await b.evaluate(`(${JSON.stringify(SCENERY)}).map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(","); })`);
      rects[name + "H"] = await b.evaluate("document.documentElement.scrollHeight");
      if (name === "before") { await b.close(); continue; }
      const m = await b.evaluate(`(() => {
        const rect = s => document.querySelector(s).getBoundingClientRect();
        const t = ${TICKET_BOX};
        const topic = rect("#stepTopic"), aud = rect(".audience-band"), cl = rect(".curtain-left"), cr = rect(".curtain-right");
        const stage = document.getElementById("stageView");
        const rows = getComputedStyle(stage).gridTemplateRows.split(" ").map(parseFloat);
        const padTop = parseFloat(getComputedStyle(stage).paddingTop);
        const texts = [...document.querySelectorAll(".ticket *")].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
        const logo = document.querySelector(".stage-logo"), wrap = document.querySelector(".ticket-wrap");
        const pb = rect("#privacyBtn"); const hit = document.elementFromPoint(pb.left + pb.width / 2, pb.top + pb.height / 2);
        return {
          hScroll: document.documentElement.scrollWidth > innerWidth, vScroll: document.documentElement.scrollHeight > innerHeight,
          inCurtains: t.left >= (${phone} ? cl.right : cl.right) - 0.5 && t.right <= cr.left + 0.5,
          aboveAudience: topic.bottom <= aud.top + 0.5, gap: aud.top - topic.bottom,
          minFont: Math.min(...texts.map(e => parseFloat(getComputedStyle(e).fontSize))),
          stubH: [...document.querySelectorAll(".stub-btn")].map(e => e.getBoundingClientRect().height),
          logoGap: logo.getClientRects().length ? wrap.offsetTop - (logo.offsetTop + logo.offsetHeight) : null,
          above: topic.top - padTop, below: rows[0] + padTop - topic.bottom, row0: rows[0],
          privacyHit: !!hit && document.getElementById("privacyBtn").contains(hit),
          headerLogoShown: document.querySelector(".site-header .logo").getBoundingClientRect().width > 2,
          admitShown: document.querySelector(".ticket-admit").getClientRects().length > 0,
          topicFont: getComputedStyle(topicInput).fontSize, ticketW: t.w
        };
      })()`);
      check(`${tag} no sideways scroll`, !m.hScroll);
      if (w === 390) check(`${tag} no page scroll`, !m.vScroll);
      else console.log(`      ${tag} page scrolls: ${m.vScroll}`);
      check(`${tag} ticket between the curtains`, m.inCurtains, `width ${m.ticketW}`);
      check(`${tag} ticket and buttons above the audience`, m.aboveAudience, `gap ${m.gap.toFixed(1)}`);
      check(`${tag} ticket text >= 11px`, m.minFont >= 11, m.minFont);
      check(`${tag} topic font ${phone ? "22px" : "40px"}`, m.topicFont === (phone ? "22px" : "40px"), m.topicFont);
      check(`${tag} stub buttons >= 34px tall`, m.stubH.every(x => x >= 34), JSON.stringify(m.stubH.map(Math.round)));
      check(`${tag} Privacy is clickable at its spot`, m.privacyHit);
      if (phone) {
        check(`${tag} logo 14px above the ticket`, m.logoGap === 14, m.logoGap);
        check(`${tag} header logo hidden on the Stage`, !m.headerLogoShown);
        check(`${tag} block centred (or at the top on short phones)`, Math.abs(m.above - m.below) <= 1 || m.above <= 0.5, `above ${m.above.toFixed(1)} below ${m.below.toFixed(1)}`);
        check(`${tag} no Admit one`, !m.admitShown);
      } else {
        check(`${tag} Admit one shown`, m.admitShown);
        check(`${tag} ticket 860px wide when there is room`, w < 1200 || m.ticketW === 860, m.ticketW);
      }
      const dH = rects.afterH - rects.beforeH;
      if (dH !== 0) console.log(`      ${tag} page height changed by ${dH}px (the stage was taller than the window before)`);
      // Stage 2: where the bottom bar shows, the Stage floor gets 18px more room for the raised round Stage sign, so the
      // floor line (and the mic and curtains standing on it) may sit up to 18px higher. Sizes and shapes must not change.
      const barNow = await b.evaluate("getComputedStyle(document.querySelector('.main-nav')).display === 'grid'");
      if (barNow) {
        const get = (arr, sel) => arr[SCENERY.indexOf(sel)].split(",").map(Number);
        const [, fbT] = get(rects.before, ".floor"), [, faT, faW] = get(rects.after, ".floor");
        const lift = fbT - faT;
        const [mbL, , mbW, mbH] = get(rects.before, ".mic-spot"), [maL, maT, maW, maH] = get(rects.after, ".mic-spot");
        const curtainsOk = [".curtain-left", ".curtain-right"].every(c => { const [bl, , bw] = get(rects.before, c), [al, at, aw, ah] = get(rects.after, c); return bl === al && bw === aw && Math.abs(at + ah - faT) <= 1; });
        const tieOk = [".tieback-left", ".tieback-right"].every(c => { const [bl, , bw, bh] = get(rects.before, c), [al, , aw, ah] = get(rects.after, c); return bl === al && bw === aw && bh === ah; });
        const topOk = [".valance", ".scallops", "#onAir"].every(c => rects.before[SCENERY.indexOf(c)] === rects.after[SCENERY.indexOf(c)]);
        check(`${tag} bar layout: scenery sizes unchanged, curtains end on the floor line, mic stands on it, floor line up by at most 18px`,
          lift >= -0.5 && lift <= 18.5 && mbL === maL && mbW === maW && mbH === maH && Math.abs(maT + maH - 2 - faT) <= 1 && faW === get(rects.before, ".floor")[2] && curtainsOk && tieOk && topOk,
          `floor up ${lift}px; mic ${rects.after[SCENERY.indexOf(".mic-spot")]}; floor ${rects.after[SCENERY.indexOf(".floor")]}`);
      } else
      for (let i = 0; i < SCENERY.length; i++) {
        const [bl, bt, bw, bh] = rects.before[i].split(",").map(Number), [al, at, aw, ah] = rects.after[i].split(",").map(Number);
        const curtain = SCENERY[i].startsWith(".curtain");          // a curtain runs from the top down to the floor line, its tieback sits 60% down
        const fixedTop = [".valance", ".scallops", "#onAir"].includes(SCENERY[i]) || curtain;
        const ok = bl === al && bw === aw && (curtain ? ah - bh === dH : bh === ah) && (fixedTop ? at === bt : SCENERY[i].startsWith(".tieback") ? Math.abs(at - bt - 0.6 * dH) <= 1 : at - bt === dH);
        check(`${tag} ${SCENERY[i]} unchanged${dH ? " (moved only with the page height)" : ""}`, ok, `before ${rects.before[i]} after ${rects.after[i]}`);
      }
      await b.shot(`shots/1b-${tag}-closed.png`);
      await b.mouse("#prepSetting");
      await sleep(300);
      await b.shot(`shots/1b-${tag}-prep.png`);
      if (phone) {
        await b.mouse("#settingsDoneBtn");
        await b.mouse("#privacyBtn");
        check(`${tag} Privacy opens`, await b.evaluate("!privacyNote.hidden"));
      }
      await done(b);
    }
  }
}

// ---------------------------------------------------------------- the ticket itself
if (!only || only === "ticket") {
  console.log("\n== ticket look");
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const phone = w <= 600;
    const b = await open(LIVE, { width: w, height: h });
    const s = await b.evaluate(`(() => {
      const cs = s => getComputedStyle(document.querySelector(s));
      return { wrapT: cs(".ticket-wrap").transform, filter: cs(".ticket-wrap").filter, mask: cs(".ticket").maskImage || cs(".ticket").webkitMaskImage,
        maskSize: cs(".ticket").maskSize, border: cs(".ticket-border").borderTopStyle + " " + cs(".ticket-border").borderTopWidth + " " + cs(".ticket-border").borderTopColor,
        inset: cs(".ticket-border").top, vignette: cs(".ticket-vignette").boxShadow, bg: cs(".ticket").backgroundImage,
        serialHidden: document.querySelector(".ticket-serial").getAttribute("aria-hidden"), admitHidden: document.querySelector(".ticket-admit").getAttribute("aria-hidden"),
        weight: getComputedStyle(topicInput).fontWeight, family: getComputedStyle(topicInput).fontFamily,
        stubGroup: document.querySelector(".ticket-stub").getAttribute("role") + ":" + document.querySelector(".ticket-stub").getAttribute("aria-label"),
        stubInGroup: !!timeTicket.closest(".ticket-stub") && !!prepTicket.closest(".ticket-stub"),
        restBorder: getComputedStyle(timeTicket).borderTopStyle, dots: cs(".ticket-tear").backgroundImage };
    })()`);
    const tag = phone ? "phone" : "laptop";
    check(`${tag} tilted -0.8deg`, Math.abs(angle(s.wrapT) + 0.8) < 0.01, angle(s.wrapT).toFixed(3));
    check(`${tag} drop shadow`, s.filter === `drop-shadow(rgba(0, 0, 0, 0.6) 0px ${phone ? 12 : 16}px ${phone ? 18 : 22}px)`, s.filter);
    check(`${tag} corner mask ${phone ? 9 : 13}px`, s.mask.includes(`circle at 0px 0px`) && s.mask.includes(`${phone ? 9 : 13}px`) && s.mask.split("radial-gradient").length === 5, s.mask.slice(0, 120));
    check(`${tag} printed double border`, s.border === "double 3px rgba(122, 18, 34, 0.5)" && s.inset === (phone ? "7px" : "10px"), `${s.border} inset ${s.inset}`);
    check(`${tag} edge darkening`, s.vignette === "rgba(70, 35, 10, 0.42) 0px 0px 46px 0px inset", s.vignette);
    check(`${tag} ivory paper`, s.bg.includes("rgb(226, 207, 166)") && s.bg.includes("rgb(201, 176, 134)") && s.bg.includes("rgba(255, 244, 214, 0.45)"));
    check(`${tag} punched dots`, s.dots.includes("rgba(70, 35, 10, 0.55)"));
    check(`${tag} serial and Admit one are decoration`, s.serialHidden === "true" && s.admitHidden === "true");
    check(`${tag} topic in Fraunces 600`, s.weight === "600" && s.family.startsWith("Fraunces"));
    check(`${tag} stub buttons in the Practice settings group`, s.stubGroup === "group:Practice settings" && s.stubInGroup);
    check(`${tag} stub buttons dashed at rest`, s.restBorder === "dashed");
    await b.mouse("#timeTicket");
    const o = await b.evaluate(`(() => { const c = getComputedStyle(timeTicket); return { style: c.borderTopStyle, color: c.borderTopColor, ring: c.boxShadow, other: getComputedStyle(prepTicket).borderTopStyle }; })()`);
    check(`${tag} open stub button: solid burgundy with a ring`, o.style === "solid" && o.color === "rgb(122, 18, 34)" && o.ring.includes("rgba(122, 18, 34, 0.16)") && o.other === "dashed", JSON.stringify(o));
    if (!phone) {
      // The panel slides in when it opens: measure once two readings 100ms apart agree (at most 3 seconds)
      const measure = () => b.evaluate(`(() => { const t = ${TICKET_BOX}; const a = document.getElementById("stepTime").getBoundingClientRect(); const p = settingsPanel.getBoundingClientRect();
        const ar = settingsPanel.querySelector(".panel-arrow").getBoundingClientRect(), bt = timeTicket.getBoundingClientRect();
        return { rightOff: Math.abs(p.right - a.right), anchorRight: Math.abs(a.right - t.right), topOff: p.top - a.top, anchorTop: a.top - t.bottom, arrow: Math.abs(ar.left + ar.width / 2 - (bt.left + bt.width / 2)) }; })()`);
      let p = await measure();
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        const next = await measure();
        const same = JSON.stringify(next) === JSON.stringify(p);
        p = next;
        if (same) break;
      }
      check("panel right-aligned with the ticket", p.rightOff < 0.5 && p.anchorRight < 0.5, JSON.stringify(p));
      check("panel 12px under the ticket", Math.abs(p.topOff - 12) < 0.5 && Math.abs(p.anchorTop) < 0.5, JSON.stringify(p));
      check("arrow points at the open stub button", p.arrow < 1.5, p.arrow.toFixed(1));
    } else {
      check("phone opens the bottom sheet", await b.evaluate(`settingsPanel.getAttribute("aria-modal") === "true" && getComputedStyle(settingsPanel).position === "fixed"`));
    }
    await b.key("Escape");
    check(`${tag} Escape returns focus to the stub button`, await b.evaluate("document.activeElement === timeTicket"));
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await sleep(100);
    check(`${tag} no tilt with reduced motion`, (await b.evaluate(`getComputedStyle(document.querySelector(".ticket-wrap")).transform`)) === "none");
    await done(b);
  }

  console.log("\n== contrast on the paper (measured from the screen)");
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    for (const state of ["topic", "openmic", "placeholder"]) {
      const b = await open(LIVE, { width: w, height: h });
      if (state === "topic") { await b.evaluate(`landTopic(TOPICS.find(t => t.type === "persuade"))`); }
      if (state === "openmic") await b.click("#clearTopicBtn");
      await sleep(200);
      const items = await b.evaluate(`(() => {
        const sel = [".topic-label", ".topic-badge", ".topic-hint", ".ticket-serial", "#topicInput", ".open-mic-line", ".stub-label", ".stub-value", ".stub-sub", ".ticket-admit span"];
        const out = [];
        for (const s of sel) document.querySelectorAll(s).forEach(e => { if (!e.getClientRects().length) return; const r = e.getBoundingClientRect();
          const c = e.id === "topicInput" && !e.value ? getComputedStyle(e, "::placeholder").color : getComputedStyle(e).color;
          out.push({ s, c, r: [r.left, r.top, r.right, r.bottom] }); });
        return out; })()`);
      const shot = (await b.send("Page.captureScreenshot", { format: "png" })).data;
      await b.close();
      const d = await launch({ width: w, height: h });
      await d.send("Page.navigate", { url: "about:blank" });
      await sleep(200);
      const res = await d.evaluate(`(async () => {
        const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${shot}"; });
        const c = document.createElement("canvas"); c.width = ${w}; c.height = ${h}; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const items = ${JSON.stringify(items)};
        return items.map(it => {
          const m = it.c.match(/[\\d.]+/g).map(Number); const ink = L(m[0], m[1], m[2]);
          const [l, t, r, bt] = it.r.map(Math.round);
          const data = x.getImageData(l, t, Math.max(1, r - l), Math.max(1, bt - t)).data;
          const lum = []; for (let i = 0; i < data.length; i += 4) lum.push(L(data[i], data[i + 1], data[i + 2]));
          lum.sort((a, b) => a - b);
          const max = lum[lum.length - 1]; const paper = lum.filter(v => v > (max + ink) / 2 + (max - ink) * 0.15);
          const bg = paper.length ? paper[Math.floor(paper.length * 0.05)] : max;          // a dark paper pixel (5th percentile)
          return [it.s, +((bg + 0.05) / (ink + 0.05)).toFixed(2)];
        });
      })()`);
      await d.close();
      const worst = res.reduce((a, c) => c[1] < a[1] ? c : a, ["", 99]);
      check(`${w}x${h} ${state}: every text on the ticket >= 4.5:1`, worst[1] >= 4.5, `worst ${worst[0]} ${worst[1]}; ${res.map(r => r.join(" ")).join(", ")}`);
    }
  }
}

// ---------------------------------------------------------------- the ticket never changes height
if (!only || only === "height") {
  console.log("\n== fixed height: rolling 10 topics, typed, empty, open mic");
  for (const [w, h] of [[1280, 800], [390, 780], [360, 740]]) {
    const b = await open(LIVE, { width: w, height: h });
    const pos = () => b.evaluate(`(() => { const r = randomTopicBtn.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, document.querySelector(".ticket-wrap").offsetHeight].join(","); })()`);
    const start = await pos();
    const seen = new Set([start]);
    let sawRolling = false, insideTicket = true, scrolling = 0;
    for (let i = 0; i < 10; i++) {
      await b.click("#randomTopicBtn");
      await sleep(60);
      if (await b.evaluate("topicInput.classList.contains('rolling')")) sawRolling = true;
      if (!(await b.evaluate("!!topicInput.closest('.ticket')"))) insideTicket = false;
      await b.waitFor("!isRolling", 3000);
      await sleep(50);
      seen.add(await pos());
      if (await b.evaluate("topicInput.classList.contains('is-scrolling')")) scrolling++;
    }
    check(`${w}x${h} Roll button and ticket height never move over 10 rolls`, seen.size === 1, [...seen].join(" | "));
    check(`${w}x${h} the roll animation runs inside the ticket`, sawRolling && insideTicket);
    check(`${w}x${h} rolled topic shows badge and hint`, await b.evaluate("!topicBadge.hidden && topicBadgeType.textContent && topicBadgeHint.textContent"));
    check(`${w}x${h} no rolled topic cut off`, scrolling === 0, scrolling);
    // every topic in topics.js
    const all = await b.evaluate(`(() => { const out = new Set(); let cut = [];
      for (const t of TOPICS) { landTopic(t); out.add(document.querySelector(".ticket-wrap").offsetHeight + "," + Math.round(randomTopicBtn.getBoundingClientRect().top));
        if (topicInput.classList.contains("is-scrolling")) cut.push(t.text); }
      return { sizes: [...out], cut, n: TOPICS.length }; })()`);
    check(`${w}x${h} all ${all.n} topics keep the same height`, all.sizes.length === 1, all.sizes.join(" | "));
    check(`${w}x${h} no topic in topics.js is cut off`, all.cut.length === 0, all.cut.slice(0, 3).join(" / "));
    await b.click("#clearTopicBtn"); await sleep(100);
    const mic = await pos();
    await b.evaluate(`topicInput.value = ""; topicInput.dispatchEvent(new Event("input"));`); await sleep(100);
    const empty = await pos();
    await b.evaluate(`topicInput.value = "Why I love Sundays"; topicInput.dispatchEvent(new Event("input"));`); await sleep(100);
    const typed = await pos();
    await b.evaluate(`topicInput.value = "x".repeat(0) + "A very long topic that someone typed to see what happens when it does not fit at all in the box"; topicInput.dispatchEvent(new Event("input"));`); await sleep(100);
    const long = await pos();
    check(`${w}x${h} same place for open mic, empty, typed and long typed topics`, new Set([start, mic, empty, typed, long]).size === 1, [start, mic, empty, typed, long].join(" | "));
    await done(b);
  }

  console.log("\n== longest topic at 1366x657, 125%");
  const b = await open(LIVE, { width: 1093, height: 526, dpr: 1.25 });
  const r = await b.evaluate(`(() => { const t = TOPICS.reduce((a, c) => c.text.length > a.text.length ? c : a); landTopic(t);
    const topic = document.getElementById("stepTopic").getBoundingClientRect(), aud = document.querySelector(".audience-band").getBoundingClientRect();
    const btns = [randomTopicBtn, writeTopicBtn, clearTopicBtn].map(e => e.getBoundingClientRect().bottom);
    const tk = document.querySelector(".ticket-wrap").getBoundingClientRect();
    return { text: t.text, len: t.text.length, cut: topicInput.classList.contains("is-scrolling"), topicBottom: topic.bottom, ticketBottom: tk.bottom, btns, audTop: aud.top }; })()`);
  check("longest topic not cut off", !r.cut, `${r.len} chars: ${r.text}`);
  check("ticket and all three buttons above the audience", r.ticketBottom <= r.audTop && r.btns.every(x => x <= r.audTop), `ticket ${r.ticketBottom.toFixed(1)}, buttons ${r.btns.map(x => x.toFixed(1))}, audience ${r.audTop.toFixed(1)}`);
  await b.shot("shots/1b-1093x526-longest.png");
  await done(b);
}

// ---------------------------------------------------------------- open mic night and write your own
if (!only || only === "topic") {
  console.log("\n== open mic night and write your own");
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const phone = w <= 600;
    const tag = phone ? "phone" : "laptop";
    const b = await open(LIVE, { width: w, height: h });
    check(`${tag} starts as Tonight's show`, (await b.evaluate("showLabel.textContent")) === "Tonight's show" && await b.evaluate("openMicLine.hidden"));
    check(`${tag} topic field label`, (await b.evaluate(`document.querySelector('label[for=topicInput]').textContent`)) === "Tonight's show, your topic");
    await b.evaluate(`landTopic(TOPICS[0])`);
    await b.mouse("#clearTopicBtn");
    const om = await b.evaluate(`({ label: showLabel.textContent, badge: topicBadge.hidden, topic: topicInput.placeholder, value: topicInput.value,
      line: openMicLine.getClientRects().length > 0, visible: [...openMicLine.children].filter(c => getComputedStyle(c).clip !== "rect(0px, 0px, 0px, 0px)" && c.getClientRects().length).map(c => c.textContent).join(),
      ink: getComputedStyle(topicInput, "::placeholder").color })`);
    check(`${tag} Speak freely gives OPEN MIC NIGHT, no badge`, om.label === "Open mic night" && om.badge, JSON.stringify(om));
    check(`${tag} topic reads Speak on anything you like, in ink`, om.topic === "Speak on anything you like" && om.value === "" && om.ink === "rgb(42, 18, 6)", om.ink);
    check(`${tag} line under it`, om.line && om.visible === (phone ? "No topic tonight. Talk about anything." : "No topic tonight. Talk about anything you like."), om.visible);
    await b.mouse("#randomTopicBtn");
    await b.waitFor("!isRolling", 3000);
    check(`${tag} rolling turns it back`, (await b.evaluate("showLabel.textContent")) === "Tonight's show" && await b.evaluate("openMicLine.hidden && !topicBadge.hidden"));
    await b.mouse("#clearTopicBtn");
    await b.mouse("#writeTopicBtn");
    check(`${tag} Write your own turns it back and focuses the field`, (await b.evaluate("showLabel.textContent")) === "Tonight's show" && await b.evaluate("document.activeElement === topicInput && openMicLine.hidden"));
    await b.send("Input.insertText", { text: "My first line" });
    await b.key("Enter");
    await b.send("Input.insertText", { text: " and more" });
    check(`${tag} Enter adds no new line`, (await b.evaluate("topicInput.value")) === "My first line and more", await b.evaluate("topicInput.value"));
    await b.evaluate(`topicInput.select()`);
    await b.send("Input.insertText", { text: "x".repeat(130) });
    check(`${tag} 120 characters at most`, (await b.evaluate("topicInput.value.length")) === 120);
    await b.evaluate(`topicInput.select()`);
    await b.send("Input.insertText", { text: "pasted\nwith a break" });
    check(`${tag} pasted line break becomes a space`, (await b.evaluate("topicInput.value")) === "pasted with a break");
    await b.mouse("#clearTopicBtn");
    await b.evaluate("topicInput.focus()");
    await b.send("Input.insertText", { text: "Typed" });
    check(`${tag} typing turns open mic back`, (await b.evaluate("showLabel.textContent")) === "Tonight's show");
    check(`${tag} typed topic is sent as the topic`, (await b.evaluate("topicInput.value.trim()")) === "Typed");
    await done(b);
  }
}

// ---------------------------------------------------------------- no mic, markup
if (!only || only === "misc") {
  console.log("\n== no mic support");
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const b = await open(LIVE, { width: w, height: h, pre: ["delete window.AudioWorkletNode;"], flags: [] });
    check(`${w}x${h} only RUNTIME on the stub`, await b.evaluate("prepTicket.getClientRects().length === 0 && timeTicket.getClientRects().length > 0"));
    await b.mouse("#timeTicket");
    check(`${w}x${h} its panel still opens`, await b.evaluate("!settingsPanel.hidden && openSetting === 'time'"));
    await b.shot(`shots/1b-nomic-${w}x${h}.png`);
    await done(b);
  }
  console.log("\n== markup");
  const html = readFileSync(join(SITE, "index.html"), "utf8");
  const css = readFileSync(join(SITE, "css", "styles.css"), "utf8");
  const js = readFileSync(join(SITE, "js", "app.js"), "utf8");
  check("no style attributes or inline handlers", !/\sstyle=|\son[a-z]+=/i.test(html));
  check("no Stage 1 stub leftovers", ![html, css, js].some(t => /class="tickets"|\.tickets\b|ticket-notch|ticket-icon|ticket-value|ticket-chev|closest\("\.ticket"\)/.test(t)));
  check("no em dashes in the page", !html.includes("\u2014"));
}

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
