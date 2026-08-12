// THE JACQUARD INDEX — the Puzzle model (a solution grid + its derived clues).
//
// A Puzzle is immutable puzzle DATA: the solution (which cells are filled) and the row
// and column clue lists computed from it. Player progress lives on a separate Board (a
// later increment); this is the thing the generator produces, the certifier proves, and
// the renderer weaves. Internal names per the STUDY terminology map.

import { clueOfLine } from './clues.js';

export const FILLED = 1;
export const EMPTY = 0;

export class Puzzle {
  // solution: Uint8Array of length width*height, row-major, 1 = filled.
  constructor(width, height, solution) {
    this.width = width | 0;
    this.height = height | 0;
    if (this.width <= 0 || this.height <= 0) {
      throw new Error(`Puzzle dimensions must be positive, got ${width}x${height}`);
    }
    if (solution.length !== this.width * this.height) {
      throw new Error(`solution length ${solution.length} != ${this.width}x${this.height}`);
    }
    this.solution = solution instanceof Uint8Array ? solution : Uint8Array.from(solution);

    // Derive clues once. rowClues[y] and colClues[x] are canonical internal clue arrays.
    this.rowClues = [];
    for (let y = 0; y < this.height; y++) this.rowClues.push(clueOfLine(this.rowCells(y)));
    this.colClues = [];
    for (let x = 0; x < this.width; x++) this.colClues.push(clueOfLine(this.colCells(x)));
  }

  // Build from ASCII rows: '#' (or 'X'/'1') filled, anything else empty. Handy for
  // fixtures and generated motifs. Rows must all share one width.
  static fromAscii(rows) {
    const height = rows.length;
    if (height === 0) throw new Error('fromAscii needs at least one row');
    const width = rows[0].length;
    const sol = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      if (rows[y].length !== width) {
        throw new Error(`row ${y} width ${rows[y].length} != ${width}`);
      }
      for (let x = 0; x < width; x++) {
        const ch = rows[y][x];
        sol[y * width + x] = (ch === '#' || ch === 'X' || ch === '1') ? 1 : 0;
      }
    }
    return new Puzzle(width, height, sol);
  }

  at(x, y) {
    return this.solution[y * this.width + x];
  }

  rowCells(y) {
    const row = new Uint8Array(this.width);
    const base = y * this.width;
    for (let x = 0; x < this.width; x++) row[x] = this.solution[base + x];
    return row;
  }

  colCells(x) {
    const col = new Uint8Array(this.height);
    for (let y = 0; y < this.height; y++) col[y] = this.solution[y * this.width + x];
    return col;
  }

  // Stable key of the solution grid, for uniqueness comparison in the certifier/oracle.
  solutionKey() {
    return this.solution.join('');
  }

  // Render the solution back to ASCII rows (round-trips fromAscii). Useful in tests.
  toAscii(fill = '#', empty = '.') {
    const rows = [];
    for (let y = 0; y < this.height; y++) {
      let s = '';
      for (let x = 0; x < this.width; x++) s += this.at(x, y) ? fill : empty;
      rows.push(s);
    }
    return rows;
  }
}
