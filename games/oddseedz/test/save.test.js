import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon, STAT_KEYS, NAME_MAX, PHRASE_MAX } from '../src/engine/summon.js';
import { STAT_FLOOR, STAT_CAP, BOND_MAX, STRESS_MAX, FATIGUE_MAX } from '../src/engine/raise.js';
import { MEADOW_CAP } from '../src/engine/lineage.js';
import {
  newGame,
  serialize,
  deserialize,
  saveGame,
  loadGame,
  clearGame,
  SAVE_KEY,
  SAVE_VERSION,
} from '../src/engine/save.js';

// Minimal in-memory storage adapter, same shape as localStorage.
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('serialize/deserialize round-trips a game state', () => {
  const state = newGame(summon('round trip'), 1000);
  const back = deserialize(serialize(state));
  assert.deepEqual(back, state);
});

test('newGame gives the creature raising vitals, care fields, and an estate', () => {
  const state = newGame(summon('fresh'), 1);
  assert.equal(state.version, SAVE_VERSION);
  assert.equal(typeof state.creature.bond, 'number');
  assert.equal(typeof state.creature.stress, 'number');
  assert.equal(typeof state.creature.fatigue, 'number');
  assert.equal(state.creature.age, 1);
  // M3 care fields: discovered tastes start unknown, no toy played yet
  assert.deepEqual(state.creature.tastes, { favorite: null, disliked: null, tried: [] });
  assert.equal(state.creature.lastToy, null);
  assert.equal(typeof state.estate.money, 'number');
  assert.deepEqual(state.estate.toys, []);
  // M4 tournament record starts empty
  assert.deepEqual(state.estate.record, { wins: 0, losses: 0 });
  // M5 career: starts at E rank with a meet scheduled ahead of the young pet
  assert.equal(state.estate.career.rank, 'E');
  assert.equal(state.estate.career.rankWins, 0);
  assert.ok(state.estate.career.nextMandatory > state.creature.age);
  assert.deepEqual(state.estate.career.log, []);
});

test('deserialize rejects junk gracefully', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize('not json'), null);
  assert.equal(deserialize('{}'), null);
  assert.equal(deserialize(JSON.stringify({ version: 999, creature: {} })), null);
  assert.equal(deserialize(JSON.stringify({ version: 4, creature: {} })), null);
});

test('a v1 save (bare creature from M1) migrates forward, keeping the pet', () => {
  const creature = summon('legacy pet');
  const v1 = JSON.stringify({ version: 1, createdAt: 42, creature });
  const back = deserialize(v1);
  assert.ok(back);
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.createdAt, 42);
  assert.equal(back.creature.species.id, creature.species.id);
  assert.deepEqual(back.creature.stats, creature.stats);
  assert.equal(back.creature.age, 1); // vitals filled in
  assert.deepEqual(back.creature.tastes, { favorite: null, disliked: null, tried: [] });
  assert.deepEqual(back.estate.toys, []);
  assert.deepEqual(back.estate.record, { wins: 0, losses: 0 }); // record filled in
});

test('a v2 save (vitals, no care) migrates forward without losing the pet', () => {
  const creature = { ...summon('partial'), bond: 30, stress: 10, fatigue: 5, age: 3 };
  const back = deserialize(JSON.stringify({ version: 2, createdAt: 0, creature }));
  assert.ok(back);
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.creature.bond, 30); // existing vitals preserved
  assert.equal(back.creature.age, 3);
  assert.equal(back.creature.lastToy, null); // care fields filled in
  assert.deepEqual(back.estate.toys, []);
  assert.equal(typeof back.estate.money, 'number');
});

test('a v3 save (tastes+toys, no record) migrates forward, seeding a fresh record', () => {
  const creature = {
    ...summon('collector'),
    bond: 66, stress: 12, fatigue: 8, age: 4,
    tastes: { favorite: 'berry', disliked: 'kelp', tried: ['berry', 'kelp'] },
    lastToy: 'ball',
  };
  const back = deserialize(JSON.stringify({ version: 3, createdAt: 9, creature, estate: { money: 120, toys: ['ball', 'plush'] } }));
  assert.equal(back.version, SAVE_VERSION);
  assert.deepEqual(back.creature.tastes, creature.tastes);
  assert.equal(back.creature.lastToy, 'ball');
  assert.deepEqual(back.estate.toys, ['ball', 'plush']);
  assert.equal(back.estate.money, 120);
  assert.deepEqual(back.estate.record, { wins: 0, losses: 0 }); // record seeded
});

test('a v4 save with a tournament record round-trips intact', () => {
  const creature = {
    ...summon('champion'),
    bond: 70, stress: 20, fatigue: 14, age: 6,
    tastes: { favorite: 'kelp', disliked: 'jerky', tried: ['kelp'] },
    lastToy: null,
  };
  const state = {
    version: 4, createdAt: 3, creature,
    estate: { money: 240, toys: ['puzzle'], record: { wins: 2, losses: 1 } },
  };
  const back = deserialize(serialize(state));
  assert.deepEqual(back.estate.record, { wins: 2, losses: 1 });
  assert.equal(back.estate.money, 240);
  assert.deepEqual(back.estate.toys, ['puzzle']);
  // M5: a v4 save gains a fresh career, its first meet scheduled past the pet's age
  assert.equal(back.estate.career.rank, 'E');
  assert.ok(back.estate.career.nextMandatory > creature.age);
});

test('a v5 save with a rank-ladder career round-trips intact', () => {
  const creature = { ...summon('veteran'), bond: 80, stress: 10, fatigue: 20, age: 12 };
  const career = { rank: 'D', rankWins: 2, nextMandatory: 16, metCycle: true, log: [{ week: 8, rank: 'E', kind: 'promote', money: 0, text: 'Promoted to D rank!' }] };
  const state = {
    version: 5, createdAt: 1, creature,
    estate: { money: 610, toys: ['ball'], record: { wins: 7, losses: 3 }, career },
  };
  const back = deserialize(serialize(state));
  assert.equal(back.estate.career.rank, 'D');
  assert.equal(back.estate.career.rankWins, 2);
  assert.equal(back.estate.career.nextMandatory, 16);
  assert.equal(back.estate.career.metCycle, true);
  assert.equal(back.estate.career.log.length, 1);
});

test('save then load returns the same creature through storage', () => {
  const storage = fakeStorage();
  const state = newGame(summon('persist me'), 2222);
  saveGame(storage, state);
  const loaded = loadGame(storage);
  assert.equal(loaded.creature.species.id, state.creature.species.id);
  assert.deepEqual(loaded.creature.stats, state.creature.stats);
  assert.equal(loaded.creature.name, state.creature.name);
});

test('loadGame on empty storage is null', () => {
  assert.equal(loadGame(fakeStorage()), null);
});

test('clearGame removes the save', () => {
  const storage = fakeStorage();
  saveGame(storage, newGame(summon('clear me'), 3));
  assert.ok(loadGame(storage));
  clearGame(storage);
  assert.equal(loadGame(storage), null);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

// --- M11 item 4: import hardening -------------------------------------------
// A structurally valid save can still carry insane values (hand-edited, a
// tampered token, a version-skew bug). deserialize must REPAIR, never trust.

test('deserialize clamps insane vitals into range', () => {
  const creature = { ...summon('insane vitals'), bond: 9999, stress: -50, fatigue: NaN, age: -3 };
  const back = deserialize(JSON.stringify({ version: 2, creature }));
  assert.equal(back.creature.bond, BOND_MAX);
  assert.equal(back.creature.stress, 0);
  assert.ok(back.creature.fatigue >= 0 && back.creature.fatigue <= FATIGUE_MAX);
  assert.ok(back.creature.age >= 1); // never a negative or zero age
});

test('deserialize forces finite, in-range stats for exactly STAT_KEYS', () => {
  const base = summon('bad stats');
  const creature = {
    ...base,
    stats: { pow: 999, def: -20, spd: 'xxx', sta: NaN, foc: 40, GHOST: 500 },
  };
  const back = deserialize(JSON.stringify({ version: 4, creature }));
  assert.deepEqual(Object.keys(back.creature.stats).sort(), [...STAT_KEYS].sort());
  assert.equal(back.creature.stats.pow, STAT_CAP);
  assert.equal(back.creature.stats.def, STAT_FLOOR);
  assert.equal(back.creature.stats.spd, STAT_FLOOR); // garbage snaps to floor
  assert.equal(back.creature.stats.sta, STAT_FLOOR);
  assert.equal(back.creature.stats.foc, 40);
  assert.ok(!('GHOST' in back.creature.stats)); // no smuggled fields
});

test('deserialize sanitizes an imported name and caps the phrase', () => {
  const creature = {
    ...summon('name and phrase'),
    name: '  Evil\nName That Is Way Too Long To Fit  ',
    phrase: 'x'.repeat(5000),
  };
  const back = deserialize(JSON.stringify({ version: 2, creature }));
  assert.ok(back.creature.name.length <= NAME_MAX);
  assert.ok(!/[\u0000-\u001f]/.test(back.creature.name)); // control chars stripped
  assert.ok(back.creature.phrase.length <= PHRASE_MAX);
});

test('deserialize repairs negative and non-finite money', () => {
  const c1 = summon('broke');
  const neg = deserialize(JSON.stringify({ version: 4, creature: c1, estate: { money: -200 } }));
  assert.equal(neg.estate.money, 0); // debt floored
  const nan = deserialize(JSON.stringify({ version: 4, creature: c1, estate: { money: 'lots' } }));
  assert.ok(Number.isFinite(nan.estate.money) && nan.estate.money >= 0);
});

test('deserialize enforces MEADOW_CAP and normalizes retirees on import', () => {
  const creature = summon('meadow keeper');
  const retiree = {
    name: 'Gramps', species: { id: 'slime', name: 'Slime', archetype: 'blob', hue: 120 },
    rarity: 'common', stats: { pow: 9999, def: NaN, spd: 30, sta: 20, foc: 10 },
    temperament: 'Calm', variant: 0, seed: 1, retiredAtAge: -5, rank: 'E', badges: [],
  };
  const meadow = Array.from({ length: MEADOW_CAP + 6 }, (_, i) => ({ ...retiree, seed: i }));
  const back = deserialize(JSON.stringify({ version: 6, creature, estate: { meadow } }));
  assert.equal(back.estate.meadow.length, MEADOW_CAP); // capped
  const r = back.estate.meadow[0];
  assert.equal(r.stats.pow, STAT_CAP); // clamped
  assert.equal(r.stats.def, STAT_FLOOR); // NaN -> floor
  assert.ok(r.retiredAtAge >= 1); // age bounded
});

test('a bare no-version creature (hand-copied M1 save) migrates, not rejected', () => {
  const creature = summon('bare legacy');
  // No wrapper at all — the creature IS the top-level object.
  const back = deserialize(JSON.stringify(creature));
  assert.ok(back, 'a bare creature should migrate, matching the M1 promise');
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.creature.species.id, creature.species.id);
  assert.equal(back.creature.age, 1);
  assert.equal(back.estate.money, 500); // fresh estate defaulted
});
