// Feature set 2, stage 2: navigation (signs on wide laptop windows, the bottom bar below 1280px and on phones)
import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { readFileSync } from "node:fs";
import { SITE, LIVE, BASE } from "../lib/paths.mjs";
import { join } from "node:path";
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const SEED = readFileSync(new URL("../lib/seed.js", import.meta.url), "utf8");
const only = process.argv[2];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`);
};
const KEYS = { Enter: [13, "Enter", "\r"], " ": [32, "Space", " "], Tab: [9, "Tab"] };

async function open(url = LIVE, { width = 1280, height = 800, dpr = 1, pre = [], seed = false } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: FAKE, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  // The motion setting comes from the computer (Windows "Show animations"), so pin it: motion allowed
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.goto(url, [API_STUB, ...pre]);
  if (seed) await b.evaluate(SEED);
  b.waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(60); }
    return false;
  };
  b.settled = () => b.waitFor("!document.body.classList.contains('curtains-closed') && !appRoot.inert", 6000).then(() => sleep(250));
  b.mouse = async sel => {
    const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(120);
  };
  b.key = async (key, shift = false) => {
    const [code, name, text] = KEYS[key];
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
    await b.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text } : {}) });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(60);
  };
  b.active = () => b.evaluate("document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : ''");
  // Tab until the given element has focus (up to 60 presses)
  b.tabTo = async id => { for (let i = 0; i < 60; i++) { await b.key("Tab"); if ((await b.active()) === id) return true; } return false; };
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};
// Rectangles that overlap by more than 1px each way
const OVERLAPS = `(pairs) => pairs.flatMap(([a, b]) => {
  const A = [...document.querySelectorAll(a)].filter(e => e.getClientRects().length), B = [...document.querySelectorAll(b)].filter(e => e.getClientRects().length);
  const out = [];
  for (const x of A) for (const y of B) { if (x === y || x.contains(y) || y.contains(x)) continue;
    const r = x.getBoundingClientRect(), s = y.getBoundingClientRect();
    const w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
    if (w > 1 && h > 1) out.push(a + " x " + b + " " + Math.round(w) + "x" + Math.round(h)); }
  return out; })`;
const overlaps = (b, pairs) => b.evaluate(`(${OVERLAPS})(${JSON.stringify(pairs)})`);

// Contrast from the screen: the text colour against the background on a thin ring around the text box
async function contrast(b, w, h, sels) {
  const items = await b.evaluate(`(() => { const out = []; for (const s of ${JSON.stringify(sels)}) document.querySelectorAll(s).forEach(e => {
    if (!e.getClientRects().length) return; const r = e.getBoundingClientRect(); if (r.width < 2) return; const cs = getComputedStyle(e);
    const boxed = cs.backgroundImage !== "none" || cs.backgroundColor !== "rgba(0, 0, 0, 0)";
    // On the signs the bulb rows sit just above and below the text, so only the sides of the text box are sampled
    const sides = !!e.closest(".sign") || boxed;     // boxed labels (the brass plate): only its padding sides have no letters
    out.push({ s, c: cs.color, sides, ring: boxed ? [r.left + 2, r.top + 3, r.right - 3, r.bottom - 4] : sides ? [r.left - 3, r.top + 1, r.right + 2, r.bottom - 1] : [r.left - 2, r.top - 2, r.right + 1, r.bottom + 1] }); }); return out; })()`);
  const shot = (await b.send("Page.captureScreenshot", { format: "png" })).data;
  const d = await launch({ width: w, height: h });
  await d.send("Page.navigate", { url: "about:blank" });
  await sleep(200);
  const res = await d.evaluate(`(async () => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${shot}"; });
    const c = document.createElement("canvas"); c.width = ${w}; c.height = ${h}; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const px = (X, Y) => { const d = x.getImageData(X, Y, 1, 1).data; return L(d[0], d[1], d[2]); };
    return ${JSON.stringify(items)}.map(it => {
      const m = it.c.match(/[\\d.]+/g).map(Number); const ink = L(m[0], m[1], m[2]);
      const [l, t, r, bt] = it.ring.map(Math.round); const ring = [];
      if (!it.sides) for (let X = l; X <= r; X++) { ring.push(px(X, t)); ring.push(px(X, bt)); }
      for (let Y = t; Y <= bt; Y++) { ring.push(px(l, Y)); ring.push(px(r, Y)); }
      const rs = ring.map(v => (Math.max(v, ink) + 0.05) / (Math.min(v, ink) + 0.05)).sort((a, b) => a - b);
      return [it.s, +rs[Math.floor(rs.length * 0.02)].toFixed(2)];
    });
  })()`);
  await d.close();
  return res;
}

// ---------------------------------------------------------------- wide laptop windows: the signs
if (!only || only === "signs") {
  for (const [w, h] of [[1280, 800], [1366, 657], [1920, 1080]]) {
    const tag = `${w}x${h}`;
    console.log(`\n== ${tag} (signs)`);
    const b = await open(LIVE, { width: w, height: h, seed: true });
    const st = await b.evaluate(`(() => { const r = s => document.querySelector(s).getBoundingClientRect();
      const cl = r(".curtain-left"), cr = r(".curtain-right"), sb = r("#signBackstage"), sw = r("#signWall"), logo = r(".site-header .logo"), pv = r("#privacyBtn");
      return { menu: getComputedStyle(document.querySelector(".main-nav")).display, curtainW: cl.width,
        sbW: sb.width, swW: sw.width, sbTop: sb.top - cl.top, curtainH: cl.height, sbIn: sb.left >= 0 && sb.right <= cl.right, swIn: sw.left >= cr.left && sw.right <= innerWidth,
        dirs: [document.getElementById("signBackstage").classList.contains("sign-left"), document.getElementById("signWall").classList.contains("sign-right")],
        names: [signBackstage.getAttribute("aria-label"), signWall.getAttribute("aria-label")], tags: [signBackstage.tagName, signWall.tagName],
        logoLeft: logo.left < innerWidth / 3, privacyRight: pv.right > innerWidth * 2 / 3, hScroll: document.documentElement.scrollWidth > innerWidth }; })()`);
    check(`${tag} no top menu`, st.menu === "none");
    check(`${tag} logo left, Privacy right`, st.logoLeft && st.privacyRight);
    await b.mouse("#privacyBtn");
    check(`${tag} Privacy opens`, await b.evaluate("!privacyNote.hidden"));
    await b.mouse("#privacyBtn");
    check(`${tag} Stage signs are buttons named "Go to Backstage, your feedback" / "Go to Wall of Fame, past shows"`, st.tags.join() === "BUTTON,BUTTON" && st.names.join(" | ") === "Go to Backstage, your feedback | Go to Wall of Fame, past shows", st.names.join(" | "));
    check(`${tag} sign width = curtain width - 14px`, Math.abs(st.sbW - (st.curtainW - 14)) < 0.6 && Math.abs(st.swW - (st.curtainW - 14)) < 0.6, `${st.sbW.toFixed(1)} / ${st.curtainW.toFixed(1)}`);
    check(`${tag} signs at 42% of the curtain height`, Math.abs(st.sbTop - 0.42 * st.curtainH) < 1, `${st.sbTop.toFixed(1)} of ${st.curtainH.toFixed(1)}`);
    check(`${tag} signs on their curtains, pointing left and right`, st.sbIn && st.swIn && st.dirs.every(Boolean));
    check(`${tag} no sideways scroll`, !st.hScroll);
    const stageOver = await overlaps(b, [[".sign", ".ticket-wrap"], [".sign", ".site-header .logo"], [".sign", "#privacyWrap"], [".sign", ".mic-spot"], [".sign", ".topic-actions"], [".sign", ".stage-floor"],
      [".ticket-wrap", ".site-header"], [".ticket-wrap", ".mic-spot"], [".topic-actions", ".mic-spot"]]);
    check(`${tag} Stage: nothing overlaps the ticket, signs, header or mic`, stageOver.length === 0, stageOver.join("; "));
    for (const which of ["#timeTicket", "#prepSetting"]) {
      await b.mouse(which); await sleep(300);
      const po = await overlaps(b, [["#settingsPanel", ".sign"], ["#settingsPanel", ".site-header"], ["#settingsPanel", ".ticket-wrap"]]);
      check(`${tag} open ${which === "#timeTicket" ? "Speaking" : "Prep"} time panel clears the signs, header and ticket`, po.length === 0, po.join("; "));
      await b.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`); await sleep(100);
    }
    await b.shot(`shots/nav-${tag}-stage.png`);

    await b.evaluate("goToView('backstage')"); await b.settled();
    const bs = await b.evaluate(`(() => { const m = document.getElementById("mirror").getBoundingClientRect(), s = document.getElementById("signStageFromBackstage").getBoundingClientRect();
      const bulbs = [...document.querySelectorAll("#mirror .bulb")].map(e => e.getBoundingClientRect()).filter(r => r.width);
      return { left: m.left, right: innerWidth - m.right, signLeft: s.left, mirrorRight: Math.max(m.right, ...bulbs.map(r => r.right)), name: signStageFromBackstage.getAttribute("aria-label"),
        right8: innerWidth - s.right, w: s.width, others: [...document.querySelectorAll("#backstageView .sign")].map(e => e.dataset.view).join(), hScroll: document.documentElement.scrollWidth > innerWidth }; })()`);
    if (w === 1280) check("Backstage mirror 150px from each edge at 1280", Math.round(bs.left) === 150 && Math.round(bs.right) === 150, `${bs.left} / ${bs.right}`);
    check(`${tag} Backstage: Stage sign right of the mirror, clear of frame and bulbs`, bs.signLeft >= bs.mirrorRight, `sign ${bs.signLeft.toFixed(1)} mirror+bulbs ${bs.mirrorRight.toFixed(1)}`);
    check(`${tag} Backstage: one sign, to the Stage only, named "Go to Stage, back to practice"`, bs.others === "stage" && bs.name === "Go to Stage, back to practice" && bs.w === 134 && Math.round(bs.right8) === 8);
    check(`${tag} Backstage: no sideways scroll`, !bs.hScroll);
    await b.shot(`shots/nav-${tag}-backstage.png`);

    await b.evaluate("goToView('wall')"); await b.settled();
    const wallPairs = [["#signStageFromWall", "#wallTitle"], ["#signStageFromWall", ".wall-sub"], ["#signStageFromWall", ".shelf-list > li"], ["#signStageFromWall", ".shelf-board"], ["#signStageFromWall", ".shelf-title"],
      ["#signStageFromWall", ".playbill"], ["#signStageFromWall", ".plaque"], ["#signStageFromWall", "#clearWallBtn"], ["#signStageFromWall", ".site-header"]];
    const wo1 = await overlaps(b, wallPairs);
    await b.evaluate(`(async () => { const s = document.querySelector(".wall-scroll"); for (let y = 0; y <= s.scrollHeight; y += 60) { s.scrollTop = y; } })()`);
    const scrolled = [];
    for (let y = 0; y < 4000; y += 80) {
      await b.evaluate(`document.querySelector(".wall-scroll").scrollTop = ${y}`);
      scrolled.push(...await overlaps(b, wallPairs));
    }
    await b.evaluate(`document.querySelector(".wall-scroll").scrollTop = 0`);
    const wl = await b.evaluate(`(() => { const items = [...document.querySelectorAll("#shelfList > li")]; const s = signStageFromWall.getBoundingClientRect();
      return { rows: new Set(items.map(i => Math.round(i.getBoundingClientRect().top))).size, w: s.width, left: s.left, others: [...document.querySelectorAll("#wallView .sign")].map(e => e.dataset.view).join(),
        name: signStageFromWall.getAttribute("aria-label"), dir: signStageFromWall.classList.contains("sign-left"), hScroll: document.documentElement.scrollWidth > innerWidth }; })()`);
    check(`${tag} Wall: Stage sign on the left wall, clear of title, shelf, frames and Clear (also while scrolling)`, wo1.length === 0 && scrolled.length === 0, [...wo1, ...new Set(scrolled)].slice(0, 4).join("; "));
    check(`${tag} Wall: one sign, to the Stage only, pointing left`, wl.others === "stage" && wl.dir && wl.w === 128 && Math.round(wl.left) === 10 && wl.name === "Go to Stage, back to practice");
    check(`${tag} Wall: all 8 trophies on one shelf row`, wl.rows === 1, wl.rows);
    check(`${tag} Wall: no sideways scroll`, !wl.hScroll);
    await b.shot(`shots/nav-${tag}-wall.png`);
    await done(b);
  }

  console.log("\n== sign behaviour (1280x800)");
  const b = await open(LIVE, { width: 1280, height: 800 });
  check("bulbs on every sign, about every 13px, top and bottom", await b.evaluate(`[...document.querySelectorAll("#stageView .sign")].every(s => s.querySelectorAll(".sign-bulb").length >= 8)`));
  check("bulbs and signs are still (no animation)", await b.evaluate(`[...document.querySelectorAll(".sign, .sign *")].every(e => e.getAnimations().length === 0 && getComputedStyle(e).animationName === "none")`));
  const c = await contrast(b, 1280, 800, ["#stageView .sign-name", "#stageView .sign-sub"]);
  const worst = c.reduce((a, x) => x[1] < a[1] ? x : a, ["", 99]);
  check("sign name and subtitle >= 4.5:1", worst[1] >= 4.5, c.map(x => x.join(" ")).join(", "));
  await b.evaluate("document.activeElement && document.activeElement.blur()");
  check("Tab reaches the Backstage sign", await b.tabTo("signBackstage"));
  const ring = await b.evaluate(`(() => { const c = getComputedStyle(signBackstage); return [signBackstage.matches(":focus-visible"), c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset].join(" "); })()`);
  check("visible focus ring on the sign", ring === "true solid 2px rgb(240, 207, 134) 3px", ring);
  await b.shot("shots/nav-focus-sign.png");
  await b.key("Enter"); await b.settled();
  check("Enter on the sign opens Backstage, focus on its heading", (await b.evaluate("currentView")) === "backstage" && (await b.active()) === "backstageEmptyTitle", await b.active());
  check("Tab reaches the Stage sign on Backstage", await b.tabTo("signStageFromBackstage"));
  await b.key(" "); await b.settled();
  check("Space on it goes back to the Stage, focus on the Backstage sign", (await b.evaluate("currentView")) === "stage" && (await b.active()) === "signBackstage", await b.active());
  check("Tab reaches the Wall of Fame sign", await b.tabTo("signWall"));
  await b.key(" "); await b.settled();
  check("Space on it opens the Wall, focus on its title", (await b.evaluate("currentView")) === "wall" && (await b.active()) === "wallTitle");
  check("Tab reaches the Stage sign on the Wall", await b.tabTo("signStageFromWall"));
  await b.key("Enter"); await b.settled();
  check("Enter on it goes back to the Stage, focus on the Wall of Fame sign", (await b.evaluate("currentView")) === "stage" && (await b.active()) === "signWall", await b.active());
  await b.mouse("#signWall"); await b.settled();
  check("click works too, with the curtain sweep", (await b.evaluate("currentView")) === "wall");
  await done(b);
}

// ---------------------------------------------------------------- the breakpoint
if (!only || only === "breakpoint") {
  console.log("\n== breakpoint");
  for (const w of [1280, 1279]) {
    const b = await open(LIVE, { width: w, height: 800 });
    const r = await b.evaluate(`(() => ({ signs: [...document.querySelectorAll("#stageView .sign")].map(s => s.getClientRects().length > 0), bar: getComputedStyle(document.querySelector(".main-nav")).display,
      fit: [...document.querySelectorAll("#stageView .sign")].filter(s => s.getClientRects().length).every(s => { const n = s.querySelector(".sign-name"), u = s.querySelector(".sign-sub"), r = s.getBoundingClientRect();
        return n.scrollWidth <= n.clientWidth && u.scrollWidth <= u.clientWidth && n.getBoundingClientRect().top - r.top >= 11 && r.bottom - u.getBoundingClientRect().bottom >= 11 && Math.round(u.getBoundingClientRect().height / parseFloat(getComputedStyle(u).lineHeight)) === 1; }) }))()`);
    if (w === 1280) check("1280: signs shown and their text fits, no bar", r.signs.every(Boolean) && r.fit && r.bar === "none", JSON.stringify(r));
    else check("1279: bottom bar shown, no signs", r.signs.every(x => !x) && r.bar === "grid", JSON.stringify(r));
    await b.close();
  }
}

// ---------------------------------------------------------------- narrow laptop windows: the bottom bar
async function barRoomChecks(b, tag, w, h) {
  for (const room of ["stage", "backstage", "wall"]) {
    if (room !== "stage") { await b.evaluate(`goToView("${room}")`); await b.settled(); }
    const base = await b.evaluate(`(() => ({ signs: [...document.querySelectorAll(".sign")].some(s => s.getClientRects().length), bar: getComputedStyle(document.querySelector(".main-nav")).display,
      hScroll: document.documentElement.scrollWidth > innerWidth, current: [...document.querySelectorAll(".main-nav .nav-item")].filter(e => e.getAttribute("aria-current") === "page").map(e => e.dataset.view).join() }))()`);
    check(`${tag} ${room}: bottom bar, no signs, no top menu, aria-current on ${room}`, base.bar === "grid" && !base.signs && base.current === room, JSON.stringify(base));
    check(`${tag} ${room}: no sideways scroll`, !base.hScroll);
    // at the top and fully scrolled, nothing is covered by the bar or the raised Stage sign
    const results = [];
    for (const pos of ["top", "bottom"]) {
      await b.evaluate(pos === "top" ? "window.scrollTo(0, 0)" : "window.scrollTo(0, document.documentElement.scrollHeight)"); await sleep(150);
      const pairs = room === "stage"
        ? [[".ticket-wrap", ".site-header"], [".ticket-wrap", ".mic-spot"], [".topic-actions", ".mic-spot"], [".ticket-wrap", ".main-nav"], [".ticket-wrap", ".stage-disc"]]
        : room === "backstage" ? [["#mirror", ".site-header .logo"], ["#mirror", "#privacyWrap"]] : [[".wall-head", ".site-header"]];
      results.push(...await overlaps(b, pairs));
      if (pos === "bottom") {
        const covered = await b.evaluate(`(() => { const bar = document.querySelector(".main-nav").getBoundingClientRect(), disc = document.querySelector(".stage-disc").getBoundingClientRect();
          const sel = ${JSON.stringify(room === "stage" ? "#stepSpeak button, #stepSpeak .action-title, #stepSpeak .action-text, #stepSpeak .upload-limits, #stepSpeak label" : room === "backstage" ? "#mirror, #mirror .bulb" : ".wall-scroll")};
          return [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect();
            const underBar = r.bottom > bar.top + 0.5 && r.top < bar.bottom;
            const underDisc = r.bottom > disc.top + 0.5 && r.right > disc.left && r.left < disc.right;
            return (underBar || underDisc) ? (e.id || e.className) + " bottom " + Math.round(r.bottom) + " bar " + Math.round(bar.top) + " disc " + Math.round(disc.top) : null; }).filter(Boolean); })()`);
        results.push(...covered);
      }
    }
    check(`${tag} ${room}: nothing overlapping, nothing hidden under the bar or the raised Stage sign`, results.length === 0, results.slice(0, 4).join("; "));
    await b.evaluate("window.scrollTo(0, 0)");
    await b.shot(`shots/nav-${tag}-${room}.png`);
  }
}

if (!only || only === "narrow") {
  for (const [w, h, dpr] of [[683, 768, 1], [768, 1024, 1], [1024, 768, 1], [1093, 526, 1.25]]) {
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    console.log(`\n== ${tag} (bottom bar)`);
    const b = await open(LIVE, { width: w, height: h, dpr, seed: true });
    await barRoomChecks(b, tag, w, h);
    // the ticket and panel on the Stage
    await b.evaluate("goToView('stage')"); await b.settled();
    const cut = await b.evaluate(`TOPICS.filter(t => { landTopic(t); return topicInput.classList.contains("is-scrolling"); }).length`);
    check(`${tag} no topic in topics.js is cut off`, cut === 0, cut);
    const row = await b.evaluate(`(() => { const tear = document.querySelector(".ticket-tear").getBoundingClientRect().left; return [...document.querySelectorAll(".topic-label, .topic-badge, .topic-hint, .ticket-serial")].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > tear - 1).map(e => e.className); })()`);
    check(`${tag} ticket's top row stays clear of the stub`, row.length === 0, row.join());
    await b.mouse("#timeTicket"); await sleep(300);
    const po = await overlaps(b, [["#settingsPanel", ".site-header"], ["#settingsPanel", ".ticket-wrap"], ["#settingsPanel", ".main-nav"]]);
    check(`${tag} the open panel clears the header, ticket and bar`, po.length === 0 && await b.evaluate("settingsPanel.getBoundingClientRect().left >= 0 && settingsPanel.getBoundingClientRect().right <= innerWidth"), po.join("; "));
    await b.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`); await sleep(100);
    // bar works by click, Enter and Space
    await b.mouse("#navWall"); await b.settled();
    check(`${tag} bar: click Wall of Fame`, (await b.evaluate("currentView")) === "wall" && (await b.evaluate("navWall.getAttribute('aria-current')")) === "page");
    await b.evaluate("navBackstage.focus()"); await b.key("Enter"); await b.settled();
    check(`${tag} bar: Enter on Backstage`, (await b.evaluate("currentView")) === "backstage");
    await b.evaluate("navStage.focus()"); await b.key(" "); await b.settled();
    check(`${tag} bar: Space on Stage`, (await b.evaluate("currentView")) === "stage" && (await b.evaluate("navStage.getAttribute('aria-current')")) === "page");
    await done(b);
  }
}

// ---------------------------------------------------------------- phones
if (!only || only === "phone") {
  for (const [w, h] of [[390, 780], [360, 740], [412, 915]]) {
    const tag = `${w}x${h}`;
    console.log(`\n== ${tag} (phone)`);
    const before = await open(BASE, { width: w, height: h });
    const oldSizes = await before.evaluate(`Object.fromEntries([...document.querySelectorAll(".main-nav .nav-item")].map(e => [e.id, [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]]))`);
    const oldFit = {};
    for (const room of ["backstage", "wall"]) { await before.evaluate(`showView("${room}")`); await sleep(100); oldFit[room] = await before.evaluate("document.documentElement.scrollHeight"); }
    await before.close();

    const b = await open(LIVE, { width: w, height: h, seed: true });
    const bar = await b.evaluate(`(() => { const n = document.querySelector(".main-nav"), cs = getComputedStyle(n), r = n.getBoundingClientRect(); const d = document.querySelector(".stage-disc"), dc = getComputedStyle(d), dr = d.getBoundingClientRect();
      return { border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor, bg: cs.backgroundImage, h: r.height, order: [...n.children].map(e => e.id).join(),
        disc: [dr.width, dr.height, dc.borderTopWidth, dc.borderTopColor, dc.borderTopLeftRadius].join(" "), raised: r.top - dr.top, discBg: dc.backgroundImage,
        bulbs: d.querySelectorAll(".ring-bulb").length, hScroll: document.documentElement.scrollWidth > innerWidth, vScroll: document.documentElement.scrollHeight > innerHeight }; })()`);
    check(`${tag} dark bar with a 2px gold top border`, bar.border === "2px solid rgb(217, 174, 82)" && bar.bg.includes("rgb(36, 16, 12), rgb(18, 8, 6)") && bar.h === 64, `${bar.border} ${bar.h}`);
    check(`${tag} Backstage, Stage, Wall of Fame in that order`, bar.order === "navBackstage,navStage,navWall", bar.order);
    check(`${tag} round red velvet Stage sign: 76px, 2px gold border, raised 18px`, bar.disc === "76 76 2px rgb(217, 174, 82) 999px" && Math.abs(bar.raised - 18) < 1 && bar.discBg.includes("rgb(108, 19, 30)"), `${bar.disc} raised ${bar.raised}`);
    check(`${tag} 12 bulbs around it`, bar.bulbs === 12);
    if (w === 390) check(`${tag} no page scroll on the Stage`, !bar.vScroll);
    check(`${tag} no sideways scroll`, !bar.hScroll);
    const sizes = await b.evaluate(`Object.fromEntries([...document.querySelectorAll(".main-nav .nav-item")].map(e => [e.id, [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]]))`);
    check(`${tag} tap targets at least as big as before`, Object.keys(oldSizes).every(id => sizes[id][0] >= oldSizes[id][0] && sizes[id][1] >= oldSizes[id][1] - 2), `before ${JSON.stringify(oldSizes)} now ${JSON.stringify(sizes)}`);
    for (const room of ["stage", "backstage", "wall"]) {
      if (room !== "stage") { await b.evaluate(`goToView("${room}")`); await b.settled(); }
      const st = await b.evaluate(`(() => { const items = [...document.querySelectorAll(".main-nav .nav-item")];
        const lit = getComputedStyle(document.querySelector(".ring-bulb"));
        return { current: items.filter(e => e.getAttribute("aria-current") === "page").map(e => e.dataset.view).join(),
          lit: lit.backgroundImage.includes("radial-gradient") && lit.opacity === "1", dim: lit.backgroundColor === "rgb(122, 90, 58)" && lit.opacity === "0.55",
          plates: [...document.querySelectorAll(".nav-side")].map(e => [e.dataset.view, getComputedStyle(e.querySelector(".nav-label")).backgroundImage !== "none", getComputedStyle(e.querySelector(".nav-arc")).display === "flex", getComputedStyle(e).color].join(":")),
          fit: document.documentElement.scrollHeight }; })()`);
      check(`${tag} on ${room}: aria-current on ${room} only`, st.current === room, st.current);
      check(`${tag} on ${room}: Stage bulbs ${room === "stage" ? "lit" : "dim"}`, room === "stage" ? st.lit : st.dim);
      const okPlates = st.plates.every(p => { const [v, plate, arc, color] = p.split(":"); return v === room ? plate === "true" && arc === "true" && color === "rgb(240, 207, 134)" : plate === "false" && arc === "false" && color === "rgb(201, 183, 159)"; });
      check(`${tag} on ${room}: brass plate and 3-bulb arc only on the current side item`, okPlates, st.plates.join(" | "));
      const c = await contrast(b, w, h, [".main-nav .nav-label"]);
      const worst = c.reduce((a, x) => x[1] < a[1] ? x : a, ["", 99]);
      check(`${tag} on ${room}: bar labels >= 4.5:1`, worst[1] >= 4.5, c.map(x => x.join(" ")).join(", "));
      if (room !== "stage") check(`${tag} ${room} still fits as before`, st.fit <= oldFit[room] + 1, `${st.fit} vs ${oldFit[room]}`);
      await b.shot(`shots/nav-${tag}-${room}.png`);
    }
    await b.evaluate("goToView('stage')"); await b.settled();
    await b.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); await sleep(100);
    const under = await b.evaluate(`(() => { const disc = document.querySelector(".stage-disc").getBoundingClientRect();
      return [...document.querySelectorAll("#stepSpeak button, #stepSpeak .action-title, #stepSpeak .action-text, #stepSpeak .upload-limits, #stepSpeak label")].filter(e => e.getClientRects().length).filter(e => { const r = e.getBoundingClientRect(); return r.bottom > disc.top + 0.5 && r.right > disc.left && r.left < disc.right; }).map(e => e.id || e.className); })()`);
    check(`${tag} the raised Stage sign covers nothing on the Stage`, under.length === 0, under.join());
    await b.evaluate("navStage.focus(); window.scrollTo(0, 0)");
    await b.key("Tab", true); await b.key("Tab");
    const ring = await b.evaluate(`(() => { const c = getComputedStyle(document.querySelector(".stage-disc")); return [navStage.matches(":focus-visible"), c.outlineStyle, c.outlineWidth, c.outlineColor].join(" "); })()`);
    check(`${tag} focus ring round the Stage sign`, ring === "true solid 2px rgb(240, 207, 134)", ring);
    await done(b);
  }
}

// ---------------------------------------------------------------- locking: as the menu today
async function lockRun(w, h, tag) {
  const b = await open(LIVE, { width: w, height: h, pre: [`localStorage.setItem("speakreview.settings.v1", '{"time":"","prep":"30"}')`] });
  const state = () => b.evaluate(`[...document.querySelectorAll(".nav-item")].filter(e => e.getClientRects().length).map(e => e.id + ":" + e.disabled).join()`);
  const allDisabled = async () => (await state()).split(",").every(s => s.endsWith(":true"));
  const noneDisabled = async () => (await state()).split(",").every(s => s.endsWith(":false"));
  check(`${tag} usable at rest`, await noneDisabled(), await state());
  await b.mouse("#micBtn");
  await b.waitFor("recState === 'prep'", 8000);
  check(`${tag} disabled while preparing`, await allDisabled(), await state());
  await b.click("#prepStartBtn");
  await b.waitFor("recState === 'countdown'", 3000);
  check(`${tag} disabled during the 3, 2, 1`, await allDisabled());
  await b.waitFor("recState === 'recording'", 6000);
  check(`${tag} disabled while recording`, await allDisabled());
  await sleep(16000);
  await b.click("#finishBtn");
  await b.waitFor("recState === 'review'", 5000);
  check(`${tag} usable again in Review`, await noneDisabled(), await state());
  await b.click("#takeSendBtn");
  check(`${tag} unreachable during Intermission (inert)`, await b.waitFor("intermissionOn && appRoot.inert", 5000));
  check(`${tag} signs and bar are inside the inert page`, await b.evaluate(`[...document.querySelectorAll(".nav-item")].every(e => appRoot.contains(e))`));
  await b.waitFor("currentView === 'backstage' && !appRoot.inert", 20000);
  await b.settled();
  check(`${tag} usable again after the result`, await noneDisabled(), await state());
  await done(b);
}
if (!only || only === "lock") {
  console.log("\n== locking");
  await lockRun(1280, 800, "signs 1280");
  await lockRun(1024, 768, "bar 1024");
  await lockRun(390, 780, "phone 390");
}

// ---------------------------------------------------------------- markup
if (!only || only === "markup") {
  console.log("\n== markup");
  const html = readFileSync(join(SITE, "index.html"), "utf8");
  check("no style attributes or inline handlers", !/\sstyle=|\son[a-z]+=/i.test(html));
  check("no em dashes", !html.includes("\u2014"));
  check("every room switcher is a button with data-view", (html.match(/<button[^>]*class="nav-item[^"]*"[^>]*data-view=/g) || []).length === 7 && (html.match(/class="nav-item sign[^"]*" data-view=/g) || []).length === 4);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
