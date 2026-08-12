// M11 Part A inc3 — the combat ITEM verb, with the GNOSIS gate on arcane items
// (magic-are-items canon: power from items, magic from books gated by GNOSIS rank).
// Composable effects (damage / heal / shield) resolve; consumables report consumption.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/engine/combat.js';
import { createCharacter } from '../src/engine/character.js';
import { normalizeItem } from '../src/engine/items.js';
import { createChargen } from '../src/engine/chargen.js';
import { createSession } from '../src/engine/session.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };

function pcWith(gnosis) {
  return createCharacter({
    name: 'PC', hp: 20, oddment: { name: 'knife', dmg: [1, 1] },
    stats: { nerve: 'STEADY', craft: 'STEADY', pull: 'STEADY', gnosis }, fnord: 'STEADY',
  });
}
function fight(pc, foeHp = 20) {
  return createCombat({
    party: [pc.toCombatantSpec()],
    foes: [{ id: 'f', name: 'F', hp: foeHp, weapon: { dmg: [1, 1] }, side: 'foe', ref: { id: 'f' } }],
    seed: 2, pc,
  });
}
const toPcTurn = (c) => { while (!c.over && c.active() && c.active().side === 'foe') c.take(); };

test('a healing consumable mends the user and reports consumption', () => {
  const pc = pcWith('STEADY');
  const c = fight(pc);
  const pcc = c.combatants.find((x) => x.id === 'pc');
  pcc.hp = 5;
  toPcTurn(c);
  const potion = normalizeItem({ uid: 'it1', name: '[SEED] grey draught', effect: { kind: 'heal', power: [6, 6] }, charges: 1 });
  const res = c.take({ type: 'item', item: potion });
  assert.equal(res.event, 'item');
  assert.equal(pcc.hp, 11, 'healed by 6');
  assert.deepEqual(res.consumed, { uid: 'it1', spent: true }, 'a finite consumable is spent');
});

test('a damage item hurts the lead foe and can fell it (kill beat)', () => {
  const pc = pcWith('STEADY');
  const c = fight(pc, 4);
  toPcTurn(c);
  const bomb = normalizeItem({ uid: 'b1', name: '[SEED] hissing sphere', effect: { kind: 'damage', power: [9, 9] } });
  const before = c.fallenFoes.length;
  c.take({ type: 'item', item: bomb });
  assert.ok(c.fallenFoes.length > before, 'the item felled the foe');
});

test('GNOSIS gate: an arcane item ABOVE the PC rank fumbles (turn spent, no effect)', () => {
  const pc = pcWith('STEADY'); // below SHARP
  const c = fight(pc, 20);
  const foe = c.combatants.find((x) => x.id === 'f');
  toPcTurn(c);
  const grimoire = normalizeItem({ uid: 'g1', name: '[SEED] a rite too high', arcane: { gnosis: 'SHARP', effect: { kind: 'damage', power: [9, 9] } } });
  const hpBefore = foe.hp;
  const res = c.take({ type: 'item', item: grimoire });
  assert.equal(res.event, 'item-fumble');
  assert.equal(foe.hp, hpBefore, 'the gated rite did nothing');
  assert.ok(c.log.some((l) => /fumbles/.test(l)), 'the fumble is logged');
});

test('GNOSIS gate: the same arcane item works AT or ABOVE the required rank', () => {
  const pc = pcWith('SHARP');
  const c = fight(pc, 20);
  const foe = c.combatants.find((x) => x.id === 'f');
  toPcTurn(c);
  const grimoire = normalizeItem({ uid: 'g1', name: '[SEED] a rite in reach', arcane: { gnosis: 'SHARP', effect: { kind: 'damage', power: [9, 9] } } });
  c.take({ type: 'item', item: grimoire });
  assert.equal(foe.hp, 11, 'the rite bit for 9');
});

test('a shield item raises a ward that reduces the next incoming hit', () => {
  const pc = pcWith('STEADY');
  const c = createCombat({
    party: [pc.toCombatantSpec()],
    foes: [{ id: 'f', name: 'F', hp: 30, weapon: { dmg: [5, 5] }, side: 'foe', ref: { id: 'f' } }],
    seed: 8, pc,
  });
  const pcc = c.combatants.find((x) => x.id === 'pc');
  toPcTurn(c);
  const ward = normalizeItem({ uid: 'w1', name: '[SEED] a warding sign', effect: { kind: 'shield', power: [4, 4] } });
  c.take({ type: 'item', item: ward });
  const hpAfterWard = pcc.hp;
  while (!c.over && c.active() && c.active().side === 'foe') c.take(); // foe strikes into the ward
  const tookThroughWard = hpAfterWard - pcc.hp;
  assert.ok(tookThroughWard <= 1, `the ward (4) should soak most of a 5-hit (took ${tookThroughWard})`);
});

test('session.consumeItem decrements charges and removes a spent consumable', () => {
  const chargen = createChargen(chargenData);
  const s = createSession({ chargen, seed: 4 });
  const it = s.addItem({ name: '[SEED] two-swallow flask', effect: { kind: 'heal', power: 3 }, charges: 2 });
  assert.equal(s.consumeItem(it.uid), 1, 'one charge left');
  assert.equal(s.consumeItem(it.uid), 0, 'spent');
  assert.ok(!s.items().some((x) => x.uid === it.uid), 'a spent consumable leaves the pack');
  // a reusable item is untouched
  const reuse = s.addItem({ name: '[SEED] a grimoire', arcane: { gnosis: 'STEADY', effect: { kind: 'damage', power: 4 } } });
  assert.equal(s.consumeItem(reuse.uid), null, 'reusable — nothing spent');
  assert.ok(s.items().some((x) => x.uid === reuse.uid), 'the grimoire stays');
});
