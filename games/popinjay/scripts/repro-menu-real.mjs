import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'docs/look-playnotes-20260818');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const url = 'file://' + resolve(ROOT, 'dist/popinjay.html');

async function capture(name, prep) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  if (prep) await prep(page);
  await page.screenshot({ path: resolve(OUT, name), fullPage: true });
  await browser.close();
  if (failures.length) console.error('FAILURES:', failures);
  return failures.length === 0;
}

const stamp = () => {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};

const ts = stamp();

// Scenario: boot, start a run (creates save), reload so title shows resume ribbon,
// then open options from title.
await capture(`repro-options-with-save-${ts}.png`, async (page) => {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  await page.waitForTimeout(200);
  await page.keyboard.press('o');
  await page.waitForTimeout(200);
});

// Scenario: boot with save, resume (R), then pause (Esc).
await capture(`repro-pause-after-resume-${ts}.png`, async (page) => {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  await page.waitForTimeout(200);
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

// Scenario: boot with save, press Enter to start new -> confirm dialog appears.
await capture(`repro-confirm-new-run-${ts}.png`, async (page) => {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
});

console.log('wrote to', OUT);
