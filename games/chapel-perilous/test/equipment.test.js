// M11 Part A inc1 — the three equipment slots on the session, routed by the item
// data model. Weapon → pc.weapon (power from items); armor/accessory hold their records;
// swaps are reversible; the whole set persists through save/load and resets on death.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChargen } from '../src/engine/chargen.js';
import { createSession } from '../src/engine/session.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };

const chargen = createChargen(chargenData);

test('equip routes by slot: weapon, armor, accessory each land in their slot', () => {
  const s = createSession({ chargen, seed: 5 });
  const w = s.addItem({ name: '[SEED] a blade', weapon: { name: 'blade', dmg: [7, 9] } });
  const a = s.addItem({ name: '[SEED] a plate', armor: { name: 'plate', absorb: 2, defense: 'absorb' } });
  const c = s.addItem({ name: '[SEED] a humming coin', accessory: { name: 'coin', hums: true } });

  assert.equal(s.equip(w.uid), true);
  assert.equal(s.equip(a.uid), true);
  assert.equal(s.equip(c.uid), true);

  const eq = s.equipped();
  assert.deepEqual(eq.weapon.dmg, [7, 9]);   // weapon slot mirrors pc.weapon
  assert.deepEqual(s.pc.weapon.dmg, [7, 9]);
  assert.equal(eq.armor.armor.absorb, 2);
  assert.equal(eq.accessory.accessory.hums, true);
});

test('an arcane accessory (no weapon/armor) equips into the accessory slot', () => {
  const s = createSession({ chargen, seed: 6 });
  const g = s.addItem({ name: '[SEED] a grimoire-shard', arcane: { gnosis: 'SHARP', effect: { kind: 'damage', power: [4, 8] } } });
  assert.equal(s.equip(g.uid), true);
  assert.equal(s.equipped().accessory.name.includes('grimoire'), true);
});

test('equipping an armor swap stows the previous armor back (reversible)', () => {
  const s = createSession({ chargen, seed: 7 });
  const a1 = s.addItem({ name: '[SEED] rags', armor: { name: 'rags', absorb: 1 } });
  const a2 = s.addItem({ name: '[SEED] mail', armor: { name: 'mail', absorb: 3 } });
  s.equip(a1.uid);
  s.equip(a2.uid);
  assert.equal(s.equipped().armor.armor.absorb, 3);
  // the rags are back in the pack, not lost
  assert.ok(s.items().some((x) => /rags/.test(x.name)), 'the swapped-out armor is stowed back');
});

test('a slotless item (trinket/consumable) is not equippable', () => {
  const s = createSession({ chargen, seed: 8 });
  const t = s.addItem({ name: '[SEED] a coin', kind: 'trinket' });
  const p = s.addItem({ name: '[SEED] a potion', effect: { kind: 'heal', power: 5 }, charges: 1 });
  assert.equal(s.equip(t.uid), false);
  assert.equal(s.equip(p.uid), false);
});

test('the full equipment set persists through save/load and resets on death', () => {
  const s = createSession({ chargen, seed: 9 });
  const a = s.addItem({ name: '[SEED] a cloak', armor: { name: 'cloak', absorb: 2, defense: 'dodge' } });
  const c = s.addItem({ name: '[SEED] a charm', accessory: { name: 'charm', ward: true } });
  s.equip(a.uid);
  s.equip(c.uid);
  const snap = JSON.parse(JSON.stringify(s.serialize()));

  const s2 = createSession({ chargen, seed: 99 });
  s2.restore(snap);
  assert.equal(s2.equipped().armor.armor.absorb, 2);
  assert.equal(s2.equipped().accessory.accessory.ward, true);

  s.die('test');
  assert.equal(s.equipped().armor, null, 'a new stranger wears no found armor');
  assert.equal(s.equipped().accessory, null);
});
