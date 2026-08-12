// proof-m12.mjs — captures the M12-ART visual register on the SHIPPED dist over file://: one frame
// per campaign stage (every node incl. both branches) showing the themed backdrop, parallax skyline,
// tinted ground, environmental dressing and torch pools, plus one combat close-up mid-swing. Fixed
// 512×480 viewport, dated filenames, committed. Verifies each stage's theme id and that the render
// throws no console/page errors.
//
// Usage: node scripts/proof-m12.mjs [YYYYMMDD]

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

// The stages to capture, in campaign order, with their expected theme (mirrors campaign.js NODE_THEME).
const STAGES = [
  ['s1', 'cemetery'], ['s2', 'cemetery'],
  ['s3l', 'crypt'], ['s3r', 'crypt'], ['s4', 'crypt'],
  ['s5l', 'keep'], ['s5r', 'keep'], ['s6', 'keep'],
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

  mkdirSync(join(ROOT, 'proofs'), { recursive: true });
  const problems = [];
  const shots = [];

  // Resolve a node id → its stage def (handles branch nodes).
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

  for (const [id, expectTheme] of STAGES) {
    const found = await findDef(id);
    if (!found) { problems.push(`${id}: stage def not found`); continue; }
    const info = await page.evaluate(() => {
      const s = window.__loadStageDef(window.__pick);
      // Walk the player a little into the level so dressing + enemies are in frame.
      s.player.x = Math.min(s.player.x + 100, s.tilemap.worldWidth - 40);
      s.camera.x = Math.max(0, Math.min(s.player.x - 128, s.tilemap.worldWidth - 256));
      return { theme: s.theme, hasEnemies: s.enemies.length > 0 };
    });
    if (info.theme !== expectTheme) problems.push(`${id}: theme ${info.theme} != expected ${expectTheme}`);
    await page.waitForTimeout(180);
    const shot = join(ROOT, `proofs/m12-${id}-${stamp()}.png`);
    if (existsSync(shot)) throw new Error(`refusing to overwrite proof: ${shot}`);
    await page.screenshot({ path: shot });
    shots.push(shot);
  }

  // Combat close-up: load s1, place the player right beside the first enemy and land a real swing.
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
  await page.waitForTimeout(25); // catch a middle arc frame + hit reaction
  const combatShot = join(ROOT, `proofs/m12-combat-${stamp()}.png`);
  if (existsSync(combatShot)) throw new Error(`refusing to overwrite proof: ${combatShot}`);
  await page.screenshot({ path: combatShot });
  shots.push(combatShot);

  await browser.close();

  if (errors.length) problems.push(`console/page errors: ${errors.join(' | ')}`);
  if (problems.length) { console.error('PROOF FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log(`proof OK — ${shots.length} frames captured:`);
  for (const s of shots) console.log('  ' + s);
}

main().catch((e) => { console.error(e); process.exit(1); });
