// The legibility floor AS TESTS (M8 gate, DESIGN-SEED): contrast deltas for every entity on every
// ground, blocked-vs-buildable readable at a glance, and every blocked player action answered in
// world. "No clipped text" is the separate standing text-overflow detector (test/text-overflow).
//
// Contrast note: buildings and structures render with a dark ink outline, so their silhouette
// separates from ANY ground by that outline (we assert the outline itself reads on every ground);
// flat markers (zones), roads, scars, and the lamplit window are the color-only cases, tested by a
// straight RGB delta. The floors are set above the current art with margin, to catch a regression
// that would let something blend into its ground.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, canApply, STRUCTURE_INFO } from '../src/tools.js';
import { RAMP, ZONE_TINT, CHROME, hexToRgb, BASE, LIGHT, SHADOW } from '../src/palette.js';

function dist(h1, h2) {
  const a = hexToRgb(h1); const b = hexToRgb(h2);
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

// Every ground an entity can sit on (the terrain ramps at their base tone).
const GROUNDS = {
  grass: RAMP.grass[BASE], grassLight: RAMP.grass[LIGHT], beach: RAMP.beach[BASE],
  rock: RAMP.rock[BASE], dirt: RAMP.dirt[BASE], shallow: RAMP.shallow[BASE], deep: RAMP.deep[BASE],
};

test('the ink outline reads on every ground (so every outlined building/structure separates)', () => {
  for (const [name, ground] of Object.entries(GROUNDS)) {
    const d = dist(CHROME.ink, ground);
    assert.ok(d >= 40, `ink outline on ${name} too weak (${d.toFixed(0)})`);
  }
});

test('zone markers pop against the grass they mark', () => {
  for (const [zone, tint] of Object.entries(ZONE_TINT)) {
    for (const g of [GROUNDS.grass, GROUNDS.grassLight]) {
      const d = dist(tint, g);
      assert.ok(d >= 50, `${zone} marker too close to grass (${d.toFixed(0)})`);
    }
  }
});

test('a road carries a tone that separates it from any ground', () => {
  // The street is a ramp; its ruts/shoulders span shadow..highlight, so on any ground at least one
  // tone stands clear (the road reads even where its mid-tone is near the earth beneath it).
  //
  // It is RAMP.road that drawRoad actually lays down: the blue-hour pass split the cold grey street
  // off from brown bare earth, and a guard still pointed at `dirt` would have been measuring a ramp
  // no road is drawn in. Both are asserted, because bare earth is still a ground in its own right.
  for (const [name, ground] of Object.entries(GROUNDS)) {
    for (const [surface, ramp] of Object.entries({ road: RAMP.road, dirt: RAMP.dirt })) {
      const best = Math.max(...ramp.map((c) => dist(c, ground)));
      assert.ok(best >= 35, `the ${surface} cannot separate from ${name} (best ${best.toFixed(0)})`);
    }
  }
});

test('the lamplit window is the glow of life against its wall and roof', () => {
  const windows = ['#d0a848', '#e0b64c', '#c9a94a']; // gold LIGHT and the render's lit-window golds
  const bodies = [RAMP.clapboard[BASE], RAMP.clapboard[LIGHT], RAMP.slate[BASE], RAMP.slate[SHADOW], '#3f434e'];
  for (const w of windows) {
    for (const b of bodies) {
      const d = dist(w, b);
      assert.ok(d >= 55, `window ${w} on body ${b} too dim (${d.toFixed(0)})`);
    }
  }
});

test('disaster scars read against the ground they scar', () => {
  // These literals must track render.js. The flood scar flipped from dark teal to a lighter
  // foam-lit teal in the blue-hour pass, because the sea itself went near-black: a drowned lot has
  // to read LIGHTER than the tide around it now, and the old dark value no longer cleared the
  // shallows at all (this assertion is what caught it).
  const scars = { burnt: '#1c1712', overgrown: '#2f5a24', rubble: RAMP.rock[SHADOW], flooded: '#4a6f6a', rift: '#5a3a7a' };
  for (const [kind, color] of Object.entries(scars)) {
    for (const g of [GROUNDS.grass, GROUNDS.grassLight, GROUNDS.beach]) {
      const d = dist(color, g);
      assert.ok(d >= 22, `${kind} scar too close to ground (${d.toFixed(0)})`);
    }
  }
  assert.ok(dist(scars.flooded, GROUNDS.shallow) >= 28, 'a flood scar must read against the shallows it drowns');
});

test('each civic structure has an identifying accent that reads against its body', () => {
  // The accent colours (from render.js) that name each structure at a glance, vs plausible bodies.
  const accents = {
    shrine: '#8fdcc2', constabulary: '#2f5fa0', university: '#c3a8e0', asylum: '#e6d9a8', chapel: '#c9c2a8',
  };
  const bodies = [RAMP.slate[SHADOW], RAMP.slate[BASE], RAMP.clapboard[LIGHT], RAMP.rock[LIGHT], RAMP.rock[BASE]];
  for (const [kind, accent] of Object.entries(accents)) {
    const best = Math.max(...bodies.map((b) => dist(accent, b)));
    assert.ok(best >= 40, `${kind} accent does not read on its body (best ${best.toFixed(0)})`);
  }
});

// --- blocked-vs-buildable, and every blocked action answered in world -----------------------

function grassMap(cols = 6, rows = 6) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  return m;
}

const PLACEABLE = [
  TOOL.ROAD, TOOL.POWERLINE, TOOL.ZONE_R, TOOL.ZONE_C, TOOL.ZONE_I,
  TOOL.GASWORKS, TOOL.WHALEOIL, TOOL.CONSTABULARY, TOOL.ASYLUM, TOOL.CHAPEL, TOOL.SHRINE, TOOL.UNIVERSITY,
];
const NO_DASH = /[—–]/;

test('a blocked placement is always answered with a plain-English reason', () => {
  const m = grassMap();
  for (let r = 0; r < m.rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP; // a shore to block against
  for (const tool of PLACEABLE) {
    const check = canApply(m, tool, 0, 0); // on deep water
    assert.equal(check.ok, false, `${tool} should be blocked on water`);
    assert.ok(typeof check.reason === 'string' && check.reason.trim().length > 0, `${tool} gives a reason`);
    assert.ok(!NO_DASH.test(check.reason), `${tool} reason has no dashes: "${check.reason}"`);
    assert.match(check.reason, /[.!]$/, `${tool} reason reads as a sentence: "${check.reason}"`);
  }
});

test('blocked and buildable are distinct, readable states (the cursor colour follows canApply.ok)', () => {
  const m = grassMap();
  // A clear lot is buildable; the same lot, once built, refuses with a reason (the red-cursor state).
  const open = canApply(m, TOOL.CHAPEL, 3, 3);
  assert.equal(open.ok, true, 'a clear lot is buildable');
  m.tileAt(3, 3).structure = { kind: 'chapel' };
  const taken = canApply(m, TOOL.CHAPEL, 3, 3);
  assert.equal(taken.ok, false, 'an occupied lot is blocked');
  assert.ok(taken.reason && taken.reason.length > 0, 'and says why');
});

test('every civic structure names a real, plain refusal off dry land', () => {
  const m = grassMap();
  m.tileAt(2, 2).terrain = TERRAIN.SHALLOW;
  for (const kind of Object.keys(STRUCTURE_INFO)) {
    const tool = STRUCTURE_INFO[kind].tool;
    const check = canApply(m, tool, 2, 2);
    assert.equal(check.ok, false, `${kind} refuses the shallows`);
    assert.ok(check.reason && !NO_DASH.test(check.reason), `${kind} plain refusal`);
  }
});
