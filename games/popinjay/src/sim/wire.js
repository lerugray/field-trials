// wire.js — the WIRE, POPINJAY's signature verb (DESIGN-SEED §The wire; STUDY §2.2).
// Implement EXACTLY this lifecycle. Pure sim, no renderer.
//
// A wire is a vertical line HITBOX (never a surface): it is born at the player's x
// AT FIRE TIME (it does NOT follow the player), anchored at the muzzle, and its tip
// grows upward at `wireSpeed`. Per-tick resolution order (balloon-over-tile
// precedence is deliberate):
//   1. advance the tip up, clamped to the stop (the underside above the muzzle),
//   2. if a balloon overlaps the live segment, the LOWEST (closest to the muzzle)
//      one is hit → it splits, the wire despawns THE SAME TICK,
//   3. else if the tip reached a breakable underside → break the tile, wire despawns
//      (consumed, no pop); if it reached a platform/ceiling → despawn on arrival.
//
// Collision is an exact segment↔circle test, so a fast wire cannot tunnel past a
// small sphere between ticks (the segment always spans muzzle→tip; once the tip
// passes a sphere's y it is inside the segment and is caught).

import { WIRE, DT } from '../tuning.js';

const WIRE_EPS = 1e-6;
const SPEED = WIRE.speed * DT;   // px per tick
const HALF = WIRE.thickness / 2;

export const WIRE_CLIMB = 'climb';
export const WIRE_HIT = 'hit';       // popped a balloon
export const WIRE_BROKE = 'broke';   // broke a breakable tile
export const WIRE_CEILING = 'ceiling'; // reached a platform/stage ceiling

export const WIRE_ANCHORED = 'anchored'; // Sky Anchor: persisting as a wall

export class Wire {
  constructor({ x, bottomY, stage, speedScale = 1, anchorTicks = 0 }) {
    this.x = x;               // anchored at fire time — never follows the player
    this.bottomY = bottomY;   // the muzzle line (fixed)
    this.tipY = bottomY;      // grows upward (decreasing y)
    this.alive = true;
    this.outcome = WIRE_CLIMB;
    this.speedScale = speedScale;   // Quick Spool → 1.4
    this.anchorTicks = anchorTicks; // Sky Anchor → persists this long once it reaches the ceiling
    this.anchored = false;          // has reached the ceiling and is now a standing wall
    const stop = stage.ceilingAbove(x, bottomY);
    this.stopY = stop.y;
    this.stopSolid = stop.solid; // null = stage ceiling
  }

  // Exact vertical-segment ↔ circle overlap (capsule of half-width r+thickness/2).
  covers(b) {
    const cy = b.y < this.tipY ? this.tipY : (b.y > this.bottomY ? this.bottomY : b.y);
    const dx = b.x - this.x;
    const dy = b.y - cy;
    const rr = b.radius + HALF;
    return dx * dx + dy * dy <= rr * rr + WIRE_EPS;
  }

  // Advance one tick against the live balloon list. Returns an outcome object:
  //   {type:'climb'}                         — still travelling
  //   {type:'hit', balloon}                  — that balloon must split; wire dead
  //   {type:'broke', solid}                  — tile broken; wire dead
  //   {type:'ceiling'}                       — reached cover/ceiling; wire dead
  // `stage.break` is invoked here for the breakable case (single source of truth).
  step(stage, balloons) {
    if (!this.alive) return { type: this.outcome };

    // Sky Anchor: a persisting full-height wall. Each tick it pops the lowest balloon
    // touching it (it does NOT despawn on a hit) until its timer runs out.
    if (this.anchored) {
      this.anchorTicks -= 1;
      if (this.anchorTicks <= 0) { this.alive = false; this.outcome = WIRE_CEILING; return { type: WIRE_CEILING }; }
      let hit = null;
      for (const b of balloons) { if (this.covers(b) && (hit === null || b.y > hit.y)) hit = b; }
      if (hit) return { type: WIRE_HIT, balloon: hit }; // wire STAYS (persistent wall)
      return { type: WIRE_ANCHORED };
    }

    // 1. grow the tip up, clamped to the stop.
    this.tipY -= SPEED * this.speedScale;
    let reachedStop = false;
    if (this.tipY <= this.stopY) { this.tipY = this.stopY; reachedStop = true; }

    // 2. balloon collision — LOWEST (largest y) overlapping balloon wins.
    let hit = null;
    for (const b of balloons) {
      if (!this.covers(b)) continue;
      if (hit === null || b.y > hit.y) hit = b;
    }
    if (hit) {
      this.alive = false; this.outcome = WIRE_HIT;
      return { type: WIRE_HIT, balloon: hit };
    }

    // 3. stop resolution (only if nothing was popped).
    if (reachedStop) {
      if (this.stopSolid && this.stopSolid.kind === 'breakable') {
        this.alive = false;
        stage.break(this.stopSolid);
        this.outcome = WIRE_BROKE;
        return { type: WIRE_BROKE, solid: this.stopSolid };
      }
      // Sky Anchor: instead of despawning at the ceiling, become a standing wall.
      if (this.anchorTicks > 0) { this.anchored = true; return { type: WIRE_ANCHORED }; }
      this.alive = false;
      this.outcome = WIRE_CEILING;
      return { type: WIRE_CEILING };
    }
    return { type: WIRE_CLIMB };
  }

  serialize() { return { x: this.x, bottomY: this.bottomY, tipY: this.tipY, stopY: this.stopY, stopSolid: this.stopSolid ? this.stopSolid.id : null, speedScale: this.speedScale, anchorTicks: this.anchorTicks, anchored: this.anchored }; }
  static fromSerialized(d, stage) {
    const w = Object.create(Wire.prototype);
    w.x = d.x; w.bottomY = d.bottomY; w.tipY = d.tipY; w.stopY = d.stopY;
    w.stopSolid = d.stopSolid ? stage.solids.find((s) => s.id === d.stopSolid) : null;
    w.alive = true; w.outcome = WIRE_CLIMB;
    w.speedScale = d.speedScale || 1; w.anchorTicks = d.anchorTicks || 0; w.anchored = !!d.anchored;
    return w;
  }
}
