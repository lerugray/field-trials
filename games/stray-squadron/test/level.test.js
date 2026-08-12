import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel, chunkAt } from '../src/world/level.js';
import { WAVE } from '../src/combat/enemies.js';
import { SECTORS } from '../src/world/sectors.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => 'lvl-' + i);

test('same seed builds the identical level', () => {
  assert.deepEqual(buildLevel('run-5'), buildLevel('run-5'));
});

test('different seeds build different levels', () => {
  assert.notDeepEqual(buildLevel('run-5'), buildLevel('run-6'));
});

test('the level theme is one of the authored sectors', () => {
  for (const seed of SEEDS) {
    assert.ok(SECTORS.some((s) => s.id === buildLevel(seed).theme.id));
  }
});

test('every authored chunk is populated with its content (no empty beat)', () => {
  const near = (list, c, pad) => list.some((x) => x.s >= c.s0 - pad && x.s <= c.s1 + pad);
  for (const seed of SEEDS) {
    const { chunks, enemies, obstacles, pickups } = buildLevel(seed);
    for (const c of chunks) {
      if (c.type === 'wave') assert.ok(near(enemies, c, WAVE.spreadS), `${seed} empty wave chunk`);
      else if (c.type === 'field') assert.ok(near(obstacles, c, 0), `${seed} empty field chunk`);
      else if (c.type === 'rescue') assert.ok(near(pickups, c, 0), `${seed} empty rescue chunk`);
    }
  }
});

test('content stays in the right kind of chunk (fights, dodges, breathers separate)', () => {
  for (const seed of SEEDS) {
    const { chunks, enemies, obstacles, pickups } = buildLevel(seed);
    // every obstacle/pickup sits inside a chunk of its own type
    for (const o of obstacles) {
      const c = chunkAt(chunks, o.s);
      assert.ok(c && c.type === 'field', `${seed} obstacle in a ${c && c.type} chunk`);
    }
    for (const p of pickups) {
      const c = chunkAt(chunks, p.s);
      assert.ok(c && c.type === 'rescue', `${seed} pickup in a ${c && c.type} chunk`);
    }
    // enemies may jitter up to spreadS across a seam, but their nominal home is a
    // wave chunk — none sits deep inside a field/rescue chunk
    const waveSpans = chunks.filter((c) => c.type === 'wave');
    for (const e of enemies) {
      const home = waveSpans.some((c) => e.s >= c.s0 - WAVE.spreadS && e.s <= c.s1 + WAVE.spreadS);
      assert.ok(home, `${seed} enemy at ${e.s} outside every wave chunk`);
    }
  }
});

test('chunkAt maps a station to its chunk and returns null past the end', () => {
  const { chunks } = buildLevel('map');
  assert.equal(chunkAt(chunks, chunks[0].s0).index, 0);
  assert.equal(chunkAt(chunks, 1e9), null);
});

test('pickup ids are unique across the level', () => {
  const { pickups } = buildLevel('uids');
  assert.equal(new Set(pickups.map((p) => p.id)).size, pickups.length);
});
