import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_STATS, MAX_LEVEL, XP_TO_REACH, statsForLevel, levelForXp, xpToNextLevel,
  createProgress, gainXp,
} from '../src/sim/stats.js';

test('stats: level-0 baseline matches the study anchor (§2.3)', () => {
  assert.deepEqual(statsForLevel(0), { maxHP: 37, str: 14, def: 5, mag: 14, energy: 5 });
  assert.deepEqual(BASE_STATS, { maxHP: 37, str: 14, def: 5, mag: 14, energy: 5 });
});

test('stats: reaching L1 costs 50 XP (§2.5 anchor)', () => {
  assert.equal(XP_TO_REACH[1], 50);
  assert.equal(levelForXp(49), 0);
  assert.equal(levelForXp(50), 1);
  assert.equal(xpToNextLevel(0), 50);
  assert.equal(xpToNextLevel(30), 20);
});

test('stats: max level is single-digit and capped', () => {
  assert.equal(MAX_LEVEL, 9);
  assert.equal(levelForXp(9_999_999), 9);
  assert.equal(xpToNextLevel(9_999_999), 0);
  // clamps beyond cap
  assert.deepEqual(statsForLevel(99), statsForLevel(9));
});

test('stats: stats grow monotonically with level', () => {
  for (let l = 1; l <= MAX_LEVEL; l++) {
    const prev = statsForLevel(l - 1);
    const cur = statsForLevel(l);
    for (const k of Object.keys(prev)) assert.ok(cur[k] > prev[k], `${k} should grow at L${l}`);
  }
});

test('stats: gainXp levels up and tops HP by the maxHP delta', () => {
  const p = createProgress(0);
  assert.equal(p.level, 0);
  assert.equal(p.hp, 37);
  // Take some damage first.
  p.hp = 20;
  const ev = gainXp(p, 50);
  assert.ok(ev.leveledUp);
  assert.equal(ev.from, 0);
  assert.equal(ev.to, 1);
  // maxHP went 37 → 45 (+8); hp topped up by the same delta: 20 → 28.
  assert.equal(p.stats.maxHP, 45);
  assert.equal(p.hp, 28);
});

test('stats: gainXp without crossing a threshold does not level or heal', () => {
  const p = createProgress(0);
  p.hp = 10;
  const ev = gainXp(p, 10);
  assert.ok(!ev.leveledUp);
  assert.equal(p.level, 0);
  assert.equal(p.hp, 10);
});

test('stats: multi-level jump in one award lands on the correct level', () => {
  const p = createProgress(0);
  const ev = gainXp(p, XP_TO_REACH[3]); // straight to L3
  assert.ok(ev.leveledUp);
  assert.equal(ev.to, 3);
  assert.deepEqual(p.stats, statsForLevel(3));
});

test('stats: HP never exceeds max on level-up top-up', () => {
  const p = createProgress(0); // full hp 37
  gainXp(p, 50);
  assert.ok(p.hp <= p.stats.maxHP);
  assert.equal(p.hp, p.stats.maxHP); // was full, stays full at new max via delta top-up... capped
});
