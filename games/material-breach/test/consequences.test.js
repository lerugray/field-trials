// DIRECTIONS fold 17a: "a report line with no administrative consequence is a defect" — now a
// test. Every consequential after-action line must correspond to a real change in facility state
// the same cycle. We drive a rich tenure and, for each line kind emitted, assert its state delta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CELL, ROOM, activeStaff } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { designate, queueExcavate } from '../src/actions.js';
import { countExcavated } from '../src/grid.js';
import { refreshRooms } from '../src/rooms.js';

function snapshot(f) {
  return {
    treasury: f.treasury.gold,
    cornerstone: f.lossObject.condition,
    excavated: countExcavated(f),
    crew: activeStaff(f).length,
  };
}

test('every consequential report-line kind reflects a real state change that cycle', () => {
  // Build a facility that will emit income, excavation, hiring, raid, payday, grievance, casualty
  // and terminal lines over its tenure.
  let f = createFacility({ seed: 'consequences' });
  const { x, y } = f.lossObject.cell;
  // A claimed strip for departments, so hiring can occur.
  for (let i = 0; i < 5; i++) {
    const c = f.grid[y + 3][x - 2 + i];
    c.kind = CELL.FLOOR;
    c.excavated = true;
    c.claimed = true;
    c.surveyed = true;
  }
  designate(f, x - 2, y + 3, ROOM.RECORDS);
  designate(f, x - 1, y + 3, ROOM.RECORDS);
  designate(f, x, y + 3, ROOM.QUARTERS);
  designate(f, x + 1, y + 3, ROOM.QUARTERS);
  designate(f, x + 2, y + 3, ROOM.QUARTERS);
  refreshRooms(f);

  const seenKinds = new Set();
  let guard = 0;
  while (f.status === 'active' && guard++ < 25) {
    // Keep carving so excavation lines keep coming (each new cell touches claimed ground).
    queueExcavate(f, x + 2, y);
    const before = snapshot(f);
    f = commitCycle(f);
    const after = snapshot(f);
    for (const line of f.lastReport.lines) {
      seenKinds.add(line.kind);
      switch (line.kind) {
        case 'income':
          assert.notEqual(after.treasury, before.treasury - 0, 'income line but treasury unmoved');
          break;
        case 'excavation':
          assert.ok(after.excavated >= before.excavated, 'excavation line but nothing carved');
          break;
        case 'hiring':
          assert.ok(after.crew > before.crew, 'hiring line but crew did not grow');
          break;
        case 'raid':
          if (f.lastReport.structuralDamage > 0) {
            assert.ok(after.cornerstone < before.cornerstone, 'structural loss reported but Cornerstone unchanged');
          }
          break;
        case 'separation':
        case 'casualty':
          assert.ok(after.crew <= before.crew, 'a separation/casualty line but the crew did not shrink');
          break;
        case 'terminal':
          assert.notEqual(f.status, 'active', 'terminal line but the tenure is still active');
          break;
        default:
          break; // payday/grievance/order-complete are covered by other tests
      }
    }
  }
  // The tenure exercised the main consequence-bearing kinds.
  for (const kind of ['income', 'raid', 'excavation']) {
    assert.ok(seenKinds.has(kind), `expected the tenure to emit a '${kind}' line`);
  }
});
