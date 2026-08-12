import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from './framebuffer.js';
import { paintPortrait, PORTRAIT_PROFILES, PORTRAIT_ART_PASSES } from './portrait.js';

const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

function paint(posture) {
  const fb = new Framebuffer(80, 100);
  paintPortrait(fb, { posture });
  return fb;
}

test('paints every pixel opaquely (no bare buffer)', () => {
  const fb = paint('open');
  for (let y = 0; y < 100; y += 9) for (let x = 0; x < 80; x += 9) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('posture visibly changes the portrait (diegetic tell, not a number)', () => {
  const open = paint('open');
  const hostile = paint('hostile');
  let diff = 0;
  for (let i = 0; i < open.data.length; i += 4) if (open.data[i] !== hostile.data[i]) diff++;
  assert.ok(diff > 100, `postures should differ visibly, only ${diff} px differed`);
});

test('all four postures render distinctly', () => {
  const sigs = ['open', 'guarded', 'defensive', 'hostile'].map((p) => {
    const fb = paint(p);
    let s = 0; for (let i = 0; i < fb.data.length; i += 16) s += fb.data[i];
    return s;
  });
  assert.equal(new Set(sigs).size, 4, 'each posture should produce a distinct image');
});

test('unknown posture falls back to open without throwing', () => {
  assert.doesNotThrow(() => paint('bewildered'));
});

test('person-specific portraits have distinct painted identities at one posture', () => {
  const signatures = Object.keys(PORTRAIT_PROFILES).map((personId) => {
    const fb = new Framebuffer(80, 100); paintPortrait(fb, { posture: 'open', personId });
    let hash = 2166136261; for (const byte of fb.data) { hash ^= byte; hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  });
  assert.equal(new Set(signatures).size, Object.keys(PORTRAIT_PROFILES).length);
  assert.equal(new Set(Object.values(PORTRAIT_PROFILES).map((p) => p.prop)).size, 4, 'each identity needs one own prop/highlight');
});

test('every named portrait carries posture/expression variants', () => {
  for (const personId of Object.keys(PORTRAIT_PROFILES)) {
    const open = new Framebuffer(80, 100), hostile = new Framebuffer(80, 100);
    paintPortrait(open, { posture: 'open', personId }); paintPortrait(hostile, { posture: 'hostile', personId });
    let diff = 0; for (let i = 0; i < open.data.length; i += 4) if (open.data[i] !== hostile.data[i]) diff++;
    assert.ok(diff > 100, `${personId} posture variant is not visibly distinct`);
  }
});

test('portrait quality gate names and preserves the four-pass painted method', () => {
  assert.deepEqual(PORTRAIT_ART_PASSES, ['silhouette', 'palette-material', 'scene-light', 'expression-read']);
  for (const profile of Object.values(PORTRAIT_PROFILES)) {
    assert.ok(profile.hairStyle && profile.collar && Number.isInteger(profile.seed));
  }
});

test('every hostile portrait remains face-readable at confrontation darkness', () => {
  for (const personId of Object.keys(PORTRAIT_PROFILES)) {
    const fb = new Framebuffer(80, 100); paintPortrait(fb, { posture: 'hostile', personId });
    const face = [], darkBackdrop = [];
    for (let y = 20; y < 55; y++) for (let x = 24; x < 56; x++) face.push(lum(fb.getPixel(x, y)));
    for (let y = 5; y < 20; y++) for (let x = 58; x < 76; x++) darkBackdrop.push(lum(fb.getPixel(x, y)));
    const average = (xs) => xs.reduce((sum, n) => sum + n, 0) / xs.length;
    assert.ok(average(face) > average(darkBackdrop) + 30, `${personId} face must read against the dark card room`);
  }
});

test('every portrait costume has material/value variation, not a flat shape', () => {
  for (const personId of Object.keys(PORTRAIT_PROFILES)) {
    const fb = new Framebuffer(80, 100); paintPortrait(fb, { posture: 'open', personId });
    const colors = new Set(), values = [];
    for (let y = 70; y < 95; y++) for (let x = 20; x < 60; x++) {
      const p = fb.getPixel(x, y); colors.add(p.slice(0, 3).join(',')); values.push(lum(p));
    }
    assert.ok(colors.size > 80, `${personId} costume needs cloth/dither variation`);
    assert.ok(Math.max(...values) - Math.min(...values) > 35, `${personId} costume needs coherent light/shadow range`);
  }
});
