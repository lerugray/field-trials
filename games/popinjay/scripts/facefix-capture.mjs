// facefix-capture.mjs — F3 two-term fix verification frames beside re-exam batch.
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'docs/proofs/facefix-20260812');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function shot(page, name, ts) {
  const path = resolve(OUT, `${name}_${ts}.png`);
  if (existsSync(path)) throw new Error(`proof exists: ${path}`);
  await page.screenshot({ path });
  return path;
}

async function main() {
  build();
  mkdirSync(OUT, { recursive: true });
  const url = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
  const ts = stamp();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });

  const paths = {};
  paths.title = await shot(page, 'facefix-title_1440x900@1x', ts);

  await page.evaluate(() => window.POPINJAY.trunkDemo());
  await page.waitForTimeout(400);
  paths.trunk = await shot(page, 'facefix-trunk_1440x900@1x', ts);

  await page.evaluate(() => window.POPINJAY.draftDemo());
  await page.waitForTimeout(400);
  paths.draft = await shot(page, 'facefix-draft_1440x900@1x', ts);

  await page.evaluate(() => window.POPINJAY.startStageAt(1, 1));
  await page.waitForTimeout(600);
  paths.hud = await shot(page, 'facefix-hud-composure_1440x900@1x', ts);

  await page.evaluate(() => window.POPINJAY.optionsDemo());
  await page.waitForTimeout(400);
  paths.options = await shot(page, 'facefix-options_1440x900@1x', ts);

  const diag = await page.evaluate(() => {
    const errs = (window.POPINJAY?.debuglog?.errors()) || [];
    return { errors: errs.length };
  });

  await browser.close();
  console.log(JSON.stringify({ ...paths, errors: diag.errors, ts }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
