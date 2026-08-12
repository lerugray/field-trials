// capture-m10-loop — the M10 milestone proof: a single ~60-90s recording of the
// WHOLE lineage loop in the real single-file dist, title splash to certificate.
// Records a webm video (docs/captures/) AND writes dated key-beat PNGs
// (docs/screenshots/20260806-m10-loop-*.png). Dev tooling only; boots
// dist/index.html at 1280x800. Sound is on in the app but headless Chromium has
// no audio sink, so the capture is silent by nature — the point is the loop.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, rename, readdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const SHOTS = resolve(ROOT, 'docs/screenshots');
const CAPS = resolve(ROOT, 'docs/captures');
const DATE = process.argv[2] || 'undated';
const settle = (page, ms) => page.waitForTimeout(ms);
const beat = (page, name) => page.screenshot({ path: resolve(SHOTS, `${DATE}-m10-loop-${name}.png`) });

async function run() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(CAPS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: CAPS, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(DIST);
  await page.waitForSelector('#scene');

  // 1) title splash -> Begin
  await page.waitForSelector('#title:not([hidden])');
  await settle(page, 1400);
  await beat(page, '01-title');
  await page.click('#title-begin');
  await settle(page, 700);

  // 2) summon from a phrase
  await page.fill('#phrase', 'a champion of the ring');
  await settle(page, 500);
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 1200);
  await beat(page, '02-summon');

  // 3) care — pet, feed, play
  for (const sel of ['.care-act[data-do="pet"]', '.snack', '.toy.owned, .toy']) {
    const btn = await page.$(sel);
    if (btn) { await btn.click(); await settle(page, 700); }
  }
  await beat(page, '03-care');

  // 4) plan a week (queue drills) and resolve it
  for (const act of ['drill_pow', 'drill_spd', 'drill_foc']) {
    const d = await page.$(`.act[data-act="${act}"]`);
    if (d) { await d.click(); await settle(page, 250); }
  }
  await settle(page, 600);
  await beat(page, '04-plan');
  const endw = await page.$('#endweek');
  if (endw) { await endw.click(); await settle(page, 900); }
  await beat(page, '05-week-resolved');

  // build up a few weeks so bouts are winnable
  for (let i = 0; i < 4; i++) { await page.click('#fastfwd'); await settle(page, 200); }

  // 5) a tournament bout to a KO
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 900);
    await beat(page, '06-battle');
    for (let i = 0; i < 16; i++) {
      let move = null;
      for (const m of ['strike', 'dash', 'guard']) {
        if (await page.$(`.move[data-move="${m}"]:not([disabled])`)) { move = m; break; }
      }
      if (!move) break;
      await page.click(`.move[data-move="${move}"]`);
      await settle(page, 360);
      if (await page.$('.logline.ko')) break;
    }
    await settle(page, 900);
    await beat(page, '07-battle-result');
    const close = await page.$('#battle [data-close]');
    if (close) { await close.click(); await settle(page, 600); }
  }

  // 6) live out the lifespan, retire to the Meadow
  for (let i = 0; i < 45 && !(await page.$('#to-retire')); i++) {
    await page.click('#fastfwd');
    await settle(page, 90);
  }
  const retire = await page.$('#to-retire');
  if (retire) {
    await retire.click();
    await page.waitForSelector('#meadow .meadow-panel');
    await settle(page, 1200);
    await beat(page, '08-meadow');
    // 7) inherit: choose the retiree as a parent, preview the heir, hatch
    const choose = await page.$('#meadow [data-choose]');
    if (choose) { await choose.click(); await settle(page, 900); await beat(page, '09-inheritance'); }
    const hatch = await page.$('#meadow .hatch, #meadow [data-hatch]');
    if (hatch) { await hatch.click(); await settle(page, 1200); await beat(page, '10-heir'); }
  }

  // 8) the keepsake certificate for the current Buddy
  const cert = await page.$('#to-cert');
  if (cert) {
    await page.$eval('#card', (el) => { el.scrollTop = el.scrollHeight; });
    await settle(page, 500);
    await beat(page, '11-certificate-button');
  }

  await settle(page, 800);
  await context.close(); // finalizes the video
  await browser.close();

  // rename the auto-named webm to something stable
  const files = (await readdir(CAPS)).filter((f) => f.endsWith('.webm'));
  const newest = files.sort().pop();
  if (newest) {
    await rename(resolve(CAPS, newest), resolve(CAPS, `${DATE}-m10-full-loop.webm`));
  }

  console.log('m10 loop captured; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
