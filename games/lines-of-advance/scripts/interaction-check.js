// Verify basic interaction: select a piece, move it, screenshot result.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist', 'index.html');
const OUT = resolve(__dirname, '..', 'proofs', 'm2-interaction-2026-08-07.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`file://${DIST}`);
await page.waitForSelector('.board-svg');

// Select the North arsenal at m1.
const arsenal = page.locator('[data-coord="m1"]').locator('..').locator('[data-id]').first();
await arsenal.click();
await page.waitForTimeout(100);

// Move it to m5.
const target = page.locator('[data-coord="m5"]');
await target.click();
await page.waitForTimeout(100);

await page.screenshot({ path: OUT });
console.log(`Interaction check saved to ${OUT}`);
await browser.close();
