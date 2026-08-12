// The M10 final defect sweep, as a standing regression. Ties the whole QA harness
// together over a batch bigger than the per-feature tests but small enough to stay
// fast: fairness (no unavoidable hit / no dead stretch / reachable), route (no orphan
// / no dead end), determinism (same seed -> identical world), and boss winnability +
// dodge-lane fairness. The deep 3000-seed run lives in scripts/sweep.js; this is the
// gate that keeps the harness honest on every `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel } from '../src/world/level.js';
import { auditSeeds } from '../src/world/fairness.js';
import { buildRoute } from '../src/run/route.js';
import { BOSS, createBoss, clearGap, updateBoss, resolveBossHits } from '../src/combat/boss.js';
import { createProjectiles, spawnProjectile, stepProjectiles } from '../src/combat/projectiles.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => 'sweep-' + i);

test('fairness holds across a 300-seed batch (no unavoidable hit, no dead stretch)', () => {
  const r = auditSeeds(SEEDS, buildLevel);
  assert.ok(r.ok, `fairness failures: ${JSON.stringify(r.failures.slice(0, 3))}`);
  assert.ok(r.worstDeadGap <= 100, `worst dead gap ${r.worstDeadGap} exceeds bound`);
});

test('route reachability holds across a 300-seed batch (no orphan, no dead end)', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    const reach = new Set([r.startId]);
    for (const rank of r.ranks) for (const n of rank) if (reach.has(n.id)) for (const t of n.branches) reach.add(t);
    const canFinish = new Set([r.finalId]);
    for (let i = r.ranks.length - 1; i >= 0; i--)
      for (const n of r.ranks[i]) if (n.branches.some((t) => canFinish.has(t))) canFinish.add(n.id);
    for (const id of Object.keys(r.nodes)) {
      assert.ok(reach.has(id), `seed ${s}: ${id} orphaned`);
      assert.ok(canFinish.has(id), `seed ${s}: ${id} dead-ends`);
    }
  }
});

test('the world is deterministic: same seed builds an identical level and route', () => {
  for (const s of SEEDS.slice(0, 60)) {
    assert.equal(JSON.stringify(buildLevel(s)), JSON.stringify(buildLevel(s)), `level ${s} nondeterministic`);
    assert.equal(JSON.stringify(buildRoute(s)), JSON.stringify(buildRoute(s)), `route ${s} nondeterministic`);
  }
});

test('the boss is winnable and every live volley stays dodgeable, across threats', () => {
  for (const seed of ['sweep-0', 'sweep-1', 'sweep-2']) {
    for (const threat of [1, 2, 3]) {
      const boss = createBoss(seed, { threat });
      const ship = { s: boss.s - BOSS.standoffS, lat: 0.4, vert: -0.2, radius: 0.7 };
      const pool = createProjectiles();
      const dt = 1 / 60;
      let fireCd = 0, t = 0, killed = false;
      for (; t < 90 && !killed; t += dt) {
        const out = updateBoss(boss, ship, dt);
        for (const b of out.bolts) {
          assert.ok(clearGap([{ lat: b.lat, vert: b.vert }]).clearance >= 0, `${seed}/t${threat}: unfair volley`);
          spawnProjectile(pool, { team: 'enemy', s: b.s, lat: b.lat, vert: b.vert });
        }
        fireCd -= dt;
        if (fireCd <= 0) { spawnProjectile(pool, { team: 'player', s: ship.s, lat: 0, vert: 0, aimLat: 0, aimVert: 0 }); fireCd = 0.14; }
        stepProjectiles(pool, dt);
        if (resolveBossHits(pool, boss, 1).killed) killed = true;
      }
      assert.ok(killed, `${seed}/threat ${threat}: boss not winnable`);
      assert.ok(t < 80, `${seed}/threat ${threat}: fight did not terminate`);
    }
  }
});
