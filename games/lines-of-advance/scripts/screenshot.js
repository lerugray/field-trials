// Capture dated M3 proof screenshots at fixed viewports via Playwright.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist', 'index.html');
const PROOFS = resolve(ROOT, 'proofs');

const viewports = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '2560x1440', width: 2560, height: 1440 }
];

const today = new Date().toISOString().slice(0, 10);

async function selectCommsDrill(page) {
  await page.locator('button:has-text("Comms Drill")').click();
  await page.waitForTimeout(150);
}

async function selectUnitAt(page, coord) {
  await page.locator(`[data-coord="${coord}"]`).first().click();
  await page.waitForTimeout(150);
}

async function moveSelectedTo(page, coord) {
  await page.locator(`[data-coord="${coord}"]`).first().click();
  await page.waitForTimeout(150);
}

async function main() {
  mkdirSync(PROOFS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();

  for (const vp of viewports) {
    const page = await context.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`file://${DIST}`);
    await page.waitForSelector('.board-svg', { state: 'visible' });

    // Use the comms-drill preset and select the supplied North infantry.
    await selectCommsDrill(page);
    await selectUnitAt(page, 'e17');

    const path = resolve(PROOFS, `m3-${vp.name}-${today}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`Captured ${path}`);
    await page.close();
  }

  // Dedicated comms-cut proof: move South infantry to e18, then select a disabled North unit.
  {
    const page = await context.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`file://${DIST}`);
    await page.waitForSelector('.board-svg', { state: 'visible' });
    await selectCommsDrill(page);
    await selectUnitAt(page, 'f18');
    await moveSelectedTo(page, 'e18');
    await selectUnitAt(page, 'e17');
    const path = resolve(PROOFS, `m3-comm-cut-${today}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`Captured ${path}`);
    await page.close();
  }

  // Audit panel proof: select the relay-supplied infantry in the test preset after a cut.
  {
    const page = await context.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`file://${DIST}`);
    await page.waitForSelector('.board-svg', { state: 'visible' });
    await selectCommsDrill(page);
    await selectUnitAt(page, 'f18');
    await moveSelectedTo(page, 'e18');
    await selectUnitAt(page, 'f17');
    const path = resolve(PROOFS, `m3-audit-${today}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`Captured ${path}`);
    await page.close();
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
