// Structure Arc slice 1 (STRUCTURE-ARC-LOCKS-2026-08-05.md) — end-to-end
// integration through the REAL createGame()/enterSite() path, on a hand-built
// 5-dungeon world (not master.json's 2-site fixture, which can't exercise the
// dungeonSlot 0..4 assignment). Proves: Operation 1's site gets the authored
// interior with its guaranteed milestone; the world's ACTUAL Chapel (the
// manual's final operation, i.e. the FARTHEST dungeon) is detected and draws
// the harder 'chapel' encounter table EVEN WHEN its procedurally-templated
// name does not say "Chapel" — the exact gap the old id/name-only regex left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/main.js';
import { normalizeItem } from '../src/engine/items.js';

const BANDS = [
  { tile: 'DEEP', max: 0.30 }, { tile: 'WATER', max: 0.38 }, { tile: 'SAND', max: 0.44 },
  { tile: 'GRASS', max: 0.62 }, { tile: 'FOREST', max: 0.74 }, { tile: 'HILL', max: 0.85 }, { tile: 'MOUNT', max: 1.01 },
];

function fiveDungeonConfig(seed = 4242) {
  const start = { x: 5, y: 5 };
  return {
    seed, chunkSize: 16, streamRadius: 1,
    noise: { octaves: 4, freq: 0.07, lacunarity: 2, gain: 0.5 },
    bands: BANDS,
    start,
    sites: [
      { id: 'dungeon-near', x: 6, y: 5, kind: 'dungeon', name: '[SEED] the Near Hollow' },
      { id: 'dungeon-b', x: 8, y: 5, kind: 'dungeon', name: '[SEED] the B Threshold' },
      { id: 'dungeon-c', x: 11, y: 5, kind: 'dungeon', name: '[SEED] Waystation C' },
      { id: 'dungeon-d', x: 15, y: 5, kind: 'dungeon', name: '[SEED] the D Gate' },
      // Deliberately NOT named "Chapel" anywhere — proves detection is no longer name-based.
      { id: 'dungeon-far', x: 30, y: 5, kind: 'dungeon', name: '[SEED] Waystation Ultima' },
      { id: 'town-0', x: 9, y: 9, kind: 'city', name: '[SEED] a town' },
    ],
    gates: [],
  };
}

test('the manual assigns 5 operations to the 5 dungeon sites, nearest-first, Operation 1 authored', () => {
  const g = createGame(fiveDungeonConfig());
  const rows = g.manual.list();
  assert.equal(rows.length, 5);
  assert.equal(rows[0].site.id, 'dungeon-near');
  assert.equal(rows[0].authoredLayout, 'operation-1');
  assert.equal(rows[4].site.id, 'dungeon-far', 'the farthest dungeon is the final operation');
  assert.equal(rows[0].status, 'active');
  for (const r of rows.slice(1)) assert.equal(r.status, 'locked');
});

test('entering Operation 1\'s site yields the authored dungeon (not procedural), and its milestone is reachable + grants an item once', () => {
  const g = createGame(fiveDungeonConfig());
  const site = g.world.listSites().find((s) => s.id === 'dungeon-near');
  const run = g.enterSite(site);
  assert.ok(run.dungeon.spawnCells, 'Operation 1 should assemble the authored interior');
  assert.equal(run.chapel, false);
  assert.equal(run.table, 'operation_1');

  const before = g.session.items().length;
  const m = run.dungeon.milestones[0];
  const got = run.dungeon.takeMilestoneAt(m.x, m.y);
  assert.ok(got);
  g.session.addItem(normalizeItem({ kind: got.kind, name: got.description, artifact: got.artifact, tags: got.tags }));
  assert.equal(g.session.items().length, before + 1);
  assert.equal(run.dungeon.takeMilestoneAt(m.x, m.y), null, 'a second visit to the same tile grants nothing more');
});

test('the world\'s ACTUAL Chapel (farthest dungeon) is detected without relying on its name, and draws the harder table', () => {
  const g = createGame(fiveDungeonConfig());
  const farSite = g.world.listSites().find((s) => s.id === 'dungeon-far');
  assert.doesNotMatch(farSite.name + ' ' + farSite.id, /chapel/i, 'sanity: this site\'s name really does not say Chapel');
  assert.equal(g.manual.isChapelSite(farSite), true);
  assert.equal(g.manual.canEnter(farSite), false, 'Chapel stays locked until prior operations clear');

  // Clear ops 1..4 so the final operation becomes active, then enter.
  for (const id of ['dungeon-near', 'dungeon-b', 'dungeon-c', 'dungeon-d']) g.session.clearSite(id);
  assert.equal(g.manual.canEnter(farSite), true);
  const run = g.enterSite(farSite);
  assert.equal(run.chapel, true, 'isChapel() must resolve true via the manual, not the name');
  assert.equal(run.table, 'chapel', 'pickTable() must also route through isChapel(), not its own regex');
});

test('a mid-sequence dungeon is now AUTHORED (interiors set completed 2026-08-06) but not the Chapel', () => {
  // Supersedes the slice-1 pin ("stays fully procedural"): LOCK 2's endgame was always
  // authored interiors for every operation; ops 2-5 landed 2026-08-06. Contents still
  // randomize within authored budgets - only the layout is fixed.
  const g = createGame(fiveDungeonConfig());
  const midSite = g.world.listSites().find((s) => s.id === 'dungeon-b');
  assert.equal(g.manual.canEnter(midSite), false, 'op 2 is locked until op 1 clears');
  g.session.clearSite('dungeon-near');
  const run = g.enterSite(midSite);
  assert.notEqual(run.dungeon.spawnCells, undefined, 'mid-sequence interiors are authored now');
  assert.equal(run.chapel, false);
  assert.equal(run.table, 'operation_2');
});

test('a site literally named "Chapel" that is NOT the manual\'s final operation still trips the id/name fallback', () => {
  // Regression for the historical behavior this replaces: the fallback stays live
  // for the master.json test fixture and any hand-built/legacy site.
  const cfg = fiveDungeonConfig();
  cfg.sites[1] = { ...cfg.sites[1], id: 'chapel-red-herring', name: '[SEED] the Chapel of Errors' };
  const g = createGame(cfg);
  const site = g.world.listSites().find((s) => s.id === 'chapel-red-herring');
  g.session.clearSite('dungeon-near'); // unlock op 2 (this site's slot)
  const run = g.enterSite(site);
  assert.equal(run.chapel, true, 'the regex fallback still catches a legacy/hand-named Chapel site');
});

test('Structure Arc gates entry: locked ops refuse enterSite; clearing prior unlocks the next', () => {
  const g = createGame(fiveDungeonConfig());
  const op1 = g.world.listSites().find((s) => s.id === 'dungeon-near');
  const op2 = g.world.listSites().find((s) => s.id === 'dungeon-b');
  const chapel = g.world.listSites().find((s) => s.id === 'dungeon-far');
  const town = g.world.listSites().find((s) => s.id === 'town-0');

  assert.equal(g.manual.passable(op1), true);
  assert.equal(g.canEnterSite(op1), true);
  assert.equal(g.sitePassable(op2), false);
  assert.equal(g.passable(op2.x, op2.y), false, 'locked operation tile gates overworld movement');
  assert.equal(g.canEnterSite(chapel), false);
  assert.equal(g.canEnterSite(town), true, 'cities are never gated by the manual');

  assert.throws(() => g.enterSite(op2), (e) => e && e.code === 'OPERATION_LOCKED');
  assert.throws(() => g.enterSite(chapel), (e) => e && e.code === 'OPERATION_LOCKED');

  g.session.clearSite(op1.id);
  assert.equal(g.canEnterSite(op2), true);
  assert.equal(g.passable(op2.x, op2.y), true, 'clearing the prior operation opens the tile');
  assert.equal(g.canEnterSite(chapel), false, 'Chapel still needs every prior op');
  assert.doesNotThrow(() => g.enterSite(op2));

  for (const id of ['dungeon-b', 'dungeon-c', 'dungeon-d']) g.session.clearSite(id);
  assert.equal(g.canEnterSite(chapel), true);
  assert.doesNotThrow(() => g.enterSite(chapel));
});
