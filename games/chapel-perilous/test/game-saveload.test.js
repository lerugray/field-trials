// Game-level save/load (M7 persistence). The journal engine's own serialize/
// restore is unit-tested in journal.test.js; this proves the SHELL's save/load —
// createGame().save()/load(), the JSON the browser persists to localStorage and
// the single-file build reuses — actually carries the journal (and tick/party)
// through a full JSON round-trip, so a filed/edited note survives a reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createGame } from '../src/main.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

test('game.save/load round-trips the journal through JSON (write + edit persist)', () => {
  const g = createGame(master);
  g.journal.write({ text: 'the door was where the map said it would be', where: 'The Chapel', when: g.tick });
  g.bumpTick();
  const second = g.journal.write({ text: 'the clerk stamped a form i never filled out', where: 'Waystation 23', when: g.tick });
  // revise an existing entry — the M7 "write AND edit" path
  g.journal.edit(second.id, 'the clerk stamped a form that already had my name');
  const beforeTexts = g.journal.raw().map((e) => e.text);
  const beforeTick = g.tick;

  const snap = JSON.parse(JSON.stringify(g.save())); // exactly what localStorage stores

  const g2 = createGame(master);               // a fresh run over the SAME world (seed matches)
  assert.equal(g2.journal.count(), 0, 'fresh game starts with an empty record');
  g2.load(snap);

  assert.equal(g2.journal.count(), beforeTexts.length, 'entry count restored');
  assert.deepEqual(g2.journal.raw().map((e) => e.text), beforeTexts, 'raw text (incl. the edit) restored verbatim');
  assert.equal(g2.tick, beforeTick, 'the run clock (the note when-stamp) restored');
});

test('the B1 event log is carried through save/load and old saves restore empty', () => {
  const g = createGame(master);
  g.logEvent('rest', { mode: 'overworld', outcome: 'camp 1→5 hp', seed: 3 });
  g.logEvent('combat', { mode: 'overworld', outcome: 'win', seed: 9 });
  const before = g.events.entries();
  assert.equal(before.length, 2);
  assert.equal(before[0].tick, g.tick, 'the game stamps the tick');

  const snap = JSON.parse(JSON.stringify(g.save()));
  const g2 = createGame(master);
  g2.load(snap);
  assert.deepEqual(g2.events.entries(), before, 'the record round-trips');

  // An old save with no events field restores to an empty log (migration-safe).
  const { events, ...legacy } = snap;
  const g3 = createGame(master);
  g3.logEvent('stale', { outcome: 'should be cleared on load' });
  g3.load(legacy);
  assert.equal(g3.events.size, 0, 'a save predating the event log loads clean');
});

test('a load from a different world is rejected (guards the journal too)', () => {
  const g = createGame(master);
  g.journal.write({ text: 'a note', where: 'here', when: 0 });
  const snap = g.save();
  const wrongWorld = { ...snap, seed: (snap.seed ^ 0x9999) >>> 0 };
  const g2 = createGame(master);
  assert.throws(() => g2.load(wrongWorld));
  assert.equal(g2.journal.count(), 0, 'a rejected load leaves the record untouched');
});

// cp-019/cp-020: the worldmap and dungeon minimap memories are world-persistent.
test('map memory round-trips through save/load and survives a simulated death', () => {
  const g = createGame(master);
  const site = g.world.listSites()[0];
  g.mapState.visit(g.party.x, g.party.y);
  g.mapState.knowSite(site);

  // Simulate a dungeon crawl that reveals a few cells and a cache.
  const dungeon = { serialize: () => ({ explored: ['0,0', '1,0'], features: [['1,0', { kind: 'cache' }]] }) };
  g.mapState.setDungeon(site, dungeon);

  const snap = JSON.parse(JSON.stringify(g.save()));

  // A fresh game in the same world loads the map memory back.
  const g2 = createGame(master);
  g2.load(snap);
  assert.equal(g2.mapState.isVisited(g.party.x, g.party.y), true, 'visited cell restored');
  assert.equal(g2.mapState.hasSite(site.x, site.y), true, 'known site restored');
  const back = g2.mapState.getDungeon(site);
  assert.ok(back.explored.includes('1,0'), 'dungeon explored cells restored');
  assert.equal(back.features[0][1].kind, 'cache', 'dungeon feature restored');

  // Simulate permadeath: the session resets but the world memory stays.
  const beforeVisited = g2.mapState.visited.size;
  const beforeSites = g2.mapState.sites.size;
  g2.session.die('test', g2.tick);
  assert.equal(g2.mapState.isVisited(g.party.x, g.party.y), true, 'map memory survives death');
  assert.equal(g2.mapState.sites.size, beforeSites, 'known sites survive death');
  assert.equal(g2.mapState.visited.size, beforeVisited, 'visited cells survive death');
});

test('a pre-map save loads clean with empty map memory', () => {
  const g = createGame(master);
  const snap = g.save();
  const { mapState, ...legacy } = snap;
  const g2 = createGame(master);
  g2.load(legacy);
  assert.equal(g2.mapState.visited.size, 0, 'old save has no visited cells');
  assert.equal(g2.mapState.sites.size, 0, 'old save has no known sites');
});
