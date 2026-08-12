import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, createRoster, RANKS, STATS } from '../src/engine/character.js';
import { availableApproaches, canApproach, resolveApproach, DIFFICULTY_RANK } from '../src/engine/negotiation.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createCombat } from '../src/engine/combat.js';
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };

const bestiary = createBestiary(beingsData);

test('character exposes word-rank stats and gates verbs, never numerals', () => {
  const c = createCharacter({ nerve: 'SHARP', craft: 'SHAKY', pull: 'STEADY', gnosis: 'UNCANNY' });
  assert.equal(c.rank('nerve'), 'SHARP');
  // SHAKY craft => no 'impress' lever; the others are >= STEADY
  assert.equal(c.hasVerb('impress'), false);
  assert.deepEqual(c.verbs().sort(), ['bargain', 'bind', 'overawe']);
  // rankIndex is a comparison ordinal only
  assert.ok(c.rankIndex('gnosis') > c.rankIndex('pull'));
});

test('invalid ranks and stats are rejected', () => {
  assert.throws(() => createCharacter({ nerve: 'GODLIKE' }), /rank/);
  const c = createCharacter({});
  assert.throws(() => c.rank('luck'));
});

test('availableApproaches intersects being profile with statline rank thresholds', () => {
  const clerk = bestiary.get('gutter-clerk'); // bargain:open, overawe:hard
  // A STEADY-across character clears 'open' (bargain) but not 'hard' (overawe).
  const mid = createCharacter({ nerve: 'STEADY', pull: 'STEADY', craft: 'STEADY', gnosis: 'STEADY' });
  assert.deepEqual(availableApproaches(mid, clerk).map((a) => a.verb), ['bargain']);
  // A SHARP-nerve character now also unlocks the hard overawe.
  const bold = createCharacter({ nerve: 'SHARP', pull: 'STEADY', craft: 'STEADY', gnosis: 'STEADY' });
  assert.deepEqual(availableApproaches(bold, clerk).map((a) => a.verb).sort(), ['bargain', 'overawe']);
  // A SHAKY-pull character loses even the open bargain.
  const shaky = createCharacter({ pull: 'SHAKY' });
  assert.equal(canApproach(shaky, clerk, 'bargain'), false);
});

test('difficulty maps to the required rank ladder', () => {
  assert.equal(DIFFICULTY_RANK.open, 'STEADY');
  assert.equal(DIFFICULTY_RANK.hard, 'SHARP');
});

test('sacred beings refuse every approach regardless of statline', () => {
  const maxed = createCharacter(Object.fromEntries(STATS.map((s) => [s, 'UNCANNY'])));
  const thing = bestiary.get('thing-in-the-23rd-corridor');
  assert.deepEqual(availableApproaches(maxed, thing), []);
});

test('a legal approach recruits into an open roster and parleys when full', () => {
  const c = createCharacter({ pull: 'STEADY' });
  const roster = createRoster(c, { capacity: 1 });
  const clerk = bestiary.get('gutter-clerk');
  const r1 = resolveApproach(c, clerk, 'bargain', roster);
  assert.equal(r1.outcome, 'recruit');
  assert.equal(roster.has('gutter-clerk'), true);
  // roster now full: the same approach still lands but only parleys
  const pilgrim = bestiary.get('hollow-pilgrim');
  const cc = createCharacter({ nerve: 'STEADY' });
  const r2 = resolveApproach(cc, pilgrim, 'overawe', roster);
  assert.equal(r2.outcome, 'parley');
  assert.equal(roster.size, 2); // pc + 1 follower, unchanged
});

test('an unavailable verb cannot be forced', () => {
  const shaky = createCharacter({ nerve: 'SHAKY', pull: 'SHAKY', craft: 'SHAKY', gnosis: 'SHAKY' });
  const clerk = bestiary.get('gutter-clerk');
  const r = resolveApproach(shaky, clerk, 'bargain', createRoster(shaky));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unavailable');
});

test('roster capacity grows and cannot recruit sacred beings', () => {
  const c = createCharacter({});
  const roster = createRoster(c, { capacity: 1 });
  assert.equal(roster.recruit(bestiary.get('thing-in-the-23rd-corridor')).ok, false);
  roster.grow(2);
  assert.equal(roster.capacity, 3);
});

test('talk resolves inside combat: recruit a foe mid-fight, then it leaves the fray', () => {
  const c = createCharacter({ pull: 'STEADY' }); // can bargain the clerk
  const roster = createRoster(c, { capacity: 2 });
  const clerk = bestiary.toCombatantSpec('gutter-clerk');
  const combat = createCombat({ party: [c.toCombatantSpec()], foes: [clerk], seed: 5, pc: c, roster });
  // fast-forward to a PC turn
  while (combat.active() && combat.active().side !== 'party') combat.take();
  // ask for the menu first (no verb) — must not consume the turn
  const menu = combat.take({ type: 'talk', target: 'gutter-clerk' });
  assert.equal(menu.event, 'choose-verb');
  assert.ok(menu.approaches.some((a) => a.verb === 'bargain'));
  assert.equal(combat.active().side, 'party', 'menu did not consume the turn');
  // now commit the verb
  const done = combat.take({ type: 'talk', target: 'gutter-clerk', verb: 'bargain' });
  assert.equal(done.ok, true);
  assert.equal(combat.over, true);
  assert.equal(combat.outcome, 'parley', 'talking down the only foe ends without violence');
  assert.equal(combat.recruited.length, 1);
  assert.equal(roster.has('gutter-clerk'), true);
});

test('talk against a sacred foe reports no-parley and falls through to fighting', () => {
  const c = createCharacter(Object.fromEntries(STATS.map((s) => [s, 'UNCANNY'])));
  const roster = createRoster(c);
  const thing = bestiary.toCombatantSpec('thing-in-the-23rd-corridor');
  const combat = createCombat({ party: [c.toCombatantSpec()], foes: [thing], seed: 1, pc: c, roster });
  while (combat.active() && combat.active().side !== 'party') combat.take();
  const r = combat.take({ type: 'talk', target: thing.id });
  assert.equal(r.ok, false);
  assert.equal(r.event, 'no-parley');
  assert.deepEqual(r.approaches, []);
});

test('without a pc, talk in combat is unavailable (back-compat)', () => {
  const combat = createCombat({ party: [{ id: 'pc', hp: 10 }], foes: [bestiary.toCombatantSpec('cave-rat')], seed: 1 });
  while (combat.active() && combat.active().side !== 'party') combat.take();
  const r = combat.take({ type: 'talk' });
  assert.equal(r.ok, false);
  assert.equal(r.event, 'no-parley');
});

test('recruitment odds respond to the modifying stat: weak stats have no approaches', () => {
  // gutter-clerk is bargain:open, overawe:hard — a SHAKY-all character clears nothing.
  const weak = createCharacter({ nerve: 'SHAKY', pull: 'SHAKY', craft: 'SHAKY', gnosis: 'SHAKY' });
  const clerk = bestiary.get('gutter-clerk');
  assert.equal(availableApproaches(weak, clerk).length, 0);
  const r = resolveApproach(weak, clerk, 'bargain', createRoster(weak));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unavailable');

  // A character with the matching stat opens the approach and recruits.
  const strong = createCharacter({ pull: 'STEADY' });
  assert.ok(availableApproaches(strong, clerk).map((a) => a.verb).includes('bargain'));
  const rr = resolveApproach(strong, clerk, 'bargain', createRoster(strong));
  assert.equal(rr.ok, true);
  assert.equal(rr.outcome, 'recruit');
});
