// capture-proof-m5.mjs — M5 proof: the bureaucratic ladder. Drive until an officer serves an
// instrument, show it in the ledger with its deadline stamp and the Answer button, then answer it.
// Real browser, real input. Run with PW_PATH set.
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const pwBase = process.env.PW_PATH;
if (!pwBase) throw new Error('set PW_PATH to the node_modules dir that contains playwright');
const require = createRequire(join(pwBase, 'noop.js'));
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(ROOT, 'docs', 'proofs', 'shots-m5');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

async function shot(name) {
  await page.waitForTimeout(140);
  await page.screenshot({ path: join(outDir, name) });
  console.log('captured', name);
}
const st = () => page.evaluate(() => window.__GAME.state());

// Sign one cycle from ADMIN and return to ADMIN, skipping the raid replay.
async function sign() {
  await page.keyboard.press('Enter'); // open checklist
  await page.waitForFunction(() => window.__GAME.state().overlay === 'checklist', { timeout: 2000 }).catch(() => {});
  await page.keyboard.press('Enter'); // confirm -> raid replay (or closed)
  await page.waitForTimeout(60);
  if ((await st()).overlay === 'raid') {
    await page.keyboard.press('Enter'); // skip the replay
    await page.waitForFunction(() => window.__GAME.state().overlay !== 'raid', { timeout: 2000 }).catch(() => {});
  }
}

await page.keyboard.press('Enter'); // dismiss orientation

// Drive undefended cycles: breaching raids accrue findings until an officer serves an instrument.
let served = false;
for (let i = 0; i < 10; i++) {
  const s = await st();
  if (s.noticesServed > 0) {
    served = true;
    break;
  }
  if (s.status !== 'active') break;
  await sign();
}
await shot('01-instrument-served.png'); // the ledger shows the standing officer, the notice + deadline, Answer button

// Answer the served instrument administratively (the ladder interaction), if one stands.
if (served && (await st()).status === 'active') {
  await page.keyboard.press('a');
  await shot('02-instrument-answered.png');
}

await browser.close();
