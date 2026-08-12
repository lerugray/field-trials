import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpAtRisk, dropMarker, recoverMarker, markerHint } from '../src/sim/souls.js';
import { createProgress } from '../src/sim/stats.js';
import { XP_TO_REACH } from '../src/sim/stats.js';

test('souls: xpAtRisk is the progress above the current level floor', () => {
  const p = createProgress(70); // L1 (floor 50), 20 into L2
  assert.equal(p.level, 1);
  assert.equal(xpAtRisk(p), 20);
  const p0 = createProgress(50); // exactly L1 floor
  assert.equal(xpAtRisk(p0), 0);
});

test('souls: death drops a marker with the at-risk XP and floors to the level (no level loss)', () => {
  const p = createProgress(70); // L1 + 20
  const { marker, forfeited } = dropMarker(p, 100, 50);
  assert.equal(forfeited, 0);
  assert.equal(marker.xp, 20);
  assert.equal(marker.x, 100);
  assert.equal(p.totalXp, XP_TO_REACH[1]); // floored to L1
  assert.equal(p.level, 1);                // level retained
});

test('souls: recovering the marker restores the XP', () => {
  const p = createProgress(70);
  const { marker } = dropMarker(p, 100, 50);
  assert.equal(p.totalXp, 50);
  const r = recoverMarker(p, marker);
  assert.equal(r.recovered, 20);
  assert.equal(p.totalXp, 70);
});

test('souls: dying again before recovery forfeits the old marker', () => {
  const p = createProgress(70);          // 20 at risk
  const first = dropMarker(p, 100, 50);  // marker holds 20; xp floored to 50
  assert.equal(first.marker.xp, 20);
  // Earn a little, then die again with the first marker still out.
  p.totalXp = 60;                        // 10 new at-risk
  const second = dropMarker(p, 200, 50, first.marker);
  assert.equal(second.forfeited, 20, 'the old marker XP is lost');
  assert.equal(second.marker.xp, 10, 'a new marker holds the new at-risk XP');
});

test('souls: no at-risk XP → no marker dropped', () => {
  const p = createProgress(50); // exactly at floor
  const { marker } = dropMarker(p, 100, 50);
  assert.equal(marker, null);
});

test('souls: recovery can trigger a level-up if it crosses a threshold', () => {
  const p = createProgress(45); // L0, 45/50 toward L1
  const { marker } = dropMarker(p, 0, 0); // 45 at risk, floored to 0
  assert.equal(p.level, 0);
  p.totalXp = 10; // earn 10 more toward L1
  const r = recoverMarker(p, marker); // +45 → 55 ≥ 50 → L1
  assert.ok(r.leveledUp);
  assert.equal(p.level, 1);
});

test('souls: markerHint gives direction and distance', () => {
  assert.equal(markerHint(null, 0), null);
  const h = markerHint({ xp: 5, x: 300, y: 0 }, 100);
  assert.equal(h.dir, 1);
  assert.equal(h.dist, 200);
  assert.equal(markerHint({ xp: 5, x: 50, y: 0 }, 100).dir, -1);
});
