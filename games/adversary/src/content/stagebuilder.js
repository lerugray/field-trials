// stagebuilder.js — parameterized stage generator (DESIGN-SEED M6: stages 2-4). Produces a stage
// def (tile rows + markers) from a compact description, reusing Stage 1's proven, bot-clearable
// shape: two solid floor rows with optional jumpable pits, optional floating platforms, and marker
// placements. Keeps hand-authoring low-risk — every generated stage is verified bot-beatable in
// tests. Marker letters match the stage loader (p/w/h/c/B/x, and C/D/J/P/S unlock pickups).

const SB_H = 15;                 // one screen tall
const SB_SURFACE = SB_H - 3;     // marker row (feet land on the floor top below it)
const SB_FLOOR_A = SB_H - 2;
const SB_FLOOR_B = SB_H - 1;

/**
 * @param {object} spec
 * @param {number} spec.width - tiles wide
 * @param {number[][]} [spec.pits] - [startCol, endCol] inclusive gaps in the floor (≤2 wide → jumpable)
 * @param {Array<[number,number,number]>} [spec.platforms] - [row, startCol, endCol] floating platforms
 * @param {number} [spec.player] - player spawn col
 * @param {number[]} [spec.walkers] - walker spawn cols (on the floor)
 * @param {Array<[number,number]>} [spec.hoppers] - [row, col] hopper spawns (row = surface it stands on - 1)
 * @param {Array<[string,number]>} [spec.unlocks] - [markerLetter, col] unlock pickups on the floor
 * @param {number} [spec.checkpoint] - checkpoint col
 * @param {number} [spec.boss] - boss col (omit for a no-boss stage; clear = reach exit)
 * @param {number} spec.exit - exit col
 * @param {object} [spec.extra] - passthrough def fields (startXp, weaponId, kit)
 */
export function buildStage(spec) {
  const { width, pits = [], platforms = [], player = 3, walkers = [], hoppers = [],
    unlocks = [], checkpoint = null, boss = null, exit, extra = {} } = spec;
  const rows = Array.from({ length: SB_H }, () => Array(width).fill('.'));
  const set = (r, c, ch) => { if (c >= 0 && c < width && r >= 0 && r < SB_H) rows[r][c] = ch; };

  for (let c = 0; c < width; c++) { rows[SB_FLOOR_A][c] = '#'; rows[SB_FLOOR_B][c] = '#'; }
  for (const [a, b] of pits) for (let c = a; c <= b; c++) { rows[SB_FLOOR_A][c] = '.'; rows[SB_FLOOR_B][c] = '.'; }
  for (const [r, a, b] of platforms) for (let c = a; c <= b; c++) rows[r][c] = '#';

  set(SB_SURFACE, player, 'p');
  for (const c of walkers) set(SB_SURFACE, c, 'w');
  for (const [r, c] of hoppers) set(r, c, 'h');
  for (const [letter, c] of unlocks) set(SB_SURFACE, c, letter);
  if (checkpoint != null) set(SB_SURFACE, checkpoint, 'c');
  if (boss != null) set(SB_SURFACE, boss, 'B');
  set(SB_SURFACE, exit, 'x');

  return { rows: rows.map((r) => r.join('')), ...extra };
}
