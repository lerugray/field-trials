// M5 VISUAL REGISTER — authored Ultima-style tile art.
//
// Every tile is a deliberately designed 16x16 pixel matrix, NOT a primitive
// rect. Each cell is a shade index on the 0..6 monochrome ramp (dark→light) so
// the art is authored ON THE RAMP and the M4 palette remap still applies (a
// tile drawn here reads correctly in every single-hue scheme). Authoring is a
// list of 16 strings, 16 chars each:
//   '0'..'6'  -> that shade level
//   '.'       -> transparent (feature overlays let terrain show through)
//
// Quality bar (DIRECTIONS-2026-08-02-VISUAL-REGISTER): identifiable at a
// glance. Water reads as water, forest as canopy, mountains as ridgelines.
// Silhouette-first, chunky, low-detail — Ultima mold, not ornate.

export const ART_SIZE = 16;
export const TRANSPARENT = -1;

// ---- Terrain tiles (fully opaque; keyed to TILES ids) --------------------

// DEEP ocean: darkest base (1) with recurring shade-0 troughs and light-2
// wave crests, staggered per row so it reads as moving open water.
const DEEP = [
  '1111111111111111',
  '1112211111122111',
  '1111111111111111',
  '1111111122111221',
  '2211111111111111',
  '1111122111111112',
  '1111111111112211',
  '1221111112211111',
  '1111111111111111',
  '1111221111111122',
  '1112111111221111',
  '1111111122111111',
  '2211111111111112',
  '1111112211111111',
  '1111111111122111',
  '1122111111111111',
];

// WATER shallows: lighter base (2) with dense shade-3 ripples along the top of
// each little wave — busier and brighter than DEEP.
const WATER = [
  '2222222222222222',
  '2332222332222332',
  '2222222222222222',
  '2222332222332233',
  '3322222222222222',
  '2222233222223322',
  '2222222222333222',
  '2332222332222232',
  '2222222222222222',
  '2233222222332233',
  '2223322233222222',
  '2222222332222332',
  '3222222222222223',
  '2222332222222222',
  '2233222222332222',
  '2222222332222222',
];

// SAND beach: flat mid base (2) with faint dune speckle (1 shadow, 3 highlight)
// and a couple of ripple lines.
// SAND beach/pan: G1 re-cut BRIGHT (base 4) so it clears a 2-shade gap from WATER
// (repr 2) and reads distinct from GRASS (repr 3) — water is legible against the
// walkable ground it borders. Scattered 3/5 flecks keep the cracked-pan texture.
const SAND = [
  '4444434444444544',
  '4444444444444444',
  '5444444434444444',
  '4443444444445444',
  '4444444444444443',
  '4544443444444444',
  '4444444444434454',
  '4433444444444444',
  '4444445444444444',
  '4444444444344344',
  '3444544444444444',
  '4444444444444454',
  '4454444344444444',
  '4444444444444434',
  '4444344454444444',
  '4444444444444444',
];

// GRASS plains: base 3 with scattered shade-4 tufts (little upright blades) and
// occasional shade-2 bare patches.
const GRASS = [
  '3333333333333333',
  '3343333334333333',
  '3434333343343333',
  '3333333333433433',
  '3333433333333333',
  '4334333343333433',
  '3333333333334333',
  '3343343333333343',
  '3333333243333333',
  '3433333333433343',
  '3333433333333333',
  '3334333343333433',
  '3243333333333333',
  '3333333433433343',
  '4333433333333333',
  '3333333333343333',
];

// FOREST: shade-3 forest floor with chunky round canopies (5 crown, 4 body,
// 2 trunk) — reads as clustered treetops from above.
const FOREST = [
  '3334433333344333',
  '3345543333455433',
  '3455543345555433',
  '3455543345554333',
  '3345433334543333',
  '3332433333243333',
  '3334433444333433',
  '3345543455433344',
  '3455545555433455',
  '3455543455433455',
  '3345433342433343',
  '3333433333443333',
  '3344333334554333',
  '3455433345554333',
  '3455433345543333',
  '3334333333433333',
];

// HILL: rolling ground (base 4) with rounded shade-5 mounds and shade-3
// shadowed lees — soft ridges, no sharp peaks.
const HILL = [
  '4444444444444444',
  '4444555444444444',
  '4445555544445544',
  '4455555554455554',
  '4445555544555544',
  '4444333444444344',
  '4444444444444444',
  '4455444444455544',
  '4555544445555554',
  '4555554455555544',
  '4455544445555443',
  '4443444444433444',
  '4444444444444444',
  '4444555444444554',
  '4445555544455555',
  '4444333444443344',
];

// MOUNT: dark shade-3 flanks rising to bright shade-6 snow ridgelines with a
// shade-5 shadowed face — clear triangular peaks.
const MOUNT = [
  '3333333333333333',
  '3333336333333333',
  '3333365633333663',
  '3333655563336556',
  '3336555556365556',
  '3365555555655555',
  '3655555556555555',
  '3555553333555553',
  '3333333333333333',
  '3333663333336333',
  '3336556333365633',
  '3365555633655563',
  '3655555565555556',
  '3555555555555555',
  '3333333333333333',
  '3333333333333333',
];

// ---- M9 biome terrain variants (opaque; a biome re-dresses its dominant -----
// terrain tiles with these so a region reads as its own place). Authored on the
// same 0..6 ramp; each is distinguished by base shade + a legible motif so the
// biome is nameable at a glance (bright cracked salt pan, dark reed fen, pointed
// black conifers, the verge's wrong offset grid). Still dithered at render.

// PINE_BARRENS: dark forest floor with tall POINTED conifers (dark body, bright
// snow flecks, thin trunks) — vertical spikes vs FOREST's round canopies.
const PINE_BARRENS = [
  '3233333333333333',
  '3333233333323334',
  '3333233333333233',
  '3332223233333333',
  '3332223232333333',
  '3322522334323343',
  '3222222333323333',
  '3322222223222333',
  '3322522333222333',
  '3333133322252223',
  '3233133322222233',
  '3333233222222233',
  '3333332222252233',
  '3333332252213333',
  '3333233313313334',
  '3332333213323333',
];

// PINE_FLOOR: the barrens' open ground — floor base darkened by needle litter
// (shade-2/1 speckle) and fallen cones (4), reading darker than plains GRASS.
const PINE_FLOOR = [
  '3332333332323132',
  '2322332333333332',
  '3323334313331323',
  '3333333343332322',
  '3433323323331333',
  '2332333322332231',
  '3432332333333323',
  '3333333233333333',
  '3332333333133433',
  '3233333133323331',
  '3334343333331333',
  '3333332221233333',
  '3434333333233342',
  '3322333323342341',
  '3333321333333332',
  '2231332333333333',
];

// SALT_PAN: a bleached flat — bright base with a branching shade-3 crack network
// and occasional shade-6 glare. The pale opposite of everything else on the map.
const SALT_PAN = [
  '4555553555455565',
  '5655553555555555',
  '5555553555535555',
  '3333553555535555',
  '5556333333335555',
  '5555555355533333',
  '5555555355535455',
  '5555555355435555',
  '5555555355653555',
  '5533355355553555',
  '5545533333353555',
  '4556555356533355',
  '6555555535553555',
  '5556555535553555',
  '5545554535553555',
  '6555555535555555',
];

// SALT_CRUST: the pan's crustier margin — dense glare (6) and grit (4) over the
// bright base, brighter and busier than SAND.
const SALT_CRUST = [
  '5455655656555465',
  '6655555665545555',
  '5545654455555565',
  '5655545555555555',
  '6555456555555565',
  '5555456545555556',
  '5555665555555555',
  '5555655565655556',
  '5555565644455556',
  '4565556466565555',
  '5555555455565556',
  '5555555656555555',
  '6555554555565655',
  '5665555556645565',
  '5565555555655465',
  '6555566545556555',
];

// FEN_REED: dark standing water with vertical reed strokes (blade 3, bright tip
// 4, shadow 1). Reads wet + overgrown; far darker than plains GRASS.
const FEN_REED = [
  '2222222222122222',
  '2222221222222222',
  '2424122222222222',
  '1323222222242222',
  '1323212242232422',
  '2323222232132342',
  '2313224232232331',
  '2323223232232332',
  '2323223232232332',
  '2323223232232332',
  '2323223232232332',
  '2323223232232332',
  '2323223232232332',
  '2323223232232332',
  '2323223232232332',
  '2221222222222222',
];

// FEN_MUD: the fen's WALKABLE mud — the boggy version of SAND, deliberately kept
// LIGHTER than the still black pool it borders (M10 A2b). Ray couldn't tell mud
// from pool because both were near-black (means 1.0 vs 0.9); now the mud reads as
// mid-shade earthy ground (mottled 2/3 with wet 1 patches), clearly brighter than
// FEN_POOL — the game's "dark water = deep/you can't cross" language, made legible.
const FEN_MUD = [
  '2232232322322232',
  '2322322232232322',
  '2232232122322232',
  '3223223223122322',
  '2322132232232232',
  '2231223223322132',
  '2322322132232232',
  '2232231223223212',
  '2322322232132322',
  '2231223223322232',
  '2322132232232231',
  '3223223223122322',
  '2322322232232322',
  '2231223213322232',
  '2322322232231222',
  '2232231223223232',
];

// FEN_POOL: still black pool water — deep troughs (0) and faint scum crests (2)
// over a dark base; stiller + darker than open WATER.
const FEN_POOL = [
  '1111111121011011',
  '1110111100210111',
  '1111111110100210',
  '0111111211111110',
  '1111111111111111',
  '0121111102201111',
  '2111122121100101',
  '1021121101121101',
  '1111010101101111',
  '2111111111001111',
  '1111111101121101',
  '1111111011112201',
  '0111121201121101',
  '0210101120110111',
  '1111101110201111',
  '1210011200021111',
];

// VERGE_GROUND: the Perilous Verge — grass-toned ground overlaid by a WRONG,
// offset grid (highlight 5 / shadow 1 seams that don't quite line up) with rare
// shade-6 glints. The ground reads as leaning toward the Chapel.
const VERGE_GROUND = [
  '5133353323513336',
  '5333353361533335',
  '3333531635333353',
  '3333513235333351',
  '3315333353331536',
  '1135333353113533',
  '3353333511335333',
  '3353331563335333',
  '3533115333353311',
  '3511335333251133',
  '5133353333513335',
  '5333353311533635',
  '3333631136333353',
  '3323513335333351',
  '3315333353331533',
  '1125333353113533',
];

// ---- Feature overlays (transparent background; drawn over terrain) --------

// DUNGEON site: a squat dark keep / ruin mouth. Bright walls (5), black
// doorway (0), a broken crenellation top.
const SITE_DUNGEON = [
  '................',
  '................',
  '...5.5.5.5.5....',
  '...5555555555...',
  '...5544445555...',
  '...5544445555...',
  '...5540045555...',
  '...5540045555...',
  '...5540045555...',
  '..55540045555...',
  '..55540045555...',
  '..5554004555 5..',
  '.555540045555 5.',
  '5555540045555555',
  '5555540045555555',
  '................',
];

// CITY site: a walled town — battlemented wall, a gate, roofs behind.
const SITE_CITY = [
  '................',
  '................',
  '.5.5.5..5.5.5.5.',
  '.5555555555555 5',
  '.5566556655665 5',
  '.5655565556555 5',
  '.5566556655665 5',
  '.55555.55.55555.',
  '.55550000055555.',
  '.55550000055555.',
  '.55550000055555.',
  '.55550000055555.',
  '.55555555555555.',
  '.55555555555555.',
  '................',
  '................',
];

// CHAPEL landmark (the Chapel Perilous): a lone spired chapel, unmistakable —
// tall nave, a bright spire, a dark arched door. Its own silhouette so the
// landmark reads distinct from a generic dungeon.
const SITE_CHAPEL = [
  '.......66.......',
  '.......65.......',
  '......6556......',
  '......6556......',
  '.....655556.....',
  '.....655556.....',
  '....65555556....',
  '...6555555556...',
  '..655555555556..',
  '..655500555556..',
  '..655500555556..',
  '..655500555556..',
  '..655500055556..',
  '..655500055556..',
  '..655500055556..',
  '..655555555556..',
];

// PARTY icon (overworld marker): a lone chunky wanderer — bright hood, cloaked
// body, two legs. Transparent background so the terrain shows around it.
const PARTY = [
  '................',
  '.....5665.......',
  '....566665......',
  '....566665......',
  '....566665......',
  '.....5665.......',
  '....566665......',
  '...56666665.....',
  '..5666666665....',
  '..5666666665....',
  '..5666666665....',
  '..5666666665....',
  '...566666665....',
  '...5665.5665....',
  '...5665.5665....',
  '...5555.5555....',
];

// WANDERER (overworld NPC): a lone slight figure — small hooded head, narrow
// robed body, a walking staff at its side. Deliberately slighter than the PARTY
// icon so a passer-by reads as "someone else" at a glance. Transparent ground.
const WANDERER_NPC = [
  '................',
  '.......44.......',
  '......4554......',
  '......4554......',
  '.......44...3...',
  '......4444..3...',
  '.....445544.3...',
  '.....455554.3...',
  '.....455554.3...',
  '.....455554.3...',
  '......4444..3...',
  '......4..4..3...',
  '......4..4......',
  '.....44..44.....',
  '.....44..44.....',
  '................',
];

// BEAST (overworld common monster): a low, hunched four-legged thing — forward
// head, humped back, a lashing tail. Reads as "creature", not "person": wide and
// low where the wanderer is tall and narrow. Transparent ground.
const WANDERER_BEAST = [
  '................',
  '................',
  '................',
  '..........33....',
  '...333...3333...',
  '..33333333333...',
  '.3333333333333..',
  '4333333333333334',
  '.33333333333333.',
  '.33333333333333.',
  '..3..33...33.3..',
  '..3..33...33....',
  '................',
  '................',
  '................',
  '................',
];

// ---- City-mode tiles (M3 surfaces; opaque cells) --------------------------

// Cobbled street — mid base with scattered darker setts.
const CITY_STREET = [
  '2212221222122212',
  '2222222222222222',
  '1222122212221221',
  '2222222222222222',
  '2122212221222122',
  '2222222222222222',
  '2212221222122212',
  '2222222222222222',
  '1222122212221221',
  '2222222222222222',
  '2122212221222122',
  '2222222222222222',
  '2212221222122212',
  '2222222222222222',
  '1222122212221221',
  '2222222222222222',
];

// Ashlar stone wall — offset stone courses with dark mortar.
const CITY_WALL = [
  '5522552255225522',
  '5522552255225522',
  '2222222222222222',
  '5555225555552255',
  '5555225555552255',
  '2222222222222222',
  '2255555522555555',
  '2255555522555555',
  '2222222222222222',
  '5555225555552255',
  '5555225555552255',
  '2222222222222222',
  '2255555522555555',
  '2255555522555555',
  '2222222222222222',
  '5555225555552255',
];

// Building block — pitched roof ridge over a facade with dark windows.
const CITY_BUILDING = [
  '4444444444444444',
  '4555555555555554',
  '5544444444444455',
  '4444444444444444',
  '4433444444443344',
  '4433444444443344',
  '4444444444444444',
  '4444444444444444',
  '4433444444443344',
  '4433444444443344',
  '4444444444444444',
  '4444444444444444',
  '4444444444444444',
  '4444444444444444',
  '4444444444444444',
  '4444444444444444',
];

// Building with a big arched doorway — the enterable service.
const CITY_DOOR = [
  '4444444444444444',
  '4555555555555554',
  '5544444444444455',
  '4444444444444444',
  '4444455555444444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
  '4444500000544444',
];

// City gate — two wall pillars flanking a dark passage, crenellated top.
const CITY_GATE = [
  '5522000000225555',
  '5522000000225555',
  '5555000000555555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
  '5500000000005555',
];

const RAW = {
  DEEP, WATER, SAND, GRASS, FOREST, HILL, MOUNT,
  PINE_BARRENS, PINE_FLOOR, SALT_PAN, SALT_CRUST, FEN_REED, FEN_MUD, FEN_POOL, VERGE_GROUND,
  SITE_DUNGEON, SITE_CITY, SITE_CHAPEL, PARTY,
  WANDERER_NPC, WANDERER_BEAST,
  CITY_STREET, CITY_WALL, CITY_BUILDING, CITY_DOOR, CITY_GATE,
};

// Overlay ids that carry transparency (drawn over a terrain tile).
export const OVERLAY_IDS = ['SITE_DUNGEON', 'SITE_CITY', 'SITE_CHAPEL'];

// Parse one authored matrix into a 2D array of ints (TRANSPARENT for '.').
// Validates the size x size shape and the character alphabet (size defaults to
// ART_SIZE for terrain; busts pass their own square size).
export function parseArt(id, rows, size = ART_SIZE) {
  if (!Array.isArray(rows) || rows.length !== size) {
    throw new Error(`tileart '${id}': need ${size} rows, got ${rows && rows.length}`);
  }
  const grid = [];
  for (let y = 0; y < size; y++) {
    const line = rows[y];
    if (typeof line !== 'string' || line.length !== size) {
      throw new Error(`tileart '${id}' row ${y}: need ${size} chars, got ${line && line.length}`);
    }
    const out = [];
    for (let x = 0; x < size; x++) {
      const c = line[x];
      if (c === '.' || c === ' ') { out.push(TRANSPARENT); continue; }
      const n = c.charCodeAt(0) - 48; // '0'..'6'
      if (n < 0 || n > 6) throw new Error(`tileart '${id}' at ${x},${y}: bad char '${c}'`);
      out.push(n);
    }
    grid.push(out);
  }
  return grid;
}

// Compile all authored tiles into { id -> int[16][16] }. Throws on any invalid
// matrix (the tile-kit invariant, mirroring the dungeon kit validator).
export function createTileArt(raw = RAW) {
  const art = {};
  for (const id of Object.keys(raw)) art[id] = parseArt(id, raw[id]);
  return {
    ids: () => Object.keys(art),
    get: (id) => {
      const g = art[id];
      if (!g) throw new Error(`tileart.get: unknown tile '${id}'`);
      return g;
    },
    has: (id) => Object.prototype.hasOwnProperty.call(art, id),
    isOverlay: (id) => OVERLAY_IDS.includes(id),
  };
}

// Map a world TILES id / site kind to an art id.
export function terrainArtId(tileId) {
  return tileId; // TILES ids match art ids 1:1 (DEEP..MOUNT)
}
export function siteArtId(kind, siteId) {
  if (siteId && /chapel/i.test(siteId)) return 'SITE_CHAPEL';
  if (kind === 'city') return 'SITE_CITY';
  return 'SITE_DUNGEON';
}

// M12 G2 — the single accent hue aimed at MEANING. Water gets a DENSE glint (the
// Cyclopean move: its one coloured terrain was water — meaningful matter, not decor);
// deep water a subtler one; mundane walkable ground gets ZERO accent (nothing to say).
// Danger accent lives on the sprites (beast glint), not here. Returns {shades, chance}
// or null; the shell reads this per tile so the accent can't drift onto mundane ground.
export function terrainAccentSpec(tileId) {
  if (tileId === 'WATER') return { shades: [3, 4], chance: 0.28 }; // dense crest glint
  if (tileId === 'DEEP') return { shades: [2, 3], chance: 0.18 };  // subtler, deeper
  return null; // mundane ground: no accent (zero on grass/sand/forest/hill/mount)
}

export { RAW };
