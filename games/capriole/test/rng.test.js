// node --test — named RNG streams: determinism, independence, save/restore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, Stream, STREAM_NAMES } from '../src/sim/rng.js';

test('same world seed reproduces the same stream sequence', () => {
  const a = new Rng(12345);
  const b = new Rng(12345);
  const seqA = Array.from({ length: 20 }, () => a.stream('layout').next());
  const seqB = Array.from({ length: 20 }, () => b.stream('layout').next());
  assert.deepEqual(seqA, seqB);
});

test('named streams are independent — drawing from one does not shift another', () => {
  // Two rngs on the same seed. In one, draw a bunch from `decor` first;
  // the `layout` sequence must be identical regardless.
  const a = new Rng(777);
  const b = new Rng(777);
  for (let i = 0; i < 50; i++) b.stream('decor').next(); // perturb an unrelated stream
  const la = Array.from({ length: 10 }, () => a.stream('layout').next());
  const lb = Array.from({ length: 10 }, () => b.stream('layout').next());
  assert.deepEqual(la, lb, 'layout stream is unaffected by decor draws');
});

test('different seeds produce different sequences (overwhelmingly likely)', () => {
  const a = new Rng(1);
  const b = new Rng(2);
  const seqA = Array.from({ length: 10 }, () => a.stream('enemies').next());
  const seqB = Array.from({ length: 10 }, () => b.stream('enemies').next());
  assert.notDeepEqual(seqA, seqB);
});

test('save/restore resumes a stream at the exact position (no re-roll)', () => {
  const rng = new Rng(2024);
  const s = rng.stream('caprices');
  for (let i = 0; i < 13; i++) s.next(); // advance
  const saved = rng.save();
  const nextRaw = s.next(); // the value AFTER the save point

  const restored = Rng.load(saved);
  const nextRestored = restored.stream('caprices').next();
  assert.equal(nextRestored, nextRaw, 'restored stream yields the same next value');
});

test('full Rng save/restore round-trips every stream', () => {
  const rng = new Rng(555);
  // Advance each stream a different amount.
  STREAM_NAMES.forEach((name, i) => {
    for (let k = 0; k <= i * 3; k++) rng.stream(name).next();
  });
  const saved = rng.save();
  const restored = Rng.load(saved);
  for (const name of STREAM_NAMES) {
    assert.equal(
      restored.stream(name).next(),
      Rng.load(saved).stream(name).next(),
      `stream ${name} round-trips`,
    );
  }
});

test('unknown stream name throws loudly', () => {
  const rng = new Rng(1);
  assert.throws(() => rng.stream('nope'), /unknown stream/);
});

test('Stream.int and Stream.range stay in bounds', () => {
  const s = new Stream(9);
  for (let i = 0; i < 1000; i++) {
    const n = s.int(5, 10);
    assert.ok(n >= 5 && n < 10);
    const r = s.range(-2, 2);
    assert.ok(r >= -2 && r < 2);
  }
});
