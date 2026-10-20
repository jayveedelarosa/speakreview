// Feature set 2, stage 1b part 2: dressed settings menu and topic buttons
import { launch, sleep, API_STUB } from "../lib/cdp.mjs";
import { readFileSync } from "node:fs";
import { SITE, LIVE } from "../lib/paths.mjs";
import { join } from "node:path";
const FAKE = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const only = process.argv[2];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? "  (" + detail + ")" : ""}`);
};

async function open({ width = 1280, height = 800, dpr = 1 } = {}) {
  const mobile = width <= 600;
  const b = await launch({ width, height, flags: FAKE, mobile });
  if (dpr !== 1) await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  // The motion setting comes from the computer (Windows "Show animations"), so pin it: motion allowed
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.goto(LIVE, [API_STUB]);
  b.mouse = async sel => {
    const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(200);
  };
  b.hover = async sel => {
    const [x, y] = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(300);
  };
  b.tab = async () => {
    const base = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
    await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(60);
  };
  return b;
}
const done = async b => {
  check("no console errors", b.consoleErrors.length === 0, JSON.stringify(b.consoleErrors).slice(0, 300));
  check("no CSP violations", b.violations.length === 0, JSON.stringify(b.violations).slice(0, 300));
  await b.close();
};

// Contrast measured from the screen: the text colour against the background behind it. The background is
// sampled on a thin ring where there are no letters: 2px outside a text box, or just inside a button's border.
// The worst (closest to the text colour) of those pixels counts, after dropping the 2% most extreme.
async function contrast(b, w, h, items) {
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
      const [l, t, r, bt] = it.ring.map(Math.round);
      const ring = [];
      for (let X = l; X <= r; X++) { ring.push(px(X, t)); ring.push(px(X, bt)); }
      for (let Y = t; Y <= bt; Y++) { ring.push(px(l, Y)); ring.push(px(r, Y)); }
      const ratio = v => (Math.max(v, ink) + 0.05) / (Math.min(v, ink) + 0.05);
      const rs = ring.map(ratio).sort((a, b) => a - b);
      return [it.s, +rs[Math.floor(rs.length * 0.02)].toFixed(2)];
    });
  })()`);
  await d.close();
  return res;
}
const ITEMS = sels => `(() => { const out = []; for (const s of ${JSON.stringify(sels)}) document.querySelectorAll(s).forEach(e => {
  if (!e.getClientRects().length) return; const r = e.getBoundingClientRect(); if (r.width < 2) return;
  const cs = getComputedStyle(e); const bw = parseFloat(cs.borderTopWidth) || 0; const boxed = e.tagName === "BUTTON" && bw > 0 || e.matches(".choice > span") || e.id === "settingsDoneBtn";
  const ring = boxed ? [r.left + bw + 2, r.top + bw + 2, r.right - bw - 3, r.bottom - bw - 3] : [r.left - 2, r.top - 2, r.right + 1, r.bottom + 1];
  out.push({ s, c: cs.color, ring }); }); return out; })()`;

// ---------------------------------------------------------------- wording, look, icons, contrast, focus, hover, disabled
if (!only || only === "look") {
  for (const [w, h] of [[1280, 800], [390, 780]]) {
    const phone = w <= 600;
    const tag = phone ? "phone" : "laptop";
    console.log(`\n== ${tag}`);
    const b = await open({ width: w, height: h });

    // Topic buttons
    const tb = await b.evaluate(`(() => { const cs = e => getComputedStyle(e);
      const roll = cs(randomTopicBtn), wr = cs(writeTopicBtn), cl = cs(clearTopicBtn);
      const svg = e => { const s = e.querySelector("svg"); return s && s.getClientRects().length ? Math.round(s.getBoundingClientRect().width) : 0; };
      const vis = [...clearTopicBtn.querySelectorAll("span")].filter(s => s.getClientRects().length && getComputedStyle(s).clip !== "rect(0px, 0px, 0px, 0px)").map(s => s.textContent).join("");
      return { rollRadius: roll.borderTopLeftRadius, rollBorder: roll.borderTopStyle + " " + roll.borderTopWidth + " " + roll.borderTopColor, rollBg: roll.backgroundImage + " | " + roll.backgroundColor,
        rollColor: roll.color, rollH: randomTopicBtn.getBoundingClientRect().height,
        under: [wr, cl].map(s => [s.textDecorationLine, s.textDecorationStyle, s.textDecorationThickness, s.textUnderlineOffset, s.textDecorationColor].join(" ")),
        pen: svg(writeTopicBtn), mic: svg(clearTopicBtn), micHidden: clearTopicBtn.querySelector("svg").getAttribute("aria-hidden"), clearText: vis,
        writeText: writeTopicBtn.textContent.trim() }; })()`);
    check(`${tag} Roll: 6px corners, gold double border`, tb.rollRadius === "6px" && tb.rollBorder === "double 3px rgb(201, 162, 78)", `${tb.rollRadius} ${tb.rollBorder}`);
    check(`${tag} Roll: soft glow on gold`, tb.rollBg.includes("rgba(255, 205, 130, 0.16)") && tb.rollBg.endsWith("rgba(217, 174, 82, 0.12)"), tb.rollBg);
    check(`${tag} Roll: text colour and height unchanged`, tb.rollColor === "rgb(240, 207, 134)" && tb.rollH === (phone ? 40 : 42), `${tb.rollColor} ${tb.rollH}`);
    check(`${tag} Write your own and Speak freely: dashed gold underline`, tb.under.every(u => u === "underline dashed 1px 5px rgba(217, 174, 82, 0.65)"), JSON.stringify(tb.under));
    check(`${tag} pen icon ${phone ? 13 : 15}px`, tb.pen === (phone ? 13 : 15), tb.pen);
    check(`${tag} mic icon ${phone ? 13 : 15}px, aria-hidden`, tb.mic === (phone ? 13 : 15) && tb.micHidden === "true", tb.mic);
    check(`${tag} texts kept`, tb.writeText === "Write your own" && tb.clearText === (phone ? "No topic" : "Speak freely, no topic"), tb.clearText);

    // Speaking time panel
    await b.mouse("#timeTicket");
    await sleep(400);
    const p = await b.evaluate(`(() => { const cs = getComputedStyle(settingsPanel); const k = timePage.querySelector(".panel-kicker"); const kc = getComputedStyle(k);
      const d = timePage.querySelector(".panel-divider"); const dm = getComputedStyle(d.querySelector(".panel-diamond"));
      const kids = [...timePage.children].map(c => c.className);
      const chip = timePage.querySelector('.choice:has(input[value="60"]) > span'), on = timePage.querySelector('.choice:has(input:checked) > span');
      const c1 = getComputedStyle(chip), c2 = getComputedStyle(on);
      const arrow = getComputedStyle(settingsPanel.querySelector(".panel-arrow"));
      return { border: ["Top", "Left", "Right", "Bottom"].map(s => cs["border" + s + "Style"] + " " + cs["border" + s + "Width"]).join(", "), color: cs.borderTopColor,
        radius: [cs.borderTopLeftRadius, cs.borderBottomLeftRadius].join(" "), bg: cs.backgroundImage,
        kicker: k.textContent, kHidden: k.getAttribute("aria-hidden"), kStyle: [kc.fontSize, kc.fontWeight, kc.letterSpacing, kc.textTransform, kc.color].join(" "),
        order: kids.slice(0, 3).join(" > "), divHidden: d.getAttribute("aria-hidden"), diamond: [dm.width, dm.height, dm.backgroundColor, dm.transform].join(" "),
        lines: [...d.children].filter(c => !c.classList.contains("panel-diamond")).map(c => getComputedStyle(c).backgroundImage + " " + getComputedStyle(c).height),
        help: timePage.querySelector(".panel-help").textContent, label: settingsPanel.getAttribute("aria-labelledby"),
        chipOff: [c1.borderTopLeftRadius, c1.borderTopStyle, c1.borderTopColor, c1.backgroundColor, c1.color, c1.fontWeight].join(" "),
        chipOn: [c2.borderTopLeftRadius, c2.borderTopStyle, c2.backgroundColor, c2.color, c2.fontWeight].join(" "),
        arrow: [arrow.width, arrow.height, arrow.top, arrow.backgroundColor, arrow.borderLeftStyle, arrow.borderLeftWidth, arrow.borderTopStyle, arrow.borderLeftColor].join(" "),
        noNote: !document.querySelector(".panel-note, #rememberNote") && !document.body.textContent.includes("Remembered") && !document.body.textContent.includes("Picking one") }; })()`);
    if (phone) {
      check("sheet: gold double border on top, left and right, none at the bottom", p.border === "double 3px, double 3px, double 3px, none 0px" && p.color === "rgb(201, 162, 78)", p.border);
      check("sheet: 18px top corners", p.radius === "18px 0px", p.radius);
      check("sheet: spotlight wood, 26/27px stripes", p.bg.includes("rgba(255, 205, 130, 0.16)") && p.bg.includes("26px, rgba(0, 0, 0, 0.12) 26px, rgba(0, 0, 0, 0.12) 27px") && p.bg.includes("rgb(74, 41, 20), rgb(38, 19, 10)"), p.bg.slice(0, 200));
      check("sheet: drag handle stays", await b.evaluate(`settingsPanel.querySelector(".sheet-handle").getClientRects().length > 0`));
    } else {
      check("panel: gold double border all round", p.border === "double 3px, double 3px, double 3px, double 3px" && p.color === "rgb(201, 162, 78)", p.border);
      check("panel: 10px corners", p.radius === "10px 10px", p.radius);
      check("panel: spotlight wood, 30/31px stripes", p.bg.includes("rgba(255, 205, 130, 0.16)") && p.bg.includes("30px, rgba(0, 0, 0, 0.12) 30px, rgba(0, 0, 0, 0.12) 31px") && p.bg.includes("rgb(74, 41, 20), rgb(38, 19, 10)"), p.bg.slice(0, 200));
      check("arrow: 13px, #4A2914, gold double left and top, 9px above", p.arrow === "13px 13px -9px rgb(74, 41, 20) double 3px double rgb(201, 162, 78)", p.arrow);
      const off = await b.evaluate(`(() => { const a = settingsPanel.querySelector(".panel-arrow").getBoundingClientRect(), t = timeTicket.getBoundingClientRect(); return Math.abs(a.left + a.width / 2 - t.left - t.width / 2); })()`);
      check("arrow still on the open stub button", off < 1.5, off.toFixed(1));
    }
    check(`${tag} RUNTIME label above the title, aria-hidden`, p.kicker === "Runtime" && p.kHidden === "true" && p.order.startsWith("panel-kicker > panel-head > panel-divider"), p.order);
    check(`${tag} label style`, p.kStyle === "11px 800 2.64px uppercase rgb(227, 186, 96)", p.kStyle);
    check(`${tag} dialog still named by its title`, p.label === "speakingTimeLabel");
    check(`${tag} Speaking time line`, p.help === "How long your speech should last. Going over is fine.", p.help);
    check(`${tag} divider with a 6px gold diamond, aria-hidden`, p.divHidden === "true" && p.diamond === "6px 6px rgb(217, 174, 82) matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)", p.diamond);
    check(`${tag} divider lines fade in and out`, p.lines.length === 2 && p.lines[0].includes("rgba(217, 174, 82, 0), rgba(217, 174, 82, 0.6)") && p.lines[1].includes("rgba(217, 174, 82, 0.6), rgba(217, 174, 82, 0)") && p.lines.every(l => l.endsWith("1px")), JSON.stringify(p.lines));
    check(`${tag} choice not picked: 6px, dashed gold, dark, #F3E6D0, 600`, p.chipOff === "6px dashed rgba(217, 174, 82, 0.6) rgba(0, 0, 0, 0.18) rgb(243, 230, 208) 600", p.chipOff);
    check(`${tag} choice picked: 6px, solid gold, dark text, 800`, p.chipOn === "6px solid rgb(217, 174, 82) rgb(30, 16, 6) 800", p.chipOn);
    check(`${tag} bottom line removed`, p.noNote);

    // hover on a choice
    await b.hover('#timePage .choice:has(input[value="60"]) > span');
    check(`${tag} hover makes the choice border solid gold`, (await b.evaluate(`getComputedStyle(document.querySelector('#timePage .choice:has(input[value="60"]) > span')).borderTopStyle`)) === "solid");

    // Custom + Done
    await b.mouse('#timePage .choice:has(input[value="custom"]) > span');
    check(`${tag} Done 6px corners`, (await b.evaluate("getComputedStyle(settingsDoneBtn).borderTopLeftRadius")) === "6px");
    check(`${tag} Done ${phone ? "44" : "36"}px`, (await b.evaluate("settingsDoneBtn.getBoundingClientRect().height")) === (phone ? 44 : 36));
    let items = await b.evaluate(ITEMS(["#timePage .panel-kicker", "#timePage .panel-title", "#timePage .panel-help", "#timePage .choice > span", "#settingsDoneBtn", "#timePage .field-label", "#timePage .custom-range"]));
    let res = await contrast(b, w, h, items);
    let worst = res.reduce((a, c) => c[1] < a[1] ? c : a, ["", 99]);
    check(`${tag} Speaking time panel text >= 4.5:1`, worst[1] >= 4.5, `worst ${worst.join(" ")}; ${res.map(r => r.join(" ")).join(", ")}`);
    await b.shot(`shots/1c-${tag}-custom.png`);

    // focus rings
    const rings = [];
    for (const sel of ['#timePage input[value="60"]', "#settingsDoneBtn"]) {
      await b.tab();
      await b.evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`);
      rings.push(await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const t = e.type === "radio" ? e.nextElementSibling : e; const c = getComputedStyle(t);
        return ${JSON.stringify(sel)} + ": " + [e.matches(":focus-visible"), c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset].join(" "); })()`));
    }
    check(`${tag} focus rings on a choice and Done: 2px light gold, outside the border`, rings.every(r => r.endsWith("true solid 2px rgb(240, 207, 134) 3px")), rings.join(" | "));
    await b.shot(`shots/1c-${tag}-focus-done.png`);
    await b.evaluate(`settingsDoneBtn.click()`);
    await sleep(150);

    // Prep time
    await b.mouse("#prepSetting");
    await sleep(400);                    // let the sheet finish sliding in before measuring
    const pp = await b.evaluate(`({ k: prepPage.querySelector(".panel-kicker").textContent, help: prepPage.querySelector(".panel-help").textContent, label: settingsPanel.getAttribute("aria-labelledby"), timeShown: !timePage.hidden })`);
    check(`${tag} CURTAIN IN label and Prep time line`, pp.k === "Curtain in" && pp.help === "Thinking time before recording starts." && pp.label === "prepTimeLabel" && !pp.timeShown, JSON.stringify(pp));
    items = await b.evaluate(ITEMS(["#prepPage .panel-kicker", "#prepPage .panel-title", "#prepPage .panel-help", "#prepPage .choice > span"]));
    res = await contrast(b, w, h, items);
    worst = res.reduce((a, c) => c[1] < a[1] ? c : a, ["", 99]);
    check(`${tag} Prep time panel text >= 4.5:1`, worst[1] >= 4.5, `worst ${worst.join(" ")}; ${res.map(r => r.join(" ")).join(", ")}`);
    await b.shot(`shots/1c-${tag}-prep.png`);
    if (phone) await b.mouse("#settingsDoneBtn"); else await b.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await sleep(150);
    check(`${tag} closes as before`, await b.evaluate("settingsPanel.hidden"));

    // topic buttons: contrast, hover, focus, disabled
    items = await b.evaluate(ITEMS(["#randomTopicBtn", "#writeTopicBtn", "#clearTopicBtn"]));
    res = await contrast(b, w, h, items);
    worst = res.reduce((a, c) => c[1] < a[1] ? c : a, ["", 99]);
    check(`${tag} topic button text >= 4.5:1`, worst[1] >= 4.5, res.map(r => r.join(" ")).join(", "));
    const before = await b.evaluate("getComputedStyle(randomTopicBtn).backgroundImage + getComputedStyle(randomTopicBtn).backgroundColor");
    await b.hover("#randomTopicBtn");
    const after = await b.evaluate("getComputedStyle(randomTopicBtn).backgroundImage + getComputedStyle(randomTopicBtn).backgroundColor");
    check(`${tag} Roll hover still visible (keeps the glow)`, before !== after && after.includes("rgba(255, 205, 130, 0.16)") && after.endsWith("rgba(217, 174, 82, 0.22)"), after.slice(-60));
    const tr = [];
    for (const sel of ["#randomTopicBtn", "#writeTopicBtn", "#clearTopicBtn"]) {
      await b.tab();
      await b.evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`);
      tr.push(await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const c = getComputedStyle(e); return ${JSON.stringify(sel)} + ": " + [e.matches(":focus-visible"), c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset].join(" "); })()`));
    }
    check(`${tag} focus rings on the topic buttons`, tr.every(r => r.endsWith("true solid 2px rgb(240, 207, 134) 3px")), tr.join(" | "));
    await b.evaluate("randomTopicBtn.focus()");
    await b.shot(`shots/1c-${tag}-focus-roll.png`);
    await b.evaluate("setOptionsDisabled(true)");
    const dis = await b.evaluate(`[randomTopicBtn, writeTopicBtn, clearTopicBtn, timeTicket, prepTicket].map(e => e.disabled && getComputedStyle(e).opacity === "0.5")`);
    check(`${tag} disabled while busy (0.5)`, dis.every(Boolean), JSON.stringify(dis));
    await b.evaluate("setOptionsDisabled(false)");
    await done(b);
  }
}

// ---------------------------------------------------------------- layout at every size
if (!only || only === "sizes") {
  console.log("\n== sizes");
  for (const [w, h, dpr] of [[1280, 800, 1], [1366, 657, 1], [1093, 526, 1.25], [1920, 1080, 1], [390, 780, 1], [360, 740, 1], [412, 915, 1]]) {
    const tag = `${w}x${h}${dpr !== 1 ? "@125%" : ""}`;
    const phone = w <= 600;
    const b = await open({ width: w, height: h, dpr });
    if (w === 390) check(`${tag} no page scroll with nothing open`, await b.evaluate("document.documentElement.scrollHeight <= innerHeight"));
    check(`${tag} buttons under the ticket inside the window`, await b.evaluate(`[randomTopicBtn, writeTopicBtn, clearTopicBtn].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })`));
    for (const which of ["time", "prep"]) {
      await b.mouse(which === "time" ? "#timeTicket" : "#prepSetting");
      if (which === "time") await b.mouse('#timePage .choice:has(input[value="custom"]) > span');
      const r = await b.evaluate(`(() => { const p = settingsPanel.getBoundingClientRect(); const t = (openSetting === "prep" ? prepTicket : timeTicket).getBoundingClientRect(); const a = settingsPanel.querySelector(".panel-arrow").getBoundingClientRect();
        return { inside: p.left >= 0 && p.right <= innerWidth + 0.5, hScroll: document.documentElement.scrollWidth > innerWidth, arrow: Math.abs(a.left + a.width / 2 - t.left - t.width / 2) }; })()`);
      check(`${tag} ${which} open: inside the window, no sideways scroll${phone ? "" : ", arrow on the stub"}`, r.inside && !r.hScroll && (phone || r.arrow < 1.5), JSON.stringify(r));
      await b.shot(`shots/1c-${tag}-${which}.png`);
      if (phone || which === "time") await b.mouse("#settingsDoneBtn");
      else await b.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
      await sleep(150);
    }
    await done(b);
  }
  console.log("\n== markup");
  const html = readFileSync(join(SITE, "index.html"), "utf8");
  check("no style attributes or inline handlers", !/\sstyle=|\son[a-z]+=/i.test(html));
  check("no em dashes", !html.includes("\u2014"));
}

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures ? 1 : 0);
