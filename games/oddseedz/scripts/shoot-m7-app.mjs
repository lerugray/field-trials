// shoot-m7-app — proves the M7 pass INSIDE the real single-file app: the Buddies
// codex (all 70 viewable, live-animated, rarity-framed with affinities) and a
// live tournament clash captured mid-beat (attack lunge + hit recoil + affinity
// VFX). Boots dist/index.html in a real browser. Dev tooling only.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const OUT = resolve(ROOT, 'docs/screenshots');
const DATE = process.argv[2] || 'undated';
const PHRASE = 'a champion of the ring';
const settle = (page, ms) => page.waitForTimeout(ms);

// Raise the pet a few weeks so E wins are reliable and a clash actually lands.
async function playWeek(page, ids) {
  for (const id of ids) {
    const btn = await page.$(`.act[data-act="${id}"]:not([disabled])`);
    if (btn) await btn.click();
  }
  const ew = await page.$('#endweek');
  if (ew) await ew.click();
  await settle(page, 160);
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 300);
  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await settle(page, 400);

  // --- shot 1: the Buddies codex, all 70 live-animated ---
  await page.click('#codex-open');
  await page.waitForSelector('#codex-canvas');
  await settle(page, 500);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m7-codex.png`) });

  // --- shot 2: the codex filtered to Legendary (rarity chip works) ---
  const leg = await page.$('.codex-filter[data-filter="legendary"]');
  if (leg) { await leg.click(); await settle(page, 500); await page.screenshot({ path: resolve(OUT, `${DATE}-m7-codex-legendary.png`) }); }
  await page.click('#codex [data-cclose]');
  await settle(page, 200);

  // Raise, then a live bout captured MID-CLASH (poses + affinity VFX on screen).
  await playWeek(page, ['drill_pow', 'drill_spd', 'drill_pow', 'rest', 'play', 'drill_spd']);
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 300);
    // fire a basic and grab the frame ~130ms in, while the lunge + VFX are live
    let shot = false;
    for (let i = 0; i < 8 && !shot; i++) {
      let move = null;
      for (const m of ['strike', 'dash', 'guard']) {
        if (await page.$(`.move[data-move="${m}"]:not([disabled])`)) { move = m; break; }
      }
      if (!move) break;
      await page.click(`.move[data-move="${move}"]`);
      await settle(page, 130);
      await page.screenshot({ path: resolve(OUT, `${DATE}-m7-battle-clash.png`) });
      shot = true;
    }
  }

  console.log('app shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 6));
  await browser.close();
}
run().catch((e) => { console.error(e); process.exit(1); });
