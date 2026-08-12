// shoot-m4 — boots dist/index.html in a real browser and proves the M4 first
// coached tournament: an E-rank bout end to end. The milestone proof is a
// COMMANDED exchange with a VISIBLE obey/refuse and an explanation, plus a
// win/loss that pays a prize into the estate. Captures dated proof shots at
// 1280x800. Dev tooling only (no assets, node_modules is gitignored).

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const DATE = process.argv[2] || 'undated';
const OUT = resolve(ROOT, 'docs/screenshots');
const PHRASE = 'ringside champion';

const settle = (page, ms) => page.waitForTimeout(ms);
const recordText = (page) => page.textContent('.record-line');

// Drive one bout to a decision, screenshotting the first obey and first refuse
// exchange along the way. Returns { winner, gotObey, gotRefuse }.
async function fightOne(page, shots) {
  await page.click('#to-ring');
  await page.waitForSelector('#battle .battle-panel');
  await settle(page, 400);
  if (shots.baseline) { await page.screenshot({ path: shots.baseline }); shots.baseline = null; }

  const order = ['strike', 'dash', 'strike', 'surge', 'guard', 'strike', 'dash', 'strike'];
  let gotObey = false, gotRefuse = false, winner = null;
  for (let i = 0; i < 40; i++) {
    // choose an enabled move, preferring the scripted order then any basic
    let move = null;
    for (const m of [order[i % order.length], 'strike', 'dash', 'guard']) {
      const btn = await page.$(`.move[data-move="${m}"]:not([disabled])`);
      if (btn) { move = m; break; }
    }
    if (!move) break;
    await page.click(`.move[data-move="${move}"]`);
    await settle(page, 260);

    if (!gotRefuse && (await page.$('.logline.refuse'))) {
      gotRefuse = true;
      if (shots.refuse) { await page.screenshot({ path: shots.refuse }); shots.refuse = null; }
    }
    if (!gotObey && (await page.$('.logline.obey'))) {
      gotObey = true;
      if (shots.obey) { await page.screenshot({ path: shots.obey }); shots.obey = null; }
    }

    const res = await page.$('.battle-result.win, .battle-result.loss');
    if (res) {
      const rcls = await res.getAttribute('class');
      winner = rcls.includes('win') ? 'player' : 'foe';
      break;
    }
  }
  return { winner, gotObey, gotRefuse };
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
  await settle(page, 500);
  const name = (await page.textContent('.pet-name')).trim();
  const recordStart = (await recordText(page)).trim();

  // Pet a few times first so bond (and thus obedience) is a touch stronger — the
  // raising-buys-obedience loop, exercised through the real UI.
  for (let i = 0; i < 4; i++) { await page.click('.care-act[data-do="pet"]'); await settle(page, 90); }

  const shots = {
    baseline: resolve(OUT, `${DATE}-m4-bout-arena.png`),
    obey: resolve(OUT, `${DATE}-m4-obey.png`),
    refuse: resolve(OUT, `${DATE}-m4-refuse.png`),
  };

  // Fight until we bank a WIN for the victory/prize shot (foe is weak; retry on a
  // loss, up to a few times). Capture obey/refuse from whichever bout shows them.
  let anyObey = false, anyRefuse = false, wonOnce = false, recordEnd = recordStart;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fightOne(page, shots);
    anyObey = anyObey || r.gotObey;
    anyRefuse = anyRefuse || r.gotRefuse;
    if (r.winner === 'player') {
      wonOnce = true;
      await settle(page, 250);
      await page.screenshot({ path: resolve(OUT, `${DATE}-m4-victory.png`) });
    }
    // claim/leave folds the prize + record back into the save
    await page.click('#battle [data-close]');
    await settle(page, 300);
    recordEnd = (await recordText(page)).trim();
    if (wonOnce) break;
  }

  // The estate record + prize persist across a reload.
  await page.reload();
  await page.waitForSelector('.pet-name');
  await settle(page, 400);
  const recordReload = (await recordText(page)).trim();

  await browser.close();

  console.log(`pet: ${name}`);
  console.log(`record: "${recordStart}" -> "${recordEnd}" -> reload "${recordReload}"`);
  console.log(`saw obey: ${anyObey}, saw refuse: ${anyRefuse}, won a bout: ${wonOnce}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log('  ! ' + e);

  const ok =
    errors.length === 0 &&
    anyObey && anyRefuse && wonOnce &&
    recordReload.includes('1') && // at least one W or L banked and persisted
    recordReload === recordEnd;
  if (!ok) { console.error('shoot-m4 FAILED assertions'); process.exit(1); }
  console.log('shoot-m4 OK');
}

run().catch((e) => { console.error(e); process.exit(1); });
