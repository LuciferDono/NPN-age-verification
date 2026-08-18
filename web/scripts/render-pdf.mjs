/**
 * Render a markdown document to a print-quality PDF.
 *
 *   node scripts/render-pdf.mjs ../docs/PRESENTATION_GUIDE.md
 *   node scripts/render-pdf.mjs ../docs/TEAM_GUIDE.md --css ../docs/team-guide-print.css
 *
 * Uses the Chromium already installed for the screenshot script, so the only added
 * dependency is a markdown parser. Kept as a script rather than a one-off command because
 * these documents are regenerated whenever the numbers change, and a PDF that silently
 * predates its own source is worse than no PDF.
 */
import { chromium } from "playwright";
import { marked } from "marked";
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";

const args = process.argv.slice(2);
const cssIdx = args.indexOf("--css");
const cssArg = cssIdx >= 0 ? args[cssIdx + 1] : null;
// Skip the flag and its value when looking for the positional source file. Guard on
// cssIdx >= 0 first: indexOf returns -1 when the flag is absent, and -1 + 1 is 0, which
// would exclude the source file itself.
const src = args.find((a, i) => !a.startsWith("--") && !(cssIdx >= 0 && i === cssIdx + 1));
if (!src) {
  console.error("usage: node scripts/render-pdf.mjs <file.md> [--css <file.css>]");
  process.exit(2);
}

const srcPath = resolve(process.cwd(), src);
const outPath = srcPath.replace(/\.md$/i, ".pdf");
const cssPath = cssArg
  ? resolve(process.cwd(), cssArg)
  : resolve(dirname(srcPath), "team-guide-print.css");

const md = readFileSync(srcPath, "utf8");
const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
if (!css) console.warn(`  no stylesheet at ${cssPath} — rendering unstyled`);

marked.setOptions({ gfm: true, breaks: false });

const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${basename(srcPath)}</title>
<style>${css}</style></head>
<body>${marked.parse(md)}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(doc, { waitUntil: "networkidle" });

// Footer carries the page number. Chromium substitutes the pageNumber/totalPages classes
// at print time and requires inline styles in these templates.
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    `<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:8pt;` +
    `color:#8b918b;padding:0 16mm;display:flex;justify-content:space-between;">` +
    `<span>Age Verification — Clinical Console</span>` +
    `<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});

await browser.close();

const bytes = readFileSync(outPath);
const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`  wrote ${outPath}`);
console.log(`  ${Math.round(bytes.length / 1024)} KB, ${pages} pages`);
