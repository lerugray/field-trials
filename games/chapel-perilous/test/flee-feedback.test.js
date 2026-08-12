// cp-018 — flee attempt surfaces its odds, roll, and result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/engine/combat.js';

const roster = (seed) => ({
  party: [{ id: 'pc', name: 'Initiate', hp: 10, weapon: { name: 'knife', dmg: [3, 3] } }],
  foes: [{ id: 'rat', name: 'Rat', hp: 4, weapon: { name: 'teeth', dmg: [1, 1] } }],
  seed,
});

function firstPartyTurn(c) {
  let guard = 0;
  while (c.active() && c.active().side !== 'party' && guard++ < 10) c.take();
}

test('a successful flee round records chance, roll, and success', () => {
  let successSeed = null;
  for (let s = 0; s < 50 && successSeed == null; s++) {
    const c = createCombat(roster(s));
    firstPartyTurn(c);
    if (!c.active() || c.engaged) continue;
    const r = c.take({ type: 'flee' });
    if (r.event === 'fled') successSeed = s;
  }
  assert.ok(successSeed != null, 'expected at least one seed to produce a successful flee');

  const c = createCombat(roster(successSeed));
  firstPartyTurn(c);
  const res = c.take({ type: 'flee' });
  assert.equal(res.event, 'fled');
  assert.equal(c.outcome, 'fled');

  const fleeRound = c.rounds[c.rounds.length - 1];
  assert.equal(fleeRound.action, 'flee');
  assert.equal(fleeRound.actor.id, 'pc');
  assert.equal(fleeRound.chance, 0.5);
  assert.ok(typeof fleeRound.roll === 'number');
  assert.ok(fleeRound.roll < fleeRound.chance);
  assert.equal(fleeRound.success, true);
});

test('a failed flee round records chance, roll, and failure', () => {
  let failSeed = null;
  for (let s = 0; s < 50 && failSeed == null; s++) {
    const c = createCombat(roster(s));
    firstPartyTurn(c);
    if (!c.active() || c.engaged) continue;
    const r = c.take({ type: 'flee' });
    if (r.event === 'flee-fail') failSeed = s;
  }
  assert.ok(failSeed != null, 'expected at least one seed to produce a failed flee');

  const c = createCombat(roster(failSeed));
  firstPartyTurn(c);
  const res = c.take({ type: 'flee' });
  assert.equal(res.event, 'flee-fail');
  assert.equal(c.outcome, null);

  const fleeRound = c.rounds[c.rounds.length - 1];
  assert.equal(fleeRound.action, 'flee');
  assert.equal(fleeRound.chance, 0.5);
  assert.ok(typeof fleeRound.roll === 'number');
  assert.ok(fleeRound.roll >= fleeRound.chance);
  assert.equal(fleeRound.success, false);
});

test('flee odds drop to 35% once blows have landed', () => {
  // Run until a blow lands, then flee. The recorded chance must be the lower one.
  let hitSeed = null;
  for (let s = 0; s < 50 && hitSeed == null; s++) {
    const c = createCombat(roster(s));
    firstPartyTurn(c);
    if (!c.active()) continue;
    c.take({ type: 'fight', target: c.living('foe')[0].id });
    if (c.engaged) hitSeed = s;
  }
  assert.ok(hitSeed != null, 'expected at least one seed where a blow lands before fleeing');

  const c = createCombat(roster(hitSeed));
  firstPartyTurn(c);
  c.take({ type: 'fight', target: c.living('foe')[0].id });
  assert.equal(c.engaged, true);
  while (c.active() && c.active().side !== 'party') c.take();
  c.take({ type: 'flee' });

  const fleeRound = c.rounds[c.rounds.length - 1];
  assert.equal(fleeRound.action, 'flee');
  assert.equal(fleeRound.chance, 0.35, 'flee chance should harden to 35% after blows land');
});
