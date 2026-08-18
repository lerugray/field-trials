// rooms.js — departments (M2). A room is a contiguous run of claimed floor cells designated to the
// same department. Rooms are AREAS with a size-driven quality curve, not building slots with a
// level (KEEP #2). Pure and clock-free. Room effects beyond treasury capacity (staff attraction,
// research) arrive with the staff model (M3); what M2 fixes is the shape: designate, group, size,
// quality, and the one concrete effect (a Treasury's tiles set the gold ceiling).
import { CELL, ROOM, roomQuality, treasuryCapacity } from './model.js';
import { cellAt, orthoNeighbours } from './grid.js';

const ROOM_TYPES = new Set(Object.values(ROOM));

// designateRoom(f, x, y, type) -> { ok, reason? }. Tag a claimed floor cell as a department, or
// pass type=null to clear it. Only claimed, excavated floor can be designated (not rock, not a
// worked gold seam).
export function designateRoom(f, x, y, type) {
  const c = cellAt(f, x, y);
  if (!c) return { ok: false, reason: 'no such cell' };
  if (type !== null && !ROOM_TYPES.has(type)) return { ok: false, reason: 'unknown department' };
  if (!c.excavated || !c.claimed) return { ok: false, reason: 'cell is not claimed floor' };
  if (c.kind !== CELL.FLOOR) return { ok: false, reason: 'a worked seam cannot be a department' };
  c.roomType = type;
  refreshRooms(f);
  return { ok: true };
}

// computeRooms(f) -> [{ id, type, cells:[{x,y}], size, quality }]. Flood-fills contiguous cells
// sharing a department into rooms. A room's quality is driven by its size (roomQuality).
export function computeRooms(f) {
  const seen = new Set();
  const rooms = [];
  let n = 0;
  for (let y = 0; y < f.dims.rows; y++) {
    for (let x = 0; x < f.dims.cols; x++) {
      const c = f.grid[y][x];
      if (!c.roomType || seen.has(`${x},${y}`)) continue;
      // Flood fill this department region.
      const type = c.roomType;
      const cells = [];
      const stack = [{ x, y }];
      while (stack.length) {
        const p = stack.pop();
        const key = `${p.x},${p.y}`;
        if (seen.has(key)) continue;
        const cc = cellAt(f, p.x, p.y);
        if (!cc || cc.roomType !== type) continue;
        seen.add(key);
        cells.push(p);
        for (const nb of orthoNeighbours(p.x, p.y)) stack.push(nb);
      }
      rooms.push({ id: `room-${type}-${n++}`, type, cells, size: cells.length, quality: roomQuality(cells.length) });
    }
  }
  return rooms;
}

// treasuryTiles(f) -> number of cells designated Treasury. Their count sets the gold ceiling.
export function treasuryTiles(f) {
  let n = 0;
  for (const row of f.grid) for (const c of row) if (c.roomType === ROOM.TREASURY) n++;
  return n;
}

// refreshRooms(f): recompute the derived room list and the treasury capacity, clamping any gold
// above the new ceiling (a shrunk Treasury spills; KEEP #2 made mechanical).
export function refreshRooms(f) {
  f.rooms = computeRooms(f);
  f.treasury.capacity = treasuryCapacity(treasuryTiles(f));
  if (f.treasury.gold > f.treasury.capacity) f.treasury.gold = f.treasury.capacity;
  return f.rooms;
}
