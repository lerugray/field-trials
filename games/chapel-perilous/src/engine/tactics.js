// M11 Part A — the environment-keying for the SUBTERFUGE verb (directive §1: "the
// character trying to manipulate the environment for a temporary advantage"; per-biome/
// per-site flavor "ties to the register engine"). This turns the current environment into
// the {chance, kind, label} context combat.js resolves a subterfuge attempt against.
//
// Data-driven from data/register/combat.json: each biome may weight the gambit
// differently (the fen's mist favors a distraction; the open salt pan has nowhere to hide
// so a feint EXPOSES instead) with [SEED] flavor labels. Absent biome → the default.
// Pure + deterministic in the passed seed.
import { mulberry32 } from './prng.js';

export function subterfugeContext(combatData, env = {}, seed = 0) {
  const sub = (combatData && combatData.subterfuge) || {};
  const def = sub.default || { chance: 0.5, kind: 'distract', labels: ['[SEED] works the ground for an opening'] };
  const biomes = sub.biomes || {};
  const spec = (env && env.biome && biomes[env.biome]) || def;
  const labels = (spec.labels && spec.labels.length) ? spec.labels : def.labels;
  const rng = mulberry32((seed >>> 0) || 1);
  const label = labels[Math.floor(rng() * labels.length)];
  return {
    chance: typeof spec.chance === 'number' ? spec.chance : def.chance,
    kind: spec.kind === 'expose' ? 'expose' : 'distract',
    label,
  };
}
