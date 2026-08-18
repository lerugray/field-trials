// wire.test.js — the signature-verb lifecycle (DESIGN-SEED §The wire; STUDY §2.2).
// Pure sim. The fire-control layer (single-slot, denied-fire, buffer) is tested at
// the World-integration level; this probes the projectile itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Wire, WIRE_HIT, WIRE_BROKE, WIRE_CEILING } from '../src/sim/wire.js';
import { Balloon } from '../src/sim/balloon.js';
import { Stage, authoredStageM1 } from '../src/sim/stage.js';

function runWire(wire, stage, balloons, maxTicks = 2000) {
  for (let t = 0; t < maxTicks; t++) {
    const o = wire.step(stage, balloons);
    if (o.type !== 'climb') return o;
  }
  throw new Error('wire never resolved');
}

test('a wire pops a balloon in its column and despawns the same tick', () => {
  const stage = authoredStageM1();
  const gTop = stage.solids.find((s) => s.id === 'ground').top;
  const b = new Balloon({ cls: 'grand', x: 80, floorY: gTop });
  // Fire in an OPEN column (x=80, left of the low platform) under the balloon.
  const w = new Wire({ x: 80, bottomY: gTop - 56, stage });
  const o = runWire(w, stage, [b]);
  assert.equal(o.type, WIRE_HIT);
  assert.equal(o.balloon, b);
  assert.equal(w.alive, false);
});

test('a wire fired away from every balloon runs to the stage ceiling', () => {
  const stage = authoredStageM1();
  const b = new Balloon({ cls: 'grand', x: 80, floorY: 700 });
  // Fire far from the balloon, in an open column (x=760 gap to the ceiling).
  const w = new Wire({ x: 760, bottomY: 700, stage });
  const o = runWire(w, stage, [b]);
  assert.equal(o.type, WIRE_CEILING);
  assert.equal(w.tipY, stage.bounds.top);
});

test('under-platform stop: a wire under cover halts at the underside (no ceiling)', () => {
  const stage = authoredStageM1();
  const lo = stage.solids.find((s) => s.id === 'plat-lo');
  const w = new Wire({ x: 300, bottomY: 700, stage }); // under plat-lo
  const o = runWire(w, stage, []);
  assert.equal(o.type, WIRE_CEILING);
  assert.equal(w.stopSolid.id, 'plat-lo');
  assert.equal(w.tipY, lo.bottom, 'tip halts at the platform underside, not the ceiling');
});

test('a wire reaching a breakable underside breaks the tile and despawns (no pop)', () => {
  const stage = authoredStageM1();
  const w = new Wire({ x: 640, bottomY: 700, stage }); // under brk-1
  const o = runWire(w, stage, []);
  assert.equal(o.type, WIRE_BROKE);
  assert.equal(o.solid.id, 'brk-1');
  assert.equal(stage.solids.find((s) => s.id === 'brk-1').intact, false, 'tile gone for the stage');
  // The column is now open to the ceiling for the next wire.
  const w2 = new Wire({ x: 640, bottomY: 700, stage });
  assert.equal(runWire(w2, stage, []).type, WIRE_CEILING);
});

test('two balloons on the wire the same tick: the LOWER (nearest muzzle) is hit', () => {
  const stage = authoredStageM1();
  // Two balloons in the same column at different heights; both overlap the segment
  // once the tip passes them. The one with the larger y (lower) must win.
  const lower = new Balloon({ cls: 'fair', x: 80, floorY: 700, y: 500, vy: 0 });
  const upper = new Balloon({ cls: 'fair', x: 80, floorY: 700, y: 300, vy: 0 });
  const w = new Wire({ x: 80, bottomY: 700, stage });
  // Single deterministic tick set: run until first non-climb.
  const o = runWire(w, stage, [upper, lower]);
  assert.equal(o.type, WIRE_HIT);
  assert.equal(o.balloon, lower, 'the lower balloon (closest to the muzzle) is the hit');
});

test('no tunnelling: a fast wire catches a small high balloon (swept segment)', () => {
  const stage = authoredStageM1();
  // A penny (smallest, fastest) high up in an open column; even one tick of the fast
  // wire must not skip past it — the segment spans muzzle→tip.
  const penny = new Balloon({ cls: 'penny', x: 80, floorY: 700, y: 120, vy: 0 });
  const w = new Wire({ x: 80, bottomY: 700, stage });
  assert.equal(runWire(w, stage, [penny]).type, WIRE_HIT);
});

test('wire serialize/restore resumes an in-flight shot against the stage', () => {
  const stage = authoredStageM1();
  const w = new Wire({ x: 300, bottomY: 700, stage });
  for (let t = 0; t < 5; t++) w.step(stage, []);
  const snap = JSON.parse(JSON.stringify(w.serialize()));
  const w2 = Wire.fromSerialized(snap, stage);
  assert.equal(w2.x, w.x);
  assert.equal(w2.tipY, w.tipY);
  assert.equal(w2.stopSolid.id, 'plat-lo');
});
