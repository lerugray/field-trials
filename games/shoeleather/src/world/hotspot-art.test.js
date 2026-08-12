// SHOELEATHER — post-art hotspot re-verification (M4 full art pass).
//
// When the scenes were converted from the pre-M4 engine-harness backdrops to the
// ratified VACUUM SEALED art, the mechanic hotspots must STILL hold against the final
// pictures (CLAUDE.md rule 7 action-legibility + the seed's no-pixel-hunting law):
//   - every hotspot is on-frame (the systematic sweep can reach it; nothing off-screen),
//   - every scene is fully sweepable (coverage reaches all hotspots),
//   - the final art paints a legible OBJECT inside each non-exit hotspot (the player sees
//     what they brush — a valet log, a knife rack, the coroner's report — not a bare
//     region), verified by tying the scene-art object anchor to the world hotspot bounds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildM1World } from './m1-world.js';
import { buildCase2World } from './case-2-world.js';
import { paintSceneArt } from '../render/scene-art.js';
import { Framebuffer } from '../render/framebuffer.js';
import { SweepTracker } from '../engine/sweep.js';

const WORLDS = [['case-1', buildM1World], ['case-2', buildCase2World]];

function artScenes(build) {
  const world = build();
  const out = [];
  for (const id of world.graph.ids()) {
    const scene = world.graph.get(id);
    if (scene.background && scene.background.paint === 'art') out.push(scene);
  }
  return { world, scenes: out };
}

test('every world scene (both cases) now renders at the M4 art bar (paint: art)', () => {
  assert.deepEqual(artScenes(buildM1World).scenes.map((s) => s.id).sort(), ['morgue', 'restaurant', 'studio']);
  assert.deepEqual(artScenes(buildCase2World).scenes.map((s) => s.id).sort(), ['lounge', 'office', 'stateroom']);
});

test('post-art: every hotspot stays on-frame and every scene is fully sweepable', () => {
  for (const [, build] of WORLDS) {
    const { world, scenes } = artScenes(build);
    const { w: W, h: H } = world.logical;
    for (const scene of scenes) {
      for (const h of scene.hotspots) {
        const b = h.bounds;
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H,
          `${scene.id}/${h.id} must stay on-frame after the art pass (no pixel-hunting off-screen)`);
      }
      const sw = new SweepTracker();
      for (const h of scene.hotspots) sw.brush(scene.id, h.id);
      assert.ok(sw.isSwept(scene), `${scene.id} must be fully sweepable (coverage reaches every hotspot)`);
    }
  }
});

test('post-art: the final art anchors a painted object inside each non-exit hotspot', () => {
  for (const [, build] of WORLDS) {
    const { world, scenes } = artScenes(build);
    const { w: W, h: H } = world.logical;
    for (const scene of scenes) {
      const fb = new Framebuffer(W, H);
      const meta = paintSceneArt(fb, scene.background.art);
      assert.ok(meta && meta.hotspots, `${scene.background.art} paints and returns hotspot anchors`);
      for (const h of scene.hotspots) {
        if (h.kind === 'exit') continue; // exits are edge navigation zones (cool recesses)
        const a = meta.hotspots[h.id];
        assert.ok(a, `${scene.id}/${h.id} must have a painted object anchor (action-legibility)`);
        const b = h.bounds;
        assert.ok(a.x >= b.x && a.x < b.x + b.w && a.y >= b.y && a.y < b.y + b.h,
          `${scene.id}/${h.id} painted object must sit INSIDE the hotspot the player brushes`);
      }
    }
  }
});
