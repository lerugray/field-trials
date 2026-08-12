import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOTTOM_HUD_ASSIST_TEXT, BOTTOM_HUD_CONTROL_TEXT, BOTTOM_HUD_SCRIM_KEY,
  BOTTOM_HUD_SCRIM_OPACITY, BOTTOM_HUD_TEXT_KEY, BOTTOM_HUD_UTILITY_TEXT,
  MARKER_LABEL_SCRIM_KEY, MARKER_LABEL_SCRIM_OPACITY, MARKER_LABEL_TEXT,
  MARKER_LABEL_TEXT_KEY, WAYPOINT_FLOATER_KIND, bottomHudLayout, bottomHudModel, floaterRenderModel,
  hudModel, markerLabelLayout, markerLabelModel,
} from '../src/render/hud.js';
import { PALETTE, hexToRgb } from '../src/render/palette.js';
import { createGame } from '../src/sim/game.js';
import { equipWeapon } from '../src/sim/equipment.js';
import { gainXp } from '../src/sim/stats.js';
import { textWidth } from '../src/render/pixelfont.js';

test('hud: model reflects starting state', () => {
  const m = hudModel(createGame());
  assert.equal(m.hp, 37);
  assert.equal(m.maxHP, 37);
  assert.equal(m.hpPct, 1);
  assert.equal(m.level, 0);
  assert.equal(m.xpToNext, 50);
  assert.equal(m.gold, 30);
  assert.equal(m.weaponName, 'short blade');
  assert.equal(m.bare, false);
});

test('hud: bare hands is flagged in the model', () => {
  const g = createGame();
  equipWeapon(g.loadout, 'bare-hands');
  assert.equal(hudModel(g).bare, true);
});

test('hud: hpPct clamps and tracks damage', () => {
  const g = createGame();
  g.progress.hp = 0;
  assert.equal(hudModel(g).hpPct, 0);
  g.progress.hp = -5;
  assert.equal(hudModel(g).hpPct, 0);
});

test('hud: surfaces XP-at-risk and the death-marker indicator', () => {
  const g = createGame();
  g.progress.totalXp = 70; g.progress.level = 1; // 20 above the L1 floor
  assert.equal(hudModel(g).xpAtRisk, 20);
  assert.equal(hudModel(g).marker, null);
  // With a marker to the right of the player, the model gives direction + xp.
  g.marker = { xp: 12, x: 500, y: 0 };
  g.player.x = 100;
  const m = hudModel(g);
  assert.equal(m.marker.xp, 12);
  assert.equal(m.marker.dir, 1);
});

test('hud: xpToNext updates after gaining XP; MAX at cap', () => {
  const g = createGame();
  gainXp(g.progress, 30);
  assert.equal(hudModel(g).xpToNext, 20);
  gainXp(g.progress, 9_999_999);
  assert.equal(hudModel(g).xpToNext, 0); // rendered as MAX
  assert.equal(hudModel(g).level, 9);
});

test('hud: bottom hint uses an opaque carved-channel contrast pair inside the logical frame', () => {
  const layout = bottomHudLayout(256, 240, 1);
  assert.deepEqual(layout, { x: 4, y: 226, w: 248, h: 12, textY: 229 });
  const luminance = (key) => {
    const channels = hexToRgb(PALETTE[key]).map((value) => value / 255).map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const high = luminance(BOTTOM_HUD_TEXT_KEY); const low = luminance(BOTTOM_HUD_SCRIM_KEY);
  assert.equal(BOTTOM_HUD_SCRIM_OPACITY, 1, 'terrain cannot bleed through the text channel');
  assert.ok((high + 0.05) / (low + 0.05) >= 7, 'bottom text/backing clears AAA contrast');
});

test('hud: bottom hint model covers normal, struggling, assisted, and cleared play states', () => {
  const g = createGame();
  g.settings = { assist: false };
  assert.deepEqual(bottomHudModel('play', g), [BOTTOM_HUD_CONTROL_TEXT, BOTTOM_HUD_UTILITY_TEXT]);
  g.deaths = 3;
  assert.deepEqual(bottomHudModel('play', g), [BOTTOM_HUD_ASSIST_TEXT, BOTTOM_HUD_CONTROL_TEXT, BOTTOM_HUD_UTILITY_TEXT]);
  g.settings.assist = true;
  assert.deepEqual(bottomHudModel('play', g), [BOTTOM_HUD_CONTROL_TEXT, BOTTOM_HUD_UTILITY_TEXT]);
  g.cleared = true;
  assert.deepEqual(bottomHudModel('play', g), []);
  g.cleared = false;
  assert.deepEqual(bottomHudModel('campaign-clear', g), []);
});

test('hud: nearby waypoint label is compact, opaque, and cannot collide with either bottom bar', () => {
  const g = createGame();
  g.checkpoints = [{ x: 140, y: 208 }];
  g.camera = { x: 16, y: 0 };
  Object.assign(g.player, { x: 132, y: 208 });
  const model = markerLabelModel(g);
  assert.deepEqual(model, { text: MARKER_LABEL_TEXT, anchorX: 124, anchorY: 180 });
  const single = markerLabelLayout(model.text, model.anchorX, model.anchorY, 256, bottomHudLayout(256, 240, 1).y);
  const double = markerLabelLayout(model.text, 128, 232, 256, bottomHudLayout(256, 240, 2).y);
  assert.equal(single.w, textWidth(MARKER_LABEL_TEXT) + 12, 'plate is sized to its label');
  assert.ok(single.y + single.h <= bottomHudLayout(256, 240, 1).y - 2);
  assert.ok(double.y + double.h <= bottomHudLayout(256, 240, 2).y - 2);
  assert.equal(MARKER_LABEL_SCRIM_OPACITY, 1, 'terrain cannot bleed through the marker channel');
  const relative = (key) => {
    const channels = hexToRgb(PALETTE[key]).map((value) => value / 255).map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  assert.ok((relative(MARKER_LABEL_TEXT_KEY) + 0.05) / (relative(MARKER_LABEL_SCRIM_KEY) + 0.05) >= 7);
  g.player.x = 200;
  assert.equal(markerLabelModel(g), null, 'contextual label stays attached to waypoint proximity');
});

test('hud: visible marker plate suppresses only the waypoint floater', () => {
  const waypoint = { txt: 'WAYPOINT', kind: WAYPOINT_FLOATER_KIND, life: 50 };
  const rested = { txt: 'RESTED', life: 50 };
  assert.deepEqual(floaterRenderModel([waypoint, rested], { text: MARKER_LABEL_TEXT }), [rested]);
});

test('hud: hidden marker plate preserves the waypoint floater unchanged', () => {
  const floaters = [{ txt: 'WAYPOINT', kind: WAYPOINT_FLOATER_KIND, life: 31, y: 142.7 }];
  assert.equal(floaterRenderModel(floaters, null), floaters);
  assert.deepEqual(floaterRenderModel(floaters, null), floaters);
});
