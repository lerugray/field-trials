// M12 A4 — talk-outcome persistence (text-only, ADDENDUM #1). Every resolveApproach
// outcome gets a DISTINCT register-voiced line — recruit / parley / verb-unavailable,
// no shared fallback — recorded in the combat log so the result is durable, not a flash
// in combatNote that the next render overwrites. This locks the engine narrator that the
// shell threads in; the persistent eventLog (Part B) and framed beat (Part C) come later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, createRoster, STATS } from '../src/engine/character.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createCombat } from '../src/engine/combat.js';
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };

const bestiary = createBestiary(beingsData);

// A narrator that tags each event class distinctly so we can prove the log carries the
// right one (mirrors how the shell backs this with the register combat prose).
const narrate = (event, ctx) => `VOICE:${event}:${ctx && ctx.foe ? ctx.foe.name : '?'}`;

function toPcTurn(combat) {
  while (combat.active() && combat.active().side !== 'party') combat.take();
}

test('a recruit logs the register recruit line (distinct class), not menu-speak', () => {
  const c = createCharacter({ pull: 'STEADY' });
  const roster = createRoster(c, { capacity: 2 });
  const clerk = bestiary.toCombatantSpec('gutter-clerk');
  const combat = createCombat({ party: [c.toCombatantSpec()], foes: [clerk], seed: 5, pc: c, roster, narrate });
  toPcTurn(combat);
  const done = combat.take({ type: 'talk', target: 'gutter-clerk', verb: 'bargain' });
  assert.equal(done.ok, true);
  assert.ok(combat.log.some((l) => l.startsWith('VOICE:recruit:')), `recruit voiced in log: ${JSON.stringify(combat.log)}`);
  assert.ok(!combat.log.some((l) => /joins you/.test(l)), 'no menu-speak fallback when a narrator is present');
});

test('a parley (roster full) logs the register parley line, distinct from recruit', () => {
  const c = createCharacter({ nerve: 'STEADY', pull: 'STEADY' });
  const roster = createRoster(c, { capacity: 1 });
  roster.recruit(bestiary.get('gutter-clerk')); // fill the one slot → the next talk-down only parleys
  const pilgrim = bestiary.toCombatantSpec('hollow-pilgrim');
  const combat = createCombat({ party: [c.toCombatantSpec()], foes: [pilgrim], seed: 5, pc: c, roster, narrate });
  toPcTurn(combat);
  const done = combat.take({ type: 'talk', target: 'hollow-pilgrim', verb: 'overawe' });
  assert.equal(done.ok, true);
  assert.ok(combat.log.some((l) => l.startsWith('VOICE:parley:')), `parley voiced in log: ${JSON.stringify(combat.log)}`);
  assert.ok(!combat.log.some((l) => l.startsWith('VOICE:recruit:')), 'a full roster parleys, it does not recruit');
});

test('a verb that does not bite logs a distinct verb-unavailable line and spends no turn', () => {
  // The menu offers bargain (STEADY pull clears it), but overawe needs SHARP nerve the
  // pc lacks — so a forced overawe reaches resolveApproach and fails: verb-unavailable
  // (distinct from no-parley, which is "nothing bites at all").
  const c = createCharacter({ nerve: 'STEADY', pull: 'STEADY', craft: 'STEADY', gnosis: 'STEADY' });
  const roster = createRoster(c, { capacity: 2 });
  const clerk = bestiary.toCombatantSpec('gutter-clerk');
  const combat = createCombat({ party: [c.toCombatantSpec()], foes: [clerk], seed: 5, pc: c, roster, narrate });
  toPcTurn(combat);
  const before = combat.active();
  const r = combat.take({ type: 'talk', target: 'gutter-clerk', verb: 'overawe' });
  assert.equal(r.ok, false);
  assert.equal(r.event, 'verb-unavailable');
  assert.ok(combat.log.some((l) => l.startsWith('VOICE:verb-unavailable:')), `unavailable voiced: ${JSON.stringify(combat.log)}`);
  assert.equal(combat.active(), before, 'a refused verb consumes no turn');
});

test('without a narrator the engine keeps its terse English (headless back-compat)', () => {
  const c = createCharacter({ pull: 'STEADY' });
  const roster = createRoster(c, { capacity: 2 });
  const clerk = bestiary.toCombatantSpec('gutter-clerk');
  const combat = createCombat({ party: [c.toCombatantSpec()], foes: [clerk], seed: 5, pc: c, roster }); // no narrate
  toPcTurn(combat);
  combat.take({ type: 'talk', target: 'gutter-clerk', verb: 'bargain' });
  assert.ok(combat.log.some((l) => /joins you/.test(l)), 'falls back to the internal line');
});
