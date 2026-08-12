// sprites.js — all code-drawn pixel art (DESIGN-SEED art law + M12-ART register). Authored as
// palette pixel grids and parsed once. M12 register: chunky ~2x proportions, a 1px ink outline ('0')
// around every silhouette so each type reads in pure black, cluster shading from an upper-left light
// (highlights up/left, shadow down/right), rim light ('5') on hero/boss edges, and disciplined ramp
// use (stone / umber / moss / arcane). Facing-left variants are mirrored. Idle sway is a cheap
// renderer-side bob (see stagerender), so each type is one authored frame.

import { parseSprite, padRows, flipH } from './sprite.js';

// --- Player: ⛔ SUPERSEDED-AS-CAST (2026-08-12). The shipped protagonist is the Ray-certified
//     Variant B paint-over rendered from assets/art/player_bareheaded_* via HERO_RIG (assets.js);
//     shipped enemies likewise render from the licensed Admurin pack strips. These code-drawn
//     figures survive ONLY as asset-load-failure fallbacks in stagerender. NEVER use them as the
//     cast on any player-facing or promotional surface (OG cards, screenshots, store pages) — a
//     lane did exactly that on 2026-08-12 and shipped the wrong hero to the operator. Old
//     description kept for the fallback: hooded hunter, steel blade, stone-grey cloak. ~20×34.
export const PLAYER_R = parseSprite(padRows([
  '.......0000',
  '......088880',
  '.....06877760',
  '.....0677kk760',       // hood mouth opens onto the face
  '.....067klll760',
  '.....06kl00lk60',      // brow + eye sockets
  '.....06klcclk60',      // torch-glow eyes
  '.....067klllk60',
  '......06kkkk60',       // chin
  '......088778800',
  '.....088777776800',
  '.....08777777680.0000000',    // blade held out to the right — top edge
  '....08777mm77680m64444445',   // hilt (m) + crossguard, steel blade core/gleam
  '....0877mmnm7768000000000',   // blade bottom edge
  '....0677777777760',
  '....0677m7777m760',           // belt
  '....067777777760',
  '.....06777777600',
  '.....0m677776m0',
  '.....0m6776m60',              // lower cloak taper
  '.....0m60 06m0',              // legs split
  '.....0a60 06a0',
  '.....0a0. 0a0',
  '.....0m0.. 0m0',              // boots
  '....0mm0.. 0mm0',
  '...0nn00.. 00nn0',
]));
export const PLAYER_L = flipH(PLAYER_R);

// --- Player melee swing: four neutral steel-light arc frames. These sit over the held blade and
//     keep attack styling in code-drawn sprite grids + the shared stone ramp. ---
export const SWING_ARCS_R = Object.freeze([
  parseSprite(padRows([
    '..55',
    '...440',
    '....640',
    '.....640',
    '......640',
    '.......640',
    '........40',
    '.........0',
  ])),
  parseSprite(padRows([
    '.....55',
    '.......40',
    '........40',
    '.........60',
    '.........640',
    '.........640',
    '.........60',
    '........40',
    '......440',
    '.....00',
  ])),
  parseSprite(padRows([
    '.........0',
    '.........40',
    '..........40',
    '..........640',
    '..........640',
    '..........640',
    '.........640',
    '........440',
    '......440',
    '....550',
  ])),
  parseSprite(padRows([
    '.........0',
    '........40',
    '.......640',
    '......640',
    '.....640',
    '....640',
    '...440',
    '..550',
  ])),
]);
export const SWING_ARCS_L = Object.freeze(SWING_ARCS_R.map(flipH));
export const SWING_ARC_OFFSETS = Object.freeze([
  Object.freeze({ x: 7, y: -32 }),
  Object.freeze({ x: 9, y: -29 }),
  Object.freeze({ x: 9, y: -24 }),
  Object.freeze({ x: 7, y: -16 }),
]);

// --- Walker: a hunched shambling ghoul. Moss-green rotted flesh, dark umber sinew, a single pale
//     eye, dangling arms. Silhouette-first: stooped, top-heavy. ~20×22.
export const WALKER_R = parseSprite(padRows([
  '.....00000',
  '....0eqqqe0',
  '...0eqqqqqe0',
  '...0eq050qe0',       // pale eye
  '...0eqqqqqqe0',
  '..0deqqqqqqed0',
  '.0deemmmmmmeed0',    // hunched torso, umber sinew
  '0deemmmmmmmmeed0',
  '0demmmqqqqmmmed0',
  '0demmqqqqqqmmed',
  '.0dmmqqqqqqmmd0',
  '.0demmqqqqmmed',
  '..0deemmmmeed0',
  '..0ddeeqqeedd0',
  '...0d0eqqe0d0',      // arms hang off to the sides
  '...0d.0qq0.d0',
  '..0dd.0qq0.dd0',
  '......0m0m0',        // stubby feet
  '.....0dm0md0',
  '....0dd0.0dd0',
]));
export const WALKER_L = flipH(WALKER_R);

// --- Hopper: a compact springer. Sickly-bright moss body, big black eyes, coiled legs. ~16×16. ---
export const HOPPER_R = parseSprite(padRows([
  '....0000',
  '...0rqqr0',
  '..0rqqqqr0',
  '..0r0qq0r0',       // big black eyes
  '..0rq00qr0',
  '.0qrqqqqrq0',
  '0qqrqqqqrqq0',
  '0qrqddddrqq0',
  '0qrdqqqqdrq0',
  '.0qddqqddq0',
  '..0qd00dq0',       // mouth
  '..0e0..0e0',       // coiled legs tuck under
  '.0ee0..0ee0',
  '0dd00..00dd0',
]));
export const HOPPER_L = flipH(HOPPER_R);

// --- Boss: a heavy armored brute. Blood-dark iron plate (blood ramp), stone rivets, a horned helm,
//     glowing eyes, massive pauldrons. Rim-lit on the left edge. Silhouette reads as a hulking
//     armored mass. ~34×44.
export const BOSS_R = parseSprite(padRows([
  '.......00.......00',
  '......050.......050',        // helm horns, rim gleam
  '......00088888800',
  '.....0088ffffff8800',
  '....008ffffffffff800',
  '....08ffff8888ffff80',       // helm brow
  '....08fff8ffff8fff80',
  '....08ff8cffffc8ff80',       // torch-glow eyes (c)
  '....08fffffffffff f80',
  '....08ff8ffffff8ff80',       // helm cheek guards
  '.....08fffffffff80',
  '......008ffffff800',
  '....0088ff8888ff8800',       // gorget
  '...008ffffffffffff800',
  '..05fff8fffffff8fff800',     // pauldrons; left rim '5'
  '.05ffff8fffffff8ffff80',
  '05fffff8fffffff8fffff80',
  '05ff8ff8fffffff8ff8ff80',    // rivets (8) on the plate
  '05fffff8fffffff8fffff80',
  '.05ffff888fff888ffff80',
  '..0ffff8f88888f8ffff0',      // chest plate seam
  '..08fffff8ffff8fffff80',
  '...08ffff8ffff8ffff80',
  '...08fffff8888fffff80',
  '....08fff8ffff8fff80',
  '....08ff8ffffff8ff80',       // fists at the sides
  '...0ff8f8ffff8f8ff0',
  '..0f8ff08ffff80ff8f0',
  '..08ff0.08ff80.0ff80',       // greaves split
  '...00...08ff80...00',
  '........0f8f0',
  '.......0f88f0',
  '......08f00f80',            // boots planted
  '.....0ff0..0ff0',
  '....0nn00..00nn0',
]));
export const BOSS_L = flipH(BOSS_R);

// --- Tiles: clean code-drawn fallbacks for browsers while curated assets load. AR2 removes the
//     alternating checkerboard/banding and uses large masonry clusters with a sparse moss cap. 16×16.
export const TILE_GRASS = parseSprite(padRows([
  'qqeeeeeqqeeeeeeq',       // sparse moss clusters, not a checkerboard fringe
  '6666666666666666',       // continuous standable edge
  '7777777177777777',
  '7888888178888888',
  '7886688178866888',
  '7888888178888888',
  '1111111111111111',
  '1777777717777777',
  '1888888818888888',
  '1888668818866888',
  '1888888818888888',
  '1111111111111111',
  '7777777177777777',
  '7888888178888888',
  '7886688178866888',
  '1111111111111111',
]));
export const TILE_DIRT = parseSprite(padRows([
  '7777777177777777',
  '7888888178888888',
  '7886688178866888',
  '7888888178888888',
  '1111111111111111',
  '1777777717777777',
  '1888888818888888',
  '1888668818866888',
  '1888888818888888',
  '1111111111111111',
  '7777777177777777',
  '7888888178888888',
  '7886688178866888',
  '7888888178888888',
  '1111111111111111',
  '1888888818888888',
]));

// --- Checkpoint: a standing brazier on a stone post — a warm torch pool in the dark. 12×28. ---
export const CHECKPOINT = parseSprite(padRows([
  '....pp',
  '...pccp',
  '..pccbcp',       // flame: pale core → gold → amber
  '..pcbbcp',
  '...cbbc',
  '....bc',
  '...0770',        // iron bowl
  '..08bb80',
  '..0788870',
  '...07870',       // stone post
  '...08780',
  '...07870',
  '...08780',
  '...07870',
  '...08780',
  '...07870',
  '..0877780',
  '.088788880',
  '.0m777770m0',    // stone base
]));

// --- Death marker: a hovering cold soul-token holding lost XP (pulses in the renderer). 12×12. ---
export const MARKER = parseSprite(padRows([
  '....tt',
  '...tuut',
  '..tu55ut',
  '.tu5tt5ut',
  'tu5t00t5ut',      // spectral blue, hollow core
  'tu5t00t5ut',
  '.tu5tt5ut',
  '..tu55ut',
  '...tuut',
  '....tt',
]));

// --- Kit-unlock pickup: a hovering arcane rune. Purple/gold, glowing. 12×14. ---
export const UNLOCK = parseSprite(padRows([
  '....cc',
  '...cvvc',
  '..cv55vc',
  '.cv5ii5vc',
  'cv5i cc i5vc',
  'cv5icc ci5vc',
  'cv5icc ci5vc',
  '.cv5ii5vc',
  '..cv55vc',
  '...cvvc',
  '....cc',
]));

// === Environmental dressing (M12-ART) — decorations placed along the ground so screens stop
//     reading as bare geometry. Stone leans neutral so a stage THEME can tint them; moss is green. ===

// Gravestone — a weathered slab with a bone-engraved cross and moss at the foot. 10×15.
export const GRAVESTONE = parseSprite(padRows([
  '...0000',
  '..078870',
  '.07k77k70',
  '07877778 70',
  '0787jj7870',      // engraved cross (bone)
  '078jjjj870',
  '0787jj7870',
  '0787jj7870',
  '078777 7870',
  '078777 7870',
  '0787777870',
  '0e8777 8e0',      // moss creeping up the base
  '0ee8778ee0',
  '0qee88eeq0',
]));

// Broken arch / ruined pillar — a snapped stone column, cluster-shaded. 10×18.
export const BROKEN_ARCH = parseSprite(padRows([
  '.07770',
  '.08 870',        // jagged broken top
  '07887 0',
  '078870',
  '077870',
  '078770',
  '077870',
  '078870',
  '077870',
  '078870',
  '077870',
  '0m7870',
  '0m8770',
  '0mm870',
  '0m7m70',         // rubble at the foot
  '0mmmm0',
]));

// Hanging vine — a trailing creeper with leaves. 6×16.
export const VINE = parseSprite(padRows([
  '.dd',
  'dee d',
  '.dd',
  '.dd d',
  'dee d',
  '.dd',
  '.ddd',
  'd eed',
  '..dd',
  '.dd',
  '.dee',
  '..dd',
  '..dd',
  '.qd',
]));

// Grass / moss tuft — sits on the surface. 9×4.
export const GRASS_TUFT = parseSprite(padRows([
  '.q..q..q.',
  'qeq.qeq.q',
  'eqeeqeqee',
  'de0ede0ed',
]));

// Skull — a small bone skull for crypt dressing. 8×7.
export const SKULL = parseSprite(padRows([
  '.0000',
  '0jkkj0',
  '0j00j0',         // eye sockets
  '0jkkj0',
  '0jkkj0',
  '.0j0j0',         // jaw / teeth
  '..000',
]));

// Wall torch — a bracketed flame that throws a warm pool of light (glow drawn in the renderer). 7×12.
export const WALL_TORCH = parseSprite(padRows([
  '..p',
  '.pcp',
  '.pcbp',
  '.ccb',
  '..bc',
  '..c',
  '.0b0',           // iron bracket
  '087780',
  '.0mm0',
  '..07',
  '..0m',
]));

// --- Drop: a small heal phial — glass with red fluid, cork stopper, glass rim gleam. 10×12. ---
export const DROP_HEAL = parseSprite(padRows([
  '..0mm0',
  '..0aa0',          // cork
  '.088880',
  '.0o5g60',         // glass shoulders, gleam
  '0og55g60',
  '0oggg5g0',        // red fluid + gleam
  '0oggggg0',
  '0oggggg0',
  '0og gggg0',
  '.0ogggo0',
  '..08880',
]));
