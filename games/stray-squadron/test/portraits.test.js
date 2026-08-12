// The memorial-cast portraits — the recognizability SPEC (hard rules 6 + 7) lives in
// the descriptors, so we can guard it headless: each portrait must carry the species
// markers that make it read as THAT animal (a beagle, a grey tabby, a brown poodle),
// its palette must be in the right colour family, and the drawing must actually run
// against a 2D context without throwing and issue real draw work (not an empty face).
//
// We can't judge "does it look like the real Cuckoo" in code — that is the operator's
// eye + the committed proof screenshot. These are the mechanical floors under it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PORTRAITS, PORTRAIT_KEYS, drawPortrait } from '../src/gfx/portraits.js';

// A recording stub of a CanvasRenderingContext2D: every method is a no-op counter,
// every property a settable field. Lets us run the real draw code headless.
function stubCtx() {
  const calls = { fill: 0, stroke: 0, beginPath: 0, ellipse: 0, moveTo: 0, lineTo: 0 };
  const fills = new Set();
  const handler = {
    get(_t, prop) {
      if (prop === '_calls') return calls;
      if (prop === '_fills') return fills;
      if (prop === 'fillStyle' || prop === 'strokeStyle') return handler._fs;
      return (...args) => {
        if (prop in calls) calls[prop]++;
        return undefined;
      };
    },
    set(_t, prop, val) {
      if (prop === 'fillStyle') fills.add(String(val).toLowerCase());
      handler[prop === 'fillStyle' || prop === 'strokeStyle' ? '_fs' : prop] = val;
      return true;
    },
  };
  return new Proxy({}, handler);
}

test('there are exactly the three memorial cast members, no more no fewer', () => {
  assert.deepEqual(PORTRAIT_KEYS.sort(), ['cuckoo', 'kirby', 'leon']);
});

test('Cuckoo reads as a tricolor beagle', () => {
  const c = PORTRAITS.cuckoo;
  assert.equal(c.species, 'beagle');
  for (const f of ['floppyEars', 'tricolorSaddle', 'muzzleBlaze', 'blackNose'])
    assert.ok(c.features.includes(f), 'beagle missing marker: ' + f);
  // tricolor: a white, a tan, and a dark all present
  assert.ok(c.palette.white && c.palette.tan && c.palette.dark);
});

test('Leon reads as a grey tabby with green eyes and white whiskers', () => {
  const l = PORTRAITS.leon;
  assert.equal(l.species, 'grey-tabby-cat');
  for (const f of ['uprightEars', 'tabbyM', 'greenEyes', 'whiteChin', 'whiteWhiskers'])
    assert.ok(l.features.includes(f), 'tabby missing marker: ' + f);
  // the eye is a green (dominant green channel)
  const eye = l.palette.eye;
  const g = parseInt(eye.slice(3, 5), 16), r = parseInt(eye.slice(1, 3), 16), b = parseInt(eye.slice(5, 7), 16);
  assert.ok(g > r && g > b, 'Leon eye is not green: ' + eye);
});

test('Kirby reads as a curly brown toy poodle', () => {
  const k = PORTRAITS.kirby;
  assert.equal(k.species, 'toy-poodle');
  for (const f of ['curlyCoat', 'topknot', 'fluffyEars', 'darkNose'])
    assert.ok(k.features.includes(f), 'poodle missing marker: ' + f);
  // coat is a warm brown: red channel dominant, and not near-white
  const coat = k.palette.coat;
  const r = parseInt(coat.slice(1, 3), 16), g = parseInt(coat.slice(3, 5), 16), b = parseInt(coat.slice(5, 7), 16);
  assert.ok(r > g && g > b, 'Kirby coat is not a warm brown: ' + coat);
  assert.ok(r < 240, 'Kirby coat is too pale to read as brown');
});

test('every portrait renders headless without throwing and does real draw work', () => {
  for (const key of PORTRAIT_KEYS) {
    const x = stubCtx();
    assert.doesNotThrow(() => drawPortrait(x, key, 128), 'threw drawing ' + key);
    const c = x._calls;
    // a real face: many fills, several distinct colours, eyes (ellipses), a mouth (stroke)
    assert.ok(c.fill > 8, key + ' issued too few fills to be a real portrait');
    assert.ok(c.ellipse >= 2, key + ' has no ellipse work (eyes/nose)');
    assert.ok(c.stroke >= 1, key + ' has no stroked detail');
    assert.ok(x._fills.size >= 4, key + ' uses too few colours to be recognizable');
  }
});

test('an unknown portrait key is a safe no-op, never a throw', () => {
  const x = stubCtx();
  assert.equal(drawPortrait(x, 'joey', 128), false, 'Joey is never a game character (hard rule 7)');
});
