// proof-ar1.mjs — captures the AR1 reskin on the SHIPPED dist over file://.
// Frames: s1/s4/s6 (after state), combat close-up, HUD/menu close-up with icons + pause credits.
// Fixed 512x480 viewport, dated filenames, never overwrites an operator-facing capture.
//
// Usage: node scripts/proof-ar1.mjs [YYYYMMDD]

import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { existsSync, mkdirSync } from 'node:fs';
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

const STAGES = [
  ['s1', 'cemetery'],
  ['s4', 'crypt'],
  ['s6', 'keep'],
];

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

  const dir = join(ROOT, 'docs', 'proofs', `reskin-${stamp()}`);
  mkdirSync(dir, { recursive: true });
  const problems = [];
  const shots = [];
  const date = stamp();

  const findDef = (id) => page.evaluate((nid) => {
    for (const n of window.__nodes) {
      if (n.id === nid && n.stage) return true && (window.__pick = n.stage, true);
      if (n.branch) {
        if (n.branch.left.id === nid) return (window.__pick = n.branch.left.stage, true);
        if (n.branch.right.id === nid) return (window.__pick = n.branch.right.stage, true);
      }
    }
    return false;
  }, id);

  // Stage frames: s1, s4, s6.
  for (const [id, expectTheme] of STAGES) {
    const found = await findDef(id);
    if (!found) { problems.push(`${id}: stage def not found`); continue; }
    const info = await page.evaluate(() => {
      const s = window.__loadStageDef(window.__pick);
      s.player.x = Math.min(s.player.x + 100, s.tilemap.worldWidth - 40);
      s.camera.x = Math.max(0, Math.min(s.player.x - 128, s.tilemap.worldWidth - 256));
      return { theme: s.theme, hasEnemies: s.enemies.length > 0 };
    });
    if (info.theme !== expectTheme) problems.push(`${id}: theme ${info.theme} != expected ${expectTheme}`);
    await page.waitForTimeout(180);
    const shot = join(dir, `ar1-${id}-${date}.png`);
    if (existsSync(shot)) throw new Error(`refusing to overwrite proof: ${shot}`);
    await page.screenshot({ path: shot });
    shots.push(shot);
  }

  // Combat close-up: s1, player beside first enemy mid-swing.
  await findDef('s1');
  await page.evaluate(() => {
    const s = window.__loadStageDef(window.__pick);
    const e = s.enemies[0];
    if (e) { s.player.x = e.x - 20; s.player.facing = 1; s.camera.x = Math.max(0, s.player.x - 120); }
    s.progress.hp = s.progress.stats.maxHP;
  });
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(25);
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(25);
  const combatShot = join(dir, `ar1-combat-${date}.png`);
  if (existsSync(combatShot)) throw new Error(`refusing to overwrite proof: ${combatShot}`);
  await page.screenshot({ path: combatShot });
  shots.push(combatShot);

  // HUD + menu close-up: open the action menu to show weapon icons, then pause overlay for credits.
  await findDef('s1');
  await page.evaluate(() => {
    const s = window.__loadStageDef(window.__pick);
    s.player.x = Math.min(s.player.x + 60, s.tilemap.worldWidth - 40);
    s.camera.x = Math.max(0, Math.min(s.player.x - 128, s.tilemap.worldWidth - 256));
    // Open the action menu directly so the frame is stable for the capture.
    s.menu.open = true;
    s.menu.tab = 1; // WEAPONS tab
    s.menu.cursor = 0;
  });
  await page.waitForTimeout(100);
  const menuShot = join(dir, `ar1-hud-menu-${date}.png`);
  if (existsSync(menuShot)) throw new Error(`refusing to overwrite proof: ${menuShot}`);
  await page.screenshot({ path: menuShot });
  shots.push(menuShot);

  // Pause overlay shows credits attribution.
  await page.evaluate(() => { window.__stage().menu.open = false; window.__pause(); });
  await page.waitForTimeout(100);
  const pauseShot = join(dir, `ar1-pause-credits-${date}.png`);
  if (existsSync(pauseShot)) throw new Error(`refusing to overwrite proof: ${pauseShot}`);
  await page.screenshot({ path: pauseShot });
  shots.push(pauseShot);
  await page.keyboard.press('Escape'); // close pause

  await browser.close();

  if (errors.length) problems.push(`console/page errors: ${errors.join(' | ')}`);
  if (problems.length) { console.error('PROOF FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log(`proof OK — ${shots.length} frames captured in ${dir}:`);
  for (const s of shots) console.log('  ' + s);
}

main().catch((e) => { console.error(e); process.exit(1); });
