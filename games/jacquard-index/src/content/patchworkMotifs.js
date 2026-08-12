// THE JACQUARD INDEX — THE GRAND PATCHWORK content (shelf 7, the finale): story patches.
//
// The finale shelf is the seed's ASSEMBLY frame (patchwork is not a deduction twist): each
// card is an ordinary guess-free base puzzle (a single patch of the house's story), and
// weaving every patch of a panel assembles the whole panel cloth (the M2 composePanel
// payoff). Three 2x2 panels tell the house's story: the mill yard, the loom floor, the dye
// garden. Every patch is proved guess-free + unique by the base pipeline
// (test/patchwork.test.js). Art law: code-drawn, no image assets.

export const PATCHWORK_TEACHING = 'patch';

export const PATCHWORK_MOTIFS = [
  // --- teaching: solve one patch, and the panel begins ---
  { id: 'patch', name: 'THE PATCH', size: 5,
    blurb: 'A single patch. Solve it, and the panel begins.',
    rows: ['#####', '#...#', '#.#.#', '#...#', '#####'] },

  // --- panel: THE MILL YARD ---
  { id: 'gate', name: 'THE GATE', size: 5,
    blurb: 'The yard gate, shut at the whistle.',
    rows: ['#####', '#.#.#', '#.#.#', '#.#.#', '#####'] },
  { id: 'well', name: 'THE WELL', size: 5,
    blurb: 'The yard well, sweet water for the sizing.',
    rows: ['#####', '#...#', '#.#.#', '#...#', '.###.'] },
  { id: 'cart', name: 'THE CART', size: 5,
    blurb: 'The bolt-cart, loaded for the canal.',
    rows: ['.....', '####.', '####.', '.#.#.', '.....'] },
  { id: 'lamp', name: 'THE LAMP', size: 5,
    blurb: 'The yard lamp, lit through the winter shift.',
    rows: ['..#..', '.###.', '.###.', '..#..', '.###.'] },

  // --- panel: THE LOOM FLOOR ---
  { id: 'warp', name: 'THE WARP', size: 5,
    blurb: 'The warp, strung the length of the loom.',
    rows: ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#'] },
  { id: 'beam', name: 'THE BEAM', size: 5,
    blurb: 'The cloth beam, winding the finished web.',
    rows: ['#####', '.....', '.....', '.....', '#####'] },
  { id: 'heddle', name: 'THE HEDDLE', size: 5,
    blurb: 'The heddles, lifting the shed.',
    rows: ['#.#.#', '#.#.#', '#####', '#.#.#', '#.#.#'] },
  { id: 'reed', name: 'THE REED', size: 5,
    blurb: 'The reed, beating each weft home.',
    rows: ['#.#.#', '#.#.#', '#.#.#', '#####', '#####'] },

  // --- panel: THE DYE GARDEN ---
  { id: 'madder', name: 'MADDER', size: 5,
    blurb: 'Madder root, for the reds.',
    rows: ['..#..', '.#.#.', '#.#.#', '.#.#.', '..#..'] },
  { id: 'woad', name: 'WOAD', size: 5,
    blurb: 'Woad leaf, for the blues.',
    rows: ['.#.#.', '.#.#.', '#####', '..#..', '.###.'] },
  { id: 'pond', name: 'THE POND', size: 5,
    blurb: 'The mill pond, still at dawn.',
    rows: ['.....', '.###.', '#####', '.###.', '.....'] },
  { id: 'sun', name: 'THE SUN', size: 5,
    blurb: 'First sun over the dye garden.',
    rows: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'] },
];

// The finale panels: each a 2x2 tiling of four patches (bare-warp seam), assembled when
// all four are woven. Member order fills the grid left-to-right, top-to-bottom.
export const PATCHWORK_PANELS = [
  { id: 'mill-yard', name: 'THE MILL YARD', blurb: 'The yard at the gate, come evening.',
    cols: 2, rows: 2, gap: 1, members: ['gate', 'well', 'cart', 'lamp'] },
  { id: 'loom-floor', name: 'THE LOOM FLOOR', blurb: 'The floor at full throw.',
    cols: 2, rows: 2, gap: 1, members: ['warp', 'beam', 'heddle', 'reed'] },
  { id: 'dye-garden', name: 'THE DYE GARDEN', blurb: 'The garden that dyed the house.',
    cols: 2, rows: 2, gap: 1, members: ['madder', 'woad', 'pond', 'sun'] },
];
