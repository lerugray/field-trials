// M11 Part A inc2 — the adaptive DEFENSE verb + armor. One verb; the resolution
// flavor (dodge / avoid / absorb) is read from the matchup (being data, then armor bias,
// then derived). Armor feeds the absorb side. All seeded + deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombat, defenseFlavorFor, mitigate, DEFENSE_FLAVORS, formatCombatRound } from '../src/engine/combat.js';

test('defenseFlavorFor: being weighting wins, then armor bias, then derived', () => {
  // explicit being weighting is authoritative
  assert.equal(defenseFlavorFor({ defense: 'dodge', weapon: { dmg: [9, 9] } }, null), 'dodge');
  // no being weighting → armor bias
  assert.equal(defenseFlavorFor({ weapon: { dmg: [3, 4] }, hp: 5 }, { defense: 'absorb' }), 'absorb');
  // derived: a hard hitter → absorb, a frail quick thing → dodge, the middle → avoid
  assert.equal(defenseFlavorFor({ weapon: { dmg: [4, 6] }, hp: 8 }, null), 'absorb');
  assert.equal(defenseFlavorFor({ weapon: { dmg: [1, 2] }, hp: 3 }, null), 'dodge');
  assert.equal(defenseFlavorFor({ weapon: { dmg: [2, 4] }, hp: 6 }, null), 'avoid');
  DEFENSE_FLAVORS.forEach((f) => assert.ok(['dodge', 'avoid', 'absorb'].includes(f)));
});

test('mitigate: avoid halves, absorb braces on armor, dodge can negate, soak always applies', () => {
  const noRng = () => 0.99; // dodge fails (>0.55)
  // avoid: 6 → ceil(6/2)=3, no soak
  assert.equal(mitigate(6, { armorAbsorb: 0, stance: { flavor: 'avoid' } }, noRng).dmg, 3);
  // absorb: 6 - (2 + armor 2) = 2
  assert.equal(mitigate(6, { armorAbsorb: 2, stance: { flavor: 'absorb' } }, noRng).dmg, 2);
  // passive soak with no stance
  assert.equal(mitigate(5, { armorAbsorb: 2, stance: null }, noRng).dmg, 3);
  // dodge negates when the roll is under 0.55
  const hit = mitigate(9, { armorAbsorb: 0, stance: { flavor: 'dodge' } }, () => 0.1);
  assert.equal(hit.dmg, 0);
  assert.equal(hit.negated, true);
});

test('DEFENSE in a live fight reduces the damage the PC takes that round', () => {
  const foe = { id: 'brute', name: 'Brute', hp: 30, weapon: { name: 'maul', dmg: [6, 6] }, side: 'foe', ref: { defense: 'absorb', weapon: { dmg: [6, 6] }, hp: 30 } };
  const mk = () => createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 40, weapon: { dmg: [1, 1] }, armorAbsorb: 2 }],
    foes: [foe], seed: 4,
  });

  // baseline: PC attacks, foe hits back full (6 - passive soak 2 = 4)
  const a = mk();
  // ensure PC acts first; if a foe leads, run its turn
  while (a.active() && a.active().side === 'foe') a.take();
  a.take({ type: 'fight', target: 'brute' });
  while (a.active() && a.active().side === 'foe') a.take();
  const pcA = a.combatants.find((c) => c.id === 'pc');

  // braced: PC defends (absorb), foe hits for 6 - (2 brace + 2 soak) = 2
  const b = mk();
  while (b.active() && b.active().side === 'foe') b.take();
  b.take({ type: 'defend' });
  while (b.active() && b.active().side === 'foe') b.take();
  const pcB = b.combatants.find((c) => c.id === 'pc');

  const tookA = pcA.maxHp - pcA.hp;
  const tookB = pcB.maxHp - pcB.hp;
  assert.ok(tookB < tookA, `bracing should reduce damage (braced ${tookB} < unbraced ${tookA})`);
});

test('a brace is spent when the defender next acts (does not persist forever)', () => {
  const c = createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 40, weapon: { dmg: [1, 1] } }],
    foes: [{ id: 'f', name: 'F', hp: 30, weapon: { dmg: [4, 4] }, side: 'foe', ref: { defense: 'avoid' } }],
    seed: 1,
  });
  while (c.active() && c.active().side === 'foe') c.take();
  c.take({ type: 'defend' });
  const pc = c.combatants.find((x) => x.id === 'pc');
  assert.ok(pc.stance, 'stance is set after defending');
  while (c.active() && c.active().side === 'foe') c.take();
  // back to the PC's turn — acting clears the old brace
  c.take({ type: 'fight', target: 'f' });
  assert.equal(pc.stance, null, 'the brace is cleared once the defender acts again');
});

test('a lethal hit while guarding says exactly what the guard blocked', () => {
  const c = createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 6, weapon: { dmg: [1, 1] } }],
    foes: [{ id: 'f', name: 'F', hp: 30, weapon: { name: 'maul', dmg: [9, 9] }, side: 'foe', ref: { defense: 'absorb' } }],
    seed: 4,
  });
  assert.equal(c.active().id, 'pc', 'fixture must let the PC guard before the hit');
  c.take({ type: 'defend' });
  while (!c.over && c.active() && c.active().side === 'foe') c.take();
  const hit = c.rounds.find((r) => r.action === 'attack' && r.target && r.target.id === 'pc');
  assert.equal(hit.hpAfter, 0, 'the deliberately oversized hit is still lethal');
  assert.equal(hit.absorbed, 2);
  assert.match(formatCombatRound(hit, 6), /guard absorb blocked 2/);
});

test('deterministic: same seed + same actions reproduce the fight', () => {
  const run = () => {
    const c = createCombat({
      party: [{ id: 'pc', name: 'PC', hp: 20, weapon: { dmg: [2, 3] }, armorAbsorb: 1 }],
      foes: [{ id: 'f', name: 'F', hp: 12, weapon: { dmg: [3, 5] }, side: 'foe', ref: { defense: 'dodge' } }],
      seed: 77,
    });
    const acts = ['defend', 'fight', 'defend', 'fight', 'fight', 'fight'];
    let i = 0;
    let g = 0;
    while (!c.over && g++ < 100) {
      if (c.active() && c.active().side === 'foe') { c.take(); continue; }
      const a = acts[i++ % acts.length];
      c.take(a === 'fight' ? { type: 'fight', target: 'f' } : { type: 'defend' });
    }
    return c.log.join('\n');
  };
  assert.equal(run(), run());
});
