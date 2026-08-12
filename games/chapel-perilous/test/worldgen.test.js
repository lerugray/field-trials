// chp-worldgen lane: per-world seeds, procedural site placement, multi-world registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  generateWorldConfig,
  placeSites,
  deriveBoundsFromBiomes,
  DUNGEON_SITE_COUNT,
  CITY_SITE_COUNT,
  MIN_SITE_SPACING,
  MIN_START_DISTANCE,
} from '../src/engine/worldgen.js';
import { createWorldRegistry, REGISTRY_KEY, LEGACY_SAVE_KEY } from '../src/engine/worldregistry.js';
import { createWorld } from '../src/engine/world.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));
const biomeData = JSON.parse(readFileSync(resolve(root, 'data/world/biomes.json'), 'utf8'));

function memStorage() {
  const mem = new Map();
  return {
    getItem: (k) => mem.get(k) || null,
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

function cheby(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

test('same seed produces identical site lists (determinism)', () => {
  const cfg1 = generateWorldConfig(master, { seed: 123456, biomes: biomeData });
  const cfg2 = generateWorldConfig(master, { seed: 123456, biomes: biomeData });
  assert.deepEqual(cfg1.sites, cfg2.sites);
  // And the world built from it is identical in site coordinates.
  const w1 = createWorld(cfg1);
  const w2 = createWorld(cfg2);
  assert.deepEqual(w1.listSites(), w2.listSites());
});

test('different seeds produce different site lists', () => {
  const cfg1 = generateWorldConfig(master, { seed: 123456, biomes: biomeData });
  const cfg2 = generateWorldConfig(master, { seed: 654321, biomes: biomeData });
  const ids1 = cfg1.sites.map((s) => `${s.x},${s.y}`).sort();
  const ids2 = cfg2.sites.map((s) => `${s.x},${s.y}`).sort();
  assert.notDeepEqual(ids1, ids2, 'two different seeds should scatter sites differently');
});

test('procedural site counts match the tunable dials', () => {
  const cfg = generateWorldConfig(master, { seed: 1111, biomes: biomeData });
  const dungeons = cfg.sites.filter((s) => s.kind === 'dungeon');
  const cities = cfg.sites.filter((s) => s.kind === 'city');
  assert.equal(dungeons.length, DUNGEON_SITE_COUNT);
  assert.equal(cities.length, CITY_SITE_COUNT);
  assert.equal(cfg.sites.length, DUNGEON_SITE_COUNT + CITY_SITE_COUNT);
});

test('site spacing constraints hold across many seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const sites = placeSites(seed, master.start, biomeData);
    // Within-bounds.
    const bounds = deriveBoundsFromBiomes(biomeData);
    for (const s of sites) {
      assert.ok(s.x >= bounds.minX && s.x <= bounds.maxX, `${s.id} x ${s.x} in bounds`);
      assert.ok(s.y >= bounds.minY && s.y <= bounds.maxY, `${s.id} y ${s.y} in bounds`);
    }
    // Start distance.
    for (const s of sites) {
      assert.ok(cheby(s, master.start) >= MIN_START_DISTANCE,
        `${s.id} at ${s.x},${s.y} is at least ${MIN_START_DISTANCE} from start ${master.start.x},${master.start.y}`);
    }
    // Pairwise spacing.
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const d = cheby(sites[i], sites[j]);
        assert.ok(d >= MIN_SITE_SPACING,
          `sites ${sites[i].id} and ${sites[j].id} are ${d} apart (need >= ${MIN_SITE_SPACING})`);
      }
    }
  }
});

test('generated world config does not inherit the master seed', () => {
  const cfg = generateWorldConfig(master, { seed: 424242, biomes: biomeData });
  assert.notEqual(cfg.seed, master.seed);
  assert.equal(cfg.seed, 424242);
  // Bands/chunkSize/start are preserved from the base fixture.
  assert.deepEqual(cfg.bands, master.bands);
  assert.equal(cfg.chunkSize, master.chunkSize);
  assert.deepEqual(cfg.start, master.start);
});

test('registry round-trips records and assigns per-world save keys', () => {
  const storage = memStorage();
  const registry = createWorldRegistry(storage);
  const { registry: recs1, record: a } = registry.add([], 12345, 'alpha');
  registry.save(recs1);
  const { registry: recs2, record: b } = registry.add(recs1, 67890, 'beta');
  registry.save(recs2);

  const loaded = registry.load();
  assert.equal(loaded.length, 2);
  assert.ok(loaded.some((r) => r.id === a.id && r.seed === a.seed));
  assert.ok(loaded.some((r) => r.id === b.id && r.seed === b.seed));

  registry.saveWorldSave(a.id, { save: { version: 1, seed: a.seed }, scheme: 'amber' });
  registry.saveWorldSave(b.id, { save: { version: 1, seed: b.seed }, scheme: 'green' });

  const aSave = registry.loadWorldSave(a.id);
  const bSave = registry.loadWorldSave(b.id);
  assert.equal(aSave.save.seed, a.seed);
  assert.equal(bSave.save.seed, b.seed);
  assert.notEqual(aSave.save.seed, bSave.save.seed);

  // Keys are distinct.
  assert.notEqual(registry.worldSaveKey(a.id), registry.worldSaveKey(b.id));
});

test('registry migrates the legacy single-slot save without losing it', () => {
  const storage = memStorage();
  const legacyWrapper = { save: { version: 1, seed: 99999, party: { x: 7, y: 7 } }, scheme: 'amber' };
  storage.setItem(LEGACY_SAVE_KEY, JSON.stringify(legacyWrapper));

  const registry = createWorldRegistry(storage);
  const migrated = registry.migrateLegacy();
  assert.ok(migrated, 'legacy save becomes a world record');
  assert.equal(migrated.seed, 99999);

  // Legacy key is removed and save is now under the per-world key.
  assert.equal(storage.getItem(LEGACY_SAVE_KEY), null);
  const wrapper = registry.loadWorldSave(migrated.id);
  assert.ok(wrapper);
  assert.equal(wrapper.save.seed, 99999);
  assert.equal(wrapper.scheme, 'amber');

  // Registry contains the migrated world.
  const loaded = registry.load();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, migrated.id);
});

test('registry delete removes the record and its save', () => {
  const storage = memStorage();
  const registry = createWorldRegistry(storage);
  const { registry: recs, record } = registry.add([], 11111);
  registry.save(recs);
  registry.saveWorldSave(record.id, { save: { version: 1, seed: record.seed } });

  registry.deleteWorld(record.id);
  assert.equal(registry.load().length, 0);
  assert.equal(registry.loadWorldSave(record.id), null);
});

test('createGame with master fixture keeps the hand-authored sites as test fixture', () => {
  const w = createWorld(master);
  const ids = w.listSites().map((s) => s.id).sort();
  assert.deepEqual(ids, ['chapel-0', 'hive-5', 'waystation-23']);
});
