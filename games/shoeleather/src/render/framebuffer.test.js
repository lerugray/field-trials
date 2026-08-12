import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer, rgba } from './framebuffer.js';

test('rgba clamps to bytes', () => {
  assert.deepEqual(rgba(-5, 300, 128), [0, 255, 128, 255]);
  assert.deepEqual(rgba(1.6, 1.4, 0, 10), [2, 1, 0, 10]);
});

test('rejects bad dims', () => {
  assert.throws(() => new Framebuffer(0, 10), /positive integers/);
  assert.throws(() => new Framebuffer(10, 2.5), /positive integers/);
});

test('clear fills every pixel', () => {
  const fb = new Framebuffer(3, 2);
  fb.clear(rgba(10, 20, 30, 255));
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    assert.deepEqual(fb.getPixel(x, y), [10, 20, 30, 255]);
  }
});

test('setPixel opaque writes, out of bounds is a no-op', () => {
  const fb = new Framebuffer(2, 2);
  fb.setPixel(1, 1, rgba(255, 0, 0));
  assert.deepEqual(fb.getPixel(1, 1), [255, 0, 0, 255]);
  fb.setPixel(5, 5, rgba(0, 255, 0)); // clipped, no throw
  assert.equal(fb.getPixel(5, 5), null);
});

test('setPixel alpha blends source-over', () => {
  const fb = new Framebuffer(1, 1);
  fb.clear(rgba(0, 0, 0, 255));
  fb.setPixel(0, 0, rgba(255, 255, 255, 128));
  const [r, g, b, a] = fb.getPixel(0, 0);
  assert.ok(r > 120 && r < 135, `expected ~128 got ${r}`);
  assert.equal(a, 255);
});

test('fillRect clips to bounds', () => {
  const fb = new Framebuffer(4, 4);
  fb.fillRect(-2, -2, 4, 4, rgba(9, 9, 9)); // covers (0,0)..(1,1)
  assert.deepEqual(fb.getPixel(0, 0), [9, 9, 9, 255]);
  assert.deepEqual(fb.getPixel(1, 1), [9, 9, 9, 255]);
  assert.deepEqual(fb.getPixel(2, 2), [0, 0, 0, 0]);
});

test('fillRect with zero/negative area is a no-op', () => {
  const fb = new Framebuffer(4, 4);
  fb.fillRect(1, 1, 0, 5, rgba(1, 2, 3));
  assert.deepEqual(fb.getPixel(1, 1), [0, 0, 0, 0]);
});

test('strokeRect draws a hollow outline', () => {
  const fb = new Framebuffer(5, 5);
  fb.strokeRect(0, 0, 5, 5, rgba(7, 7, 7));
  assert.deepEqual(fb.getPixel(0, 0), [7, 7, 7, 255]); // corner
  assert.deepEqual(fb.getPixel(4, 4), [7, 7, 7, 255]); // corner
  assert.deepEqual(fb.getPixel(2, 2), [0, 0, 0, 0]);    // interior empty
});

test('blit copies with clipping', () => {
  const dst = new Framebuffer(4, 4);
  const src = new Framebuffer(2, 2);
  src.clear(rgba(5, 6, 7));
  dst.blit(src, 3, 3); // only (3,3) lands
  assert.deepEqual(dst.getPixel(3, 3), [5, 6, 7, 255]);
  assert.deepEqual(dst.getPixel(0, 0), [0, 0, 0, 0]);
});

test('upscale by integer factor is nearest-neighbour crisp', () => {
  const fb = new Framebuffer(2, 1);
  fb.setPixel(0, 0, rgba(10, 0, 0));
  fb.setPixel(1, 0, rgba(0, 20, 0));
  const up = fb.upscale(3);
  assert.equal(up.width, 6);
  assert.equal(up.height, 3);
  // left source pixel replicated 3x3
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    assert.deepEqual(up.getPixel(x, y), [10, 0, 0, 255]);
  }
  // right source pixel replicated 3x3
  for (let y = 0; y < 3; y++) for (let x = 3; x < 6; x++) {
    assert.deepEqual(up.getPixel(x, y), [0, 20, 0, 255]);
  }
});

test('upscale factor 1 clones', () => {
  const fb = new Framebuffer(2, 2);
  fb.clear(rgba(3, 3, 3));
  const up = fb.upscale(1);
  assert.notEqual(up, fb);
  assert.deepEqual(up.getPixel(0, 0), [3, 3, 3, 255]);
  up.setPixel(0, 0, rgba(9, 9, 9));
  assert.deepEqual(fb.getPixel(0, 0), [3, 3, 3, 255]); // independent buffer
});

test('upscale rejects bad factor', () => {
  const fb = new Framebuffer(2, 2);
  assert.throws(() => fb.upscale(0), /positive integer/);
  assert.throws(() => fb.upscale(1.5), /positive integer/);
});
