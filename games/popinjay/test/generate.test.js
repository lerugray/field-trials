// generate.test.js — M2 generation property tests (DESIGN-SEED M2: constraint-grammar
// layouts + seeded rosters; generation property tests over N seeds). Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateStage, validateStructure, validateDensity, fallbackStage, stageSeed, rosterHits, CENTERPIECE_NAMES } from '../src/sim/generate.js';
import { CLASS_ORDER } from '../src/tuning.js';

const SEEDS = 120;

test('every generated stage over N seeds × all locale/stage is structurally valid', () => {
  let count = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (let loc = 1; loc <= 3; loc++) {
      for (let st = 1; st <= 4; st++) {
        const stg = generateStage(seed, { locale: loc, stage: st });
        const v = validateStructure(stg);
        assert.ok(v.ok, `seed ${seed} ${loc}-${st}: ${v.reasons.join('; ')}`);
        count++;
      }
    }
  }
  assert.equal(count, SEEDS * 12);
});

test('generation is deterministic: same (seed,locale,stage) yields an identical layout', () => {
  for (const [seed, loc, st] of [[7, 1, 1], [42, 2, 3], [999, 3, 4]]) {
    const a = generateStage(seed, { locale: loc, stage: st });
    const b = generateStage(seed, { locale: loc, stage: st });
    assert.deepEqual(a.solids, b.solids);
    assert.deepEqual(a.ladders, b.ladders);
    assert.deepEqual(a.spawns, b.spawns);
    assert.deepEqual(a.meta, b.meta);
  }
  // Distinct sub-seeds per stage (layouts should not all be identical siblings).
  assert.notEqual(stageSeed(1, 1, 1), stageSeed(1, 1, 2));
});

test('1-1 teaching constraints: no breakables, no Grand, generous (safe) roster', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const stg = generateStage(seed, { locale: 1, stage: 1 });
    assert.ok(stg.meta.teaching);
    assert.ok(!stg.solids.some((s) => s.kind === 'breakable'), 'no breakables on 1-1');
    for (const sp of stg.spawns) assert.ok(CLASS_ORDER.indexOf(sp.cls) >= 1, 'no Grand on 1-1');
    assert.ok(stg.spawns.length >= 1);
  }
});

test('the safe opening holds: no roster balloon starts atop the player spawn', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const stg = generateStage(seed, { locale: 2, stage: 2 });
    for (const sp of stg.spawns) {
      assert.ok(Math.abs(sp.x - stg.meta.playerSpawnX) >= 239, `balloon too close to spawn (seed ${seed})`);
    }
  }
});

test('layouts vary across seeds (the grammar is not degenerate)', () => {
  const shapes = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const stg = generateStage(seed, { locale: 2, stage: 3 });
    shapes.add(JSON.stringify(stg.solids.filter((s) => s.kind !== 'ground').map((s) => [s.kind, Math.round(s.x0), s.top])));
  }
  assert.ok(shapes.size > 10, `expected varied layouts, got ${shapes.size} distinct`);
});

test('every platform is ladder-reachable in generated stages', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const stg = generateStage(seed, { locale: 3, stage: 4 });
    for (const p of stg.solids.filter((s) => s.kind !== 'ground')) {
      const served = stg.ladders.some((l) => Math.abs(l.top - p.top) < 2 && l.x0 >= p.x0 - 2 && l.x1 <= p.x1 + 2);
      assert.ok(served, `platform ${p.id} unreachable (seed ${seed})`);
    }
  }
});

test('each locale\'s 4th stage is a NAMED, denser CENTERPIECE that still validates', () => {
  for (let locale = 1; locale <= 3; locale++) {
    let cpHits = 0, s1Hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const cp = generateStage(seed, { locale, stage: 4 });
      assert.equal(cp.meta.centerpiece, true, `${locale}-4 is a centerpiece`);
      assert.equal(cp.meta.centerpieceName, CENTERPIECE_NAMES[locale]);
      assert.ok(validateStructure(cp).ok && validateDensity(cp).ok, `centerpiece ${locale}-4 seed ${seed} valid`);
      cpHits += rosterHits(cp.spawns);
      s1Hits += rosterHits(generateStage(seed, { locale, stage: 1 }).spawns);
      assert.equal(generateStage(seed, { locale, stage: 1 }).meta.centerpiece, false, 'stage 1 is not a centerpiece');
    }
    assert.ok(cpHits > s1Hits, `locale ${locale} centerpieces are denser than 1-stages`);
  }
});

test('the fallback layout is itself structurally valid (never ships broken)', () => {
  for (const [loc, st] of [[1, 1], [2, 2], [3, 4]]) {
    const v = validateStructure(fallbackStage(123, loc, st));
    assert.ok(v.ok, `fallback ${loc}-${st}: ${v.reasons.join('; ')}`);
  }
});
