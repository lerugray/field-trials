// Opening-polish proof capture (2026-08-18) — the masthead + dither round.
//
// Rebuilds the artifact and captures the three opening surfaces at 1280x720 (an exact 2x of the
// 640x360 native buffer, so every captured pixel is a whole game pixel):
//   clean boot   — the charter as a stranger first sees it
//   corrupt save — the same sheet with the desk-slip save notice below it
//   options      — the second overlay sheet, to prove the dither/ink pass is consistent
//
// Usage: node scripts/capture-opening-polish.mjs [outSubdir] [prefix]
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const OUT = join(ROOT, 'docs', 'verification', process.argv[2] || 'opening-polish-2026-08-18');
const PREFIX = process.argv[3] || 'after';
mkdirSync(OUT, { recursive: true });

execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'inherit' });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

async function settle() {
  await page.waitForFunction(() => !!window.__GAME);
  await page.waitForTimeout(450);
}

// 1. clean boot
await page.goto(fileUrl);
await settle();
await page.screenshot({ path: join(OUT, `${PREFIX}-clean-boot.png`), type: 'png' });
console.log('overlay at clean boot:', await page.evaluate(() => window.__GAME.state().overlay));

// 2. options sheet (from the clean boot, before any save is planted)
await page.keyboard.press('o');
await page.waitForTimeout(350);
console.log('overlay after O:', await page.evaluate(() => window.__GAME.state().overlay));
await page.screenshot({ path: join(OUT, `${PREFIX}-options.png`), type: 'png' });

// 3. corrupt-save notice: plant unparseable JSON, reload, capture the desk slip
await page.evaluate(() => localStorage.setItem('material-breach:save', '{{{ not json'));
await page.reload();
await settle();
await page.screenshot({ path: join(OUT, `${PREFIX}-corrupt-notice.png`), type: 'png' });

// leave the browser profile clean for the next run
await page.evaluate(() => localStorage.removeItem('material-breach:save'));

await ctx.close();
await browser.close();

if (errs.length) {
  console.error('PAGE ERRORS:', errs.join(' | '));
  process.exit(1);
}
console.log('wrote captures to', OUT);
