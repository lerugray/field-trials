// SHOELEATHER — input focus (the keyboard-path law, CLAUDE.md rule 8).
//
// DESIGN-SEED INPUT LAW: "full keyboard path (hotspot cycling + select) beside the
// mouse; no real-time pressure anywhere". This FocusRing unifies both inputs into a
// single FOCUS concept: whether the player reached a hotspot by hovering the mouse or
// by cycling with the keyboard, the same hotspot is "focused" and the same cursor
// state / verb label shows. Selection then acts on whatever is focused.
//
// Cycling order is stable READING ORDER (top-to-bottom, then left-to-right) so
// keyboard traversal is predictable and complete — never a hunt.
//
// Pure and node-testable. The browser layer feeds it key and pointer events; there
// are no timers here (the no-real-time-pressure law).

import { center } from './geometry.js';

// Default logical bindings. The browser layer translates KeyboardEvent.key/.code to
// these action names; the engine reacts to actions, not raw keys.
export const DEFAULT_KEYMAP = Object.freeze({
  ArrowRight: 'focus-next',
  ArrowDown: 'focus-next',
  Tab: 'focus-next',
  ArrowLeft: 'focus-prev',
  ArrowUp: 'focus-prev',
  Enter: 'select',
  ' ': 'select',
  Escape: 'back',
  n: 'notebook',
});

// Group hotspots into rows within a vertical tolerance, then left-to-right per row.
export function readingOrder(hotspots, rowTol = 8) {
  return hotspots
    .map((h) => ({ h, c: center(h.bounds) }))
    .sort((a, b) => {
      const rowA = Math.round(a.c.y / rowTol);
      const rowB = Math.round(b.c.y / rowTol);
      if (rowA !== rowB) return rowA - rowB;
      if (a.c.x !== b.c.x) return a.c.x - b.c.x;
      return a.h.id < b.h.id ? -1 : a.h.id > b.h.id ? 1 : 0;
    })
    .map((e) => e.h);
}

export class FocusRing {
  constructor(scene, { rowTol = 8 } = {}) {
    this.scene = scene;
    this.order = readingOrder(scene.hotspots, rowTol);
    this._index = -1; // -1 = nothing focused
  }

  get index() { return this._index; }

  focused() {
    return this._index >= 0 && this._index < this.order.length ? this.order[this._index] : null;
  }

  // Cursor state for the renderer: the focused verb, or 'default' when nothing focused.
  cursorKind() {
    const h = this.focused();
    return h ? h.kind : 'default';
  }

  clear() { this._index = -1; return null; }

  // Keyboard: advance to next hotspot (wraps). From nothing, lands on the first.
  next() {
    if (this.order.length === 0) return null;
    this._index = this._index < 0 ? 0 : (this._index + 1) % this.order.length;
    return this.focused();
  }

  prev() {
    if (this.order.length === 0) return null;
    this._index = this._index < 0
      ? this.order.length - 1
      : (this._index - 1 + this.order.length) % this.order.length;
    return this.focused();
  }

  focusById(id) {
    const i = this.order.findIndex((h) => h.id === String(id));
    this._index = i;
    return this.focused();
  }

  // Mouse: focus the topmost hotspot under a logical-space point, or clear.
  focusAt(px, py) {
    const hit = this.scene.hotspotAt(px, py);
    if (!hit) return this.clear();
    this._index = this.order.indexOf(hit);
    return hit;
  }
}
