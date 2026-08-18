// grid.js — the dungeon grid logic (M2): carving cells out of rock and the spread of claimed
// territory. Pure and clock-free. The dungeon is CARVED, not placed (KEEP #1): a cell can only be
// excavated if it touches claimed ground, so the facility grows outward from the Cornerstone.
// Claimed territory spreads one ring per cycle into adjacent excavated floor (KEEP #7).
import { CELL, CONFIG } from './model.js';

export function inBounds(f, x, y) {
  return x >= 0 && y >= 0 && x < f.dims.cols && y < f.dims.rows;
}

export function cellAt(f, x, y) {
  return inBounds(f, x, y) ? f.grid[y][x] : null;
}

// The four orthogonal neighbours of a cell.
export function orthoNeighbours(x, y) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ];
}

function hasClaimedNeighbour(f, x, y) {
  return orthoNeighbours(x, y).some((n) => {
    const c = cellAt(f, n.x, n.y);
    return c && c.claimed;
  });
}

// canExcavate(f, x, y): the cell is unexcavated rock (or an unrevealed gold seam) in bounds, and it
// touches claimed ground. You carve outward from what you already hold.
export function canExcavate(f, x, y) {
  const c = cellAt(f, x, y);
  if (!c || c.excavated) return false;
  return hasClaimedNeighbour(f, x, y);
}

// applyExcavation(f, x, y): carve the cell. It becomes excavated and surveyed; a gold seam is
// revealed (kind stays 'gold'), anything else becomes floor. It is not yet claimed; claim spreads.
export function applyExcavation(f, x, y) {
  const c = cellAt(f, x, y);
  if (!c) return false;
  c.excavated = true;
  c.surveyed = true;
  if (c.kind !== CELL.GOLD) c.kind = CELL.FLOOR;
  return true;
}

// spreadClaim(f, rings): claimed territory spreads one ring at a time into adjacent excavated
// cells. Returns the number of cells newly claimed. Applied during COMMIT.
export function spreadClaim(f, rings = CONFIG.terrain.claimSpreadPerCycle) {
  let claimed = 0;
  for (let r = 0; r < rings; r++) {
    const toClaim = [];
    for (let y = 0; y < f.dims.rows; y++) {
      for (let x = 0; x < f.dims.cols; x++) {
        const c = f.grid[y][x];
        if (c.claimed || !c.excavated) continue;
        if (hasClaimedNeighbour(f, x, y)) toClaim.push(c);
      }
    }
    if (toClaim.length === 0) break;
    for (const c of toClaim) {
      c.claimed = true;
      claimed += 1;
    }
  }
  return claimed;
}

// countClaimedGold(f): claimed, revealed gold seams. Each yields income per cycle.
export function countClaimedGold(f) {
  let n = 0;
  for (const row of f.grid) for (const c of row) if (c.claimed && c.kind === CELL.GOLD) n++;
  return n;
}

// countExcavated(f): every carved-out cell. Used to read how much facility has been opened.
export function countExcavated(f) {
  let n = 0;
  for (const row of f.grid) for (const c of row) if (c.excavated) n++;
  return n;
}
