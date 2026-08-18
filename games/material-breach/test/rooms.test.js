// Departments (M2): a room is a contiguous run of claimed floor designated to one department, and
// its quality is driven by its size (KEEP #2). The Treasury's tiles set the gold ceiling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, ROOM, CELL, roomQuality, treasuryCapacity, CONFIG } from '../src/model.js';
import { designate } from '../src/actions.js';
import { computeRooms, treasuryTiles, refreshRooms } from '../src/rooms.js';

// The founding footprint gives claimed floor cells around the Cornerstone to designate.
function footprint(f) {
  const { x, y } = f.lossObject.cell;
  return {
    centre: { x, y },
    up: { x, y: y - 1 },
    down: { x, y: y + 1 },
    left: { x: x - 1, y },
    right: { x: x + 1, y },
  };
}

test('a claimed floor cell can be designated to a department and appears as a room', () => {
  const f = createFacility({ seed: 'rooms' });
  const p = footprint(f);
  assert.equal(designate(f, p.up.x, p.up.y, ROOM.RECORDS).ok, true);
  assert.equal(f.grid[p.up.y][p.up.x].roomType, ROOM.RECORDS);
  const rooms = computeRooms(f);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].type, ROOM.RECORDS);
  assert.equal(rooms[0].size, 1);
});

test('room quality is driven by size (contiguous cells group into one room)', () => {
  const f = createFacility({ seed: 'rooms2' });
  const p = footprint(f);
  // centre + up are orthogonally adjacent -> one room of size 2.
  designate(f, p.centre.x, p.centre.y, ROOM.RECORDS);
  designate(f, p.up.x, p.up.y, ROOM.RECORDS);
  const rooms = computeRooms(f).filter((r) => r.type === ROOM.RECORDS);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].size, 2);
  assert.equal(rooms[0].quality, roomQuality(2));
});

test('a Treasury department raises the treasury capacity from its tiles (KEEP #2)', () => {
  const f = createFacility({ seed: 'rooms3' });
  const p = footprint(f);
  const cap0 = f.treasury.capacity;
  designate(f, p.left.x, p.left.y, ROOM.TREASURY);
  designate(f, p.centre.x, p.centre.y, ROOM.TREASURY);
  assert.equal(treasuryTiles(f), 2);
  assert.equal(f.treasury.capacity, treasuryCapacity(2));
  assert.ok(f.treasury.capacity > cap0);
});

test('designation is refused on rock, on unclaimed ground, and on a worked seam', () => {
  const f = createFacility({ seed: 'rooms4' });
  assert.equal(designate(f, 0, 0, ROOM.RECORDS).ok, false); // unexcavated rock, not claimed
  const p = footprint(f);
  f.grid[p.right.y][p.right.x].kind = CELL.GOLD; // pretend it is a worked seam
  assert.equal(designate(f, p.right.x, p.right.y, ROOM.RECORDS).ok, false);
});

test('clearing a designation removes the room and restores capacity', () => {
  const f = createFacility({ seed: 'rooms5' });
  const p = footprint(f);
  designate(f, p.centre.x, p.centre.y, ROOM.TREASURY);
  const capWith = f.treasury.capacity;
  designate(f, p.centre.x, p.centre.y, null); // clear
  refreshRooms(f);
  assert.equal(f.grid[p.centre.y][p.centre.x].roomType, null);
  assert.equal(f.treasury.capacity, treasuryCapacity(0));
  assert.ok(f.treasury.capacity < capWith);
});
