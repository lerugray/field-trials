// engine.js — THE MARCH (DESIGN-SEED M1 skeleton). Pure, deterministic simulation
// of the party marching a generated road. No DOM, no wall-clock, no Math.random:
// a `step()` advances exactly one tick from the given state and returns the
// events that occurred, so replays and the save-determinism probe are exact.
//
// Real combat (M2) and mandates/towns (M4) replace the placeholder encounter
// ticker; this module owns the road, the pacing, and the deterministic spine.
//
// SPEED does NOT live here. Speed only changes how often main.js calls step();
// the simulation is identical at 0.5x and 4x. Pausing = main.js not calling step.

import { TUNING } from './tuning.js';
import { makeStreams, serializeStreams, restoreStreams } from './rng.js';

// Terrain the road passes through. Labels only (in-register jurisdictional
// terrain); the skeleton uses them for flavour + a future encounter-weight hook.
export const TERRAINS = ['chalk-flat', 'fen', 'toll-wood', 'the-cutting', 'marker-stones'];

// generateLeg: build one leg's terrain profile from the terrain stream. Done once
// per leg (never interleaved with per-pace encounter rolls), so encounters and
// terrain stay independent. Returns an array of {from, terrain} segment starts.
function generateLeg(streams, legIndex) {
  // 3–5 segments per leg; each a terrain band. Uses the terrain stream only.
  const segCount = streams.terrain.range(3, 5);
  const segLen = Math.floor(TUNING.legLengthPaces / segCount);
  const segs = [];
  for (let i = 0; i < segCount; i++) {
    segs.push({ from: i * segLen, terrain: streams.terrain.pick(TERRAINS) });
  }
  return { legIndex, segCount, segs };
}

// rollRoadTier: a weighted single draw → encounter kind (1 routine / 2 elite /
// 3 boss). One next() off the encounter stream, so it advances the stream exactly
// like the old uniform roll (save-determinism unchanged). Pure w.r.t. the stream.
export function rollRoadTier(stream) {
  const w = TUNING.roadTierWeights;
  const r = stream.next();
  if (r < w.routine) return 1;
  if (r < w.routine + w.elite) return 2;
  return 3;
}

// terrainAt: the terrain for a pace within a leg profile (positional, pure).
export function terrainAt(profile, pace) {
  let t = profile.segs[0].terrain;
  for (const s of profile.segs) {
    if (pace >= s.from) t = s.terrain; else break;
  }
  return t;
}

// createMarch: fresh expedition state marching from pace 0 of leg 0.
export function createMarch(seed) {
  const streams = makeStreams(seed);
  const state = {
    seed: seed >>> 0,
    streams,
    tick: 0,
    leg: 0,
    paces: 0, // paces into the current leg
    totalPaces: 0, // paces since the expedition began (never resets)
    terrain: null,
    lastEncounterPace: -TUNING.encounterMinGapPaces, // allow an early first encounter
    encounterCount: 0,
    legProfile: null,
    // Route mods riding on the current leg (M4). Neutral until the party routes a
    // leg at a pause point; the resolver + gold read these. The determinism probe
    // and the M2 baseline run under neutral mods, so both are unaffected.
    legMods: { encounterMult: 1, goldMult: 1 },
  };
  state.legProfile = generateLeg(streams, 0);
  state.terrain = terrainAt(state.legProfile, 0);
  return state;
}

// step: advance exactly one tick. Mutates `state`, returns an events array.
// Every event is a player-visible fact (action-legibility law): main.js renders
// them and the debug log records them. Pure w.r.t. (state) — no external inputs.
export function step(state) {
  const events = [];
  state.tick += 1;

  const prevTerrain = state.terrain;
  state.paces += TUNING.pacesPerTick;
  state.totalPaces += TUNING.pacesPerTick;

  // Terrain under the party after moving.
  const terrainNow = terrainAt(state.legProfile, state.paces);
  if (terrainNow !== prevTerrain) {
    state.terrain = terrainNow;
    events.push({ type: 'terrain', terrain: terrainNow, pace: state.paces });
  }

  // Encounter roll for this pace (encounter stream only; min-gap enforced).
  // Opening grace: no rolls until firstEncounterMinPaces — first-minutes pacing.
  const sinceLast = state.paces - state.lastEncounterPace;
  const encMult = state.legMods ? state.legMods.encounterMult : 1;
  const pastGrace = state.totalPaces >= TUNING.firstEncounterMinPaces;
  if (pastGrace && sinceLast >= TUNING.encounterMinGapPaces && state.streams.encounter.chance(TUNING.encounterChancePerPace * encMult)) {
    state.lastEncounterPace = state.paces;
    state.encounterCount += 1;
    // Weighted road tier (M4): one draw off the encounter stream, routine-heavy
    // (the road's ordinary work), so a well-built party wins the common case
    // card-free. kind 1 routine / 2 elite / 3 boss.
    const kind = rollRoadTier(state.streams.encounter);
    events.push({
      type: 'encounter',
      n: state.encounterCount,
      kind,
      terrain: state.terrain,
      leg: state.leg,
      pace: state.paces,
    });
  }

  // Leg complete -> pause point (camp/town come in later milestones).
  if (state.paces >= TUNING.legLengthPaces) {
    events.push({ type: 'leg-complete', leg: state.leg, encounters: state.encounterCount });
    state.leg += 1;
    state.paces = 0;
    state.lastEncounterPace = -TUNING.encounterMinGapPaces;
    // The new leg starts neutral; the party's route choice at the pause point
    // sets its mods before marching resumes.
    state.legMods = { encounterMult: 1, goldMult: 1 };
    state.legProfile = generateLeg(state.streams, state.leg);
    state.terrain = terrainAt(state.legProfile, 0);
    events.push({ type: 'leg-begin', leg: state.leg, terrain: state.terrain });
  }

  return events;
}

// ---- Serialization (save-determinism spine; fully exercised at M1 inc3) ------

// serializeMarch: a plain-JSON snapshot capturing exact RNG position + progress.
export function serializeMarch(state) {
  return {
    v: 1,
    seed: state.seed,
    tick: state.tick,
    leg: state.leg,
    paces: state.paces,
    totalPaces: state.totalPaces,
    terrain: state.terrain,
    lastEncounterPace: state.lastEncounterPace,
    encounterCount: state.encounterCount,
    legProfile: state.legProfile,
    legMods: state.legMods || { encounterMult: 1, goldMult: 1 },
    streams: serializeStreams(state.streams),
  };
}

// restoreMarch: rebuild live state from a snapshot, resuming byte-identically.
export function restoreMarch(snap) {
  const streams = restoreStreams(snap.seed, snap.streams);
  return {
    seed: snap.seed >>> 0,
    streams,
    tick: snap.tick | 0,
    leg: snap.leg | 0,
    paces: snap.paces | 0,
    totalPaces: snap.totalPaces | 0,
    terrain: snap.terrain,
    lastEncounterPace: snap.lastEncounterPace | 0,
    encounterCount: snap.encounterCount | 0,
    legProfile: snap.legProfile,
    legMods: snap.legMods || { encounterMult: 1, goldMult: 1 },
  };
}

// runTicks: advance n ticks, returning a flat trace of events (test/probe helper).
export function runTicks(state, n) {
  const trace = [];
  for (let i = 0; i < n; i++) {
    for (const ev of step(state)) trace.push({ tick: state.tick, ...ev });
  }
  return trace;
}
