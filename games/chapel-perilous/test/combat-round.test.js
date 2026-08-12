// cp-018 — per-round combat legibility trail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat, formatCombatRound } from '../src/engine/combat.js';

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

test('seeded combat round records attacker, roll, damage, and player hp after', () => {
  const c = runToEnd({
    party: [{ id: 'pc', name: 'Initiate', hp: 10, weapon: { name: 'knife', dmg: [3, 3] } }],
    foes: [{ id: 'rat', name: 'Rat', hp: 4, weapon: { name: 'teeth', dmg: [1, 1] } }],
    seed: 7,
  });
  assert.equal(c.outcome, 'win');
  assert.equal(c.rounds.length, 4, `expected 4 rounds, got ${c.rounds.length}`);

  const lines = c.rounds.map((r) => formatCombatRound(r, 10));
  assert.deepEqual(lines, [
    'Round 1 - Rat strikes Initiate: rolled 1 (teeth), dealt 1, you 9/10',
    'Round 1 - Initiate strikes Rat: rolled 3 (knife), dealt 3, you 9/10',
    'Round 2 - Rat strikes Initiate: rolled 1 (teeth), dealt 1, you 8/10',
    'Round 2 - Initiate strikes Rat: rolled 3 (knife), dealt 3, you 8/10; Rat falls',
  ]);

  const first = c.rounds[0];
  assert.equal(first.action, 'attack');
  assert.equal(first.actor.name, 'Rat');
  assert.equal(first.actor.side, 'foe');
  assert.equal(first.target.name, 'Initiate');
  assert.equal(first.weapon, 'teeth');
  assert.equal(first.rolled, 1);
  assert.equal(first.damage, 1);
  assert.equal(first.pcHpAfter, 9);
  assert.equal(first.fell, false);

  const last = c.rounds[c.rounds.length - 1];
  assert.equal(last.fell, true);
  assert.equal(last.pcHpAfter, 8);
});

test('formatted round uses plain English with no em-dashes', () => {
  const c = runToEnd({
    party: [{ id: 'pc', name: 'Initiate', hp: 10, weapon: { name: 'knife', dmg: [3, 3] } }],
    foes: [{ id: 'rat', name: 'Rat', hp: 4, weapon: { name: 'teeth', dmg: [1, 1] } }],
    seed: 7,
  });
  for (const r of c.rounds) {
    const line = formatCombatRound(r, 10);
    assert.ok(!line.includes('—'), `round line should not contain an em-dash: ${line}`);
    assert.ok(line.includes('Round ') && line.includes('rolled ') && line.includes('dealt '));
  }
});
