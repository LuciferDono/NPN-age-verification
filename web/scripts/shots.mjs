/**
 * Visual capture of the three console screens against a running server.
 *
 *   1. uvicorn server.main:app --port 8000
 *   2. node scripts/shots.mjs
 *
 * Outputs docs/shots/*.png. Used for the README, and as the QA lane's eyeball check
 * that a change did not wreck a layout — a diff of these is faster than clicking.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:8000";
const OUT = resolve(import.meta.dirname, "../../docs/shots");
const SAMPLES = resolve(import.meta.dirname, "../../samples");

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${name}.png`);
};

// 1. empty verify state
await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-verify-empty");

// 2. a completed assessment — three subjects, so at least one lands in each outcome
for (const s of ["child_08", "teen_17", "adult_34", "senior_72"]) {
  await page.setInputFiles('input[type="file"]', `${SAMPLES}/${s}.jpg`);
  await page.getByRole("button", { name: /analyse/i }).click();
  await page.waitForSelector("text=/Assessment/");
  await page.waitForTimeout(400);
  await shot(`02-verify-${s}`);
}

// 3. review queue
await page.getByRole("button", { name: /review queue/i }).click();
await page.waitForTimeout(300);
const firstRow = page.locator("tbody tr").first();
if (await firstRow.count()) await firstRow.click();
await page.waitForTimeout(200);
await shot("03-review-queue");

// 4. audit trail
await page.getByRole("button", { name: /audit trail/i }).click();
await page.waitForTimeout(300);
await shot("04-audit-trail");

// 5. model evidence — what makes the numbers on the other screens trustworthy
await page.getByRole("button", { name: /model evidence/i }).click();
await page.waitForTimeout(500);
await shot("05-model-evidence");

// 5. narrow viewport — the panel laptop may not be 1440 wide
await page.setViewportSize({ width: 900, height: 800 });
await page.getByRole("button", { name: /verify/i }).click();
await page.waitForTimeout(300);
await shot("06-verify-narrow");

await browser.close();
console.log(`\nwritten to ${OUT}`);
