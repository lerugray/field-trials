import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChunks, CHUNK, CHUNK_TYPES } from '../src/world/grammar.js';

const SEEDS = Array.from({ length: 60 }, (_, i) => 'g-seed-' + i);

test('same seed builds the identical chunk list', () => {
  assert.deepEqual(buildChunks('run-7'), buildChunks('run-7'));
});

test('different seeds differ', () => {
  assert.notDeepEqual(buildChunks('run-7'), buildChunks('run-8'));
});

test('chunks tile the rail contiguously with no gaps or overlaps', () => {
  for (const seed of SEEDS) {
    const chunks = buildChunks(seed, CHUNK.startS, 1400);
    assert.ok(chunks.length > 0);
    assert.equal(chunks[0].s0, CHUNK.startS, `${seed} starts at the line`);
    assert.equal(chunks[chunks.length - 1].s1, 1400, `${seed} ends at level end`);
    for (let i = 0; i < chunks.length; i++) {
      assert.equal(chunks[i].index, i, `${seed} index ${i}`);
      assert.ok(chunks[i].s1 > chunks[i].s0, `${seed} chunk ${i} positive length`);
      if (i > 0) assert.equal(chunks[i].s0, chunks[i - 1].s1, `${seed} contiguous at ${i}`);
    }
  }
});

test('every chunk is a known authored type', () => {
  for (const seed of SEEDS) {
    for (const c of buildChunks(seed)) assert.ok(CHUNK_TYPES.includes(c.type));
  }
});

test('the level opens on action, never a breather', () => {
  for (const seed of SEEDS) {
    assert.notEqual(buildChunks(seed)[0].type, 'rescue', `${seed} opens on rescue`);
  }
});

test('no two rescue breathers are ever adjacent', () => {
  for (const seed of SEEDS) {
    const chunks = buildChunks(seed);
    for (let i = 1; i < chunks.length; i++) {
      assert.ok(!(chunks[i].type === 'rescue' && chunks[i - 1].type === 'rescue'),
        `${seed} adjacent rescue at ${i}`);
    }
  }
});

test('no type ever repeats more than twice in a row', () => {
  for (const seed of SEEDS) {
    const chunks = buildChunks(seed);
    let run = 1;
    for (let i = 1; i < chunks.length; i++) {
      run = chunks[i].type === chunks[i - 1].type ? run + 1 : 1;
      assert.ok(run <= 2, `${seed} ${chunks[i].type} run of ${run} at ${i}`);
    }
  }
});

test('a full-length level contains all three chunk types (variety guarantee)', () => {
  for (const seed of SEEDS) {
    const types = new Set(buildChunks(seed, CHUNK.startS, 1400).map((c) => c.type));
    assert.equal(types.size, 3, `${seed} only had ${[...types].join(',')}`);
  }
});

test('no sliver chunks — every chunk clears its own type minimum', () => {
  for (const seed of SEEDS) {
    for (const c of buildChunks(seed)) {
      assert.ok(c.s1 - c.s0 >= CHUNK.len[c.type].min - 1e-6,
        `${seed} sliver ${c.type} chunk ${c.s1 - c.s0}`);
    }
  }
});

test('chunk lengths sit within their authored envelope (except an absorbed tail)', () => {
  for (const seed of SEEDS) {
    const chunks = buildChunks(seed);
    chunks.forEach((c, i) => {
      const spec = CHUNK.len[c.type];
      const len = c.s1 - c.s0;
      const isLast = i === chunks.length - 1;
      // The last chunk may be stretched to absorb the tail; others must be in band.
      if (!isLast) {
        assert.ok(len >= spec.min - 1e-6 && len <= spec.max + 1e-6,
          `${seed} chunk ${i} (${c.type}) len ${len} out of [${spec.min},${spec.max}]`);
      } else {
        assert.ok(len >= spec.min - 1e-6, `${seed} last chunk under min`);
      }
    });
  }
});
