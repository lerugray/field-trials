import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { Board } from '../src/puzzle/board.js';
import { computeLayout, hitTest, drawBoard } from '../src/render/boardview.js';

const region = { x: 0, y: 0, w: 200, h: 200 };

test('computeLayout reserves margins for the widest/tallest clues', () => {
  const p = Puzzle.fromAscii(['#.#.#', '#####', '#.#.#', '#####', '#.#.#']);
  const layout = computeLayout(p, region);
  assert.ok(layout.marginCols >= 1);
  assert.ok(layout.marginRows >= 1);
  assert.ok(layout.gridX > layout.originX); // grid sits right of the row-clue margin
  assert.ok(layout.gridY > layout.originY); // and below the column-clue margin
  assert.ok(layout.cell >= 6);
});

test('hitTest inverts the grid layout', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  const layout = computeLayout(p, region);
  const cx = layout.gridX + 1 * layout.cell + 2;
  const cy = layout.gridY + 2 * layout.cell + 2;
  assert.deepEqual(hitTest(layout, cx, cy), { x: 1, y: 2 });
  assert.equal(hitTest(layout, layout.gridX - 5, layout.gridY), null); // in the margin
});

test('drawBoard renders a filled stitch in thread-indigo', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  const b = new Board(p, { autoX: false });
  b.toggleFill(0, 0);
  const fb = new Framebuffer(200, 200);
  const layout = computeLayout(p, region);
  drawBoard(fb, b, layout);
  // Sample the center of cell (0,0): should be blue-dominant (indigo thread).
  const cx = layout.gridX + Math.floor(layout.cell / 2);
  const cy = layout.gridY + Math.floor(layout.cell / 2);
  const px = fb.getPixel(cx, cy);
  assert.ok(px[2] > px[0] + 15, `expected indigo (b>r), got ${px}`);
});

test('drawBoard renders a cross for a crossed cell', () => {
  const p = Puzzle.fromAscii(['##', '..']);
  const b = new Board(p, { autoX: false });
  b.toggleCross(0, 1);
  const fb = new Framebuffer(200, 200);
  const layout = computeLayout(p, region);
  drawBoard(fb, b, layout);
  // The crossed cell should carry dark ink along its diagonal.
  const cx0 = layout.gridX + 0 * layout.cell;
  const cy0 = layout.gridY + 1 * layout.cell;
  let inkOnDiag = 0;
  for (let i = 0; i < layout.cell; i++) {
    const px = fb.getPixel(cx0 + i, cy0 + i);
    if (px[0] < 120 && px[1] < 120) inkOnDiag++;
  }
  assert.ok(inkOnDiag >= 2, `expected an X on the diagonal, got ${inkOnDiag} ink pixels`);
});

test('satisfied row dims its clue (lighter than an unsatisfied clue)', () => {
  const p = Puzzle.fromAscii(['###', '.#.', '.#.']);
  const fb = new Framebuffer(200, 200);
  const layout = computeLayout(p, region);

  const unsat = new Board(p, { autoX: false });
  drawBoard(fb, unsat, layout);
  const darkBefore = countDarkInMargin(fb, layout, 0);

  const sat = new Board(p, { autoX: false });
  sat.toggleFill(0, 0); sat.toggleFill(1, 0); sat.toggleFill(2, 0); // row 0 satisfied
  const fb2 = new Framebuffer(200, 200);
  drawBoard(fb2, sat, layout);
  const darkAfter = countDarkInMargin(fb2, layout, 0);

  assert.ok(darkAfter < darkBefore, `dimmed clue should have fewer dark pixels: ${darkAfter} vs ${darkBefore}`);
});

function countDarkInMargin(fb, layout, rowY) {
  let n = 0;
  const y0 = layout.gridY + rowY * layout.cell;
  for (let y = y0; y < y0 + layout.cell; y++) {
    for (let x = layout.originX; x < layout.gridX; x++) {
      const px = fb.getPixel(x, y);
      if (px[0] < 90 && px[1] < 90 && px[2] < 90) n++;
    }
  }
  return n;
}

test('crosshair washes the active row and column', () => {
  const p = Puzzle.fromAscii(['...', '...', '...']);
  const b = new Board(p, { autoX: false });
  const layout = computeLayout(p, region);
  const plain = new Framebuffer(200, 200);
  drawBoard(plain, b, layout, null);
  const hi = new Framebuffer(200, 200);
  drawBoard(hi, b, layout, { x: 1, y: 1 });
  // A cell in the active row (but not the cursor cell) should differ under the wash.
  const cx = layout.gridX + 0 * layout.cell + 3;
  const cy = layout.gridY + 1 * layout.cell + 3;
  assert.notDeepEqual(hi.getPixel(cx, cy), plain.getPixel(cx, cy));
});
