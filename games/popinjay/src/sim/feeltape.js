// feeltape.js — the GOLDEN FEEL TAPE (DESIGN-SEED M1 exit + verification bar: the
// signature physics measured once at M1 and asserted within tolerance at every later
// milestone; a tape-regeneration diff surfaces any drift). Pure sim — not imported by
// the browser build (so no bundle-scope concern).
//
// The tape pins signature law #1 (exact periodic parabolas + symmetric splits) and
// the wire's travel (law #2 support): bounce period + launch speed + apex per class,
// the split's child launch velocity and symmetry, the wire px/tick, and a sampled
// one-period arc of the Grand so the exact parabola SHAPE is regression-locked.

import { CLASS_ORDER, TICK_HZ, WIRE, DT } from '../tuning.js';
import { Balloon, classPhysics } from './balloon.js';

const ftRound = (v) => Math.round(v * 1e4) / 1e4;

export function measureFeelTape() {
  const classes = {};
  for (const c of CLASS_ORDER) {
    const p = classPhysics(c);
    classes[c] = {
      period: p.period,
      launchSpeed: ftRound(p.launchSpeed),
      effectiveApex: ftRound(p.effectiveApex),
      radius: p.radius,
      hspeed: p.hspeed,
    };
  }

  // Split symmetry (law #1) — a Grand yields two mirror-image Parades.
  const parent = new Balloon({ cls: 'grand', x: 640, floorY: 740 });
  const kids = parent.split();
  const split = {
    parent: 'grand',
    child: kids[0].cls,
    childLaunchVy: ftRound(kids[0].vy),
    symmetric: kids[0].vy === kids[1].vy && kids[0].vxSign === -kids[1].vxSign,
  };

  // Wire travel (law #2 support) — pixels the tip climbs per tick.
  const wire = { speedPxPerTick: ftRound(WIRE.speed * DT), thickness: WIRE.thickness };

  // The Grand's one-period arc, sampled ~12 points (height above the rest line).
  const b = new Balloon({ cls: 'grand', x: 640, floorY: 740 });
  const P = classes.grand.period;
  const stepEvery = Math.max(1, Math.floor(P / 12));
  const grandArc = [];
  for (let t = 0; t <= P; t++) {
    if (t % stepEvery === 0) grandArc.push(ftRound(b.baseY - b.y));
    b.step();
  }

  return { version: 'M1', tickHz: TICK_HZ, classes, split, wire, grandArc };
}
