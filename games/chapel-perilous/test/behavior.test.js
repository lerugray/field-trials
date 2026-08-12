// M11 Part A inc5 — per-being combat behaviors (directive §2: enemy behavior worth
// reading). Behaviors drive TARGETING and TIMING only — never damage (character-design
// lock; the unfair tail is not softened). Each reads distinctly in the log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/engine/combat.js';

function foe(id, behavior, over = {}) {
  return { id, name: id, hp: over.hp ?? 20, weapon: { dmg: over.dmg || [3, 3] }, side: 'foe', ref: { id, behavior } };
}
const runFoes = (c) => { while (!c.over && c.active() && c.active().side === 'foe') c.take(); };
// Advance a full round or two: party members defend (harmless), foes act. Stops after
// `foeActs` foe-turns have resolved (so we always observe the foe behavior regardless of
// who won initiative), or the fight ends.
function drive(c, foeActs = 1) {
  let acted = 0;
  let guard = 0;
  while (!c.over && acted < foeActs && guard++ < 200) {
    const a = c.active();
    if (!a) break;
    if (a.side === 'foe') { c.take(); acted++; }
    else { const t = c.living('foe')[0]; c.take({ type: 'fight', target: t && t.id }); }
  }
}

test('aggressive focus-fires the weakest party member', () => {
  const c = createCombat({
    party: [
      { id: 'pc', name: 'PC', hp: 20, weapon: { dmg: [1, 1] } },
      { id: 'ally', name: 'Ally', hp: 4, weapon: { dmg: [1, 1] } }, // the weakest
    ],
    foes: [foe('brute', 'aggressive', { dmg: [3, 3] })],
    seed: 3,
  });
  const ally = c.combatants.find((x) => x.id === 'ally');
  const before = ally.hp;
  drive(c, 1); // brute presses the weakest
  assert.ok(ally.hp < before, 'the aggressive foe went for the weakest');
});

test('a cowardly foe bolts when badly hurt (a foe that runs)', () => {
  const c = createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 30, weapon: { dmg: [1, 1] } }],
    foes: [foe('cur', 'cowardly', { hp: 10 })],
    seed: 2,
  });
  const cur = c.combatants.find((x) => x.id === 'cur');
  cur.hp = 2; // badly hurt → may bolt
  let bolted = false;
  for (let i = 0; i < 20 && !c.over; i++) {
    if (c.active() && c.active().side === 'foe') { c.take(); if (c.log.some((l) => /bolts/.test(l))) { bolted = true; break; } }
    else c.take({ type: 'defend' });
  }
  assert.ok(bolted, 'the cowardly foe eventually bolts when hurt');
});

test('a caster telegraphs: it gathers a rite one turn, looses it the next', () => {
  const c = createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 30, weapon: { dmg: [1, 1] } }],
    foes: [foe('adept', 'caster')],
    seed: 1,
  });
  // first foe action: channels (no damage); second: looses the rite
  drive(c, 2);
  assert.ok(c.log.some((l) => /gathers a rite/.test(l)), 'the caster telegraphs first');
  assert.ok(c.log.some((l) => /looses the rite/.test(l)), 'the caster looses on the following turn');
});

test('a pack coordinates on one marked target when 2+ strong', () => {
  const c = createCombat({
    party: [
      { id: 'pc', name: 'PC', hp: 30, weapon: { dmg: [1, 1] } },
      { id: 'ally', name: 'Ally', hp: 5, weapon: { dmg: [1, 1] } },
    ],
    foes: [foe('hound1', 'pack', { dmg: [2, 2] }), foe('hound2', 'pack', { dmg: [2, 2] })],
    seed: 4,
  });
  drive(c, 2); // both hounds act
  const marks = c.log.filter((l) => /joins the pack on/.test(l));
  assert.ok(marks.length >= 1, 'pack members announce the shared mark');
});

test('behavior never changes damage numbers (lock): steady vs aggressive same weapon → same band', () => {
  const mk = (behavior) => createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 100, weapon: { dmg: [1, 1] } }],
    foes: [foe('f', behavior, { dmg: [5, 5] })],
    seed: 9,
  });
  const dmgOf = (c) => {
    const pc = c.combatants.find((x) => x.id === 'pc');
    const b = pc.hp; runFoes(c); return b - pc.hp;
  };
  // a fixed [5,5] band deals 5 regardless of disposition — behavior is targeting/timing
  assert.equal(dmgOf(mk('steady')), 5);
  assert.equal(dmgOf(mk('aggressive')), 5);
});
