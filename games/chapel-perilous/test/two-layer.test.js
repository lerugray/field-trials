// M11 — the two-layer verb model (Ray, RESOLVED 2026-08-02). Talk works at the
// encounter layer (before blows); once blows land, in-combat talk HARDENS for all but
// beings flagged talk-capable-in-combat. Combat flee is the riskier layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/engine/combat.js';
import { createCharacter } from '../src/engine/character.js';

// A PC whose ranks unlock a biting verb against the foe below.
const pc = createCharacter({
  name: 'PC', hp: 20, oddment: { name: 'knife', dmg: [1, 2] },
  stats: { nerve: 'SHARP', craft: 'STEADY', pull: 'STEADY', gnosis: 'STEADY' }, fnord: 'STEADY',
});

// A foe you can overawe (NERVE bites). Not talk-capable once fighting.
const softFoe = { id: 'clerk', name: 'Clerk', hp: 12, weapon: { dmg: [2, 3] }, side: 'foe',
  ref: { id: 'clerk', name: 'Clerk', hp: 12, weapon: { dmg: [2, 3] }, interaction: { overawe: 'open' }, recruitable: true } };
// Same, but flagged talk-capable-in-combat.
const stillListens = { id: 'monk', name: 'Monk', hp: 12, weapon: { dmg: [2, 3] }, side: 'foe',
  ref: { id: 'monk', name: 'Monk', hp: 12, weapon: { dmg: [2, 3] }, interaction: { overawe: 'open' }, recruitable: true, talkInCombat: true } };

function mk(foe) {
  return createCombat({ party: [pc.toCombatantSpec()], foes: [foe], seed: 3, pc, roster: null });
}

test('before blows land, talk is available (encounter layer)', () => {
  const c = mk(softFoe);
  assert.equal(c.engaged, false);
  assert.equal(c.canTalk('clerk'), true, 'talk is open at contact');
});

test('once blows land, talk hardens for an ordinary foe', () => {
  const c = mk(softFoe);
  // PC lands a blow (or foe does) — either way blowsLanded flips
  while (c.active() && c.active().side === 'foe') c.take();
  c.take({ type: 'fight', target: 'clerk' });
  assert.equal(c.engaged, true);
  assert.equal(c.canTalk('clerk'), false, 'no more words for it mid-fight');
  // return to the PC's turn, then try to talk
  while (!c.over && c.active() && c.active().side === 'foe') c.take();
  const res = c.take({ type: 'talk', target: 'clerk', verb: 'overawe' });
  assert.equal(res.event, 'talk-hardened');
});

test('a talk-capable-in-combat being still listens after blows land', () => {
  const c = mk(stillListens);
  while (c.active() && c.active().side === 'foe') c.take();
  c.take({ type: 'fight', target: 'monk' });
  assert.equal(c.engaged, true);
  assert.equal(c.canTalk('monk'), true, 'flagged beings keep listening');
});
