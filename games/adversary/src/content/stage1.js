// stage1.js — Stage 1 layout (DESIGN-SEED M3: a beatable stage-1 vertical slice). Authored as a
// tile grid with spawn markers. Built programmatically so the geometry is exact. Enough trash to
// level the player toward the boss, two jumpable pits, a raised step and a floating platform for
// verticality, then a boss arena guarding the exit. Verified bot-beatable in tests.
// Legend: '#' solid · 'p' player · 'w' walker · 'h' hopper · 'B' boss · 'x' exit.

const W = 72;
const H = 15;

function build() {
  const rows = Array.from({ length: H }, () => Array(W).fill('.'));
  const fillRow = (r, ch, from = 0, to = W) => { for (let c = from; c < to; c++) rows[r][c] = ch; };
  const set = (r, c, ch) => { rows[r][c] = ch; };

  // Ground: bottom two rows solid.
  fillRow(13, '#'); fillRow(14, '#');
  // Two jumpable 2-tile pits.
  for (const c of [26, 27]) { rows[13][c] = '.'; rows[14][c] = '.'; }
  for (const c of [46, 47]) { rows[13][c] = '.'; rows[14][c] = '.'; }
  // A floating platform for verticality (decorative / holds a hopper).
  for (let c = 17; c <= 22; c++) rows[9][c] = '#';

  // Spawns (markers sit on the row whose bottom is the surface they stand on).
  set(12, 3, 'p');
  set(12, 10, 'w');
  set(8, 19, 'h');    // hopper on the floating platform (surface row 9)
  set(12, 20, 'w');
  set(12, 30, 'C');   // unlock: charged strike
  set(12, 35, 'w');
  set(12, 42, 'w');
  set(12, 44, 'S');   // unlock: sub-weapon
  set(12, 50, 'c');   // checkpoint before the boss arena
  set(12, 54, 'w');
  set(12, 60, 'w');
  set(12, 64, 'B');   // boss guarding the exit
  set(12, 70, 'x');

  return rows.map((r) => r.join(''));
}

export const STAGE1 = { rows: build(), startXp: 0, weaponId: 'short-blade' };
export const STAGE1_DIMS = { W, H };
