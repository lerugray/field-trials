// artgate.test.js — THE ART IDIOM GATE (DESIGN-SEED M6). Every bound cell must be
// grid-aligned + in-bounds against the real sheet dimensions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { cellOk, checkIdiom } from '../src/artgate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Read a PNG's [width,height] straight from the IHDR (bytes 16..24).
function pngDims(rel) { const b = readFileSync(resolve(ROOT, rel)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

const DIMS = {
  iconset: pngDims("materials/art-packs/Willibab-s-Retro-Icons/Willibab's Retro Icons/Willibab's Retro Icons/Iconset.png"),
  overworld: pngDims('materials/art-packs/WILLIBAB_OVERWORLD/WILLIBAB_OVERWORLD/Tileset 1x/OW_A2.png'),
  town: pngDims('materials/art-packs/WILLIBAB_TOWN/WILLIBAB_TOWN/Tileset/TOWNS_ALL_1x.png'),
  battler: [1296, 864], // sv_actors sheet (manifest §Battlers, confirmed)
};

test('cellOk enforces grid-alignment, bounds, and a confirmed grid', () => {
  assert.equal(cellOk(0, 0, 16, 256, 256), true);
  assert.equal(cellOk(15, 15, 16, 256, 256), true, 'last cell fits');
  assert.equal(cellOk(16, 0, 16, 256, 256), false, 'out of bounds');
  assert.equal(cellOk(0, 0, 16, 250, 256), false, 'non-multiple width → grid not confirmed');
});

test('the actual sheets are exact multiples of their frame edges', () => {
  assert.equal(DIMS.iconset[0] % 32, 0); assert.equal(DIMS.iconset[1] % 32, 0);
  assert.equal(DIMS.overworld[0] % 16, 0); assert.equal(DIMS.overworld[1] % 16, 0);
  assert.equal(DIMS.town[0] % 16, 0); assert.equal(DIMS.town[1] % 16, 0);
  assert.equal(DIMS.battler[0] % 144, 0); assert.equal(DIMS.battler[1] % 144, 0);
});

test('every art binding is idiom-correct against the real sheet dimensions', () => {
  const r = checkIdiom(DIMS);
  assert.deepEqual(r.fails, [], 'no off-grid / out-of-bounds bindings');
  assert.ok(r.ok && r.checked >= 11, `checked ${r.checked} bindings`);
});
