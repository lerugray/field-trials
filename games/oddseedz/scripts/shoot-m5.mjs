// shoot-m5 — boots dist/index.html in a real browser and proves M5 (rank ladder
// + economy pressure). The milestone proof is ONE screen carrying rank, money,
// age, the next mandatory meet, and a battle/prize log — plus the live loop:
// climbing E -> D by winning bouts, a mandatory-meet fine when a deadline is
// skipped, and no softlock throughout. Captures dated shots at 1280x800. Dev
// tooling only (no assets shipped; node_modules is gitignored).

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const DATE = process.argv[2] || 'undated';
const OUT = resolve(ROOT, 'docs/screenshots');
const PHRASE = 'ladder climber';

const settle = (page, ms) => page.waitForTimeout(ms);
const careerText = (page) => page.textContent('.career');
const rankChip = (page) => page.textContent('.rank-chip');

// Queue a plan of drill/rest buttons, then End Week. ids: drill_pow, rest, ...
async function playWeek(page, ids) {
  for (const id of ids) {
    const btn = await page.$(`.act[data-act="${id}"]:not([disabled])`);
    if (btn) await btn.click();
  }
  await page.click('#endweek');
  await settle(page, 200);
}

// Drive one bout to a decision by spamming the strongest enabled basic. Returns
// 'player' | 'foe' | null, then claims the prize (folds into the career).
async function fightOne(page) {
  await page.click('#to-ring');
  await page.waitForSelector('#battle .battle-panel');
  await settle(page, 250);
  let winner = null;
  for (let i = 0; i < 50; i++) {
    let move = null;
    for (const m of ['strike', 'dash', 'guard']) {
      const btn = await page.$(`.move[data-move="${m}"]:not([disabled])`);
      if (btn) { move = m; break; }
    }
    if (!move) break;
    await page.click(`.move[data-move="${move}"]`);
    await settle(page, 160);
    const res = await page.$('.battle-result.win, .battle-result.loss');
    if (res) {
      winner = (await res.getAttribute('class')).includes('win') ? 'player' : 'foe';
      break;
    }
  }
  await page.click('#battle [data-close]');
  await settle(page, 250);
  return winner;
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

  // Raise the pet a little so E wins are reliable (and bond buys obedience).
  await playWeek(page, ['drill_pow', 'drill_spd', 'drill_pow', 'rest', 'play', 'drill_spd']);
  await settle(page, 200);

  // --- shot 1: the career panel baseline — rank/money/age/next meet/log on one screen
  await page.screenshot({ path: resolve(OUT, `${DATE}-m5-career-panel.png`) });
  const rankStart = (await rankChip(page)).trim();

  // --- climb E -> D by banking three E-rank wins ---
  let wins = 0, promoted = false;
  for (let attempt = 0; attempt < 12 && !promoted; attempt++) {
    const w = await fightOne(page);
    if (w === 'player') wins++;
    const rank = (await rankChip(page)).trim();
    if (rank.startsWith('D')) promoted = true;
    // rest between bouts so fatigue doesn't erode obedience
    if (!promoted && attempt % 2 === 1) await playWeek(page, ['rest', 'rest']);
  }
  await settle(page, 250);
  // --- shot 2: promoted to D, the log shows wins + the promotion line
  await page.screenshot({ path: resolve(OUT, `${DATE}-m5-promoted-D.png`) });
  const rankAfter = (await rankChip(page)).trim();

  // --- provoke a missed mandatory meet: end weeks WITHOUT fighting until the
  //     deadline passes, so the fine + miss log line appear ---
  let missed = false;
  for (let i = 0; i < 8 && !missed; i++) {
    await playWeek(page, ['rest']);
    const txt = await careerText(page);
    if (/Missed the mandatory/i.test(txt) || (await page.$('.career-log .log-miss'))) missed = true;
  }
  await settle(page, 250);
  // --- shot 3: the missed-meet setback (fine logged), pet still playable
  await page.screenshot({ path: resolve(OUT, `${DATE}-m5-missed-meet.png`) });

  // --- persistence: the career (rank + log) survives a reload ---
  await page.reload();
  await page.waitForSelector('.pet-name');
  await settle(page, 400);
  const rankReload = (await rankChip(page)).trim();
  const logCount = await page.$$eval('.career-log li', (ls) => ls.filter((l) => !l.className.includes('log-empty')).length);

  await browser.close();

  console.log(`pet: ${name}`);
  console.log(`rank: "${rankStart}" -> "${rankAfter}" -> reload "${rankReload}"`);
  console.log(`E wins banked: ${wins}, promoted to D: ${promoted}, saw a missed meet: ${missed}`);
  console.log(`career log entries after reload: ${logCount}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log('  ! ' + e);

  const ok =
    errors.length === 0 &&
    promoted && rankAfter.startsWith('D') &&
    missed &&
    rankReload === rankAfter && logCount > 0;
  if (!ok) { console.error('shoot-m5 FAILED assertions'); process.exit(1); }
  console.log('shoot-m5 OK');
}

run().catch((e) => { console.error(e); process.exit(1); });
