import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'docs/look-playnotes-20260818');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const url = 'file://' + resolve(ROOT, 'dist/popinjay.html');

const stamp = () => {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};

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

// Create a save by starting a run, then reload so the title offers resume.
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
await page.waitForTimeout(200);

// Press Enter on title with a live save -> confirm dialog.
await page.keyboard.press('Enter');
await page.waitForTimeout(200);

const ts = stamp();
await page.screenshot({ path: resolve(OUT, `fixed-confirm-new-run-${ts}.png`), fullPage: true });

await browser.close();
if (failures.length) console.error('FAILURES:', failures);
else console.log('wrote', resolve(OUT, `fixed-confirm-new-run-${ts}.png`));
