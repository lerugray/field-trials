// SHOELEATHER — scene graph + hotspots.
//
// A Scene is a single picture (CLAUDE.md rule 6) with a set of HOTSPOTS: rectangular
// interaction regions in logical art space. Hotspot KIND drives the cursor state and
// the action verb — and, per the colorblind floor, every kind carries a text label,
// never a hue-only distinction.
//
// The scene graph links scenes (via exits/links) so the engine can walk the world.
// Pure and node-testable; the renderer and input layers consume this model.

import { rect, contains } from './geometry.js';

// Interaction verbs. Each maps to a distinct cursor glyph AND a word (colorblind floor).
export const HOTSPOT_KINDS = Object.freeze(['look', 'take', 'talk', 'use', 'exit']);

export class Hotspot {
  constructor({ id, bounds, label, kind = 'look', meta = null }) {
    if (!id) throw new TypeError('hotspot needs an id');
    if (!HOTSPOT_KINDS.includes(kind)) {
      throw new RangeError(`unknown hotspot kind "${kind}" for ${id}`);
    }
    if (!label) throw new TypeError(`hotspot ${id} needs a label (colorblind floor: no hue-only cues)`);
    // bounds may be a rect() or a plain {x,y,w,h}
    this.id = String(id);
    this.bounds = rect(bounds.x, bounds.y, bounds.w, bounds.h);
    this.label = String(label);
    this.kind = kind;
    this.meta = meta;
  }

  contains(px, py) {
    return contains(this.bounds, px, py);
  }
}

export class Scene {
  constructor({ id, name = null, background = null, hotspots = [], links = [] }) {
    if (!id) throw new TypeError('scene needs an id');
    this.id = String(id);
    this.name = name ? String(name) : this.id;
    this.background = background; // renderer hint (a paint fn key); art lands in M4
    this.hotspots = [];
    this._byId = new Map();
    for (const h of hotspots) this.addHotspot(h instanceof Hotspot ? h : new Hotspot(h));
    // links: array of { to, via } where `via` is the hotspot id acting as the exit
    this.links = links.map((l) => ({ to: String(l.to), via: l.via ? String(l.via) : null }));
  }

  addHotspot(h) {
    const hs = h instanceof Hotspot ? h : new Hotspot(h);
    if (this._byId.has(hs.id)) {
      throw new Error(`duplicate hotspot id "${hs.id}" in scene ${this.id}`);
    }
    this._byId.set(hs.id, hs);
    this.hotspots.push(hs);
    return hs;
  }

  hotspot(id) {
    return this._byId.get(String(id)) || null;
  }

  // Topmost hotspot at a point (later hotspots paint on top, so search in reverse).
  hotspotAt(px, py) {
    for (let i = this.hotspots.length - 1; i >= 0; i--) {
      if (this.hotspots[i].contains(px, py)) return this.hotspots[i];
    }
    return null;
  }

  // Exit target reachable through a given hotspot id, if any.
  exitVia(hotspotId) {
    const link = this.links.find((l) => l.via === String(hotspotId));
    return link ? link.to : null;
  }
}

export class SceneGraph {
  constructor() {
    this._scenes = new Map();
  }

  add(scene) {
    const s = scene instanceof Scene ? scene : new Scene(scene);
    if (this._scenes.has(s.id)) throw new Error(`duplicate scene id "${s.id}"`);
    this._scenes.set(s.id, s);
    return s;
  }

  has(id) { return this._scenes.has(String(id)); }
  get(id) { return this._scenes.get(String(id)) || null; }
  get size() { return this._scenes.size; }
  ids() { return [...this._scenes.keys()]; }

  neighbors(id) {
    const s = this.get(id);
    if (!s) return [];
    return s.links.map((l) => l.to);
  }

  // Validate every link points at a real scene, and every `via` names a real hotspot.
  // Returns an array of problem strings (empty = valid).
  validate() {
    const problems = [];
    for (const s of this._scenes.values()) {
      for (const l of s.links) {
        if (!this._scenes.has(l.to)) {
          problems.push(`scene ${s.id} links to missing scene "${l.to}"`);
        }
        if (l.via && !s.hotspot(l.via)) {
          problems.push(`scene ${s.id} link via missing hotspot "${l.via}"`);
        }
      }
    }
    return problems;
  }
}
