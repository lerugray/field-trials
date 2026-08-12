// Structure Arc slice 1 (STRUCTURE-ARC-LOCKS-2026-08-05.md LOCK 1/2/3) — the
// manual's fixed operations questline: per-world dungeon assignment (nearest-to-
// farthest from spawn, never touching placement itself), sequential display
// status read off the EXISTING session.clearedSites() signal, and isChapelSite
// as the single source of truth for LOCK 3's "the Chapel."
import test from 'node:test';
import assert from 'node:assert/strict';
import { createManual, orderDungeonSites } from '../src/engine/manual.js';
import { DUNGEON_SITE_COUNT } from '../src/engine/worldgen.js';
import opData from '../data/operations.json' with { type: 'json' };

function fakeWorld(sites) {
  return { listSites: () => sites };
}
function fakeSession(clearedIds = []) {
  const cleared = new Set(clearedIds);
  return {
    clearedSites: () => [...cleared],
    clearSite: (id) => cleared.add(id),
  };
}
function dungeonSites(n, start = { x: 5, y: 5 }) {
  // Placed out of nearest-to-farthest order on purpose, to exercise the sort.
  const offsets = [3, 1, 4, 0, 2, 5, 6].slice(0, n);
  return offsets.map((d, i) => ({ id: `dungeon-${i}`, x: start.x + d, y: start.y, kind: 'dungeon', name: `[SEED] site ${i}` }));
}

test('data/operations.json is shaped for the shipped world (5 ops, one per DUNGEON_SITE_COUNT dungeon)', () => {
  assert.equal(opData.operations.length, DUNGEON_SITE_COUNT, 'operation count should track worldgen.js DUNGEON_SITE_COUNT');
  const slots = opData.operations.map((o) => o.dungeonSlot).sort((a, b) => a - b);
  assert.deepEqual(slots, Array.from({ length: DUNGEON_SITE_COUNT }, (_, i) => i), 'dungeonSlot must be 0..N-1, each used once');
  const numbers = opData.operations.map((o) => o.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: DUNGEON_SITE_COUNT }, (_, i) => i + 1), 'number must be 1..N, each used once');
  const finals = opData.operations.filter((o) => o.final);
  assert.equal(finals.length, 1, 'exactly one operation is flagged final (the Chapel)');
  assert.equal(finals[0].dungeonSlot, DUNGEON_SITE_COUNT - 1, 'the final operation must be the farthest dungeon slot');
  // Naming pass ran 2026-08-05 (Weiss, Ray-routed): titles/gates/intro are live copy now.
  // Guard the inverse of the old placeholder pin — no TBD marker may survive into shipped data.
  for (const op of opData.operations) {
    assert.ok(typeof op.title === 'string' && op.title.length > 0 && !/TBD/.test(op.title), `op ${op.number} title must be real copy, got "${op.title}"`);
    assert.ok(typeof op.gates === 'string' && op.gates.length > 0 && !/TBD/.test(op.gates), `op ${op.number} gates must be real copy, got "${op.gates}"`);
    assert.ok(typeof op.teaches === 'string' && op.teaches.length > 0, `op ${op.number} needs a real 'teaches' description`);
  }
  for (const beat of opData.introBeats) assert.ok(typeof beat === 'string' && beat.length > 0 && !/TBD/.test(beat), `intro beat must be real copy, got "${beat}"`);
});

test('orderDungeonSites sorts nearest -> farthest from start, id-tiebroken, ignoring non-dungeon sites', () => {
  const start = { x: 0, y: 0 };
  const sites = [
    { id: 'b', x: 5, y: 0, kind: 'dungeon' },
    { id: 'a', x: 5, y: 0, kind: 'dungeon' }, // same distance as 'b' -> id tiebreak
    { id: 'town', x: 1, y: 0, kind: 'city' }, // must be excluded
    { id: 'near', x: 1, y: 0, kind: 'dungeon' },
  ];
  const ordered = orderDungeonSites(sites, start);
  assert.deepEqual(ordered.map((s) => s.id), ['near', 'a', 'b']);
});

test('list() assigns operations to sites nearest-first and reads status off session.clearedSites()', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(5, start);
  const ordered = orderDungeonSites(sites, start);
  const world = fakeWorld(sites);
  const session = fakeSession();
  const manual = createManual(opData, { world, session, start });

  const rows = manual.list();
  assert.equal(rows.length, 5);
  rows.forEach((r, i) => assert.equal(r.site.id, ordered[i].id, `operation ${r.number} should point at the ${i}-th nearest dungeon`));
  assert.equal(rows[0].status, 'active');
  for (const r of rows.slice(1)) assert.equal(r.status, 'locked');

  session.clearSite(ordered[0].id);
  const rows2 = manual.list();
  assert.equal(rows2[0].status, 'complete');
  assert.equal(rows2[1].status, 'active');
  for (const r of rows2.slice(2)) assert.equal(r.status, 'locked');
});

test('isChapelSite is true only for the final operation\'s (farthest) dungeon site', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(5, start);
  const ordered = orderDungeonSites(sites, start);
  const manual = createManual(opData, { world: fakeWorld(sites), session: fakeSession(), start });

  assert.equal(manual.isChapelSite(ordered[ordered.length - 1]), true);
  for (const s of ordered.slice(0, -1)) assert.equal(manual.isChapelSite(s), false);
  assert.equal(manual.chapelSite().id, ordered[ordered.length - 1].id);
});

test('authoredLayoutFor: every operation site carries its authored interior (set completed 2026-08-06)', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(5, start);
  const ordered = orderDungeonSites(sites, start);
  const manual = createManual(opData, { world: fakeWorld(sites), session: fakeSession(), start });

  // LOCK 2 fully realized: authored layouts for all five operations, nearest -> farthest.
  ordered.forEach((s, i) => assert.equal(manual.authoredLayoutFor(s), `operation-${i + 1}`));
  assert.equal(manual.authoredLayoutFor(null), null);
  assert.equal(manual.authoredLayoutFor({ id: 'not-a-real-site', kind: 'dungeon' }), null);
});

test('operationForSite round-trips with siteFor via list()', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(5, start);
  const manual = createManual(opData, { world: fakeWorld(sites), session: fakeSession(), start });
  const rows = manual.list();
  for (const r of rows) {
    const op = manual.operationForSite(r.site);
    assert.equal(op.number, r.number);
  }
});

test('a world with FEWER dungeon sites than operations degrades gracefully (no crash, unassigned ops stay incomplete)', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(2, start); // only 2 of the 5 slots have a real site
  const manual = createManual(opData, { world: fakeWorld(sites), session: fakeSession(), start });
  const rows = manual.list();
  assert.equal(rows.length, 5);
  assert.ok(rows[0].site && rows[1].site);
  for (const r of rows.slice(2)) assert.equal(r.site, null);
  assert.equal(manual.chapelSite(), null, 'the final op has no assigned site in this degenerate world');
});

test('canEnter/passable gate locked operations; cities and the active op stay open', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(5, start);
  const ordered = orderDungeonSites(sites, start);
  const session = fakeSession();
  const manual = createManual(opData, { world: fakeWorld(sites), session, start });
  const town = { id: 'town', x: 9, y: 9, kind: 'city' };

  assert.equal(manual.canEnter(ordered[0]), true);
  assert.equal(manual.passable(ordered[0]), true);
  assert.equal(manual.canEnter(ordered[1]), false);
  assert.equal(manual.passable(ordered[4]), false);
  assert.equal(manual.canEnter(town), true);
  assert.ok(manual.denyReason(ordered[1]));

  session.clearSite(ordered[0].id);
  assert.equal(manual.canEnter(ordered[1]), true);
  assert.equal(manual.canEnter(ordered[4]), false, 'Chapel needs all prior ops');
  for (const s of ordered.slice(0, 4)) session.clearSite(s.id);
  assert.equal(manual.canEnter(ordered[4]), true);
});

test('summary() reports completed/total and the active operation title', () => {
  const start = { x: 5, y: 5 };
  const sites = dungeonSites(5, start);
  const ordered = orderDungeonSites(sites, start);
  const session = fakeSession();
  const manual = createManual(opData, { world: fakeWorld(sites), session, start });
  assert.deepEqual(manual.summary(), { completed: 0, total: 5, activeTitle: opData.operations[0].title });
  session.clearSite(ordered[0].id);
  assert.deepEqual(manual.summary(), { completed: 1, total: 5, activeTitle: opData.operations[1].title });
});
