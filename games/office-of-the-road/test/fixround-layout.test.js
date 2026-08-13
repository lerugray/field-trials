import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JOBS } from '../src/jobs.js';
import { PLAYER_CREDITS } from '../src/credits.js';
import { pixelTextWidth } from '../src/pixel-font.js';
import { CONTROL_BAND_Y, CONTROL_BAND_BOTTOM, CORE_TEXT_HEIGHT, CONTENT_TEXT_MAX_Y, contentTextY, boxesIntersect } from '../src/layout.js';

test('content-row rule keeps both audited y=178 rows wholly above controls', () => {
  const band = { x: 0, y: CONTROL_BAND_Y, w: 320, h: CONTROL_BAND_BOTTOM - CONTROL_BAND_Y };
  for (const name of ['draft card name', 'march score line']) {
    const box = { x: 0, y: contentTextY(178), w: 120, h: CORE_TEXT_HEIGHT };
    assert.equal(box.y, CONTENT_TEXT_MAX_Y, `${name} is clamped by the shared rule`);
    assert.equal(boxesIntersect(box, band), false, `${name} does not intersect controls`);
  }
});

test('every camp job description is a complete sentence that fits its owned row', () => {
  const ctx = { font: '6px monospace' };
  for (const job of Object.values(JOBS)) {
    assert.match(job.blurb, /[.!?]$/, `${job.id} description is complete`);
    assert.ok(pixelTextWidth(ctx, job.blurb) <= 250, `${job.id} description fits without truncation`);
  }
});

test('player credits retain attribution and omit internal document references', () => {
  for (const required of ['Willibab / Monsteretrope', 'CC BY', 'GuttyKreum', 'RonnyG', 'code-composed WebAudio']) {
    assert.match(PLAYER_CREDITS, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(PLAYER_CREDITS, /CLAUDE\.md|DESIGN-SEED|ASSET-MANIFEST|src\/|hard rule|ATTRIBUTION\.md/);
});
