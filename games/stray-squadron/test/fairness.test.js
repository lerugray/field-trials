// The batch-seed fairness regression (DESIGN-SEED M4). Stands from M4 on: every
// milestone runs this and it must stay green. It audits a batch of procedurally
// assembled levels for the two fairness laws — no unavoidable hit, no dead stretch
// — and separately proves the analyzer actually CATCHES a rigged-unfair level (so a
// green batch means "fair", not "the check is vacuous").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel } from '../src/world/level.js';
import { analyzeLevel, auditSeeds, FAIRNESS } from '../src/world/fairness.js';
import { GUNNER_FIRE } from '../src/combat/enemies.js';
import { LOCK } from '../src/combat/lockon.js';
import { SECTORS } from '../src/world/sectors.js';

// A healthy batch. Kept modest so the suite stays fast; the analyzer has been run
// clean over 1000 seeds offline — this is the standing guard against regressions.
const SEEDS = Array.from({ length: 96 }, (_, i) => 'fair-' + i);

test('every seed in the batch assembles a fair level', () => {
  const report = auditSeeds(SEEDS, buildLevel);
  assert.equal(report.ok, true,
    'unfair levels:\n' + report.failures.map((f) =>
      `  ${f.seed}: ${f.problems.join('; ')}`).join('\n'));
});

test('no seed in the batch leaves a dead stretch over the bound', () => {
  const report = auditSeeds(SEEDS, buildLevel);
  assert.ok(report.worstDeadGap <= FAIRNESS.deadMax,
    `worst dead gap ${report.worstDeadGap} > ${FAIRNESS.deadMax}`);
});

test('a specific seed reports zero problems with a healthy margin', () => {
  const report = analyzeLevel(buildLevel('fair-7'));
  assert.deepEqual(report.problems, []);
  assert.ok(report.metrics.maxDeadGap < FAIRNESS.deadMax);
});

// --- S6: route threat must remain FAIR at every threat -------------------------
// Harder branches now fly harder (more enemies/gunners, denser field). The fairness
// laws are non-negotiable at ALL threats — no unavoidable hit, no dead stretch — so
// the batch is audited at both extremes, not just the baseline.
for (const threat of [1, 3]) {
  test(`every seed stays fair at threat ${threat}`, () => {
    const build = (s) => buildLevel(s, undefined, undefined, null, threat);
    const report = auditSeeds(SEEDS, build);
    assert.equal(report.ok, true,
      `threat ${threat} unfair levels:\n` + report.failures.map((f) =>
        `  ${f.seed}: ${f.problems.join('; ')}`).join('\n'));
    assert.ok(report.worstDeadGap <= FAIRNESS.deadMax,
      `threat ${threat} worst dead gap ${report.worstDeadGap} > ${FAIRNESS.deadMax}`);
  });
}

test('threat 2 is the byte-identical baseline; threat 3 adds real content', () => {
  const base = buildLevel('fair-12');
  const explicit2 = buildLevel('fair-12', undefined, undefined, null, 2);
  assert.deepEqual(explicit2, base, 'threat 2 must match the default build exactly');
  // Aggregate content across many seeds so the modest per-level delta is unambiguous.
  const count = (t) => {
    let enemies = 0, obstacles = 0;
    for (const s of SEEDS) {
      const lv = buildLevel(s, undefined, undefined, null, t);
      enemies += lv.enemies.length; obstacles += lv.obstacles.length;
    }
    return { enemies, obstacles };
  };
  const lo = count(1), hi = count(3);
  assert.ok(hi.enemies > lo.enemies, `threat 3 should field more enemies (${hi.enemies} vs ${lo.enemies})`);
  assert.ok(hi.obstacles > lo.obstacles, `threat 3 should field more obstacles (${hi.obstacles} vs ${lo.obstacles})`);
});

// --- the analyzer must actually catch unfairness (not pass vacuously) -----------

test('catches an unavoidable hit — a hazard that blocks the whole frame', () => {
  const rigged = {
    chunks: [{ index: 0, type: 'field', s0: 90, s1: 200 }],
    enemies: [],
    obstacles: [{ s: 140, lat: 0, vert: 0, radius: 12 }], // radius covers the frame
    pickups: [],
  };
  const report = analyzeLevel(rigged);
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((p) => p.includes('clear point')), report.problems.join(';'));
});

test('catches a dead stretch — a long chunk with no content', () => {
  const rigged = {
    chunks: [{ index: 0, type: 'wave', s0: 0, s1: 400 }],
    enemies: [], obstacles: [], pickups: [],
  };
  const report = analyzeLevel(rigged);
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((p) => p.startsWith('dead stretch')), report.problems.join(';'));
});

test('catches a hazard placed outside the reachable frame (containment)', () => {
  const rigged = {
    chunks: [{ index: 0, type: 'field', s0: 0, s1: 100 }],
    enemies: [],
    obstacles: [{ s: 50, lat: 99, vert: 0, radius: 1 }], // way off to the side
    pickups: [],
  };
  const report = analyzeLevel(rigged);
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((p) => p.includes('outside the frame')));
});

// --- visibility fairness: a threat must be SEEN before it can act --------------
// Operator report, 2026-08-07 ("can't see any enemies in the first level"): an
// instrumented playthrough found gunners locking on and opening fire from ~100+
// rail units away while every sector's fog fully hides anything past its `far`
// (58-66) — "dodgeable" on paper, invisible in practice. GUNNER_FIRE.rangeS and
// LOCK.rangeS were pulled in under the shortest sector's fog.far so a threat has
// faded into view before it can lock or fire. This guards the invariant directly
// (not the pixels) so it can't silently drift apart again if either side is
// retuned later.
test('gunners cannot lock or fire from beyond any sector\'s fog visibility', () => {
  const minFogFar = Math.min(...SECTORS.map((s) => s.fog.far));
  assert.ok(GUNNER_FIRE.rangeS < minFogFar,
    `GUNNER_FIRE.rangeS (${GUNNER_FIRE.rangeS}) must stay under the shortest fog.far (${minFogFar}) — a gunner should never open fire from inside the fog it can't be seen through`);
  assert.ok(LOCK.rangeS < minFogFar,
    `LOCK.rangeS (${LOCK.rangeS}) must stay under the shortest fog.far (${minFogFar}) — the lock reticle should never sit on a target still hidden in fog`);
});
