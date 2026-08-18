// wind.test.js — locale-2 WIND BANDS (DESIGN-SEED §The loop: locales are ACTS). Wind
// SHEARS the horizontal path but the vertical arc — the periodicity law — is untouched.
// Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Balloon, classPhysics } from '../src/sim/balloon.js';
import { Stage, authoredStageM1 } from '../src/sim/stage.js';
import { generateStage } from '../src/sim/generate.js';
import { WIND } from '../src/tuning.js';

function windStage(vx) {
  return new Stage({
    bounds: { left: 0, right: 1280, top: 0, bottom: 800 },
    solids: [{ id: 'ground', kind: 'ground', x0: 0, x1: 1280, top: 740, bottom: 800 }],
    ladders: [], spawns: [],
    windBands: [{ y0: 200, y1: 500, vx }],
  });
}

test('a balloon inside a wind band drifts by vx; outside it does not', () => {
  const stage = windStage(WIND.bandSpeed);
  // Inside the band (y 300): drifts extra +vx·dt each tick vs a windless twin.
  const inWind = new Balloon({ cls: 'grand', x: 400, floorY: 740, y: 300, vy: 0, id: 1 });
  const noWind = new Balloon({ cls: 'grand', x: 400, floorY: 740, y: 300, vy: 0, id: 2 });
  inWind.step(null, stage); noWind.step(null, null);
  const drift = (inWind.x - noWind.x);
  assert.ok(Math.abs(drift - WIND.bandSpeed / 60) < 1e-9, 'one tick of wind = vx·dt of extra drift');
});

test('WIND preserves the vertical arc EXACTLY (the periodicity law is untouched)', () => {
  const p = classPhysics('grand');
  const stage = windStage(WIND.bandSpeed);
  const b = new Balloon({ cls: 'grand', x: 400, floorY: 740, id: 1 });
  const ys = [];
  for (let t = 0; t < p.period * 3 + 5; t++) { ys.push(b.y); b.step({ left: 0, right: 1280 }, stage); }
  for (let t = 0; t + p.period < ys.length; t++) assert.equal(ys[t], ys[t + p.period], `vertical arc drifted at t=${t}`);
});

test('generated locale-2 stages carry a wind band; other locales do not', () => {
  for (let seed = 1; seed <= 30; seed++) {
    assert.ok(generateStage(seed, { locale: 2, stage: 2 }).windBands.length >= 1, `seed ${seed} locale-2 has wind`);
    assert.equal(generateStage(seed, { locale: 1, stage: 2 }).windBands.length, 0, 'locale-1 has no wind');
    assert.equal(generateStage(seed, { locale: 3, stage: 2 }).windBands.length, 0, 'locale-3 has no wind (that act is gores)');
  }
});

test('a wind band survives the stage snapshot/restore', () => {
  const stage = generateStage(5, { locale: 2, stage: 3 });
  const snap = JSON.parse(JSON.stringify(stage.snapshot()));
  const s2 = Stage.fromSnapshot(snap);
  assert.deepEqual(s2.windBands, stage.windBands);
});

test('the authored M1 stage has no wind (backward-compatible)', () => {
  assert.deepEqual(authoredStageM1().windBands, []);
});
