// THE JACQUARD INDEX — the twist registry (M3: one rule twist per shelf).
//
// Each shelf is the base machine + ONE twist. A twist is captured here as a small strategy
// object so the play scene, the board view, the hint UI, and the content prover all consult
// ONE place instead of special-casing shelves. Every twist MUST preserve the no-guess law
// (hard-rule 4): its `certify` runs a machine-checked guess-free + unique proof, and a card
// that fails is never content.
//
//   id           the shelf's twist key (null-twist 'loom' is the base machine)
//   name         house-facing label
//   marginLabel  a short in-world tag drawn on the board so the player knows the rule
//   displayClues (puzzle) -> { rowClues, colClues } shown on the selvedge margin
//   certify      (motif)  -> a build record (ok / tier / reason), the content gate
//   hint         (board)  -> the twist-aware next hint

import { buildPuzzle } from './generator.js';
import { nextHint } from './hints.js';
import { negativeDisplayClues, certifyNegative, negativeHint } from './negative.js';
import { certifyMirror } from './mirror.js';
import { certifyTwoThread } from './twothread.js';
import { certifyCountingHouse } from './countinghouse.js';

function baseDisplayClues(puzzle) {
  return { rowClues: puzzle.rowClues, colClues: puzzle.colClues };
}

export const TWISTS = {
  loom: {
    id: 'loom',
    name: 'THE LOOM',
    marginLabel: null,
    displayClues: baseDisplayClues,
    certify: buildPuzzle,
    hint: nextHint,
  },
  'negative-cloth': {
    id: 'negative-cloth',
    name: 'NEGATIVE CLOTH',
    marginLabel: 'BARE WARP - COUNTS ARE GAPS',
    displayClues: negativeDisplayClues,
    certify: certifyNegative,
    hint: negativeHint,
  },
  // HOUSE RULES: the base machine, but a wrong stitch is marked against you. No prover or
  // clue change (the puzzles are ordinary guess-free base cards); the twist is an opt-in
  // PLAY rule the play scene enforces. A careful solver never needs a guess, so the penalty
  // is pure opt-in stakes (accessibility law: hints stay uncapped + zero-penalty).
  'house-rules': {
    id: 'house-rules',
    name: 'HOUSE RULES',
    marginLabel: 'HOUSE RULES - THREE STRIKES TEARS THE CLOTH',
    displayClues: baseDisplayClues,
    certify: buildPuzzle,
    hint: nextHint,
    rules: { penalty: true, maxStrikes: 3 },
  },
  // TWO-THREAD: two colours on one card. It has its OWN coloured board + play scene (the
  // base binary board cannot hold three thread states), so `coloredScene` routes the index
  // to it; certify is the coloured prover (used for the guarantee band).
  'two-thread': {
    id: 'two-thread',
    name: 'TWO-THREAD',
    marginLabel: 'TWO-THREAD - COUNT EACH THREAD ON ITS OWN',
    displayClues: baseDisplayClues, // unused (coloured scene draws coloured clues)
    certify: certifyTwoThread,
    hint: nextHint,                 // unused (coloured scene has its own hint)
    coloredScene: true,
  },
  // COUNTING-HOUSE: paired-row ledger clues. Ordinary binary board, but the row axis is one
  // ledger per pair, so it has its OWN scene (custom margin) routed by `ledgerScene`.
  'counting-house': {
    id: 'counting-house',
    name: 'COUNTING-HOUSE',
    marginLabel: 'COUNTING-HOUSE - ONE LEDGER PER ROW PAIR',
    displayClues: baseDisplayClues, // unused (ledger scene draws its own margins)
    certify: certifyCountingHouse,
    hint: nextHint,                 // unused (ledger scene has its own hint)
    ledgerScene: true,
  },
  // MIRROR-WEAVE: the loom weaves both sides of a declared fold. Ordinary guess-free base
  // clues (symmetry as extra deduction is vacuous, see mirror.js); the twist is the felt
  // mechanic — every mark is mirrored across the axis, so you weave half.
  'mirror-weave': {
    id: 'mirror-weave',
    name: 'MIRROR-WEAVE',
    marginLabel: 'MIRROR-WEAVE - THE LOOM WEAVES BOTH SIDES',
    displayClues: baseDisplayClues,
    certify: certifyMirror,
    hint: nextHint,
    fold: true, // per-card axis lives on the motif (motif.axis)
  },
  // THE GRAND PATCHWORK: the finale ASSEMBLY frame (seed: patchwork is not a deduction
  // twist). Each patch is an ordinary guess-free base card; weaving a whole panel assembles
  // the story cloth (the M2 composePanel payoff, already wired in the play scene).
  patchwork: {
    id: 'patchwork',
    name: 'THE GRAND PATCHWORK',
    marginLabel: 'THE GRAND PATCHWORK - A PANEL OF THE HOUSE STORY',
    displayClues: baseDisplayClues,
    certify: buildPuzzle,
    hint: nextHint,
  },
};

// The twist for a shelf twist-key; the base machine when unset or unknown.
export function twistFor(key) {
  return (key && TWISTS[key]) || TWISTS.loom;
}

// A card's guarantee band under ITS twist (not the base rows+cols reading, which is wrong
// for twist cards whose base grid is not line-solvable). Runs the twist's certify once and
// memoises the result on the card, so the index and the play scene agree on the tier.
export function cardBand(card) {
  if (card._band) return card._band;
  const rec = twistFor(card.twist).certify(card);
  const tierName = rec.tier ? `T${rec.tier}` : (rec.ok ? 'T*' : '?');
  card._band = { ok: rec.ok, tier: rec.tier || null, tierName, reason: rec.reason };
  return card._band;
}
