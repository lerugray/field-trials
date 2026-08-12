// The toy-room care layer (M3): the moment-to-moment bonding that lives OUTSIDE
// the week planner. Petting, poking, toys and snacks are immediate touches that
// move Bond / Stress / Fatigue right now and are persisted right away. The week
// budget is still the macro economy (drills vs rest vs play); this is the cozy
// layer on top of it.
//
// Everything is PURE and DETERMINISTIC: interact(state, action) returns fresh
// creature/estate plus a REACTION describing what to show, and never mutates the
// input. Two self-limiting honesties keep the room from trivializing the game:
//   1. Touches give DIMINISHING RETURNS by headroom — petting a blissful pet does
//      almost nothing, so bond can't be farmed; it matters most when needed.
//   2. Snacks cost money (the shared scarcity) and carry HIDDEN likes discovered
//      only by trying them, so learning a pet's tastes is real play.

import { makeRng, rngInt } from './rng.js';
import { BOND_MAX, STRESS_MAX, FATIGUE_MAX } from './raise.js';
import { moodOf } from './mood.js';

// --- toybox + pantry ---------------------------------------------------------
export const SNACKS = [
  { id: 'berry', label: 'Berry', glyph: '🍓' },
  { id: 'jerky', label: 'Jerky', glyph: '🍖' },
  { id: 'biscuit', label: 'Biscuit', glyph: '🍪' },
  { id: 'kelp', label: 'Kelp', glyph: '🌿' },
  { id: 'nectar', label: 'Nectar', glyph: '🍯' },
];
export const SNACK_BY_ID = Object.fromEntries(SNACKS.map((s) => [s.id, s]));
export const SNACK_COST = 8;

export const TOYS = [
  { id: 'ball', label: 'Ball', glyph: '🏐', cost: 30 },
  { id: 'plush', label: 'Plush', glyph: '🧸', cost: 25 },
  { id: 'puzzle', label: 'Puzzle Box', glyph: '🧩', cost: 40 },
];
export const TOY_BY_ID = Object.fromEntries(TOYS.map((t) => [t.id, t]));

// Temperaments that enjoy a poke / rough play vs those a poke startles. This is
// how a poke TEACHES temperament: the same prod delights one pet and spooks
// another.
const POKE_LIKERS = new Set(['Bold', 'Cheeky', 'Curious', 'Wild']);
// Temperaments that live for toys (an extra bond/relief bump).
const TOY_LOVERS = new Set(['Curious', 'Wild', 'Cheeky']);

const clampCare = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const headBond = (bond) => (BOND_MAX - bond) / BOND_MAX; // 1 when empty, 0 when full
const reliefFrac = (stress) => stress / STRESS_MAX; // how much relief there is to give

// --- fresh care state + persistence defaults ---------------------------------
// A pet's discovered tastes: favorite/disliked start UNKNOWN (null) and are
// revealed by feeding. `tried` is the set of snacks the player has offered.
export function freshTastes() {
  return { favorite: null, disliked: null, tried: [] };
}

// Give a creature its care fields if missing (idempotent — doubles as migration).
export function withCare(creature) {
  return {
    ...creature,
    tastes: normalizeTastes(creature.tastes),
    lastToy: creature.lastToy ?? null,
  };
}

function normalizeTastes(t) {
  if (!t || typeof t !== 'object') return freshTastes();
  return {
    favorite: typeof t.favorite === 'string' ? t.favorite : null,
    disliked: typeof t.disliked === 'string' ? t.disliked : null,
    tried: Array.isArray(t.tried) ? t.tried.filter((x) => typeof x === 'string') : [],
  };
}

// --- hidden taste derivation (deterministic from the seed) -------------------
// Each creature has a true favorite and a true disliked snack fixed at summon,
// hidden until discovered. Derived from the seed so the same pet always likes
// the same thing, but drawn from a separate stream so it never shifts stats.
export function tasteOf(creature) {
  const seed = ((creature.seed ?? 0) ^ 0x5eed_face) >>> 0;
  const rng = makeRng(seed);
  const favIdx = rngInt(rng, 0, SNACKS.length - 1);
  let disIdx = rngInt(rng, 0, SNACKS.length - 1);
  if (disIdx === favIdx) disIdx = (disIdx + 1) % SNACKS.length;
  return { favorite: SNACKS[favIdx].id, disliked: SNACKS[disIdx].id };
}

// --- buying (toys are a one-time estate purchase) ----------------------------
export function ownsToy(estate, id) {
  return Array.isArray(estate?.toys) && estate.toys.includes(id);
}

// Buy a toy into the estate. Returns { estate, ok, reason }. Pure.
export function buyToy(state, id) {
  const estate = state.estate || {};
  const toy = TOY_BY_ID[id];
  if (!toy) return { estate, ok: false, reason: 'no such toy' };
  if (ownsToy(estate, id)) return { estate, ok: false, reason: 'already own it' };
  if ((estate.money ?? 0) < toy.cost) return { estate, ok: false, reason: 'not enough money' };
  return {
    estate: { ...estate, money: estate.money - toy.cost, toys: [...(estate.toys || []), id] },
    ok: true,
    reason: null,
  };
}

// --- the interaction ---------------------------------------------------------
// action = { type: 'pet' | 'poke' | 'drag' | 'toy' | 'snack', id? }
// Returns { creature, estate, reaction } where reaction is what to SHOW:
//   { effect, note, deltas:{bond,stress,fatigue,money}, mood, discovery }
// effect vocabulary the renderer/UI reads:
//   'happy' | 'soothed' | 'content' | 'delight' | 'playful' | 'startled' |
//   'dislike' | 'blocked'
export function interact(state, action) {
  const c = withCare(state.creature);
  const estate = state.estate || {};
  const name = c.name || 'Your pet';
  const type = action?.type;

  if (type === 'pet') return applyVitals(c, estate, petEffect(c), name);
  if (type === 'poke' || type === 'drag') return applyVitals(c, estate, pokeEffect(c, type), name);
  if (type === 'toy') return toyInteract(c, estate, action.id, name);
  if (type === 'snack') return snackInteract(c, estate, action.id, name);
  return blocked(c, estate, 'Nothing happens.');
}

// Fold a plain vitals-effect {dBond,dStress,dFatigue,effect,note} onto the pet.
function applyVitals(c, estate, eff, name) {
  const bond = clampCare(c.bond + eff.dBond, 0, BOND_MAX);
  const stress = clampCare(c.stress + eff.dStress, 0, STRESS_MAX);
  const fatigue = clampCare(c.fatigue + eff.dFatigue, 0, FATIGUE_MAX);
  const creature = { ...c, bond, stress, fatigue, lastToy: eff.lastToy ?? c.lastToy };
  return {
    creature,
    estate,
    reaction: {
      effect: eff.effect,
      note: eff.note(name),
      deltas: { bond: bond - c.bond, stress: stress - c.stress, fatigue: fatigue - c.fatigue, money: 0 },
      mood: moodOf(creature).id,
      discovery: null,
    },
  };
}

function petEffect(c) {
  const timid = c.temperament === 'Timid';
  const restless = c.temperament === 'Wild';
  let dBond = c.bond >= BOND_MAX ? 0 : Math.max(1, Math.round(4 * headBond(c.bond)));
  if (restless) dBond = c.bond >= BOND_MAX ? 0 : Math.max(1, Math.round(dBond * 0.6));
  let dStress = -Math.round(6 * reliefFrac(c.stress) * (timid ? 1.4 : 1));
  if (dBond <= 1 && dStress === 0) {
    return { dBond, dStress, dFatigue: 0, effect: 'content', note: (n) => `${n} is already blissful.` };
  }
  return { dBond, dStress, dFatigue: 0, effect: dStress < dBond * -1 ? 'soothed' : 'happy', note: (n) => `${n} leans into the pets.` };
}

function pokeEffect(c, type) {
  const verb = type === 'drag' ? 'scoops up' : 'pokes';
  if (POKE_LIKERS.has(c.temperament)) {
    return { dBond: 2, dStress: -1, dFatigue: 1, effect: 'playful', note: (n) => `${n} pounces when you ${verb === 'pokes' ? 'poke' : 'lift'}.` };
  }
  return { dBond: -1, dStress: 4, dFatigue: 0, effect: 'startled', note: (n) => `${n} flinches back.` };
}

function toyInteract(c, estate, id, name) {
  const toy = TOY_BY_ID[id];
  if (!toy) return blocked(c, estate, 'No such toy.');
  if (!ownsToy(estate, id)) return blocked(c, estate, `You don't own the ${toy.label} yet.`);

  const bored = c.lastToy === id;
  const lover = TOY_LOVERS.has(c.temperament);
  let dBond = c.bond >= BOND_MAX ? 0 : Math.max(1, Math.round(5 * headBond(c.bond)));
  if (bored) dBond = Math.max(1, Math.round(dBond * 0.5));
  if (lover) dBond += 2;
  let dStress = -Math.round((10 + (lover ? 2 : 0)) * reliefFrac(c.stress));
  const dFatigue = 3;

  const eff = {
    dBond, dStress, dFatigue,
    lastToy: id,
    effect: bored ? 'content' : 'playful',
    note: bored ? (n) => `${n} is a little bored of the ${toy.label}.` : (n) => `${n} plays with the ${toy.label}!`,
  };
  return applyVitals(c, estate, eff, name);
}

function snackInteract(c, estate, id, name) {
  const snack = SNACK_BY_ID[id];
  if (!snack) return blocked(c, estate, 'No such snack.');
  if ((estate.money ?? 0) < SNACK_COST) return blocked(c, estate, `Not enough money for a snack (${SNACK_COST}).`);

  const truth = tasteOf(c);
  const nextEstate = { ...estate, money: estate.money - SNACK_COST };

  let dBond, dStress, effect, note, discovery = null;
  const tastes = { ...c.tastes, tried: c.tastes.tried.includes(id) ? c.tastes.tried : [...c.tastes.tried, id] };

  if (id === truth.favorite) {
    dBond = 9; dStress = -6; effect = 'delight';
    note = `${name} loves the ${snack.label}!`;
    if (tastes.favorite !== id) { tastes.favorite = id; discovery = { kind: 'favorite', snack: id }; }
  } else if (id === truth.disliked) {
    dBond = -2; dStress = 3; effect = 'dislike';
    note = `${name} spits out the ${snack.label}.`;
    if (tastes.disliked !== id) { tastes.disliked = id; discovery = { kind: 'disliked', snack: id }; }
  } else {
    dBond = 3; dStress = -4; effect = 'happy';
    note = `${name} nibbles the ${snack.label}.`;
  }

  const bond = clampCare(c.bond + dBond, 0, BOND_MAX);
  const stress = clampCare(c.stress + dStress, 0, STRESS_MAX);
  const fatigue = clampCare(c.fatigue - 2, 0, FATIGUE_MAX); // a treat perks the pet up a touch
  const creature = { ...c, bond, stress, fatigue, tastes };
  return {
    creature,
    estate: nextEstate,
    reaction: {
      effect,
      note,
      deltas: { bond: bond - c.bond, stress: stress - c.stress, fatigue: fatigue - c.fatigue, money: -SNACK_COST },
      mood: moodOf(creature).id,
      discovery,
    },
  };
}

function blocked(c, estate, note) {
  return {
    creature: c,
    estate,
    reaction: { effect: 'blocked', note, deltas: { bond: 0, stress: 0, fatigue: 0, money: 0 }, mood: moodOf(c).id, discovery: null },
  };
}
