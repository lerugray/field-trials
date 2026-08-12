// M12 A3 — the LOCKED rest split + heal availability (ADDENDUM #2).
//   camp (overworld R): partial heal, always free, caller rolls the ambush tail.
//   inn/shrine: full heal; FREE while the world holds no cleared dungeon, then it
//     costs one carried item tagged `rest-offering`; no offering → refused.
//   every path reports before→after HP; every town guarantees a heal door, the
//   starting town guarantees both. Mid-dungeon healing is consumables only (not here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/engine/session.js';
import { createChargen } from '../src/engine/chargen.js';
import { assembleCity, ensureHealServices } from '../src/engine/city.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };

const chargen = createChargen(chargenData);

test('camp rest is refused in the wild; no heal, no tick, reason not-safe', () => {
  const s = createSession({ chargen, seed: 3 });
  s.pc.hp = 1;
  const r = s.rest('camp');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-safe');
  assert.equal(s.pc.hp, 1, 'a refused wild rest heals nothing');
});

test('inn and shrine are safe rests; camp elsewhere is refused', () => {
  const s = createSession({ chargen, seed: 3 });
  s.pc.hp = 1;
  const inn = s.rest('inn');
  assert.equal(inn.ok, true);
  assert.equal(inn.context, 'inn');
  assert.equal(s.pc.hp, s.pc.maxHp);

  s.pc.hp = 1;
  const shrine = s.rest('shrine');
  assert.equal(shrine.ok, true);
  assert.equal(shrine.context, 'shrine');
  assert.equal(s.pc.hp, s.pc.maxHp);

  s.pc.hp = 1;
  const field = s.rest('camp');
  assert.equal(field.ok, false);
  assert.equal(field.reason, 'not-safe');
  assert.equal(s.pc.hp, 1);
});

test('inn is a free full heal before any dungeon clear, then wants an offering', () => {
  const s = createSession({ chargen, seed: 4 });
  s.pc.hp = 1;
  const free = s.rest('inn');
  assert.equal(free.ok, true);
  assert.equal(free.free, true);
  assert.equal(s.pc.hp, s.pc.maxHp);

  // After a dungeon clear, the free window closes: no offering → refused, no heal.
  s.clearSite('some-dungeon');
  s.pc.hp = 1;
  const refused = s.rest('inn');
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'no-offering');
  assert.equal(s.pc.hp, 1, 'a refused rest heals nothing');

  // Carrying a rest-offering pays for a full heal and consumes exactly that item.
  s.addItem({ kind: 'trinket', name: '[SEED] a folded bill', tags: ['rest-offering'] });
  const paid = s.rest('shrine');
  assert.equal(paid.ok, true);
  assert.ok(paid.offering, 'the offering is named in the result');
  assert.equal(s.pc.hp, s.pc.maxHp);
  assert.equal(s.items().some((i) => (i.tags || []).includes('rest-offering')), false, 'the offering was spent');
});

test('every town guarantees a heal door; the starting town guarantees both', () => {
  // Sweep many seeds: the default 'one' guarantee always yields at least one of inn/shrine.
  for (let seed = 1; seed <= 60; seed++) {
    const c = assembleCity({ seed: seed * 13 });
    const svcs = new Set(c.buildings.map((b) => b.service));
    assert.ok(svcs.has('inn') || svcs.has('shrine'), `town ${seed} has a heal door`);
  }
  // The starting town ('both') always has an inn AND a shrine.
  for (let seed = 1; seed <= 60; seed++) {
    const c = assembleCity({ seed: seed * 13, guarantee: 'both' });
    const svcs = new Set(c.buildings.map((b) => b.service));
    assert.ok(svcs.has('inn'), `start town ${seed} has an inn`);
    assert.ok(svcs.has('shrine'), `start town ${seed} has a shrine`);
  }
});

test('the guarantee is deterministic and leaves a satisfied mix untouched', () => {
  const a = assembleCity({ seed: 2323, guarantee: 'both' });
  const b = assembleCity({ seed: 2323, guarantee: 'both' });
  assert.deepEqual(a.buildings, b.buildings);
  // A hand-built mix that already has both is unchanged by 'both'.
  const already = [
    { index: 0, service: 'inn' }, { index: 1, service: 'shrine' }, { index: 2, service: 'shop' },
  ];
  const snapshot = already.map((x) => ({ ...x }));
  ensureHealServices(already, 999, 'both');
  assert.deepEqual(already, snapshot);
});
