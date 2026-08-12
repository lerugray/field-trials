import test from 'node:test';
import assert from 'node:assert/strict';
import { createBestiary } from '../src/engine/bestiary.js';
import { createEncounters, exposureTier } from '../src/engine/encounters.js';
import { createCombat } from '../src/engine/combat.js';
import { mulberry32 } from '../src/engine/prng.js';
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };
import tablesData from '../data/encounters/tables.json' with { type: 'json' };

const bestiary = createBestiary(beingsData);

test('the shipped tables load and validate against the bestiary', () => {
  const enc = createEncounters(tablesData, bestiary);
  assert.ok(enc.tables.includes('dungeon'));
  assert.ok(enc.tables.includes('overworld'));
});

test('rollSeeded is deterministic in the seed', () => {
  const enc = createEncounters(tablesData, bestiary);
  for (let s = 0; s < 20; s++) {
    assert.deepEqual(enc.rollSeeded('dungeon', s), enc.rollSeeded('dungeon', s));
  }
});

test('a fight encounter materializes combat-ready foe specs', () => {
  const enc = createEncounters(tablesData, bestiary);
  // find a seed that rolls a fight
  let fight = null;
  for (let s = 0; s < 200 && !fight; s++) {
    const e = enc.rollSeeded('dungeon', s);
    if (e.kind === 'fight') fight = e;
  }
  assert.ok(fight, 'expected some seed to roll a fight');
  assert.ok(fight.foes.length >= 1);
  const c = createCombat({ party: [{ id: 'pc', hp: 10 }], foes: fight.foes, seed: 1 });
  assert.equal(c.living('foe').length, fight.foes.length);
});

test('ENCOUNTERS LOCK: mostly-mundane with a thin tail — distribution over many rolls', () => {
  const enc = createEncounters(tablesData, bestiary);
  const counts = { none: 0, fight: 0, cache: 0, unfair: 0 };
  const N = 20000;
  const rng = mulberry32(2323);
  for (let i = 0; i < N; i++) {
    const e = enc.roll('dungeon', rng);
    counts[e.kind]++;
    if (e.unfair) counts.unfair++;
  }
  // 'none' dominates (mundane majority)
  assert.ok(counts.none / N > 0.5, `none share ${(counts.none / N).toFixed(3)} should exceed 0.5`);
  // the game-breaking cache and the run-ending unfair tail are both RARE but present
  assert.ok(counts.cache > 0 && counts.cache / N < 0.05, `cache share ${(counts.cache / N).toFixed(4)} should be a thin tail`);
  assert.ok(counts.unfair > 0 && counts.unfair / N < 0.05, `unfair share ${(counts.unfair / N).toFixed(4)} should be a thin tail`);
});

test('NO level-scaling / NO pity: the roller signature admits neither a party level nor a streak', () => {
  const enc = createEncounters(tablesData, bestiary);
  // roll() takes exactly (tableName, rng): no place to pass power or a miss-count.
  assert.equal(enc.roll.length, 2);
  // And the same rng stream yields the same sequence regardless of any external
  // "history" — proving the outcome depends only on the stream, not on prior hits.
  const seqA = [];
  const rngA = mulberry32(7);
  for (let i = 0; i < 50; i++) seqA.push(enc.roll('dungeon', rngA).kind);
  const seqB = [];
  const rngB = mulberry32(7);
  for (let i = 0; i < 50; i++) seqB.push(enc.roll('dungeon', rngB).kind);
  assert.deepEqual(seqA, seqB);
});

test('maybe() gates on the rare trigger and returns null for none', () => {
  const enc = createEncounters(tablesData, bestiary);
  let fired = 0;
  const N = 10000;
  const rng = mulberry32(99);
  for (let i = 0; i < N; i++) if (enc.maybe('dungeon', rng)) fired++;
  // trigger is 0.08 and ~62% of triggers are 'none', so fired share is well under 8%
  assert.ok(fired / N < 0.08, `fired share ${(fired / N).toFixed(3)} should be under the trigger chance`);
  assert.ok(fired > 0, 'expected some encounters to fire');
});

test('a cache encounter carries its artifact and description', () => {
  const enc = createEncounters(tablesData, bestiary);
  let cache = null;
  for (let s = 0; s < 5000 && !cache; s++) {
    const e = enc.rollSeeded('dungeon', s);
    if (e.kind === 'cache') cache = e;
  }
  assert.ok(cache, 'expected a cache roll');
  assert.ok(cache.artifact);
  assert.ok(typeof cache.description === 'string' && cache.description.startsWith('[SEED]'));
});

test('exposure thresholds conservatively raise fight weights', () => {
  const enc = createEncounters(tablesData, bestiary);
  assert.deepEqual([0, 0.249, 0.25, 0.499, 0.5, 0.749, 0.75, 1].map(exposureTier), [0, 0, 1, 1, 2, 2, 3, 3]);
  const fightWeight = (exposure) => enc.entryWeights('operation_1', exposure)
    .filter((e) => e.kind === 'fight').reduce((n, e) => n + e.weight, 0);
  const weights = [0, 0.25, 0.5, 0.75].map(fightWeight);
  assert.ok(weights.every((n, i) => i === 0 || n > weights[i - 1]), `fight weights must rise by tier: ${weights}`);
  assert.equal(enc.triggerChance('operation_1'), 0.08, 'the live clock does not inflate the rare trigger gate');
});

test('Operations 1-5 get progressively meaner and richer table profiles', () => {
  const enc = createEncounters(tablesData, bestiary);
  const names = ['operation_1', 'operation_2', 'operation_3', 'operation_4', 'chapel'];
  const trigger = names.map((name) => enc.triggerChance(name));
  const loot = names.map((name) => enc.lootChance(name));
  const none = names.map((name) => enc.entryWeights(name, 0).find((e) => e.kind === 'none').weight);
  for (const values of [trigger, loot]) assert.ok(values.every((n, i) => i === 0 || n > values[i - 1]), `${values} must rise each Operation`);
  assert.ok(none.every((n, i) => i === 0 || n < none[i - 1]), `${none} must fall each Operation`);
});

test('validation rejects unknown being / artifact references', () => {
  assert.throws(() => createEncounters({
    artifacts: {},
    tables: { t: { triggerChance: 0.1, entries: [{ weight: 1, kind: 'fight', foes: [{ being: 'nope', count: [1, 1] }] }] } },
  }, bestiary), /unknown being/);
  assert.throws(() => createEncounters({
    artifacts: {},
    tables: { t: { triggerChance: 0.1, entries: [{ weight: 1, kind: 'cache', artifact: 'ghost' }] } },
  }, bestiary), /unknown artifact/);
  assert.throws(() => createEncounters({
    artifacts: {},
    tables: { t: { triggerChance: 5, entries: [{ weight: 1, kind: 'none' }] } },
  }, bestiary), /triggerChance/);
});
