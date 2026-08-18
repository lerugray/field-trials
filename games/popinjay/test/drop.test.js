// drop.test.js — the drop system (DESIGN-SEED §Drops): fall/land/expire, the seeded
// table, pickup effects (medallion/slow/freeze/shield), and byte-exact save. Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Drop, rollDropKind } from '../src/sim/drop.js';
import { Balloon } from '../src/sim/balloon.js';
import { Stage } from '../src/sim/stage.js';
import { Stream } from '../src/engine/streams.js';
import { DROPS, TICK_HZ } from '../src/tuning.js';

function twoFloorStage() {
  return new Stage({
    bounds: { left: 0, right: 1280, top: 0, bottom: 800 },
    solids: [
      { id: 'ground', kind: 'ground', x0: 0, x1: 1280, top: 740, bottom: 800 },
      { id: 'brk', kind: 'breakable', x0: 300, x1: 500, top: 400, bottom: 424, intact: true },
    ],
    ladders: [], spawns: [],
  });
}

test('a drop falls under gravity and rests ON the surface below (never inside geometry)', () => {
  const stage = twoFloorStage();
  const d = new Drop({ kind: 'medallion', x: 400, y: 100 }); // above the breakable
  for (let t = 0; t < 300 && !d.landed; t++) d.step(stage);
  assert.ok(d.landed);
  assert.equal(d.y, 400 - d.radius, 'rests on the breakable top, bottom flush with the surface');
});

test('a drop whose floor breaks falls to the next surface', () => {
  const stage = twoFloorStage();
  const d = new Drop({ kind: 'shield', x: 400, y: 100 });
  for (let t = 0; t < 300 && !d.landed; t++) d.step(stage);
  assert.equal(d.y, 400 - d.radius);
  stage.break('brk');                       // the floor under it breaks away
  for (let t = 0; t < 300 && d.y < 740 - d.radius - 0.5; t++) d.step(stage);
  assert.equal(d.y, 740 - d.radius, 'falls to the ground');
});

test('a drop expires after its ttl (and blinks near the end)', () => {
  const stage = twoFloorStage();
  const d = new Drop({ kind: 'freeze', x: 400, y: 720 });
  for (let t = 0; t < DROPS.ttlTicks - DROPS.blinkTicks; t++) d.step(stage);
  assert.ok(d.blinking, 'blinks in the final window');
  for (let t = 0; t < DROPS.blinkTicks + 2; t++) d.step(stage);
  assert.ok(d.expired);
});

test('rollDropKind is deterministic and can exclude dynamite', () => {
  const a = []; const s1 = new Stream(123); for (let i = 0; i < 50; i++) a.push(rollDropKind(s1, ['dynamite']));
  const b = []; const s2 = new Stream(123); for (let i = 0; i < 50; i++) b.push(rollDropKind(s2, ['dynamite']));
  assert.deepEqual(a, b, 'same seed → same rolls');
  assert.ok(!a.includes('dynamite'), 'dynamite excluded');
});

test('pickup applies the effect: medallion scores, slow/freeze arm, shield sets', () => {
  for (const [kind, check] of [
    ['medallion', (w) => w.score >= DROPS.medallionScore],
    ['slow', (w) => w.timeSlow > 0],
    ['freeze', (w) => w.freeze > 0],
    ['shield', (w) => w.shield === true],
  ]) {
    const w = new World({ seed: 1 }); w.balloons = [];
    w.drops = [new Drop({ kind, x: w.player.x, y: w.player.feetY - 10, id: 1 })];
    w.step({});
    assert.ok(check(w), `pickup ${kind} did not apply`);
    assert.equal(w.drops.length, 0, 'the drop is consumed on pickup');
  }
});

test('FREEZE halts balloons; TIME-SLOW halves their speed', () => {
  const w = new World({ seed: 1 });
  const b = w.balloons[0]; const x0 = b.x, y0 = b.y;
  w.freeze = 30;
  w.step({});
  assert.equal(w.balloons[0].x, x0, 'frozen balloons do not move (x)');
  assert.equal(w.balloons[0].y, y0, 'frozen balloons do not move (y)');

  // Time-slow: over two ticks the balloon advances only one tick's worth.
  const w2 = new World({ seed: 1 });
  const ref = new World({ seed: 1 });
  ref.step({}); // one normal tick of movement
  w2.timeSlow = 60;
  w2.step({}); w2.step({}); // two slow ticks == one normal tick of movement
  assert.ok(Math.abs(w2.balloons[0].x - ref.balloons[0].x) < 1e-9, 'two slow ticks ≈ one normal tick');
});

test('a SHIELD absorbs one hit (no heart lost) then is spent', () => {
  const w = new World({ seed: 1 });
  const gTop = w.stage.floorBelow(0, 0).y;
  w.shield = true;
  w.balloons = [new Balloon({ cls: 'grand', x: w.player.x, floorY: gTop, y: w.player.feetY - 20, vy: 0, id: 1 })];
  const h0 = w.hearts;
  w.step({});
  assert.equal(w.hearts, h0, 'shield absorbed the hit — no heart lost');
  assert.equal(w.shield, false, 'shield is spent');
});

test('drop + effect state round-trips byte-identically in the save', () => {
  const ref = new World({ seed: 7 });
  ref.drops = [new Drop({ kind: 'slow', x: 300, y: 200, id: 1 }), new Drop({ kind: 'medallion', x: 900, y: 150, id: 2 })];
  ref.timeSlow = 40; ref.shield = true;
  for (let t = 0; t < 30; t++) ref.step({});
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap);
  for (let t = 0; t < 60; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint());
});
