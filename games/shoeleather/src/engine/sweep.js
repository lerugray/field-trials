// SHOELEATHER — sweep affordance (the no-pixel-hunting law).
//
// DESIGN-SEED difficulty law: "NO pixel-hunting: every hotspot discoverable by
// systematic sweep; the M0 engine ships the sweep affordance (cursor state on hover
// + a scene 'swept' sense)". The hard part is what an observation MEANS, never
// finding it.
//
// The SweepTracker records which hotspots the player has BRUSHED (hovered by mouse or
// landed on by keyboard cycling). A scene reads "swept" once every hotspot has been
// brushed at least once. This is coverage feedback ONLY — it is NOT a progress meter
// toward the solution (which the seed forbids). Finding the thing is free; the case
// is in the meaning.

export class SweepTracker {
  constructor() {
    // sceneId -> Set of brushed hotspot ids
    this._brushed = new Map();
  }

  _set(sceneId) {
    const key = String(sceneId);
    let s = this._brushed.get(key);
    if (!s) { s = new Set(); this._brushed.set(key, s); }
    return s;
  }

  // Record that a hotspot has been brushed. Returns true the FIRST time (so the
  // engine can play a discovery tick), false on repeats.
  brush(sceneId, hotspotId) {
    const s = this._set(sceneId);
    const key = String(hotspotId);
    if (s.has(key)) return false;
    s.add(key);
    return true;
  }

  isBrushed(sceneId, hotspotId) {
    const s = this._brushed.get(String(sceneId));
    return s ? s.has(String(hotspotId)) : false;
  }

  brushedCount(sceneId) {
    const s = this._brushed.get(String(sceneId));
    return s ? s.size : 0;
  }

  // Coverage for a scene: { found, total, swept }.
  coverage(scene) {
    const total = scene.hotspots.length;
    let found = 0;
    for (const h of scene.hotspots) if (this.isBrushed(scene.id, h.id)) found++;
    return { found, total, swept: total > 0 && found === total };
  }

  isSwept(scene) {
    return this.coverage(scene).swept;
  }

  // Hotspots in a scene not yet brushed (engine can nudge the sweep, never point).
  unbrushed(scene) {
    return scene.hotspots.filter((h) => !this.isBrushed(scene.id, h.id));
  }

  // Serialization for checkpoint save/load.
  toJSON() {
    const out = {};
    for (const [scene, set] of this._brushed) out[scene] = [...set];
    return out;
  }

  static fromJSON(obj) {
    const t = new SweepTracker();
    if (obj && typeof obj === 'object') {
      for (const [scene, ids] of Object.entries(obj)) {
        const set = t._set(scene);
        for (const id of ids) set.add(String(id));
      }
    }
    return t;
  }
}
