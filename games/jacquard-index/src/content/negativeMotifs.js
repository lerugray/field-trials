// THE JACQUARD INDEX — NEGATIVE CLOTH content (shelf 3): bare-warp pictures.
//
// Each grid's PICTURE is the bare warp: '#' is laid thread (full cloth), '.' is the empty
// warp that forms the shape. The margin counts read the gaps (the twist). Every card here
// is proved guess-free + unique UNDER THE GAP CLUES by the negative-cloth prover extension
// (its complement certifies with the base certifier + oracle); test/negative.test.js runs
// certifyNegative over the whole set, so a card that would need a guess never ships
// (hard-rule 4). Art law: shapes described in code, no image assets. A gentle 5x5 -> 8x8
// climb, teaching card first.

export const NEGATIVE_TEACHING = 'band';

export const NEGATIVE_MOTIFS = [
  // --- teaching: the counts read the bare warp, not the cloth ---
  { id: 'band', name: 'THE BANDING', size: 5,
    blurb: 'Bands of bare warp. The counts read the gaps, not the cloth.',
    rows: ['#####', '.....', '#####', '.....', '#####'] },

  // --- 5x5 ---
  { id: 'keyhole', name: 'THE KEYHOLE', size: 5,
    blurb: 'A cross cut clean out of the weave.',
    rows: ['##.##', '##.##', '.....', '##.##', '##.##'] },
  { id: 'voidx', name: 'THE VOID', size: 5,
    blurb: 'The thread pulls back to the corners.',
    rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
  { id: 'offcut', name: 'THE OFFCUT', size: 5,
    blurb: 'What the shears left behind.',
    rows: ['#####', '#####', '##...', '##...', '##...'] },
  { id: 'notch', name: 'THE NOTCH', size: 5,
    blurb: 'A wedge lifted from the hem.',
    rows: ['#####', '#####', '#####', '##.##', '#...#'] },
  { id: 'slit', name: 'THE SLIT', size: 5,
    blurb: 'One narrow channel of bare warp.',
    rows: ['#####', '##.##', '##.##', '##.##', '#####'] },
  { id: 'corner', name: 'THE CORNER', size: 5,
    blurb: 'The cloth cut on the square.',
    rows: ['....#', '...##', '..###', '.####', '#####'] },
  { id: 'step', name: 'THE STEP', size: 5,
    blurb: 'A staircase of bare warp.',
    rows: ['#....', '##...', '###..', '####.', '#####'] },
  { id: 'biascut', name: 'THE BIAS CUT', size: 5,
    blurb: 'Bare warp opening on the diagonal.',
    rows: ['#...#', '##.##', '###.#', '##.##', '#...#'] },

  // --- 6x6 ---
  { id: 'wedge6', name: 'THE WEDGE', size: 6,
    blurb: 'A wedge of warp, widening down.',
    rows: ['######', '#####.', '####..', '###...', '##....', '#.....'] },
  { id: 'grommet6', name: 'THE GROMMET', size: 6,
    blurb: 'A square eyelet punched in the cloth.',
    rows: ['######', '#....#', '#.##.#', '#.##.#', '#....#', '######'] },

  // --- 7x7 ---
  { id: 'boltend7', name: 'THE BOLT END', size: 7,
    blurb: 'The last of the bolt, cut short.',
    rows: ['#######', '#######', '##...##', '##.#.##', '##...##', '#######', '#######'] },

  // --- 8x8 ---
  { id: 'aperture8', name: 'THE APERTURE', size: 8,
    blurb: 'An opening framed in full cloth.',
    rows: ['########', '########', '##....##', '##.##.##', '##.##.##', '##....##', '########', '########'] },
];
