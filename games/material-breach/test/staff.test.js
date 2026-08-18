// Staff (M3): rooms ATTRACT applicants, never a roster pick (KEEP #3). Departments open posts by
// size; amenities house the crew; applicants report on their own until the posts or the beds fill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CELL, ROOM, ARCHETYPE, activeStaff } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { designate } from '../src/actions.js';
import { refreshRooms } from '../src/rooms.js';
import { postCapacity, housingCapacity, openPosts } from '../src/staff.js';

// Carve and claim a horizontal strip of floor cells so departments can be designated on them.
function claimStrip(f, x0, y, len) {
  const cells = [];
  for (let i = 0; i < len; i++) {
    const c = f.grid[y][x0 + i];
    c.kind = CELL.FLOOR;
    c.excavated = true;
    c.claimed = true;
    c.surveyed = true;
    cells.push({ x: x0 + i, y });
  }
  return cells;
}

function countArch(f, arch) {
  return activeStaff(f).filter((s) => s.archetype === arch).length;
}

test('with no productive department, no applicants arrive: the crew stays inherited', () => {
  let f = createFacility({ seed: 'no-attract' });
  f.fortify = 100; // keep the tenure alive while we observe
  const crew0 = activeStaff(f).length;
  for (let i = 0; i < 6; i++) f = commitCycle(f);
  assert.equal(activeStaff(f).length, crew0, 'staff appeared without any department to attract them');
});

test('a Records department opens clerk posts and applicants fill them (KEEP #3)', () => {
  const f = createFacility({ seed: 'attract' });
  f.fortify = 100;
  const { x, y } = f.lossObject.cell;
  // Two Records tiles (one clerk post) and three Quarters tiles (beds free) on a claimed strip.
  const strip = claimStrip(f, x + 1, y + 3, 5);
  designate(f, strip[0].x, strip[0].y, ROOM.RECORDS);
  designate(f, strip[1].x, strip[1].y, ROOM.RECORDS);
  designate(f, strip[2].x, strip[2].y, ROOM.QUARTERS);
  designate(f, strip[3].x, strip[3].y, ROOM.QUARTERS);
  designate(f, strip[4].x, strip[4].y, ROOM.QUARTERS);
  refreshRooms(f);

  assert.equal(postCapacity(f)[ARCHETYPE.CLERK], 1, 'a 2-tile Records opens one clerk post');
  assert.ok(housingCapacity(f) > activeStaff(f).length, 'beds should be free for an applicant');
  assert.equal(openPosts(f)[ARCHETYPE.CLERK], 1);

  let g = f;
  for (let i = 0; i < 12 && countArch(g, ARCHETYPE.CLERK) < 1; i++) g = commitCycle(g);
  assert.equal(countArch(g, ARCHETYPE.CLERK), 1, 'the clerk post was never filled by an applicant');
  // Never overfilled beyond the posts the department opened.
  assert.ok(countArch(g, ARCHETYPE.CLERK) <= postCapacity(g)[ARCHETYPE.CLERK]);
});

test('applicants stop when the beds are full, even with open posts', () => {
  const f = createFacility({ seed: 'housing' });
  f.fortify = 100;
  const { x, y } = f.lossObject.cell;
  // A large Records department (many clerk posts) but NO Quarters: base housing only (4), already
  // filled by the inherited crew, so no applicant can be housed.
  const strip = claimStrip(f, x - 4, y + 4, 8);
  for (const cell of strip) designate(f, cell.x, cell.y, ROOM.RECORDS);
  refreshRooms(f);
  assert.ok(postCapacity(f)[ARCHETYPE.CLERK] >= 2, 'the big Records should open several posts');

  let g = f;
  const housed0 = activeStaff(g).length;
  for (let i = 0; i < 8; i++) g = commitCycle(g);
  assert.equal(activeStaff(g).length, housed0, 'applicants were housed with no beds free');
});
