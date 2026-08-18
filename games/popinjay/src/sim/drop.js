// drop.js — a falling power item (DESIGN-SEED §Drops). Pure sim. A drop falls under
// gravity, lands on the surface below (never rests INSIDE geometry), and expires after
// ~8 s with a blink warning. If the surface it rests on breaks away, it falls again
// (to the next surface, or off the bottom → despawn). The full-width ground means a
// drop normally always finds a floor.

import { DROPS, DT } from '../tuning.js';

export class Drop {
  constructor({ kind, x, y, floorY = null, vy = 0, ttl = null, landed = false, id = null, gravityScale = 1 }) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vy = vy;
    this.radius = DROPS.radius;
    this.gravityScale = gravityScale; // Collector's Eye: <1 makes drops fall slower
    this.ttl = ttl == null ? DROPS.ttlTicks : ttl;
    this.landed = landed;
    this.id = id;
    this.gone = false;   // fell off the bottom of the world
  }

  get expired() { return this.ttl <= 0 || this.gone; }
  get blinking() { return this.ttl <= DROPS.blinkTicks; }

  step(stage) {
    // Surface directly below the drop's centre (dynamic — handles a floor that broke).
    const surf = stage ? stage.floorBelow(this.x, this.y).y : (this.floorY != null ? this.floorY : Infinity);
    const restY = surf - this.radius;

    if (this.landed) {
      // If the surface fell away (a breakable broke under it), resume falling.
      if (this.y < restY - 0.5) this.landed = false;
    }
    if (!this.landed) {
      this.vy += DROPS.gravity * this.gravityScale * DT;
      this.y += this.vy * DT;
      if (this.y >= restY) { this.y = restY; this.vy = 0; this.landed = true; }
      if (stage && this.y - this.radius > stage.bounds.bottom) this.gone = true; // fell off
    }
    this.ttl -= 1;
    return this;
  }

  serialize() { return { kind: this.kind, x: this.x, y: this.y, vy: this.vy, ttl: this.ttl, landed: this.landed, id: this.id, gravityScale: this.gravityScale }; }
  static fromSerialized(d) { return new Drop(d); }
}

// Weighted pick of a drop kind from a stream draw. `exclude` drops a kind from the
// table this roll (e.g. dynamite while it is gated).
export function rollDropKind(stream, exclude = []) {
  const entries = Object.entries(DROPS.weights).filter(([k]) => !exclude.includes(k));
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = stream.next() * total;
  for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
  return entries[entries.length - 1][0];
}

// The banner text a pickup surfaces (legibility — names the effect in plain words).
export const DROP_LABEL = {
  medallion: 'MEDALLION  +score',
  slow: 'TIME-SLOW  balloons ½ speed',
  freeze: 'FREEZE  balloons halted',
  shield: 'SHIELD  absorbs one hit',
  dynamite: 'DYNAMITE  fuse lit!',
};
