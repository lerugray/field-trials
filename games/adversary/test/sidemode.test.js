import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleSideStage, SIDE_CHUNK_NAMES } from '../src/sim/sidemode.js';
import { createStage, stepStage } from '../src/sim/stage.js';
import { runBot } from '../src/sim/bot.js';

test('sidemode: assembly is deterministic per seed and flagged sandboxed', () => {
  const a = assembleSideStage('seed-x', 5);
  const b = assembleSideStage('seed-x', 5);
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(a.chunks, b.chunks);
  assert.ok(a.sideMode, 'flagged as a side-mode run');
  assert.notDeepEqual(assembleSideStage('seed-y', 5).rows, a.rows, 'different seeds differ');
});

test('sidemode: chunks come from the campaign-flavored library', () => {
  const def = assembleSideStage('lib', 6);
  assert.equal(def.chunks.length, 6);
  for (const name of def.chunks) assert.ok(SIDE_CHUNK_NAMES.includes(name));
});

test('sidemode: assembled runs have a boss and an exit past it', () => {
  const s = createStage(assembleSideStage('boss', 5), { seed: 'sb' });
  assert.ok(s.boss && s.boss.alive);
  assert.ok(s.exitX > s.boss.x);
});

for (const seed of ['a', 'b', 'c']) {
  test(`sidemode: HEADLESS BOT clears an assembled run (seed ${seed})`, () => {
    const s = createStage(assembleSideStage(seed, 5), { seed: `run-${seed}` });
    const r = runBot(s, stepStage, 16000);
    assert.ok(r.cleared, `bot cleared the side run (dead=${r.dead}, ticks=${r.ticks})`);
  });
}

test('sidemode: sandbox — the side stage is self-contained (its own progress/save flag)', () => {
  const s = createStage(assembleSideStage('sandbox', 5), { seed: 'sx' });
  // A side stage carries its own progress and the sideMode marker; the boot layer runs it on a
  // separate save slot so nothing here can leak into the campaign save.
  assert.ok(s.tilemap && s.progress && s.player, 'a complete standalone stage');
  assert.ok(assembleSideStage('sandbox', 5).sideMode === true);
});

// Deterministic one-chunk seeds whose chunks[0] covers every SIDE_CHUNK_NAMES entry.
const SIDE_ONE_CHUNK_SEEDS = Object.freeze({
  'flat-trash': 'chunk-probe-13',
  'pit-jump': 'chunk-probe-4',
  'hopper-perch': 'chunk-probe-0',
  gauntlet: 'chunk-probe-2',
});

test('sidemode: one-chunk seeds cover every library layout', () => {
  assert.deepEqual(Object.keys(SIDE_ONE_CHUNK_SEEDS).sort(), [...SIDE_CHUNK_NAMES].sort());
  for (const name of SIDE_CHUNK_NAMES) {
    const def = assembleSideStage(SIDE_ONE_CHUNK_SEEDS[name], 1);
    assert.deepEqual(def.chunks, [name], `seed ${SIDE_ONE_CHUNK_SEEDS[name]} → ${name}`);
  }
});

for (const name of SIDE_CHUNK_NAMES) {
  test(`sidemode: no-item HEADLESS BOT clears one-chunk layout ${name}`, () => {
    const seed = SIDE_ONE_CHUNK_SEEDS[name];
    const def = assembleSideStage(seed, 1);
    assert.deepEqual(def.chunks, [name]);
    const s = createStage(def, { seed: `side-noitem-${name}` });
    assert.equal(s.kit.doubleJump, false, 'fresh side stage has no doubleJump grant');
    assert.ok(!s.unlockPickups.some((u) => u.move === 'doubleJump'), 'side chunks place no J');
    const r = runBot(s, stepStage, 16000);
    assert.ok(r.cleared, `bot cleared ${name} without doubleJump (dead=${r.dead}, ticks=${r.ticks})`);
    assert.equal(s.kit.doubleJump, false);
  });
}
