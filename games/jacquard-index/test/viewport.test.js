import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  integerViewport, fillViewport, coverage, screenToNative,
} from '../src/engine/viewport.js';

test('integerViewport picks the largest integer scale that fits', () => {
  // 640x360 base into 1280x800: min(1280/640, 800/360)=min(2,2.22)=2
  const vp = integerViewport(1280, 800, 640, 360);
  assert.equal(vp.scale, 2);
  assert.equal(vp.dispW, 1280);
  assert.equal(vp.dispH, 720);
  assert.equal(vp.offX, 0);
  assert.equal(vp.offY, 40); // (800-720)/2 centered letterbox
});

test('integerViewport at 2560x1440 fills exactly at x4', () => {
  const vp = integerViewport(2560, 1440, 640, 360);
  assert.equal(vp.scale, 4);
  assert.equal(vp.dispW, 2560);
  assert.equal(vp.dispH, 1440);
  assert.equal(coverage(vp, 2560, 1440), 1);
});

test('integerViewport never goes below scale 1', () => {
  const vp = integerViewport(320, 180, 640, 360);
  assert.equal(vp.scale, 1);
});

test('fillViewport allows fractional scale for screen fill', () => {
  const vp = fillViewport(1280, 800, 640, 360);
  // min(2, 2.222) = 2 -> here it is still integer; check a case that is not:
  const vp2 = fillViewport(1300, 900, 640, 360);
  assert.ok(vp2.scale > 2 && vp2.scale < 3);
  assert.ok(vp2.fractional);
  // Coverage should beat the integer viewport for the same window.
  const ivp = integerViewport(1300, 900, 640, 360);
  assert.ok(coverage(vp2, 1300, 900) > coverage(ivp, 1300, 900));
});

test('screenToNative inverts the scale + offset', () => {
  const vp = integerViewport(1280, 800, 640, 360); // scale 2, offY 40
  const p = screenToNative(vp, 100, 240); // (100-0)/2=50, (240-40)/2=100
  assert.deepEqual([p.x, p.y], [50, 100]);
  assert.ok(p.inside);
});

test('screenToNative flags points in the letterbox as outside', () => {
  const vp = integerViewport(1280, 800, 640, 360); // offY 40 margin
  const p = screenToNative(vp, 100, 10); // above the frame
  assert.ok(!p.inside);
});
