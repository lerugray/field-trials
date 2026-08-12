// proof-m11.mjs — captures the M11 acquisition moment (DIRECTIONS-20260806-M11): a first-kill boss
// drop firing the UNIQUE! floater + the naming banner, driven through the REAL input path on the
// shipped dist. Boots the single-file build over file://, positions the player at Stage 1's boss and
// weakens it (via the live __stage handle), then lands the killing blow with a real attack press so
// the actual unique-drop event → banner renders. Fixed 512×480 viewport, dated filename.
//
// Usage: node scripts/proof-m11.mjs [YYYYMMDD]

import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 512, height: 480 };

function stamp() {
  const arg = process.argv[2];
  if (arg && /^\d{8}$/.test(arg)) return arg;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function main() {
  const outPath = writeBuild();
  const url = pathToFileURL(outPath).href;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(url);
  await page.waitForTimeout(300);

  // Stage the boss fight: teleport the player next to Stage 1's boss and weaken it so one real swing
  // is the killing blow. The drop id is Stage 1's mapped unique (unique-9, "swift needle").
  const staged = await page.evaluate(() => {
    const s = window.__stage();
    if (!s || !s.boss) return null;
    s.player.x = s.boss.x - 14; s.player.facing = 1;
    s.progress.hp = s.progress.stats.maxHP; // keep the player alive for the capture
    s.boss.hp = 2;
    return { bossDrop: s.bossDropId };
  });

  // Land the killing blow through the real input path (a few presses to be sure the swing connects).
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(70);
    await page.keyboard.up('KeyJ');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(150); // let the banner render

  const after = await page.evaluate(() => {
    const s = window.__stage();
    return { bossAlive: s.boss ? s.boss.alive : null, weapons: [...s.inventory.weapons] };
  });

  mkdirSync(join(ROOT, 'proofs'), { recursive: true });
  const shot = join(ROOT, `proofs/m11-unique-drop-${stamp()}.png`);
  await page.screenshot({ path: shot });
  await browser.close();

  const problems = [];
  if (errors.length) problems.push(`console/page errors: ${errors.join(' | ')}`);
  if (!staged) problems.push('no boss to stage');
  if (after.bossAlive !== false) problems.push('boss was not defeated');
  if (staged && !after.weapons.includes(staged.bossDrop)) {
    problems.push(`drop ${staged.bossDrop} not in inventory (${after.weapons.join(',')})`);
  }
  if (problems.length) { console.error('PROOF FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log(`proof OK — boss down, ${staged.bossDrop} granted; inventory: ${after.weapons.join(', ')}`);
  console.log(`screenshot: ${shot}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
