// THE JACQUARD INDEX — COUNTING-HOUSE content (shelf 2): paired-ledger pictures.
//
// Ordinary binary grids (even height: rows pair up), but the row axis is given only as one
// interleaved LEDGER per pair (countinghouse.js). Every card is proved guess-free + unique
// under columns + ledgers by certifyCountingHouse (test/countinghouse.test.js), and the
// ledger is load-bearing (columns alone leave cells undecided). Art law: code-drawn. A
// gentle 4x4 -> 8x8 climb, teaching card first. Ids are ch_* so they never collide with the
// base motif library (the grids are read under a different rule here).

export const COUNTINGHOUSE_TEACHING = 'ch_ledger';

export const COUNTINGHOUSE_MOTIFS = [
  // --- teaching: the clerk tallies two rows as one ---
  { id: 'ch_ledger', name: 'THE LEDGER', size: 4,
    blurb: 'The clerk tallies two rows as one. Split the pair by the columns.',
    rows: ['####', '#..#', '#..#', '####'] },

  // --- 6x6 ---
  { id: 'ch_bars', name: 'THE BARS', size: 6,
    blurb: 'Ruled bars, tallied in pairs.',
    rows: ['#.#.#.', '#.#.#.', '.#.#.#', '.#.#.#', '#.#.#.', '#.#.#.'] },
  { id: 'ch_cross', name: 'THE CROSS', size: 6,
    blurb: 'A cross, entered in the ledger.',
    rows: ['..##..', '..##..', '######', '######', '..##..', '..##..'] },
  { id: 'ch_box', name: 'THE STRONGBOX', size: 6,
    blurb: 'A strongbox, double-entered.',
    rows: ['######', '#....#', '#....#', '#....#', '#....#', '######'] },
  { id: 'ch_hourglass', name: 'THE HOURGLASS', size: 6,
    blurb: 'The half-hour, paired and counted.',
    rows: ['######', '.####.', '..##..', '..##..', '.####.', '######'] },
  { id: 'ch_diamond', name: 'THE LOZENGE', size: 6,
    blurb: 'A lozenge on the paired ledger.',
    rows: ['..##..', '.####.', '######', '######', '.####.', '..##..'] },
  { id: 'ch_heart', name: 'THE HEART', size: 6,
    blurb: 'Two rows, one heart, one tally.',
    rows: ['.#..#.', '######', '######', '.####.', '..##..', '...#..'] },
  { id: 'ch_crown', name: 'THE CROWN', size: 6,
    blurb: 'A warrant, entered twice.',
    rows: ['#....#', '#.##.#', '######', '.####.', '..##..', '..##..'] },
  { id: 'ch_frame', name: 'THE FRAME', size: 6,
    blurb: 'A frame, counted pair by pair.',
    rows: ['######', '#....#', '#....#', '#....#', '#....#', '######'] },
  { id: 'ch_bolt', name: 'THE BOLT', size: 6,
    blurb: 'A bolt of cloth, tallied.',
    rows: ['######', '######', '..##..', '..##..', '..##..', '..##..'] },

  // --- 8x8 ---
  { id: 'ch_loom', name: 'THE LOOM', size: 8,
    blurb: 'The machine, on the ledger.',
    rows: ['#......#', '#......#', '########', '#..##..#', '#..##..#', '########', '#......#', '#......#'] },
  { id: 'ch_anchor', name: 'THE ANCHOR', size: 8,
    blurb: 'Shipped and entered.',
    rows: ['...##...', '..####..', '...##...', '...##...', '.#.##.#.', '##.##.##', '.######.', '..####..'] },
  { id: 'ch_step', name: 'THE STEPS', size: 8,
    blurb: 'A stair, counted two at a time.',
    rows: ['#.......', '##......', '###.....', '####....', '#####...', '######..', '#######.', '########'] },
];
