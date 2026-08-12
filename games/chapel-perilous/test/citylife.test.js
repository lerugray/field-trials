import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCity, ARCHETYPES, SERVICES } from '../src/engine/city.js';
import { createCityLife } from '../src/engine/citylife.js';
import { createNames } from '../src/engine/names.js';
import { createProse } from '../src/engine/prose.js';
import phonemes from '../data/register/phonemes.json' with { type: 'json' };
import pools from '../data/register/pools.json' with { type: 'json' };
import cityRegister from '../data/register/city.json' with { type: 'json' };

const names = createNames(phonemes);
const prose = createProse(pools);
const life = (city, seed) => createCityLife(city, { seed, names, prose, cityRegister });

test('towns vary: different seeds give different sizes AND archetypes across the set', () => {
  const sizes = new Set(), arches = new Set();
  for (let s = 1; s <= 30; s++) {
    const c = assembleCity({ seed: s * 101 });
    sizes.add(`${c.cols}x${c.rows}`);
    arches.add(c.archetype);
    assert.ok(ARCHETYPES.includes(c.archetype), 'valid archetype');
  }
  assert.ok(sizes.size >= 3, `saw ${sizes.size} distinct town footprints`);
  assert.ok(arches.size >= 3, `saw ${arches.size} distinct archetypes`);
});

test('the archetype biases the service mix (pilgrimage over-represents shrines vs market)', () => {
  function shrineShare(archetype) {
    let shrine = 0, tot = 0;
    for (let s = 0; s < 40; s++) {
      const c = assembleCity({ seed: s * 7 + 1, archetype, cols: 3, rows: 3 });
      for (const b of c.buildings) { tot++; if (b.service === 'shrine') shrine++; }
    }
    return shrine / tot;
  }
  assert.ok(shrineShare('pilgrimage') > shrineShare('market'), 'pilgrimage towns hold more shrines');
});

test('every generated service is one of the known SERVICES', () => {
  const c = assembleCity({ seed: 999 });
  for (const b of c.buildings) assert.ok(SERVICES.includes(b.service));
});

test('two buildings of the SAME service still read differently (distinct proprietors)', () => {
  // Find a town with >=2 of one service, assert their identities differ.
  let found = false;
  for (let s = 0; s < 60 && !found; s++) {
    const c = assembleCity({ seed: s * 13 + 5, cols: 3, rows: 3 });
    const L = life(c, c.seed);
    const byService = new Map();
    for (const b of c.buildings) {
      const arr = byService.get(b.service) || [];
      arr.push(b); byService.set(b.service, arr);
    }
    for (const [, arr] of byService) {
      if (arr.length >= 2) {
        const a = L.identity(arr[0]), b = L.identity(arr[1]);
        assert.notEqual(a.proprietor, b.proprietor, 'same-service buildings have distinct proprietors');
        found = true; break;
      }
    }
  }
  assert.ok(found, 'exercised a town with two same-service buildings');
});

test('building identity is deterministic in (city seed, building)', () => {
  const c = assembleCity({ seed: 314 });
  const a = life(c, c.seed).identity(c.buildings[0]);
  const b = life(c, c.seed).identity(c.buildings[0]);
  assert.deepEqual(a, b);
});

test('citizens stand on distinct passable street tiles, never a door/gate, and are named', () => {
  const c = assembleCity({ seed: 202 });
  const L = life(c, c.seed);
  const cits = L.citizens(5);
  assert.ok(cits.length > 0);
  const seen = new Set();
  for (const p of cits) {
    assert.ok(c.passable(p.x, p.y), 'on street');
    assert.ok(!(p.x === c.gate.x && p.y === c.gate.y), 'not the gate');
    assert.equal(c.buildingAt(p.x, p.y), null, 'not on a door');
    assert.ok(typeof p.name === 'string' && p.name.length, 'named');
    const key = `${p.x},${p.y}`;
    assert.ok(!seen.has(key), 'distinct tile');
    seen.add(key);
  }
});

test('town blurb + citizen greeting come from the [SEED] register, keyed to the town', () => {
  const c = assembleCity({ seed: 55 });
  const L = life(c, c.seed);
  assert.match(L.townBlurb(), /^\[SEED\]/);
  const cit = L.citizens(3)[0];
  assert.match(L.greetingFor(cit.x, cit.y), /^\[SEED\]/);
});
