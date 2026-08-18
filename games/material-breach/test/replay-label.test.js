// Release fix round D1 — the replay strength label must not be clipped by the section panel edge
// when a party enters near the right side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility } from '../src/model.js';
import { createView } from '../src/view.js';
import { render } from '../src/render.js';
import { CUTAWAY, SECTION_INSET } from '../src/layout.js';

const SECTION = {
  x: CUTAWAY.x + 1,
  y: CUTAWAY.y + SECTION_INSET.top,
  w: CUTAWAY.w - 2,
  h: CUTAWAY.h - SECTION_INSET.top - SECTION_INSET.bottom,
};

function recordingCtx(widthFactor = 6) {
  const calls = [];
  const t = { font: '11px serif' };
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get(_target, p) {
          if (p === 'measureText') return (str) => ({ width: String(str).length * widthFactor });
          if (p === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'fillText') return (text, x, y) => calls.push({ text: String(text), x, y });
          if (p === 'font') return t.font;
          return () => {};
        },
        set(_target, p, v) {
          if (p === 'font') t.font = v;
          return true;
        },
      },
    ),
  };
}

function makeRaidView(seed, steps, cursor) {
  const f = createFacility({ seed });
  f.lastRaid = { cycle: f.cycle.number, party: { size: 2 }, steps };
  const view = createView({ seed });
  view.facility = f;
  view.overlay = 'raid';
  view.replay = { steps, startFrame: 0, cursor, done: false, doneFrame: 0 };
  return view;
}

test('the replay strength label stays inside the section panel on right-edge entry', () => {
  // Party enters from the right edge and walks left; the head at cursor 0 is the edge case.
  const steps = [];
  for (let x = 23; x >= 12; x--) steps.push({ pos: { x, y: 8 }, strength: 34 });

  for (let cursor = 0; cursor < 4; cursor++) {
    const view = makeRaidView('label-right', steps, cursor);
    const r = recordingCtx();
    render(r.ctx, view);
    const labels = r.calls.filter((c) => String(c.text).startsWith('strength'));
    assert.ok(labels.length > 0, `no strength label drawn at cursor ${cursor}`);
    for (const label of labels) {
      const width = String(label.text).length * 6;
      assert.ok(
        label.x >= SECTION.x && label.x + width <= SECTION.x + SECTION.w,
        `strength label at ${label.x}..${label.x + width} escapes section [${SECTION.x}..${SECTION.x + SECTION.w}]`,
      );
      assert.ok(
        label.y >= SECTION.y,
        `strength label at y=${label.y} escapes section top ${SECTION.y}`,
      );
    }
  }
});

test('the replay strength label stays inside the section panel on left-edge entry', () => {
  const steps = [];
  for (let x = 0; x <= 10; x++) steps.push({ pos: { x, y: 8 }, strength: 21 });
  const view = makeRaidView('label-left', steps, 0);
  const r = recordingCtx();
  render(r.ctx, view);
  const labels = r.calls.filter((c) => String(c.text).startsWith('strength'));
  assert.ok(labels.length > 0, 'no strength label drawn');
  for (const label of labels) {
    const width = String(label.text).length * 6;
    assert.ok(label.x >= SECTION.x && label.x + width <= SECTION.x + SECTION.w);
    assert.ok(label.y >= SECTION.y);
  }
});
