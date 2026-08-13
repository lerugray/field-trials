// Named RNG streams: determinism, independence, serialization round-trip.
// These are the spine's determinism guarantees (DESIGN-SEED M1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeStreams,
  serializeStreams,
  restoreStreams,
  STREAM_NAMES,
  Stream,
} from '../src/rng.js';

function draw(stream, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(stream.next());
  return out;
}

test('same seed yields identical sequences', () => {
  const a = makeStreams(12345);
  const b = makeStreams(12345);
  for (const name of STREAM_NAMES) {
    assert.deepEqual(draw(a[name], 20), draw(b[name], 20), `stream ${name} diverged`);
  }
});

test('different seeds yield different sequences', () => {
  const a = makeStreams(1);
  const b = makeStreams(2);
  // Overwhelmingly unlikely to match across 20 draws if truly independent seeds.
  assert.notDeepEqual(draw(a.terrain, 20), draw(b.terrain, 20));
});

test('streams are independent: consuming one does not shift another', () => {
  // Baseline: the encounter sequence with nothing else drawn.
  const base = makeStreams(777);
  const encBaseline = draw(base.encounter, 30);

  // Now hammer the OTHER streams first, then draw encounter. It must be identical.
  const s = makeStreams(777);
  draw(s.terrain, 100);
  draw(s.shuffle, 250);
  draw(s.loot, 40);
  const encAfter = draw(s.encounter, 30);

  assert.deepEqual(encAfter, encBaseline, 'encounter stream was perturbed by other streams');
});

test('all four canonical streams are distinct from each other', () => {
  const s = makeStreams(42);
  const seqs = STREAM_NAMES.map((n) => draw(s[n], 15).join(','));
  const unique = new Set(seqs);
  assert.equal(unique.size, STREAM_NAMES.length, 'two named streams produced the same sequence');
});

test('serialize/restore resumes byte-identically', () => {
  const s = makeStreams(9001);
  draw(s.terrain, 13);
  draw(s.encounter, 7);
  draw(s.shuffle, 21);
  draw(s.loot, 3);

  const snapshot = serializeStreams(s);

  // Continue the live streams and record the continuation.
  const liveCont = {};
  for (const name of STREAM_NAMES) liveCont[name] = draw(s[name], 25);

  // Restore from the snapshot and replay — must match the live continuation.
  const r = restoreStreams(9001, snapshot);
  for (const name of STREAM_NAMES) {
    assert.deepEqual(draw(r[name], 25), liveCont[name], `restored ${name} diverged`);
  }
});

test('restore tolerates a missing stream (forward-compatible saves)', () => {
  const s = makeStreams(5);
  draw(s.terrain, 4);
  const snap = serializeStreams(s);
  delete snap.loot; // simulate an older save that predates the loot stream
  const r = restoreStreams(5, snap);
  // Missing stream re-seeds from master; present streams restore exactly.
  assert.equal(r.terrain.getState(), s.terrain.getState());
  assert.equal(typeof r.loot.next(), 'number');
});

test('Stream helpers stay in range', () => {
  const st = new Stream(123);
  for (let i = 0; i < 500; i++) {
    const k = st.int(6);
    assert.ok(k >= 0 && k < 6 && Number.isInteger(k));
    const r = st.range(3, 9);
    assert.ok(r >= 3 && r <= 9);
    const p = st.next();
    assert.ok(p >= 0 && p < 1);
  }
  assert.ok(['a', 'b', 'c'].includes(st.pick(['a', 'b', 'c'])));
});
