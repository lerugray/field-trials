// THE JACQUARD INDEX — the catalogue shelves (M3: the eight card-sets).
//
// The seed's HOOK: the library is a fixed roster of EIGHT shelves (studio amendment), each
// the base machine + ONE rule twist, opened shelf by shelf. This module is the catalogue's
// spine: it declares the eight shelves as data, assigns proved content to the ones that are
// built, and provides the progression / unlock logic (a shelf opens once the shelf before
// it is fully woven). Sealed shelves are shown in the index as future drawers, never as
// placeholder art (they are a legitimate diegetic state: not yet cut).
//
// A shelf's twist is a mini-M1: its own prover extension, hint entries, and adversarial
// suite land in the shelf's own increment. Until then the shelf is `built: false` and the
// index draws it as a sealed drawer. THE BIAS (shelf 6) is additionally ratification-gated
// (CLAUDE.md rule 10): even once its prover exists it stays sealed until the operator says.

import { STARTER_MOTIFS } from './starter.js';
import { MOTIFS } from './motifs.js';
import { NEGATIVE_MOTIFS, NEGATIVE_TEACHING } from './negativeMotifs.js';
import { PATCHWORK_MOTIFS, PATCHWORK_TEACHING } from './patchworkMotifs.js';
import { MIRROR_MOTIFS, MIRROR_TEACHING } from './mirrorMotifs.js';
import { TWOTHREAD_MOTIFS, TWOTHREAD_TEACHING } from './twoThreadMotifs.js';
import { COUNTINGHOUSE_MOTIFS, COUNTINGHOUSE_TEACHING } from './countingHouseMotifs.js';
import { parseTwoThread, twoThreadClues } from '../puzzle/twothread.js';
import { Puzzle } from '../puzzle/puzzle.js';

// THE LOOM's curriculum: the teaching card leads, then a curated 12 base-machine puzzles in
// a gentle 5x5 -> 8x8 climb (seed: 12 puzzles + its teaching puzzle). The rest of the motif
// library is the shared POOL later shelves draw their twist grids from (a negative-cloth or
// mirror-weave card is a motif grid read under a different clue rule), so the base pool is
// deliberately larger than any one shelf.
const LOOM_TEACHING = 'spool';
const LOOM_MEMBERS = [
  LOOM_TEACHING, // THE SPOOL (5x5) — the primer's first thread
  'star', 'button', 'thimble', 'leaf', 'spindle', 'gear', // 5x5 shop motifs
  'heart6',            // 6x6
  'crown',             // 7x7
  'bobbin', 'shuttle', 'loom', 'fish', // 8x8
];

// The fixed eight-shelf roster (seed studio amendment). `built` shelves carry content now;
// unbuilt ones are declared so the index shows the shape of the catalogue to come.
export const SHELVES = [
  {
    order: 0, id: 'loom', name: 'THE LOOM', twist: null, built: true,
    tagline: 'THE PRIMER',
    blurb: 'A clue is run-lengths in order, with a gap between each. No twist here. Learn the machine; it never asks you to guess.',
    teaching: LOOM_TEACHING,
    memberIds: LOOM_MEMBERS,
  },
  {
    order: 1, id: 'two-thread', name: 'TWO-THREAD', twist: 'two-thread', built: true,
    tagline: 'PAIRED COLOUR',
    blurb: 'Two threads on one card. Each clue counts its own thread; the threads keep their stitch shapes, so you never lean on the colour.',
    teaching: TWOTHREAD_TEACHING, memberIds: TWOTHREAD_MOTIFS.map((m) => m.id),
  },
  {
    order: 2, id: 'counting-house', name: 'COUNTING-HOUSE', twist: 'counting-house', built: true,
    tagline: 'PAIRED ROWS',
    blurb: 'The counting-house totals two rows at once. A clue may reach across a pair of lines; balance the books.',
    teaching: COUNTINGHOUSE_TEACHING, memberIds: COUNTINGHOUSE_MOTIFS.map((m) => m.id),
  },
  {
    order: 3, id: 'negative-cloth', name: 'NEGATIVE CLOTH', twist: 'negative-cloth', built: true,
    tagline: 'THE GAPS',
    blurb: 'Here the counts describe the bare warp, not the thread. Read the gaps; the cloth is what is left.',
    teaching: NEGATIVE_TEACHING, memberIds: NEGATIVE_MOTIFS.map((m) => m.id),
  },
  {
    order: 4, id: 'mirror-weave', name: 'MIRROR-WEAVE', twist: 'mirror-weave', built: true,
    tagline: 'DECLARED SYMMETRY',
    blurb: 'The pattern is folded true. What one half holds, the other answers.',
    teaching: MIRROR_TEACHING, memberIds: MIRROR_MOTIFS.map((m) => m.id),
  },
  {
    order: 5, id: 'house-rules', name: 'HOUSE RULES', twist: 'house-rules', built: true,
    tagline: 'MISTAKE PENALTY',
    blurb: 'The old house rules: a miscount is marked against you. Opt in if you want the floor supervisor watching.',
    // Ordinary guess-free base cards, distinct from THE LOOM, under the penalty rule; a
    // gentle 5x5 -> 10x10 climb so the stakes rise with the board.
    teaching: 'plainweave',
    memberIds: [
      'plainweave', 'thistle', 'oak', 'house5', 'boat', // 5x5
      'latch', 'diamond6', 'shuttle6',                   // 6x6
      'frame7',                                          // 7x7
      'anchor', 'fern',                                  // 8x8
      'diamondtwill',                                    // 9x9
      'tree',                                            // 10x10
    ],
  },
  {
    order: 6, id: 'bias', name: 'THE BIAS', twist: 'bias', built: false, ratificationGated: true,
    tagline: 'DIAGONAL GRAIN',
    blurb: 'The invented shelf: the grain runs on the bias. Counts along the diagonal join the rows and columns.',
    teaching: null, memberIds: [],
  },
  {
    order: 7, id: 'patchwork', name: 'THE GRAND PATCHWORK', twist: 'patchwork', built: true,
    tagline: 'THE FINALE',
    blurb: 'The finale: small panels tile into the house\'s whole story. Assemble the pattern-room entire.',
    teaching: PATCHWORK_TEACHING, memberIds: PATCHWORK_MOTIFS.map((m) => m.id),
  },
];

const POOL = (() => {
  const p = {};
  for (const m of [...STARTER_MOTIFS, ...MOTIFS, ...NEGATIVE_MOTIFS, ...PATCHWORK_MOTIFS, ...MIRROR_MOTIFS, ...TWOTHREAD_MOTIFS, ...COUNTINGHOUSE_MOTIFS]) p[m.id] = m;
  return p;
})();

// Ids whose grids are two-colour (built as coloured cards, not binary Puzzles).
const TWOTHREAD_IDS = new Set(TWOTHREAD_MOTIFS.map((m) => m.id));

// Resolve a shelf's member ids into cards carrying built Puzzles (memoised per motif).
const _cardCache = {};
function cardFor(id) {
  if (_cardCache[id]) return _cardCache[id];
  const m = POOL[id];
  if (!m) throw new Error(`shelf references unknown motif '${id}'`);
  let card;
  if (TWOTHREAD_IDS.has(id)) {
    // A coloured (two-thread) card: no binary Puzzle; carries the coloured grid + clues.
    const parsed = parseTwoThread(m.rows);
    const clues = twoThreadClues(parsed.width, parsed.height, parsed.grid);
    card = { ...m, shelf: null, width: parsed.width, height: parsed.height, colored: { ...parsed, ...clues } };
  } else {
    card = { ...m, shelf: null, puzzle: Puzzle.fromAscii(m.rows) };
  }
  _cardCache[id] = card;
  return card;
}

// A shelf's ordered cards (empty for unbuilt shelves).
export function shelfCards(shelf) {
  return shelf.memberIds.map((id) => {
    const c = cardFor(id);
    c.shelf = shelf.id;
    c.twist = shelf.twist; // null for THE LOOM; the shelf's twist key otherwise
    return c;
  });
}

// The teaching card of a shelf, if any.
export function shelfTeaching(shelf) {
  return shelf.teaching ? cardFor(shelf.teaching) : null;
}

// Every card across the whole catalogue, keyed by id (for panel assembly + lookups).
export function allCatalogueCardsById(shelves = SHELVES) {
  const by = {};
  for (const s of shelves) for (const c of shelfCards(s)) by[c.id] = c;
  return by;
}

// Progression: a shelf is complete when it is built and every member is woven.
export function shelfComplete(shelf, progress) {
  if (!shelf.built || shelf.memberIds.length === 0) return false;
  for (const id of shelf.memberIds) if (!progress.has(id)) return false;
  return true;
}

// How many of a shelf's members are woven.
export function shelfWovenCount(shelf, progress) {
  let n = 0;
  for (const id of shelf.memberIds) if (progress.has(id)) n++;
  return n;
}

// The gentle unlock: shelf 0 is always open; every later BUILT shelf opens once the shelf
// before it is complete. Unbuilt shelves are never enterable (sealed drawers); a sealed
// shelf does not block the ones after it (so the built shelves stay reachable as they land).
// The bias shelf stays sealed until ratified even when built.
export function isShelfUnlocked(shelf, progress, shelves = SHELVES) {
  if (!shelf.built) return false;
  if (shelf.ratificationGated && !shelf.ratified) return false;
  if (shelf.order === 0) return true;
  for (let i = shelf.order - 1; i >= 0; i--) {
    const prior = shelves[i];
    if (!prior.built) continue;      // skip not-yet-built shelves
    return shelfComplete(prior, progress);
  }
  return true;
}

// The shelf a card belongs to (by scanning membership); null if unassigned.
export function shelfOfCard(id, shelves = SHELVES) {
  for (const s of shelves) if (s.memberIds.includes(id)) return s;
  return null;
}
