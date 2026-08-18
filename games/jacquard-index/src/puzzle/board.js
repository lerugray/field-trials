// THE JACQUARD INDEX — the Board (player state + verbs + QoL law).
//
// A Board wraps a Puzzle with the player's PROGRESS: each cell's primary mark
// (BLANK / FILLED / CROSSED) and an independent PENCIL overlay (tentative fill/cross,
// shown only while the primary is blank). It implements the seed's QoL set as law:
// drag-painting with the studio drag semantics, auto-X on satisfied lines (that never
// overwrites a pencil mark), bounded atomic undo/redo, and pencil marks of distinct
// weight. It exposes line-satisfaction (for clue dimming) and win detection.
//
// Pure and DOM-free: the scene layer maps input to these verbs; this is tested directly.

import { lineSatisfied } from './clues.js';

// Primary cell marks.
export const BLANK = 0;
export const FILLED = 1;
export const CROSSED = 2;

// Pencil overlay.
export const PENCIL_NONE = 0;
export const PENCIL_FILL = 1;
export const PENCIL_CROSS = 2;

export const HISTORY_LIMIT = 100;

export class Board {
  constructor(puzzle, opts = {}) {
    this.puzzle = puzzle;
    this.width = puzzle.width;
    this.height = puzzle.height;
    this.primary = new Uint8Array(this.width * this.height); // BLANK
    this.pencil = new Uint8Array(this.width * this.height);   // PENCIL_NONE
    this.autoX = opts.autoX !== false; // default ON
    this._undo = [];
    this._redo = [];
    this._pending = null; // active stroke's recorded changes (Map index -> {p, pen})
    this._strokeTouched = null; // Set of indices changed this stroke (for auto-X lines)
  }

  // Wipe all marks and history back to a bare loom (HOUSE RULES: three strikes tears the
  // cloth and the piece is re-warped). Not undoable: it is a fresh start, not an edit.
  reset() {
    this.primary.fill(BLANK);
    this.pencil.fill(PENCIL_NONE);
    this._undo = [];
    this._redo = [];
    this._pending = null;
    this._strokeTouched = null;
  }

  idx(x, y) { return y * this.width + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  primaryAt(x, y) { return this.primary[this.idx(x, y)]; }
  pencilAt(x, y) { return this.pencil[this.idx(x, y)]; }

  // ---- Low-level change recording (all mutations funnel through here) ----
  _write(index, newPrimary, newPencil) {
    if (!this._pending) throw new Error('Board mutation outside a stroke');
    if (!this._pending.has(index)) {
      this._pending.set(index, { p: this.primary[index], pen: this.pencil[index] });
    }
    this.primary[index] = newPrimary;
    this.pencil[index] = newPencil;
    this._strokeTouched.add(index);
  }

  _beginPending() {
    this._pending = new Map();
    this._strokeTouched = new Set();
  }

  _commitPending(amendLast = false) {
    const changes = [];
    for (const [index, prev] of this._pending) {
      if (prev.p !== this.primary[index] || prev.pen !== this.pencil[index]) {
        changes.push({ index, prevP: prev.p, prevPen: prev.pen, newP: this.primary[index], newPen: this.pencil[index] });
      }
    }
    this._pending = null;
    this._strokeTouched = null;
    if (changes.length > 0) {
      if (amendLast && this._undo.length > 0) {
        // Automatic shelf rules belong to the stroke that caused them. Merge their final
        // state into that stroke so undo/redo remains one player action (and never grows
        // history while reconciling a fold or penalty).
        const prior = this._undo[this._undo.length - 1];
        const byIndex = new Map(prior.map((c) => [c.index, c]));
        for (const c of changes) {
          const existing = byIndex.get(c.index);
          if (existing) {
            existing.newP = c.newP;
            existing.newPen = c.newPen;
          } else {
            prior.push(c);
            byIndex.set(c.index, c);
          }
        }
        const effective = prior.filter((c) => c.prevP !== c.newP || c.prevPen !== c.newPen);
        if (effective.length > 0) this._undo[this._undo.length - 1] = effective;
        else this._undo.pop();
      } else {
        this._undo.push(changes);
        if (this._undo.length > HISTORY_LIMIT) this._undo.shift();
      }
      this._redo.length = 0;
    }
    return changes.length > 0;
  }

  // ---- Single-cell verbs (each is an atomic stroke) ----
  toggleFill(x, y) { this.beginStroke(x, y, 'fill'); this.endStroke(); }
  toggleCross(x, y) { this.beginStroke(x, y, 'cross'); this.endStroke(); }
  togglePencilFill(x, y) { this.beginStroke(x, y, 'pencilFill'); this.endStroke(); }
  togglePencilCross(x, y) { this.beginStroke(x, y, 'pencilCross'); this.endStroke(); }

  // Reconcile an automatic primary mark into the most recent player stroke. This refuses
  // to create standalone history: without a triggering stroke there is nothing to amend.
  // HOUSE RULES uses it to strike a bad fill; MIRROR-WEAVE uses it for the folded twin.
  amendLastStrokePrimary(x, y, primary) {
    if (!this.inBounds(x, y) || this._undo.length === 0 || this._pending) return false;
    const index = this.idx(x, y);
    if (this.primary[index] === primary && this.pencil[index] === PENCIL_NONE) return false;
    this._beginPending();
    this._strokeTo = primary;
    this._write(index, primary, PENCIL_NONE);
    if (this.autoX && primary === FILLED) {
      this._autoXLine(this._rowIndices(y), this.puzzle.rowClues[y]);
      this._autoXLine(this._colIndices(x), this.puzzle.colClues[x]);
    }
    return this._commitPending(true);
  }

  // ---- Drag strokes (studio drag semantics) ----
  // A stroke applies the action of its FIRST cell to cells in the SAME prior state;
  // crossing a conflicting cell ends the stroke; the whole stroke undoes atomically.
  beginStroke(x, y, verb) {
    if (!this.inBounds(x, y)) return;
    this._beginPending();
    this._strokeVerb = verb;
    this._strokeEnded = false;

    const index = this.idx(x, y);
    if (verb === 'fill' || verb === 'cross') {
      const want = verb === 'fill' ? FILLED : CROSSED;
      this._strokeFrom = this.primary[index];
      this._strokeTo = this.primary[index] === want ? BLANK : want;
      this._paintPrimary(index);
    } else { // pencil verbs
      const want = verb === 'pencilFill' ? PENCIL_FILL : PENCIL_CROSS;
      this._strokeFrom = this.pencil[index];
      this._strokeTo = this.pencil[index] === want ? PENCIL_NONE : want;
      this._paintPencil(index);
    }
  }

  extendStroke(x, y) {
    if (this._strokeEnded || !this._pending || !this.inBounds(x, y)) return;
    const index = this.idx(x, y);
    if (this._strokeVerb === 'fill' || this._strokeVerb === 'cross') {
      if (this.primary[index] !== this._strokeFrom) { this._strokeEnded = true; return; }
      this._paintPrimary(index);
    } else {
      if (this.primary[index] !== BLANK || this.pencil[index] !== this._strokeFrom) { this._strokeEnded = true; return; }
      this._paintPencil(index);
    }
  }

  _paintPrimary(index) {
    // Setting a primary mark clears any pencil on that cell.
    this._write(index, this._strokeTo, PENCIL_NONE);
  }

  _paintPencil(index) {
    // Pencil only applies to a blank cell; primary stays blank.
    if (this.primary[index] !== BLANK) return;
    this._write(index, BLANK, this._strokeTo);
  }

  endStroke() {
    if (!this._pending) return false;
    // Auto-X: for every line touched by a FILL stroke, if the line's filled runs now
    // satisfy its clue, cross the remaining blank cells (never over a pencil mark).
    if (this.autoX && this._strokeTo === FILLED) {
      const rows = new Set();
      const cols = new Set();
      for (const index of this._strokeTouched) {
        rows.add(Math.floor(index / this.width));
        cols.add(index % this.width);
      }
      for (const y of rows) this._autoXLine(this._rowIndices(y), this.puzzle.rowClues[y]);
      for (const x of cols) this._autoXLine(this._colIndices(x), this.puzzle.colClues[x]);
    }
    return this._commitPending();
  }

  _rowIndices(y) {
    const out = new Array(this.width);
    for (let x = 0; x < this.width; x++) out[x] = this.idx(x, y);
    return out;
  }
  _colIndices(x) {
    const out = new Array(this.height);
    for (let y = 0; y < this.height; y++) out[y] = this.idx(x, y);
    return out;
  }

  _autoXLine(indices, clue) {
    const filled = indices.map((i) => (this.primary[i] === FILLED ? 1 : 0));
    if (!lineSatisfied(filled, clue)) return;
    for (const i of indices) {
      if (this.primary[i] === BLANK && this.pencil[i] === PENCIL_NONE) {
        this._write(i, CROSSED, PENCIL_NONE);
      }
    }
  }

  // ---- Undo / redo (atomic per stroke) ----
  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }

  // Stable, JSON-safe player state for save/resume. Active pointer strokes are never
  // serialized: the scene waits for release, so every saved history entry remains atomic.
  saveState() {
    if (this._pending) return null;
    return {
      kind: 'base', width: this.width, height: this.height, autoX: this.autoX,
      primary: Array.from(this.primary), pencil: Array.from(this.pencil),
      undo: this._undo.slice(-HISTORY_LIMIT).map((entry) => entry.map((c) => ({ ...c }))),
      redo: this._redo.slice(-HISTORY_LIMIT).map((entry) => entry.map((c) => ({ ...c }))),
    };
  }

  restoreState(state) {
    if (!state || state.kind !== 'base' || state.width !== this.width || state.height !== this.height) {
      throw new Error('saved board does not match this pattern card');
    }
    this.primary.set(state.primary);
    this.pencil.set(state.pencil);
    this.autoX = state.autoX;
    this._undo = state.undo.slice(-HISTORY_LIMIT).map((entry) => entry.map((c) => ({ ...c })));
    this._redo = state.redo.slice(-HISTORY_LIMIT).map((entry) => entry.map((c) => ({ ...c })));
    this._pending = null;
    this._strokeTouched = null;
    return this;
  }

  undo() {
    const changes = this._undo.pop();
    if (!changes) return false;
    for (const c of changes) { this.primary[c.index] = c.prevP; this.pencil[c.index] = c.prevPen; }
    this._redo.push(changes);
    if (this._redo.length > HISTORY_LIMIT) this._redo.shift();
    return true;
  }

  redo() {
    const changes = this._redo.pop();
    if (!changes) return false;
    for (const c of changes) { this.primary[c.index] = c.newP; this.pencil[c.index] = c.newPen; }
    this._undo.push(changes);
    if (this._undo.length > HISTORY_LIMIT) this._undo.shift();
    return true;
  }

  // ---- Queries: satisfaction (clue dimming), mistakes, win ----
  _filledLine(indices) { return indices.map((i) => (this.primary[i] === FILLED ? 1 : 0)); }

  isRowSatisfied(y) { return lineSatisfied(this._filledLine(this._rowIndices(y)), this.puzzle.rowClues[y]); }
  isColSatisfied(x) { return lineSatisfied(this._filledLine(this._colIndices(x)), this.puzzle.colClues[x]); }

  // A filled cell that is not filled in the solution (for the opt-in HOUSE RULES shelf).
  isMistake(x, y) {
    const i = this.idx(x, y);
    return this.primary[i] === FILLED && !this.puzzle.solution[i];
  }

  // Solved when the FILLED cells exactly match the solution (X/pencil are player aids).
  isSolved() {
    for (let i = 0; i < this.primary.length; i++) {
      const wantFilled = !!this.puzzle.solution[i];
      const isFilled = this.primary[i] === FILLED;
      if (wantFilled !== isFilled) return false;
    }
    return true;
  }
}
