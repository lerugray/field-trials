// M12 E4 — the forgiving opening (placement-only, no difficulty scalar). Its INTENTS
// are the testable contract (ADDENDUM #4): zero ambush-tail rolls inside the safe
// radius, no dungeon inside it, and 1-2 reachable caches guaranteed before any dungeon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createGame } from '../src/main.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

test('no dungeon site sits inside the start safe radius (intent)', () => {
  const g = createGame(master);
  const R = g.START_SAFE_RADIUS;
  const cheby = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const dungeons = g.world.listSites().filter((s) => s.kind === 'dungeon');
  for (const d of dungeons) {
    assert.ok(cheby(d, g.start) > R, `dungeon ${d.id} at cheby ${cheby(d, g.start)} must be outside the safe radius ${R}`);
  }
});

test('the ambush-tail never rolls inside the safe radius', () => {
  const g = createGame(master);
  // Walk the party across every tile in the safe radius and roll the tail at many
  // ticks; a fight must never surface inside it (caches/ambient are fine).
  const R = g.START_SAFE_RADIUS;
  let fights = 0, steps = 0;
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      const x = g.start.x + dx, y = g.start.y + dy;
      if (!g.world.passable(x, y)) continue;
      g.party.moveTo(x, y);
      for (let t = 0; t < 40; t++) { g.bumpTick(); const ev = g.overworldStep(); steps++; if (ev.enc && ev.enc.kind === 'fight') fights++; }
    }
  }
  assert.ok(steps > 0, 'exercised the safe region');
  assert.equal(fights, 0, 'zero ambush fights inside the safe radius');
});

test('the guaranteed starter caches are placed, reachable, and pay out once', () => {
  const g = createGame(master);
  const caches = g.starterCaches();
  assert.equal(caches.length, g.START_CACHE_COUNT, 'the promised number of caches exist');
  for (const c of caches) {
    assert.ok(g.nearStart(c.x, c.y), 'each cache is inside the safe radius');
    assert.ok(g.world.passable(c.x, c.y), 'each cache tile is reachable/walkable');
    assert.ok(!g.world.siteAt(c.x, c.y), 'a cache never overlaps a dungeon/city site');
  }
  // Stepping onto a starter cache yields it exactly once.
  const c0 = caches[0];
  g.party.moveTo(c0.x, c0.y);
  const first = g.overworldStep();
  assert.equal(first.enc && first.enc.kind, 'cache', 'the first visit pays out a cache');
  const second = g.overworldStep();
  assert.ok(!(second.enc && second.enc.kind === 'cache' && second.enc.artifact === c0.artifact), 'a taken starter cache does not repeat');
});
