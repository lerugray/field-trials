// M10 final defect sweep — runs the standing QA harness at SCALE, offline, well past
// what the fast per-feature tests cover, and prints one report. Not part of `node
// --test` (kept fast); this is the deep batch the operator can re-run any time:
//
//   node scripts/sweep.js [seedCount]
//
// It audits the two fairness laws over a big seed batch, route reachability (no
// orphan / no dead end), boss winnability + dodge-lane fairness across threats, and
// determinism (same seed -> identical world). Currency integrity + the wingmate-death
// lifecycle are exhaustively fuzzed in test/ledger.test.js and test/wingmate-
// lifecycle.test.js and are summarized here by reference.

import { buildLevel } from '../src/world/level.js';
import { auditSeeds } from '../src/world/fairness.js';
import { buildRoute } from '../src/run/route.js';
import {
  BOSS, createBoss, clearGap, updateBoss, resolveBossHits,
} from '../src/combat/boss.js';
import { createProjectiles, spawnProjectile, stepProjectiles }
  from '../src/combat/projectiles.js';

const N = Number(process.argv[2]) || 3000;
const seeds = Array.from({ length: N }, (_, i) => 'sweep-' + i);
let failures = 0;
const line = (ok, msg) => { console.log((ok ? '  ok  ' : ' FAIL ') + msg); if (!ok) failures++; };

console.log(`\nSTRAY SQUADRON — M10 defect sweep (${N} seeds)\n`);

// 1) Fairness: no unavoidable hit, no dead stretch, everything reachable — audited at
// EVERY route threat (S6 made harder branches actually field more), so the fairness
// laws are proven at the densest threat, not just the baseline.
for (const threat of [1, 2, 3]) {
  const fair = auditSeeds(seeds, (s) => buildLevel(s, undefined, undefined, null, threat));
  line(fair.ok, `fairness @threat ${threat} over ${N} seeds — ${fair.failures.length} failures, worst dead gap ${fair.worstDeadGap.toFixed(1)} (bound 100)`);
  if (!fair.ok) console.log('   e.g.', JSON.stringify(fair.failures.slice(0, 3)));
}

// 2) Route: no orphan (all reachable from start) and no dead end (all reach final).
let routeBad = 0;
for (const s of seeds) {
  const r = buildRoute(s);
  const reach = new Set([r.startId]);
  for (const rank of r.ranks) for (const n of rank) if (reach.has(n.id)) for (const t of n.branches) reach.add(t);
  const canFinish = new Set([r.finalId]);
  for (let i = r.ranks.length - 1; i >= 0; i--) for (const n of r.ranks[i]) if (n.branches.some((t) => canFinish.has(t))) canFinish.add(n.id);
  for (const id of Object.keys(r.nodes)) if (!reach.has(id) || !canFinish.has(id)) routeBad++;
}
line(routeBad === 0, `route reachability over ${N} seeds — ${routeBad} orphan/dead-end nodes`);

// 3) Determinism: the same seed builds an identical world (level + route).
let nondet = 0;
for (const s of seeds.slice(0, 500)) {
  if (JSON.stringify(buildLevel(s)) !== JSON.stringify(buildLevel(s))) nondet++;
  if (JSON.stringify(buildRoute(s)) !== JSON.stringify(buildRoute(s))) nondet++;
}
line(nondet === 0, `determinism over 500 seeds — ${nondet} nondeterministic builds`);

// 4) Boss: every live volley leaves a dodge lane, and a full fight is winnable and
//    terminates across threat levels (no unkillable phase).
function fightBoss(seed, threat) {
  const boss = createBoss(seed, { threat });
  const ship = { s: boss.s - BOSS.standoffS, lat: 0.4, vert: -0.2, radius: 0.7 };
  const pool = createProjectiles();
  const dt = 1 / 60;
  let fireCd = 0, t = 0, killed = false, unfair = 0;
  for (; t < 90 && !killed; t += dt) {
    const out = updateBoss(boss, ship, dt);
    for (const b of out.bolts) if (clearGap([{ lat: b.lat, vert: b.vert }]).clearance < 0) unfair++;
    for (const b of out.bolts) spawnProjectile(pool, { team: 'enemy', s: b.s, lat: b.lat, vert: b.vert });
    fireCd -= dt;
    if (fireCd <= 0) { spawnProjectile(pool, { team: 'player', s: ship.s, lat: 0, vert: 0, aimLat: 0, aimVert: 0 }); fireCd = 0.14; }
    stepProjectiles(pool, dt);
    if (resolveBossHits(pool, boss, 1).killed) killed = true;
  }
  return { killed, t, unfair };
}
let bossBad = 0, worstT = 0;
for (const s of seeds.slice(0, 40)) {
  for (const threat of [1, 2, 3]) {
    const r = fightBoss(s, threat);
    if (!r.killed || r.t >= 80 || r.unfair > 0) bossBad++;
    if (r.t > worstT) worstT = r.t;
  }
}
line(bossBad === 0, `boss winnable + fair over 40 seeds x 3 threats — ${bossBad} bad fights, slowest ${worstT.toFixed(1)}s`);

// 5) Referenced harnesses (exhaustive in node --test).
console.log('  ref  currency-integrity fuzz: test/ledger.test.js (4000-step shadow-model)');
console.log('  ref  wingmate-death lifecycle: test/wingmate-lifecycle.test.js (every phase boundary)');

console.log(`\n${failures === 0 ? 'SWEEP CLEAN' : 'SWEEP FOUND ' + failures + ' DEFECT(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
