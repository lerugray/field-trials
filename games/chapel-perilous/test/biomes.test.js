import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBiomes } from '../src/engine/biomes.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createTileArt } from '../src/engine/tileart.js';
import { createEncounters } from '../src/engine/encounters.js';
import { createNames } from '../src/engine/names.js';
import { createWorld } from '../src/engine/world.js';
import { createWanderers } from '../src/engine/wanderers.js';
import { createGame } from '../src/main.js';
import encounterTables from '../data/encounters/tables.json' with { type: 'json' };
import phonemes from '../data/register/phonemes.json' with { type: 'json' };
import biomeData from '../data/world/biomes.json' with { type: 'json' };
import beings from '../data/bestiary/beings.json' with { type: 'json' };
import master from '../data/world/master.json' with { type: 'json' };

test('ships a small handful of guaranteed biomes (lean, not a map full)', () => {
  const biomes = createBiomes(biomeData);
  assert.ok(biomes.count >= 3 && biomes.count <= 8, `count ${biomes.count} in [3,8]`);
  assert.ok(biomes.has('perilous-verge'));
});

test('the Chapel Perilous site sits inside the perilous-verge biome', () => {
  const biomes = createBiomes(biomeData);
  const chapel = (master.sites || []).find((s) => /chapel/i.test((s.id || '') + ' ' + (s.name || '')));
  assert.ok(chapel, 'master.json has a chapel site');
  const b = biomes.biomeAt(chapel.x, chapel.y);
  assert.ok(b && b.id === 'perilous-verge', 'chapel is in the verge');
});

test('every biome center resolves to its own biome', () => {
  const biomes = createBiomes(biomeData);
  for (const b of biomes.list()) {
    assert.equal(biomes.biomeAt(b.center.x, b.center.y).id, b.id);
  }
});

test('biomeAt is deterministic and edge-accurate at the region border', () => {
  const biomes = createBiomes(biomeData);
  const b = biomes.get('salt-flats');
  const { x, y } = b.center;
  const r = b.radius;
  // On the corner of the square: inside. One cell beyond: outside (or another biome).
  assert.equal(biomes.biomeAt(x + r, y + r).id, b.id);
  assert.equal(biomes.biomeAt(x - r, y - r).id, b.id);
  const beyond = biomes.biomeAt(x + r + 1, y + r + 1);
  assert.ok(!beyond || beyond.id !== b.id);
  // deterministic
  assert.equal(biomes.biomeAt(x, y).id, biomes.biomeAt(x, y).id);
});

test('the open country between biomes has no biome', () => {
  const biomes = createBiomes(biomeData);
  // master.start is on open ground away from every region.
  assert.equal(biomes.biomeAt(master.start.x, master.start.y), null);
});

test('shipped biomes are pairwise disjoint (constructor enforces it)', () => {
  // If the shipped data ever overlaps, createBiomes throws — this asserts it does not.
  assert.doesNotThrow(() => createBiomes(biomeData));
});

test('overlapping biome regions are rejected by construction', () => {
  assert.throws(() => createBiomes({
    biomes: [
      { id: 'a', center: { x: 0, y: 0 }, radius: 2 },
      { id: 'b', center: { x: 3, y: 0 }, radius: 2 }, // gap 3 <= 2+2 => overlap
    ],
  }), /overlaps/);
});

test('adjacent-but-touching regions (gap = r1+r2+1) are allowed', () => {
  assert.doesNotThrow(() => createBiomes({
    biomes: [
      { id: 'a', center: { x: 0, y: 0 }, radius: 2 },
      { id: 'b', center: { x: 5, y: 0 }, radius: 2 }, // gap 5 > 4 => disjoint
    ],
  }));
});

test('duplicate ids and bad geometry are rejected', () => {
  assert.throws(() => createBiomes({ biomes: [
    { id: 'a', center: { x: 0, y: 0 }, radius: 1 },
    { id: 'a', center: { x: 9, y: 9 }, radius: 1 },
  ] }), /duplicate/);
  assert.throws(() => createBiomes({ biomes: [{ id: 'a', center: { x: 0.5, y: 0 }, radius: 1 }] }), /integer center/);
  assert.throws(() => createBiomes({ biomes: [{ id: 'a', center: { x: 0, y: 0 }, radius: 1, weirdness: 2 }] }), /weirdness/);
});

test('wanderer pools cross-validate against the bestiary when injected', () => {
  const bestiary = createBestiary(beings);
  assert.doesNotThrow(() => createBiomes(biomeData, { bestiary }));
  assert.throws(() => createBiomes({
    biomes: [{ id: 'a', center: { x: 0, y: 0 }, radius: 1, wanderers: ['no-such-being'] }],
  }, { bestiary }), /not in bestiary/);
});

test('every shipped biome dresses at least one tile and all dress art exists', () => {
  const tileArt = createTileArt();
  // Cross-validation passes for the real data (throws on a missing art id).
  assert.doesNotThrow(() => createBiomes(biomeData, { tileArt }));
  const biomes = createBiomes(biomeData);
  for (const b of biomes.list()) {
    assert.ok(Object.keys(b.dress).length > 0, `${b.id} dresses its terrain (art channel)`);
    for (const art of Object.values(b.dress)) assert.ok(tileArt.has(art), `art ${art} exists`);
  }
});

test('biome dressings are distinct art from the base terrain (they re-dress it)', () => {
  const biomes = createBiomes(biomeData);
  for (const b of biomes.list()) {
    for (const [base, art] of Object.entries(b.dress)) {
      assert.notEqual(base, art, `${b.id} ${base} draws a distinct variant, not itself`);
    }
  }
});

test('every biome names a real, distinct encounter table (monster/event channel)', () => {
  const bestiary = createBestiary(beings);
  const encounters = createEncounters(encounterTables, bestiary);
  assert.doesNotThrow(() => createBiomes(biomeData, { encounters }));
  const biomes = createBiomes(biomeData);
  const tables = new Set(biomes.list().map((b) => b.table));
  // Each biome has its OWN table (distinct mixes per biome), not one shared.
  assert.equal(tables.size, biomes.count, 'per-biome encounter tables are distinct');
  for (const t of tables) assert.ok(encounters.tables.includes(t), `table ${t} exists`);
});

test('biome-aware wanderers draw beasts from the local biome pool inside a region', () => {
  const bestiary = createBestiary(beings);
  const names = createNames(phonemes);
  // Open GRASS world so wandering isn't blocked by terrain; drop one biome at the
  // party's location whose pool is a single signature being.
  const world = createWorld({ seed: 1, chunkSize: 8, streamRadius: 2, noise: { octaves: 1, freq: 0.1 }, bands: [{ tile: 'GRASS', max: 1.01 }], sites: [] });
  const biomes = createBiomes({ biomes: [{ id: 'test', center: { x: 30, y: 30 }, radius: 12, wanderers: ['pine-warden'] }] });
  const w = createWanderers({ world, bestiary, names, biomes, seed: 3, count: 20, radius: 8 });
  w.populate(30, 30);
  const beasts = w.list().filter((m) => m.kind === 'beast');
  assert.ok(beasts.length > 0, 'some beasts spawned');
  for (const b of beasts) assert.equal(b.beingId, 'pine-warden', 'beast is from the biome pool');
});

test('a biome never wanders a sacred being even if listed', () => {
  const bestiary = createBestiary(beings);
  const names = createNames(phonemes);
  const world = createWorld({ seed: 2, chunkSize: 8, streamRadius: 2, noise: { octaves: 1, freq: 0.1 }, bands: [{ tile: 'GRASS', max: 1.01 }], sites: [] });
  // A biome that lists ONLY a sacred being falls back to the global pool (no sacred wanderers).
  const biomes = createBiomes({ biomes: [{ id: 'test', center: { x: 30, y: 30 }, radius: 12, wanderers: ['verge-antibody'] }] });
  const w = createWanderers({ world, bestiary, names, biomes, seed: 3, count: 20, radius: 8 });
  w.populate(30, 30);
  for (const m of w.list()) if (m.kind === 'beast') assert.notEqual(m.beingId, 'verge-antibody', 'sacred never wanders');
});

test('the ground line inside a biome is register/vibe flavored (weirdness-scaled)', () => {
  const game = createGame(master);
  const b = game.biomes.get('salt-flats');
  const line = game.describeBiomeGround(b, b.center.x, b.center.y);
  assert.ok(line.startsWith('[SEED] '), 'generated + [SEED]-marked');
  // Deterministic per (biome, cell).
  assert.equal(line, game.describeBiomeGround(b, b.center.x, b.center.y));
});

test('overworldStep is deterministic and rolls the local biome table (events channel)', () => {
  const game = createGame(master);
  const verge = game.biomes.get('perilous-verge');
  game.party.moveTo(verge.center.x, verge.center.y);
  const a = game.overworldStep();
  const b = game.overworldStep();
  assert.equal(a.biome.id, 'perilous-verge');
  // Same cell + tick => identical roll (no scaling, no pity — pure of position).
  assert.deepEqual(a.enc, b.enc);
  assert.equal(a.note, b.note);
  // The invisible tail STAYS (both-layers lock): the roll produces a real
  // encounter descriptor kind (or null), never a scaled one.
  if (a.enc) assert.ok(['fight', 'cache', 'none'].includes(a.enc.kind));
});

test('overworldStep in open country falls back to the generic overworld table', () => {
  const game = createGame(master);
  game.party.moveTo(master.start.x, master.start.y);
  const ev = game.overworldStep();
  assert.equal(ev.biome, null, 'start is open country');
  assert.equal(ev.note, '', 'no biome ambient event in open country');
});

test('dressFor returns the biome art override or the fallback', () => {
  const biomes = createBiomes({
    biomes: [{ id: 'a', center: { x: 0, y: 0 }, radius: 1, dress: { GRASS: 'SALT' } }],
  });
  const a = biomes.get('a');
  assert.equal(biomes.dressFor(a, 'GRASS', 'GRASS'), 'SALT');
  assert.equal(biomes.dressFor(a, 'WATER', 'WATER'), 'WATER');
  assert.equal(biomes.dressFor(null, 'GRASS', 'GRASS'), 'GRASS');
});
