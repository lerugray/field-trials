// gore.test.js — locale-3 WEIGHTED GORES (DESIGN-SEED §The loop): a heavier variant
// with DEEPER, FASTER arcs — but STILL exactly periodic (the promise law never breaks).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Balloon, classPhysics } from '../src/sim/balloon.js';
import { generateStage } from '../src/sim/generate.js';
import { GORE, CLASS_ORDER } from '../src/tuning.js';

test('a weighted gore is heavier: deeper apex + faster horizontal than its base class', () => {
  for (const cls of CLASS_ORDER) {
    const base = classPhysics(cls, false);
    const gore = classPhysics(cls, true);
    assert.ok(gore.effectiveApex > base.effectiveApex, `${cls} gore arcs deeper`);
    assert.ok(Math.abs(gore.hspeed - base.hspeed * GORE.hspeedScale) < 1e-9, `${cls} gore is faster`);
    assert.ok(Number.isInteger(gore.period) && gore.period >= 2, `${cls} gore has an integer period`);
  }
});

test('a weighted gore is EXACTLY periodic to the tick (its own derived period)', () => {
  const p = classPhysics('grand', true);
  const b = new Balloon({ cls: 'grand', x: 400, floorY: 740, weighted: true });
  const ys = [];
  for (let t = 0; t < p.period * 3 + 5; t++) { ys.push(b.y); b.step(); }
  for (let t = 0; t + p.period < ys.length; t++) assert.equal(ys[t], ys[t + p.period], `gore arc drifted at t=${t}`);
});

test('gore children stay gores (the variant is inherited through the split tree)', () => {
  const g = new Balloon({ cls: 'grand', x: 512, floorY: 740, weighted: true });
  const kids = g.split();
  assert.equal(kids.length, 2);
  assert.ok(kids.every((k) => k.weighted && k.cls === 'parade'), 'children are weighted parades');
});

test('generated locale-3 stages spawn WEIGHTED gores; other locales do not', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const l3 = generateStage(seed, { locale: 3, stage: 2 });
    assert.ok(l3.spawns.every((s) => s.weighted), `seed ${seed} locale-3 roster is weighted`);
    const l1 = generateStage(seed, { locale: 1, stage: 2 });
    assert.ok(l1.spawns.every((s) => !s.weighted), 'locale-1 roster is not weighted');
  }
});

test('a weighted gore round-trips through serialize/restore', () => {
  const ref = new Balloon({ cls: 'parade', x: 640, floorY: 740, weighted: true, id: 3 });
  for (let t = 0; t < 50; t++) ref.step({ left: 0, right: 1280 });
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = Balloon.fromSerialized(snap);
  assert.equal(resumed.weighted, true);
  for (let t = 0; t < 80; t++) { ref.step({ left: 0, right: 1280 }); resumed.step({ left: 0, right: 1280 }); }
  assert.deepEqual(resumed.serialize(), ref.serialize());
});
