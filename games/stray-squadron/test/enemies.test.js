import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnemies, updateEnemies, activeEnemies, poseEnemy, updateEnemyFire,
  WAVE, ENEMY_KINDS, GUNNER_FIRE,
} from '../src/combat/enemies.js';
import { FLIGHT } from '../src/flight/flight.js';
import { createProjectiles } from '../src/combat/projectiles.js';

test('same seed builds the identical roster', () => {
  const a = createEnemies('run-3', 60, 600);
  const b = createEnemies('run-3', 60, 600);
  assert.deepEqual(a, b);
});

test('different seeds differ', () => {
  const a = createEnemies('run-3', 60, 600);
  const b = createEnemies('run-4', 60, 600);
  assert.notDeepEqual(a, b);
});

test('waves are clustered, not an even drip', () => {
  const list = createEnemies('waves', 60, 1400);
  // group by waveId and confirm multiple sizes >= 2 exist
  const byWave = new Map();
  for (const e of list) byWave.set(e.waveId, (byWave.get(e.waveId) || 0) + 1);
  assert.ok(byWave.size >= 3, 'several waves');
  for (const n of byWave.values()) {
    assert.ok(n >= WAVE.sizeMin && n <= WAVE.sizeMax, `wave size ${n} in range`);
  }
});

test('no combat before the first-wave start line', () => {
  const list = createEnemies('start', 60, 600);
  for (const e of list) assert.ok(e.s >= WAVE.firstS - WAVE.spreadS - 1e-9);
});

test('every enemy weaves inside the reachable steer frame (dodgeable)', () => {
  const list = createEnemies('dodge', 60, 1400);
  for (const e of list) {
    // sample the weave across a full period and confirm it never leaves the frame
    for (let t = 0; t < 12; t += 0.25) {
      e.t = t; poseEnemy(e);
      assert.ok(Math.abs(e.lat) <= FLIGHT.steerRangeX + 1e-9, `lat ${e.lat} in frame`);
      assert.ok(Math.abs(e.vert) <= FLIGHT.steerRangeY + 1e-9, `vert ${e.vert} in frame`);
    }
  }
});

test('kinds carry their stat block', () => {
  const list = createEnemies('kinds', 60, 1400);
  for (const e of list) {
    const k = ENEMY_KINDS[e.kind];
    assert.equal(e.maxHp, k.hp);
    assert.equal(e.radius, k.radius);
    assert.equal(e.score, k.score);
  }
});

test('update culls enemies passed well behind the ship', () => {
  const list = createEnemies('cull', 60, 400);
  const e0 = list[0];
  updateEnemies(list, e0.s + 100, 1 / 60); // ship far past it
  assert.equal(e0.alive, false);
});

test('activeEnemies returns only the near-ahead living set', () => {
  const list = createEnemies('active', 60, 1400);
  const shipS = 200;
  const near = activeEnemies(list, shipS, 220);
  for (const e of near) {
    assert.ok(e.alive);
    assert.ok(e.s > shipS - 14 && e.s < shipS + 220);
  }
});

test('a monster dt cannot over-advance the weave phase', () => {
  const list = createEnemies('bigdt', 60, 200);
  const before = list[0].t;
  updateEnemies(list, 0, 100);
  assert.ok(list[0].t - before <= 0.1 + 1e-9);
});

test('only gunners in range fire, and they aim at the player offset', () => {
  const gunner = { kind: 'gunner', alive: true, s: 80, lat: 2, vert: 1, fireCd: 0 };
  const drone = { kind: 'drone', alive: true, s: 80, lat: 0, vert: 0, fireCd: 0 };
  const proj = createProjectiles();
  const ship = { s: 60, lat: -0.5, vert: 0.3 }; // ahead=20, in range (and in visible fog range)
  const fired = updateEnemyFire([gunner, drone], ship, proj, 0.1);
  assert.equal(fired, 1, 'only the gunner fired');
  const bolt = proj.list[0];
  assert.equal(bolt.team, 'enemy');
  assert.equal(bolt.s, 80);
  assert.equal(bolt.lat, ship.lat, 'aimed at the player lateral');
  assert.equal(bolt.vert, ship.vert, 'aimed at the player vertical');
});

test('gunners out of range hold fire (fair — an arriving threat only)', () => {
  const far = { kind: 'gunner', alive: true, s: 400, lat: 0, vert: 0, fireCd: 0 };
  const past = { kind: 'gunner', alive: true, s: 61, lat: 0, vert: 0, fireCd: 0 };
  const proj = createProjectiles();
  const ship = { s: 60, lat: 0, vert: 0 };
  assert.equal(updateEnemyFire([far, past], ship, proj, 0.1), 0);
});

test('a gunner respects its fire interval', () => {
  const g = { kind: 'gunner', alive: true, s: 75, lat: 0, vert: 0, fireCd: 0 }; // ahead=15, in range
  const proj = createProjectiles();
  const ship = { s: 60, lat: 0, vert: 0 };
  let fired = 0;
  for (let i = 0; i < 60; i++) fired += updateEnemyFire([g], ship, proj, 1 / 60);
  // ~1s / interval — never a stream
  assert.ok(fired >= 1 && fired <= Math.ceil(1 / GUNNER_FIRE.interval) + 1, `paced fire, got ${fired}`);
});

test('gunners in the seeded roster start with a staggered cooldown', () => {
  const list = createEnemies('fire', 60, 1400);
  const gunners = list.filter((e) => e.kind === 'gunner');
  assert.ok(gunners.length > 0);
  const cds = new Set(gunners.map((g) => g.fireCd.toFixed(3)));
  assert.ok(cds.size > 1, 'not all in lockstep');
});
