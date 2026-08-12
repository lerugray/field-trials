// The scene-legibility gates (src/gfx/instrument.js) — the art PoC's measurement rig,
// ported in as gates. These tests hold the MEASUREMENTS honest; scripts/instrument.mjs
// holds the shipped artifact to the gates they feed.
//
// The gate that matters most here is the readability one, because it is the operator's
// and it runs the OPPOSITE way to the PoC's. The PoC asserted a floor ("at least ten
// legible ships") because it was composing key art. Ray passed those frames with "SS may
// be a little busy / hard to see what's going on", so in the game the same measurement
// carries a ceiling and a separation rule instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectedBounds, hotPixelPct, clusteredCount, evaluateFrame,
  LEGIBLE_AREA, MAX_HOT_PIX_PCT, MAX_LEGIBLE_ENEMIES, MIN_SEPARATION_PX,
  MIN_BOSS_AREA_PCT, MAX_CLUSTERED_FRAC, REF_W, REF_H,
} from '../src/gfx/instrument.js';

const pt = (x, y) => ({ x, y, visible: true });

test('projected bounds ignore points behind the camera and report nothing when all are', () => {
  const b = projectedBounds([{ x: 0, y: 0, visible: false }], 1440, 900);
  assert.equal(b.area, 0);
  assert.equal(b.onScreen, false);
});

test('projected area is normalised to the reference viewport, so a gate means one thing', () => {
  // The same object filling the same FRACTION of two different viewports must measure
  // the same area — otherwise the legibility floor would silently tighten at 4K.
  const small = projectedBounds([pt(0, 0), pt(72, 45)], 720, 450);   // 10% x 10%
  const large = projectedBounds([pt(0, 0), pt(256, 160)], 2560, 1600); // 10% x 10%
  assert.ok(Math.abs(small.area - large.area) < 1,
    `${small.area} vs ${large.area} for the same fraction of frame`);
  assert.ok(Math.abs(small.area - REF_W * 0.1 * REF_H * 0.1) < 1);
});

test('bounds clip to the viewport but the centre stays where the object really is', () => {
  // Half off the left edge: the measured area halves, but the centre must NOT be
  // dragged inward, or the separation gate would think two ships had moved apart.
  const b = projectedBounds([pt(-100, 100), pt(100, 300)], 1440, 900);
  assert.ok(b.nativeArea < 200 * 200, 'area should be clipped');
  assert.ok(Math.abs(b.cx - 0) < 1, `centre cx=${b.cx} should stay at the true midpoint`);
});

test('hot-pixel percentage counts near-white pixels only', () => {
  const px = new Uint8Array(4 * 4);            // four pixels
  px.set([255, 255, 255, 255], 0);             // hot
  px.set([250, 250, 250, 255], 4);             // hot
  px.set([120, 120, 120, 255], 8);             // not
  px.set([0, 0, 0, 255], 12);                  // not
  assert.equal(hotPixelPct(px), 50);
  assert.equal(hotPixelPct(new Uint8Array(0)), 0);
});

test('hot-pixel luma is weighted, not a channel max — a saturated red is not "hot"', () => {
  const px = new Uint8Array(4);
  px.set([255, 0, 0, 255], 0);
  assert.equal(hotPixelPct(px), 0, 'pure red is a colour, not an exposure problem');
});

test('clustering counts every ship crowded against another, both ways', () => {
  const near = [{ cx: 100, cy: 100 }, { cx: 100 + MIN_SEPARATION_PX - 5, cy: 100 }];
  assert.equal(clusteredCount(near), 2, 'both members of a crowded pair are clustered');
  const far = [{ cx: 100, cy: 100 }, { cx: 100 + MIN_SEPARATION_PX + 5, cy: 100 }];
  assert.equal(clusteredCount(far), 0);
  assert.equal(clusteredCount([{ cx: 0, cy: 0 }]), 0, 'one ship cannot cluster with itself');
});

test('a clean formation passes every gate', () => {
  const enemies = [];
  for (let i = 0; i < 5; i++) {
    enemies.push({ area: LEGIBLE_AREA * 2, cx: 200 + i * 120, cy: 400, onScreen: true });
  }
  const v = evaluateFrame({ enemies, boss: null, hotPixPct: 1.2 });
  assert.ok(v.pass, v.failures.join('; '));
  assert.equal(v.metrics.legibleEnemies, 5);
  assert.equal(v.metrics.clustered, 0);
});

test('specks below the legibility floor are not counted as ships at all', () => {
  const enemies = Array.from({ length: 30 }, (_, i) => ({
    area: LEGIBLE_AREA - 1, cx: 100 + i, cy: 100, onScreen: true,
  }));
  const v = evaluateFrame({ enemies, boss: null, hotPixPct: 0 });
  assert.ok(v.pass, 'thirty distant specks are a starfield, not a heap');
  assert.equal(v.metrics.legibleEnemies, 0);
});

test('a scrap heap fails the separation gate — the operator readability note, as a check', () => {
  // Six legible hostiles piled on one another: exactly the "hard to see what is going
  // on" read that this gate exists to make impossible to ship.
  const enemies = Array.from({ length: 6 }, (_, i) => ({
    area: LEGIBLE_AREA * 3, cx: 700 + i * 8, cy: 450, onScreen: true,
  }));
  const v = evaluateFrame({ enemies, boss: null, hotPixPct: 0 });
  assert.ok(!v.pass);
  assert.ok(v.failures.some((f) => f.includes('clustered')), v.failures.join('; '));
  assert.ok(v.metrics.clusteredFrac > MAX_CLUSTERED_FRAC);
});

test('too many legible hostiles at once fails, even when they are well spread', () => {
  const enemies = Array.from({ length: MAX_LEGIBLE_ENEMIES + 3 }, (_, i) => ({
    area: LEGIBLE_AREA * 2, cx: 60 + i * 110, cy: 200 + (i % 3) * 220, onScreen: true,
  }));
  const v = evaluateFrame({ enemies, boss: null, hotPixPct: 0 });
  assert.ok(!v.pass);
  assert.ok(v.failures.some((f) => f.includes('readability ceiling')), v.failures.join('; '));
});

test('one crowded pair inside a wider formation is a formation, not a heap', () => {
  const enemies = [
    { area: LEGIBLE_AREA * 2, cx: 300, cy: 400 },
    { area: LEGIBLE_AREA * 2, cx: 300 + MIN_SEPARATION_PX - 8, cy: 400 },
    { area: LEGIBLE_AREA * 2, cx: 800, cy: 400 },
    { area: LEGIBLE_AREA * 2, cx: 1100, cy: 300 },
    { area: LEGIBLE_AREA * 2, cx: 1300, cy: 560 },
  ];
  const v = evaluateFrame({ enemies, boss: null, hotPixPct: 0 });
  assert.ok(v.pass, `two wingmen flying close should be legal: ${v.failures.join('; ')}`);
});

test('a blown-out frame fails the exposure ceiling', () => {
  const v = evaluateFrame({ enemies: [], boss: null, hotPixPct: MAX_HOT_PIX_PCT + 0.1 });
  assert.ok(!v.pass);
  assert.ok(v.failures.some((f) => f.includes('exposure ceiling')), v.failures.join('; '));
});

test('a capital that is not carrying the frame fails the mass floor', () => {
  const boss = { area: 9999, cx: 720, cy: 450 };
  const under = evaluateFrame({ enemies: [], boss, bossAreaPct: MIN_BOSS_AREA_PCT - 1, hotPixPct: 0 });
  assert.ok(!under.pass);
  assert.ok(under.failures.some((f) => f.includes('mass floor')), under.failures.join('; '));
  const over = evaluateFrame({ enemies: [], boss, bossAreaPct: MIN_BOSS_AREA_PCT + 4, hotPixPct: 0 });
  assert.ok(over.pass, over.failures.join('; '));
});

test('evaluateFrame reports every failure in a frame, not just the first', () => {
  const enemies = Array.from({ length: MAX_LEGIBLE_ENEMIES + 2 }, (_, i) => ({
    area: LEGIBLE_AREA * 2, cx: 700 + i * 6, cy: 450,
  }));
  const v = evaluateFrame({ enemies, boss: null, hotPixPct: MAX_HOT_PIX_PCT + 5 });
  assert.ok(v.failures.length >= 3, `expected count + cluster + exposure, got ${v.failures.length}`);
});

test('the stated gates are sane numbers, not placeholders', () => {
  assert.ok(LEGIBLE_AREA > 0 && LEGIBLE_AREA < REF_W * REF_H * 0.02);
  assert.ok(MAX_HOT_PIX_PCT > 0 && MAX_HOT_PIX_PCT <= 15);
  assert.ok(MAX_LEGIBLE_ENEMIES >= 4, 'a wave has to be allowed to be a wave');
  assert.ok(MIN_SEPARATION_PX > 0 && MIN_SEPARATION_PX < REF_W / 8);
  assert.ok(MAX_CLUSTERED_FRAC > 0 && MAX_CLUSTERED_FRAC <= 1);
  assert.equal(REF_H, 900);
});
