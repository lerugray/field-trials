// shoot-lit — before/after proof frames for the lit-scene art migration
// (docs/art-poc-2026-08-10). Boots dist/index.html in a real browser, drives it
// to each surface, and screenshots the real element. Dev tooling only.
//
//   node scripts/shoot-lit.mjs before
//   node scripts/shoot-lit.mjs after
//
// Writes docs/art-poc-2026-08-10/migration-proofs/<label>-<surface>.png and
// prints the measured CSS size of every captured element (the scene layer sizes
// its native buffer off these, so they are load-bearing, not trivia).

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const OUT = resolve(ROOT, 'docs/art-poc-2026-08-10/migration-proofs');
const LABEL = process.argv[2] || 'undated';
const PHRASE = 'a champion of the ring';

const settle = (page, ms) => page.waitForTimeout(ms);

async function sizeOf(page, sel) {
  return page.$eval(sel, (n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }).catch(() => null);
}

async function shot(page, sel, name, sizes) {
  const el = await page.$(sel);
  if (!el) { console.log('MISSING', sel); return; }
  sizes[name] = await sizeOf(page, sel);
  await el.screenshot({ path: resolve(OUT, `${LABEL}-${name}.png`) });
  console.log('shot', name, JSON.stringify(sizes[name]));
}

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

  const sizes = {};
  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 400);

  // --- title splash (the little diorama window) ---
  await shot(page, '.title-stage', 'title', sizes);

  const begin = await page.$('#title-begin');
  if (begin) { await begin.click(); await settle(page, 300); }

  // --- the empty stage, before any pet exists ---
  await shot(page, '#stage', 'stage-empty', sizes);

  // --- the toy room with a pet in it ---
  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 600);
  await shot(page, '#stage', 'stage-toyroom', sizes);

  // --- LEAN A: the in-world hand cursor, hovering over the pet ---
  const sb = await page.$eval('#stage', (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.62 };
  });
  await page.mouse.move(sb.x, sb.y);
  await settle(page, 300);
  await shot(page, '#stage', 'stage-hand', sizes);
  // and mid-pet, with the contact sparkle + care hearts live
  await page.mouse.down();
  await settle(page, 220);
  await shot(page, '#stage', 'stage-hand-petting', sizes);
  await page.mouse.up();
  await settle(page, 300);
  await shot(page, '#stage', 'stage-reaction', sizes);

  // --- the tournament ---
  await playWeek(page, ['drill_pow', 'drill_spd', 'drill_pow', 'rest', 'play', 'drill_spd']);
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 700);
    await shot(page, '.battle-arena', 'arena-open', sizes);
    // fire one move so a clash frame is on screen
    for (const m of ['strike', 'dash', 'guard']) {
      const btn = await page.$(`.move[data-move="${m}"]:not([disabled])`);
      if (btn) { await btn.click(); break; }
    }
    await settle(page, 160);
    await shot(page, '.battle-arena', 'arena-clash', sizes);
    // play the bout out, then close the overlay
    for (let i = 0; i < 30; i++) {
      let moved = false;
      for (const m of ['strike', 'dash', 'guard']) {
        const btn = await page.$(`.move[data-move="${m}"]:not([disabled])`);
        if (btn) { await btn.click().catch(() => {}); moved = true; break; }
      }
      await settle(page, 120);
      const close = await page.$('#battle [data-close]:not([disabled])');
      if (close && (await close.isVisible())) {
        const label = (await close.textContent()) || '';
        if (/close|done|leave|collect/i.test(label)) { await close.click(); break; }
      }
      if (!moved) break;
    }
    const x = await page.$('#battle [data-close]');
    if (x) { await x.click().catch(() => {}); await settle(page, 500); }
    const x2 = await page.$('#battle [data-close]');
    if (x2 && await x2.isVisible()) { await x2.click().catch(() => {}); await settle(page, 500); }
  }

  // --- the Memory Meadow: raise the pet to adulthood, retire it, look at the line ---
  const tap = async (sel) => {
    const n = await page.$(sel);
    if (!n) return false;
    try { await n.click({ timeout: 2500 }); return true; } catch { return false; }
  };
  const overlayOpen = async () => !!(await page.$('#meadow:not([hidden]) #meadow-canvas'));
  for (let n = 0; n < 16 && !(await overlayOpen()); n++) {
    if (await page.$('#to-retire-early') || await page.$('#to-retire')) {
      await tap('#to-retire-early') || await tap('#to-retire');
      await settle(page, 250);
      await tap('#retire-yes');
      await settle(page, 600);
      await tap('#to-inherit');
      await settle(page, 800);
      continue;
    }
    await playWeek(page, ['rest', 'play', 'drill_pow']);
  }
  if (await overlayOpen()) {
    await shot(page, '#meadow-canvas', 'meadow-overlay', sizes);
    const close = await page.$('#meadow [data-mclose]');
    if (close) { await close.click(); await settle(page, 400); }
    await shot(page, '#stage', 'stage-between-generations', sizes);
  }

  await browser.close();
  console.log('sizes:', JSON.stringify(sizes));
  console.log('console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));
  process.exit(errors.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
