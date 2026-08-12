import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOLBAR_TOOLS, buildToolbar, hitToolbar, overToolbar, inRect, buildQueryWindow,
  buildFavorWindow, favorHit, buildDisasterMenu, disasterHit, buildTopBar,
  toolbarTooltipLines, toolbarShortcut, toolLabel, buildToolbarTooltip,
  buildTitleScreen, titleScreenHit,
  buildStartMenu, startMenuHit,
} from '../src/ui.js';
import { TOOL, TOOL_COST } from '../src/tools.js';
import { GOD_LIST } from '../src/gods.js';

test('the toolbar carries every tool in order (M6: gods layer adds the University)', () => {
  const tools = TOOLBAR_TOOLS.map((t) => t.tool);
  assert.deepEqual(tools, [
    TOOL.QUERY, TOOL.BULLDOZE, TOOL.ROAD, TOOL.POWERLINE,
    TOOL.GASWORKS, TOOL.WHALEOIL,
    TOOL.ZONE_R, TOOL.ZONE_C, TOOL.ZONE_I,
    TOOL.CONSTABULARY, TOOL.ASYLUM, TOOL.CHAPEL, TOOL.SHRINE, TOOL.UNIVERSITY,
  ]);
});

test('the favor window has a close box and a row per god', () => {
  const w = buildFavorWindow(1280, 800);
  assert.equal(w.rows.length, GOD_LIST.length);
  assert.deepEqual(favorHit(w, w.close.x + 2, w.close.y + 2), { type: 'close' });
  assert.equal(favorHit(w, w.frame.x - 50, w.frame.y - 50), null);
  for (const r of w.rows) {
    assert.ok(r.bar.x >= w.frame.x && r.bar.x + r.bar.w <= w.frame.x + w.frame.w);
  }
});

test('the disasters menu summons the matching god', () => {
  const m = buildDisasterMenu(1280, 800);
  assert.equal(m.rows.length, GOD_LIST.length);
  const row = m.rows[2];
  const hit = disasterHit(m, row.rect.x + 5, row.rect.y + row.rect.h / 2);
  assert.deepEqual(hit, { type: 'summon', god: row.god });
  assert.deepEqual(disasterHit(m, m.close.x + 2, m.close.y + 2), { type: 'close' });
});

test('the top bar carries the Gods and Wrath buttons clear of the speeds', () => {
  const tb = buildTopBar(1280);
  assert.ok(tb.gods && tb.disasters && tb.save && tb.mute);
  assert.ok(tb.mute.x < tb.save.x && tb.save.x < tb.disasters.x && tb.disasters.x < tb.gods.x && tb.gods.x < tb.ledger.x);
  assert.ok(tb.mute.x > 0);
});

test('the title screen offers New Game, Quickstart, and a gated Continue', () => {
  const empty = buildTitleScreen(1280, 800);
  assert.deepEqual(titleScreenHit(empty, empty.newGame.x + 4, empty.newGame.y + 4), { type: 'new' });
  assert.deepEqual(titleScreenHit(empty, empty.quickstart.x + 4, empty.quickstart.y + 4), { type: 'quickstart' });
  assert.equal(titleScreenHit(empty, empty.continueGame.x + 4, empty.continueGame.y + 4), null);
  const saved = buildTitleScreen(1280, 800, { canContinue: true });
  assert.deepEqual(titleScreenHit(saved, saved.continueGame.x + 4, saved.continueGame.y + 4), { type: 'continue' });
});

test('the start menu still surfaces the Quickstart link', () => {
  const m = buildStartMenu(1280, 800);
  assert.ok(m.quickstart, 'start menu has a quickstart row');
  assert.deepEqual(startMenuHit(m, m.quickstart.rect.x + 4, m.quickstart.rect.y + 4), { type: 'quickstart' });
});

test('the title screen layout keeps the wordmark, buttons, and footer inside the plate', () => {
  const t = buildTitleScreen(1280, 800);
  assert.ok(t.wordmark.x >= t.frame.x && t.wordmark.x + t.wordmark.w <= t.frame.x + t.frame.w);
  assert.ok(t.newGame.y > t.wordmark.y + t.wordmark.h);
  assert.ok(t.quickstart.y > t.continueGame.y + t.continueGame.h);
  assert.ok(t.footer.y + t.footer.h <= t.frame.y + t.frame.h + 0.001);
});

test('toolbar buttons are inside the panel and do not overlap', () => {
  const tb = buildToolbar({});
  for (const b of tb.buttons) {
    assert.ok(b.rect.x >= tb.panel.x && b.rect.x + b.rect.w <= tb.panel.x + tb.panel.w);
    assert.ok(b.rect.y >= tb.panel.y && b.rect.y + b.rect.h <= tb.panel.y + tb.panel.h);
  }
  for (let i = 1; i < tb.buttons.length; i++) {
    const prev = tb.buttons[i - 1].rect;
    const cur = tb.buttons[i].rect;
    assert.ok(cur.y >= prev.y + prev.h, 'buttons overlap vertically');
  }
});

test('hitToolbar returns the tool under a point, null outside', () => {
  const tb = buildToolbar({});
  const road = tb.buttons.find((b) => b.tool === TOOL.ROAD).rect;
  assert.equal(hitToolbar(tb, road.x + road.w / 2, road.y + road.h / 2), TOOL.ROAD);
  // A point far to the right is off the toolbar.
  assert.equal(hitToolbar(tb, 5000, 5000), null);
});

test('overToolbar covers the whole panel', () => {
  const tb = buildToolbar({});
  assert.equal(overToolbar(tb, tb.panel.x + 1, tb.panel.y + 1), true);
  assert.equal(overToolbar(tb, tb.panel.x + tb.panel.w + 50, tb.panel.y), false);
});

// The palette tooltip's content (Ray's hover-popup ask): every square icon gets a tooltip, and it
// is sourced from real game data (TOOLBAR_TOOLS' own label, TOOL_COST, and the actually-reachable
// number-key shortcuts) -- never invented text.
test('every palette entry has a tooltip, sourced from its real label/cost/shortcut', () => {
  for (const { tool, label } of TOOLBAR_TOOLS) {
    const lines = toolbarTooltipLines(tool);
    assert.ok(Array.isArray(lines) && lines.length >= 1, `${tool}: no tooltip lines`);
    assert.equal(lines[0], label, `${tool}: tooltip name does not match the toolbar's own label`);
    const cost = TOOL_COST[tool];
    if (Number.isFinite(cost)) {
      assert.ok(lines.some((l) => l.includes(`$${cost}`)), `${tool}: its real cost ($${cost}) is missing from the tooltip`);
    }
    const shortcut = toolbarShortcut(tool);
    if (shortcut) {
      assert.ok(lines.some((l) => l.includes(`key ${shortcut}`)), `${tool}: its real shortcut (key ${shortcut}) is missing from the tooltip`);
    }
  }
});

test('toolbar shortcuts are only claimed where a single keypress can reach them', () => {
  // Query is tool index 0 -> key 1; Industrial is index 8 -> key 9 (a real single digit).
  assert.equal(toolbarShortcut(TOOL.QUERY), 1);
  assert.equal(toolbarShortcut(TOOL.ZONE_I), 9);
  // Everything from Constabulary onward (index 9+) has no single-key shortcut -- '10'-'14' never
  // arrives as one keydown event, and the tooltip must not invent one.
  for (const tool of [TOOL.CONSTABULARY, TOOL.ASYLUM, TOOL.CHAPEL, TOOL.SHRINE, TOOL.UNIVERSITY]) {
    assert.equal(toolbarShortcut(tool), null, `${tool}: should have no reachable shortcut`);
    const lines = toolbarTooltipLines(tool);
    assert.ok(!lines.some((l) => l.includes('key ')), `${tool}: tooltip claims a shortcut it does not have`);
  }
  // QUERY has no treasury cost -- the tooltip must not print a dollar figure for it.
  assert.equal(TOOL_COST[TOOL.QUERY], undefined);
  assert.ok(!toolbarTooltipLines(TOOL.QUERY).some((l) => l.includes('$')), 'Query should not claim a cost');
});

test('the player-facing tool name is the palette label, never the raw id', () => {
  assert.equal(toolLabel(TOOL.PIPE), 'Water Main');
  assert.equal(toolLabel(TOOL.PUMPHOUSE), 'Pump House');
  assert.equal(toolLabel(TOOL.ROAD), 'Road');
});

test('the palette tooltip popup stays inside the viewport for every button, even the lowest one', () => {
  const tb = buildToolbar({});
  for (const vp of [[1280, 800], [1440, 900], [2560, 1440]]) {
    const [vw, vh] = vp;
    for (const b of tb.buttons) {
      const lines = toolbarTooltipLines(b.tool);
      const t = buildToolbarTooltip(b.rect, lines, vw, vh);
      assert.ok(t.x >= 0 && t.y >= 0, `${b.tool} @ ${vw}x${vh}: tooltip starts off-screen`);
      assert.ok(t.x + t.w <= vw, `${b.tool} @ ${vw}x${vh}: tooltip clips the right edge`);
      assert.ok(t.y + t.h <= vh, `${b.tool} @ ${vw}x${vh}: tooltip clips the bottom edge`);
    }
  }
});

test('inRect boundary behaviour', () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };
  assert.equal(inRect(r, 10, 10), true);
  assert.equal(inRect(r, 30, 30), true);
  assert.equal(inRect(r, 9, 20), false);
  assert.equal(inRect(r, 31, 20), false);
});

test('query window layout: close box sits inside the title bar', () => {
  const q = buildQueryWindow(100, 80, { lines: 4 });
  assert.ok(inRect(q.titleBar, q.close.x + q.close.w / 2, q.close.y + q.close.h / 2));
  // Body sits below the title bar and inside the frame.
  assert.equal(q.body.y, q.frame.y + q.titleH);
  assert.ok(q.body.y + q.body.h <= q.frame.y + q.frame.h + 0.001);
  // Height grows with the number of lines.
  const bigger = buildQueryWindow(100, 80, { lines: 8 });
  assert.ok(bigger.frame.h > q.frame.h);
});

// --- chrome text-scale (M7) ---------------------------------------------------------------
import { setChromeScale, getChromeScale, cycleChromeScale, CHROME_SCALES } from '../src/ui.js';

test('chrome scale cycles through the ring and grows the layout', () => {
  setChromeScale(1);
  const base = buildTopBar(1280);
  const favBase = buildFavorWindow(1280, 800);
  const s = cycleChromeScale();
  assert.ok(CHROME_SCALES.includes(s) && s > 1, 'cycles to a larger scale');
  const big = buildTopBar(1280);
  const favBig = buildFavorWindow(1280, 800);
  assert.ok(big.panel.h > base.panel.h, 'top bar grows with the scale');
  assert.ok(favBig.frame.h > favBase.frame.h, 'the favor window grows with the scale');
  // The button ordering still holds at the larger scale.
  assert.ok(big.textscale.x < big.mute.x && big.mute.x < big.disasters.x);
  setChromeScale(1); // leave the module at the default for other tests
  assert.equal(getChromeScale(), 1);
});

// --- keyboard chrome: the Ledger focus list (M7) -------------------------------------------
import { buildBudgetWindow, budgetControls, budgetHit } from '../src/ui.js';

test('budgetControls lists every tax +/-, ordinance, and the close, matching the click actions', () => {
  const layout = buildBudgetWindow(1280, 800);
  const controls = budgetControls(layout);
  // Two per tax class + one per ordinance + the close box.
  const expected = layout.taxRows.length * 2 + layout.ordRows.length + 1;
  assert.equal(controls.length, expected);
  // Each control's rect hit-tests to the same action the keyboard would dispatch.
  for (const c of controls) {
    if (c.action.type === 'close') continue;
    const hit = budgetHit(layout, c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2);
    assert.deepEqual(hit, c.action, `control at ${JSON.stringify(c.action)} maps to its click`);
  }
  assert.deepEqual(controls[controls.length - 1].action, { type: 'close' });
});
