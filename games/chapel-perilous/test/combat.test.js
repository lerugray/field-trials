import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat, createCombatant, normalizeWeapon } from '../src/engine/combat.js';

// A tiny fixed roster so assertions don't depend on content data.
function roster() {
  return {
    party: [{ id: 'pc', name: 'Initiate', hp: 10, weapon: { name: 'knife', dmg: [3, 3] } }],
    foes: [{ id: 'rat', name: 'Rat', hp: 4, weapon: { name: 'teeth', dmg: [1, 1] } }],
  };
}

// Drive a combat to its end by always fighting the first foe on party turns and
// letting foe turns auto-resolve. Returns the final combat.
function runToEnd(cfg) {
  const c = createCombat(cfg);
  let guard = 0;
  while (!c.over && guard++ < 1000) {
    const a = c.active();
    if (a && a.side === 'party') c.take({ type: 'fight', target: c.living('foe')[0].id });
    else c.take();
  }
  return c;
}

test('weapon normalization: band, scalar, number, and default fist', () => {
  assert.deepEqual(normalizeWeapon({ name: 'axe', dmg: [2, 5] }).dmg, [2, 5]);
  assert.deepEqual(normalizeWeapon({ name: 'club', dmg: 4 }).dmg, [4, 4]);
  assert.deepEqual(normalizeWeapon(3).dmg, [3, 3]);
  assert.equal(normalizeWeapon(null).name, 'bare hands');
  // an inverted band is repaired, never negative-width
  assert.deepEqual(normalizeWeapon({ dmg: [5, 2] }).dmg, [5, 5]);
});

test('combatant starts at full hp and is alive', () => {
  const c = createCombatant({ name: 'x', hp: 7 });
  assert.equal(c.hp, 7);
  assert.equal(c.maxHp, 7);
  assert.equal(c.alive, true);
  assert.equal(c.side, 'party');
});

test('createCombat requires both a party and foes', () => {
  assert.throws(() => createCombat({ party: [{ id: 'a', hp: 1 }], foes: [], seed: 1 }));
  assert.throws(() => createCombat({ party: [], foes: [{ id: 'b', hp: 1 }], seed: 1 }));
});

test('a fight resolves to a win when the party out-damages the foe', () => {
  const c = runToEnd({ ...roster(), seed: 1 });
  assert.equal(c.over, true);
  assert.equal(c.outcome, 'win');
  // 4 hp / 3 dmg => two knife hits kill the rat; the PC took at most one bite.
  const pc = c.combatants.find((x) => x.id === 'pc');
  assert.ok(pc.hp >= 8 && pc.hp <= 10);
});

test('a kill gets an explicit beat: a felled log line + tracked fallen foe (A7)', () => {
  const c = runToEnd({ ...roster(), seed: 1 });
  assert.equal(c.outcome, 'win');
  // the foe death is an explicit, distinct log beat — not a silent removal
  assert.ok(c.log.some((l) => /✖ .*falls/.test(l)), `expected a felled kill beat in the log: ${JSON.stringify(c.log)}`);
  // and the felled foe is tracked so the shell can surface the acknowledgement
  assert.ok(c.fallenFoes.includes('Rat'), `fallenFoes should record the felled Rat, got ${JSON.stringify(c.fallenFoes)}`);
  // a party ally that never falls is not recorded as a foe kill
  assert.equal(c.fallenFoes.length, 1);
});

test('the party loses when foes out-damage them', () => {
  const c = runToEnd({
    party: [{ id: 'pc', name: 'Initiate', hp: 3, weapon: { dmg: [1, 1] } }],
    foes: [{ id: 'ogre', name: 'Ogre', hp: 30, weapon: { dmg: [5, 5] } }],
    seed: 2,
  });
  assert.equal(c.outcome, 'lose');
  assert.equal(c.living('party').length, 0);
});

test('combat is deterministic in the seed: identical seed + actions => identical log', () => {
  const a = runToEnd({ ...roster(), seed: 42 });
  const b = runToEnd({ ...roster(), seed: 42 });
  assert.deepEqual(a.log, b.log);
  assert.equal(a.round, b.round);
});

test('different seeds can diverge in damage rolls', () => {
  // A wide damage band so the seed actually changes the numbers.
  const cfg = (seed) => ({
    party: [{ id: 'pc', name: 'PC', hp: 50, weapon: { dmg: [1, 12] } }],
    foes: [{ id: 'f', name: 'Foe', hp: 40, weapon: { dmg: [1, 1] } }],
    seed,
  });
  const logs = new Set([1, 2, 3, 4, 5].map((s) => runToEnd(cfg(s)).log.join('|')));
  assert.ok(logs.size > 1, 'expected seed variation to produce differing fights');
});

test('turn order is a seeded permutation covering every combatant exactly once', () => {
  const c = createCombat({
    party: [{ id: 'a', hp: 5 }, { id: 'b', hp: 5 }],
    foes: [{ id: 'c', hp: 5 }, { id: 'd', hp: 5 }],
    seed: 7,
  });
  assert.equal(c.order.length, 4);
  assert.deepEqual([...c.order].sort((x, y) => x - y), [0, 1, 2, 3]);
});

test('fleeing can end combat as fled (seeded)', () => {
  // Search seeds for one whose first party action is a successful flee.
  let fledSeed = null;
  for (let s = 0; s < 50 && fledSeed == null; s++) {
    const c = createCombat({ ...roster(), seed: s });
    // fast-forward to a party turn
    let guard = 0;
    while (c.active() && c.active().side !== 'party' && guard++ < 10) c.take();
    if (!c.active()) continue;
    const r = c.take({ type: 'flee' });
    if (r.event === 'fled') fledSeed = s;
  }
  assert.ok(fledSeed != null, 'expected at least one seed to yield a successful flee');
  const c = createCombat({ ...roster(), seed: fledSeed });
  let guard = 0;
  while (c.active() && c.active().side !== 'party' && guard++ < 10) c.take();
  const r = c.take({ type: 'flee' });
  assert.equal(r.outcome, 'fled');
  assert.equal(c.over, true);
});

test('talk is not yet available and yields no approaches (verb-gating is a later increment)', () => {
  const c = createCombat({ ...roster(), seed: 3 });
  while (c.active() && c.active().side !== 'party') c.take();
  const r = c.take({ type: 'talk', target: 'rat' });
  assert.equal(r.ok, false);
  assert.equal(r.event, 'no-parley');
  assert.deepEqual(r.approaches, []);
});

test('a fight targeting a dead / unknown foe reports no-target', () => {
  const c = createCombat({ ...roster(), seed: 3 });
  while (c.active() && c.active().side !== 'party') c.take();
  const r = c.take({ type: 'fight', target: 'ghost' });
  assert.equal(r.ok, false);
  assert.equal(r.event, 'no-target');
});

test('state() snapshot reports living combatants and hp', () => {
  const c = createCombat({ ...roster(), seed: 1 });
  const s = c.state();
  assert.equal(s.over, false);
  assert.equal(s.party.length, 1);
  assert.equal(s.foes.length, 1);
  assert.equal(s.party[0].hp, 10);
});

test('damage reads the weapon, not any stat present on the spec', () => {
  // Two identical weapons but wildly different (irrelevant) stat fields: the
  // fight must resolve identically, proving stats never touch damage.
  const base = (extra) => ({
    party: [{ id: 'pc', hp: 20, weapon: { dmg: [4, 4] }, ...extra }],
    foes: [{ id: 'f', hp: 12, weapon: { dmg: [2, 2] } }],
    seed: 9,
  });
  const plain = runToEnd(base({}));
  const buffed = runToEnd(base({ nerve: 'UNCANNY', craft: 'SHARP', pull: 99 }));
  assert.deepEqual(plain.log, buffed.log);
});
