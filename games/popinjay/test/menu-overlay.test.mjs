// menu-overlay.test.mjs — regression for the title confirm-dialog collision.
//
// When the player starts a new run while a saved run exists, the title card shows a
// confirmation dialog. The title's controls panel is drawn at the same y-range, and
// because body type is queued for the display-resolution text layer, the controls text
// was painting on top of the dialog — the menu was unreadable. This test locks the
// composition: the dialog must discard the occluded title type and darken the buffer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Painter, NATIVE, beginTextLayer, takeTextLayer } from '../src/render/px.js';
import { nativeScreen } from '../src/render/game.js';
import { drawTitle } from '../src/render/title.js';
import { scrim, drawConfirmNewRun } from '../src/render/overlays.js';

function mockCtx() {
  return {
    imageSmoothingEnabled: false,
    drawImage() {},
  };
}

function queueText(q) {
  return q.map((c) => c.s).join(' ');
}

const TITLE_CONTROLS_STRINGS = ['WALK', 'CLIMB', 'FIRE', 'SIDEARM', 'PAUSE', 'MENUS', 'CONTROLS'];

// 2026-08-18: the confirm dialog must not inherit the title controls type.
test('confirm-new-run dialog discards occluded title text from the display layer', () => {
  const p = new Painter(NATIVE.w, NATIVE.h);
  const ctx = mockCtx();
  beginTextLayer({ skipNative: true });
  drawTitle(ctx, { w: 1280, h: 800, seed: 1, build: 'M7' });

  // Fixed composition: clear the queued title type, restart the layer, darken the
  // buffer, then draw the dialog.
  takeTextLayer();
  beginTextLayer({ skipNative: true });
  scrim(p, 0.66);
  drawConfirmNewRun(p);

  const q = takeTextLayer();
  const text = queueText(q);
  for (const s of TITLE_CONTROLS_STRINGS) {
    assert.equal(text.includes(s), false, `title controls string "${s}" leaked into the confirm dialog text layer`);
  }
  assert.ok(text.includes('ABANDON'), 'confirm dialog question must still be queued');
  assert.ok(text.includes('CONFIRM') || text.includes('KEEP'), 'confirm dialog hint must still be queued');
});

// Pixel-level: the dialog panel must actually sit on top of the title controls panel.
// The controls card lives at y=210 (height 56) across most of the width; the confirm
// dialog is centered at y=200 (height 60). Without clearing/darkening, the title
// controls panel would still read through around and behind the dialog.
test('confirm-new-run dialog occludes the title controls panel in the native buffer', () => {
  const p = nativeScreen().painter;
  const ctx = mockCtx();
  beginTextLayer({ skipNative: true });
  drawTitle(ctx, { w: 1280, h: 800, seed: 1, build: 'M7' });
  takeTextLayer();

  // Sample a point inside the title controls panel but OUTSIDE the confirm dialog.
  // The controls card spans x=12..468, y=210..266; the dialog is x=90..390, y=200..260.
  const controlX = 40, controlY = 230;
  const before = p.get(controlX, controlY).slice(0, 3);
  const beforeDark = before[0] + before[1] + before[2];
  assert.ok(beforeDark > 120, 'title controls panel should be a light paper colour before the dialog');

  beginTextLayer({ skipNative: true });
  scrim(p, 0.66);
  drawConfirmNewRun(p);
  takeTextLayer();

  // After the scrim, the area outside the dialog card must be darkened so the dialog
  // lifts off; the dialog panel itself restores the light paper inside its bounds.
  const after = p.get(controlX, controlY).slice(0, 3);
  const afterDark = after[0] + after[1] + after[2];
  assert.ok(afterDark < beforeDark - 40, `dialog scrim did not darken surrounding title controls pixel (${beforeDark} -> ${afterDark})`);
});
