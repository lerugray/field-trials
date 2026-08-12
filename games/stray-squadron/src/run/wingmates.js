// Wingmates — the mortal, mechanical layer the memorial cast stands apart from
// (DESIGN-SEED). Where Cuckoo, Leon, and Kirby are permanent and never in danger,
// wingmates are PROCEDURALLY GENERATED per run (species, name, trait, bark voice)
// and MORTAL: a run's distress beat can lose one, and losing one costs the run their
// passive support and callouts for its remainder. Next run draws a fresh squad.
//
// v1 involvement is the named-cut-respecting shape: narrative distress/rescue beats
// plus a PASSIVE SUPPORT BONUS ONLY. There is no live AI combatant flying alongside
// you and drawing fire — that is the genuine scope cliff DESIGN-SEED defers past the
// stop line. A wingmate helps by what they bring home (salvage) and what they call
// out (targets), never by taking a shot.
//
// This module is pure + deterministic from the seed (the seeded-world contract): the
// same seed always draws the same squad. No Math.random. The bark voice is a data
// descriptor here (pitch/wobble for the SNES scrambled-speech blips wired at M9); the
// actual bark TEXT lives in run/wingvoice.js.

import { makeRng } from '../core/rng.js';

// Wingmate species — generic critters, warm and clean-room. Deliberately NOT the
// memorial cast (no dog/cat/poodle — those are Cuckoo/Leon/Kirby, never recruits and
// never mortal) and NOT a fox (the reference's hero species; we do not echo it). Each
// carries a base bark-voice pitch for the code-generated blips.
// `tint` is a warm/cool badge color for the squad readout (a per-species accent, so
// two wingmates read apart at a glance). It is a UI accent only, never the sole state
// channel — the roster always carries the name + an alive/lost shape too (a11y law).
export const SPECIES = [
  { id: 'otter',  name: 'otter',  voicePitch: 1.15, tint: '#6fb2c4' },
  { id: 'hare',   name: 'hare',   voicePitch: 1.25, tint: '#c9a86a' },
  { id: 'badger', name: 'badger', voicePitch: 0.85, tint: '#b0b6bd' },
  { id: 'crane',  name: 'crane',  voicePitch: 1.05, tint: '#d4917a' },
  { id: 'marten', name: 'marten', voicePitch: 1.10, tint: '#c07a55' },
  { id: 'gecko',  name: 'gecko',  voicePitch: 1.30, tint: '#7fc48a' },
  { id: 'heron',  name: 'heron',  voicePitch: 0.95, tint: '#8fa6c4' },
  { id: 'vole',   name: 'vole',   voicePitch: 1.35, tint: '#c99aa8' },
];
export const speciesById = (id) => SPECIES.find((s) => s.id === id) || null;

// Traits — the passive support a wingmate contributes WHILE ALIVE. Two mechanical
// channels only, kept modest on purpose (DESIGN-SEED: difficulty holds through gating
// and tuning, not stat inflation — wingmates add texture, not a bigger number):
//   * salvageMul — a fractional bonus to the run's end salvage. Survivors only: a
//     wingmate lost mid-run brought nothing home, so their cut does not apply.
//   * killScore  — a flat score bonus per kill while alive (their callouts help you
//     line the shot up). Lost -> the callouts stop, the bonus stops.
// Each trait leans on one channel (with one "a little of everything" generalist), so
// a squad reads as distinct helpers, not interchangeable stat sticks.
export const TRAITS = [
  { id: 'scrapper',      name: 'Scrapper',      blurb: 'Hauls home extra salvage from every wreck.',    support: { salvageMul: 0.06, killScore: 0 } },
  { id: 'spotter',       name: 'Spotter',       blurb: 'Calls your targets before you spot them.',      support: { salvageMul: 0,    killScore: 6 } },
  { id: 'quartermaster', name: 'Quartermaster', blurb: 'Keeps a tidy hold. Nothing good gets left.',    support: { salvageMul: 0.05, killScore: 0 } },
  { id: 'ace',           name: 'Ace',           blurb: 'Reads the field and lines up your shots.',       support: { salvageMul: 0,    killScore: 8 } },
  { id: 'steady',        name: 'Steady Hand',   blurb: 'Calm on the wing. A little of everything.',      support: { salvageMul: 0.03, killScore: 3 } },
  { id: 'lucky',         name: 'Lucky',         blurb: 'Somehow always drifts past the good scrap.',     support: { salvageMul: 0.04, killScore: 0 } },
];
export const traitById = (id) => TRAITS.find((t) => t.id === id) || null;

// Name parts — warm, plain, a touch of squadron-callsign flavor. Clean-room: no
// Nintendo names, none of the memorial cast.
const GIVEN = [
  'Wren', 'Pike', 'Juno', 'Bram', 'Sable', 'Rook', 'Tansy', 'Cove',
  'Ferro', 'Mabel', 'Dax', 'Iris', 'Sol', 'Perch', 'Quill', 'Nimbus',
];
const CALLSIGN = [
  'Ridgeline', 'Driftwood', 'Longshot', 'Halfpenny', 'Kestrel',
  'Backdraft', 'Tailwind', 'Sparrow', 'Overcast', 'Ninebar',
];

export const ROSTER = {
  baseSize: 2,   // free squad drawn every run so the mechanic is present from run one
  callsignChance: 0.55,
};

// Draw one wingmate from an rng. `id` is the roster slot index; `fixedName` (a
// contracted veteran's name) overrides the procedural given-name draw when supplied.
export function generateWingmate(rng, id, fixedName = null) {
  const species = rng.pick(SPECIES);
  const trait = rng.pick(TRAITS);
  const given = fixedName || rng.pick(GIVEN);
  const callsign = !fixedName && rng.chance(ROSTER.callsignChance) ? rng.pick(CALLSIGN) : null;
  const name = callsign ? given + " '" + callsign + "'" : given;
  return {
    id,
    name,
    given,
    callsign,
    contracted: !!fixedName,
    species: species.id,
    speciesName: species.name,
    tint: species.tint,
    trait: trait.id,
    traitName: trait.name,
    blurb: trait.blurb,
    support: { salvageMul: trait.support.salvageMul, killScore: trait.support.killScore },
    // Bark-voice descriptor for the M9 blip generator (pitch nudged per-wingmate so
    // two of the same species still read apart). Data only; no audio here.
    voice: { pitch: +(species.voicePitch + rng.range(-0.06, 0.06)).toFixed(3), wobble: +rng.range(0.05, 0.18).toFixed(3) },
    alive: true,
    lostAt: null,   // set to the node id where they were lost (for the flight log)
  };
}

// Draw a full squad for a run. `contractNames` (the hired veterans from the hangar)
// each add one named slot on top of the free base squad — the M6 contract seam
// maturing into wings in the air. Distinct given names within a squad (no two "Wren").
// Deterministic from the seed.
export function generateRoster(seed, contractNames = []) {
  const rng = makeRng(String(seed) + ':wing');
  const roster = [];
  const usedGiven = new Set();
  let id = 0;

  const pushUnique = (fixedName) => {
    // resample a procedural name until its given part is unique in this squad
    let w = generateWingmate(rng, id, fixedName);
    let guard = 0;
    while (!fixedName && usedGiven.has(w.given) && guard++ < 12) {
      w = generateWingmate(rng, id, null);
    }
    usedGiven.add(w.given);
    roster.push(w);
    id++;
  };

  for (let i = 0; i < ROSTER.baseSize; i++) pushUnique(null);
  for (const nm of contractNames) pushUnique(nm);
  return roster;
}

// Aggregate the passive support a roster currently provides — ALIVE members only, so
// the numbers drop the moment a wingmate is lost (coverage for the run's remainder).
export function rosterSupport(roster) {
  let salvageMul = 0, killScore = 0, aliveCount = 0;
  for (const w of roster || []) {
    if (!w.alive) continue;
    aliveCount++;
    salvageMul += w.support.salvageMul || 0;
    killScore += w.support.killScore || 0;
  }
  return { salvageMul, killScore, aliveCount, size: (roster || []).length };
}

// Mark a wingmate lost for the remainder of the run (the distress beat's failure
// case). Idempotent; returns the wingmate (or null if the id is not on the roster).
// `atNode` records where it happened for the flight log. It NEVER removes them from
// the roster — a lost wingmate still shows, marked, so the loss is legible (and the
// UI can render them dimmed, never silently vanished).
export function loseWingmate(roster, id, atNode = null) {
  const w = (roster || []).find((m) => m.id === id);
  if (!w) return null;
  if (w.alive) { w.alive = false; w.lostAt = atNode; }
  return w;
}

// The living members — the squad still flying with you.
export function survivors(roster) {
  return (roster || []).filter((w) => w.alive);
}
