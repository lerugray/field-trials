// art.js — ART BINDINGS (DESIGN-SEED M2 art integration; CLAUDE.md #1). Pure
// data: which licensed battler sheet backs each job/enemy, and the frame geometry
// to slice from it. The actual pixels are the Willibab "Simple 8-bit Sideview
// Battlers" pack (CC BY), inlined into the single-file build by scripts/build.js
// as base64 data URIs under the global ART_DATA. main.js loads them into Images
// and slices the frame below. NO generated or code-drawn battlers — this maps to
// pack art only. Provenance is recorded in materials/ASSET-MANIFEST.md.

// Sideview actor sheets are 1296×864 = 9 cols × 6 rows of 144×144 frames
// (manifest §Battlers, [confirmed]). We draw a single standing frame per battler.
export const BATTLER = { size: 144, col: 0, row: 0 };

// Job -> a specific colour variant in the sv_actors set. Art frames only; the job
// NAMES/verbs are authored in-register (jobs.js), unrelated to these labels.
export const JOB_BATTLER = {
  bailiff: 'HEDGE_KNIGHT_BROWN',
  chirurgeon: 'MYSTIC_GREEN',
  surveyor: 'WARDEN_GREEN',
  almoner: 'SHAMAN_BROWN',
  notary: 'ARCANIST_BLUE',
  sumpter: 'TEMPLAR_BLUE',
};

// The road's foes draw from the same 144×144 grid (flipped to face the party).
export const ENEMY_BATTLERS = ['GHOUL_GREEN', 'REAPER_DARK', 'SORCEROR_RED'];

// Every battler sheet the build must inline (deduped). build.js resolves each to
// a path under the Sideview Battlers pack and base64-encodes it.
export const ART_KEYS = Array.from(new Set([...Object.values(JOB_BATTLER), ...ENEMY_BATTLERS]));

// The tarot deck art (FULL Pixel Tarot Deck by GuttyKreum, commercial licence).
// 22 major-arcana faces + the card back, each 57×79, drawn whole (not a grid).
// deck.js references these keys via each card's `arcana` field.
export const TAROT_FRAME = { w: 57, h: 79 };
export const TAROT_KEYS = [
  'the_fool', 'magician', 'priestess', 'empress', 'emperor', 'hierophant', 'the_lovers',
  'chariot', 'strength', 'the_hermit', 'wheel_of_fortune', 'justice', 'hanged_man', 'death',
  'temperance', 'the_devil', 'the_tower', 'the_star', 'the_moon', 'the_sun', 'judgement',
  'the_world', 'back_of_card',
];

// UI iconography — Willibab's Retro Icons (CC BY, "Willibab / Monsteretrope").
// One 512×1408 iconset, 32×32 icons in a 16-col grid (manifest §Tilesets/UI). We
// slice specific cells 1:1 for the instruments (gold/supplies/mandate) and the
// equipment slots — pack art only, sliced on the native pixel grid (idiom gate).
export const ICON_FRAME = 32;
export const ICONSET_KEY = 'ICONSET';
export const ICON = {
  gold: { col: 3, row: 9 }, // the gold orb — the ledger's unit
  supplies: { col: 14, row: 7 }, // a provision bag
  mandate: { col: 4, row: 8 }, // a rolled instrument (scroll)
  arm: { col: 2, row: 5 }, // a sword — the arm slot
  guard: { col: 0, row: 7 }, // a shield — the guard slot
};

// Overworld terrain tiles — Willibab / Monsteretrope Overworld set (CC BY, sheet
// OW_A2, 256×256 = 16×16 tiles @ 16px [confirmed on the square sheet]). Each of
// the 5 in-register road terrains binds to a SOLID ground tile — the top-left
// sub-tile of an A2 autotile block, which fills uniformly (idiom-correct; sliced
// on the native 16px grid, drawn nearest-neighbour, no stretch).
export const TILE_FRAME = 16;
export const OVERWORLD_KEY = 'OW_A2';
export const TERRAIN_TILE = {
  'toll-wood': { col: 0, row: 0 }, // solid grass
  'chalk-flat': { col: 0, row: 3 }, // solid chalk/white
  'the-cutting': { col: 0, row: 6 }, // solid sand/earth (a dug cutting)
  'marker-stones': { col: 0, row: 9 }, // solid rock/grey
  fen: { col: 8, row: 0 }, // water/marsh
};

// Town floor tiles — Willibab / Monsteretrope Town set (CC BY, `TOWNS_ALL_1x.png`,
// 512×544 = 32×34 tiles @16px [confirmed: both dims divide 16]). A cobblestone
// street tile grounds the quartermaster as a place in a town.
export const TOWN_KEY = 'TOWN_A';
export const TOWN_TILE = {
  cobble: { col: 0, row: 18 }, // grey round-cobblestone street (bottom band)
};

// battlerForJob / battlerForEnemy: resolve a drawable key (with a safe fallback).
export function battlerForJob(jobId) {
  return JOB_BATTLER[jobId] || ART_KEYS[0];
}
export function battlerForEnemy(index) {
  return ENEMY_BATTLERS[index % ENEMY_BATTLERS.length];
}
