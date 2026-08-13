import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDisplayFit, pointerToNative, presentBackingSize, NATIVE_W, NATIVE_H,
} from '../src/layout.js';

const VIEWPORTS = [
  [1512, 982],
  [1920, 1080],
  [2560, 1440],
  [1100, 700],
  [800, 500],
];

function fitAxisFill(f) {
  return Math.max(f.fillW, f.fillH);
}

test('fractional-crisp: fit axis fills >=0.99 at common desktop sizes', () => {
  for (const [w, h] of VIEWPORTS) {
    const f = computeDisplayFit(w, h);
    const axis = fitAxisFill(f);
    assert.ok(axis >= 0.99, `${w}x${h} fit-axis fill ${axis} < 0.99 (fillW=${f.fillW} fillH=${f.fillH})`);
    assert.ok(f.fillW <= 1 + 1e-9 && f.fillH <= 1 + 1e-9, `${w}x${h} overflow`);
    assert.ok(Math.abs(f.cssW - NATIVE_W * f.scale) < 1e-9);
    assert.ok(Math.abs(f.cssH - NATIVE_H * f.scale) < 1e-9);
    assert.ok(Math.abs(f.cssW - w) < 1e-6 || Math.abs(f.cssH - h) < 1e-6, `${w}x${h} neither axis filled`);
    assert.ok(Math.abs(f.offX - (w - f.cssW) / 2) < 1e-9);
    assert.ok(Math.abs(f.offY - (h - f.cssH) / 2) < 1e-9);
  }
});

test('1512x982 fills width; 1920x1080 and 2560x1440 fill height', () => {
  const a = computeDisplayFit(1512, 982);
  assert.ok(Math.abs(a.cssW - 1512) < 1e-6);
  assert.ok(a.cssH < 982);
  assert.ok(a.offY > 0);

  const b = computeDisplayFit(1920, 1080);
  assert.ok(Math.abs(b.cssH - 1080) < 1e-6);
  assert.ok(b.cssW < 1920);

  const c = computeDisplayFit(2560, 1440);
  assert.ok(Math.abs(c.cssH - 1440) < 1e-6);
  assert.ok(c.cssW < 2560);
});

test('800x500 is an exact 2.5x fill; 1100x700 fills width', () => {
  const a = computeDisplayFit(800, 500);
  assert.ok(Math.abs(a.scale - 2.5) < 1e-9);
  assert.equal(a.fillW, 1);
  assert.equal(a.fillH, 1);

  const b = computeDisplayFit(1100, 700);
  assert.ok(Math.abs(b.cssW - 1100) < 1e-6);
  assert.ok(b.fillH >= 0.99 || b.fillW >= 0.99);
});

test('exact integer window (1280x800): 4x, no letterbox', () => {
  const f = computeDisplayFit(1280, 800);
  assert.equal(f.scale, 4);
  assert.equal(f.integer, true);
  assert.equal(f.cssW, 1280);
  assert.equal(f.cssH, 800);
  assert.equal(f.offX, 0);
  assert.equal(f.offY, 0);
});

test('tiny window below native: fractional downscale (no clip)', () => {
  const f = computeDisplayFit(200, 100);
  assert.ok(f.scale < 1);
  assert.ok(f.cssW <= 200 + 1e-6);
  assert.ok(f.cssH <= 100 + 1e-6);
});

test('pointerToNative remaps through the live blit scale', () => {
  const f = computeDisplayFit(1512, 982);
  const p = pointerToNative(f.offX + 0.5 * f.scale, f.offY + 0.5 * f.scale, f.offX, f.offY, f.scale);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9);
  assert.ok(Math.abs(p.y - 0.5) < 1e-9);
});

test('present backing store snaps to integer device pixels', () => {
  const f = computeDisplayFit(1512, 982);
  const dpr2 = presentBackingSize(f.cssW, f.cssH, 2);
  assert.equal(dpr2.bw, Math.round(f.cssW * 2));
  assert.equal(dpr2.bh, Math.round(f.cssH * 2));
  assert.ok(Number.isInteger(dpr2.bw) && Number.isInteger(dpr2.bh));
  const odd = presentBackingSize(1100, 687.5, 1.25);
  assert.ok(Number.isInteger(odd.bw) && Number.isInteger(odd.bh));
});
