// M12 H — combat statuses. WARDED is implemented end-to-end (ADDENDUM #7): an item
// carrying effect.kind:'status' lays a multi-round damage ward that mitigate() reads
// and advance() ticks down. H3: the follower-targeting weight table defaults to EXACTLY
// uniform (so seeded combat is unchanged) but is a real, tunable lever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat, createCombatant, mitigate, wardAmount } from '../src/engine/combat.js';

test('a combatant starts with no statuses; wardAmount is 0', () => {
  const c = createCombatant({ name: 'x', hp: 10 });
  assert.deepEqual(c.statuses, []);
  assert.equal(wardAmount(c), 0);
});

test('WARDED soaks incoming damage while active, on top of armor', () => {
  const c = createCombatant({ name: 'x', hp: 20, armorAbsorb: 1 });
  c.statuses.push({ id: 'WARDED', polarity: 'good', duration: 2, effect: { amount: 3 } });
  assert.equal(wardAmount(c), 3);
  const rng = () => 0.99; // no dodge
  const r = mitigate(10, c, rng);
  assert.equal(r.dmg, 10 - 1 - 3, 'armor(1) + ward(3) soak stack');
  // an expired ward (duration 0) soaks nothing
  c.statuses[0].duration = 0;
  assert.equal(wardAmount(c), 0);
});

test('an item with effect.kind:status applies WARDED end-to-end and it ticks down', () => {
  const item = { name: '[SEED] a warding charm', effect: { kind: 'status', status: { id: 'WARDED', polarity: 'good', duration: 2, amount: 2 } }, charges: 1 };
  const c = createCombat({
    party: [{ id: 'pc', name: 'PC', hp: 30, weapon: { dmg: [1, 1] } }],
    foes: [{ id: 'f', name: 'Foe', hp: 30, weapon: { dmg: [4, 4] } }],
    seed: 3,
  });
  while (c.active() && c.active().side !== 'party') c.take();
  const pc = c.combatants.find((x) => x.id === 'pc');
  c.take({ type: 'item', item });
  assert.ok(pc.statuses.some((s) => s.id === 'WARDED' && s.duration > 0), 'WARDED applied to the user');
  const dur0 = pc.statuses.find((s) => s.id === 'WARDED').duration;
  // run a full round so statuses tick
  const r0 = c.round;
  let guard = 0;
  while (c.round === r0 && !c.over && guard++ < 50) c.take();
  const w = pc.statuses.find((s) => s.id === 'WARDED');
  assert.ok(!w || w.duration < dur0, 'the ward ticked down a round');
});

test('H3: uniform targeting is unchanged; a follower-weighted table shifts the odds', () => {
  const cfg = (targeting) => ({
    party: [{ id: 'pc', name: 'PC', hp: 100, weapon: { dmg: [1, 1] } }, { id: 'ally', name: 'Ally', hp: 100, weapon: { dmg: [1, 1] } }],
    foes: [{ id: 'f', name: 'Foe', hp: 100, weapon: { dmg: [3, 3] } }],
    seed: 11, targeting,
  });
  // Count who the foe strikes over many fights with default (uniform) vs follower-heavy.
  function strikeSplit(targeting) {
    let pc = 0, ally = 0;
    for (let s = 1; s <= 120; s++) {
      const c = createCombat({ ...cfg(targeting), seed: s });
      const before = { pc: 100, ally: 100 };
      let guard = 0;
      while (!c.over && guard++ < 6) c.take();
      const pcc = c.combatants.find((x) => x.id === 'pc');
      const al = c.combatants.find((x) => x.id === 'ally');
      if (pcc.hp < before.pc) pc++;
      if (al.hp < before.ally) ally++;
    }
    return { pc, ally };
  }
  const uniform = strikeSplit(null);
  const allyHeavy = strikeSplit({ pc: 1, follower: 5 });
  assert.ok(uniform.pc > 0 && uniform.ally > 0, 'uniform hits both');
  assert.ok(allyHeavy.ally > uniform.ally, 'weighting the follower draws more fire onto the ally');
});
