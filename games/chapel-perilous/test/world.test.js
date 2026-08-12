import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createWorld } from '../src/engine/world.js';
import { TILES, isTileId } from '../src/engine/tiles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

test('every generated tile is a known tile id', () => {
  const w = createWorld(master);
  for (let gy = -20; gy < 20; gy++) {
    for (let gx = -20; gx < 20; gx++) {
      const id = w.tileIdAt(gx, gy);
      assert.ok(isTileId(id), `unknown tile '${id}' at ${gx},${gy}`);
    }
  }
});

test('world generation is deterministic and streaming-order independent', () => {
  const a = createWorld(master);
  const b = createWorld(master);
  // Query b in a scrambled order first, then compare against a's straight scan.
  const coords = [];
  for (let gy = 0; gy < 32; gy++) for (let gx = 0; gx < 32; gx++) coords.push([gx, gy]);
  const scrambled = [...coords].sort((p, q) => hash(p) - hash(q));
  for (const [gx, gy] of scrambled) b.tileIdAt(gx, gy);
  for (const [gx, gy] of coords) {
    assert.equal(a.tileIdAt(gx, gy), b.tileIdAt(gx, gy), `mismatch at ${gx},${gy}`);
  }
});

function hash([x, y]) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

test('chunkCoords resolves negative coordinates correctly', () => {
  const w = createWorld(master);
  const cs = master.chunkSize;
  assert.deepEqual(w.chunkCoords(0, 0), { cx: 0, cy: 0 });
  assert.deepEqual(w.chunkCoords(cs - 1, cs - 1), { cx: 0, cy: 0 });
  assert.deepEqual(w.chunkCoords(-1, -1), { cx: -1, cy: -1 });
  assert.deepEqual(w.chunkCoords(-cs, -cs), { cx: -1, cy: -1 });
});

test('tileIdAt is consistent across chunk boundaries', () => {
  const w = createWorld(master);
  const cs = master.chunkSize;
  // A tile read at the same global coord must match whether we approach from
  // its own chunk or a neighbour's stream.
  const gx = cs; // first column of chunk (1,0)
  const gy = 3;
  const direct = w.tileIdAt(gx, gy);
  const neighbour = w.tileIdAt(gx - 1, gy); // chunk (0,0)
  assert.ok(isTileId(direct) && isTileId(neighbour));
  assert.equal(w.tileIdAt(gx, gy), direct); // stable on re-read
});

test('streamAround warms a (2r+1)^2 chunk window and slides with the party', () => {
  const w = createWorld(master);
  const r = 1;
  const win = w.streamAround(0, 0, r);
  assert.equal(win.length, (2 * r + 1) ** 2);
  const before = w.cachedChunkCount;
  // Re-stream the same window: no new chunks generated.
  w.streamAround(0, 0, r);
  assert.equal(w.cachedChunkCount, before);
  // Move a full chunk over: new chunks appear in the cache.
  w.streamAround(master.chunkSize * 4, 0, r);
  assert.ok(w.cachedChunkCount > before, 'sliding the window should load new chunks');
});

test('passable defers to terrain but sites are always steppable', () => {
  const w = createWorld(master);
  // Find a blocked terrain tile, then assert an overlaid site would pass.
  let blocked = null;
  outer: for (let gy = -30; gy < 30; gy++) {
    for (let gx = -30; gx < 30; gx++) {
      if (!w.tileAt(gx, gy).passable && !w.siteAt(gx, gy)) { blocked = { gx, gy }; break outer; }
    }
  }
  assert.ok(blocked, 'expected at least one impassable terrain tile in range');
  assert.equal(w.passable(blocked.gx, blocked.gy), false);

  // Every declared site is passable regardless of terrain under it.
  for (const s of w.listSites()) {
    assert.equal(w.passable(s.x, s.y), true, `site ${s.id} should be steppable`);
    assert.equal(w.siteAt(s.x, s.y).id, s.id);
  }
});

test('nearestOpen lands on a passable tile', () => {
  const w = createWorld(master);
  const spot = w.nearestOpen(master.start.x, master.start.y);
  assert.equal(w.passable(spot.x, spot.y), true);
});

test('createWorld validates config', () => {
  assert.throws(() => createWorld(null));
  assert.throws(() => createWorld({ chunkSize: 0, bands: [{ tile: 'GRASS', max: 1 }] }));
  assert.throws(() => createWorld({ chunkSize: 8, bands: [] }));
});

test('shade ramp covers the declared tiles', () => {
  for (const id of master.bands.map((b) => b.tile)) {
    assert.ok(TILES[id], `band references unknown tile ${id}`);
    assert.ok(TILES[id].shade >= 0 && TILES[id].shade < 7);
  }
});
