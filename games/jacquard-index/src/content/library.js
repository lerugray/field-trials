// THE JACQUARD INDEX — the playable card list (starter cards + the motif library).
//
// Assembles every proved motif into an ordered list of cards the play scene can walk. The
// full shelf/index UI + unlock flow is M3; this is the minimal spine that makes the whole
// proved library reachable in-game now. Each card carries its built Puzzle.

import { Puzzle } from '../puzzle/puzzle.js';
import { STARTER_MOTIFS } from './starter.js';
import { MOTIFS } from './motifs.js';

// Starter teaching trio first (gentlest), then the library by ascending size.
export function allCards() {
  const ordered = [...STARTER_MOTIFS, ...[...MOTIFS].sort((a, b) => (a.size || a.rows.length) - (b.size || b.rows.length))];
  // De-dupe by id (a starter motif might also appear in the library).
  const seen = new Set();
  const cards = [];
  for (const m of ordered) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    cards.push({ ...m, puzzle: Puzzle.fromAscii(m.rows) });
  }
  return cards;
}
