// THE LEGIBILITY LAW (DIRECTIONS addendum 2026-08-14, binding): every number ships a plain-language
// label at the point of reading, and no sigil goes unexplained. This is the inverse of §4.2's
// flavour-pairing law. Mechanical lint for the violation shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CELL } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueFortify } from '../src/actions.js';
import { describeCell } from '../src/render.js';

test('every after-action number is labelled, never a bare token', () => {
  // Each report line's numeric half must carry a label word next to its figures, not a naked number.
  let f = createFacility({ seed: 'legible-law' });
  let guard = 0;
  while (f.status === 'active' && guard++ < 30) {
    if (f.treasury.gold >= 50) queueFortify(f);
    f = commitCycle(f);
    for (const line of f.lastReport.lines) {
      assert.ok(/\d/.test(line.numeric), `line ${line.kind} has no number`);
      assert.ok(/[A-Za-z]{3,}/.test(line.numeric), `line ${line.kind} number is unlabelled: "${line.numeric}"`);
    }
  }
});

test('every cell on the cutaway can be read in plain language (no unexplained sigil)', () => {
  const f = createFacility({ seed: 'legend' });
  // Plant one of each surveyed kind next to the footprint and check each is described plainly.
  const { x, y } = f.lossObject.cell;
  // The Cornerstone itself.
  assert.match(describeCell(f, x, y), /Cornerstone/);
  // Unsurveyed rock.
  assert.match(describeCell(f, 0, 0), /rock/i);
  // A claimed floor cell (footprint neighbour).
  assert.match(describeCell(f, x - 1, y), /floor/i);
  // A worked gold seam.
  f.grid[y][x + 1].kind = CELL.GOLD;
  f.grid[y][x + 1].excavated = true;
  f.grid[y][x + 1].surveyed = true;
  f.grid[y][x + 1].claimed = true;
  assert.match(describeCell(f, x + 1, y), /gold seam/i);
  // Every description is non-empty and human-readable (has a word).
  for (let yy = 0; yy < f.dims.rows; yy++) {
    for (let xx = 0; xx < f.dims.cols; xx++) {
      assert.ok(/[A-Za-z]{3,}/.test(describeCell(f, xx, yy)), `cell ${xx},${yy} has no plain-language read`);
    }
  }
});
