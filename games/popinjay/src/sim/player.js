// player.js — the walker (DESIGN-SEED §The player; signature law #4: NO JUMP, EVER).
// Pure sim. Verbs: walk left/right, climb ladders up/down, fall off ledges under
// gravity. Vertical movement is ladders-only — up never launches from the ground.
//
// The player is a box: `x` is its horizontal center, `feetY` the bottom edge; it
// rests with its feet on a surface TOP (stage.floorBelow). The muzzle (where the
// wire is born) rides at the head line, `feetY - height`.

import { PLAYER, GRAVITY, DT, HIT } from '../tuning.js';

const PLAYER_EPS = 1e-6;

export const STAND = 'stand';
export const CLIMB = 'climb';

export class Player {
  constructor({ x, feetY, stage }) {
    this.x = x;
    this.feetY = feetY;
    this.vy = 0;
    this.state = STAND;
    this.facing = 1;          // last horizontal facing (for aim/render)
    this.ladder = null;       // the ladder being climbed, when state===CLIMB
    this.width = PLAYER.width;
    this.height = PLAYER.height;
    this.iframe = 0;      // invulnerability ticks after a hit (outline-pulse render)
    this.knockVx = 0;     // decaying knockback velocity (px/s)
    this.walking = false; // true while horizontal walk input is held (drives render cycle)
    if (stage) this._settle(stage); // drop onto the surface under the spawn
  }

  get invulnerable() { return this.iframe > 0; }

  // Take a hit: i-frames + a clamped knockback AWAY from the culprit (dir ±1).
  // Souvenirs scale these: Sure Feet lengthens i-frames, Soft Landing zeroes knockback.
  takeHit(dir, { iframeScale = 1, knockScale = 1 } = {}) {
    this.iframe = Math.round(PLAYER.iframeTicks * iframeScale);
    this.knockVx = ((dir >= 0 ? 1 : -1) * HIT.knockback * knockScale) || 0; // normalize -0
  }

  get muzzleY() { return this.feetY - this.height; }
  get halfW() { return this.width / 2; }

  // Advance one tick. `input` = {left,right,up,down} booleans. `stage` supplies the
  // geometry queries. No jump: `up` only acts on a ladder.
  step(input, stage) {
    const inLeft = !!(input && input.left);
    const inRight = !!(input && input.right);
    const inUp = !!(input && input.up);
    const inDown = !!(input && input.down);

    if (this.iframe > 0) this.iframe -= 1;

    if (this.state === CLIMB) this._stepClimb(inLeft, inRight, inUp, inDown, stage);
    else this._stepStand(inLeft, inRight, inUp, inDown, stage);

    // Knockback (decaying) rides on top of walk/climb, clamped to the side walls.
    if (this.knockVx !== 0) {
      this.x += this.knockVx * DT;
      this.knockVx *= HIT.knockDecay;
      if (Math.abs(this.knockVx) < 4) this.knockVx = 0;
      if (stage) this._clampWalls(stage);
    }
    return this;
  }

  _stepStand(inLeft, inRight, inUp, inDown, stage) {
    // Horizontal walk (walking + firing are simultaneous — fire lives elsewhere).
    let dir = 0;
    if (inLeft) dir -= 1;
    if (inRight) dir += 1;
    this.walking = dir !== 0;
    if (dir) this.facing = dir;
    this.x += dir * PLAYER.walkSpeed * DT;
    this._clampWalls(stage);

    const grounded = this.vy === 0;

    // Mount a ladder: pressing up onto a ladder that rises above the feet, or down
    // onto a ladder that descends below the feet. (No jump — up is climb-only.)
    if (grounded && (inUp || inDown)) {
      const lad = this._ladderToMount(stage, inUp, inDown);
      if (lad) { this._mount(lad); return; }
    }

    // Vertical: gravity + land on the surface below (walk off a ledge → fall).
    this.vy += GRAVITY * DT;
    const prevFeet = this.feetY;
    this.feetY += this.vy * DT;
    const floor = stage.floorBelow(this.x, prevFeet + PLAYER_EPS);
    if (this.feetY >= floor.y - PLAYER_EPS) { this.feetY = floor.y; this.vy = 0; }
  }

  _stepClimb(inLeft, inRight, inUp, inDown, stage) {
    const lad = this.ladder;
    let dy = 0;
    if (inUp) dy -= 1;
    if (inDown) dy += 1;
    this.feetY += dy * PLAYER.climbSpeed * DT;

    // Clamp to the ladder extent; reaching the top steps ONTO the top surface,
    // reaching the bottom stands on the lower surface. (Dismount at the endpoints.)
    if (this.feetY <= lad.top + PLAYER_EPS) { this.feetY = lad.top; this._dismount(); return; }
    if (this.feetY >= lad.bottom - PLAYER_EPS) { this.feetY = lad.bottom; this._dismount(); return; }
    // Step off sideways only if the press leaves the ladder column onto a surface at
    // feet level (kept minimal for M1: horizontal is ignored mid-ladder).
  }

  _ladderToMount(stage, inUp, inDown) {
    // A ladder whose column contains x and whose extent brackets the feet.
    for (const l of stage.ladders) {
      if (this.x < l.x0 - PLAYER_EPS || this.x > l.x1 + PLAYER_EPS) continue;
      if (inUp && this.feetY > l.top + PLAYER_EPS && this.feetY <= l.bottom + PLAYER_EPS) return l;
      if (inDown && this.feetY >= l.top - PLAYER_EPS && this.feetY < l.bottom - PLAYER_EPS) return l;
    }
    return null;
  }

  _mount(lad) {
    this.state = CLIMB;
    this.ladder = lad;
    this.vy = 0;
    this.walking = false;
    this.x = (lad.x0 + lad.x1) / 2; // snap to the ladder center
  }

  _dismount() {
    this.state = STAND;
    this.ladder = null;
    this.vy = 0;
  }

  _clampWalls(stage) {
    const lo = stage.bounds.left + this.halfW;
    const hi = stage.bounds.right - this.halfW;
    if (this.x < lo) this.x = lo;
    else if (this.x > hi) this.x = hi;
  }

  _settle(stage) {
    const floor = stage.floorBelow(this.x, this.feetY);
    this.feetY = floor.y;
    this.vy = 0;
  }

  serialize() {
    return { x: this.x, feetY: this.feetY, vy: this.vy, state: this.state, facing: this.facing, ladder: this.ladder ? this.ladder.id : null, iframe: this.iframe, knockVx: this.knockVx, walking: this.walking };
  }

  restore(d, stage) {
    this.x = d.x; this.feetY = d.feetY; this.vy = d.vy; this.state = d.state; this.facing = d.facing;
    this.ladder = d.ladder ? stage.ladders.find((l) => l.id === d.ladder) : null;
    this.iframe = d.iframe | 0; this.knockVx = d.knockVx || 0; this.walking = !!d.walking;
    return this;
  }
}
