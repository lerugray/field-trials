// GATE 6 — screen-fill >= 95% (DESIGN-SEED §8.6): the composed picture fills the buffer, no empty
// letterbox inside the native frame. Asserted geometrically on the panel layout that the renderer
// draws, so it is deterministic and needs no browser.
//
// GATE 4 — action-legibility (DESIGN-SEED §8.4): every state change that alters an outcome is
// visible at the moment it happens. Asserted by enumerating the outcome-altering events and showing
// each leaves a visible artifact: a queued order is in the plan immediately, and each resolved
// event emits an after-action line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN, CUTAWAY, LEDGER, ACTIONBAR } from '../src/layout.js';
import { createFacility } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueExcavate, queueFortify } from '../src/actions.js';

test('the composed panels fill at least 95% of the buffer (Gate 6)', () => {
  const rects = [CUTAWAY, LEDGER, ACTIONBAR];
  // The panels do not overlap, so their areas sum to the covered area.
  for (const r of rects) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= SCREEN.w && r.y + r.h <= SCREEN.h, 'a panel exceeds the buffer');
  }
  const covered = rects.reduce((a, r) => a + r.w * r.h, 0);
  const fill = covered / (SCREEN.w * SCREEN.h);
  assert.ok(fill >= 0.95, `screen fill is ${(fill * 100).toFixed(1)}%, below the 95% floor`);
});

test('a queued works order is visible in the plan the instant it is raised (Gate 4)', () => {
  const f = createFacility({ seed: 'legible' });
  const { x, y } = f.lossObject.cell;
  assert.equal(f.orders.length, 0);
  queueExcavate(f, x + 2, y);
  // Before any commit, the order is already in the facility's plan for the player to see.
  assert.equal(f.orders.length, 1);
  assert.equal(f.orders[0].status, 'queued');
});

test('every outcome-altering event leaves an after-action line (Gate 4)', () => {
  // Drive a tenure and collect the kinds of report line emitted. Each of these events changes an
  // outcome and must be legible; a change with no line is a change the player could not see.
  let f = createFacility({ seed: 'legible-2' });
  const kinds = new Set();
  let guard = 0;
  while (f.status === 'active' && guard++ < 30) {
    if (f.treasury.gold >= 50) queueFortify(f);
    f = commitCycle(f);
    for (const line of f.lastReport.lines) kinds.add(line.kind);
  }
  // Income and raid happen every cycle; payday and the terminal close happen within a tenure.
  for (const required of ['income', 'raid', 'payday', 'terminal']) {
    assert.ok(kinds.has(required), `no visible report line for outcome-altering event '${required}'`);
  }
});
