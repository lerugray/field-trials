// hit.test.js — the composure hit system (DESIGN-SEED M3: hearts + i-frames +
// knockback + 200 ms hit-stop + culprit outline + death). Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Balloon } from '../src/sim/balloon.js';
import { PLAYER, HIT } from '../src/tuning.js';

// A world with a balloon parked ON the player (guaranteed contact next step).
function contactWorld() {
  const w = new World({ seed: 1 }); // authored stage, player at 760 on the ground
  const gTop = w.stage.floorBelow(0, 0).y;
  w.balloons = [new Balloon({ cls: 'grand', x: w.player.x, floorY: gTop, y: w.player.feetY - 20, vy: 0, id: 1 })];
  return w;
}

test('a balloon touching the player costs a heart and triggers i-frames + knockback + hit-stop + culprit', () => {
  const w = contactWorld();
  const h0 = w.hearts;
  w.step({});
  assert.equal(w.hearts, h0 - 1, 'a hit costs one heart');
  assert.ok(w.player.invulnerable, 'i-frames start');
  assert.equal(w.player.iframe, PLAYER.iframeTicks);
  assert.notEqual(w.player.knockVx, 0, 'knockback applied');
  assert.equal(w.hitStop, HIT.stopTicks, 'a 200 ms hit-stop begins');
  assert.equal(w.culpritId, 1, 'the culprit balloon is stamped');
  assert.ok(w.drainEvents().some((e) => e.type === 'hit'), 'a hit event surfaces (legibility)');
});

test('hit-stop FREEZES the sim for its duration (nothing moves, the impact reads)', () => {
  const w = contactWorld();
  w.step({}); // the hit — sets hitStop
  const px = w.player.x, bx = w.balloons[0].x, by = w.balloons[0].y;
  for (let t = 0; t < HIT.stopTicks; t++) {
    w.step({ right: true }); // input ignored while frozen
    assert.equal(w.player.x, px, 'player frozen during hit-stop');
    assert.equal(w.balloons[0].x, bx, 'balloons frozen during hit-stop');
    assert.equal(w.balloons[0].y, by);
  }
  assert.equal(w.hitStop, 0, 'hit-stop elapses');
});

test('i-frames prevent repeated hits from the same contact', () => {
  const w = contactWorld();
  w.step({}); // first hit
  const afterOne = w.hearts;
  for (let t = 0; t < PLAYER.iframeTicks; t++) w.step({}); // still overlapping, but invulnerable
  assert.equal(w.hearts, afterOne, 'no second hit while invulnerable');
});

test('three hits DOWN the player (dead); a downed sim stops progressing', () => {
  const w = contactWorld();
  const b = w.balloons[0];
  for (let i = 0; i < PLAYER.hearts; i++) { w.player.iframe = 0; w.hitStop = 0; w._playerHit(b); }
  assert.equal(w.hearts, 0);
  assert.ok(w.dead, 'hearts to zero = downed');
  const tick0 = w.tick, px = w.player.x;
  w.step({ right: true });
  assert.equal(w.player.x, px, 'a downed player does not move');
  assert.ok(w.tick > tick0, 'time still advances, but gameplay is halted');
});

test('an invincible world takes no hits (clearance-bot / probe mode)', () => {
  const w = contactWorld();
  w.invincible = true;
  const h0 = w.hearts;
  for (let t = 0; t < 60; t++) w.step({});
  assert.equal(w.hearts, h0, 'invincible skips the composure hit');
  assert.equal(w.dead, false);
});

test('hit state (i-frames, knockback, culprit) round-trips byte-identically', () => {
  const ref = contactWorld();
  ref.step({}); // take the hit
  for (let t = 0; t < 4; t++) ref.step({});
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap);
  assert.equal(resumed.player.iframe, ref.player.iframe);
  assert.equal(resumed.culpritId, ref.culpritId);
  for (let t = 0; t < 120; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint());
});
