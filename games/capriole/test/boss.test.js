// node --test — M3 act-1 boss GATE: on an act-boss sphere the exit will not open on pods
// alone; the boss must be defeated. Killing the boss opens the exit, restores pips, and
// fires the defeat legibility flag. Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, killEnemy, bossAlive } from '../src/sim/world.js';
import { tuning } from '../src/sim/tuning.js';

// Collect every pod by teleporting onto it (as the stage test does).
function collectAllPods(world) {
  for (const pod of world.pods) {
    if (pod.collected) continue;
    const p = world.player;
    p.pos.x = pod.x; p.pos.z = pod.z; p.pos.y = pod.y - tuning.pods.heightAboveTop;
    p.vel.x = p.vel.y = p.vel.z = 0; p.grounded = true;
    stepOnce(world);
  }
}

test('an act-boss sphere is gated: pods alone do NOT open the exit while the boss lives', () => {
  const w = createWorld(1, 2); // index 2 = act-1 gate
  assert.ok(w.hasBoss, 'boss sphere carries a boss');
  assert.ok(bossAlive(w), 'boss starts alive');
  collectAllPods(w);
  assert.equal(w.podsCollected, tuning.pods.perSphere, 'all pods collected');
  assert.equal(w.exit.open, false, 'exit stays SHUT while the boss lives (the gate)');
});

test('defeating the boss opens the exit, restores pips, and fires the defeat flag', () => {
  const w = createWorld(1, 2);
  w.hp = 2;
  collectAllPods(w);
  assert.equal(w.exit.open, false);
  // Kill the boss directly (multi-stomp is covered in combat.test).
  const bi = w.enemies.findIndex((e) => e.boss);
  const boss = w.enemies[bi];
  boss.hp = 1;
  killEnemy(w, boss, bi);
  assert.ok(w.bossDefeatedThisTick, 'boss-defeat legibility flag fired');
  assert.ok(w.hp >= 2 + tuning.hp.bossRestore - 1, 'boss kill restored pips');
  assert.ok(w.sparks.length >= tuning.spark.bossDrop, 'boss dropped its premium spark burst');
  // With pods in AND the boss dead, the next tick opens the exit.
  stepOnce(w);
  assert.ok(w.exit.open, 'exit opens once the act gate is cleared');
});

test('non-boss spheres are ungated (exit opens on pods alone)', () => {
  const w = createWorld(1, 1); // ordinary sphere
  assert.equal(w.hasBoss, false);
  collectAllPods(w);
  assert.ok(w.exit.open, 'ordinary sphere opens on pods with no boss requirement');
});
