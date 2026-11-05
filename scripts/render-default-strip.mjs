// Renders the default photo-strip template (design canvas "Wedding Memories, Burgundy",
// component "Template placeholder art") to public/strip/default-template.png at 1080 x 1920.
// No couple names and no date: the app draws those (src/lib/strip.ts DEFAULT_TEMPLATE_TEXT).
// Run once after changing the art: node scripts/render-default-strip.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = new URL("../public/strip/default-template.png", import.meta.url);

const spray = (style) => `
<svg width="560" height="560" viewBox="0 0 200 200" fill="none" stroke="#9C9D9B" stroke-width="1.2"
  stroke-linecap="round" style="position:absolute;${style}">
  <path d="M200 18 C150 40 120 70 96 120 C80 152 60 172 26 194"/>
  <path d="M150 42 C140 30 128 26 110 28 C122 41 134 46 150 42 Z"/>
  <path d="M118 82 C102 78 90 82 78 93 C94 99 106 95 118 82 Z"/>
  <path d="M96 120 C108 106 122 102 140 104 C128 118 112 124 96 120 Z"/>
  <g transform="translate(168 80)">${[0, 72, 144, 216, 288]
    .map((r) => `<ellipse cx="0" cy="-12" rx="6" ry="11" transform="rotate(${r})"/>`)
    .join("")}<circle cx="0" cy="0" r="3.5"/></g>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1080px; height: 1920px; }
  .art { position: absolute; inset: 0; overflow: hidden; background-color: #5E1E2B;
    background-image: radial-gradient(rgba(218,220,221,0.07) 1px, transparent 1.35px); background-size: 18px 18px;
    font-family: 'Poppins', system-ui, sans-serif; }
  .card { position: absolute; left: 250px; top: 210px; width: 580px; height: 1500px; background: #DADCDD;
    box-shadow: 0 16px 40px rgba(26,6,11,0.45); }
  .tag { position: absolute; left: 0; right: 0; top: 120px; text-align: center; font-size: 28px;
    letter-spacing: 0.3em; text-transform: uppercase; color: #DADCDD; }
</style></head><body><div class="art">
  ${spray("top:-30px;right:-90px")}
  ${spray("bottom:-30px;left:-90px;transform:rotate(180deg)")}
  <span class="card"></span>
  <span class="tag">The wedding of</span>
</div></body></html>`;

// CHROMIUM_PATH: use an already-installed Chromium when the bundled one is a different build.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  const poppins = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check("28px Poppins");
  });
  if (!poppins) console.warn("Poppins did not load; the label uses the system sans-serif.");
  mkdirSync(new URL(".", OUT), { recursive: true });
  await page.screenshot({ path: OUT.pathname, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  console.log(`Wrote ${OUT.pathname}`);
} finally {
  await browser.close();
}
