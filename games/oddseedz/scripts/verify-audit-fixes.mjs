// verify-audit-fixes — re-verify the 2026-08-08 audit findings at current HEAD.
// Boots dist/index.html, exercises each repro, logs verdicts, and writes proof PNGs.
// Run with a date prefix: node scripts/verify-audit-fixes.mjs 20260808

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const OUT = resolve(ROOT, 'docs/proofs/fix-round-20260808');
const DATE = process.argv[2] || 'undated';
const settle = (page, ms) => page.waitForTimeout(ms);

async function shot(page, name) {
  const path = resolve(OUT, `${DATE}-${name}.png`);
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function resetSave(page) {
  await page.evaluate(() => {
    localStorage.removeItem('oddseedz_save_v1');
    localStorage.removeItem('oddseedz_coach_v1');
    localStorage.removeItem('oddseedz_settings_v1');
  });
}

async function summon(page, phrase) {
  await page.fill('#phrase', phrase);
  await page.click('#summon');
  await page.waitForSelector('#rename-pet', { timeout: 5000 });
  await settle(page, 600);
}

async function resetAndGoto(page) {
  // First navigation establishes origin so localStorage is accessible.
  await page.goto(DIST);
  await page.evaluate(() => {
    localStorage.removeItem('oddseedz.save.v1');
    localStorage.removeItem('oddseedz_coach_v1');
    localStorage.removeItem('oddseedz.settings.v1');
  });
  await page.goto(DIST);
  await page.waitForSelector('#scene');
}

async function dismissTitle(page) {
  await page.waitForSelector('#title:not([hidden])', { timeout: 5000 });
  await page.click('#title-begin');
  await settle(page, 500);
}

async function runMobileSummon(page) {
  await page.setViewportSize({ width: 375, height: 667 });
  await resetAndGoto(page);
  await dismissTitle(page);
  await summon(page, 'a champion of the ring');
  const rect = await page.evaluate(() => {
    const s = document.getElementById('stage');
    return s ? s.getBoundingClientRect().toJSON() : null;
  });
  await shot(page, 'mobile-summon');
  return { finding: 1, rect };
}

async function runMobileBattle(page) {
  await page.setViewportSize({ width: 375, height: 667 });
  // start from a fresh state
  await resetAndGoto(page);
  await dismissTitle(page);
  await summon(page, 'a champion of the ring');
  // fast-forward to build stats
  for (let i = 0; i < 6; i++) { await page.click('#fastfwd'); await settle(page, 120); }
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel', { timeout: 5000 });
    await settle(page, 800);
    // make a few moves so log grows and command row may wrap
    for (let i = 0; i < 4; i++) {
      const move = await page.$('.move[data-move]:not([disabled])');
      if (move) { await move.click(); await settle(page, 350); }
      else break;
    }
  }
  const metrics = await page.evaluate(() => {
    const foot = document.querySelector('#battle .battle-foot');
    const close = document.querySelector('#battle [data-close], #battle .battle-close');
    const panel = document.querySelector('#battle .battle-panel');
    const panelRect = panel ? panel.getBoundingClientRect().toJSON() : null;
    const footRect = foot ? foot.getBoundingClientRect().toJSON() : null;
    const closeRect = close ? close.getBoundingClientRect().toJSON() : null;
    return { panelRect, footRect, closeRect, vh: window.innerHeight };
  });
  await shot(page, 'mobile-battle');
  return { finding: 3, metrics };
}

async function runTwilightCoach(page) {
  await page.setViewportSize({ width: 375, height: 667 });
  await resetAndGoto(page);
  await dismissTitle(page);
  await summon(page, 'a champion of the ring');
  // fast-forward until retire button appears
  for (let i = 0; i < 60; i++) {
    const hasRetire = await page.$('#to-retire');
    if (hasRetire) break;
    await page.click('#fastfwd');
    await settle(page, 80);
  }
  await settle(page, 400);
  const metrics = await page.evaluate(() => {
    const coach = document.getElementById('coach');
    const retire = document.getElementById('to-retire');
    return {
      coachHidden: coach ? coach.hidden : true,
      coachText: coach ? coach.innerText : '',
      retireExists: !!retire,
      age: document.querySelector('.plan-week') ? document.querySelector('.plan-week').innerText : ''
    };
  });
  await shot(page, 'mobile-twilight');
  return { finding: 2, label: 'twilight', metrics };
}

async function runInheritCoach(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await resetAndGoto(page);
  await dismissTitle(page);
  await summon(page, 'a champion of the ring');
  // fast-forward to retire
  for (let i = 0; i < 60; i++) {
    const hasRetire = await page.$('#to-retire');
    if (hasRetire) break;
    await page.click('#fastfwd');
    await settle(page, 80);
  }
  const retire = await page.$('#to-retire');
  if (retire) {
    await retire.click();
    await page.waitForSelector('#meadow .meadow-panel', { timeout: 5000 });
    await settle(page, 500);
    // capture the inherit coach while the Meadow is open and no heir exists yet
    const meadowMetrics = await page.evaluate(() => {
      const coach = document.getElementById('coach');
      return {
        coachHidden: coach ? coach.hidden : true,
        coachText: coach ? coach.innerText : '',
        coachHtml: coach ? coach.innerHTML : '',
        meadowOpen: document.querySelector('#meadow:not([hidden])') !== null,
        hasCreature: document.querySelector('#rename-pet') !== null
      };
    });
    await shot(page, 'desktop-meadow-inherit');
    const choose = await page.$('#meadow [data-choose], #meadow .ret-choose');
    if (choose) { await choose.click(); await settle(page, 400); }
    const hatch = await page.$('#meadow .hatch, #meadow [data-hatch]');
    if (hatch) { await hatch.click(); await settle(page, 800); }
    const postMetrics = await page.evaluate(() => {
      const coach = document.getElementById('coach');
      return {
        coachHidden: coach ? coach.hidden : true,
        coachText: coach ? coach.innerText : '',
        meadowOpen: document.querySelector('#meadow:not([hidden])') !== null,
        hasCreature: document.querySelector('#rename-pet') !== null
      };
    });
    await shot(page, 'desktop-inherit-hatched');
    return { finding: 2, label: 'inherit', meadowMetrics, postMetrics };
  }
  const metrics = await page.evaluate(() => {
    const coach = document.getElementById('coach');
    return {
      coachHidden: coach ? coach.hidden : true,
      coachText: coach ? coach.innerText : '',
      meadowOpen: document.querySelector('#meadow:not([hidden])') !== null
    };
  });
  await shot(page, 'desktop-inherit');
  return { finding: 2, label: 'inherit', metrics };
}

async function runRestoreConfirm(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await resetAndGoto(page);
  await dismissTitle(page);
  await summon(page, 'a champion of the ring');
  // open settings and copy the save code
  await page.click('#settings-open');
  await page.waitForSelector('#settings:not([hidden])');
  await settle(page, 400);
  const code = await page.evaluate(() => {
    const ta = document.querySelector('[data-savefield]');
    return ta ? ta.value : '';
  });
  // arm restore by pasting the same code back and clicking restore once
  await page.fill('[data-importfield]', '');
  await page.fill('[data-importfield]', code);
  const restore = await page.$('[data-loadsave]');
  if (restore) { await restore.click(); await settle(page, 400); }
  const metrics = await page.evaluate(() => {
    const msg = document.querySelector('[data-iomsg]');
    const foot = document.querySelector('.settings-foot');
    return {
      msgText: msg ? msg.innerText : '',
      msgRect: msg ? msg.getBoundingClientRect().toJSON() : null,
      footRect: foot ? foot.getBoundingClientRect().toJSON() : null
    };
  });
  await shot(page, 'desktop-restore-confirm');
  return { finding: 4, metrics };
}

async function runCareerLog(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await resetAndGoto(page);
  await dismissTitle(page);
  await summon(page, 'a champion of the ring');
  // fight once to populate log
  for (let i = 0; i < 4; i++) { await page.click('#fastfwd'); await settle(page, 120); }
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 600);
    for (let i = 0; i < 12; i++) {
      const move = await page.$('.move[data-move]:not([disabled])');
      if (move) { await move.click(); await settle(page, 300); }
      else break;
    }
    const close = await page.$('#battle [data-close], #battle .battle-close');
    if (close) { await close.click(); await settle(page, 400); }
  }
  await page.$eval('#card', (el) => { el.scrollTop = el.scrollHeight; });
  await settle(page, 400);
  const metrics = await page.evaluate(() => {
    const log = document.querySelector('.career-log');
    const style = log ? window.getComputedStyle(log) : null;
    return { logExists: !!log, scrollbarWidth: style ? style.scrollbarWidth : null };
  });
  await shot(page, 'desktop-career-log');
  return { finding: 5, metrics };
}

async function runCoachGlyph(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await resetAndGoto(page);
  await dismissTitle(page);
  const metrics = await page.evaluate(() => {
    const coach = document.getElementById('coach');
    const glyph = coach ? coach.querySelector('.coach-glyph') : null;
    return {
      coachHidden: coach ? coach.hidden : true,
      glyphText: glyph ? glyph.innerText : '',
      coachHtml: coach ? coach.innerHTML : ''
    };
  });
  await shot(page, 'desktop-coach-glyph');
  return { finding: 6, metrics };
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const errors = [];
  context.on('page', (p) => {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  });

  const results = [];
  let page;

  page = await context.newPage();
  results.push(await runMobileSummon(page));
  await page.close();

  page = await context.newPage();
  results.push(await runMobileBattle(page));
  await page.close();

  page = await context.newPage();
  results.push(await runTwilightCoach(page));
  await page.close();

  page = await context.newPage();
  results.push(await runInheritCoach(page));
  await page.close();

  page = await context.newPage();
  results.push(await runRestoreConfirm(page));
  await page.close();

  page = await context.newPage();
  results.push(await runCareerLog(page));
  await page.close();

  page = await context.newPage();
  results.push(await runCoachGlyph(page));
  await page.close();

  await browser.close();

  console.log('--- re-verification results ---');
  for (const r of results) {
    console.log(`Finding ${r.finding}${r.label ? ' (' + r.label + ')' : ''}:`, JSON.stringify(r.metrics || r.rect || {}, null, 2));
  }
  if (errors.length) {
    console.log('console errors:', errors.length);
    console.log(errors.slice(0, 8));
  }
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
