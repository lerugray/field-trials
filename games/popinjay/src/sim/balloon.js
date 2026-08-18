// balloon.js — the deterministic bouncing balloon (DESIGN-SEED signature law #1:
// "exact periodic parabolas, no flight randomness, symmetric splits"; STUDY §1.2-1.3).
//
// Pure sim: no `window`, no renderer, no Math.random. All motion is fixed-timestep
// float arithmetic with IDENTICAL operation order every tick, so it is bit-exact on
// any machine, and — critically — EXACTLY PERIODIC to the tick.
//
// How periodicity is guaranteed (the load-bearing trick):
//   The vertical launch speed U is DERIVED from an INTEGER bounce period P, not the
//   other way around. Under semi-implicit Euler with per-tick gravity a = g·dt, a
//   balloon launched at vy = -U from its rest line returns to that line exactly P
//   ticks later iff U = a·(P+1)/2. On floor contact we SNAP the balloon back to the
//   rest line and RESET vy to exactly -U (STUDY: "reset to a fixed apex each bounce
//   rather than accumulating velocity across bounces where float error could
//   drift"). Because every post-bounce arc starts from a bit-identical state, the
//   whole trajectory repeats with integer period P — verifiable to the tick.
//
// Designers author an apex (feel) in tuning.js; the sim snaps to the nearest
// integer-tick period and reports the apex it actually reaches (effectiveApex).

import { CLASSES, GRAVITY, DT, GORE } from '../tuning.js';

const A = GRAVITY * DT; // per-tick gravity impulse on vy (px/s added each tick)

// Derive the exact-integer-period physics for a size class. Memoized: pure fn of the
// (frozen) tuning table, so it is computed once per class.
const _physCache = new Map();
export function classPhysics(cls, weighted = false) {
  const key = weighted ? cls + ':w' : cls;
  const cached = _physCache.get(key);
  if (cached) return cached;

  const c = CLASSES[cls];
  if (!c) throw new Error(`classPhysics: unknown class "${cls}"`);

  // WEIGHTED GORES (locale 3): a heavier variant — deeper apex + faster horizontal —
  // but STILL derived to an exact integer period (the promise law holds for gores too).
  const apex = c.apex * (weighted ? GORE.apexScale : 1);
  const hspeed = c.hspeed * (weighted ? GORE.hspeedScale : 1);

  // Nearest integer bounce period P to the (scaled) apex, then U derived from P so
  // the discrete arc closes on an exact tick. (Continuous apex H ⇒ U=√(2gH) ⇒
  // P+1 = 2U/a; round P, then recompute U from the rounded P.)
  const P = Math.max(2, Math.round((2 * Math.sqrt(2 * GRAVITY * apex)) / A) - 1);
  const U = (A * (P + 1)) / 2; // launch speed (px/s, upward) — exact for period P

  // The apex the discrete arc actually reaches: max rise over one arc. Rising ticks
  // k=1..P/2ish; height(k) = -Σ contribution. We just walk the arc once (cheap, once
  // per class) so effectiveApex reflects the real integrator, not a continuous ideal.
  let y = 0, vy = -U, maxRise = 0;
  for (let k = 0; k < P; k++) {
    vy += A; y += vy * DT;
    const rise = -y; // y goes negative (up) then back to ~0
    if (rise > maxRise) maxRise = rise;
  }

  const phys = {
    cls,
    weighted,
    order: c.order,
    radius: c.radius,
    hspeed,                    // px/s horizontal (scaled for gores)
    splitsInto: c.splitsInto,  // next class down, or null (penny pops)
    score: c.score,
    period: P,                 // EXACT bounce period in ticks
    launchSpeed: U,            // px/s upward, re-applied every bounce (no drift)
    effectiveApex: maxRise,    // px the center actually rises above its rest line
  };
  _physCache.set(key, phys);
  return phys;
}

let _nextId = 1;
export function _resetIds() { _nextId = 1; } // test hygiene only

export class Balloon {
  // A balloon rests with its BOTTOM on `floorY`, so its center rides at
  // baseY = floorY - radius. Constructed "at the floor, just launched" by default
  // (y=baseY, vy=-U); split children pass an explicit (y, vy) for their free first
  // arc from the pop point.
  constructor({ cls, x, floorY, vxSign = 1, y = null, vy = null, id = null, entryTicks = 0, drip = false, weighted = false }) {
    const p = classPhysics(cls, weighted);
    this.id = id == null ? _nextId++ : id;
    this.cls = cls;
    this.weighted = !!weighted;
    this.radius = p.radius;
    this.hspeed = p.hspeed;
    this.floorY = floorY;
    this.baseY = floorY - p.radius; // center-y at rest on the floor
    this.x = x;
    this.vxSign = vxSign >= 0 ? 1 : -1;
    this.y = y == null ? this.baseY : y;
    this.vy = vy == null ? -p.launchSpeed : vy; // default: just launched upward
    this.bouncedThisTick = false;
    this._launchSpeed = p.launchSpeed;
    this.entryTicks = entryTicks | 0;  // half-speed entry window (drip); 0 = normal
    this.drip = !!drip;                // spawned by the closing-bell drip (lineage tag)
  }

  get vx() { return this.vxSign * this.hspeed; }

  // Advance one fixed tick. `bounds` (optional) = {left,right} side walls the balloon
  // reflects off, preserving |vx| (STUDY §1.4). `stage` (optional) makes the balloon
  // bounce off the nearest surface TOP below it (ground OR a platform — apex is
  // preserved above the CONTACT surface, STUDY §1.2) and reflect DOWN off a platform
  // UNDERSIDE it rises into (STUDY §1.4). With no stage it uses its fixed floorY —
  // the drift-free single-surface model the feel tape and periodicity probes assert.
  step(bounds, stage) {
    this.bouncedThisTick = false;
    this.cappedThisTick = false;

    // Horizontal: constant-speed sweep (HALF speed during a drip's entry window),
    // reflect off side walls (|vx| preserved).
    const hs = this.entryTicks > 0 ? this.hspeed * 0.5 : this.hspeed;
    if (this.entryTicks > 0) this.entryTicks -= 1;
    this.x += this.vxSign * hs * DT;
    // WIND BANDS (locale 2): a steady horizontal drift while inside a band — it SHEARS
    // the trajectory but never touches the vertical arc (periodicity law preserved).
    if (stage && stage.windBands) {
      for (const w of stage.windBands) { if (this.y >= w.y0 && this.y <= w.y1) this.x += w.vx * DT; }
    }
    if (bounds) {
      const lo = bounds.left + this.radius;
      const hi = bounds.right - this.radius;
      if (this.x < lo) { this.x = lo; this.vxSign = 1; }
      else if (this.x > hi) { this.x = hi; this.vxSign = -1; }
    }

    // Vertical: semi-implicit Euler. Bounce reset to the EXACT class launch speed on
    // every surface contact keeps periodicity drift-free (STUDY §1.2).
    this.vy += A;
    this.y += this.vy * DT;
    if (this.vy > 0) {
      // Falling: bounce off the nearest surface top below (dynamic with `stage`).
      const surfTop = stage ? stage.floorBelow(this.x, this.y).y : this.floorY;
      const base = surfTop - this.radius;
      if (this.y >= base) {
        this.y = base;                  // snap to the rest line above THIS surface
        this.vy = -this._launchSpeed;   // reset → the arc above this surface locks
        this.floorY = surfTop; this.baseY = base;
        this.bouncedThisTick = true;
      }
    } else if (this.vy < 0 && stage) {
      // Rising: reflect DOWN off a platform underside above it (a capped arc).
      const ceil = stage.ceilingAbove(this.x, this.y);
      if (ceil.solid) {
        const cap = ceil.y + this.radius;
        if (this.y <= cap) { this.y = cap; this.vy = -this.vy; this.cappedThisTick = true; }
      }
    }
    return this;
  }

  // Split into two children of the next class down, launched from THIS balloon's
  // current position with mirror-image horizontal velocities and a shared upward
  // kick (STUDY §1.3: "two of the next size down, opposite horizontal, shared
  // upward kick" — EXACTLY symmetric). Returns [] for the smallest class (a pop).
  // `skip` (Iron Gores on a weighted balloon) drops the children ONE class further
  // down — a heavier balloon shatters past the usual step.
  split(skip = false) {
    const p = classPhysics(this.cls, this.weighted);
    if (!p.splitsInto) return []; // penny: pops, no children
    let childCls = p.splitsInto;
    if (skip) { const cp = classPhysics(childCls); childCls = cp.splitsInto || childCls; }
    const childU = classPhysics(childCls, this.weighted).launchSpeed;
    const mk = (sign) => new Balloon({
      cls: childCls,
      x: this.x,
      floorY: this.floorY,
      vxSign: sign,
      y: this.y,
      vy: -childU, // shared upward kick — identical for both ⇒ symmetric arcs
      weighted: this.weighted, // gore children stay gores
    });
    return [mk(-1), mk(1)];
  }

  serialize() {
    return { id: this.id, cls: this.cls, x: this.x, y: this.y, vy: this.vy, vxSign: this.vxSign, floorY: this.floorY, entryTicks: this.entryTicks, drip: this.drip, weighted: this.weighted };
  }

  static fromSerialized(d) {
    return new Balloon({ cls: d.cls, x: d.x, floorY: d.floorY, vxSign: d.vxSign, y: d.y, vy: d.vy, id: d.id, entryTicks: d.entryTicks || 0, drip: !!d.drip, weighted: !!d.weighted });
  }
}
