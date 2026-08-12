import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFrame, frameDisplay, FILL_GATE, PANEL_W, CONSOLE_H } from '../src/engine/frame.js';
import { CANVAS_W } from '../src/engine/layout.js';

// The operator's UPDATED gate (DIRECTIONS-2026-08-02-INTERFACE-JOURNAL, REVIEW
// ADDENDUM 2): the composed game surface (viewport + chrome) occupies ≥95% of
// BOTH window dimensions at these three sizes — replacing the old smaller-dim
// square gate. 16:10 (the two smaller) + 16:9 (the largest): a single fixed
// aspect can't clear both, which is exactly why the frame is responsive.
const GATE_VIEWPORTS = [
  { w: 1280, h: 800 },   // 16:10
  { w: 1440, h: 900 },   // 16:10
  { w: 2560, h: 1440 },  // 16:9
];

test('full-window gate: composed surface fills >=95% of BOTH window dimensions', () => {
  for (const vp of GATE_VIEWPORTS) {
    const { cssW, cssH, fillW, fillH } = frameDisplay(vp.w, vp.h);
    assert.ok(fillW >= FILL_GATE, `at ${vp.w}x${vp.h}: width ${cssW} fills ${(fillW * 100).toFixed(1)}% (< ${FILL_GATE * 100}%)`);
    assert.ok(fillH >= FILL_GATE, `at ${vp.w}x${vp.h}: height ${cssH} fills ${(fillH * 100).toFixed(1)}% (< ${FILL_GATE * 100}%)`);
  }
});

test('a fixed 416-square canvas would FAIL the new gate at widescreen (regression proof)', () => {
  // The square canvas the addendum retired: scaled to fit a 1440x900 window it
  // fills the height but pillarboxes the width to the square — well under 95%.
  const vp = { w: 1440, h: 900 };
  const sqScale = Math.min(vp.w / 416, vp.h / 416);
  const sqW = 416 * sqScale;
  assert.ok(sqW / vp.w < FILL_GATE, 'sanity: the square canvas really did pillarbox the width');
  // The responsive frame clears both dims at the same window.
  const { fillW, fillH } = frameDisplay(vp.w, vp.h);
  assert.ok(fillW >= FILL_GATE && fillH >= FILL_GATE);
});

test('the composed CSS box never exceeds the window it fills', () => {
  for (const vp of GATE_VIEWPORTS) {
    const { cssW, cssH } = frameDisplay(vp.w, vp.h);
    assert.ok(cssW <= vp.w && cssH <= vp.h, `${cssW}x${cssH} within ${vp.w}x${vp.h}`);
  }
});

test('backing aspect tracks the window (square pixels when stretched to fill)', () => {
  for (const vp of GATE_VIEWPORTS) {
    const { W, H } = computeFrame(vp.w, vp.h);
    const { cssW, cssH } = frameDisplay(vp.w, vp.h);
    // px aspect = css aspect / backing aspect; ~1 means square pixels.
    const pxAspect = (cssW / cssH) / (W / H);
    assert.ok(Math.abs(pxAspect - 1) < 0.01, `at ${vp.w}x${vp.h}: pixel aspect ${pxAspect.toFixed(4)} not ~1`);
  }
});

test('regions tile the frame exactly: no overlap, no gaps, within bounds', () => {
  for (const vp of GATE_VIEWPORTS) {
    const f = computeFrame(vp.w, vp.h);
    const { W, H, scene, panel, console: con } = f;
    // scene + panel span the top band, full width, full top height.
    assert.equal(scene.x, 0);
    assert.equal(scene.y, 0);
    assert.equal(panel.x, scene.w, 'panel starts where the scene ends');
    assert.equal(scene.w + panel.w, W, 'scene + panel span the full width');
    assert.equal(scene.h, panel.h, 'scene and panel share the top-band height');
    assert.equal(scene.h, H - con.h, 'top band is the frame minus the console');
    // console spans the full width along the bottom.
    assert.equal(con.x, 0);
    assert.equal(con.y, H - con.h);
    assert.equal(con.w, W);
    assert.equal(con.h, CONSOLE_H);
    // panel is the fixed HUD column width.
    assert.equal(panel.w, PANEL_W);
    // every region is on-screen and non-degenerate.
    for (const r of [scene, panel, con]) {
      assert.ok(r.w > 0 && r.h > 0, 'region non-degenerate');
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H, 'region within frame');
    }
  }
});

test('the scene viewport is wider than the old square canvas (more horizontal tiles)', () => {
  // The operator explicitly welcomed a wider tile viewport. At every gate window
  // the scene region is wider than the retired 416 square.
  for (const vp of GATE_VIEWPORTS) {
    const { scene } = computeFrame(vp.w, vp.h);
    assert.ok(scene.w > CANVAS_W, `at ${vp.w}x${vp.h}: scene ${scene.w} not wider than ${CANVAS_W}`);
  }
});

test('portrait / square windows keep a usable scene (never collapse to the panel)', () => {
  for (const vp of [{ w: 700, h: 900 }, { w: 800, h: 800 }]) {
    const { scene, panel } = computeFrame(vp.w, vp.h);
    assert.ok(scene.w >= 360, `scene ${scene.w} stays usable at ${vp.w}x${vp.h}`);
    assert.equal(panel.w, PANEL_W, 'panel width holds');
  }
});

test('the scene ALWAYS fits the centred text/bust card (no overflow into the panel)', () => {
  // §4 overprint guard: even the narrowest/portrait windows keep scene.w >=
  // CANVAS_W, so the 416-wide combat/death/creation/journal card can never spill
  // out of the scene region into the side HUD panel.
  for (const vp of [{ w: 500, h: 900 }, { w: 700, h: 900 }, { w: 800, h: 800 }, { w: 1280, h: 800 }]) {
    const { scene } = computeFrame(vp.w, vp.h);
    assert.ok(scene.w >= CANVAS_W, `at ${vp.w}x${vp.h}: scene ${scene.w} < card ${CANVAS_W}`);
  }
});
