import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDisplayFit, pointerToNative, boxesIntersect, NATIVE_W, NATIVE_H,
} from '../src/layout.js';
import {
  buildTitleDrawList, buildHowtoDrawList, findDrawListOverlaps,
  titleMenuRects, HOWTO_PAGES, TITLE_NAME,
} from '../src/title-layout.js';
import { TUNING } from '../src/tuning.js';
import { createMarch, runTicks } from '../src/engine.js';

test('computeDisplayFit uses best-fit scale and centers', () => {
  const a = computeDisplayFit(1280, 800);
  assert.equal(a.scale, 4);
  assert.equal(a.cssW, NATIVE_W * 4);
  assert.equal(a.cssH, NATIVE_H * 4);
  assert.ok(a.fillW >= 0.85 && a.fillH >= 0.85);

  const b = computeDisplayFit(1440, 900);
  assert.equal(b.scale, 4.5);
  assert.ok(b.fillW >= 0.85 && b.fillH >= 0.85);
  assert.equal(b.offX, (1440 - b.cssW) / 2);
  assert.equal(b.offY, (900 - b.cssH) / 2);

  const mid = computeDisplayFit(900, 600);
  assert.equal(mid.scale, 900 / NATIVE_W);
  assert.equal(mid.cssW, 900);
  assert.equal(mid.offX, 0);

  const maxed = computeDisplayFit(1920, 1080);
  assert.equal(maxed.scale, 1080 / NATIVE_H);
  assert.ok(Math.max(maxed.fillW, maxed.fillH) >= 0.99);
});

test('pointerToNative remaps through letterbox offsets', () => {
  const fit = computeDisplayFit(1280, 800);
  // Click the top-left native pixel of the centered canvas.
  const p = pointerToNative(fit.offX + 0.5 * fit.scale, fit.offY + 0.5 * fit.scale, fit.offX, fit.offY, fit.scale);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9);
  assert.ok(Math.abs(p.y - 0.5) < 1e-9);
});

test('title draw list: no overlapping content bands; menu has START and HOW TO PLAY', () => {
  const rows = buildTitleDrawList();
  assert.match(rows[0].text, /OFFICE OF THE ROAD/);
  assert.equal(findDrawListOverlaps(rows).length, 0, JSON.stringify(findDrawListOverlaps(rows)));
  const labels = titleMenuRects().map((c) => c.label);
  assert.ok(labels.includes('START'));
  assert.ok(labels.includes('HOW TO PLAY'));
  // Menu rects themselves must not intersect
  const rects = titleMenuRects();
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert.equal(boxesIntersect(rects[i].rect, rects[j].rect), false,
        `${rects[i].id} overlaps ${rects[j].id}`);
    }
  }
  assert.equal(TITLE_NAME, 'THE OFFICE OF THE ROAD');
});

test('howto draw lists: both pages clear of overlaps', () => {
  assert.equal(HOWTO_PAGES.length, 2);
  for (let p = 0; p < HOWTO_PAGES.length; p++) {
    const rows = buildHowtoDrawList(p);
    const hits = findDrawListOverlaps(rows);
    assert.equal(hits.length, 0, `page ${p}: ${JSON.stringify(hits)}`);
    assert.ok(rows.some((r) => r.region === 'body'));
    assert.ok(rows.some((r) => r.region === 'menu'));
  }
});

test('first encounter is withheld until opening grace paces', () => {
  const s = createMarch(11);
  const early = runTicks(s, TUNING.firstEncounterMinPaces - 1);
  assert.equal(early.filter((e) => e.type === 'encounter').length, 0);
  // Continue far enough that an encounter is expected under normal chance.
  const later = runTicks(s, 400);
  assert.ok(later.some((e) => e.type === 'encounter'), 'encounters resume after grace');
});
