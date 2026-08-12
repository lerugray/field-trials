// M12 F3 — town render differentiation. A per-service door glyph (also the interior
// header silhouette) and a per-archetype texture offset that varies the wall/street
// dither PATTERN (grayscale, never a hue). Pure lookups drive the render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceGlyph, archetypeTexture, SERVICE_GLYPH, SERVICES, ARCHETYPES } from '../src/engine/city.js';

test('every service has a distinct door glyph', () => {
  const glyphs = SERVICES.map(serviceGlyph);
  for (const s of SERVICES) assert.ok(serviceGlyph(s) && serviceGlyph(s) !== '·', `${s} has a glyph`);
  assert.equal(new Set(glyphs).size, SERVICES.length, 'glyphs are distinct per service');
  assert.equal(serviceGlyph('nonexistent'), '·', 'unknown service falls back gracefully');
});

test('every archetype textures the town differently', () => {
  const offsets = ARCHETYPES.map(archetypeTexture);
  assert.equal(new Set(offsets).size, ARCHETYPES.length, 'each archetype has a distinct texture offset');
  for (const o of offsets) assert.ok(Number.isInteger(o) && o >= 0, 'a valid uint32 dither offset');
  // an unknown archetype still yields a stable offset (no throw)
  assert.ok(Number.isInteger(archetypeTexture('unknown')));
});
