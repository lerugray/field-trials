// Mood: the pet's readable emotional state, derived PURELY from its vitals
// (bond / stress / fatigue) and its temperament. No storage, no RNG, no clock —
// mood is a view of the numbers, so the same vitals always read the same way and
// a test can pin it. Temperament shifts the reading (a Bold pet gets grumpy where
// a Timid one gets anxious), which is how "temperament states with visible
// reactions" (M3) shows up: the same stress wears two different faces.
//
// Each mood carries FACE params the renderer consumes (mouth, eyes, brow, bounce)
// so "the pet visibly behaves differently after" an interaction is a direct
// consequence of the vitals moving across a threshold.

import { STRESS_MAX, FATIGUE_MAX, BOND_MAX } from './raise.js';

// Temperament groupings. Spiky temperaments externalize stress as grumpiness;
// soft ones internalize it as anxiety. Playful ones tip into play when content.
const SPIKY = new Set(['Bold', 'Wild', 'Stoic', 'Cheeky']);
const PLAYFUL = new Set(['Cheeky', 'Curious', 'Wild', 'Bold']);

// Some temperaments feel stress sooner (Timid) or later (Stoic); this nudges the
// stress threshold a little so the tell is temperament-flavored, not uniform.
const STRESS_SENSITIVITY = {
  Timid: -10,
  Calm: +6,
  Stoic: +12,
  Wild: +4,
  Bold: +6,
};

// Face vocabulary the renderer reads:
//   mouth: 'grin' | 'smile' | 'flat' | 'frown' | 'wobble' | 'open'
//   eyes:  'happy' | 'open' | 'wide' | 'sleepy' | 'sad'
//   brow:  -1 worried (inner-up) | 0 neutral | 1 cross (inner-down)
//   bounce: idle-bob multiplier (1 = normal; >1 livelier; <1 sluggish)
const MOODS = {
  playful: { id: 'playful', label: 'playful', mouth: 'grin', eyes: 'happy', brow: 0, bounce: 1.5 },
  happy: { id: 'happy', label: 'happy', mouth: 'smile', eyes: 'happy', brow: 0, bounce: 1.15 },
  content: { id: 'content', label: 'content', mouth: 'smile', eyes: 'open', brow: 0, bounce: 1 },
  tired: { id: 'tired', label: 'tired', mouth: 'flat', eyes: 'sleepy', brow: 0, bounce: 0.5 },
  anxious: { id: 'anxious', label: 'anxious', mouth: 'wobble', eyes: 'wide', brow: -1, bounce: 0.9 },
  grumpy: { id: 'grumpy', label: 'grumpy', mouth: 'frown', eyes: 'open', brow: 1, bounce: 0.8 },
  lonely: { id: 'lonely', label: 'lonely', mouth: 'frown', eyes: 'sad', brow: -1, bounce: 0.6 },
};

export const MOOD_IDS = Object.keys(MOODS);

// Thresholds (percent-of-max, so they read against the 0..100 vitals directly).
const TIRED_AT = 70;
const STRESS_HIGH = 58;
const BOND_LOW = 24;
const BOND_HIGH = 70;
const STRESS_LOW = 26;

// Derive the resting mood. Ordered checks: the loudest need wins. Fatigue first
// (a wiped-out pet reads tired no matter what), then acute stress, then a lonely
// low bond, then the happy/playful/content spectrum.
export function moodOf(creature) {
  if (!creature) return MOODS.content;
  const bond = creature.bond ?? BOND_MAX / 2;
  const stress = creature.stress ?? 0;
  const fatigue = creature.fatigue ?? 0;
  const temperament = creature.temperament;

  const stressThreshold = STRESS_HIGH + (STRESS_SENSITIVITY[temperament] || 0);

  if (fatigue >= TIRED_AT && stress < stressThreshold) return MOODS.tired;
  if (stress >= stressThreshold) {
    return SPIKY.has(temperament) ? MOODS.grumpy : MOODS.anxious;
  }
  if (bond <= BOND_LOW) return MOODS.lonely;
  if (bond >= BOND_HIGH && stress <= STRESS_LOW) {
    return PLAYFUL.has(temperament) ? MOODS.playful : MOODS.happy;
  }
  return MOODS.content;
}

// A short, plain, player-facing line for the mood (no em-dashes; copy pass later).
const MOOD_NOTE = {
  playful: 'bouncing with energy',
  happy: 'happy to see you',
  content: 'settled and calm',
  tired: 'worn out, needs rest',
  anxious: 'jumpy and on edge',
  grumpy: 'in a prickly mood',
  lonely: 'a little lonely',
};

export function moodNote(creature) {
  return MOOD_NOTE[moodOf(creature).id] || '';
}
