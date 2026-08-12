// node --test — spawn-safety regression: the no-input spawn drop and the updraft-net
// respawn must land on solid ground, and enemies must not knock a stationary player
// into a fall->net->fall loop at sphere start. Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, advanceSphere, resolveDraft } from '../src/sim/world.js';
import { spawnEnemies, updateEnemies } from '../src/sim/enemies.js';
import { generateSphere } from '../src/sim/generate.js';
import { tuning } from '../src/sim/tuning.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };
const dt = tuning.jump.count ? 1 / 60 : 1 / 60; // fixed timestep

// Run a no-input sphere entry: clear through drafts to `sphereIndex` (1-based for the
// public stage count), then simulate up to `ticks` with empty input.
function noInputSphere(seed, sphereIndex, ticks = 60 * 30) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  for (let s = 0; s < sphereIndex; s++) {
    advanceSphere(w);
    if (w.phase !== 'draft') return { skip: true };
    resolveDraft(w, -1);
  }
  let tolls = 0, deaths = 0, landed = false;
  for (let i = 0; i < ticks && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.player.landedThisTick) landed = true;
    if (w.netTollThisTick) tolls++;
    if (w.diedThisTick) deaths++;
  }
  return { tolls, deaths, landed, hp: w.hp, dead: w.dead };
}

test('unit: enemies respect the spawn-pad safety zone', () => {
  const g = generateSphere(1, 2); // act-boss sphere has both swoopers and a boss
  const enemies = spawnEnemies(1, 2, g.islands);
  const swooper = enemies.find((e) => e.type === 'swooper');
  const boss = enemies.find((e) => e.boss);
  assert.ok(swooper, 'fixture has a swooper');
  assert.ok(boss, 'fixture has a boss');

  // Player standing on the spawn pad (inside the safety radius).
  const playerInZone = { pos: { x: 0, y: 0, z: 0 } };
  // Player well outside the safety radius.
  const r = tuning.enemies.spawnSafetyRadius + 10;
  const playerOutOfZone = { pos: { x: r, y: 0, z: 0 } };

  // Drive the swooper until it would normally be diving.
  let sawDiveOutOfZone = false, sawDiveInZone = false;
  for (let i = 0; i < 600; i++) {
    updateEnemies([swooper], playerOutOfZone, dt);
    if (swooper.diving) sawDiveOutOfZone = true;
  }
  assert.ok(sawDiveOutOfZone, 'swooper dives when the player is outside the safety zone');

  const swooperHome = { ...swooper.home };
  for (let i = 0; i < 600; i++) {
    updateEnemies([swooper], playerInZone, dt);
    if (swooper.diving) sawDiveInZone = true;
  }
  assert.ok(!sawDiveInZone, 'swooper does NOT dive at a player inside the safety zone');

  // Boss far from spawn should chase the out-of-zone player and return home when the
  // player is in the safety zone (not camp the spawn pad).
  let approachedOut = false;
  for (let i = 0; i < 400; i++) {
    updateEnemies([boss], playerOutOfZone, dt);
    const d = Math.hypot(boss.pos.x - boss.home.x, boss.pos.z - boss.home.z);
    if (d > 5) approachedOut = true;
  }
  assert.ok(approachedOut, 'boss leaves its arena to chase a player outside the safety zone');

  // Reset boss to home, then put player in zone.
  boss.pos.x = boss.home.x; boss.pos.y = boss.home.y + tuning.enemies.boss.restY; boss.pos.z = boss.home.z;
  boss.cool = tuning.enemies.boss.slamInterval;
  let maxDistFromHomeInZone = 0;
  for (let i = 0; i < 400; i++) {
    updateEnemies([boss], playerInZone, dt);
    const d = Math.hypot(boss.pos.x - boss.home.x, boss.pos.z - boss.home.z);
    maxDistFromHomeInZone = Math.max(maxDistFromHomeInZone, d);
  }
  assert.ok(maxDistFromHomeInZone <= 5, 'boss stays near its arena when the player is in the safety zone');
});

test('regression sweep: spheres 1-4 × 500 seeds, no input, zero spawn tolls and deaths', () => {
  const SEEDS = 500;
  let tolls = 0, deaths = 0, unlanded = 0;
  for (let si = 1; si <= 4; si++) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = noInputSphere(seed, si);
      assert.ok(!r.skip, `seed ${seed} sphere ${si} should reach play`);
      assert.ok(r.landed, `seed ${seed} sphere ${si} should land on the spawn pad`);
      tolls += r.tolls;
      deaths += r.deaths;
      if (!r.landed) unlanded++;
    }
  }
  assert.equal(tolls, 0, `no spawn tolls across ${SEEDS * 4} no-input entries`);
  assert.equal(deaths, 0, `no spawn deaths across ${SEEDS * 4} no-input entries`);
  assert.equal(unlanded, 0, 'every spawn drop landed');
});
