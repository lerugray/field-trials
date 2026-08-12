// M12 E5 — NPC density as a signal. The visible-wanderer cap varies by region:
// fewer in quiet/safe country, more only where it's dangerous (high-weirdness biome
// or near a dungeon) or populated (near a town). Density becomes information.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createGame } from '../src/main.js';
import { createWanderers } from '../src/engine/wanderers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

test('the density classifier ranks dangerous > populated > safe', () => {
  const g = createGame(master);
  const sites = g.world.listSites();
  const dungeon = sites.find((s) => s.kind === 'dungeon');
  const city = sites.find((s) => s.kind === 'city');
  const danger = g.densityFor(dungeon.x, dungeon.y);   // on/near a dungeon
  const town = g.densityFor(city.x, city.y);            // near a town
  const safe = g.densityFor(g.start.x + 40, g.start.y + 40); // quiet open country
  assert.ok(danger > town && town > safe, `dangerous(${danger}) > populated(${town}) > safe(${safe})`);
  assert.equal(safe, 2, 'quiet country stays sparse (a signal, not noise)');
});

test('populate caps to the region target and culls the excess when it drops', () => {
  // A stub world where everything is walkable and far apart.
  const world = {
    passable: () => true, siteAt: () => null, gateAt: () => null,
    tileAt: () => ({ passable: true }),
  };
  const bestiary = { all: () => [{ id: 'rat', habitat: ['overworld'], name: 'r' }], has: () => true, get: () => ({ sacred: false, name: 'r' }), toCombatantSpec: () => ({}) };
  const names = { npcAt: () => 'someone' };
  let target = 5;
  const w = createWanderers({ world, bestiary, names, seed: 1, count: 6, densityFor: () => target });
  w.populate(0, 0);
  assert.ok(w.count <= 5, `filled to the dangerous cap (${w.count})`);
  // Drop the cap (walked into a safe region) → populate culls down.
  target = 2;
  w.populate(0, 0);
  assert.ok(w.count <= 2, `culled to the safe cap (${w.count})`);
});
