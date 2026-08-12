// THE JACQUARD INDEX — starter motifs (hand-authored, all code-drawn, all in-register).
//
// A small set of textile-tool motifs for the M1 playable core, until the generator
// (later increment) produces the full library. Each is guess-free and oracle-unique;
// test/starter.test.js certifies every one, so a non-guess-free motif is a build failure
// (hard-rule 4). Art law: these are shapes described in code, no image assets.

import { Puzzle } from '../puzzle/puzzle.js';

export const STARTER_MOTIFS = [
  {
    id: 'spool',
    name: 'THE SPOOL',
    blurb: 'A first thread laid. Fill the counts; the machine never asks you to guess.',
    rows: ['..#..', '.###.', '#####', '.###.', '..#..'],
  },
  {
    id: 'shuttle',
    name: 'THE SHUTTLE',
    blurb: 'It carries the weft across the warp, and back.',
    rows: [
      '..####..',
      '.#....#.',
      '######.#',
      '#....#.#',
      '#....#.#',
      '######.#',
      '.#....#.',
      '..####..',
    ],
  },
  {
    id: 'bobbin',
    name: 'THE BOBBIN',
    blurb: 'Wound tight at the waist.',
    rows: [
      '..####..',
      '.######.',
      '..####..',
      '...##...',
      '...##...',
      '..####..',
      '.######.',
      '..####..',
    ],
  },
];

export function starterPuzzles() {
  return STARTER_MOTIFS.map((m) => ({ ...m, puzzle: Puzzle.fromAscii(m.rows) }));
}
