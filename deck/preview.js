/**
 * Render every slide's HTML to a PNG and tile them into contact sheets.
 *
 *   node preview.js
 *
 * LibreOffice is not installed, so the PPTX itself cannot be rasterised here. These sheets
 * render the same HTML that html2pptx measures positions from, so they catch the things
 * worth catching: text overflow, overlap, contrast, and anything running off an edge.
 *
 * What they do NOT show: the five charts, which pptxgenjs draws into placeholder rectangles
 * after the HTML is converted. Those appear as grey blocks here and must be checked in
 * PowerPoint itself.
 */
const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const SLIDES = path.join(__dirname, "slides");
const OUT = path.join(__dirname, "preview");
fs.mkdirSync(OUT, { recursive: true });

const W = 720, H = 405;      // points, matching the deck layout
const SCALE = 1.4;           // legible in a tiled sheet without being huge

async function main() {
  const files = fs.readdirSync(SLIDES).filter((f) => f.endsWith(".html")).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: Math.round(W * 1.333), height: Math.round(H * 1.333) },
    deviceScaleFactor: SCALE,
  });

  const shots = [];
  for (const f of files) {
    const out = path.join(OUT, f.replace(/\.html$/, ".png"));
    await page.goto(`file://${path.join(SLIDES, f).replace(/\\/g, "/")}`,
      { waitUntil: "networkidle" });
    await page.screenshot({ path: out });
    shots.push(out);
    console.log(`  ${f}`);
  }
  await browser.close();

  // Tile into sheets of 6 (2 x 3) so each slide is still readable when I look at it.
  const COLS = 2, ROWS = 3, PER = COLS * ROWS;
  const meta = await sharp(shots[0]).metadata();
  const cw = Math.round(meta.width / 1.55), ch = Math.round(meta.height / 1.55);

  for (let s = 0; s * PER < shots.length; s++) {
    const batch = shots.slice(s * PER, s * PER + PER);
    const layers = await Promise.all(batch.map(async (p, i) => ({
      input: await sharp(p).resize(cw, ch).extend({
        top: 0, bottom: 2, left: 0, right: 2, background: "#c3bfb2",
      }).toBuffer(),
      left: (i % COLS) * (cw + 2),
      top: Math.floor(i / COLS) * (ch + 2),
    })));
    const sheet = path.join(OUT, `sheet-${s + 1}.png`);
    await sharp({
      create: {
        width: COLS * (cw + 2), height: ROWS * (ch + 2),
        channels: 3, background: "#ffffff",
      },
    }).composite(layers).png().toFile(sheet);
    console.log(`  -> ${sheet}  (slides ${s * PER + 1}-${Math.min((s + 1) * PER, shots.length)})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
