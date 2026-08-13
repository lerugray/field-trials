// jobs.js — THE JOBS (DESIGN-SEED M2). Six deck-neutral fixed kits: swapping a
// frame's job at camp is the central build verb; a job is a command set + a
// stat weighting, and it never reads the tarot layer (axis orthogonality, per
// the M0 study). Names are original bureaucratic trades in-register — the Office
// issues trades, not "warriors". Pure data + pure helpers; node-testable.
//
// Clean-room (CLAUDE.md #2): no reference's job names/abilities are used. Verb
// sets are distinct per job — no two jobs share a command list.
//
// A verb: { id, name, kind, power, target, note }
//   kind:   'attack' (physical, scales ATK) | 'spell' (scales MAG) |
//           'heal' (scales MAG) | 'guard' (raises DEF for the round) |
//           'ward' (raises an ally's DEF)
//   target: 'enemy' (a chosen foe) | 'enemies' (all) | 'ally' (a chosen ally) |
//           'allies' (all) | 'self'
//   power:  multiplier on the acting stat (see combat.js damage/heal formulas)

import { TUNING } from './tuning.js';

export const JOBS = {
  bailiff: {
    id: 'bailiff', name: 'Bailiff',
    blurb: 'Removes obstructions by removing them.',
    gear: 'arms', battler: 'HEDGE_KNIGHT',
    weights: { hp: 1.35, atk: 1.25, def: 1.2, mag: 0.4, spd: 0.9 },
    verbs: [
      { id: 'strike', name: 'Strike', kind: 'attack', power: 1.0, target: 'enemy' },
      { id: 'distrain', name: 'Distrain', kind: 'attack', power: 1.55, target: 'enemy',
        note: 'Seizes against the sturdiest party present.' },
    ],
  },
  chirurgeon: {
    id: 'chirurgeon', name: 'Chirurgeon',
    blurb: 'Mends what the road deducts; costs are filed.',
    gear: 'implements', battler: 'MYSTIC',
    weights: { hp: 0.95, atk: 0.6, def: 0.9, mag: 1.45, spd: 1.0 },
    verbs: [
      { id: 'mend', name: 'Mend', kind: 'heal', power: 1.6, target: 'ally',
        note: 'Restores the most reduced frame.' },
      { id: 'triage', name: 'Triage', kind: 'heal', power: 0.7, target: 'allies' },
    ],
  },
  surveyor: {
    id: 'surveyor', name: 'Surveyor',
    blurb: 'Files distant findings as wounds.',
    gear: 'arms', battler: 'WARDEN',
    weights: { hp: 0.85, atk: 1.3, def: 0.7, mag: 0.8, spd: 1.3 },
    verbs: [
      { id: 'loose', name: 'Loose', kind: 'attack', power: 1.15, target: 'enemy' },
      { id: 'mark_and_loose', name: 'Mark & Loose', kind: 'attack', power: 1.7, target: 'enemy',
        note: 'Files against the weakest-warded foe.' },
    ],
  },
  almoner: {
    id: 'almoner', name: 'Almoner',
    blurb: 'Schedules relief and steadies the line.',
    gear: 'implements', battler: 'SHAMAN',
    weights: { hp: 1.0, atk: 0.75, def: 1.0, mag: 1.15, spd: 0.95 },
    verbs: [
      { id: 'ration', name: 'Ration', kind: 'heal', power: 1.0, target: 'ally' },
      { id: 'relief', name: 'Relief', kind: 'ward', power: 1.0, target: 'allies',
        note: 'Raises the whole party\'s warding for the round.' },
    ],
  },
  notary: {
    id: 'notary', name: 'Notary',
    blurb: 'Binds by instrument; injunctions land as blows.',
    gear: 'implements', battler: 'ARCANIST',
    weights: { hp: 0.9, atk: 0.6, def: 0.85, mag: 1.5, spd: 1.05 },
    verbs: [
      { id: 'enjoin', name: 'Enjoin', kind: 'spell', power: 1.35, target: 'enemy' },
      { id: 'injunction', name: 'File Injunction', kind: 'spell', power: 1.0, target: 'enemies',
        note: 'Serves the whole opposing party at once.' },
    ],
  },
  sumpter: {
    id: 'sumpter', name: 'Sumpter',
    blurb: 'Bears the load and stands in front of it.',
    gear: 'arms', battler: 'TEMPLAR',
    weights: { hp: 1.5, atk: 0.9, def: 1.45, mag: 0.5, spd: 0.75 },
    verbs: [
      { id: 'bear', name: 'Bear', kind: 'guard', power: 1.0, target: 'self',
        note: 'Sets against the next deductions.' },
      { id: 'shoulder', name: 'Shoulder', kind: 'attack', power: 0.95, target: 'enemy' },
    ],
  },
};

// The canonical roster order (stable — used by UI and the degeneracy sweep).
export const JOB_IDS = ['bailiff', 'chirurgeon', 'surveyor', 'almoner', 'notary', 'sumpter'];

// The default expedition comp (a functional front/heal/dps/wall).
export const DEFAULT_PARTY = ['bailiff', 'chirurgeon', 'surveyor', 'sumpter'];

export function getJob(id) {
  const j = JOBS[id];
  if (!j) throw new Error('unknown job: ' + id);
  return j;
}

// deriveStats: the stat block a job produces from the shared base chassis. Pure
// and deterministic. `mult` scales the whole block (used for enemy tiers).
// `mult` scales the whole block (enemy tiers); `masteryMult` is the M5 job-mastery
// overlay (a job's certification level → +x% per level). Both default to 1, so
// callers that pass neither reproduce the exact M2 baseline block.
export function deriveStats(jobId, mult = 1, masteryMult = 1) {
  const job = getJob(jobId);
  const b = TUNING.baseStats;
  const w = job.weights;
  const m = mult * masteryMult;
  return {
    hp: Math.round(b.hp * w.hp * m),
    atk: Math.round(b.atk * w.atk * m),
    def: Math.round(b.def * w.def * m),
    mag: Math.round(b.mag * w.mag * m),
    spd: Math.round(b.spd * w.spd * m),
  };
}

// verbSetKey: a stable signature of a job's verb list (for the distinctness law).
export function verbSetKey(jobId) {
  return getJob(jobId).verbs.map((v) => v.id).sort().join('+');
}
