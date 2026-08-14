import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JOBS } from '../src/jobs.js';
import { PLAYER_CREDITS } from '../src/credits.js';
import { pixelTextWidth, PIXEL_FONT } from '../src/pixel-font.js';
import { CONTROL_BAND_Y, CONTROL_BAND_BOTTOM, CORE_TEXT_HEIGHT, CONTENT_TEXT_MAX_Y, contentTextY, boxesIntersect, TEXT_LEADING, MIN_INTERLINE_GAP, findTightInterlineGaps } from '../src/layout.js';

test('content-row rule keeps both audited y=178 rows wholly above controls', () => {
  const band = { x: 0, y: CONTROL_BAND_Y, w: 320, h: CONTROL_BAND_BOTTOM - CONTROL_BAND_Y };
  for (const name of ['draft card name', 'march score line']) {
    const box = { x: 0, y: contentTextY(178), w: 120, h: CORE_TEXT_HEIGHT };
    assert.equal(box.y, CONTENT_TEXT_MAX_Y, `${name} is clamped by the shared rule`);
    assert.equal(boxesIntersect(box, band), false, `${name} does not intersect controls`);
  }
});

test('TEXT_LEADING law: ≥1.35× cap and ≥3px visible gap at 1×', () => {
  // The cell is DERIVED from the shipped face, never typed twice: "Undead
  // Pixel 8" is an 8-row box (6 cap + 2 descender), so the floor is 11.
  assert.equal(CORE_TEXT_HEIGHT, PIXEL_FONT.cellHeight);
  assert.equal(CORE_TEXT_HEIGHT, 8);
  assert.equal(MIN_INTERLINE_GAP, 3);
  assert.ok(TEXT_LEADING >= Math.ceil(CORE_TEXT_HEIGHT * 1.35));
  assert.ok(TEXT_LEADING - CORE_TEXT_HEIGHT >= MIN_INTERLINE_GAP);
  assert.equal(TEXT_LEADING, 11);
});

test('the shipped face is the licensed Not Jam pixel font, not a hand-drawn stand-in', () => {
  assert.equal(PIXEL_FONT.name, 'Undead Pixel 8');
  assert.equal(PIXEL_FONT.license, 'CC0');
  assert.ok(PIXEL_FONT.capHeight >= 6, 'cap height clears the legibility floor');
  assert.ok(PIXEL_FONT.xHeight >= 4, 'x-height clears the legibility floor');
});

test('findTightInterlineGaps flags bunched stacked lines the collision gate misses', () => {
  const bunched = [
    { text: 'title', x: 16, y: 3, w: 100, h: 7, stack: 'mandate-strip' },
    { text: 'terminus', x: 16, y: 10, w: 200, h: 7, stack: 'mandate-strip' },
  ];
  assert.equal(findTightInterlineGaps(bunched).length, 1);
  const air = [
    { text: 'title', x: 16, y: 3, w: 100, h: 7, stack: 'mandate-strip' },
    { text: 'terminus', x: 16, y: 3 + TEXT_LEADING, w: 200, h: 7, stack: 'mandate-strip' },
  ];
  assert.equal(findTightInterlineGaps(air).length, 0);
  const crossColumn = [
    { text: 'Server', x: 104, y: 100, w: 35, h: 7, stack: null },
    { text: 'Bailiff: Distrain', x: 12, y: 109, w: 132, h: 7, stack: null },
  ];
  assert.equal(findTightInterlineGaps(crossColumn).length, 0);
});

test('every camp job description is a complete sentence that fits its owned row', () => {
  const ctx = { font: '6px monospace' };
  for (const job of Object.values(JOBS)) {
    assert.match(job.blurb, /[.!?]$/, `${job.id} description is complete`);
    assert.ok(pixelTextWidth(ctx, job.blurb) <= 250, `${job.id} description fits without truncation`);
  }
});

test('player credits retain attribution and omit internal document references', () => {
  for (const required of ['Willibab / Monsteretrope', 'CC BY', 'GuttyKreum', 'RonnyG', 'code-composed WebAudio',
    'Not Jam', 'Undead Pixel 8', 'CC0']) {
    assert.match(PLAYER_CREDITS, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(PLAYER_CREDITS, /CLAUDE\.md|DESIGN-SEED|ASSET-MANIFEST|src\/|hard rule|ATTRIBUTION\.md/);
});
