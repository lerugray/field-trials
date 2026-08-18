// The data model, spoken in the game's own vocabulary: a founded facility, its treasury, its
// departments, the loss object at the centre, and the shapes of works orders and served notices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFacility,
  createStaff,
  createOrder,
  createNotice,
  createRoom,
  createPost,
  nextId,
  roomQuality,
  treasuryCapacity,
  wageForTier,
  CONFIG,
  PHASES,
  ARCHETYPE,
} from '../src/model.js';

test('a founded facility opens in ADMIN on cycle 1 with the charter treasury', () => {
  const f = createFacility({ seed: 'tenure' });
  assert.equal(f.cycle.number, 1);
  assert.equal(f.cycle.phase, 'ADMIN');
  assert.equal(PHASES[0], 'ADMIN');
  assert.equal(f.treasury.gold, CONFIG.bootstrap.startingTreasury);
  // The starting 400 must fit inside the founding charter's bonded capacity.
  assert.ok(f.treasury.gold <= f.treasury.capacity);
});

test('founding is deterministic in the seed', () => {
  const a = createFacility({ seed: 'same' });
  const b = createFacility({ seed: 'same' });
  assert.deepEqual(a, b);
  const c = createFacility({ seed: 'other' });
  assert.notDeepEqual(a.grid, c.grid);
});

test('the loss object is a single Cornerstone at the centre, condition 100', () => {
  const f = createFacility({ seed: 'x', cols: 10, rows: 8 });
  assert.equal(f.lossObject.id, 'cornerstone');
  assert.equal(f.lossObject.condition, 100);
  assert.deepEqual(f.lossObject.cell, { x: 5, y: 4 });
});

test('the founding footprint is claimed and surveyed; the rest of the map is unknown rock', () => {
  const f = createFacility({ seed: 'x', cols: 12, rows: 12 });
  const { x, y } = f.lossObject.cell;
  const heart = f.grid[y][x];
  assert.equal(heart.claimed, true);
  assert.equal(heart.surveyed, true);
  assert.equal(heart.excavated, true);

  // Count surveyed cells: only the small footprint should be known. The rest is concealed rock.
  let surveyed = 0;
  for (const row of f.grid) for (const cell of row) if (cell.surveyed) surveyed++;
  assert.ok(surveyed >= 1 && surveyed <= 5, `expected a tiny surveyed footprint, got ${surveyed}`);
});

test('room size drives quality, and quality diminishes past the soft cap', () => {
  // Below the cap: linear and under 1.
  assert.ok(roomQuality(3) < 1);
  // At the cap: exactly 1.0.
  assert.equal(roomQuality(CONFIG.quality.softCapTiles), 1);
  // Past the cap: still rising, but a doubled room is nowhere near a doubled quality (fold 12).
  const cap = CONFIG.quality.softCapTiles;
  assert.ok(roomQuality(cap * 2) > 1);
  assert.ok(roomQuality(cap * 2) < 1.5);
  // Monotone non-decreasing.
  for (let n = 1; n < 40; n++) assert.ok(roomQuality(n + 1) >= roomQuality(n));
});

test('treasury capacity is the charter base plus tiles times the per-tile rate', () => {
  assert.equal(treasuryCapacity(0), CONFIG.treasury.baseCapacity);
  assert.equal(
    treasuryCapacity(3),
    CONFIG.treasury.baseCapacity + 3 * CONFIG.treasury.perTile,
  );
});

test('staff are hired at their archetype wage tier, not picked from a roster', () => {
  const f = createFacility({ seed: 'x' });
  const drudge = createStaff({ id: nextId(f, 'staff'), archetype: ARCHETYPE.DRUDGE });
  const warden = createStaff({ id: nextId(f, 'staff'), archetype: ARCHETYPE.WARDEN });
  assert.equal(drudge.wage, wageForTier(1));
  assert.equal(warden.wage, wageForTier(3));
  assert.equal(drudge.status, 'employed');
  assert.deepEqual(drudge.grievances, []);
});

test('a works order carries a lead time that has not yet elapsed', () => {
  const f = createFacility({ seed: 'x' });
  const o = createOrder({ id: nextId(f, 'order'), kind: 'fabricate', target: 'door', leadCycles: 3 });
  assert.equal(o.cyclesRemaining, 3);
  assert.equal(o.status, 'queued');
});

test('a served notice stamps its own deadline and cites its instrument', () => {
  const f = createFacility({ seed: 'x' });
  const n = createNotice({ id: nextId(f, 'notice'), rung: 'surveyor', deadlineCycles: 4, cycleServed: 2 });
  assert.equal(n.instrument, 'schedule-of-dilapidations');
  assert.equal(n.cyclesRemaining, 4); // stamped on the notice itself (fold 10)
  assert.equal(n.status, 'served');
});

test('rooms report their size from their claimed footprint', () => {
  const f = createFacility({ seed: 'x' });
  const r = createRoom({ id: nextId(f, 'room'), type: 'treasury', cells: [{ x: 1, y: 1 }, { x: 2, y: 1 }] });
  assert.equal(r.size, 2);
  const p = createPost({ id: nextId(f, 'post'), type: 'treasury', roomId: r.id });
  assert.equal(p.staffId, null);
  assert.equal(p.roomId, r.id);
});

test('ids are minted deterministically and monotonically, never randomly', () => {
  const a = createFacility({ seed: 'x' });
  const b = createFacility({ seed: 'x' });
  // Same seed, same founding: the next minted id matches across two facilities.
  assert.equal(nextId(a, 'order'), nextId(b, 'order'));
  // And the counter only ever climbs.
  const first = Number(nextId(a, 'order').split('-')[1]);
  const second = Number(nextId(a, 'staff').split('-')[1]);
  assert.equal(second, first + 1);
});

test('the founding crew is the inherited placeholder night shift', () => {
  const f = createFacility({ seed: 'x' });
  assert.equal(f.staff.length, 4);
  assert.ok(f.staff.every((s) => s.status === 'employed'));
});
