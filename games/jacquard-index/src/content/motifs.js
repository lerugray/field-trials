// THE JACQUARD INDEX — the motif library (code-drawn pictures, all proved guess-free).
//
// The house's catalogue of pattern cards: textile tools, flora, and shop motifs, each a
// shape described in code (art law, no image assets). Every motif here is proved
// guess-free + oracle-unique by the generator pipeline (test/motifs.test.js runs
// validateLibrary over the whole set), so a motif that would need a guess never ships
// (hard-rule 4). Grouped by grid size for progression/shelf use. The seed target is ~110;
// this grows increment by increment toward it.

export const MOTIFS = [
  // --- 5x5 (teaching-scale) ---
  { id: 'button', name: 'THE BUTTON', blurb: 'Four holes and a rim.', size: 5,
    rows: ['#####', '#.#.#', '#####', '#.#.#', '#####'] },
  { id: 'thimble', name: 'THE THIMBLE', blurb: 'Dimpled steel over a working finger.', size: 5,
    rows: ['.###.', '#####', '#####', '#####', '.###.'] },
  { id: 'plainweave', name: 'PLAIN WEAVE', blurb: 'Warp and weft at their simplest crossing.', size: 5,
    rows: ['#.#.#', '#.#.#', '#####', '#.#.#', '#.#.#'] },
  { id: 'leaf', name: 'THE LEAF', blurb: 'A cutting from the dye garden.', size: 5,
    rows: ['...#.', '..##.', '.###.', '####.', '...#.'] },
  { id: 'key', name: 'THE KEY', blurb: 'To the pattern-room drawer.', size: 5,
    rows: ['###..', '#.#..', '###..', '.#...', '.##..'] },
  { id: 'spindle', name: 'THE SPINDLE', blurb: 'It turns the thread onto the spool.', size: 5,
    rows: ['..#..', '..#..', '.###.', '#####', '.###.'] },
  { id: 'thistle', name: 'THE THISTLE', blurb: 'The mill town flower.', size: 5,
    rows: ['..#..', '.#.#.', '#####', '.###.', '..#..'] },
  { id: 'oak', name: 'OAK LEAF', blurb: 'Carved into the drafting bench.', size: 5,
    rows: ['.#.#.', '#####', '#####', '.###.', '..#..'] },
  { id: 'star', name: 'THE STAR', blurb: 'Stitched into the selvedge for luck.', size: 5,
    rows: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  { id: 'gear', name: 'THE GEAR', blurb: 'A tooth of the loom drive train.', size: 5,
    rows: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'] },

  // --- 7x7 ---
  { id: 'crown', name: 'THE CROWN', blurb: 'A royal warrant, once.', size: 7,
    rows: ['#.....#', '#.#.#.#', '#######', '#######', '.#####.', '..###..', '..###..'] },

  // --- 8x8 ---
  { id: 'loom', name: 'THE LOOM', blurb: 'The machine that is the band.', size: 8,
    rows: ['#......#', '#......#', '########', '#..##..#', '#..##..#', '########', '#......#', '#......#'] },
  { id: 'fern', name: 'THE FERN', blurb: 'Unrolling along the mill wall.', size: 8,
    rows: ['...#....', '..##....', '.###..#.', '####.##.', '..###...', '..####..', '..#.###.', '..#...#.'] },
  { id: 'anchor', name: 'THE ANCHOR', blurb: 'The bolt-cloth shipped by sea.', size: 8,
    rows: ['...##...', '..####..', '...##...', '...##...', '.#.##.#.', '##.##.##', '.######.', '..####..'] },

  // --- 9x9 ---
  { id: 'diamondtwill', name: 'DIAMOND TWILL', blurb: 'A weave named for its lattice.', size: 9,
    rows: ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'] },

  // --- 10x10 ---
  { id: 'spool10', name: 'THE GREAT SPOOL', blurb: 'Wound for a whole season run.', size: 10,
    rows: ['..######..', '.#......#.', '#.#....#.#', '#.#....#.#', '#.#....#.#', '#.#....#.#', '#.#....#.#', '#.#....#.#', '.#......#.', '..######..'] },
  { id: 'arrow', name: 'THE ARROW', blurb: 'A direction of grain.', size: 10,
    rows: ['....##....', '...####...', '..######..', '.########.', '##########', '....##....', '....##....', '....##....', '....##....', '....##....'] },
  { id: 'bobbin10', name: 'THE GREAT BOBBIN', blurb: 'Wound tight at the waist.', size: 10,
    rows: ['..######..', '.########.', '..######..', '...####...', '....##....', '....##....', '...####...', '..######..', '.########.', '..######..'] },
  { id: 'tree', name: 'THE TREE', blurb: 'Oak, for the shuttle stock.', size: 10,
    rows: ['....##....', '...####...', '..######..', '.########.', '##########', '...####...', '...####...', '....##....', '....##....', '...####...'] },

  // --- more 5x5 shop motifs ---
  { id: 'flower', name: 'THE FLOWER', blurb: 'Pressed from the dye garden.', size: 5,
    rows: ['.#.#.', '#####', '.###.', '..#..', '..#..'] },
  { id: 'spool2', name: 'THE REEL', blurb: 'Flanged at both ends.', size: 5,
    rows: ['#####', '.#.#.', '.#.#.', '.#.#.', '#####'] },
  { id: 'plainweave2', name: 'BASKET WEAVE', blurb: 'Two over, two under.', size: 5,
    rows: ['##.##', '##.##', '..#..', '##.##', '##.##'] },
  { id: 'pin', name: 'THE PIN', blurb: 'Held in the cushion.', size: 5,
    rows: ['..#..', '..#..', '..#..', '.###.', '.###.'] },
  { id: 'house5', name: 'THE MILL', blurb: 'The house itself, in miniature.', size: 5,
    rows: ['..#..', '.###.', '#####', '#.#.#', '#####'] },
  { id: 'boat', name: 'THE BARGE', blurb: 'Bolts to the coast by canal.', size: 5,
    rows: ['#...#', '#...#', '#...#', '.###.', '#####'] },
  { id: 'bell', name: 'THE BELL', blurb: 'Rung at shift change.', size: 5,
    rows: ['..#..', '.###.', '.###.', '#####', '..#..'] },
  { id: 'ring', name: 'THE EYELET', blurb: 'A grommet in the selvedge.', size: 5,
    rows: ['#####', '#...#', '#...#', '#...#', '#####'] },
  { id: 'needleeye', name: 'THE NEEDLE EYE', blurb: 'Thread it once, thread it true.', size: 5,
    rows: ['.#...', '#.#..', '#.#..', '.#...', '.#...'] },

  // --- the house alphabet (index letters) ---
  { id: 'letterE', name: 'INDEX E', blurb: 'A stamped index letter.', size: 5,
    rows: ['#####', '#....', '####.', '#....', '#####'] },
  { id: 'letterH', name: 'INDEX H', blurb: 'A stamped index letter.', size: 5,
    rows: ['#...#', '#...#', '#####', '#...#', '#...#'] },
  { id: 'letterJ', name: 'INDEX J', blurb: 'A stamped index letter.', size: 5,
    rows: ['..###', '...#.', '...#.', '#..#.', '.##..'] },
  { id: 'letterL', name: 'INDEX L', blurb: 'A stamped index letter.', size: 5,
    rows: ['#....', '#....', '#....', '#....', '#####'] },
  { id: 'letterT', name: 'INDEX T', blurb: 'A stamped index letter.', size: 5,
    rows: ['#####', '..#..', '..#..', '..#..', '..#..'] },
  { id: 'letterF', name: 'INDEX F', blurb: 'A stamped index letter.', size: 5,
    rows: ['#####', '#....', '###..', '#....', '#....'] },
  { id: 'letterP', name: 'INDEX P', blurb: 'A stamped index letter.', size: 5,
    rows: ['####.', '#...#', '####.', '#....', '#....'] },
  { id: 'letterD', name: 'INDEX D', blurb: 'A stamped index letter.', size: 5,
    rows: ['####.', '#...#', '#...#', '#...#', '####.'] },
  { id: 'letterN', name: 'INDEX N', blurb: 'A stamped index letter.', size: 5,
    rows: ['#...#', '##..#', '#.#.#', '#..##', '#...#'] },
  { id: 'letterZ', name: 'INDEX Z', blurb: 'A stamped index letter.', size: 5,
    rows: ['#####', '...#.', '..#..', '.#...', '#####'] },

  // --- numerals (job-ticket digits) ---
  { id: 'num1', name: 'TICKET 1', blurb: 'A job-ticket digit.', size: 5,
    rows: ['..#..', '.##..', '..#..', '..#..', '.###.'] },
  { id: 'num2', name: 'TICKET 2', blurb: 'A job-ticket digit.', size: 5,
    rows: ['.###.', '#...#', '..##.', '.#...', '#####'] },
  { id: 'num3', name: 'TICKET 3', blurb: 'A job-ticket digit.', size: 5,
    rows: ['####.', '...##', '..##.', '...##', '####.'] },
  { id: 'num4', name: 'TICKET 4', blurb: 'A job-ticket digit.', size: 5,
    rows: ['...#.', '..##.', '.#.#.', '#####', '...#.'] },

  // --- 6x6 ---
  { id: 'shuttle6', name: 'THE COP', blurb: 'The weft package on its pirn.', size: 6,
    rows: ['.####.', '#....#', '######', '#....#', '#....#', '.####.'] },
  { id: 'heart6', name: 'THE HEART', blurb: 'Woven for a wedding bolt.', size: 6,
    rows: ['##..##', '######', '######', '.####.', '..##..', '...#..'] },
  { id: 'diamond6', name: 'THE LOZENGE', blurb: 'A diaper-pattern unit.', size: 6,
    rows: ['..##..', '.####.', '######', '######', '.####.', '..##..'] },
  { id: 'latch', name: 'THE LATCH', blurb: 'Off the drawer of the index.', size: 6,
    rows: ['#####.', '....#.', '...##.', '..##..', '.##...', '##....'] },

  // --- 8x8 ---
  { id: 'fish', name: 'THE FISH', blurb: 'From the mill-pond, on a spring day.', size: 8,
    rows: ['........', '..####..', '.######.', '##.####.', '..####..', '..####..', '.######.', '........'] },

  // --- more alphabet + numerals ---
  { id: 'letterB', name: 'INDEX B', blurb: 'A stamped index letter.', size: 5,
    rows: ['####.', '#...#', '####.', '#...#', '####.'] },
  { id: 'letterG', name: 'INDEX G', blurb: 'A stamped index letter.', size: 5,
    rows: ['.####', '#....', '#..##', '#...#', '.####'] },
  { id: 'letterI', name: 'INDEX I', blurb: 'A stamped index letter.', size: 5,
    rows: ['#####', '..#..', '..#..', '..#..', '#####'] },
  { id: 'letterM', name: 'INDEX M', blurb: 'A stamped index letter.', size: 5,
    rows: ['#...#', '##.##', '#.#.#', '#...#', '#...#'] },
  { id: 'letterR', name: 'INDEX R', blurb: 'A stamped index letter.', size: 5,
    rows: ['####.', '#...#', '####.', '#.#..', '#..##'] },
  { id: 'num5', name: 'TICKET 5', blurb: 'A job-ticket digit.', size: 5,
    rows: ['#####', '#....', '####.', '....#', '####.'] },
  { id: 'num6', name: 'TICKET 6', blurb: 'A job-ticket digit.', size: 5,
    rows: ['.###.', '#....', '####.', '#...#', '.###.'] },
  { id: 'num8', name: 'TICKET 8', blurb: 'A job-ticket digit.', size: 5,
    rows: ['.###.', '#...#', '.###.', '#...#', '.###.'] },
  { id: 'num9', name: 'TICKET 9', blurb: 'A job-ticket digit.', size: 5,
    rows: ['.###.', '#...#', '.####', '....#', '.###.'] },
  { id: 'clover', name: 'THE CLOVER', blurb: 'Three leaves, for the mill yard.', size: 5,
    rows: ['.#.#.', '#####', '.#.#.', '..#..', '.###.'] },

  // --- 7x7 ---
  { id: 'frame7', name: 'THE SETT', blurb: 'A tartan sett, nested square.', size: 7,
    rows: ['#######', '#.....#', '#.###.#', '#.#.#.#', '#.###.#', '#.....#', '#######'] },
];

export const MOTIFS_BY_SIZE = MOTIFS.reduce((acc, m) => {
  (acc[m.size] ||= []).push(m);
  return acc;
}, {});
