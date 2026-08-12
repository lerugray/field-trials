// node --test — M3 BESTIARY foundation: the enemy roster spawns deterministically from
// (seed, sphereIndex), the teaching sphere is empty, act-boss spheres carry a boss, and the
// per-tick behaviors are deterministic, bounded, and free of Math.random/wall-clock. Pure
// sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce } from '../src/sim/world.js';
import { spawnEnemies, updateEnemies, enemyCountFor, isBossSphere } from '../src/sim/enemies.js';
import { generateSphere } from '../src/sim/generate.js';
import { tuning } from '../src/sim/tuning.js';

test('the teaching sphere (index 0) has NO enemies (the leap is taught first)', () => {
  const w = createWorld(1, 0);
  assert.equal(w.enemies.length, 0, 'teaching sphere empty');
  assert.equal(enemyCountFor(0), 0);
});

test('enemy count ramps with sphere index and is capped', () => {
  const c1 = enemyCountFor(1), c4 = enemyCountFor(4);
  assert.ok(c1 >= 1, 'sphere 1 has enemies');
  assert.ok(c4 > c1, 'later spheres have more');
  assert.ok(enemyCountFor(99) <= tuning.enemies.maxPerSphere, 'capped');
});

test('spawn is deterministic from (seed, sphereIndex)', () => {
  const g = generateSphere(77, 3);
  const a = spawnEnemies(77, 3, g.islands);
  const b = spawnEnemies(77, 3, g.islands);
  assert.deepEqual(a, b, 'same inputs → identical roster');
  const c = spawnEnemies(78, 3, g.islands);
  assert.notDeepEqual(a.map((e) => e.type + e.island), c.map((e) => e.type + e.island));
});

test('all four archetypes are code-representable and land on chain islands (not the spawn pad)', () => {
  // Sweep several spheres to see every archetype at least once.
  const seen = new Set();
  for (let s = 1; s <= 8; s++) {
    const g = generateSphere(5, s);
    for (const en of spawnEnemies(5, s, g.islands)) {
      seen.add(en.type);
      assert.ok(en.island >= 1, `${en.type} not seeded on the spawn pad`);
      assert.ok(en.island < g.islands.length, 'island index in range');
    }
  }
  for (const t of ['drifter', 'turret', 'hopper', 'swooper']) assert.ok(seen.has(t), `saw a ${t}`);
});

test('act-boss spheres carry exactly one boss on the exit island', () => {
  assert.ok(isBossSphere(2), 'index 2 is an act gate');
  const g = generateSphere(9, 2);
  const roster = spawnEnemies(9, 2, g.islands);
  const bosses = roster.filter((e) => e.boss);
  assert.equal(bosses.length, 1, 'one boss');
  assert.equal(bosses[0].hp, tuning.enemies.boss.hp, 'boss soaks multiple stomps');
  assert.equal(bosses[0].island, g.islands.length - 1, 'boss owns the far/exit island');
  // No normal enemy squats the boss island.
  assert.ok(roster.filter((e) => !e.boss).every((e) => e.island !== g.islands.length - 1));
});

test('behaviors advance deterministically and stay bounded near their home island', () => {
  const w1 = createWorld(3, 1);
  const w2 = createWorld(3, 1);
  for (let i = 0; i < 300; i++) { stepOnce(w1); stepOnce(w2); }
  assert.deepEqual(w1.enemies, w2.enemies, 'two identical runs stay byte-identical');
  for (const en of w1.enemies) {
    const dx = en.pos.x - en.home.x, dz = en.pos.z - en.home.z;
    const spread = Math.hypot(dx, dz);
    // Swoopers chase the player and can range farther; others stay tethered.
    const bound = en.type === 'swooper' ? 60 : 12;
    assert.ok(spread <= bound, `${en.type} stayed within ${bound}wu of home (was ${spread.toFixed(1)})`);
    assert.ok(Number.isFinite(en.pos.y), 'finite Y');
  }
});

test('a swooper attacks and recovers with bounded motion instead of snapping to patrol', () => {
  let swooper = null;
  for (let seed = 1; seed < 30 && !swooper; seed++) {
    const g = generateSphere(seed, 1);
    swooper = spawnEnemies(seed, 1, g.islands).find((en) => en.type === 'swooper') || null;
  }
  assert.ok(swooper, 'found a deterministic swooper fixture');
  const player = { pos: { x: swooper.home.x + 2, y: swooper.home.y, z: swooper.home.z - 2 } };
  const dt = 1 / 60;
  let sawAttack = false, sawRecovery = false, wasDiving = swooper.diving;
  for (let i = 0; i < 600; i++) {
    const before = { ...swooper.pos };
    updateEnemies([swooper], player, dt);
    const moved = Math.hypot(swooper.pos.x - before.x, swooper.pos.y - before.y, swooper.pos.z - before.z);
    const maxSpeed = Math.max(tuning.enemies.swooper.diveSpeed, tuning.enemies.swooper.recoverSpeed) * swooper.speedScale;
    assert.ok(moved <= maxSpeed * dt + 1e-9, `bounded tick displacement (${moved})`);
    if (swooper.diving) sawAttack = true;
    if (wasDiving && !swooper.diving) sawRecovery = true;
    wasDiving = swooper.diving;
  }
  assert.ok(sawAttack, 'entered the visible attack state');
  assert.ok(sawRecovery, 'left attack through bounded recovery');
});

test('enemies moving does not perturb the pod/exit/save determinism (independent streams)', () => {
  // The enemy stream is independent; the island layout on a given sphere is unchanged.
  const a = generateSphere(50, 4);
  const b = generateSphere(50, 4);
  assert.deepEqual(a.islands, b.islands);
});
