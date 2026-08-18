// dynamite.test.js — the dynamite BEAT CASCADE (STUDY §4.3): a fuse, then all
// balloons split one class step per beat to Penny (split arithmetic preserved),
// gated (one at a time; never while slow/freeze). Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Drop } from '../src/sim/drop.js';
import { Balloon } from '../src/sim/balloon.js';
import { DYNAMITE } from '../src/tuning.js';

function dynamiteWorld() {
  const w = new World({ seed: 1 }); // authored stage: one Grand
  w.invincible = true;              // probing the cascade, not survival
  w.drops = [new Drop({ kind: 'dynamite', x: w.player.x, y: w.player.feetY - 10, id: 1 })];
  return w;
}

test('picking up dynamite lights a FUSE (does not cascade instantly)', () => {
  const w = dynamiteWorld();
  w.step({});
  assert.ok(w.dynamiteFuse > 0, 'the fuse is lit');
  assert.equal(w.cascading, false, 'no instant screen-flip');
  // The roster balloon is untouched during the fuse.
  assert.equal(w.balloons.filter((b) => b.cls === 'grand').length, 1);
});

test('after the fuse the cascade splits every balloon to Penny (arithmetic preserved: 1 Grand → 8 Penny)', () => {
  const w = dynamiteWorld();
  for (let t = 0; t < DYNAMITE.fuseTicks + DYNAMITE.beatTicks * 6 + 20; t++) w.step({});
  assert.equal(w.cascading, false, 'cascade completes');
  assert.equal(w.balloons.length, 8, '1 Grand cascades to 8 Penny');
  assert.ok(w.balloons.every((b) => b.cls === 'penny'), 'all Penny');
});

test('dynamite is GATED: not rolled while a fuse/cascade is busy, nor during slow/freeze', () => {
  // Busy (fuse lit): guaranteed drops on pop never produce a second dynamite.
  const busy = new World({ seed: 5 }); busy.balloons = []; busy.dropChance = 1; busy.dynamiteFuse = 30;
  for (let i = 0; i < 30; i++) { const b = new Balloon({ cls: 'penny', x: 100, floorY: 700, y: 600, vy: 0, id: i + 1 }); busy.balloons = [b]; busy._resolveHit(b); }
  assert.ok(busy.drops.every((d) => d.kind !== 'dynamite'), 'no dynamite while a fuse is lit');

  // During time-slow: likewise gated.
  const slow = new World({ seed: 5 }); slow.balloons = []; slow.dropChance = 1; slow.timeSlow = 200;
  for (let i = 0; i < 30; i++) { const b = new Balloon({ cls: 'penny', x: 100, floorY: 700, y: 600, vy: 0, id: i + 1 }); slow.balloons = [b]; slow._resolveHit(b); }
  assert.ok(slow.drops.every((d) => d.kind !== 'dynamite'), 'no dynamite while time-slow is active');
});

test('the cascade emits a legible split event per balloon each beat (rule 5)', () => {
  const w = dynamiteWorld();
  let sawSplit = false;
  for (let t = 0; t < DYNAMITE.fuseTicks + DYNAMITE.beatTicks * 6 + 20; t++) {
    w.step({});
    if (w.drainEvents().some((e) => e.type === 'cascadeSplit')) sawSplit = true;
  }
  assert.ok(sawSplit, 'cascade beats surface split events');
});

test('a mid-cascade world round-trips byte-identically in the save', () => {
  const ref = dynamiteWorld();
  // Advance into the cascade (past the fuse, a couple of beats in).
  for (let t = 0; t < DYNAMITE.fuseTicks + DYNAMITE.beatTicks + 3; t++) ref.step({});
  assert.ok(ref.cascading || ref.balloons.every((b) => b.cls === 'penny'), 'cascade underway');
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap);
  resumed.invincible = true;
  for (let t = 0; t < 200; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint());
});
