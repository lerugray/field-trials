// M5.1 — the branching route graph. The map is the run's spine, so its structure
// is a fairness contract: no orphan node, no dead end, the final always reachable,
// and the whole thing deterministic from the seed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoute, branchesOf, ROUTE, REWARD_HINTS } from '../src/run/route.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => 'route-seed-' + i);

test('a route has between minLevels and maxLevels ranks', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    assert.ok(r.levels >= ROUTE.minLevels && r.levels <= ROUTE.maxLevels,
      `seed ${s}: levels ${r.levels} out of range`);
    assert.equal(r.ranks.length, r.levels);
  }
});

test('start and final ranks are single nodes; middle ranks fan out', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    assert.equal(r.ranks[0].length, 1, `seed ${s}: start rank not single`);
    assert.equal(r.ranks[r.levels - 1].length, 1, `seed ${s}: final rank not single`);
    assert.equal(r.ranks[0][0].id, r.startId);
    assert.equal(r.ranks[r.levels - 1][0].id, r.finalId);
    for (let i = 1; i < r.levels - 1; i++) {
      const w = r.ranks[i].length;
      assert.ok(w >= ROUTE.midWidthMin && w <= ROUTE.midWidthMax,
        `seed ${s}: middle rank ${i} width ${w}`);
    }
  }
});

test('every non-final node has 1..maxBranch forward branches, all valid ids', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    for (const rank of r.ranks) {
      for (const n of rank) {
        if (n.rank === r.levels - 1) {
          assert.equal(n.branches.length, 0, `seed ${s}: final node ${n.id} has branches`);
          continue;
        }
        assert.ok(n.branches.length >= 1 && n.branches.length <= ROUTE.maxBranch,
          `seed ${s}: node ${n.id} branch count ${n.branches.length}`);
        // no duplicate edges; every target is a real node one rank ahead
        assert.equal(new Set(n.branches).size, n.branches.length, `seed ${s}: dup branch on ${n.id}`);
        for (const t of n.branches) {
          const tn = r.nodes[t];
          assert.ok(tn, `seed ${s}: node ${n.id} -> missing ${t}`);
          assert.equal(tn.rank, n.rank + 1, `seed ${s}: edge ${n.id}->${t} skips a rank`);
        }
      }
    }
  }
});

test('no orphans and no dead ends: every node reachable from start AND reaches final', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    // forward reachability from start
    const reach = new Set([r.startId]);
    for (let rk = 0; rk < r.levels; rk++) {
      for (const n of r.ranks[rk]) {
        if (!reach.has(n.id)) continue;
        for (const t of n.branches) reach.add(t);
      }
    }
    for (const id of Object.keys(r.nodes)) {
      assert.ok(reach.has(id), `seed ${s}: node ${id} unreachable from start (orphan)`);
    }
    // every node can reach the final (walk ranks backward)
    const canFinish = new Set([r.finalId]);
    for (let rk = r.levels - 2; rk >= 0; rk--) {
      for (const n of r.ranks[rk]) {
        if (n.branches.some((t) => canFinish.has(t))) canFinish.add(n.id);
      }
    }
    for (const id of Object.keys(r.nodes)) {
      assert.ok(canFinish.has(id), `seed ${s}: node ${id} is a dead end (cannot reach final)`);
    }
  }
});

test('threat reads 1..maxThreat and the final node is the hardest read', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    for (const id of Object.keys(r.nodes)) {
      const t = r.nodes[id].threat;
      assert.ok(t >= 1 && t <= ROUTE.maxThreat, `seed ${s}: node ${id} threat ${t}`);
    }
    assert.equal(r.nodes[r.finalId].threat, ROUTE.maxThreat,
      `seed ${s}: final node threat not max`);
  }
});

test('every node has a valid reward hint and a distinct level seed', () => {
  for (const s of SEEDS) {
    const r = buildRoute(s);
    const seeds = new Set();
    for (const id of Object.keys(r.nodes)) {
      const n = r.nodes[id];
      assert.ok(REWARD_HINTS.includes(n.hint), `seed ${s}: node ${id} bad hint ${n.hint}`);
      assert.ok(n.levelSeed && !seeds.has(n.levelSeed), `seed ${s}: dup level seed ${n.levelSeed}`);
      seeds.add(n.levelSeed);
      assert.ok(n.sectorName && n.sectorId, `seed ${s}: node ${id} missing sector`);
    }
  }
});

test('deterministic: same seed -> identical route', () => {
  const a = buildRoute('determinism-check');
  const b = buildRoute('determinism-check');
  assert.deepEqual(a, b);
  const c = buildRoute('different');
  assert.notDeepEqual(a.nodes, c.nodes);
});

test('branchesOf returns the destination node objects', () => {
  const r = buildRoute('branches-check');
  const start = r.nodes[r.startId];
  const outs = branchesOf(r, r.startId);
  assert.equal(outs.length, start.branches.length);
  for (const o of outs) assert.equal(o.rank, 1);
  assert.deepEqual(branchesOf(r, 'no-such-id'), []);
});
