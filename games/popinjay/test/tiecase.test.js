// tiecase.test.js — the M3 tie-case fixtures (DESIGN-SEED M3: "tie-case fixtures").
// Simultaneous-resolution edge cases must be deterministic and arithmetic-preserving.
// Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Wire } from '../src/sim/wire.js';
import { Balloon } from '../src/sim/balloon.js';

function emptyWorld() { const w = new World({ seed: 1 }); w.balloons = []; return w; }

test('two Second-Barrel wires resolving the SAME tick both pop (no dropped hit)', () => {
  const w = emptyWorld(); w.equip('secondBarrel');
  const b1 = new Balloon({ cls: 'fair', x: 200, floorY: 700, y: 500, vy: 0, id: 1 });
  const b2 = new Balloon({ cls: 'fair', x: 900, floorY: 700, y: 500, vy: 0, id: 2 });
  w.balloons = [b1, b2];
  // Two wires, same muzzle line + same speed → they reach their targets the same tick.
  w.wires = [new Wire({ x: 200, bottomY: 600, stage: w.stage }), new Wire({ x: 900, bottomY: 600, stage: w.stage })];
  let popped = 0;
  for (let t = 0; t < 20 && popped < 2; t++) { w.step({}); popped += w.drainEvents().filter((e) => e.type === 'pop').length; }
  assert.equal(popped, 2, 'both wires landed their hit');
  // Each Fair → 2 Penny; both resolved ⇒ 4 Penny, split arithmetic preserved.
  assert.equal(w.balloons.length, 4);
  assert.ok(w.balloons.every((b) => b.cls === 'penny'));
});

test('a wire AND a sidearm bullet resolving the same tick both count', () => {
  const w = emptyWorld(); w.equip('gallerySidearm');
  const wireTarget = new Balloon({ cls: 'fair', x: 200, floorY: 700, y: 500, vy: 0, id: 1 });
  const shotTarget = new Balloon({ cls: 'grand', x: 900, floorY: 700, y: 300, vy: 0, id: 2 });
  w.balloons = [wireTarget, shotTarget];
  w.wires = [new Wire({ x: 200, bottomY: 600, stage: w.stage })];
  w.sidearmShots = [{ id: 1, x: 900, y: 360 }];
  let pops = 0;
  for (let t = 0; t < 30 && pops < 2; t++) { w.step({}); pops += w.drainEvents().filter((e) => e.type === 'pop').length; }
  assert.equal(pops, 2, 'both the wire and the bullet scored their pop');
});

test('the wire lower-balloon precedence holds under Second Barrel too (deterministic)', () => {
  // Two balloons in one wire column: the LOWER is hit; the wire despawns; the other
  // survives to be taken by the second slot next.
  const w = emptyWorld(); w.equip('secondBarrel');
  const lower = new Balloon({ cls: 'fair', x: 300, floorY: 700, y: 520, vy: 0, id: 1 });
  const upper = new Balloon({ cls: 'fair', x: 300, floorY: 700, y: 300, vy: 0, id: 2 });
  w.balloons = [upper, lower];
  w.wires = [new Wire({ x: 300, bottomY: 600, stage: w.stage })];
  let first = null;
  for (let t = 0; t < 20 && !first; t++) { w.step({}); const p = w.drainEvents().find((e) => e.type === 'pop'); if (p) first = p; }
  // The first pop is a Fair (the lower one), leaving the upper Fair + 2 new Pennies.
  assert.equal(first.cls, 'fair');
  assert.ok(w.balloons.some((b) => b.id === 2), 'the upper balloon survived the single wire');
});
