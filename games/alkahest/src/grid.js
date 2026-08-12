/* ALKAHEST -- grid: the pure panel machine (no rendering).
 *
 * Implements the mechanics characterized in docs/STUDY-machine.md: a COLS-wide
 * well of cells, the swap verb, gravity, match detection (rows/cols, L/T, combo
 * breadth), and an instant cascade resolver that reports chain depth + combos.
 * This module is deterministic and rendering-free so it can be tested
 * adversarially (chain detection is the heart). The animated tick loop, rise,
 * and stop-time wrap this in a later increment.
 *
 * Cell model: null = empty; else { t: reagentType, st: 'idle'|'clearing',
 * dross: bool, chain: int }. Only settled idle non-dross panels match.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var COLS = 6;
  var ROWS = 14;      // 12 visible + 2 buffer (TUNE)

  function panel(t) { return { t: t, st: "idle", dross: false, chain: 0 }; }
  function drossCell(id) { return { t: -1, st: "idle", dross: true, slabId: id, chain: 0 }; }

  function Grid(opts) {
    opts = opts || {};
    this.cols = opts.cols || COLS;
    this.rows = opts.rows || ROWS;
    this.typeCount = opts.typeCount || 6;
    this.cells = [];
    for (var y = 0; y < this.rows; y++) {
      this.cells[y] = new Array(this.cols).fill(null);
    }
    this._nextSlabId = 1; // dross slabs group cells by id so they fall rigidly
  }

  Grid.prototype.inBounds = function (x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  };
  Grid.prototype.at = function (x, y) { return this.inBounds(x, y) ? this.cells[y][x] : null; };
  Grid.prototype.put = function (x, y, cell) { if (this.inBounds(x, y)) this.cells[y][x] = cell; };
  Grid.prototype.isEmpty = function (x, y) { return this.inBounds(x, y) && this.cells[y][x] === null; };

  /* highest occupied row index +1 (0 if empty column-agnostic) */
  Grid.prototype.stackHeight = function () {
    for (var y = this.rows - 1; y >= 0; y--) {
      for (var x = 0; x < this.cols; x++) if (this.cells[y][x]) return y + 1;
    }
    return 0;
  };

  /* ---- swap: the only material verb (STUDY §2) ----
   * exchanges (x,y) and (x+1,y). Empty is a valid partner (slide): a lone live
   * panel can be moved into an adjacent legal empty cell with the same input.
   * Dross and mid-clear cells cannot be swapped. Returns true if the swap
   * committed. */
  Grid.prototype.swap = function (x, y) {
    if (!this.inBounds(x, y) || !this.inBounds(x + 1, y)) return false;
    var a = this.cells[y][x], b = this.cells[y][x + 1];
    if (a === null && b === null) return false;            // two empties: no-op
    if ((a && (a.dross || a.st === "clearing")) ||
        (b && (b.dross || b.st === "clearing"))) return false;
    this.cells[y][x] = b;
    this.cells[y][x + 1] = a;
    return true;
  };

  /* true when the cursor at (x,y) covers exactly one live panel and one empty
   * cell -- the ratified single-block adjacent move is available here. */
  Grid.prototype.canSlide = function (x, y) {
    if (!this.inBounds(x, y) || !this.inBounds(x + 1, y)) return false;
    var a = this.cells[y][x], b = this.cells[y][x + 1];
    function live(c) { return c && c.st === "idle" && !c.dross; }
    return (live(a) && b === null) || (a === null && live(b));
  };

  /* ---- gravity: rigid unit-based settle (STUDY-machine §3, STUDY-duel §1) ----
   * A UNIT is one live panel OR one whole dross slab (grouped by slabId). Units
   * fall under gravity; a slab drops only if its WHOLE footprint is unsupported.
   * A unit is "grounded" if any of its cells rests on the floor or on a grounded
   * foreign unit; grounding is transitive (a stack settles together). Live
   * panels rest on top of slabs; slabs rest on panels/floor. Dross-free boards
   * reduce to ordinary per-panel gravity. */
  Grid.prototype._computeUnits = function () {
    var unitCells = {}, unitOf = {}; // key -> [[x,y]..] ; "x,y" -> key
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var c = this.cells[y][x];
        if (c === null) continue;
        var key = c.dross ? "d" + c.slabId : "p" + x + "," + y;
        (unitCells[key] || (unitCells[key] = [])).push([x, y]);
        unitOf[x + "," + y] = key;
      }
    }
    return { unitCells: unitCells, unitOf: unitOf };
  };

  Grid.prototype._grounded = function (u) {
    var grounded = {}, keys = Object.keys(u.unitCells);
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (grounded[key]) continue;
        var cells = u.unitCells[key];
        for (var j = 0; j < cells.length; j++) {
          var x = cells[j][0], y = cells[j][1];
          if (y === 0) { grounded[key] = true; changed = true; break; }
          var belowKey = u.unitOf[x + "," + (y - 1)];
          if (belowKey && belowKey !== key && grounded[belowKey]) {
            grounded[key] = true; changed = true; break;
          }
        }
      }
    }
    return grounded;
  };

  /* true if any unit is unsupported (still settling) */
  Grid.prototype.hasFloating = function () {
    var u = this._computeUnits();
    var grounded = this._grounded(u);
    var keys = Object.keys(u.unitCells);
    for (var i = 0; i < keys.length; i++) if (!grounded[keys[i]]) return true;
    return false;
  };

  /* advance gravity by ONE cell: every unsupported unit drops one row together.
   * Repeated calls converge to the same rest state as collapse(). */
  Grid.prototype.collapseOneStep = function () {
    var u = this._computeUnits();
    var grounded = this._grounded(u);
    var keys = Object.keys(u.unitCells);
    var moving = [];
    for (var i = 0; i < keys.length; i++) {
      if (grounded[keys[i]]) continue;
      var cells = u.unitCells[keys[i]];
      for (var j = 0; j < cells.length; j++) moving.push(cells[j]);
    }
    if (moving.length === 0) return false;
    // lift all moving cells, then set them one row lower (targets are vacated)
    var carried = [];
    for (var k = 0; k < moving.length; k++) {
      var mx = moving[k][0], my = moving[k][1];
      carried.push([mx, my, this.cells[my][mx]]);
      this.cells[my][mx] = null;
    }
    for (var q = 0; q < carried.length; q++) {
      this.cells[carried[q][1] - 1][carried[q][0]] = carried[q][2];
    }
    return true;
  };

  /* instant full settle: step until nothing moves */
  Grid.prototype.collapse = function () {
    var moved = false, guard = 0;
    while (this.collapseOneStep() && guard++ < this.rows * this.cols * 4) moved = true;
    return moved;
  };

  /* ---- match detection (STUDY §5) ----
   * returns a Set of "x,y" keys for every idle panel in a run of >=3 same-type
   * in a row or column. L/T shared cells appear once (the Set dedupes), so combo
   * size (Set.size) counts each cell once. */
  Grid.prototype.findMatches = function () {
    var hits = new Set();
    var self = this;
    function matchable(c) { return c && c.st === "idle" && !c.dross; }
    // horizontal runs
    for (var y = 0; y < this.rows; y++) {
      var run = 1;
      for (var x = 1; x <= this.cols; x++) {
        var prev = self.cells[y][x - 1];
        var cur = x < this.cols ? self.cells[y][x] : null;
        if (x < this.cols && matchable(cur) && matchable(prev) && cur.t === prev.t) {
          run++;
        } else {
          if (run >= 3 && matchable(prev)) {
            for (var k = 0; k < run; k++) hits.add((x - 1 - k) + "," + y);
          }
          run = 1;
        }
      }
    }
    // vertical runs
    for (var x2 = 0; x2 < this.cols; x2++) {
      var vrun = 1;
      for (var y2 = 1; y2 <= this.rows; y2++) {
        var vprev = self.cells[y2 - 1][x2];
        var vcur = y2 < this.rows ? self.cells[y2][x2] : null;
        if (y2 < this.rows && matchable(vcur) && matchable(vprev) && vcur.t === vprev.t) {
          vrun++;
        } else {
          if (vrun >= 3 && matchable(vprev)) {
            for (var k2 = 0; k2 < vrun; k2++) hits.add(x2 + "," + (y2 - 1 - k2));
          }
          vrun = 1;
        }
      }
    }
    return hits;
  };

  /* remove a set of "x,y" cells (used by the instant resolver + tests) */
  Grid.prototype.removeCells = function (keys) {
    var self = this;
    keys.forEach(function (k) {
      var p = k.split(","), x = +p[0], y = +p[1];
      if (self.inBounds(x, y)) self.cells[y][x] = null;
    });
  };

  /* first empty row index above the contiguous... simply highest occupied+1 */
  Grid.prototype.columnHeight = function (x) {
    for (var y = this.rows - 1; y >= 0; y--) if (this.cells[y][x]) return y + 1;
    return 0;
  };

  /* assign a fresh slab id to each orthogonally-connected region of dross cells
   * (used by fromAscii / any bulk dross placement so slabs fall as rigid units) */
  Grid.prototype._labelSlabs = function () {
    var seen = {};
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var c = this.cells[y][x];
        if (!c || !c.dross || seen[x + "," + y]) continue;
        var id = this._nextSlabId++, stack = [[x, y]];
        while (stack.length) {
          var p = stack.pop(), px = p[0], py = p[1], key = px + "," + py;
          if (seen[key]) continue;
          var cc = this.at(px, py);
          if (!cc || !cc.dross) continue;
          seen[key] = true; cc.slabId = id;
          stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
        }
      }
    }
  };

  /* ---- crush a dross slab onto the stack (STUDY-duel §1, §3) ----
   * Spawns a rigid slab of `width` cols starting at column x0, `height` rows,
   * resting on the HIGHEST surface across its footprint. Returns the new slab id,
   * or -1 if it cannot fit (a top-out shove -- the caller decides consequences).
   * Slabs never spawn beneath live panels (softlock law, STUDY-duel §4). */
  Grid.prototype.addSlab = function (x0, width, height) {
    width = Math.min(width, this.cols);
    x0 = Math.max(0, Math.min(x0, this.cols - width));
    var restY = 0;
    for (var x = x0; x < x0 + width; x++) restY = Math.max(restY, this.columnHeight(x));
    if (restY + height > this.rows) height = this.rows - restY; // clamp; may be 0
    if (height <= 0) return -1;
    var id = this._nextSlabId++;
    for (var yy = restY; yy < restY + height; yy++)
      for (var xx = x0; xx < x0 + width; xx++) this.cells[yy][xx] = drossCell(id);
    return id;
  };

  /* ---- ALBEDO volatile clears: pick one panel to sublimate (STUDY-run §2) ----
   * Given the just-cleared cell keys (a Set), return the "x,y" of one idle live
   * non-dross panel orthogonally adjacent to the cleared group -- the lowest,
   * then leftmost, so the choice is fully deterministic. null if none adjacent.
   * The caller removes it as collateral (it is NOT chain-tagged: pure bonus). */
  Grid.prototype.pickSublimation = function (clearedKeys) {
    var self = this, cand = [], seen = {};
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    clearedKeys.forEach(function (k) {
      var p = k.split(","), x = +p[0], y = +p[1];
      for (var d = 0; d < 4; d++) {
        var nx = x + dirs[d][0], ny = y + dirs[d][1], key = nx + "," + ny;
        if (seen[key] || clearedKeys.has(key)) continue;
        seen[key] = true;
        var c = self.at(nx, ny);
        if (c && c.st === "idle" && !c.dross) cand.push([nx, ny]);
      }
    });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    return cand[0][0] + "," + cand[0][1];
  };

  /* ---- transmute: clears adjacent to dross peel a slab's bottom row (§2) ----
   * For every slab with a dross cell orthogonally adjacent to any cell in
   * `clearedKeys`, convert that slab's BOTTOM row to fresh live panels (type via
   * gen), tagged with `chainId` so a match they form CONTINUES the cascade's
   * chain. Returns an array of "x,y" keys of the newly created live panels. */
  Grid.prototype.transmute = function (clearedKeys, gen, chainId) {
    var self = this, hit = {};
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    clearedKeys.forEach(function (k) {
      var p = k.split(","), x = +p[0], y = +p[1];
      for (var d = 0; d < 4; d++) {
        var nx = x + dirs[d][0], ny = y + dirs[d][1];
        var c = self.at(nx, ny);
        if (c && c.dross) hit[c.slabId] = true;
      }
    });
    var born = [];
    Object.keys(hit).forEach(function (idStr) {
      var id = +idStr, y0 = self.rows;
      for (var y = 0; y < self.rows; y++)
        for (var x = 0; x < self.cols; x++) {
          var c = self.cells[y][x];
          if (c && c.dross && c.slabId === id) { y0 = Math.min(y0, y); }
        }
      if (y0 >= self.rows) return;
      for (var xx = 0; xx < self.cols; xx++) {
        var cc = self.cells[y0][xx];
        if (cc && cc.dross && cc.slabId === id) {
          var np = panel(AL.randInt(gen, self.typeCount));
          np.chain = chainId || 0;
          self.cells[y0][xx] = np;
          born.push(xx + "," + y0);
        }
      }
    });
    return born;
  };

  /* ---- formula operations (STUDY-run §4): direct board edits the machine's
   * active brews + passive reactions perform. All are deterministic and never
   * spawn dross beneath live panels, so the softlock law (§6) is preserved. ---- */

  /* remove every live (idle, non-dross) reagent in column x. Returns the count. */
  Grid.prototype.dissolveColumn = function (x) {
    if (x < 0 || x >= this.cols) return 0;
    var n = 0;
    for (var y = 0; y < this.rows; y++) {
      var c = this.cells[y][x];
      if (c && !c.dross) { this.cells[y][x] = null; n++; }
    }
    return n;
  };

  /* remove every live reagent of type t across the well. Returns the count. */
  Grid.prototype.dissolveType = function (t) {
    var n = 0;
    for (var y = 0; y < this.rows; y++)
      for (var x = 0; x < this.cols; x++) {
        var c = this.cells[y][x];
        if (c && !c.dross && c.t === t) { this.cells[y][x] = null; n++; }
      }
    return n;
  };

  /* remove the lowest `rows` rows that contain any live reagent. Returns count. */
  Grid.prototype.dissolveLowestRows = function (rows) {
    rows = rows || 1;
    var live = [];
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) if (this.cells[y][x] && !this.cells[y][x].dross) { live.push(y); break; }
    }
    var n = 0, take = live.slice(0, rows);
    for (var i = 0; i < take.length; i++) {
      var ry = take[i];
      for (var xx = 0; xx < this.cols; xx++) {
        var cc = this.cells[ry][xx];
        if (cc && !cc.dross) { this.cells[ry][xx] = null; n++; }
      }
    }
    return n;
  };

  /* burn (remove) the single lowest row of dross across all slabs -- the passive
   * Calcination reaction. Reagents above fall. Returns the count removed. */
  Grid.prototype.burnBottomDrossRow = function () {
    var y0 = -1;
    for (var y = 0; y < this.rows && y0 < 0; y++)
      for (var x = 0; x < this.cols; x++) if (this.cells[y][x] && this.cells[y][x].dross) { y0 = y; break; }
    if (y0 < 0) return 0;
    var n = 0;
    for (var xx = 0; xx < this.cols; xx++) {
      var c = this.cells[y0][xx];
      if (c && c.dross) { this.cells[y0][xx] = null; n++; }
    }
    return n;
  };

  /* transmute the BOTTOM row of every dross slab into fresh live reagents at once
   * (the Quintessence brew). Returns the "x,y" keys born. Peels one row per slab,
   * so a tall slab still needs repeated casts -- it can never fully lock. */
  Grid.prototype.transmuteAllBottomRows = function (gen, chainId) {
    var slabBottom = {}; // id -> lowest y
    for (var y = 0; y < this.rows; y++)
      for (var x = 0; x < this.cols; x++) {
        var c = this.cells[y][x];
        if (c && c.dross) { var id = c.slabId; if (slabBottom[id] === undefined) slabBottom[id] = y; }
      }
    var born = [];
    var ids = Object.keys(slabBottom);
    for (var i = 0; i < ids.length; i++) {
      var by = slabBottom[ids[i]], sid = +ids[i];
      for (var bx = 0; bx < this.cols; bx++) {
        var cc = this.cells[by][bx];
        if (cc && cc.dross && cc.slabId === sid) {
          var np = panel(AL.randInt(gen, this.typeCount));
          np.chain = chainId || 0;
          this.cells[by][bx] = np;
          born.push(bx + "," + by);
        }
      }
    }
    return born;
  };

  /* ---- instant cascade resolver (STUDY §6, §7 without animation) ----
   * repeatedly: detect matches -> clear them -> collapse, until stable. Reports
   * chain depth (one link per clearing step) and per-step combo sizes. This is
   * the correctness oracle; the animated tick loop must produce the same totals.
   *
   * Returns { chain, steps: [{cleared, combo}], totalCleared, maxCombo }.
   *  - chain: number of clearing steps (the chain length; 1 = no chain, just a
   *    single clear; 2 = one chained clear; ...). 0 if nothing cleared.
   *  - combo (per step): panels cleared in that step; a combo is combo>=4. */
  Grid.prototype.resolveCascade = function () {
    var steps = [];
    var totalCleared = 0, maxCombo = 0;
    // initial settle so contrived boards behave like post-input states
    this.collapse();
    while (true) {
      var hits = this.findMatches();
      if (hits.size === 0) break;
      var combo = hits.size;
      steps.push({ cleared: combo, combo: combo });
      totalCleared += combo;
      if (combo > maxCombo) maxCombo = combo;
      this.removeCells(hits);
      this.collapse();
    }
    return { chain: steps.length, steps: steps, totalCleared: totalCleared, maxCombo: maxCombo };
  };

  /* ---- deterministic fill for a new bottom row (STUDY §1) ----
   * generates `cols` types using gen (an AL.rng), rerolling any cell that would
   * complete an immediate 3-in-a-row horizontally within the new row OR
   * vertically against the two cells that will sit directly above it (current
   * bottom rows 0 and 1). Guarantees no instant match when the row commits. */
  Grid.prototype.generateRow = function (gen) {
    var row = new Array(this.cols).fill(0);
    for (var x = 0; x < this.cols; x++) {
      var above0 = this.cells[0] && this.cells[0][x];
      var above1 = this.cells[1] && this.cells[1][x];
      var vt = above0 && above1 && !above0.dross && !above1.dross &&
               above0.t === above1.t ? above0.t : -1;
      var t, tries = 0;
      do {
        t = AL.randInt(gen, this.typeCount);
        tries++;
      } while (tries < 40 && (
        (x >= 2 && row[x - 1] === t && row[x - 2] === t) ||  // horizontal in new row
        (t === vt)                                           // vertical vs two above
      ));
      row[x] = t;
    }
    return row;
  };

  /* ascii helper for tests: lines TOP-to-BOTTOM, '.'=empty, digit=type,
   * 'X'=dross. Grid sized to the ascii unless cols/rows already set larger. */
  Grid.fromAscii = function (lines, opts) {
    opts = opts || {};
    var h = lines.length, w = lines[0].length;
    var g = new Grid({ cols: w, rows: opts.rows || h, typeCount: opts.typeCount || 6 });
    for (var i = 0; i < h; i++) {
      var y = h - 1 - i; // top line is highest y
      for (var x = 0; x < w; x++) {
        var ch = lines[i][x];
        if (ch === "." || ch === " ") continue;
        if (ch === "X") { g.cells[y][x] = drossCell(0); } // slab id assigned below
        else g.cells[y][x] = panel(+ch);
      }
    }
    g._labelSlabs();
    return g;
  };

  Grid.prototype.toAscii = function () {
    var out = [];
    for (var i = 0; i < this.rows; i++) {
      var y = this.rows - 1 - i, line = "";
      for (var x = 0; x < this.cols; x++) {
        var c = this.cells[y][x];
        line += c === null ? "." : c.dross ? "X" : String(c.t);
      }
      out.push(line);
    }
    return out;
  };

  AL.Grid = Grid;
  AL.panel = panel;
  AL.drossCell = drossCell;
  AL.GRID = { COLS: COLS, ROWS: ROWS };
});
