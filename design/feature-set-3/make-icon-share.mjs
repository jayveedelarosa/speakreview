// Makes the site icons from icon-source.html with the test tools' Chrome (DESIGN-NOTES-icon-share.md).
// Never deployed. Run from anywhere after `cd tests && npm install` once:
//   node design/feature-set-3/make-icon-share.mjs
// Writes into site/, plus check pictures of the small icons in tests/.output/shots/ (never committed).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, sleep } from "../../tests/lib/cdp.mjs";
import { SITE, SHOTS } from "../../tests/lib/paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DARK = "#1A0B0A";
const b = await launch({ width: 1200, height: 630 });

async function open(page) {
  await b.send("Page.navigate", { url: pathToFileURL(join(HERE, page)).href });
  for (let i = 0; i < 50 && !(await b.evaluate("document.readyState === 'complete'").catch(() => false)); i++) await sleep(200);
  await b.evaluate("document.fonts.ready.then(() => true)");
}

// A PNG of the top-left width x height pixels; see-through where the page has no background
async function capture(width, height, transparent = false) {
  await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await b.send("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await sleep(150);
  const r = await b.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  return Buffer.from(r.data, "base64");
}

// The arch drawn natively at `size` px, centred on a `tile` px square of `bg`
async function icon(tile, size, bg = "transparent") {
  await b.evaluate(`(() => {
    const s = document.documentElement.style;
    s.setProperty("--tile", "${tile}px"); s.setProperty("--icon", "${size}px"); s.setProperty("--bg", "${bg}");
    return document.querySelector(".tile img").decode().then(() => true);
  })()`);
  return capture(tile, tile, bg === "transparent");
}

// An .ico holding PNG images (every current browser reads PNG inside ICO)
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e);
    head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.data)]);
}

const save = (name, data) => { writeFileSync(join(SITE, name), data); console.log(`${name}  ${data.length} bytes`); };

await open("icon-source.html");
const small = [];
for (const size of [16, 32, 48]) small.push({ size, data: await icon(size, size) });
save("favicon.ico", ico(small));
save("apple-touch-icon.png", await icon(180, 135, DARK));          // 75% of the width
// 64% of the tile keeps the arch's bottom corners inside Android's round (80%) safe zone
save("icon-192.png", await icon(192, 123, DARK));
save("icon-512.png", await icon(512, 328, DARK));

// Check picture: the 16px and 32px icons on a light and a dark tab, real size and 8x (pixels kept square)
const tabs = [["light tab", "#FFFFFF"], ["dark tab", "#35363A"]];
const figs = [];
for (const [label, bg] of tabs) for (const size of [16, 32]) {
  const png = (await icon(size, size, bg)).toString("base64");
  figs.push({ label: `${size}px, ${label}`, src: `data:image/png;base64,${png}`, size });
}
await b.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await b.evaluate(`(() => {
  document.querySelector(".tile").hidden = true;
  const zoom = document.querySelector(".zoom");
  zoom.classList.add("on");
  for (const f of ${JSON.stringify(figs)}) {
    const fig = document.createElement("figure");
    const real = new Image(); real.src = f.src;
    const big = new Image(); big.src = f.src; big.width = big.height = f.size * 8;
    const cap = document.createElement("figcaption"); cap.textContent = f.label;
    fig.append(big, real, cap);
    zoom.append(fig);
  }
  return Promise.all([...zoom.querySelectorAll("img")].map(i => i.decode())).then(() => true);
})()`);
const box = await b.evaluate("(() => { const r = document.querySelector('.zoom').getBoundingClientRect(); return [Math.ceil(r.width), Math.ceil(r.height)]; })()");
writeFileSync(join(SHOTS, "icon-check.png"), await capture(box[0], box[1]));
console.log(`check picture: ${join(SHOTS, "icon-check.png")}`);

await b.close();
