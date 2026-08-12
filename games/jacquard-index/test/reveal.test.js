import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { drawReveal, revealLayout, cellCenter, isClothAt } from '../src/render/reveal.js';
import { starterPuzzles } from '../src/content/starter.js';

const region = { x: 0, y: 0, w: 240, h: 240 };

// THE BINDING ASSERTION (studio amendment): the woven render must match the solution grid
// cell-for-cell. Never eyeball-only.
test('woven reveal is pixel-checked against the solution grid, every cell', () => {
  for (const motif of starterPuzzles()) {
    const p = motif.puzzle;
    const fb = new Framebuffer(240, 240);
    const layout = drawReveal(fb, p, region);
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const { px, py } = cellCenter(layout, x, y);
        const cloth = isClothAt(fb, px, py);
        assert.equal(cloth, !!p.at(x, y), `${motif.id} cell (${x},${y}) render != solution`);
      }
    }
  }
});

test('revealLayout centers the picture and sizes cells', () => {
  const p = Puzzle.fromAscii(['##', '##']);
  const l = revealLayout(p, region);
  assert.ok(l.cell >= 3);
  assert.equal(l.totalW, l.cell * 2);
  assert.ok(l.gridX >= region.x);
});

test('filled cloth reads blue-biased; ground reads warm', () => {
  const p = Puzzle.fromAscii(['#.', '.#']);
  const fb = new Framebuffer(240, 240);
  const layout = drawReveal(fb, p, region);
  const filled = cellCenter(layout, 0, 0);
  const empty = cellCenter(layout, 1, 0);
  assert.ok(isClothAt(fb, filled.px, filled.py));
  assert.ok(!isClothAt(fb, empty.px, empty.py));
});

test('reveal fills its region opaquely (a finished picture, no gaps)', () => {
  const p = Puzzle.fromAscii(['#.#', '.#.', '#.#']);
  const fb = new Framebuffer(240, 240);
  const layout = drawReveal(fb, p, region);
  // Sample across the cloth region: every pixel opaque.
  for (let yy = 0; yy < layout.totalH; yy += 7) {
    for (let xx = 0; xx < layout.totalW; xx += 7) {
      assert.equal(fb.getPixel(layout.gridX + xx, layout.gridY + yy)[3], 255);
    }
  }
});
