// capture-proof.mjs — drive the built dist/index.html from file:// with a real browser and save
// dated proof screenshots (Gate 9/10). Also exercises real keyboard and a real mouse click, which
// is the ground the M2 real-event input gate (Gate 2) will stand on.
//
// Run: node scripts/build-singlefile.mjs && \
//   NODE_PATH="$(node -e "console.log(require('path').dirname(require.resolve('playwright/package.json')))" 2>/dev/null || echo)" \
//   node scripts/capture-proof.mjs <out-dir>
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is a dev tool resolved from wherever it is installed (npx cache); pass its
// node_modules dir in PW_PATH. It is never a runtime dependency of the game.
const pwBase = process.env.PW_PATH;
if (!pwBase) throw new Error('set PW_PATH to the node_modules dir that contains playwright');
const require = createRequire(join(pwBase, 'noop.js'));
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(ROOT, 'docs', 'proofs', 'shots');
mkdirSync(outDir, { recursive: true });

const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

async function shot(page, name) {
  await page.waitForTimeout(180); // let a few RAF frames draw
  await page.screenshot({ path: join(outDir, name) });
  // eslint-disable-next-line no-console
  console.log('captured', name);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

await shot(page, '01-orientation.png');

// Dismiss the orientation packet with the keyboard.
await page.keyboard.press('Enter');
await shot(page, '02-admin.png');

// Real mouse click on the "Raise fortification" button (buffer 126,334 -> client x2, no letterbox).
await page.mouse.click(252, 668);
await shot(page, '03-fortified-by-mouse.png');

// Open the pre-commit checklist and confirm the sign-over.
await page.keyboard.press('Enter');
await shot(page, '04-checklist.png');
await page.keyboard.press('Enter');
await shot(page, '05-after-action-report.png');

// Drive cycles until the tenure closes, then capture the closing report. Stop the moment the
// status leaves 'active' so the closed screen is not restarted by a stray keypress.
for (let i = 0; i < 25; i++) {
  const s = await page.evaluate(() => window.__GAME.state());
  if (s.status !== 'active') break;
  await page.keyboard.press('Enter'); // open the pre-commit checklist from ADMIN
  await page.keyboard.press('Enter'); // confirm the sign-over
  await page.waitForTimeout(50);
}
await shot(page, '06-tenure-closed.png');

// The pause surface (controls shown in-game, contract item 5).
await page.keyboard.press('Escape');
await shot(page, '07-pause-surface.png');

await browser.close();
