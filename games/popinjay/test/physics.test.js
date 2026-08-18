// physics.test.js — the M1 balloon-physics probe (DESIGN-SEED signature law #1;
// CLAUDE.md hard rule 3: "exact periodic parabolas... symmetric splits — probe-
// verified to the tick"). Pure sim, no browser (hard rule 6).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Balloon, classPhysics, _resetIds } from '../src/sim/balloon.js';
import { Stage } from '../src/sim/stage.js';
import { CLASS_ORDER, DT, GRAVITY } from '../src/tuning.js';

// A minimal two-surface stage for the platform-collision probes.
function platformStage(platTop) {
  return new Stage({
    bounds: { left: 0, right: 1280, top: 0, bottom: 800 },
    solids: [
      { id: 'ground', kind: 'ground', x0: 0, x1: 1280, top: 740, bottom: 800 },
      { id: 'p', kind: 'platform', x0: 200, x1: 600, top: platTop, bottom: platTop + 24 },
    ],
    ladders: [], spawns: [],
  });
}

// The floor used across the probes (arbitrary; periodicity is floor-independent).
const FLOOR = 700;

test('every class derives an integer bounce period and a period-consistent launch speed', () => {
  for (const cls of CLASS_ORDER) {
    const p = classPhysics(cls);
    assert.ok(Number.isInteger(p.period), `${cls} period must be an integer tick count`);
    assert.ok(p.period >= 2, `${cls} period too small`);
    // U = a·(P+1)/2 is the exact closure relation the periodicity depends on.
    const A = GRAVITY * DT;
    assert.ok(Math.abs(p.launchSpeed - (A * (p.period + 1)) / 2) < 1e-9,
      `${cls} launch speed must equal a·(P+1)/2`);
    assert.ok(p.effectiveApex > 0);
  }
});

test('a bouncing balloon is EXACTLY periodic to the tick (bit-identical arc every period)', () => {
  const p = classPhysics('grand');
  const b = new Balloon({ cls: 'grand', x: 400, floorY: FLOOR });
  // Record ~3 periods of vertical state with NO walls (isolate the parabola).
  const N = p.period * 3 + 5;
  const ys = [], vys = [], bounces = [];
  for (let t = 0; t < N; t++) {
    ys.push(b.y); vys.push(b.vy);
    if (b.bouncedThisTick) bounces.push(t);
    b.step();
  }
  // y(t) and vy(t) must repeat bit-exactly one period later.
  for (let t = 0; t + p.period < N; t++) {
    assert.equal(ys[t], ys[t + p.period], `y not periodic at t=${t}`);
    assert.equal(vys[t], vys[t + p.period], `vy not periodic at t=${t}`);
  }
  // The observed bounce interval must be constant and equal the derived period.
  for (let i = 1; i < bounces.length; i++) {
    assert.equal(bounces[i] - bounces[i - 1], p.period, 'bounce interval drifted');
  }
});

test('apex reached matches the derived effectiveApex and never sinks below the floor', () => {
  const p = classPhysics('parade');
  const b = new Balloon({ cls: 'parade', x: 300, floorY: FLOOR });
  let minY = Infinity, maxY = -Infinity;
  for (let t = 0; t < p.period * 2; t++) { minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); b.step(); }
  // Highest point (smallest y) is baseY - effectiveApex.
  assert.ok(Math.abs((b.baseY - minY) - p.effectiveApex) < 1e-6, 'apex mismatch');
  // Bottom never passes the rest line (the snap clamps overshoot).
  assert.ok(maxY <= b.baseY + 1e-9, 'balloon sank below its rest line');
  // The derived apex stays near the authored feel apex (integer-tick snap is small).
  assert.ok(Math.abs(p.effectiveApex - CLASS_apex('parade')) < 12, 'apex drifted far from authored feel');
});

test('a split is EXACTLY symmetric: two next-class children, mirror horizontal, identical vertical', () => {
  _resetIds();
  const parent = new Balloon({ cls: 'grand', x: 512, floorY: FLOOR });
  for (let t = 0; t < 20; t++) parent.step(); // move it mid-arc, off the floor
  const kids = parent.split();
  assert.equal(kids.length, 2);
  assert.equal(kids[0].cls, 'parade');
  assert.equal(kids[1].cls, 'parade');
  // Mirror horizontal.
  assert.equal(kids[0].vxSign, -kids[1].vxSign);
  assert.equal(kids[0].hspeed, kids[1].hspeed);
  // Identical spawn position and vertical state (perfect symmetry).
  assert.equal(kids[0].x, kids[1].x);
  assert.equal(kids[0].x, parent.x);
  assert.equal(kids[0].y, kids[1].y);
  assert.equal(kids[0].y, parent.y);
  assert.equal(kids[0].vy, kids[1].vy);
  assert.ok(kids[0].vy < 0, 'children must launch upward (shared kick)');
});

test('the smallest class pops (no split); the split tree is 15 hits / 8 pennies', () => {
  const penny = new Balloon({ cls: 'penny', x: 100, floorY: FLOOR });
  assert.deepEqual(penny.split(), [], 'penny must pop, not split');

  // Fully resolve a Grand: count every balloon that must be hit and the penny leaves.
  let frontier = [new Balloon({ cls: 'grand', x: 200, floorY: FLOOR })];
  let hits = 0, pennies = 0;
  while (frontier.length) {
    const next = [];
    for (const b of frontier) {
      hits++;
      if (b.cls === 'penny') pennies++;
      else next.push(...b.split());
    }
    frontier = next;
  }
  assert.equal(hits, 15, '1 Grand = 15 eventual hits');
  assert.equal(pennies, 8, '1 Grand = 8 Penny leaves');
});

test('side walls reflect the balloon, preserving |vx| (STUDY §1.4)', () => {
  const bounds = { left: 100, right: 300 };
  const b = new Balloon({ cls: 'fair', x: 290, floorY: FLOOR, vxSign: 1 });
  const speed = b.hspeed;
  let reflected = false;
  for (let t = 0; t < 200; t++) {
    b.step(bounds);
    if (b.vxSign === -1) { reflected = true; break; }
  }
  assert.ok(reflected, 'balloon should have reflected off the right wall');
  assert.equal(Math.abs(b.vx), speed, '|vx| must be preserved across a wall bounce');
  assert.ok(b.x <= bounds.right - b.radius + 1e-9, 'balloon kept inside the right wall');
});

test('a balloon bounces on a PLATFORM TOP, not through it (apex above the contact surface)', () => {
  const stage = platformStage(400);           // platform top at y=400
  const b = new Balloon({ cls: 'fair', x: 400, floorY: 740, y: 320, vy: 0 }); // above the platform
  let bounced = false;
  for (let t = 0; t < 200 && !bounced; t++) { b.step(null, stage); if (b.bouncedThisTick) bounced = true; }
  assert.ok(bounced, 'should bounce on the platform');
  assert.equal(b.baseY, 400 - b.radius, 'rest line sits on the platform top, not the ground');
  // And it is periodic ABOVE the platform (drift-free) — same rest line every bounce.
  let bounces = 0;
  for (let t = 0; t < classPhysics('fair').period * 2 + 2; t++) { b.step(null, stage); if (b.bouncedThisTick) { bounces++; assert.equal(b.baseY, 400 - b.radius); } }
  assert.ok(bounces >= 1);
});

test('a balloon reflects DOWN off a platform underside it rises into (STUDY §1.4)', () => {
  const stage = platformStage(520);            // underside at y=544
  // Launched from the ground under the platform; its arc rises into the underside.
  const b = new Balloon({ cls: 'fair', x: 400, floorY: 740 });
  let capped = false, vyAfter = 0;
  for (let t = 0; t < 200 && !capped; t++) { b.step(null, stage); if (b.cappedThisTick) { capped = true; vyAfter = b.vy; } }
  assert.ok(capped, 'the rising balloon should hit the platform underside');
  assert.ok(vyAfter > 0, 'after the underside hit it moves downward');
  assert.ok(b.y <= 544 + b.radius + 1e-6, 'it never passes up through the underside');
});

test('two balloons stepped identically stay bit-identical (determinism)', () => {
  const bounds = { left: 0, right: 1280 };
  const a = new Balloon({ cls: 'grand', x: 640, floorY: FLOOR, vxSign: 1, id: 1 });
  const b = new Balloon({ cls: 'grand', x: 640, floorY: FLOOR, vxSign: 1, id: 1 });
  for (let t = 0; t < 500; t++) { a.step(bounds); b.step(bounds); }
  assert.deepEqual(a.serialize(), b.serialize());
});

test('serialize/restore round-trips a mid-arc balloon byte-identically', () => {
  const bounds = { left: 0, right: 1280 };
  const ref = new Balloon({ cls: 'parade', x: 640, floorY: FLOOR, vxSign: -1, id: 9 });
  for (let t = 0; t < 137; t++) ref.step(bounds);
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = Balloon.fromSerialized(snap);
  for (let t = 0; t < 200; t++) { ref.step(bounds); resumed.step(bounds); }
  assert.deepEqual(resumed.serialize(), ref.serialize());
});

// Small helper: read the authored (feel) apex straight from tuning for the drift check.
import { CLASSES } from '../src/tuning.js';
function CLASS_apex(cls) { return CLASSES[cls].apex; }
