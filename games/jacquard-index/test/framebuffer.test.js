import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';

test('Framebuffer allocates RGBA storage sized to dimensions', () => {
  const fb = new Framebuffer(4, 3);
  assert.equal(fb.width, 4);
  assert.equal(fb.height, 3);
  assert.equal(fb.data.length, 4 * 3 * 4);
});

test('Framebuffer rejects non-positive dimensions', () => {
  assert.throws(() => new Framebuffer(0, 10));
  assert.throws(() => new Framebuffer(10, -1));
});

test('clear fills every pixel with the given color', () => {
  const fb = new Framebuffer(2, 2);
  fb.clear(10, 20, 30, 40);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      assert.deepEqual(fb.getPixel(x, y), [10, 20, 30, 40]);
    }
  }
});

test('setPixel stores an opaque pixel exactly', () => {
  const fb = new Framebuffer(3, 3);
  fb.setPixel(1, 2, 255, 128, 0);
  assert.deepEqual(fb.getPixel(1, 2), [255, 128, 0, 255]);
});

test('setPixel out of bounds is a no-op, not a throw', () => {
  const fb = new Framebuffer(2, 2);
  fb.setPixel(-1, 0, 255, 255, 255);
  fb.setPixel(0, 5, 255, 255, 255);
  assert.deepEqual(fb.getPixel(0, 0), [0, 0, 0, 0]);
});

test('reads outside the buffer are transparent black', () => {
  const fb = new Framebuffer(2, 2);
  assert.deepEqual(fb.getPixel(9, 9), [0, 0, 0, 0]);
});

test('setPixel composites source-over for partial alpha', () => {
  const fb = new Framebuffer(1, 1);
  fb.clear(0, 0, 0, 255);       // opaque black ground
  fb.setPixel(0, 0, 255, 255, 255, 128); // ~50% white over it
  const [r, g, b, a] = fb.getPixel(0, 0);
  assert.equal(a, 255);
  // Halfway blend lands near mid-grey; allow rounding slack.
  assert.ok(r > 120 && r < 135, `expected ~128, got ${r}`);
  assert.equal(r, g);
  assert.equal(g, b);
});

test('fillRect clips to the buffer edges', () => {
  const fb = new Framebuffer(4, 4);
  fb.fillRect(2, 2, 10, 10, 100, 100, 100); // overhangs bottom-right
  assert.deepEqual(fb.getPixel(3, 3), [100, 100, 100, 255]);
  assert.deepEqual(fb.getPixel(1, 1), [0, 0, 0, 0]); // untouched
});

test('strokeRect draws only the border', () => {
  const fb = new Framebuffer(5, 5);
  fb.strokeRect(0, 0, 5, 5, 200, 0, 0);
  assert.deepEqual(fb.getPixel(0, 0), [200, 0, 0, 255]); // corner
  assert.deepEqual(fb.getPixel(4, 4), [200, 0, 0, 255]); // opposite corner
  assert.deepEqual(fb.getPixel(2, 2), [0, 0, 0, 0]);     // interior untouched
});

test('blit composites one framebuffer onto another with offset', () => {
  const bg = new Framebuffer(4, 4);
  bg.clear(0, 0, 0, 255);
  const tile = new Framebuffer(2, 2);
  tile.clear(255, 0, 0, 255);
  bg.blit(tile, 1, 1);
  assert.deepEqual(bg.getPixel(1, 1), [255, 0, 0, 255]);
  assert.deepEqual(bg.getPixel(2, 2), [255, 0, 0, 255]);
  assert.deepEqual(bg.getPixel(0, 0), [0, 0, 0, 255]); // outside the tile
});
