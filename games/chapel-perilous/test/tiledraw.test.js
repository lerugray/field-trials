import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawArt, drawTile } from '../src/engine/tiledraw.js';
import { createTileArt } from '../src/engine/tileart.js';

// A minimal canvas-context stub that records fill operations.
function fakeCtx() {
  const rects = [];
  return {
    _rects: rects,
    set fillStyle(v) { this._fill = v; },
    get fillStyle() { return this._fill; },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this._fill }); },
  };
}

test('drawArt skips transparent pixels and paints the rest', () => {
  const grid = [
    [-1, 3],
    [5, -1],
  ];
  const ctx = fakeCtx();
  drawArt(ctx, grid, 0, 0, 10, (s) => `s${s}`);
  assert.equal(ctx._rects.length, 2); // two opaque pixels
  assert.deepEqual(ctx._rects.map((r) => r.fill).sort(), ['s3', 's5']);
});

test('drawArt positions pixels at px+col*cell, py+row*cell', () => {
  const grid = [[0, 1], [2, 3]];
  const ctx = fakeCtx();
  drawArt(ctx, grid, 100, 200, 8, (s) => s);
  const at = (x, y) => ctx._rects.find((r) => r.x === x && r.y === y);
  assert.ok(at(100, 200));       // 0,0
  assert.ok(at(108, 200));       // col 1
  assert.ok(at(100, 208));       // row 1
  assert.ok(at(108, 208));       // 1,1
});

test('drawTile fills a full opaque terrain tile with size/16 cells', () => {
  const ctx = fakeCtx();
  const grid = createTileArt().get('GRASS');
  drawTile(ctx, grid, 0, 0, 32, (s) => s);
  assert.equal(ctx._rects.length, 16 * 16); // opaque terrain = every pixel
  assert.equal(ctx._rects[0].w, 2);         // 32 / 16
});
