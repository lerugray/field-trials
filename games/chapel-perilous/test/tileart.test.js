import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTileArt, parseArt, ART_SIZE, TRANSPARENT, OVERLAY_IDS,
  terrainArtId, siteArtId, RAW,
} from '../src/engine/tileart.js';
import { TILES } from '../src/engine/tiles.js';

test('every authored tile compiles to a 16x16 shade matrix', () => {
  const art = createTileArt();
  for (const id of art.ids()) {
    const g = art.get(id);
    assert.equal(g.length, ART_SIZE, `${id} row count`);
    for (const row of g) {
      assert.equal(row.length, ART_SIZE, `${id} col count`);
      for (const s of row) {
        assert.ok(s === TRANSPARENT || (s >= 0 && s <= 6), `${id} shade ${s} in 0..6 or transparent`);
      }
    }
  }
});

test('all seven overworld terrain tiles have art and are fully opaque', () => {
  const art = createTileArt();
  for (const id of Object.keys(TILES)) {
    assert.ok(art.has(id), `art for terrain ${id}`);
    const g = art.get(terrainArtId(id));
    for (const row of g) for (const s of row) {
      assert.notEqual(s, TRANSPARENT, `terrain ${id} must be opaque`);
    }
  }
});

test('overlay tiles carry transparency and are flagged', () => {
  const art = createTileArt();
  for (const id of OVERLAY_IDS) {
    assert.ok(art.has(id), `overlay ${id} exists`);
    assert.ok(art.isOverlay(id), `${id} flagged overlay`);
    const flat = art.get(id).flat();
    assert.ok(flat.includes(TRANSPARENT), `${id} has transparent pixels`);
    assert.ok(flat.some((s) => s > 0), `${id} has drawn pixels`);
  }
});

test('city-mode tiles exist and are opaque full cells', () => {
  const art = createTileArt();
  for (const id of ['CITY_STREET', 'CITY_WALL', 'CITY_BUILDING', 'CITY_DOOR', 'CITY_GATE']) {
    assert.ok(art.has(id), `city tile ${id}`);
    for (const row of art.get(id)) for (const s of row) assert.notEqual(s, TRANSPARENT, `${id} opaque`);
  }
});

test('parseArt rejects wrong row count', () => {
  assert.throws(() => parseArt('bad', ['0'.repeat(16)]), /need 16 rows/);
});

test('parseArt rejects wrong column count', () => {
  const rows = Array.from({ length: 16 }, () => '0'.repeat(15));
  assert.throws(() => parseArt('bad', rows), /need 16 chars/);
});

test('parseArt rejects out-of-ramp characters', () => {
  const rows = Array.from({ length: 16 }, (_, y) => (y === 0 ? '9' + '0'.repeat(15) : '0'.repeat(16)));
  assert.throws(() => parseArt('bad', rows), /bad char/);
});

test('siteArtId routes chapel / city / dungeon distinctly', () => {
  assert.equal(siteArtId('dungeon', 'chapel-0'), 'SITE_CHAPEL');
  assert.equal(siteArtId('city', 'hive-5'), 'SITE_CITY');
  assert.equal(siteArtId('dungeon', 'waystation-23'), 'SITE_DUNGEON');
});

test('createTileArt.get throws on unknown id', () => {
  assert.throws(() => createTileArt().get('NOPE'), /unknown tile/);
});

test('RAW is stable authoring source for all art ids', () => {
  const art = createTileArt();
  assert.deepEqual(art.ids().sort(), Object.keys(RAW).sort());
});
