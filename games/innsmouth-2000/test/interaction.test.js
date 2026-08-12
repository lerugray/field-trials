import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopBar, inRect, buildToolbar, buildToolbarTooltip, toolbarTooltipLines } from '../src/ui.js';
import {
  buildMinimap, overMinimap, minimapToTile,
  buildDemand, overDemand,
  buildCourierTicker, overCourierTicker,
} from '../src/overlays.js';
import { TOOL } from '../src/tools.js';

// The click/drag regression harness for M7's overlays. main.js layers the minimap, demand
// indicator, and Courier ticker over the map, each with its own click target; if a layout change
// ever let two of them overlap, one would silently swallow the other's clicks. These tests rebuild
// the exact layouts main.js uses (same insets) at the three proof viewports and assert the targets
// stay disjoint and that a click at each centre routes to that overlay alone.

const VIEWPORTS = [[1280, 800], [1440, 900], [2560, 1440]];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function centre(frame) { return [frame.x + frame.w / 2, frame.y + frame.h / 2]; }

// Build every overlay the way main.js does (scale 1).
function overlaysFor(w, h) {
  const topbar = buildTopBar(w);
  const minimap = buildMinimap(w, h, 96, 96, { bottomInset: 22 + 20 + 6 });
  const demand = buildDemand(w, h, { bottomInset: 22 + 6 });
  const ticker = buildCourierTicker(w, topbar.panel.h);
  return { topbar, minimap, demand, ticker };
}

test('the three overlays never overlap each other at any proof viewport', () => {
  for (const [w, h] of VIEWPORTS) {
    const { minimap, demand, ticker } = overlaysFor(w, h);
    assert.equal(rectsOverlap(minimap.frame, demand.frame), false, `minimap vs demand @ ${w}x${h}`);
    assert.equal(rectsOverlap(minimap.frame, ticker.frame), false, `minimap vs ticker @ ${w}x${h}`);
    assert.equal(rectsOverlap(demand.frame, ticker.frame), false, `demand vs ticker @ ${w}x${h}`);
  }
});

test('the overlays clear the top bar and sit within the viewport', () => {
  for (const [w, h] of VIEWPORTS) {
    const { topbar, minimap, demand, ticker } = overlaysFor(w, h);
    for (const o of [minimap, demand, ticker]) {
      assert.ok(o.frame.x >= 0 && o.frame.y >= topbar.panel.h, `on-screen and below the top bar @ ${w}x${h}`);
      assert.ok(o.frame.x + o.frame.w <= w && o.frame.y + o.frame.h <= h, `inside the viewport @ ${w}x${h}`);
    }
  }
});

test('a click at each overlay centre routes to that overlay alone', () => {
  for (const [w, h] of VIEWPORTS) {
    const { minimap, demand, ticker } = overlaysFor(w, h);
    const [mx, my] = centre(minimap.frame);
    assert.ok(overMinimap(minimap, mx, my) && !overDemand(demand, mx, my) && !overCourierTicker(ticker, mx, my));
    const [dx, dy] = centre(demand.frame);
    assert.ok(overDemand(demand, dx, dy) && !overMinimap(minimap, dx, dy) && !overCourierTicker(ticker, dx, dy));
    const [tx, ty] = centre(ticker.frame);
    assert.ok(overCourierTicker(ticker, tx, ty) && !overMinimap(minimap, tx, ty) && !overDemand(demand, tx, ty));
  }
});

test('a drag across the minimap yields distinct recenter targets (click-drag flow)', () => {
  const { minimap } = overlaysFor(1280, 800);
  const a = minimapToTile(minimap, minimap.inner.x + minimap.inner.w * 0.2, minimap.inner.y + minimap.inner.h * 0.2);
  const b = minimapToTile(minimap, minimap.inner.x + minimap.inner.w * 0.8, minimap.inner.y + minimap.inner.h * 0.8);
  assert.notDeepEqual(a, b, 'dragging to a new spot recenters somewhere new');
  assert.ok(b.col > a.col && b.row > a.row, 'and in the expected direction');
});

test('the palette tooltip stays below the Courier ticker so both remain readable', () => {
  for (const [w, h] of VIEWPORTS) {
    const { topbar, ticker } = overlaysFor(w, h);
    const tb = buildToolbar({ y: topbar.panel.h + ticker.frame.h + 8 });
    const minY = ticker.frame.y + ticker.frame.h + 2;
    for (const b of tb.buttons) {
      const lines = toolbarTooltipLines(b.tool);
      const t = buildToolbarTooltip(b.rect, lines, w, h, { minY });
      assert.ok(t.y >= minY, `${b.tool} @ ${w}x${h}: tooltip overlaps the Courier ticker`);
      assert.ok(t.y + t.h <= h);
    }
    const queryLines = toolbarTooltipLines(TOOL.QUERY);
    const qt = buildToolbarTooltip(tb.buttons[0].rect, queryLines, w, h, { minY });
    assert.equal(qt.y < ticker.frame.y + ticker.frame.h, false);
  }
});

test('the top bar text-size and mute buttons stay disjoint and inside the bar', () => {
  const tb = buildTopBar(1280);
  assert.equal(rectsOverlap(tb.textscale, tb.mute), false);
  for (const b of [tb.textscale, tb.mute, tb.save, tb.disasters, tb.gods, tb.ledger]) {
    assert.ok(inRect(tb.panel, b.x + 1, b.y + 1) && b.x + b.w <= tb.panel.x + tb.panel.w);
  }
});
