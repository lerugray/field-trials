// stage.js — the stage geometry + the shared surface queries every mover uses
// (DESIGN-SEED §Stage; STUDY §2.2 under-platform stop). Pure sim, no renderer.
//
// One geometry, three consumers:
//   - balloons bounce on the TOP of a solid (`floorBelow`),
//   - the player stands on / falls to the TOP of a solid (`floorBelow`),
//   - the wire stops at the UNDERSIDE (bottom edge) of a solid overhead
//     (`ceilingAbove`) — the seed's under-platform-stop LAW.
//
// Solids are axis-aligned rects {x0,x1,top,bottom,kind,intact}. `kind`:
//   'ground'    — the full-width floor slab (never breaks),
//   'platform'  — solid cover; wire stops at its underside,
//   'breakable' — a wire reaching its underside BREAKS it (removed for the stage).
// The side walls and the ceiling are the stage `bounds` (not solids).

import { VIEW } from '../tuning.js';

const STAGE_EPS = 1e-6;

export class Stage {
  constructor({ bounds, solids, ladders, spawns, meta, windBands } = {}) {
    this.bounds = bounds || { left: 0, right: VIEW.w, top: 0, bottom: VIEW.h };
    // Defensive copy so callers can't mutate the authored template in place.
    this.solids = (solids || []).map((s) => ({ ...s, intact: s.intact !== false }));
    this.ladders = (ladders || []).map((l) => ({ ...l }));
    this.spawns = (spawns || []).map((s) => ({ ...s }));
    // Locale-2 WIND BANDS: horizontal drift zones {y0,y1,vx} (empty in other locales).
    this.windBands = (windBands || []).map((b) => ({ ...b }));
    // Generation metadata (M2): { locale, stage, teaching, playerSpawnX, ... }.
    this.meta = meta ? { ...meta } : { locale: 1, stage: 1, teaching: false, playerSpawnX: 760 };
  }

  // Live solids only (a broken breakable is gone for the rest of the stage).
  liveSolids() { return this.solids.filter((s) => s.kind !== 'breakable' || s.intact); }

  static _spans(s, x) { return x >= s.x0 - STAGE_EPS && x <= s.x1 + STAGE_EPS; }

  // The nearest surface TOP at or below `y` under column `x` (screen coords: larger
  // y is lower). Returns { y, solid } or, if nothing, the stage floor bound.
  floorBelow(x, y) {
    let best = null;
    for (const s of this.liveSolids()) {
      if (!Stage._spans(s, x)) continue;
      if (s.top >= y - STAGE_EPS && (best === null || s.top < best.y)) best = { y: s.top, solid: s };
    }
    if (best) return best;
    return { y: this.bounds.bottom, solid: null };
  }

  // The nearest UNDERSIDE (solid bottom edge) strictly above `y` under column `x` —
  // what a rising wire tip first meets. Returns { y, solid } (solid null = the stage
  // ceiling). This is the under-platform-stop query (LAW).
  ceilingAbove(x, y) {
    let best = null; // pick the LARGEST bottom that is still above the muzzle
    for (const s of this.liveSolids()) {
      if (!Stage._spans(s, x)) continue;
      if (s.bottom <= y + STAGE_EPS && (best === null || s.bottom > best.y)) best = { y: s.bottom, solid: s };
    }
    if (best) return best;
    return { y: this.bounds.top, solid: null };
  }

  // Break a breakable solid (by reference or id); idempotent. Returns true if a tile
  // actually broke (a live breakable was consumed).
  break(solid) {
    const s = typeof solid === 'object' ? solid : this.solids.find((z) => z.id === solid);
    if (s && s.kind === 'breakable' && s.intact) { s.intact = false; return true; }
    return false;
  }

  // Is column x under a ladder (so the player may enter climb)? Returns the ladder or null.
  ladderAt(x, y) {
    for (const l of this.ladders) {
      if (x >= l.x0 - STAGE_EPS && x <= l.x1 + STAGE_EPS && y >= l.top - STAGE_EPS && y <= l.bottom + STAGE_EPS) return l;
    }
    return null;
  }

  serialize() { return { broken: this.solids.filter((s) => s.kind === 'breakable' && !s.intact).map((s) => s.id) }; }
  restore(d) {
    const broken = new Set((d && d.broken) || []);
    for (const s of this.solids) if (s.kind === 'breakable') s.intact = !broken.has(s.id);
    return this;
  }

  // A full geometry snapshot for the save (a generated stage can't be rebuilt from a
  // template — the whole layout, incl. live intact state, must ride in the save).
  snapshot() {
    return {
      bounds: { ...this.bounds },
      solids: this.solids.map((s) => ({ ...s })),
      ladders: this.ladders.map((l) => ({ ...l })),
      spawns: this.spawns.map((s) => ({ ...s })),
      windBands: this.windBands.map((b) => ({ ...b })),
      meta: { ...this.meta },
    };
  }

  static fromSnapshot(s) { return new Stage(s); }
}

// The authored M1 stage: a full-width ground, two platforms (one giving low cover,
// one high), a breakable tile whose underside a wire can break, and one ladder. Kept
// deliberately simple — M1 proves the verbs on ONE stage; M2 generates them.
export function authoredStageM1() {
  const W = VIEW.w, H = VIEW.h;
  const groundTop = H - 60;
  return new Stage({
    bounds: { left: 0, right: W, top: 0, bottom: H },
    solids: [
      { id: 'ground', kind: 'ground', x0: 0, x1: W, top: groundTop, bottom: H },
      // Low cover on the left — standing under it shortens the wire (positioning cost).
      { id: 'plat-lo', kind: 'platform', x0: 150, x1: 470, top: 470, bottom: 494 },
      // High cover on the right.
      { id: 'plat-hi', kind: 'platform', x0: 820, x1: 1130, top: 300, bottom: 324 },
      // A breakable tile mid-high — a wire under it breaks it (wire consumed).
      { id: 'brk-1', kind: 'breakable', x0: 560, x1: 720, top: 470, bottom: 494, intact: true },
    ],
    ladders: [
      // Ladder from the ground up past the low platform's left edge.
      { id: 'lad-1', x0: 200, x1: 232, top: 470, bottom: groundTop },
    ],
    spawns: [
      // Where the M1 Grand starts (mid-air over the ground, moving right).
      { cls: 'grand', x: W * 0.5, vxSign: 1 },
    ],
  });
}
