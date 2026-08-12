import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LitPainter } from '../src/render/lit.js';
import {
  drawCareHearts, drawHandCursor, drawImpactFlash, drawMeadow, drawToyRoom, drawTournament,
  meadowLayout, meadowLights, toyRoomLayout, toyRoomLights, tournamentLayout, tournamentLights,
} from '../src/render/scene.js';

// The lit scenes are pure painting into a byte buffer — no DOM, no canvas — so
// they are exercised here for real rather than only through a screenshot. The
// screenshot proves it looks right; these prove it cannot crash, cannot paint
// outside the frame, and lays out sanely at every size the live UI produces.

// Every buffer size the shipped surfaces actually produce, plus the degenerate
// ones a mid-resize frame or a phone layout can hand us.
const SIZES = [
  [429, 230], // the stage at 1280x800
  [377, 150], // the battle arena
  [417, 99], // the Meadow overlay
  [95, 78], // the title splash diorama
  [240, 120], // a narrow phone stage
  [900, 240], // an ultrawide stage
  [40, 24], // pathological: smaller than most of the furniture
  [8, 8], // pathological: smaller than a single object
];

function allOpaque(p) {
  for (let i = 3; i < p.d.length; i += 4) if (p.d[i] !== 255) return false;
  return true;
}

function isBlank(p) {
  const first = [p.d[0], p.d[1], p.d[2]].join();
  for (let i = 4; i < p.d.length; i += 4) {
    if ([p.d[i], p.d[i + 1], p.d[i + 2]].join() !== first) return false;
  }
  return true;
}

test('the toy room paints to completion at every live buffer size', () => {
  for (const [w, h] of SIZES) {
    const p = new LitPainter(w, h);
    assert.doesNotThrow(() => drawToyRoom(p, toyRoomLayout(w, h)), `toy room failed at ${w}x${h}`);
    assert.ok(allOpaque(p), `toy room left holes at ${w}x${h}`);
    if (w > 40) assert.ok(!isBlank(p), `toy room painted a flat field at ${w}x${h}`);
  }
});

test('the tournament paints to completion at every live buffer size', () => {
  for (const [w, h] of SIZES) {
    const p = new LitPainter(w, h);
    assert.doesNotThrow(() => drawTournament(p, tournamentLayout(w, h)), `tournament failed at ${w}x${h}`);
    assert.ok(allOpaque(p), `tournament left holes at ${w}x${h}`);
    if (w > 40) assert.ok(!isBlank(p), `tournament painted a flat field at ${w}x${h}`);
  }
});

test('the Meadow paints to completion at every live buffer size', () => {
  for (const [w, h] of SIZES) {
    const p = new LitPainter(w, h);
    assert.doesNotThrow(() => drawMeadow(p, meadowLayout(w, h)), `meadow failed at ${w}x${h}`);
    assert.ok(allOpaque(p), `meadow left holes at ${w}x${h}`);
    if (w > 40) assert.ok(!isBlank(p), `meadow painted a flat field at ${w}x${h}`);
  }
});

test('the toy room layout keeps its furniture in the right order, at any size', () => {
  for (const [w, h] of SIZES) {
    const L = toyRoomLayout(w, h);
    assert.ok(L.dadoY < L.floorY, `${w}x${h}: the dado rail must sit above the floor line`);
    assert.ok(L.floorY < L.pet.ground, `${w}x${h}: the pet must stand below the floor line`);
    assert.ok(L.pet.ground <= h, `${w}x${h}: the pet's ground line escaped the frame`);
    assert.ok(L.lamp.shadeY < L.dadoY, `${w}x${h}: the lamp must hang above the wainscot`);
    assert.ok(L.lamp.bulbY > L.lamp.shadeY, `${w}x${h}: the bulb sits under its shade`);
    // the left group and the right group must not swap sides
    assert.ok(L.toybox.x < L.machine.x, `${w}x${h}: the toybox drifted right of the machine`);
    assert.ok(L.poster.x < L.window.x, `${w}x${h}: the poster drifted right of the window`);
    // every object stays inside the frame
    assert.ok(L.machine.x + L.machine.w <= w, `${w}x${h}: the snack machine overhangs the frame`);
    assert.ok(L.window.x + L.window.w <= w, `${w}x${h}: the window overhangs the frame`);
    assert.ok(L.rug.x - L.rug.rx >= -w, `${w}x${h}: the rug is wider than the room`);
    assert.ok(L.u > 0, 'the size unit must be positive');
  }
});

test('the tournament layout stacks banner, crowd and ring in that order', () => {
  for (const [w, h] of SIZES) {
    const L = tournamentLayout(w, h);
    assert.ok(L.banner.y < L.buntingA, `${w}x${h}: the banner must hang above the bunting`);
    assert.ok(L.buntingA < L.buntingB, `${w}x${h}: the bunting swags are out of order`);
    assert.ok(L.tiers.length >= 2, `${w}x${h}: the crowd needs at least two tiers`);
    for (let i = 1; i < L.tiers.length; i++) {
      assert.ok(L.tiers[i].y > L.tiers[i - 1].y, `${w}x${h}: the bleacher tiers are out of order`);
      assert.ok(L.tiers[i].h > 0, `${w}x${h}: a tier has no height`);
    }
    assert.ok(L.tiers[L.tiers.length - 1].y < L.matCy, `${w}x${h}: the crowd sank into the ring`);
    // the fighters stand ON the mat
    assert.ok(L.ground >= L.matCy && L.ground <= L.matCy + L.matRy,
      `${w}x${h}: the fighters are not standing on the mat`);
    assert.ok(L.matRx > 0 && L.matRy > 0);
    assert.equal(L.spots.length, 3, 'three overhead rigs, two warm and one cool');
    for (const s of L.spots) assert.ok(s.y < L.matCy, `${w}x${h}: a rig hangs below the ring`);
  }
});

test('the Meadow layout keeps the moon in the sky and the line on the ground', () => {
  for (const [w, h] of SIZES) {
    const L = meadowLayout(w, h);
    assert.ok(L.horizon < L.ground, `${w}x${h}: the ground line must sit below the horizon`);
    assert.ok(L.ground <= h, `${w}x${h}: the ground line escaped the frame`);
    assert.ok(L.moon.y < L.horizon, `${w}x${h}: the moon fell below the horizon`);
    assert.ok(L.moon.x >= 0 && L.moon.x <= w, `${w}x${h}: the moon left the frame`);
  }
});

test('every scene light rig is well formed', () => {
  const rigs = [
    ['toy room', toyRoomLights(toyRoomLayout(429, 230))],
    ['tournament', tournamentLights(tournamentLayout(377, 150))],
    ['meadow', meadowLights(meadowLayout(417, 99))],
  ];
  for (const [name, lights] of rigs) {
    assert.ok(lights.length >= 2, `${name}: a scene needs more than one source to read as lit`);
    for (const L of lights) {
      assert.ok(Number.isFinite(L.x) && Number.isFinite(L.y), `${name}: a light has no position`);
      assert.ok(L.s > 0, `${name}: a light with no strength is not a light`);
      assert.ok(L.range > 0, `${name}: a light needs a falloff range`);
      assert.ok(/^#[0-9a-fA-F]{6}$/.test(L.col), `${name}: a light has no colour`);
    }
  }
});

test('the scenes are deterministic — the same size bakes byte-identical twice', () => {
  // The stage re-bakes on every resize, so a non-deterministic scene would make
  // the room quietly rearrange itself as the window moves.
  const cases = [
    ['toyroom', (p, w, h) => drawToyRoom(p, toyRoomLayout(w, h))],
    ['tournament', (p, w, h) => drawTournament(p, tournamentLayout(w, h))],
    ['meadow', (p, w, h) => drawMeadow(p, meadowLayout(w, h))],
  ];
  for (const [name, fn] of cases) {
    const a = new LitPainter(200, 120); fn(a, 200, 120);
    const b = new LitPainter(200, 120); fn(b, 200, 120);
    assert.deepEqual(Array.from(a.d), Array.from(b.d), `${name} is not deterministic`);
  }
});

test('LEAN B: a crowd list changes who is in the stands, and an empty one is legal', () => {
  const L = tournamentLayout(377, 150);
  const plain = new LitPainter(377, 150);
  drawTournament(plain, L, null);
  const seated = new LitPainter(377, 150);
  drawTournament(seated, L, [
    { archetype: 'critter', eyeCol: '#FFD0D0' },
    { archetype: 'spectral', eyeCol: '#D0FFD0' },
    { archetype: 'orb', eyeCol: '#D0D0FF' },
  ]);
  assert.notDeepEqual(Array.from(plain.d), Array.from(seated.d),
    'the retirees must actually change the crowd');
  // an empty list must fall back rather than divide by zero
  const empty = new LitPainter(377, 150);
  assert.doesNotThrow(() => drawTournament(empty, L, []));
  // and an unknown archetype must not blank a seat
  const odd = new LitPainter(377, 150);
  assert.doesNotThrow(() => drawTournament(odd, L, [{ archetype: 'not-a-real-rig' }]));
});

test('LEAN A: the hand cursor paints, stays in frame, and never crashes at an edge', () => {
  const L = toyRoomLayout(429, 230);
  const lights = toyRoomLights(L);
  for (const [x, y] of [[214, 150], [0, 0], [429, 230], [-40, -40], [800, 500]]) {
    const p = new LitPainter(429, 230);
    p.clear('#000000');
    assert.doesNotThrow(() => drawHandCursor(p, x, y, lights, L.u, { contact: true }),
      `the hand cursor failed at ${x},${y}`);
    assert.ok(allOpaque(p), 'the hand cursor punched a hole in the frame');
  }
  // over the pet it must actually put ink down
  const p = new LitPainter(429, 230);
  p.clear('#000000');
  drawHandCursor(p, 214, 150, lights, L.u, { contact: false });
  assert.ok(!isBlank(p), 'the hand cursor painted nothing');
});

test('the care hearts and the impact flash paint without escaping the frame', () => {
  for (const [x, y] of [[100, 60], [0, 0], [200, 120], [-30, -30], [400, 400]]) {
    const p = new LitPainter(200, 120);
    p.clear('#000000');
    assert.doesNotThrow(() => drawCareHearts(p, x, y, 1, 0.9));
    assert.doesNotThrow(() => drawImpactFlash(p, x, y, 1, 1));
    assert.ok(allOpaque(p));
  }
  // a zero-strength flash is a legal no-op (the tail of the burst)
  const p = new LitPainter(60, 60);
  p.clear('#000000');
  assert.doesNotThrow(() => drawImpactFlash(p, 30, 30, 1, 0));
});
