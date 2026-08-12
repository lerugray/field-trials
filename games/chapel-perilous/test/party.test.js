import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/engine/world.js';
import { createParty, DIRS } from '../src/engine/party.js';

// A tiny hand-authored world config with a known layout, so movement/collision
// assertions don't depend on the procedural seed. One passable band, one blocked.
function flatWorld(sites = []) {
  // fbm never returns exactly extremes; use a single band that catches all
  // elevations as GRASS (passable) so we can reason about the grid, then rely
  // on sites + an injected blocker via a second band is unnecessary here.
  return createWorld({
    seed: 1,
    chunkSize: 8,
    streamRadius: 1,
    noise: { octaves: 1, freq: 0.1 },
    bands: [{ tile: 'GRASS', max: 1.01 }],
    sites,
  });
}

test('party moves in each cardinal direction on open ground', () => {
  const w = flatWorld();
  const p = createParty(w, { x: 4, y: 4 });
  assert.deepEqual(p.pos, { x: 4, y: 4 });

  const s = p.tryMove('S');
  assert.equal(s.moved, true);
  assert.deepEqual(p.pos, { x: 4, y: 5 });

  p.tryMove('E');
  assert.deepEqual(p.pos, { x: 5, y: 5 });
  p.tryMove('N');
  p.tryMove('W');
  assert.deepEqual(p.pos, { x: 4, y: 4 });
});

test('DIRS vectors are unit cardinal steps', () => {
  assert.deepEqual(DIRS.N, { dx: 0, dy: -1 });
  assert.deepEqual(DIRS.S, { dx: 0, dy: 1 });
  assert.deepEqual(DIRS.E, { dx: 1, dy: 0 });
  assert.deepEqual(DIRS.W, { dx: -1, dy: 0 });
});

test('collision blocks movement into impassable terrain and preserves position', () => {
  // Two bands: low elevation -> WATER (blocked), high -> HILL (passable).
  // With a real seed some neighbour tiles will be water; find one and try to enter it.
  const w = createWorld({
    seed: 2323,
    chunkSize: 16,
    streamRadius: 1,
    noise: { octaves: 4, freq: 0.07, lacunarity: 2, gain: 0.5 },
    bands: [
      { tile: 'WATER', max: 0.45 },
      { tile: 'GRASS', max: 1.01 },
    ],
  });

  // Scan for an open tile that has a blocked orthogonal neighbour.
  let found = null;
  for (let gy = 0; gy < 40 && !found; gy++) {
    for (let gx = 0; gx < 40 && !found; gx++) {
      if (!w.passable(gx, gy)) continue;
      for (const [dir, d] of Object.entries(DIRS)) {
        if (!w.passable(gx + d.dx, gy + d.dy)) { found = { gx, gy, dir }; break; }
      }
    }
  }
  assert.ok(found, 'expected an open tile adjacent to blocked terrain');

  const p = createParty(w, { x: found.gx, y: found.gy });
  const before = p.pos;
  const res = p.tryMove(found.dir);
  assert.equal(res.moved, false);
  assert.ok(res.blocked, 'blocked target reported');
  assert.deepEqual(p.pos, before, 'position unchanged after a blocked move');
});

test('stepping onto a site reports it for entry', () => {
  const w = flatWorld([{ id: 'chapel-0', x: 5, y: 4, kind: 'dungeon', name: '[SEED] Chapel' }]);
  const p = createParty(w, { x: 4, y: 4 });
  assert.equal(p.site(), null);
  const res = p.tryMove('E');
  assert.equal(res.moved, true);
  assert.ok(res.site, 'site returned on the move that entered it');
  assert.equal(res.site.id, 'chapel-0');
  assert.equal(p.site().id, 'chapel-0');
});

test('a site on blocked terrain is still steppable (site overlays terrain)', () => {
  // WATER everywhere; a site sits on water and must remain enterable.
  const w = createWorld({
    seed: 1,
    chunkSize: 8,
    streamRadius: 1,
    noise: { octaves: 1, freq: 0.1 },
    bands: [{ tile: 'WATER', max: 1.01 }],
    sites: [{ id: 'ark', x: 3, y: 3, kind: 'dungeon', name: '[SEED] Ark' }],
  });
  // Party starts on the site itself (nothing around it is passable otherwise).
  const p = createParty(w, { x: 3, y: 3 });
  assert.equal(w.passable(3, 3), true);
  // Cannot leave onto water.
  assert.equal(p.tryMove('N').moved, false);
});

test('tryMove rejects an unknown direction', () => {
  const w = flatWorld();
  const p = createParty(w, { x: 0, y: 0 });
  assert.throws(() => p.tryMove('NE'));
});
