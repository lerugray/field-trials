// THE JACQUARD INDEX — the coloured Board (TWO-THREAD play state).
//
// The base Board is binary (fill / cross). TWO-THREAD needs three thread states, so it gets
// its own small board rather than warping the base one: a cell is BLANK (undecided), thread
// A, thread B, or CROSS (the player marking bare warp). Strokes paint one active mark and
// undo atomically; win is when every A and every B cell matches the solution (bare cells may
// be blank or crossed, exactly as the base machine treats empties). Thread identity is by
// SHAPE in the view (hard-rule 6); here the threads are just A and B.

import { A, B, BARE } from './twothread.js';

export const CB_BLANK = 0;
export const CB_A = A;      // 1
export const CB_B = B;      // 2
export const CB_CROSS = 3;  // player-marked bare warp

export class ColoredBoard {
  // card carries { colored: { width, height, grid } } (grid is the 0/1/2 solution).
  constructor(card) {
    const c = card.colored;
    this.width = c.width;
    this.height = c.height;
    this.solution = c.grid;
    this.marks = new Int8Array(this.width * this.height); // CB_BLANK
    this._undo = [];
    this._redo = [];
    this._pending = null;
    this._strokeTo = CB_BLANK;
    this._strokeFrom = CB_BLANK;
  }

  idx(x, y) { return y * this.width + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  markAt(x, y) { return this.marks[this.idx(x, y)]; }

  _write(index, value) {
    if (!this._pending) return;
    if (!(index in this._pending.prev)) this._pending.prev[index] = this.marks[index];
    this.marks[index] = value;
  }

  // Begin a stroke placing `mark` (CB_A / CB_B / CB_CROSS); clicking a cell already holding
  // that mark clears it (toggle). Only cells sharing the first cell's prior state are painted.
  beginStroke(x, y, mark) {
    if (!this.inBounds(x, y)) return;
    this._pending = { prev: {} };
    const i = this.idx(x, y);
    this._strokeFrom = this.marks[i];
    this._strokeTo = this.marks[i] === mark ? CB_BLANK : mark;
    this._write(i, this._strokeTo);
  }

  extendStroke(x, y) {
    if (!this._pending || !this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.marks[i] !== this._strokeFrom) return; // only same-prior-state cells
    this._write(i, this._strokeTo);
  }

  endStroke() {
    if (!this._pending) return false;
    const changes = [];
    for (const k in this._pending.prev) {
      const index = +k;
      if (this._pending.prev[index] !== this.marks[index]) {
        changes.push({ index, prev: this._pending.prev[index], next: this.marks[index] });
      }
    }
    this._pending = null;
    if (changes.length === 0) return false;
    this._undo.push(changes);
    this._redo.length = 0;
    return true;
  }

  // One-shot placement (keyboard), its own atomic stroke.
  place(x, y, mark) { this.beginStroke(x, y, mark); this.endStroke(); }

  undo() {
    const changes = this._undo.pop();
    if (!changes) return false;
    for (const c of changes) this.marks[c.index] = c.prev;
    this._redo.push(changes);
    return true;
  }

  redo() {
    const changes = this._redo.pop();
    if (!changes) return false;
    for (const c of changes) this.marks[c.index] = c.next;
    this._undo.push(changes);
    return true;
  }

  reset() {
    this.marks.fill(CB_BLANK);
    this._undo = [];
    this._redo = [];
    this._pending = null;
  }

  // A thread laid where the solution is bare, or the wrong colour laid (for hints/penalty).
  isMistake(x, y) {
    const i = this.idx(x, y);
    const m = this.marks[i];
    if (m === CB_A || m === CB_B) return this.solution[i] !== m;
    if (m === CB_CROSS) return this.solution[i] !== BARE;
    return false;
  }

  // Solved when every A and B cell matches the solution (bare cells: blank or cross both ok).
  isSolved() {
    for (let i = 0; i < this.marks.length; i++) {
      const want = this.solution[i];
      const m = this.marks[i];
      if (want === CB_A && m !== CB_A) return false;
      if (want === CB_B && m !== CB_B) return false;
      if (want === BARE && (m === CB_A || m === CB_B)) return false;
    }
    return true;
  }
}
