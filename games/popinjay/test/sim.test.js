// sim.test.js — M0 determinism proof (hard rule 6 / DESIGN-SEED verification bar).
// Proves the sim/render split (this runs with no browser) and the save round-trip.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/engine/prng.js';
import { Stream, Streams, audioSeed } from '../src/engine/streams.js';
import { World } from '../src/sim/world.js';

test('Stream reproduces the canonical mulberry32 sequence', () => {
  const seed = 0xC0FFEE;
  const ref = mulberry32(seed);
  const s = new Stream(seed);
  for (let i = 0; i < 1000; i++) {
    assert.equal(s.next(), ref(), `divergence at draw ${i}`);
  }
});

test('Stream serialize/restore continues byte-identically', () => {
  const s = new Stream(12345);
  for (let i = 0; i < 37; i++) s.next();
  const saved = s.state;
  const after = [s.next(), s.next(), s.next()];
  const s2 = new Stream(0);
  s2.state = saved;
  assert.deepEqual([s2.next(), s2.next(), s2.next()], after);
});

test('named streams are independent (advancing one does not perturb another)', () => {
  const a = new Streams(999);
  const b = new Streams(999);
  // Advance only "roster" in a; "layout" must still match b's untouched "layout".
  for (let i = 0; i < 50; i++) a.get('roster').next();
  assert.equal(a.get('layout').state, b.get('layout').state);
  assert.notEqual(a.get('roster').state, b.get('roster').state);
});

test('Streams serialize/restore is a faithful round-trip', () => {
  const a = new Streams(0x1234);
  for (let i = 0; i < 20; i++) { a.get('layout').next(); a.get('drops').next(); }
  const snap = a.serialize();
  const nextDraw = a.get('layout').next();
  const b = Streams.fromSerialized(snap);
  assert.equal(b.get('layout').next(), nextDraw);
});

test('Streams.restore refuses a seed mismatch (no silent re-roll)', () => {
  const a = new Streams(1);
  assert.throws(() => a.restore({ masterSeed: 2, pos: {} }), /seed mismatch/);
});

test('audioSeed is deterministic and separate from any sim stream seed', () => {
  const master = 424242;
  assert.equal(audioSeed(master), audioSeed(master)); // deterministic
  const sim = new Streams(master);
  // The audio seed must not coincide with any sim stream's initial state.
  for (const name of ['layout', 'roster', 'drops', 'draft']) {
    assert.notEqual(audioSeed(master), sim.get(name).state);
  }
});

test('World is deterministic across two independent runs', () => {
  const a = new World({ seed: 7 }).run(1200);
  const b = new World({ seed: 7 }).run(1200);
  assert.equal(a.fingerprint(), b.fingerprint());
});

test('World with different seeds diverges', () => {
  const a = new World({ seed: 7 }).run(1200);
  const b = new World({ seed: 8 }).run(1200);
  assert.notEqual(a.fingerprint(), b.fingerprint());
});

test('World save round-trip continues byte-identically (mid-run resume)', () => {
  // Uninterrupted reference.
  const ref = new World({ seed: 55 }).run(1000);
  const refPrint = ref.fingerprint();

  // Run 400, save, restore into a fresh world, finish the remaining 600.
  const a = new World({ seed: 55 }).run(400);
  const snap = JSON.parse(JSON.stringify(a.serialize())); // prove it's plain JSON
  const resumed = World.fromSerialized(snap).run(600);

  assert.equal(resumed.fingerprint(), refPrint);
});

test('World.restore refuses a seed mismatch', () => {
  const a = new World({ seed: 3 }).run(10);
  const snap = a.serialize();
  snap.seed = 4;
  assert.throws(() => new World({ seed: 3 }).restore(snap), /seed mismatch/);
});
