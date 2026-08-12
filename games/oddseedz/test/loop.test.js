// The M6 gate, proven in the engine: the WHOLE lineage loop, run headless across
// several generations. summon → raise a full lifespan → retire into the Meadow →
// inherit the next egg → hatch → repeat. This is the milestone's integration
// proof, complementing scripts/shoot-m6.mjs (which proves the same loop on
// screen). The invariants it guards: the bloodline persists and grows, money
// never goes negative, every heir carries a visible lineage, and the loop never
// dead-ends from any state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon } from '../src/engine/summon.js';
import { newGame, newGameFromEgg } from '../src/engine/save.js';
import { resolveWeek, DRILL_IDS, weekBudget } from '../src/engine/raise.js';
import { advanceCalendar } from '../src/engine/career.js';
import { isRetirementDue, retireCreature, breedEgg } from '../src/engine/lineage.js';

// Live one pet from hatch to retirement, drilling every week (the calendar tick
// runs too, so mandatory-meet fines apply — money must still never go negative).
function raiseToRetirement(state) {
  let s = state;
  let guard = 0;
  while (!isRetirementDue(s.creature) && guard++ < 200) {
    const budget = weekBudget(s.creature);
    const plan = Array.from({ length: budget }, (_, i) => DRILL_IDS[i % DRILL_IDS.length]);
    const res = resolveWeek(s, plan);
    s = { ...s, creature: res.creature, estate: res.estate };
    const cal = advanceCalendar(s.estate, res.creature.age);
    s = { ...s, estate: cal.estate };
    assert.ok(s.estate.money >= 0, 'money must never go negative during raising');
  }
  assert.ok(isRetirementDue(s.creature), 'a pet must age into retirement');
  return s;
}

test('the full lineage loop runs across three generations without dead-ending', () => {
  let state = newGame(summon('a founding line'), 0);
  const lineageNames = [];

  for (let gen = 0; gen < 3; gen++) {
    // raise this generation to the end of its life
    state = raiseToRetirement(state);

    // retire — alive — into the Meadow; the pet is now a frozen record
    const { estate } = retireCreature(state);
    state = { ...state, creature: null, estate };
    assert.equal(state.creature, null, 'between generations there is no active pet');
    assert.equal(estate.meadow.length, gen + 1, 'the Meadow grows by one each generation');
    assert.ok(estate.meadow.at(-1).stats, 'the retiree carries a read-only stat sheet');

    // inherit: breed the newest retiree (gen one uses the wild-seed fallback;
    // later generations can pair the two most recent champions)
    const meadow = estate.meadow;
    const parentA = meadow.at(-1);
    const parentB = meadow.length >= 2 ? meadow.at(-2) : null;
    const egg = breedEgg(parentA, parentB, 0);

    // the heir inherits visible traits: 1-2 boosted stats and a badge chain
    assert.ok(egg.boosted.length >= 1 && egg.boosted.length <= 2);
    assert.ok(egg.badges.some((b) => b.startsWith('Child of')));

    // a boosted stat reflects a real parent's strength, not a floor value
    const topParentStat = Math.max(...Object.values(parentA.stats));
    assert.ok(topParentStat > 40, 'a raised champion should have a strong suit to pass on');

    // hatch the heir; the estate (money, toys, the whole Meadow) persists
    const moneyBefore = estate.money;
    const next = newGameFromEgg(egg, estate, gen + 1);
    assert.equal(next.estate.meadow.length, gen + 1, 'the bloodline carries forward');
    assert.equal(next.estate.money, moneyBefore, 'money persists across the generation');
    assert.equal(next.creature.age, 1, 'the heir starts fresh');
    assert.ok(next.creature.lineage, 'the heir carries a visible lineage block');
    assert.equal(next.estate.career.rank, 'E', 'the heir climbs the ladder from E');

    lineageNames.push(next.creature.name);
    state = next;
  }

  assert.equal(lineageNames.length, 3, 'three heirs hatched in sequence');
});

test('generation two can pair two real champions into a two-parent heir', () => {
  // build a Meadow with two trained retirees
  let state = newGame(summon('first champion'), 0);
  state = raiseToRetirement(state);
  let { estate } = retireCreature(state);
  state = newGameFromEgg(breedEgg(estate.meadow.at(-1), null, 0), estate, 1);
  state = raiseToRetirement(state);
  ({ estate } = retireCreature(state));
  assert.equal(estate.meadow.length, 2);

  // now both parents are real (no wild seed) -> two "Child of" badges
  const egg = breedEgg(estate.meadow.at(-1), estate.meadow.at(-2), 0);
  const childBadges = egg.badges.filter((b) => b.startsWith('Child of'));
  assert.equal(childBadges.length, 2, 'a two-parent heir names both parents');
  assert.equal(egg.generationOne, false);
  assert.equal(egg.parents.every((p) => !p.wild), true, 'no wild seed when two real parents breed');
});
