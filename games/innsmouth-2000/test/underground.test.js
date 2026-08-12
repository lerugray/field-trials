import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, VIEW, applyTool } from '../src/tools.js';
import { makeCamera } from '../src/camera.js';
import { computePower } from '../src/power.js';
import { computeWater } from '../src/water.js';
import { drawMap } from '../src/render.js';
import { RAMP } from '../src/palette.js';
import {
  TOOLBAR_TOOLS, UNDERGROUND_TOOLS, toolbarToolsFor, viewForTool,
  toolbarShortcut, toolForNumberKey,
  buildToolbar, hitToolbar, hitViewToggle, overToolbar,
  toolbarTooltipLines, viewToggleTooltipLines, buildToolbarTooltip,
  drawToolbar, drawToolIcon, buildTopBar, setChromeScale, CHROME_SCALES,
} from '../src/ui.js';
import { buildDemand, buildCourierTicker } from '../src/overlays.js';

// A recording mock of a 2D canvas context (mirrors test/draw-smoke.test.js): every draw method is
// a no-op, so this catches the browser-only reference errors node --test would otherwise miss.
function mockCtx() {
  const noop = () => {};
  const ctx = {
    measureText: (s) => ({ width: (s ? String(s).length : 0) * 7 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
  };
  for (const m of [
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
    'rect', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip',
    'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform',
    'setLineDash', 'drawImage',
  ]) ctx[m] = noop;
  return ctx;
}

// One stand-in sprite per terrain ramp: drawImage is a no-op, so the object need only exist.
function mockSprites() {
  const out = {};
  for (const key of Object.keys(RAMP)) out[key] = { width: 64, height: 32 };
  return out;
}

function townMap(cols = 16, rows = 16) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = {
      terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null,
      building: null, structure: null, scar: null, pipe: null,
    };
  }
  for (let r = 0; r < rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP; // a waterfront
  return m;
}

// A town with both planes populated: streets and a grid above, mains and works below, plus a lot
// on every kind of ground the underground renderer has to draw.
function twoPlaneTown() {
  const m = townMap();
  for (let c = 2; c <= 10; c++) applyTool(m, TOOL.ROAD, c, 5);
  for (let c = 2; c <= 6; c++) applyTool(m, TOOL.POWERLINE, c, 5); // crossings along the street
  applyTool(m, TOOL.GASWORKS, 2, 3);
  applyTool(m, TOOL.ZONE_R, 4, 6);
  m.tiles[m.index(4, 6)].building = { level: 2, cls: 'unwary' };
  applyTool(m, TOOL.ZONE_C, 6, 6); // zoned, never built
  applyTool(m, TOOL.PUMPHOUSE, 3, 3);
  applyTool(m, TOOL.WELLHOUSE, 9, 8);
  applyTool(m, TOOL.RESERVOIR, 12, 8);
  for (let c = 4; c <= 10; c++) applyTool(m, TOOL.PIPE, c, 4); // a trunk main under the street
  for (let r = 5; r <= 8; r++) applyTool(m, TOOL.PIPE, 9, r); // a branch down to the well
  applyTool(m, TOOL.PIPE, 14, 14); // a dry stub, joined to nothing
  return m;
}

// --- the two palettes -------------------------------------------------------------------------

test('the underground palette carries the water tools and the surface palette is untouched', () => {
  assert.deepEqual(UNDERGROUND_TOOLS.map((t) => t.tool), [
    TOOL.QUERY, TOOL.BULLDOZE, TOOL.PIPE, TOOL.PUMPHOUSE, TOOL.WELLHOUSE, TOOL.RESERVOIR,
    // M-b: the four answers to a fouled network.
    TOOL.FILTERHOUSE, TOOL.VALVE, TOOL.FLUSH, TOOL.SEAL,
  ]);
  assert.equal(toolbarToolsFor(VIEW.UNDERGROUND), UNDERGROUND_TOOLS);
  assert.equal(toolbarToolsFor(VIEW.SURFACE), TOOLBAR_TOOLS);
  assert.equal(toolbarToolsFor(undefined), TOOLBAR_TOOLS, 'the surface is the default context');
  // Nothing that belongs to the street appears below it.
  for (const surfaceOnly of [TOOL.ROAD, TOOL.POWERLINE, TOOL.ZONE_R, TOOL.CHAPEL]) {
    assert.ok(!UNDERGROUND_TOOLS.some((t) => t.tool === surfaceOnly), `${surfaceOnly} is a street tool`);
  }
  // Query and Bulldoze keep the same two places in both palettes, so their number keys never lie.
  assert.equal(UNDERGROUND_TOOLS[0].tool, TOOLBAR_TOOLS[0].tool);
  assert.equal(UNDERGROUND_TOOLS[1].tool, TOOLBAR_TOOLS[1].tool);
});

test('a tool that belongs to one plane names it, and the shared tools name none', () => {
  // The main, the valve, the flush and the sealing works all act on things only visible below the
  // street, so selecting any of them takes the player down there (M-a's "build tools switch context").
  for (const t of [TOOL.PIPE, TOOL.VALVE, TOOL.FLUSH, TOOL.SEAL]) {
    assert.equal(viewForTool(t), VIEW.UNDERGROUND, `${t} belongs below the street`);
  }
  for (const t of [TOOL.ROAD, TOOL.POWERLINE, TOOL.ZONE_I, TOOL.GASWORKS, TOOL.UNIVERSITY]) {
    assert.equal(viewForTool(t), VIEW.SURFACE, `${t} belongs to the street`);
  }
  // The works are buildings on the surface that happen to join the underground network, so they are
  // placeable from either view and never yank the player between planes.
  for (const t of [TOOL.QUERY, TOOL.BULLDOZE, TOOL.PUMPHOUSE, TOOL.WELLHOUSE, TOOL.RESERVOIR,
    TOOL.FILTERHOUSE]) {
    assert.equal(viewForTool(t), null, `${t} works on either plane`);
  }
  // Every tool on either palette is accounted for by one of those three answers.
  for (const { tool } of UNDERGROUND_TOOLS.concat(TOOLBAR_TOOLS)) {
    const v = viewForTool(tool);
    assert.ok(v === null || v === VIEW.SURFACE || v === VIEW.UNDERGROUND, `${tool}: ${v}`);
  }
});

// --- the toolbar and its view toggle -----------------------------------------------------------

test('the underground toolbar lays out its own buttons inside its own panel', () => {
  const tb = buildToolbar({ view: VIEW.UNDERGROUND });
  assert.equal(tb.buttons.length, UNDERGROUND_TOOLS.length);
  for (const b of tb.buttons) {
    assert.ok(b.rect.x >= tb.panel.x && b.rect.x + b.rect.w <= tb.panel.x + tb.panel.w);
    assert.ok(b.rect.y >= tb.panel.y && b.rect.y + b.rect.h <= tb.panel.y + tb.panel.h);
  }
  for (let i = 1; i < tb.buttons.length; i++) {
    assert.ok(tb.buttons[i].rect.y >= tb.buttons[i - 1].rect.y + tb.buttons[i - 1].rect.h,
      'buttons overlap vertically');
  }
});

test('the view toggle sits below the tools, inside the panel, and selects no tool', () => {
  for (const view of [VIEW.SURFACE, VIEW.UNDERGROUND]) {
    const tb = buildToolbar({ view });
    const vt = tb.viewToggle;
    const last = tb.buttons[tb.buttons.length - 1].rect;
    assert.ok(vt.rect.y >= last.y + last.h, `${view}: the toggle sits below the last tool`);
    assert.ok(vt.rect.y + vt.rect.h <= tb.panel.y + tb.panel.h, `${view}: the toggle is inside the panel`);
    assert.ok(vt.rect.x >= tb.panel.x && vt.rect.x + vt.rect.w <= tb.panel.x + tb.panel.w);
    assert.equal(vt.view, view, 'the toggle reports which plane the player is on');
    // Critically: it is NOT a tool button, so a click on it must never pick a tool.
    const cx = vt.rect.x + vt.rect.w / 2;
    const cy = vt.rect.y + vt.rect.h / 2;
    assert.equal(hitToolbar(tb, cx, cy), null, `${view}: the toggle is not a tool`);
    assert.equal(hitViewToggle(tb, cx, cy), true);
    assert.ok(overToolbar(tb, cx, cy), 'but it is still on the panel');
    // And a tool button is never mistaken for the toggle.
    const first = tb.buttons[0].rect;
    assert.equal(hitViewToggle(tb, first.x + 2, first.y + 2), false);
  }
});

// The view toggle made the surface palette one well taller, and the Demand gadget is docked
// bottom-left directly beneath it. It is drawn AFTER the palette, so any overlap would silently
// bury the toggle. `maxH` tightens the palette's pitch instead; this holds it to that.
test('the palette never runs under the Demand gadget, at any viewport or text scale', () => {
  const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  try {
    for (const [vw, vh] of [[1024, 700], [1280, 800], [1440, 900], [1600, 900], [2560, 1440]]) {
      for (const scale of CHROME_SCALES) {
        setChromeScale(scale);
        const topbar = buildTopBar(vw);
        const th = buildCourierTicker(vw, topbar.panel.h, { scale }).frame.h;
        const ty = topbar.panel.h + th + 8;
        const demand = buildDemand(vw, vh, { bottomInset: Math.round(22 * scale) + 6, scale }).frame;
        const maxH = Math.max(120, demand.y - ty - 8);
        for (const view of [VIEW.SURFACE, VIEW.UNDERGROUND]) {
          const tb = buildToolbar({ y: ty, view, maxH });
          const tag = `${vw}x${vh} scale ${scale} ${view}`;
          assert.equal(overlaps(tb.panel, demand), false, `${tag}: the palette runs under the Demand gadget`);
          assert.ok(tb.panel.y + tb.panel.h <= vh, `${tag}: the palette runs off the bottom`);
          // Whatever the pitch, the toggle stays inside the panel and clear of the last tool.
          const last = tb.buttons[tb.buttons.length - 1].rect;
          assert.ok(tb.viewToggle.rect.y >= last.y + last.h, `${tag}: the toggle overlaps a tool`);
          assert.ok(tb.viewToggle.rect.y + tb.viewToggle.rect.h <= tb.panel.y + tb.panel.h,
            `${tag}: the toggle escapes the panel`);
          assert.ok(tb.buttons[0].rect.w >= 24, `${tag}: the wells shrank below a usable size`);
        }
      }
    }
  } finally {
    setChromeScale(1);
  }
});

test('the palette keeps its full-size wells when it has the room', () => {
  const roomy = buildToolbar({ y: 54, view: VIEW.SURFACE, maxH: 900 });
  assert.equal(roomy.buttons[0].rect.w, 34, 'an ordinary viewport leaves the palette untouched');
  const unbounded = buildToolbar({ y: 54, view: VIEW.SURFACE });
  assert.equal(unbounded.buttons[0].rect.w, 34, 'and so does asking for no bound at all');
});

test('the view toggle names what it does, and the key that also does it', () => {
  assert.deepEqual(viewToggleTooltipLines(VIEW.SURFACE), ['Underground', 'key U']);
  assert.deepEqual(viewToggleTooltipLines(VIEW.UNDERGROUND), ['Surface', 'key U']);
  for (const lines of [viewToggleTooltipLines(VIEW.SURFACE), viewToggleTooltipLines(VIEW.UNDERGROUND)]) {
    assert.ok(!lines.some((l) => /—/.test(l)), 'no em-dashes in player-facing text');
  }
});

test('every underground tool has a tooltip sourced from its real label and cost', () => {
  for (const { tool, label } of UNDERGROUND_TOOLS) {
    const lines = toolbarTooltipLines(tool, VIEW.UNDERGROUND);
    assert.ok(Array.isArray(lines) && lines.length >= 1, `${tool}: no tooltip lines`);
    assert.equal(lines[0], label, `${tool}: tooltip name does not match the palette's own label`);
    assert.ok(!lines.some((l) => /—/.test(l)), `${tool}: em-dash in player-facing text`);
  }
});

test('number keys pick the underground palette below the street, never a surface tool', () => {
  assert.equal(toolForNumberKey(1, VIEW.UNDERGROUND), TOOL.QUERY);
  assert.equal(toolForNumberKey(2, VIEW.UNDERGROUND), TOOL.BULLDOZE);
  assert.equal(toolForNumberKey(3, VIEW.UNDERGROUND), TOOL.PIPE);
  assert.equal(toolForNumberKey(4, VIEW.UNDERGROUND), TOOL.PUMPHOUSE);
  assert.equal(toolForNumberKey(8, VIEW.UNDERGROUND), TOOL.VALVE);
  assert.equal(toolForNumberKey(9, VIEW.UNDERGROUND), TOOL.FLUSH);
  assert.equal(toolForNumberKey(10, VIEW.UNDERGROUND), null);
  assert.equal(viewForTool(toolForNumberKey(3, VIEW.UNDERGROUND)), VIEW.UNDERGROUND);
  for (let n = 1; n <= 9; n++) {
    const tool = toolForNumberKey(n, VIEW.UNDERGROUND);
    assert.ok(tool, `key ${n} should pick an underground tool`);
    assert.notEqual(viewForTool(tool), VIEW.SURFACE, `key ${n} (${tool}) must not yank the view up`);
  }
  assert.equal(toolbarShortcut(TOOL.PIPE, VIEW.UNDERGROUND), 3);
  assert.equal(toolbarShortcut(TOOL.SEAL, VIEW.UNDERGROUND), null);
  assert.equal(toolbarShortcut(TOOL.ROAD, VIEW.UNDERGROUND), null);
  assert.equal(toolForNumberKey(3, VIEW.SURFACE), TOOL.ROAD);
});

test('the underground palette tooltip stays inside the viewport, toggle included', () => {
  for (const [vw, vh] of [[1280, 800], [1440, 900], [2560, 1440]]) {
    const tb = buildToolbar({ view: VIEW.UNDERGROUND });
    const rects = tb.buttons.map((b) => ({ tag: b.tool, rect: b.rect, lines: toolbarTooltipLines(b.tool) }));
    rects.push({ tag: 'viewToggle', rect: tb.viewToggle.rect, lines: viewToggleTooltipLines(VIEW.UNDERGROUND) });
    for (const { tag, rect, lines } of rects) {
      const t = buildToolbarTooltip(rect, lines, vw, vh);
      assert.ok(t.x >= 0 && t.y >= 0, `${tag} @ ${vw}x${vh}: tooltip starts off-screen`);
      assert.ok(t.x + t.w <= vw, `${tag} @ ${vw}x${vh}: tooltip clips the right edge`);
      assert.ok(t.y + t.h <= vh, `${tag} @ ${vw}x${vh}: tooltip clips the bottom edge`);
    }
  }
});

// --- drawing --------------------------------------------------------------------------------

test('the underground toolbar and every water tool icon draw without a reference error', () => {
  const ctx = mockCtx();
  const tb = buildToolbar({ view: VIEW.UNDERGROUND, y: 34 });
  for (const t of UNDERGROUND_TOOLS) {
    assert.doesNotThrow(() => drawToolbar(ctx, tb, t.tool), `drawing the palette with ${t.tool} active`);
    assert.doesNotThrow(() => drawToolIcon(ctx, t.tool, 20, 20, 34, false), `icon ${t.tool}`);
    assert.doesNotThrow(() => drawToolIcon(ctx, t.tool, 20, 20, 34, true), `icon ${t.tool} pressed`);
  }
  // The toggle draws in both states.
  assert.doesNotThrow(() => drawToolbar(ctx, buildToolbar({ view: VIEW.SURFACE }), TOOL.QUERY));
});

test('the underground map draws a whole two-plane town without a reference error', () => {
  const ctx = mockCtx();
  const map = twoPlaneTown();
  const camera = makeCamera({ mapCols: map.cols, mapRows: map.rows, viewportW: 800, viewportH: 600 });
  const power = computePower(map);
  const water = computeWater(map, power);
  // Every pressure state is present in this town, so all three pipe colours are exercised.
  const states = new Set(water.components.map((c) => c.pressure));
  assert.ok(states.size >= 2, `the fixture should carry mixed pressure, got ${[...states]}`);
  assert.doesNotThrow(
    () => drawMap(ctx, map, camera, mockSprites(), power, null, { view: VIEW.UNDERGROUND, water }),
    'the underground view draws',
  );
  // It must also survive being asked to draw before the sim has ever computed water.
  assert.doesNotThrow(
    () => drawMap(ctx, map, camera, mockSprites(), power, null, { view: VIEW.UNDERGROUND }),
    'the underground view draws with no water state yet',
  );
});

test('the surface view still draws the same town, and ignores the water state', () => {
  const ctx = mockCtx();
  const map = twoPlaneTown();
  const camera = makeCamera({ mapCols: map.cols, mapRows: map.rows, viewportW: 800, viewportH: 600 });
  const power = computePower(map);
  assert.doesNotThrow(() => drawMap(ctx, map, camera, mockSprites(), power, null));
  assert.doesNotThrow(() => drawMap(ctx, map, camera, mockSprites(), power, null, { view: VIEW.SURFACE }));
});
