// Persistence. The pure serialize/deserialize pair is testable in node; the
// storage helpers take an adapter (localStorage in the browser, a fake in
// tests) so nothing here touches a global.

import {
  freshVitals,
  START_MONEY,
  STAT_CAP,
  STAT_FLOOR,
  STRESS_MAX,
  FATIGUE_MAX,
  BOND_MAX,
} from './raise.js';
import { STAT_KEYS, sanitizeName, PHRASE_MAX } from './summon.js';
import { withCare } from './care.js';
import { withCareer } from './career.js';
import { hatchEgg, MEADOW_CAP } from './lineage.js';

export const SAVE_KEY = 'oddseedz.save.v1';
export const SAVE_VERSION = 6;

// A pet can outlive its 30-week lifespan (twilight is open-ended), but no legit
// age is astronomically large; cap it so an insane import can't feed a giant
// number into aging/pacing math.
const AGE_MAX = 9999;

// Coerce v to a finite number clamped to [lo, hi]; anything non-finite (NaN,
// Infinity, a string, undefined) falls back to `fallback`. This is the spine of
// import hardening: a structurally valid but insane save is repaired, not trusted.
function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n < lo ? lo : n > hi ? hi : n;
}

// Force a stats object to hold a finite, in-range integer for EVERY stat key —
// missing or garbage stats snap to the floor. Never returns extra keys, so a
// tampered save can't smuggle fields into battle/raise math.
function normalizeStats(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const out = {};
  for (const k of STAT_KEYS) out[k] = Math.round(clampNum(s[k], STAT_FLOOR, STAT_CAP, STAT_FLOOR));
  return out;
}

// Repair the estate's money: non-finite (NaN/Infinity/garbage) resets to the
// starting purse; negative floors at 0 (going broke is pressure, debt is a bug).
function repairMoney(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return START_MONEY;
  return Math.max(0, Math.floor(n));
}

// Normalize one Meadow retiree from an untrusted save: clamp its final stats,
// sanitize its name, bound its age, and keep only sane identity fields.
function normalizeRetiree(r) {
  return {
    ...r,
    name: sanitizeName(r.name, typeof r.name === 'string' ? r.name : 'Someone'),
    stats: normalizeStats(r.stats),
    retiredAtAge: Math.round(clampNum(r.retiredAtAge, 1, AGE_MAX, 1)),
    rarity: typeof r.rarity === 'string' ? r.rarity : 'common',
    rank: typeof r.rank === 'string' ? r.rank : 'E',
    badges: Array.isArray(r.badges) ? r.badges.slice(0, 8) : [],
  };
}

// Give a summoned creature its raising vitals (bond/stress/fatigue/age) AND its
// M3 care fields (discovered tastes, last toy) if they are missing. Idempotent,
// so it doubles as the forward migration for any older save.
export function withVitals(creature) {
  const v = freshVitals();
  const c = creature && typeof creature === 'object' ? creature : {};
  return withCare({
    ...c,
    name: sanitizeName(c.name, typeof c.name === 'string' ? c.name : 'Buddy'),
    phrase: typeof c.phrase === 'string' ? c.phrase.slice(0, PHRASE_MAX) : c.phrase,
    stats: normalizeStats(c.stats),
    bond: clampNum(c.bond, 0, BOND_MAX, v.bond),
    stress: clampNum(c.stress, 0, STRESS_MAX, v.stress),
    fatigue: clampNum(c.fatigue, 0, FATIGUE_MAX, v.fatigue),
    age: Math.round(clampNum(c.age, 1, AGE_MAX, v.age)),
  });
}

// Shape an estate block, defaulting money and the owned-toys list (M3), the
// win/loss record (M4) and the rank-ladder career block (M5). creatureAge seeds
// a fresh career's first mandatory meet so a migrated older pet isn't instantly
// overdue.
function withEstate(estate, creatureAge = 1) {
  const e = estate && typeof estate === 'object' ? estate : {};
  return {
    money: repairMoney(e.money),
    toys: Array.isArray(e.toys) ? e.toys.filter((x) => typeof x === 'string') : [],
    record: withRecord(e.record),
    career: withCareer(e.career, creatureAge),
    meadow: withMeadow(e.meadow),
  };
}

// The Memory Meadow (M6): the estate's retired bloodline. A list of frozen,
// read-only retiree records that persists across every generation. Defaulted to
// empty and shape-filtered idempotently so an older save migrates cleanly.
function withMeadow(meadow) {
  if (!Array.isArray(meadow)) return [];
  return meadow
    .filter((r) => r && typeof r === 'object' && r.species && r.stats)
    .slice(-MEADOW_CAP) // enforce the cap even on an untrusted import
    .map(normalizeRetiree);
}

// The tournament win/loss tally (M4). Persists on the estate alongside money so
// it survives into later generations. Defaulted/repaired idempotently.
function withRecord(r) {
  const o = r && typeof r === 'object' ? r : {};
  return {
    wins: Number.isFinite(o.wins) ? o.wins : 0,
    losses: Number.isFinite(o.losses) ? o.losses : 0,
  };
}

// Build a fresh game state around a summoned creature. createdAt is injected so
// the function stays pure/deterministic. The estate (money, later toys/
// facilities) is the block that will persist across generations at M6.
export function newGame(creature, createdAt = 0) {
  const c = withVitals(creature);
  return {
    version: SAVE_VERSION,
    createdAt,
    creature: c,
    estate: withEstate({ money: START_MONEY }, c.age),
  };
}

// Hatch an heir egg into the next generation's game state (M6). The estate — its
// money, toys, and the whole Memory Meadow bloodline — PERSISTS; only the pet and
// its career reset, because the new heir climbs the ladder on its own. This is
// how the clock never resets while the line carries forward.
export function newGameFromEgg(egg, priorEstate, createdAt = 0) {
  const heir = withVitals(hatchEgg(egg));
  const prior = priorEstate && typeof priorEstate === 'object' ? priorEstate : {};
  return {
    version: SAVE_VERSION,
    createdAt,
    creature: heir,
    estate: {
      money: repairMoney(prior.money),
      toys: Array.isArray(prior.toys) ? prior.toys.filter((x) => typeof x === 'string') : [],
      record: withRecord(prior.record),
      career: withCareer(null, heir.age), // a fresh career: the heir starts at E rank
      meadow: withMeadow(prior.meadow),
    },
  };
}

export function serialize(state) {
  return JSON.stringify(state);
}

// Parse and shape-check. Returns null on anything unusable rather than throwing,
// so a corrupt save degrades to "no save" instead of a broken boot. Every known
// shape is MIGRATED forward (via the idempotent withVitals/withEstate), so an
// operator never loses a pet or a bloodline.
export function deserialize(json) {
  if (typeof json !== 'string' || json.length === 0) return null;
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  // A bare top-level creature — no wrapper, no version, but a real species+stats —
  // is a hand-copied M1 save. Treat it as v1 and migrate it, honoring the promise
  // that a summoned pet is never lost. (The wrapper cases fall through unchanged.)
  const isBareCreature = data.version == null && !data.creature && data.species && data.stats;
  const version = isBareCreature ? 1 : data.version;
  const rawCreature = isBareCreature ? data : data.creature;
  const rawEstate = isBareCreature ? null : data.estate;

  // A between-generations save (M6): the active pet has retired into the Meadow
  // and no heir has hatched yet, so `creature` is null but the estate (money,
  // toys, the Meadow bloodline) persists. Such a save is valid as long as the
  // Meadow holds at least one retiree — otherwise it is indistinguishable from an
  // empty/corrupt file and degrades to "no save".
  const hasCreature =
    rawCreature && typeof rawCreature === 'object' && rawCreature.species && rawCreature.stats;
  const savedMeadow = rawEstate && Array.isArray(rawEstate.meadow) ? rawEstate.meadow : [];
  if (!hasCreature && savedMeadow.length === 0) return null;

  // Every known version (1 = bare M1 creature, 2 = vitals+estate, 3 = +care,
  // 4 = +tournament record, 5 = +rank-ladder career, 6 = +Memory Meadow /
  // between-generations) is migrated forward; anything outside the range is junk.
  if (version >= 1 && version <= SAVE_VERSION) {
    const creature = hasCreature ? withVitals(rawCreature) : null;
    return {
      version: SAVE_VERSION,
      createdAt: data.createdAt ?? 0,
      creature,
      estate: withEstate(rawEstate, creature ? creature.age : 1),
    };
  }
  return null;
}

// Storage adapter = anything with getItem(key)/setItem(key, value).
export function saveGame(storage, state) {
  storage.setItem(SAVE_KEY, serialize(state));
}

export function loadGame(storage) {
  const raw = storage.getItem(SAVE_KEY);
  return deserialize(raw);
}

export function clearGame(storage) {
  if (typeof storage.removeItem === 'function') storage.removeItem(SAVE_KEY);
  else storage.setItem(SAVE_KEY, '');
}
