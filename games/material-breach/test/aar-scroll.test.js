// Release fix round B3 — the after-action report must scroll. A late-cycle report silently drops
// its tail when the renderer simply stops drawing at the sheet floor; this test proves every line
// is reachable by scrolling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueFortify } from '../src/actions.js';
import { createView } from '../src/view.js';
import { render } from '../src/render.js';
import { LEDGER } from '../src/layout.js';

function recordingCtx() {
  const calls = [];
  const t = { font: '11px "MB Serif", Georgia, serif' };
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get(_target, p) {
          if (p === 'measureText') return (str) => ({ width: String(str).length * 5 });
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

function longTenure() {
  let f = createFacility({ seed: 'aar-scroll' });
  let guard = 0;
  const allLines = [];
  while (f.status === 'active' && guard++ < 100) {
    if (f.treasury.gold >= 50) queueFortify(f);
    f = commitCycle(f);
    allLines.push(...f.lastReport.lines);
  }
  f.lastReport = { lines: allLines };
  return f;
}

test('a late-cycle after-action report has scrollable overflow', () => {
  const f = longTenure();
  assert.ok(f.lastReport, 'no report was produced');
  assert.ok(f.lastReport.lines.length > 10, 'report is too short to test scroll');

  const view = createView({ seed: 'aar-scroll-render' });
  view.facility = f;
  view.overlay = null;

  const r0 = recordingCtx();
  render(r0.ctx, view);
  assert.ok(view.reportMaxScroll > 0, 'report is not tall enough to need scrolling');

  const floor = LEDGER.y + LEDGER.h - 11;
  const headingCall = r0.calls.find((c) => c.text.includes('AFTER-ACTION REPORT'));
  assert.ok(headingCall, 'report heading was not drawn');
  const reportTop = headingCall.y + 20; // heading() advances by SIZE.title + LEAD.rule + 3
  const clippedAtTop = r0.calls.filter((c) => c.y > floor);
  assert.ok(clippedAtTop.length > 0, 'late report lines are drawn but should be clipped at scroll 0');

  // Step through the scroll range and collect the snippets that fall inside the report clip.
  const seen = new Set();
  const steps = Math.max(2, Math.ceil(view.reportMaxScroll / 30));
  for (let i = 0; i <= steps; i++) {
    view.reportScroll = Math.round((view.reportMaxScroll * i) / steps);
    const r = recordingCtx();
    render(r.ctx, view);
    for (const c of r.calls) {
      if (c.y >= reportTop + view.reportScroll && c.y <= floor + view.reportScroll) {
        for (const line of f.lastReport.lines) {
          if (line.text.includes(c.text) || c.text.includes(line.text)) seen.add(line.text);
        }
      }
    }
  }

  for (const line of f.lastReport.lines) {
    assert.ok(seen.has(line.text), `report line never scrolled into view: "${line.text}"`);
  }
});
