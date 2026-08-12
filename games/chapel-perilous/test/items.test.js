// M11 Part A inc1 — the scale-ready item data model. Proves items are composable
// data records (no hand-authored catalogue baked in), the three equipment slots resolve
// from the fields, and the GNOSIS gate + combat effect read off the record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItem, slotOf, isEquippable, gnosisGate, combatEffect, isSpent,
  SLOTS, DEFENSE_FLAVORS,
} from '../src/engine/items.js';

test('the spec is exactly three slots (directive §1b)', () => {
  assert.deepEqual(SLOTS, ['weapon', 'armor', 'accessory']);
});

test('normalize keeps missing fields absent — capabilities are only what the record carries', () => {
  const it = normalizeItem({ name: '[SEED] a plain stone' });
  assert.equal(it.weapon, null);
  assert.equal(it.armor, null);
  assert.equal(it.accessory, null);
  assert.equal(it.arcane, null);
  assert.equal(it.effect, null);
  assert.equal(it.kind, 'trinket'); // derived, not invented
  assert.equal(it.slot, null);      // a trinket is not worn
  assert.equal(isEquippable(it), false);
});

test('normalize is idempotent', () => {
  const rec = { name: 'x', weapon: { name: 'edge', dmg: [2, 5] }, tags: ['rusty'] };
  const a = normalizeItem(rec);
  const b = normalizeItem(a);
  assert.deepEqual(b, a);
});

test('each slot resolves from its profile field', () => {
  assert.equal(slotOf(normalizeItem({ weapon: { dmg: [1, 3] } })), 'weapon');
  assert.equal(slotOf(normalizeItem({ armor: { absorb: 2 } })), 'armor');
  assert.equal(slotOf(normalizeItem({ accessory: { whisper: true } })), 'accessory');
  assert.equal(slotOf(normalizeItem({ arcane: { gnosis: 'SHARP' } })), 'accessory');
});

test('COMPOSABILITY: one record carries weapon + arcane at once (a blessed blade)', () => {
  const blade = normalizeItem({
    name: '[SEED] a blade that remembers a prayer',
    weapon: { name: 'chant-edge', dmg: [3, 6] },
    arcane: { gnosis: 'SHARP', effect: { kind: 'damage', power: [4, 8] } },
  });
  // it equips as a weapon...
  assert.equal(blade.slot, 'weapon');
  assert.deepEqual(blade.weapon.dmg, [3, 6]);
  // ...AND exposes an arcane combat use behind a GNOSIS gate.
  assert.equal(gnosisGate(blade), 'SHARP');
  assert.deepEqual(combatEffect(blade).power, [4, 8]);
});

test('armor may bias the adaptive-defense flavor, else leaves it to the matchup', () => {
  const plate = normalizeItem({ armor: { name: 'plate', absorb: 3, defense: 'absorb' } });
  assert.equal(plate.armor.absorb, 3);
  assert.equal(plate.armor.defense, 'absorb');
  const cloak = normalizeItem({ armor: { absorb: 1 } });
  assert.equal(cloak.armor.defense, null); // being's weighting decides
  DEFENSE_FLAVORS.forEach((f) => assert.ok(typeof f === 'string'));
});

test('GNOSIS gate defaults sanely and only exists for arcane records', () => {
  assert.equal(gnosisGate(normalizeItem({ arcane: {} })), 'STEADY'); // default gate
  assert.equal(gnosisGate(normalizeItem({ arcane: { gnosis: 'UNCANNY' } })), 'UNCANNY');
  assert.equal(gnosisGate(normalizeItem({ weapon: { dmg: [1, 2] } })), null);
});

test('combatEffect prefers an explicit effect, else the arcane effect, else null', () => {
  assert.deepEqual(combatEffect(normalizeItem({ effect: { kind: 'heal', power: 5 } })), { kind: 'heal', power: [5, 5] });
  assert.equal(combatEffect(normalizeItem({ arcane: { effect: { kind: 'shield', power: 3 } } })).kind, 'shield');
  assert.equal(combatEffect(normalizeItem({ weapon: { dmg: [1, 2] } })), null);
});

test('consumables carry finite charges; reusable gear does not deplete', () => {
  const potion = normalizeItem({ name: '[SEED] a swallow of grey', effect: { kind: 'heal', power: [4, 6] }, charges: 1 });
  assert.equal(potion.charges, 1);
  assert.equal(potion.slot, null);   // used, not worn
  assert.equal(potion.kind, 'consumable');
  assert.equal(isSpent(potion), false);
  assert.equal(isSpent(normalizeItem({ effect: { kind: 'heal' }, charges: 0 })), true);
  assert.equal(normalizeItem({ weapon: { dmg: [1, 2] } }).charges, null); // reusable
});

test('unknown effect kinds and free accessory fields pass through (generator-ready)', () => {
  const weird = normalizeItem({
    accessory: { name: 'a coin', lands: 'edge', hums: true },
    effect: { kind: 'unravel-causality', power: [1, 9] },
    tags: ['verge', 'unique'],
  });
  assert.equal(weird.accessory.lands, 'edge');
  assert.equal(weird.accessory.hums, true);
  assert.equal(weird.effect.kind, 'unravel-causality'); // not clamped to a known enum
  assert.deepEqual(weird.tags, ['verge', 'unique']);
});

test('normalize rejects non-objects gracefully', () => {
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem(42), null);
});
