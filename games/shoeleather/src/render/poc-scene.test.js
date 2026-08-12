import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from './framebuffer.js';
import { paintPocScene, lum } from './poc-scene.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

function render() {
  const fb = new Framebuffer(LOGICAL_W, LOGICAL_H);
  const meta = paintPocScene(fb);
  return { fb, meta };
}

test('fills every pixel opaquely (single composed picture, no bare buffer)', () => {
  const { fb } = render();
  for (let y = 0; y < LOGICAL_H; y += 11) for (let x = 0; x < LOGICAL_W; x += 11) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('the desk-lamp rig lights its pool brighter than the far corner', () => {
  const { fb, meta } = render();
  const nearLamp = fb.getPixel(meta.lamp.x + 6, meta.lamp.y + 6);
  const farCorner = fb.getPixel(LOGICAL_W - 3, LOGICAL_H - 3);
  assert.ok(lum(nearLamp) > lum(farCorner), 'lamp pool should out-light the corner');
});

test('warm interior vs cool window (70s colour-script contrast)', () => {
  const { fb, meta } = render();
  const lampArea = fb.getPixel(meta.lamp.x, meta.lamp.y + 4); // warm shade
  assert.ok(lampArea[0] > lampArea[2], 'lamp should be warm (R > B)');
  // Scan the window interior for the cool night gaps between the slats.
  let coolFound = false;
  for (let y = meta.win.y + 3; y < meta.win.y + meta.win.h - 3 && !coolFound; y++) {
    for (let x = meta.win.x + 4; x < meta.win.x + meta.win.w - 4; x++) {
      const p = fb.getPixel(x, y);
      if (p[2] > p[0]) { coolFound = true; break; } // B > R: cool night light
    }
  }
  assert.ok(coolFound, 'window should carry cool night light in the slat gaps');
});

test('material is textured, not a flat fill (wall pixels vary)', () => {
  const { fb } = render();
  const a = fb.getPixel(30, 30), b = fb.getPixel(31, 30), c = fb.getPixel(30, 31);
  assert.ok(a[0] !== b[0] || a[0] !== c[0] || a[1] !== b[1], 'wall should carry fBm/dither texture');
});

test('deterministic (same seed -> identical frame)', () => {
  const a = new Framebuffer(64, 48); paintPocScene(a);
  const b = new Framebuffer(64, 48); paintPocScene(b);
  assert.deepEqual([...a.data], [...b.data]);
});
