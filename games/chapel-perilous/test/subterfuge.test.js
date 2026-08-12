// M11 Part A inc4 — the SUBTERFUGE / DISTRACTION verb: an environment-keyed,
// risky, TEMPORARY, one-per-fight edge. Success throws a foe off its next turn
// ('distract') or exposes it to one harder blow ('expose'); it is never repeatable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/engine/combat.js';
import { subterfugeContext } from '../src/engine/tactics.js';
import combatData from '../data/register/combat.json' with { type: 'json' };

function fight(seed = 1, foeDmg = [4, 4]) {
  return createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 30, weapon: { dmg: [2, 2] } }],
    foes: [{ id: 'f', name: 'F', hp: 30, weapon: { dmg: foeDmg }, side: 'foe', ref: { id: 'f' } }],
    seed,
  });
}
const toPcTurn = (c) => { while (!c.over && c.active() && c.active().side === 'foe') c.take(); };

test('a successful distraction makes the foe skip its next turn', () => {
  const c = fight(1);
  const pc = c.combatants.find((x) => x.id === 'pc');
  toPcTurn(c);
  const hp0 = pc.hp;
  c.take({ type: 'subterfuge', context: { chance: 1, kind: 'distract', label: 'kicks up mud' } });
  // run through the foe's turn — it should be thrown off and deal nothing
  while (!c.over && c.active() && c.active().side === 'foe') c.take();
  assert.equal(pc.hp, hp0, 'the distracted foe dealt no damage that turn');
  assert.ok(c.log.some((l) => /thrown off/.test(l)));
});

test('a successful expose lets the next hit land harder', () => {
  const c = fight(1);
  const foe = c.combatants.find((x) => x.id === 'f');
  toPcTurn(c);
  c.take({ type: 'subterfuge', context: { chance: 1, kind: 'expose', label: 'throws glare' } });
  toPcTurn(c); // back to the PC
  const hpBefore = foe.hp;
  c.take({ type: 'fight', target: 'f' }); // weapon [2,2], +2 exposed = 4
  assert.equal(hpBefore - foe.hp, 4, 'the exposed foe took the +2 bonus blow');
});

test('a failed attempt still spends the one gambit (non-repeatable)', () => {
  const c = fight(1);
  toPcTurn(c);
  const res = c.take({ type: 'subterfuge', context: { chance: 0, label: 'tries something' } });
  assert.equal(res.subterfuge.ok, false, 'chance 0 fails');
  assert.equal(c.subterfugeSpent, true);
  toPcTurn(c);
  const again = c.take({ type: 'subterfuge', context: { chance: 1 } });
  assert.equal(again.event, 'subterfuge-spent', 'no second gambit — never a repeatable exploit');
});

test('subterfugeContext is environment-keyed and deterministic', () => {
  const fen = subterfugeContext(combatData, { biome: 'drowned-fen' }, 5);
  const salt = subterfugeContext(combatData, { biome: 'salt-flats' }, 5);
  assert.ok(fen.chance > salt.chance, 'the fen favors subterfuge more than the open salt pan');
  assert.equal(salt.kind, 'expose', 'nowhere to hide on the pan → expose');
  assert.equal(fen.kind, 'distract');
  assert.deepEqual(subterfugeContext(combatData, { biome: 'drowned-fen' }, 5), fen, 'deterministic in seed');
  // open country (no biome) → the default
  const open = subterfugeContext(combatData, {}, 5);
  assert.equal(open.chance, 0.5);
  assert.ok(open.label.startsWith('[SEED]'), 'flavor stays [SEED]-gated');
});
