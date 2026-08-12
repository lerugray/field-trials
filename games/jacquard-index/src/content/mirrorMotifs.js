// THE JACQUARD INDEX — MIRROR-WEAVE content (shelf 4): folded patterns.
//
// Each card declares a symmetry AXIS ('v' left<->right, 'h' top<->bottom, 'rot180' a
// half-turn) and its grid actually carries that symmetry. Content is ordinary guess-free +
// unique base cards that are additionally symmetric, so the loom can weave both sides at
// once without ever forcing a guess (mirror.js: symmetry as extra deduction is vacuous, so
// the twist is the felt fold mechanic). test/mirror.test.js proves every card via
// certifyMirror. A gentle 5x5 -> 8x8 climb, teaching card first, all three axes represented.

export const MIRROR_TEACHING = 'butterfly';

export const MIRROR_MOTIFS = [
  // --- teaching: two wings from one fold ---
  { id: 'butterfly', name: 'THE BUTTERFLY', size: 5, axis: 'v',
    blurb: 'Two wings from one fold.',
    rows: ['#.#.#', '##.##', '..#..', '##.##', '#.#.#'] },

  // --- vertical fold ---
  { id: 'bowtie', name: 'THE BOWTIE', size: 5, axis: 'v',
    blurb: 'Knotted true down the middle.',
    rows: ['#...#', '##.##', '#...#', '##.##', '#...#'] },
  { id: 'crossv', name: 'THE FOLDED CROSS', size: 5, axis: 'v',
    blurb: 'A cross, folded left to right.',
    rows: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  { id: 'hall6', name: 'THE HALL', size: 6, axis: 'v',
    blurb: 'The long hall, matched window for window.',
    rows: ['######', '#.##.#', '#.##.#', '#.##.#', '#.##.#', '######'] },
  { id: 'urn7', name: 'THE URN', size: 7, axis: 'v',
    blurb: 'An urn, turned true on the wheel.',
    rows: ['..###..', '.#####.', '..###..', '...#...', '..###..', '.#####.', '..###..'] },
  { id: 'mask8', name: 'THE FOLDED MASK', size: 8, axis: 'v',
    blurb: 'A mask, both cheeks the same.',
    rows: ['..####..', '.######.', '##.##.##', '########', '##....##', '##.##.##', '.######.', '..####..'] },

  // --- horizontal fold ---
  { id: 'hourglass', name: 'THE HOURGLASS', size: 5, axis: 'h',
    blurb: 'The sand runs the same, top and bottom.',
    rows: ['#####', '.###.', '..#..', '.###.', '#####'] },
  { id: 'sand', name: 'THE SANDGLASS', size: 5, axis: 'h',
    blurb: 'Folded on its waist.',
    rows: ['#####', '.#.#.', '..#..', '.#.#.', '#####'] },
  { id: 'spool5', name: 'THE FOLDED SPOOL', size: 5, axis: 'h',
    blurb: 'Flanged the same at each end.',
    rows: ['#####', '.#.#.', '.#.#.', '.#.#.', '#####'] },
  { id: 'ladder6', name: 'THE LADDER', size: 6, axis: 'h',
    blurb: 'Rung over matching rung.',
    rows: ['######', '#....#', '######', '######', '#....#', '######'] },

  // --- half-turn (rot180) ---
  { id: 'lozengem', name: 'THE LOZENGE', size: 5, axis: 'rot180',
    blurb: 'A half-turn returns it whole.',
    rows: ['..#..', '.###.', '#####', '.###.', '..#..'] },
  { id: 'star6', name: 'THE FOLDED STAR', size: 6, axis: 'rot180',
    blurb: 'Turned once, unchanged.',
    rows: ['..##..', '.####.', '######', '######', '.####.', '..##..'] },
  { id: 'cross7', name: 'THE GREAT CROSS', size: 7, axis: 'rot180',
    blurb: 'Whole under the half-turn.',
    rows: ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'] },
];
