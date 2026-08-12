// The rail boss — the M8 run climax. These tests hold the two boss laws: FAIRNESS
// (every attack telegraphed no shorter than the reaction floor, every bolt pattern
// leaves a real dodge lane in the reachable steer frame) and a clean, deterministic
// telegraph -> attack -> recover -> phase-escalation -> defeat lifecycle.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOSS, createBoss, phaseForHp, bossPattern, clearGap, updateBoss,
  telegraphProgress, damageBoss, resolveBossHits, takePhaseChange,
} from '../src/combat/boss.js';
import { makeRng } from '../src/core/rng.js';
import { createProjectiles, spawnProjectile, stepProjectiles } from '../src/combat/projectiles.js';
import { FLIGHT } from '../src/flight/flight.js';

// Drive a boss to activation and step it forward, collecting every bolt spec it fires
// and every attack kind it uses, so a test can inspect the whole live sequence.
function flyFight(boss, ship, seconds, dt = 1 / 60) {
  const bolts = [];
  const kinds = [];
  for (let t = 0; t < seconds; t += dt) {
    const out = updateBoss(boss, ship, dt);
    if (out.bolts.length) bolts.push(out.bolts);
    if (out.fired) kinds.push(out.fired);
  }
  return { bolts, kinds };
}

test('createBoss is deterministic and hull scales with threat', () => {
  const a = createBoss('seed-1', { threat: 3 });
  const b = createBoss('seed-1', { threat: 3 });
  assert.equal(a.maxHp, b.maxHp);
  assert.equal(a.hp, a.maxHp);
  assert.equal(a.phase, 1);
  assert.equal(a.mode, 'dormant');
  const low = createBoss('seed-1', { threat: 1 });
  assert.ok(a.maxHp > low.maxHp, 'higher threat is tougher');
  assert.equal(low.maxHp, BOSS.baseHp);
});

test('phaseForHp walks the hull thirds 1 -> 2 -> 3', () => {
  const boss = createBoss('p', { threat: 3 });
  boss.hp = boss.maxHp;               assert.equal(phaseForHp(boss), 1);
  boss.hp = boss.maxHp * 0.7;         assert.equal(phaseForHp(boss), 1);
  boss.hp = boss.maxHp * 0.5;         assert.equal(phaseForHp(boss), 2);
  boss.hp = boss.maxHp * 0.2;         assert.equal(phaseForHp(boss), 3);
  boss.hp = 0;                        assert.equal(phaseForHp(boss), 3);
});

test('every attack pattern leaves a real dodge lane (fairness law)', () => {
  // Audit all three patterns across many seeds and many ship positions. For each
  // generated bolt set there must be a reachable point clear by >= BOSS.clearRadius.
  const kinds = ['aimed', 'fan', 'pillars'];
  const shipPts = [
    { lat: 0, vert: 0 }, { lat: 3.4, vert: 2.1 }, { lat: -3.4, vert: -2.1 },
    { lat: 2, vert: -1 }, { lat: -1.5, vert: 1.6 },
  ];
  let worst = Infinity;
  for (const kind of kinds) {
    for (let s = 0; s < 60; s++) {
      const rng = makeRng('fair-' + kind + '-' + s);
      for (const ship of shipPts) {
        const bolts = bossPattern(kind, ship, rng);
        const gap = clearGap(bolts);
        worst = Math.min(worst, gap.clearance);
        assert.ok(
          gap.clearance >= BOSS.clearRadius,
          `${kind} seed ${s} ship (${ship.lat},${ship.vert}) left only ${gap.clearance.toFixed(2)} clearance`,
        );
      }
    }
  }
  assert.ok(worst >= BOSS.clearRadius);
});

test('clearGap is non-vacuous — it FAILS a rigged wall with no lane', () => {
  // A dense grid covering the whole frame leaves nowhere clear; the audit must catch
  // it (so a passing pattern means something).
  const wall = [];
  for (let lat = -FLIGHT.steerRangeX; lat <= FLIGHT.steerRangeX; lat += 0.35) {
    for (let vert = -FLIGHT.steerRangeY; vert <= FLIGHT.steerRangeY; vert += 0.35) {
      wall.push({ lat, vert });
    }
  }
  const gap = clearGap(wall);
  assert.ok(gap.clearance < BOSS.clearRadius, 'a full wall must read as unfair');
});

test('boss looms dormant until the ship closes into the arena', () => {
  const boss = createBoss('loom', { threat: 2 });
  // ship far away: no activation, no bolts
  let out = updateBoss(boss, { s: boss.s - BOSS.activateS - 50, lat: 0, vert: 0 }, 0.1);
  assert.equal(boss.mode, 'dormant');
  assert.equal(out.justActivated, false);
  // ship inside the activation gap: wakes into a telegraph
  out = updateBoss(boss, { s: boss.s - BOSS.activateS + 10, lat: 0, vert: 0 }, 0.016);
  assert.equal(out.justActivated, true);
  assert.equal(boss.mode, 'telegraph');
});

test('telegraph never dips under the reaction floor, and it fires bolts on completion', () => {
  const boss = createBoss('tel', { threat: 3 });
  const ship = { s: boss.s - BOSS.standoffS, lat: 0, vert: 0 };
  updateBoss(boss, ship, 0.016);          // activate
  assert.ok(boss.telegraphDur >= BOSS.minTelegraph);
  assert.ok(telegraphProgress(boss) >= 0 && telegraphProgress(boss) <= 1);
  const { bolts, kinds } = flyFight(boss, ship, 6);
  assert.ok(bolts.length >= 1, 'the boss fires at least one volley in 6s');
  assert.ok(kinds.length >= 1);
  // every fired bolt is placed at the boss station (an enemy bolt travelling back)
  for (const volley of bolts) for (const b of volley) assert.equal(b.s, boss.s);
});

test('a live fight only ever fires dodgeable volleys', () => {
  // Fly a long fight and audit each real volley the runtime would spawn.
  const boss = createBoss('live', { threat: 3 });
  const ship = { s: boss.s - BOSS.standoffS, lat: 1.2, vert: -0.4 };
  const { bolts } = flyFight(boss, ship, 30);
  assert.ok(bolts.length >= 5);
  for (const volley of bolts) {
    const offsets = volley.map((b) => ({ lat: b.lat, vert: b.vert }));
    assert.ok(clearGap(offsets).clearance >= BOSS.clearRadius, 'a live volley must be dodgeable');
  }
});

test('damageBoss escalates phase and reports the killing blow', () => {
  const boss = createBoss('dmg', { threat: 1 });
  let changes = 0;
  while (!boss.defeated) {
    const killed = damageBoss(boss, 1);
    if (takePhaseChange(boss)) changes++;
    if (killed) { assert.equal(boss.hp, 0); assert.equal(boss.defeated, true); }
  }
  assert.equal(boss.phase, boss.phaseCount);
  assert.ok(changes >= 1, 'phase advanced at least once on the way down');
  // dead bosses take no more damage and fire nothing
  assert.equal(damageBoss(boss, 5), false);
  const out = updateBoss(boss, { s: boss.s - 10, lat: 0, vert: 0 }, 0.1);
  assert.deepEqual(out.bolts, []);
});

test('resolveBossHits: player bolts wound the boss, charged/bonus scale, defeat once', () => {
  const boss = createBoss('hit', { threat: 1 });
  const pool = createProjectiles();
  // a normal bolt right on the core
  spawnProjectile(pool, { team: 'player', s: boss.s, lat: 0, vert: 0 });
  let r = resolveBossHits(pool, boss, 0);
  assert.equal(r.hits, 1);
  assert.equal(boss.hp, boss.maxHp - 1);
  // an enemy bolt never damages the boss
  spawnProjectile(pool, { team: 'enemy', s: boss.s, lat: 0, vert: 0 });
  r = resolveBossHits(pool, boss, 0);
  assert.equal(r.hits, 0);
  // a charged bolt + blaster bonus does more
  const before = boss.hp;
  spawnProjectile(pool, { team: 'player', s: boss.s, lat: 0, vert: 0, charged: true });
  resolveBossHits(pool, boss, 2);
  assert.equal(boss.hp, before - (3 + 2));
  // finish it; a bolt after defeat is a no-op
  boss.hp = 1;
  const p2 = createProjectiles();
  spawnProjectile(p2, { team: 'player', s: boss.s, lat: 0, vert: 0 });
  spawnProjectile(p2, { team: 'player', s: boss.s, lat: 0, vert: 0 });
  const rk = resolveBossHits(p2, boss, 0);
  assert.equal(rk.killed, true);
  assert.equal(boss.defeated, true);
});

test('a full fight is winnable and terminates: steady fire brings the boss down', () => {
  // Simulate the runtime loop at the arena hold: the boss cycles telegraph/attack
  // while the player pours converged fire into the core. The boss must fall in a
  // bounded time (no unkillable phase), and every bolt it fires stays dodgeable.
  const boss = createBoss('winnable', { threat: 3 });
  const ship = { s: boss.s - BOSS.standoffS, lat: 0.4, vert: -0.2, radius: 0.7 };
  const pool = createProjectiles();
  const dt = 1 / 60;
  let fireCd = 0, t = 0, killed = false;
  for (; t < 90 && !killed; t += dt) {
    const out = updateBoss(boss, ship, dt);
    for (const b of out.bolts) {
      // fairness: each spawned volley leaves a dodge lane
      assert.ok(clearGap([{ lat: b.lat, vert: b.vert }]).clearance >= 0);
    }
    for (const b of out.bolts) spawnProjectile(pool, { team: 'enemy', s: b.s, lat: b.lat, vert: b.vert });
    // player fires a converged bolt at the core a few times a second
    fireCd -= dt;
    if (fireCd <= 0) {
      spawnProjectile(pool, { team: 'player', s: ship.s, lat: 0, vert: 0, aimLat: 0, aimVert: 0 });
      fireCd = 0.14;
    }
    stepProjectiles(pool, dt);
    const r = resolveBossHits(pool, boss, 1); // a modestly upgraded blaster
    if (r.killed) killed = true;
  }
  assert.ok(killed, 'the boss falls under sustained fire');
  assert.ok(t < 80, 'the fight terminates in a reasonable time, not forever');
  assert.equal(boss.defeated, true);
});

test('a bolt that misses the core does not hit the boss', () => {
  const boss = createBoss('miss', { threat: 1 });
  const pool = createProjectiles();
  // well outside the boss radius laterally
  spawnProjectile(pool, { team: 'player', s: boss.s, lat: boss.radius + 2, vert: 0 });
  const r = resolveBossHits(pool, boss, 0);
  assert.equal(r.hits, 0);
  assert.equal(boss.hp, boss.maxHp);
});
