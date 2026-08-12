import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCity, createStroll, SERVICES } from '../src/engine/city.js';

function flood(city, from) {
  const seen = new Set();
  const stack = [from];
  const key = (x, y) => `${x},${y}`;
  while (stack.length) {
    const { x, y } = stack.pop();
    if (seen.has(key(x, y))) continue;
    if (!city.passable(x, y)) continue;
    seen.add(key(x, y));
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return seen;
}

test('a city assembles deterministically from its seed', () => {
  const a = assembleCity({ seed: 2323 });
  const b = assembleCity({ seed: 2323 });
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.buildings, b.buildings);
  assert.deepEqual(a.gate, b.gate);
  const c = assembleCity({ seed: 9 });
  assert.notDeepEqual(a.tiles, c.tiles);
});

test('grid dimensions match the plot layout and the border is wall but for the gate', () => {
  const city = assembleCity({ seed: 1, cols: 3, rows: 3, plot: 4 });
  assert.equal(city.width, 3 * 5 + 1);
  assert.equal(city.height, 3 * 5 + 1);
  let borderOpen = 0;
  for (let x = 0; x < city.width; x++) { if (city.passable(x, 0)) borderOpen++; if (city.passable(x, city.height - 1)) borderOpen++; }
  for (let y = 0; y < city.height; y++) { if (city.passable(0, y)) borderOpen++; if (city.passable(city.width - 1, y)) borderOpen++; }
  assert.equal(borderOpen, 1, 'exactly one border opening: the gate');
  assert.equal(city.passable(city.gate.x, city.gate.y), true);
});

test('every building has one reachable door carrying a valid service', () => {
  const city = assembleCity({ seed: 42 });
  // M8: town size varies with the seed; the grid still fills exactly cols*rows.
  assert.equal(city.buildingCount, city.cols * city.rows);
  const reach = flood(city, city.spawn);
  for (const b of city.buildings) {
    assert.ok(SERVICES.includes(b.service), `service ${b.service} valid`);
    assert.equal(city.passable(b.door.x, b.door.y), true, 'door is walkable');
    assert.equal(city.buildingAt(b.door.x, b.door.y).id, b.id, 'door maps back to its building');
    assert.ok(reach.has(`${b.door.x},${b.door.y}`), `door of ${b.id} is reachable from the gate`);
  }
  // and the gate itself is reachable
  assert.ok(reach.has(`${city.gate.x},${city.gate.y}`));
});

test('services span more than one type across the roster', () => {
  const city = assembleCity({ seed: 7 });
  const kinds = new Set(city.buildings.map((b) => b.service));
  assert.ok(kinds.size >= 2, 'a city offers a mix of services');
});

test('stroll collides with building walls and preserves position', () => {
  const city = assembleCity({ seed: 3 });
  const s = createStroll(city);
  // Walk into every direction from spawn; a blocked move must not move us.
  const before = s.pos;
  for (const dir of ['N', 'E', 'S', 'W']) {
    const r = s.move(dir);
    if (!r.moved) assert.deepEqual(s.pos, before, 'blocked move keeps position');
    else s.move({ N: 'S', S: 'N', E: 'W', W: 'E' }[dir]); // step back
  }
  assert.deepEqual(s.pos, before);
});

test('stepping onto a door reports the building; the gate exits', () => {
  const city = assembleCity({ seed: 11 });
  // Place a stroll adjacent to a known door and step onto it.
  const b = city.buildings[0];
  // find a passable neighbour of the door to start from
  const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: b.door.x + dx, y: b.door.y + dy }));
  const from = nbrs.find((p) => city.passable(p.x, p.y) && !(p.x === b.door.x && p.y === b.door.y));
  assert.ok(from, 'door has a walkable neighbour');
  const s = createStroll(city, from);
  const dir = b.door.x > from.x ? 'E' : b.door.x < from.x ? 'W' : b.door.y > from.y ? 'S' : 'N';
  const r = s.move(dir);
  assert.equal(r.moved, true);
  assert.ok(r.building && r.building.id === b.id, 'the move onto the door reports its building');
  assert.equal(s.buildingHere().id, b.id);

  // Now walk out through the gate.
  const g = createStroll(city, city.spawn);
  const gd = city.gate.x < g.x ? 'W' : city.gate.x > g.x ? 'E' : city.gate.y < g.y ? 'N' : 'S';
  const gr = g.move(gd);
  assert.equal(gr.exited, true, 'stepping onto the gate exits the city');
});

test('spawn is the walkable lane just inside the gate', () => {
  const city = assembleCity({ seed: 55 });
  assert.equal(city.passable(city.spawn.x, city.spawn.y), true);
  // spawn is orthogonally adjacent to the gate
  const dx = Math.abs(city.spawn.x - city.gate.x);
  const dy = Math.abs(city.spawn.y - city.gate.y);
  assert.equal(dx + dy, 1);
});
