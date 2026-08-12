// The 70 Buddies. Each is a summonable roster entry, built as a PARAMETERIZED
// ARCHETYPE (a shared body rig) tinted by a base hue and detailed by the
// summon seed. No bespoke per-species art in M1 — the archetype + hue + seed
// carry recognizability; the full 70-rig pass is M7.
//
// Fields: id (stable key), name (display), rarity, archetype (body rig),
// hue (base palette anchor, 0-359).

// The rarity tiers, in ascending order. Weights bias summons toward common;
// discovered catalysts will later tilt this (M-later), never deny a summon.
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_WEIGHTS = {
  common: 50,
  uncommon: 28,
  rare: 14,
  epic: 6,
  legendary: 2,
};

// The ~10 shared body rigs. The renderer builds every creature from one of
// these silhouettes, varied by hue + seed. Kept as a list so tests can assert
// every species maps to a known rig.
export const ARCHETYPES = [
  'blob',
  'critter',
  'avian',
  'bug',
  'aquatic',
  'humanoid',
  'orb',
  'object',
  'plant',
  'spectral',
];

// --- species traits (M7) -----------------------------------------------------
// The archetype gives the base silhouette; these four traits are the SPECIES
// FEATURE LAYER that makes each of the 70 read distinctly on top of the shared
// rig, without any bespoke per-species art. The renderer draws a small library
// of parts keyed off these enums — a Cat and a Corgi are both 'critter' but a
// pointed ear vs a floppy ear reads them apart at a glance.
export const EARS = ['none', 'pointed', 'floppy', 'round', 'long', 'tuft', 'horns', 'antler', 'fin'];
export const FACES = ['none', 'beak', 'bill', 'muzzle', 'tusk', 'fangs'];
export const PATTERNS = ['none', 'spots', 'stripes', 'patch', 'starbelly', 'scales', 'swirl'];
export const EYE_COUNTS = [1, 2, 3, 4];
export const TELL_CLARITIES = ['clear', 'shaded', 'oblique'];

// --- affinities (M7) ---------------------------------------------------------
// Each archetype carries a battle AFFINITY: a flavor element and one of ~5 shared
// VFX families the renderer draws when that creature acts. For M7 the affinity is
// a visible identity (element label in the codex, colored clash VFX in the ring),
// NOT a damage multiplier — combat weighting of elements is M8 balance's to own.
export const VFX_FAMILIES = ['splash', 'impact', 'gust', 'bloom', 'wisp'];

export const ARCHETYPE_AFFINITY = {
  blob: { element: 'Ooze', vfx: 'splash', hue: 130 },
  critter: { element: 'Beast', vfx: 'impact', hue: 25 },
  avian: { element: 'Gale', vfx: 'gust', hue: 200 },
  bug: { element: 'Swarm', vfx: 'gust', hue: 90 },
  aquatic: { element: 'Tide', vfx: 'splash', hue: 205 },
  humanoid: { element: 'Grit', vfx: 'impact', hue: 30 },
  orb: { element: 'Spark', vfx: 'wisp', hue: 50 },
  object: { element: 'Scrap', vfx: 'impact', hue: 210 },
  plant: { element: 'Bloom', vfx: 'bloom', hue: 110 },
  spectral: { element: 'Phantom', vfx: 'wisp', hue: 270 },
};

export function affinityOf(species) {
  const a = species && species.archetype && ARCHETYPE_AFFINITY[species.archetype];
  return a || ARCHETYPE_AFFINITY.critter;
}

// name, rarity, archetype, hue, ears, face, pattern, tellClarity, [eyes=2]
const RAW = [
  // Common (14)
  ['Anchor', 'common', 'object', 210, 'none', 'none', 'none', 'clear'], // Heavy, literal movement makes its intent easy to read.
  ['Bee', 'common', 'bug', 48, 'none', 'none', 'stripes', 'clear'], // Direct darting and bracing suit a simple worker insect.
  ['Cat', 'common', 'critter', 30, 'pointed', 'muzzle', 'none', 'shaded'], // Feline feints are readable but never completely plain.
  ['Corgi', 'common', 'critter', 33, 'floppy', 'muzzle', 'patch', 'clear'], // An eager, open posture gives away the next move.
  ['Cow', 'common', 'critter', 330, 'none', 'muzzle', 'none', 'clear'], // Broad weight shifts are slow and unmistakable.
  ['Duck', 'common', 'avian', 52, 'none', 'bill', 'none', 'clear'], // Simple wing and foot preparation reads cleanly.
  ['Frog', 'common', 'blob', 110, 'none', 'none', 'none', 'clear'], // Crouch, brace, and spring are obvious amphibian cues.
  ['Gorby', 'common', 'blob', 275, 'none', 'none', 'patch', 'shaded'], // Its odd, mercurial character softens otherwise plain cues.
  ['Hamster', 'common', 'critter', 36, 'round', 'muzzle', 'patch', 'clear'], // Busy but guileless preparation is easy to spot.
  ['Pig', 'common', 'critter', 340, 'floppy', 'muzzle', 'none', 'clear'], // A blunt, grounded fighter telegraphs honestly.
  ['Potato', 'common', 'blob', 34, 'none', 'none', 'spots', 'clear'], // Its whole body must shift before it can act.
  ['Rat', 'common', 'critter', 250, 'none', 'none', 'none', 'shaded'], // Wary scavenger footwork makes the cue less direct.
  ['Slime', 'common', 'blob', 130, 'none', 'none', 'none', 'clear'], // Its simple mass visibly gathers for every action.
  ['Taco', 'common', 'object', 42, 'none', 'none', 'stripes', 'clear'], // A rigid shell leaves little room for deception.

  // Uncommon (18)
  ['Axolotl', 'uncommon', 'aquatic', 335, 'tuft', 'none', 'spots', 'clear'], // Soft, uncomplicated motions keep its tells open.
  ['Bat', 'uncommon', 'avian', 265, 'none', 'fangs', 'none', 'shaded'], // Twitchy nocturnal movement obscures the exact preparation.
  ['Box', 'uncommon', 'object', 28, 'none', 'none', 'stripes', 'clear'], // Hinges and weight shifts expose what the box will do.
  ['Coopa', 'uncommon', 'critter', 95, 'none', 'beak', 'none', 'clear'], // A sturdy, straightforward creature commits visibly.
  ['Crab', 'uncommon', 'bug', 8, 'none', 'none', 'none', 'shaded'], // Sideways posture makes truthful cues less direct.
  ['Dice', 'uncommon', 'object', 0, 'none', 'none', 'none', 'oblique'], // Chance-coded character expresses intent through ambiguous balance.
  ['Dolphin', 'uncommon', 'aquatic', 205, 'fin', 'beak', 'none', 'clear'], // Athletic line and momentum make each commitment legible.
  ['Fox', 'uncommon', 'critter', 22, 'pointed', 'muzzle', 'patch', 'oblique'], // A canonical trickster tells truth through sly adjacent cues.
  ['Goblin', 'uncommon', 'humanoid', 100, 'pointed', 'fangs', 'none', 'shaded'], // Scrappy feints cloud a still-honest posture.
  ['Imp', 'uncommon', 'humanoid', 5, 'horns', 'fangs', 'none', 'oblique'], // Mischief makes its truthful preparation deliberately coy.
  ['Moth', 'uncommon', 'bug', 40, 'tuft', 'none', 'spots', 'shaded'], // Fluttering noise makes the useful cue less obvious.
  ['Owl', 'uncommon', 'avian', 30, 'tuft', 'beak', 'spots', 'shaded'], // Patient stillness reveals intent only to close attention.
  ['Panda', 'uncommon', 'critter', 0, 'none', 'muzzle', 'none', 'clear'], // Deliberate, broad motions are hard to conceal.
  ['Parrot', 'uncommon', 'avian', 140, 'none', 'none', 'stripes', 'shaded'], // Showy mimic character wraps a true cue in flourish.
  ['Penguin', 'uncommon', 'avian', 220, 'none', 'beak', 'patch', 'clear'], // Upright commitment and simple footwork read plainly.
  ['Raccoon', 'uncommon', 'critter', 210, 'none', 'muzzle', 'none', 'oblique'], // A masked scavenger naturally signals through crafty half-cues.
  ['Rooster', 'uncommon', 'avian', 355, 'tuft', 'beak', 'none', 'clear'], // Proud, declarative posture broadcasts the next action.
  ['Snail', 'uncommon', 'bug', 80, 'tuft', 'none', 'swirl', 'clear'], // Slow preparation leaves ample time to read the cue.

  // Rare (17)
  ['Bac Man', 'rare', 'orb', 55, 'none', 'none', 'none', 'clear'], // A single huge mouth makes attack posture conspicuous.
  ['Basilisk', 'rare', 'critter', 120, 'horns', 'fangs', 'scales', 'oblique'], // Predatory patience hides intent in truthful stillness.
  ['Cane Toad', 'rare', 'blob', 70, 'none', 'none', 'spots', 'clear'], // A squat body must visibly load before moving.
  ['Capybara', 'rare', 'critter', 28, 'round', 'muzzle', 'none', 'clear'], // Calm, unguarded character produces plain tells.
  ['Coffee', 'rare', 'object', 25, 'none', 'none', 'none', 'shaded'], // Jittery steam and tremor partly mask the useful cue.
  ['Dali Clock', 'rare', 'object', 45, 'none', 'none', 'none', 'oblique'], // Surreal motion stays truthful while resisting literal reading.
  ['Doobie', 'rare', 'plant', 95, 'none', 'none', 'stripes', 'shaded'], // Loose, drifting character softens its commitments.
  ['Dragon', 'rare', 'critter', 145, 'horns', 'none', 'scales', 'shaded'], // Proud power is readable, but seasoned predation adds restraint.
  ['Jellyfish', 'rare', 'aquatic', 300, 'none', 'none', 'none', 'shaded'], // Diffuse tentacle motion makes the true cue indirect.
  ['Joe Camel', 'rare', 'critter', 38, 'none', 'none', 'none', 'shaded'], // Cool mascot swagger keeps preparation understated.
  ['Kobold', 'rare', 'humanoid', 15, 'pointed', 'fangs', 'none', 'shaded'], // Cautious pack-fighter habits create guarded cues.
  ['Mantis Shrimp', 'rare', 'bug', 315, 'tuft', 'none', 'stripes', 'oblique'], // Explosive limbs hold several adjacent threats at once.
  ['Mushroom', 'rare', 'plant', 355, 'none', 'none', 'spots', 'shaded'], // Slow, uncanny shifts need interpretation but remain honest.
  ['Octopus', 'rare', 'aquatic', 350, 'none', 'none', 'none', 'oblique'], // Many clever limbs make the active commitment hard to isolate.
  ['Orca', 'rare', 'aquatic', 215, 'fin', 'beak', 'patch', 'shaded'], // Intelligent hunting posture is controlled rather than blatant.
  ['Sanic', 'rare', 'critter', 220, 'pointed', 'muzzle', 'stripes', 'clear'], // Speed is the joke, so its movement cue is unmistakable.
  ['Wolf', 'rare', 'critter', 220, 'pointed', 'muzzle', 'none', 'shaded'], // A practiced hunter commits without broadcasting the detail.

  // Epic (12)
  ['Beholder', 'epic', 'orb', 300, 'tuft', 'fangs', 'none', 'oblique', 1], // Alien vigilance makes every truthful cue feel equivocal.
  ['Burger', 'epic', 'object', 35, 'none', 'none', 'stripes', 'clear'], // A stacked object can only commit through obvious mass shifts.
  ['Chonk', 'epic', 'blob', 30, 'pointed', 'muzzle', 'stripes', 'clear'], // Great width turns preparation into an easy whole-body read.
  ['Clippy', 'epic', 'object', 200, 'none', 'none', 'none', 'oblique'], // An intrusive helper character signals sideways and indirectly.
  ['Comrade', 'epic', 'humanoid', 0, 'none', 'muzzle', 'starbelly', 'clear'], // Martial discipline makes stance changes formal and legible.
  ['Kilowatt', 'epic', 'orb', 55, 'antler', 'none', 'none', 'shaded'], // Constant charge noise partly veils the real buildup.
  ['Kraken', 'epic', 'aquatic', 160, 'horns', 'fangs', 'spots', 'oblique'], // Too many predatory limbs make one true cue hard to parse.
  ['Mimic', 'epic', 'object', 30, 'none', 'fangs', 'stripes', 'oblique'], // Deceptive character demands adjacent truth without false tells.
  ['Phoenix', 'epic', 'avian', 20, 'tuft', 'beak', 'none', 'shaded'], // Flame and ceremony wrap a genuine commitment in spectacle.
  ['Robot', 'epic', 'humanoid', 200, 'antler', 'none', 'stripes', 'clear'], // Programmed preparation is precise and repeatable.
  ['Tardigrade', 'epic', 'bug', 40, 'none', 'fangs', 'spots', 'shaded'], // Tiny, many-legged movement diffuses the useful cue.
  ['Unicorn', 'epic', 'critter', 290, 'horns', 'muzzle', 'starbelly', 'clear'], // Noble, declarative posture favors clean tells.

  // Legendary (9)
  ['Claude', 'legendary', 'spectral', 25, 'none', 'none', 'starbelly', 'shaded'], // Friendly composure keeps power cues restrained but readable.
  ['Cosmic Whale', 'legendary', 'aquatic', 250, 'fin', 'beak', 'starbelly', 'oblique'], // Vast, slow motion communicates on an unfamiliar scale.
  ['Ghost', 'legendary', 'spectral', 190, 'none', 'none', 'none', 'oblique'], // An incorporeal body can only hint truth through drift.
  ['Illuminati', 'legendary', 'orb', 50, 'none', 'none', 'none', 'oblique', 1], // Conspiratorial character makes direct disclosure inappropriate.
  ['Starspawn', 'legendary', 'spectral', 280, 'tuft', 'fangs', 'spots', 'oblique', 4], // Alien anatomy makes honest intention hard to decode.
  ['Tree', 'legendary', 'plant', 110, 'antler', 'none', 'none', 'clear'], // Rooted, deliberate movement gives long, plain preparation.
  ['Void Cat', 'legendary', 'spectral', 270, 'pointed', 'none', 'starbelly', 'oblique'], // Feline guile plus void drift produces elusive true cues.
  ['Yog-Sothoth', 'legendary', 'spectral', 150, 'none', 'fangs', 'spots', 'oblique', 4], // Cosmic multiplicity makes one intent readable only obliquely.
  ['Zorak', 'legendary', 'bug', 130, 'tuft', 'fangs', 'none', 'oblique'], // A calculating mantis predator reveals only adjacent posture.
];

function toId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const SPECIES = RAW.map(([name, rarity, archetype, hue, ears = 'none', face = 'none', pattern = 'none', tellClarity = 'clear', eyes = 2]) => ({
  id: toId(name),
  name,
  rarity,
  archetype,
  hue,
  tellClarity,
  traits: { ears, face, pattern, eyes },
}));

// Index helpers.
export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export const SPECIES_BY_RARITY = RARITIES.reduce((acc, r) => {
  acc[r] = SPECIES.filter((s) => s.rarity === r);
  return acc;
}, {});
