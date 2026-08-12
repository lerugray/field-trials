import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRailField, TUNNEL_CLEAR } from '../src/gfx/railfield.js';
import { railPos } from '../src/flight/rail.js';

test('same seed lays out the identical rail field', () => {
  const a = createRailField('run-3', 300);
  const b = createRailField('run-3', 300);
  assert.deepEqual([...a.positions], [...b.positions]);
});

test('different seeds differ', () => {
  const a = createRailField('run-3', 300);
  const b = createRailField('run-4', 300);
  assert.notDeepEqual([...a.positions], [...b.positions]);
});

test('field is non-empty', () => {
  const g = createRailField('run-3', 300);
  assert.ok(g.triCount > 100, `triCount=${g.triCount}`);
});

test('the ship tunnel stays clear: no debris center hugs the rail centerline', () => {
  const g = createRailField('run-3', 300);
  // Dense rail polyline over the generated range.
  const samples = [];
  for (let s = 0; s <= 305; s += 0.5) samples.push(railPos(s));

  // Box centers = mean of each box's 36 vertices; cheaper: step by 108 floats
  // (36 verts * 3) and average. We just check a representative subset for speed.
  const stride = 108;
  for (let base = 0; base < g.positions.length; base += stride) {
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < 36; v++) {
      cx += g.positions[base + v * 3];
      cy += g.positions[base + v * 3 + 1];
      cz += g.positions[base + v * 3 + 2];
    }
    cx /= 36; cy /= 36; cz /= 36;
    let minD = Infinity;
    for (const p of samples) {
      const d = Math.hypot(cx - p[0], cy - p[1], cz - p[2]);
      if (d < minD) minD = d;
    }
    // Kept clear of the centerline by construction (min radius TUNNEL_CLEAR+1
    // from its own frame); allow slack for rail curvature and box size.
    assert.ok(minD > TUNNEL_CLEAR - 1.0, `debris too near rail: ${minD.toFixed(2)}`);
  }
});
