/**
 * Record the backup demo video by driving the real console.
 *
 *   1. cd web && npm run build
 *   2. NPN_MOCK=0 uvicorn server.main:app --port 8000
 *   3. node scripts/demo.mjs
 *
 * Writes docs/demo/demo.webm.
 *
 * This exists because a live demo has one job and several ways to fail: the laptop, the
 * projector, a cold CUDA context, a mistyped click. The recording is the insurance, and
 * it is scripted rather than screen-captured so it can be regenerated after any change
 * instead of re-performed.
 *
 * The run is a deliberate argument, not a feature tour:
 *   1. a clean adult case          the system works
 *   2. a child                     it reads the paediatric band
 *   3. a 17-year-old               it gets the age WRONG and refuses to auto-action
 *   4. the review queue            a human adjudicates that exact case
 *   5. the audit trail             every step recorded, no image stored
 *   6. model evidence              why any of the numbers should be believed
 *
 * Step 3 is the point of the whole video. Everything before it earns the right to be
 * believed; everything after it shows what the system does about being wrong.
 */
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:8000";
const OUT = resolve(import.meta.dirname, "../../docs/demo");
const SAMPLES = resolve(import.meta.dirname, "../../samples");

// Long enough to read a panel, short enough that nobody reaches for the scrub bar.
const BEAT = Number(process.env.BEAT ?? 2600);
const beat = (p, ms = BEAT) => p.waitForTimeout(ms);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

const analyse = async (sample, waitFor = /Assessment/) => {
  await page.setInputFiles('input[type="file"]', `${SAMPLES}/${sample}.jpg`);
  await beat(page, 900);
  await page.getByRole("button", { name: /analyse/i }).click();
  await page.waitForSelector(`text=${waitFor}`);
  await beat(page);
};

console.log("recording...");

// --- 1. the console, at rest ------------------------------------------------
await page.goto(BASE, { waitUntil: "networkidle" });
await beat(page, 3000);

// --- 2. a clean adult case: the happy path ---------------------------------
await analyse("adult_34");
await beat(page, 1200);

// --- 3. a child: the paediatric band -----------------------------------------
await analyse("child_08");
await beat(page, 1200);

// --- 4. the case that matters ------------------------------------------------
// True age 17. The model reads high, the interval crosses the age-18 boundary, and the
// system declines to decide. Hold on this one: it is the argument.
await analyse("teen_17");
await beat(page, 4200);

// --- 5. a human adjudicates --------------------------------------------------
await page.getByRole("button", { name: /review queue/i }).click();
await beat(page, 2000);

const firstRow = page.locator("tbody tr").first();
if (await firstRow.count()) {
  await firstRow.click();
  await beat(page, 1600);
  await page.getByPlaceholder(/clinician id/i).fill("dr_okafor");
  await beat(page, 900);
  await page.getByPlaceholder(/only if overriding/i).fill("17");
  await beat(page, 1100);
  await page.getByRole("button", { name: /^override$/i }).click();
  await beat(page, 2400);
}

// --- 6. the audit trail ------------------------------------------------------
await page.getByRole("button", { name: /audit trail/i }).click();
await beat(page, 3600);

// --- 7. why believe any of it ------------------------------------------------
await page.getByRole("button", { name: /model evidence/i }).click();
await beat(page, 5200);
await page.mouse.wheel(0, 320);
await beat(page, 3400);

// --- 8. back to rest ---------------------------------------------------------
await page.getByRole("button", { name: /^verify$/i }).click();
await beat(page, 2000);

await ctx.close();          // flushes the video file
await browser.close();

const file = readdirSync(OUT).find((f) => f.endsWith(".webm"));
if (!file) {
  console.error("no video produced");
  process.exit(1);
}
renameSync(resolve(OUT, file), resolve(OUT, "demo.webm"));
console.log(`  wrote ${resolve(OUT, "demo.webm")}`);
