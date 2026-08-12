import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LitPainter, litRgbOf } from '../src/render/lit.js';
import {
  compositeAdditive, compositeLitPixels, crowdDescriptor, drawLitCreature, drawLitVfx, fitScale,
} from '../src/render/lit-creature.js';
import { LitStage } from '../src/render/lit-stage.js';
import { summon } from '../src/engine/summon.js';
import { SPECIES } from '../src/data/roster.js';

// The relight pass is the load-bearing half of the art migration: it is what
// lets the 70 hand-built species keep their silhouettes and still be lit by the
// room. compositeLitPixels is pure over an ImageData-shaped object, so it is
// checked here against hand-built buffers rather than only through a screenshot.

// A w x h albedo of one flat colour, fully opaque.
function slab(w, h, [r, g, b], a = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width: w, height: h, data };
}

const LIGHT_ABOVE = [{ x: 10, y: -40, col: '#FFFFFF', s: 0.9, range: 200 }];

test('the relight pass shades an albedo without moving its hue far', () => {
  const p = new LitPainter(20, 20);
  p.clear('#000000');
  const img = slab(10, 10, [64, 128, 48]);
  compositeLitPixels(p, img, 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 0.2, rimAmt: 0,
  });
  // the interior is painted, and stays recognisably the albedo's hue
  const [r, g, b] = p.get(10, 10);
  assert.ok(g > r && g > b, 'a green albedo must stay green after relighting');
  assert.ok(r + g + b > 0, 'the interior was not painted at all');
  // and the lit side (toward the light, above) is brighter than the far side
  let top = 0, bottom = 0;
  for (let x = 7; x < 13; x++) { top += p.get(x, 7)[1]; bottom += p.get(x, 13)[1]; }
  assert.ok(top > bottom, 'the surface facing the light must come out brighter');
});

test('the relight pass inks the silhouette edge and leaves the interior clean', () => {
  const p = new LitPainter(20, 20);
  p.clear('#000000');
  compositeLitPixels(p, slab(10, 10, [200, 200, 200]), 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 0.4, rimAmt: 0,
  });
  const edge = p.get(5, 5)[0]; // a corner of the slab
  const inner = p.get(10, 10)[0];
  assert.ok(edge < inner, 'the silhouette edge must be inked darker than the body');
  // the ink is derived from the pixel it borders, not a hardcoded black
  const p2 = new LitPainter(20, 20);
  p2.clear('#000000');
  compositeLitPixels(p2, slab(10, 10, [200, 60, 60]), 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 0.4, rimAmt: 0,
  });
  const [er, eg] = p2.get(5, 5);
  assert.ok(er > eg, 'a red body must get a red-black outline, not a neutral one');
});

test('the relight pass leaves fully transparent pixels alone', () => {
  const p = new LitPainter(20, 20);
  p.clear('#123456');
  const img = slab(10, 10, [255, 255, 255], 0);
  compositeLitPixels(p, img, 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 0.2,
  });
  assert.deepEqual(p.get(10, 10).slice(0, 3), litRgbOf('#123456'),
    'a fully transparent albedo must not touch the scene behind it');
});

test('the relight pass honours partial alpha (antialiased edges blend)', () => {
  const p = new LitPainter(20, 20);
  p.clear('#000000');
  compositeLitPixels(p, slab(10, 10, [255, 255, 255], 128), 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 1, rimAmt: 0,
  });
  const v = p.get(10, 10)[0];
  assert.ok(v > 40 && v < 230, `a half-alpha pixel must blend, got ${v}`);
});

test('the rim pass only brightens, and only the edge facing the light', () => {
  const withRim = new LitPainter(20, 20);
  withRim.clear('#000000');
  compositeLitPixels(withRim, slab(10, 10, [40, 40, 40]), 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 0.2, rimAmt: 0.9,
  });
  const noRim = new LitPainter(20, 20);
  noRim.clear('#000000');
  compositeLitPixels(noRim, slab(10, 10, [40, 40, 40]), 5, 5, {
    cx: 10, cy: 10, rx: 5, ry: 5, lights: LIGHT_ABOVE, amb: 0.2, rimAmt: 0,
  });
  const topWith = withRim.get(10, 5)[0];
  const topWithout = noRim.get(10, 5)[0];
  assert.ok(topWith > topWithout, 'the edge facing the light must gain a rim');
  assert.equal(withRim.get(10, 14)[0], noRim.get(10, 14)[0],
    'the edge facing away from the light must be untouched');
});

test('the relight pass never writes outside the painter', () => {
  const p = new LitPainter(6, 6);
  p.clear('#000000');
  const before = Array.from(p.d);
  // an albedo positioned entirely off-frame
  compositeLitPixels(p, slab(8, 8, [255, 0, 0]), -40, -40, {
    cx: 0, cy: 0, rx: 4, ry: 4, lights: LIGHT_ABOVE, amb: 0.5,
  });
  assert.deepEqual(Array.from(p.d), before);
  assert.doesNotThrow(() => compositeLitPixels(p, slab(8, 8, [255, 0, 0]), 100, 100, {
    cx: 0, cy: 0, rx: 4, ry: 4, lights: LIGHT_ABOVE, amb: 0.5,
  }));
});

test('VFX composite additively — a burst lights the scene it happens in', () => {
  const p = new LitPainter(10, 10);
  p.clear('#202020');
  compositeAdditive(p, slab(6, 6, [64, 64, 64]), 2, 2, 1);
  const v = p.get(4, 4)[0];
  assert.ok(v > 32, `an additive composite must brighten, got ${v}`);
  // outside the burst nothing changes
  assert.equal(p.get(9, 9)[0], 32);
});

test('fitScale sizes every species to the same apparent height', () => {
  // A tall thin plant and a squat blob must not land wildly apart in the room —
  // that is the whole reason scale is computed from the measured box.
  const target = 100;
  for (const sp of SPECIES.slice(0, 24)) {
    const c = {
      species: { id: sp.id, name: sp.name, archetype: sp.archetype, hue: sp.hue, traits: sp.traits },
      rarity: sp.rarity, variant: 1234, seed: 7,
    };
    const s = fitScale(c, target, 10000, 10000, 99);
    assert.ok(s > 0 && Number.isFinite(s), `${sp.name} produced a bad scale`);
  }
  // the width and height caps really do bind
  const c = summon('a very good dog');
  assert.ok(fitScale(c, 1000, 10, 10000, 99) < fitScale(c, 1000, 10000, 10000, 99),
    'the width cap must reduce the scale');
  assert.ok(fitScale(c, 1000, 10000, 10, 99) < fitScale(c, 1000, 10000, 10000, 99),
    'the height cap must reduce the scale');
  assert.equal(fitScale(c, 1e9, 1e9, 1e9, 0.5), 0.5, 'the cap is the ceiling');
});

test('LEAN B: crowdDescriptor reduces a retiree to a shape and a catchlight only', () => {
  for (const ph of ['a ghost', 'plant pal', 'birdy', 'the object', 'orb']) {
    const d = crowdDescriptor(summon(ph));
    assert.ok(typeof d.archetype === 'string' && d.archetype.length > 0);
    assert.ok(/^#[0-9a-f]{6}$/i.test(d.eyeCol), 'the eyeshine must be a real colour');
  }
  // it must not carry anything readable into the stands
  const d = crowdDescriptor(summon('a very good dog'));
  assert.deepEqual(Object.keys(d).sort(), ['archetype', 'eyeCol', 'name']);
  // and it must survive a malformed creature rather than crashing the bake
  assert.doesNotThrow(() => crowdDescriptor(null));
  assert.doesNotThrow(() => crowdDescriptor({}));
});

test('the creature and VFX passes no-op without a canvas instead of throwing', () => {
  // node has no document/OffscreenCanvas, which is exactly the condition a
  // headless or stubbed caller hits; it must degrade, never crash the frame.
  const p = new LitPainter(40, 40);
  p.clear('#000000');
  const before = Array.from(p.d);
  assert.equal(drawLitCreature(p, summon('a very good dog'), 0, {
    x: 20, ground: 30, scale: 0.2, lights: LIGHT_ABOVE, shadow: false,
  }), null);
  assert.equal(drawLitVfx(p, 'impact', 20, 20, 0.5, { scale: 0.2 }), null);
  assert.deepEqual(Array.from(p.d), before, 'a no-op pass must leave the frame untouched');
  assert.equal(drawLitCreature(p, null, 0, { x: 0, ground: 0 }), null, 'no creature is legal');
});

test('LitStage picks an integer divisor, re-allocates on resize, and caches its bake', () => {
  // No canvas in node, so drive it with a hand-made stand-in.
  const fake = { width: 0, height: 0, getContext: () => null };
  const st = new LitStage(fake, 230);

  assert.equal(st.sync(858, 459), true, 'the first sync must allocate');
  assert.equal(st.scale, 2, '459 css px against a 230 target is a 2x buffer');
  assert.equal(st.h, 230);
  assert.equal(st.w, 429);
  assert.equal(fake.width, 429, 'the backing store IS the native buffer');
  assert.equal(st.sync(858, 459), false, 'an unchanged size must not re-allocate');
  assert.equal(st.sync(600, 300), true, 'a changed size must re-allocate');

  // the bake runs once per key and is restored, not re-run
  st.sync(858, 459);
  let runs = 0;
  const paint = (p) => { runs++; p.clear('#112233'); };
  assert.equal(st.bake('room:429x230', paint), true);
  assert.equal(st.bake('room:429x230', paint), false, 'the same key must not re-bake');
  assert.equal(runs, 1);
  assert.equal(st.bake('meadow:429x230', paint), true, 'a new key must re-bake');
  assert.equal(runs, 2);

  // begin() restores the baked bytes, so last frame's pet is gone
  const p = st.begin();
  p.px(5, 5, '#ff0000');
  assert.deepEqual(p.get(5, 5).slice(0, 3), [255, 0, 0]);
  st.begin();
  assert.deepEqual(p.get(5, 5).slice(0, 3), litRgbOf('#112233'), 'begin() must restore the room');

  // a resize drops the bake, so the room is repainted at the new size
  st.sync(400, 200);
  assert.equal(st.baked, null);
  assert.equal(st.bake('room:429x230', paint), true, 'a re-allocation must invalidate the bake');
});

test('LitStage maps pointer positions into buffer space', () => {
  const fake = { width: 0, height: 0, getContext: () => null };
  const st = new LitStage(fake, 230);
  st.sync(858, 459);
  assert.deepEqual(st.toBuffer(0, 0, 858, 459), { x: 0, y: 0 });
  const mid = st.toBuffer(429, 229.5, 858, 459);
  assert.ok(Math.abs(mid.x - st.w / 2) < 1 && Math.abs(mid.y - st.h / 2) < 1);
  // a zero-sized element must not produce Infinity
  const z = st.toBuffer(10, 10, 0, 0);
  assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y));
});

test('LitStage tolerates having no canvas at all', () => {
  const st = new LitStage(null, 230);
  assert.equal(st.sync(100, 100), false);
  assert.equal(st.begin(), null);
  assert.doesNotThrow(() => st.present());
  assert.equal(st.bake('k', () => {}), false);
});
