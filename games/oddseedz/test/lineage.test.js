import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEADOW_CAP, BADGE_CAP, INHERIT_BOOST, WILD_SEED,
  isRetirementDue, makeRetiree, retireCreature,
  breedEgg, hatchEgg, freshBaseline, inheritedDeltas,
} from '../src/engine/lineage.js';
import { LIFESPAN_WEEKS, STAT_CAP, STAT_FLOOR, resolveWeek } from '../src/engine/raise.js';
import { STAT_KEYS, STAT_BANDS, summon } from '../src/engine/summon.js';
import { newGame, newGameFromEgg, serialize, deserialize } from '../src/engine/save.js';

// A champion-ish retiree fixture, shaped like a real trained creature.
function champ(over = {}) {
  return {
    name: 'Bruno',
    seed: 1234,
    age: 32,
    species: { id: 'wolf', name: 'Wolf', archetype: 'quad', hue: 30 },
    rarity: 'rare',
    stats: { pow: 80, def: 40, spd: 55, sta: 50, foc: 35 },
    temperament: 'Bold',
    variant: 42,
    ...over,
  };
}
function mate(over = {}) {
  return {
    name: 'Pica',
    seed: 9876,
    age: 30,
    species: { id: 'owl', name: 'Owl', archetype: 'bird', hue: 210 },
    rarity: 'uncommon',
    stats: { pow: 30, def: 45, spd: 70, sta: 40, foc: 60 },
    temperament: 'Calm',
    variant: 7,
    ...over,
  };
}

test('retirement comes due only at the end of the lifespan', () => {
  assert.equal(isRetirementDue({ age: LIFESPAN_WEEKS - 1 }), false);
  assert.equal(isRetirementDue({ age: LIFESPAN_WEEKS }), true);
  assert.equal(isRetirementDue({ age: LIFESPAN_WEEKS + 5 }), true);
  assert.equal(isRetirementDue(null), false);
});

test('makeRetiree freezes a read-only sheet: identity, final stats, rank, weeks lived', () => {
  const r = makeRetiree(champ({ age: 33 }), { rank: 'C' });
  assert.equal(r.name, 'Bruno');
  assert.equal(r.rarity, 'rare');
  assert.equal(r.rank, 'C');
  assert.equal(r.retiredAtAge, 33);
  assert.deepEqual(r.stats, { pow: 80, def: 40, spd: 55, sta: 50, foc: 35 });
  // a snapshot, not a live alias
  r.stats.pow = 1;
  assert.equal(champ().stats.pow, 80);
});

test('retireCreature appends to the Meadow and hands back an estate between generations', () => {
  const state = { creature: champ(), estate: { money: 200, toys: ['ball'], meadow: [] } };
  const { estate, retiree } = retireCreature(state);
  assert.equal(estate.meadow.length, 1);
  assert.equal(estate.meadow[0].name, 'Bruno');
  assert.equal(retiree.name, 'Bruno');
  // estate values persist untouched
  assert.equal(estate.money, 200);
  assert.deepEqual(estate.toys, ['ball']);
});

test('the Meadow is capped: the oldest retiree rolls off', () => {
  let estate = { meadow: [] };
  for (let i = 0; i < MEADOW_CAP + 3; i++) {
    ({ estate } = retireCreature({ creature: champ({ name: `R${i}`, seed: i }), estate }));
  }
  assert.equal(estate.meadow.length, MEADOW_CAP);
  // the three earliest are gone; the newest is present
  assert.equal(estate.meadow.at(-1).name, `R${MEADOW_CAP + 2}`);
  assert.ok(!estate.meadow.some((r) => r.name === 'R0'));
});

test('breedEgg is deterministic: same parents + salt hatch the same heir', () => {
  const a = breedEgg(champ(), mate(), 0);
  const b = breedEgg(champ(), mate(), 0);
  assert.deepEqual(a, b);
  // a different salt re-rolls a distinct heir
  const c = breedEgg(champ(), mate(), 1);
  assert.notDeepEqual(a.baseStats, c.baseStats);
});

test('an heir inherits its parents\' best stats as boosted head-starts', () => {
  const egg = breedEgg(champ(), mate(), 0);
  // Bruno's top is pow, Pica's top is spd -> both boosted
  assert.ok(egg.boosted.includes('pow'));
  assert.ok(egg.boosted.includes('spd'));
  // a boosted stat clears a plausible unboosted baseline (head-start is visible)
  assert.ok(egg.baseStats.pow >= INHERIT_BOOST);
  for (const k of STAT_KEYS) {
    assert.ok(egg.baseStats[k] >= STAT_FLOOR && egg.baseStats[k] <= STAT_CAP);
  }
});

// M12: a first heir must VISIBLY carry its parent — meaningfully above a fresh
// summon, not the sub-fresh runt the old constants produced. Bot-simmed like the
// balance harness: raise a real parent, breed generation one against the wild
// seed, and measure the heir against a fresh summon of its own rarity.
const RAISE_PLAN = [
  'drill_pow', 'drill_spd', 'drill_def', 'rest', 'drill_sta', 'drill_foc',
  'play', 'drill_pow', 'drill_spd', 'drill_def', 'drill_foc', 'rest',
];
function raisedParent(t) {
  let st = newGame(summon('heirparent' + t), 1);
  for (let w = 0; w < 20; w++) {
    const r = resolveWeek(st, RAISE_PLAN);
    st = { ...st, creature: r.creature, estate: r.estate };
  }
  return makeRetiree(st.creature, st.estate.career);
}

test('freshBaseline is the fresh-summon band midpoint of that rarity', () => {
  for (const r of Object.keys(STAT_BANDS)) {
    const [lo, hi] = STAT_BANDS[r];
    assert.equal(freshBaseline(r), Math.round((lo + hi) / 2));
  }
});

test('inheritedDeltas pairs each stat with its delta vs the fresh baseline', () => {
  const egg = breedEgg(champ(), mate(), 0);
  const base = freshBaseline(egg.rarity);
  const d = inheritedDeltas(egg);
  assert.equal(d.length, STAT_KEYS.length);
  for (const row of d) {
    assert.equal(row.value, egg.baseStats[row.key]);
    assert.equal(row.delta, egg.baseStats[row.key] - base);
  }
});

test('a first heir carries its parent — above a fresh summon of its rarity (M12)', () => {
  const N = 40;
  let heirAvgSum = 0;
  let baseSum = 0;
  let suitBelow = 0;
  for (let t = 0; t < N; t++) {
    const parent = raisedParent(t);
    const egg = breedEgg(parent, null, t); // generation one: real parent + wild seed
    assert.equal(egg.generationOne, true);
    const base = freshBaseline(egg.rarity);
    const heirAvg = STAT_KEYS.reduce((a, k) => a + egg.baseStats[k], 0) / STAT_KEYS.length;
    heirAvgSum += heirAvg;
    baseSum += base;
    // the inherited suit (a boosted stat) clears the fresh baseline with a clear
    // margin — that is the visible sign the parent's training carried forward.
    const suit = Math.max(...egg.boosted.map((k) => egg.baseStats[k]));
    if (suit <= base + 6) suitBelow++;
    // and no heir is a runt: every stat is at least the fresh-summon floor.
    const floor = STAT_BANDS[egg.rarity][0];
    for (const k of STAT_KEYS) assert.ok(egg.baseStats[k] >= floor, `${k} below fresh floor`);
  }
  // on average a first heir out-stats a fresh summon of its rarity (the lineage
  // payoff is real, not cosmetic).
  assert.ok(
    heirAvgSum / N > baseSum / N,
    `first-heir avg ${(heirAvgSum / N).toFixed(1)} must beat fresh baseline ${(baseSum / N).toFixed(1)}`,
  );
  // the parent's suit essentially always shows through.
  assert.ok(suitBelow <= 2, `heir suit should clear the baseline (fell short ${suitBelow}/${N})`);
});

test('the bloodline never weakens: heir rarity is at least the best parent\'s', () => {
  const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (let salt = 0; salt < 30; salt++) {
    const egg = breedEgg(champ(), mate(), salt); // best parent is rare
    assert.ok(RANK.indexOf(egg.rarity) >= RANK.indexOf('rare'));
  }
});

test('generation one breeds a lone retiree against the wild seed', () => {
  const egg = breedEgg(champ(), null, 0);
  assert.equal(egg.generationOne, true);
  assert.equal(egg.parents.length, 2);
  assert.equal(egg.parents[1].wild, true);
  // still inherits real traits from the one real parent
  assert.ok(egg.boosted.includes('pow'));
  // the wild-seed line still stamps a foundling badge
  assert.ok(egg.badges.some((b) => b.includes('Child of Bruno')));
});

test('two real parents give the heir a legible, capped badge chain', () => {
  const egg = breedEgg(champ({ rank: 'C' }), mate({ rank: 'D' }), 3);
  assert.ok(egg.badges.includes('Child of Bruno'));
  assert.ok(egg.badges.includes('Child of Pica'));
  assert.ok(egg.badges.some((b) => /rank line/.test(b)));
  assert.ok(egg.badges.length <= BADGE_CAP);
});

test('hatchEgg produces a summon-shaped creature carrying its lineage', () => {
  const egg = breedEgg(champ(), mate(), 0);
  const heir = hatchEgg(egg);
  // summon-shaped: every field the rest of the engine expects
  for (const f of ['name', 'seed', 'species', 'rarity', 'stats', 'temperament', 'variant']) {
    assert.ok(heir[f] !== undefined, `heir missing ${f}`);
  }
  assert.deepEqual(heir.stats, egg.baseStats);
  assert.equal(heir.lineage.parents.length, 2);
  assert.deepEqual(heir.lineage.boosted, egg.boosted);
  assert.ok(heir.lineage.badges.length >= 1);
});

test('WILD_SEED is a modest common drifter (the always-gives fallback)', () => {
  assert.equal(WILD_SEED.rarity, 'common');
  assert.equal(WILD_SEED.wild, true);
});

test('newGameFromEgg preserves money/toys/Meadow but resets pet + career', () => {
  const egg = breedEgg(champ(), mate(), 0);
  const prior = {
    money: 333,
    toys: ['ball', 'bell'],
    record: { wins: 5, losses: 2 },
    meadow: [makeRetiree(champ(), { rank: 'C' })],
    career: { rank: 'C', rankWins: 3, nextMandatory: 40, metCycle: true, log: [] },
  };
  const st = newGameFromEgg(egg, prior, 100);
  assert.equal(st.estate.money, 333);
  assert.deepEqual(st.estate.toys, ['ball', 'bell']);
  assert.equal(st.estate.meadow.length, 1); // bloodline persists
  assert.deepEqual(st.estate.record, { wins: 5, losses: 2 }); // estate record survives
  assert.equal(st.estate.career.rank, 'E'); // heir starts the ladder over
  assert.equal(st.creature.age, 1);
  assert.equal(st.creature.lineage.parents.length, 2);
});

test('a save round-trips the Meadow and survives a between-generations reload', () => {
  // a normal game, then retire into the Meadow with no active heir yet
  const g = newGame(champ(), 0);
  const { estate } = retireCreature({ creature: g.creature, estate: g.estate });
  const between = { version: 6, createdAt: 0, creature: null, estate };
  const back = deserialize(serialize(between));
  assert.ok(back, 'between-generations save must survive');
  assert.equal(back.creature, null);
  assert.equal(back.estate.meadow.length, 1);
  assert.equal(back.estate.meadow[0].name, 'Bruno');

  // and a hatched heir round-trips with its lineage intact
  const egg = breedEgg(champ(), mate(), 0);
  const st = newGameFromEgg(egg, estate, 1);
  const back2 = deserialize(serialize(st));
  assert.ok(back2.creature.lineage);
  assert.equal(back2.estate.meadow.length, 1);
});

test('an empty between-generations save (no creature, no Meadow) degrades to no-save', () => {
  const junk = { version: 6, creature: null, estate: { money: 100, meadow: [] } };
  assert.equal(deserialize(serialize(junk)), null);
});
