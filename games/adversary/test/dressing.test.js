import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceCells, computeDressing, parallaxLayout } from '../src/render/dressing.js';
import { THEMES } from '../src/render/palette.js';

// A tiny tilemap stub: a flat floor along the bottom two rows of a WxH grid.
function flatMap(w = 40, h = 15, tileSize = 16) {
  return {
    w, h, tileSize,
    worldWidth: w * tileSize,
    worldHeight: h * tileSize,
    solidAt: (tx, ty) => ty >= h - 2 && tx >= 0 && tx < w && ty < h,
  };
}

test('dressing: surfaceCells finds one topmost surface per column', () => {
  const tm = flatMap(10, 8);
  const cells = surfaceCells(tm);
  assert.equal(cells.length, 10, 'one surface per column');
  for (const c of cells) assert.equal(c.ty, 6, 'topmost solid row is h-2');
});

test('dressing: computeDressing is deterministic and theme-gated', () => {
  const tm = flatMap();
  const a = computeDressing(tm, 'cemetery', 'seedX');
  const b = computeDressing(tm, 'cemetery', 'seedX');
  assert.deepEqual(a, b, 'same seed → identical layout (replayable)');
  const c = computeDressing(tm, 'cemetery', 'seedY');
  assert.notDeepEqual(a, c, 'different seed → different layout');

  // Every decoration kind must be one the theme allows.
  const allowed = new Set(THEMES.cemetery.dressing);
  for (const d of a) assert.ok(allowed.has(d.kind), `${d.kind} allowed by cemetery theme`);
  assert.ok(a.length > 0, 'a populated stage grows some dressing');
});

test('dressing: decorations anchor on real surface tiles', () => {
  const tm = flatMap();
  const decs = computeDressing(tm, 'crypt', 's');
  for (const d of decs) {
    const tx = Math.floor(d.x / tm.tileSize);
    assert.ok(tx >= 0 && tx < tm.w, 'x within world');
    assert.equal(d.y, (tm.h - 2) * tm.tileSize, 'y sits on the surface tile top');
  }
});

test('dressing: each populated screen-span has restrained place dressing', () => {
  const tm = flatMap(48);
  const decs = computeDressing(tm, 'crypt', 'coverage');
  for (let start = 0; start < tm.w; start += 12) {
    assert.ok(
      decs.some((d) => d.x / tm.tileSize >= start && d.x / tm.tileSize < start + 12),
      `span ${start}-${start + 11} has a readable landmark`,
    );
  }
  assert.ok(decs.length <= 16, 'dressing remains sparse');
});

test('dressing: parallaxLayout is deterministic and spans the world', () => {
  const a = parallaxLayout(2000, 'keep', 'z');
  const b = parallaxLayout(2000, 'keep', 'z');
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  for (const s of a) {
    assert.ok(['spire', 'wall', 'tomb', 'tower', 'arch'].includes(s.kind));
    assert.ok(s.w > 0 && s.h > 0);
  }
});
