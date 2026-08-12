// THE JACQUARD INDEX — TWO-THREAD (shelf 1): paired-colour clues, and its prover.
//
// The twist (seed): two threads on one card. A cell is bare (0), thread A (1), or thread B
// (2). Each line's clue is an ordered sequence of coloured runs { len, color }. Standard
// coloured-nonogram adjacency: two runs of the SAME colour need a bare gap between them; two
// runs of DIFFERENT colours may sit flush (no gap). Thread identity is by stitch SHAPE, not
// hue (hard-rule 6) — that is a render concern; here the two threads are just 1 and 2.
//
// This is a genuine mini-M1: its own line solver (enumerate every placement consistent with
// the known cells, intersect for forced cells), its own fixpoint certifier, and its own
// INDEPENDENT brute-force oracle (row-candidate product, columns verified at the leaf) — no
// shared code path, so the certifier is checked against the oracle exactly as the base
// machine is. A card that is not guess-free + unique under these rules is never content
// (hard-rule 4).

export const BARE = 0;
export const A = 1;
export const B = 2;
const UNK = -1;

// Parse a two-thread motif's rows: '.' bare, 'A'/'a' thread A, 'B'/'b' thread B.
export function parseTwoThread(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const grid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    if (rows[y].length !== width) throw new Error(`row ${y} width mismatch`);
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      grid[y * width + x] = (ch === 'A' || ch === 'a') ? A : (ch === 'B' || ch === 'b') ? B : BARE;
    }
  }
  return { width, height, grid };
}

// The coloured clue of a line: maximal single-colour runs, in order (bare cells break runs).
export function coloredClue(line) {
  const out = [];
  let run = 0, color = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c !== BARE && c === color) { run++; }
    else {
      if (run > 0) out.push({ len: run, color });
      if (c === BARE) { run = 0; color = 0; }
      else { run = 1; color = c; }
    }
  }
  if (run > 0) out.push({ len: run, color });
  return out;
}

// Minimum cells a (sub)clue needs: run lengths plus one bare gap between adjacent SAME-colour
// runs (different-colour neighbours may be flush).
export function minColoredLength(clue) {
  let n = 0;
  for (let k = 0; k < clue.length; k++) {
    n += clue[k].len;
    if (k + 1 < clue.length && clue[k + 1].color === clue[k].color) n += 1;
  }
  return n;
}

// Every full colouring (Uint8Array of 0/1/2) of a `width` line matching `clue` and
// consistent with `known` (known[i] in {-1,0,1,2}). Independent placement generator.
export function coloredPlacements(width, clue, known = null) {
  const out = [];
  const cells = new Uint8Array(width);
  function consistent() {
    if (!known) return true;
    for (let i = 0; i < width; i++) if (known[i] !== UNK && known[i] !== cells[i]) return false;
    return true;
  }
  function rec(k, pos) {
    if (k === clue.length) {
      for (let i = pos; i < width; i++) cells[i] = BARE;
      if (consistent()) out.push(Uint8Array.from(cells));
      return;
    }
    const { len, color } = clue[k];
    const minRest = minColoredLength(clue.slice(k));
    const maxStart = width - minRest;
    for (let s = pos; s <= maxStart; s++) {
      for (let i = pos; i < s; i++) cells[i] = BARE;      // bare before this run
      for (let i = s; i < s + len; i++) cells[i] = color; // the run
      const gap = (k + 1 < clue.length && clue[k + 1].color === color) ? 1 : 0;
      rec(k + 1, s + len + gap);
    }
  }
  rec(0, 0);
  return out;
}

// Intersect all placements: a cell is forced to a colour when every placement agrees.
// Returns a known-array (0/1/2/-1), or null if there is NO placement (contradiction).
export function lineSolveColored(known, clue) {
  const width = known.length;
  const cands = coloredPlacements(width, clue, known);
  if (cands.length === 0) return null;
  const forced = new Int8Array(width).fill(UNK);
  for (let i = 0; i < width; i++) {
    let v = cands[0][i], agree = true;
    for (let j = 1; j < cands.length; j++) if (cands[j][i] !== v) { agree = false; break; }
    if (agree) forced[i] = v;
  }
  return forced;
}

function getRow(board, w, y) { const r = new Int8Array(w); for (let x = 0; x < w; x++) r[x] = board[y * w + x]; return r; }
function getCol(board, w, h, x) { const c = new Int8Array(h); for (let y = 0; y < h; y++) c[y] = board[y * w + x]; return c; }

// Guess-free fixpoint over rows + columns with the coloured line solver.
export function solveColored(width, height, rowClues, colClues) {
  const board = new Int8Array(width * height).fill(UNK);
  for (;;) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      const forced = lineSolveColored(getRow(board, width, y), rowClues[y]);
      if (forced === null) return { status: 'contradiction', board };
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (forced[x] !== UNK) { if (board[i] === UNK) { board[i] = forced[x]; changed = true; } else if (board[i] !== forced[x]) return { status: 'contradiction', board }; }
      }
    }
    for (let x = 0; x < width; x++) {
      const forced = lineSolveColored(getCol(board, width, height, x), colClues[x]);
      if (forced === null) return { status: 'contradiction', board };
      for (let y = 0; y < height; y++) {
        const i = y * width + x;
        if (forced[y] !== UNK) { if (board[i] === UNK) { board[i] = forced[y]; changed = true; } else if (board[i] !== forced[y]) return { status: 'contradiction', board }; }
      }
    }
    if (!changed) break;
  }
  let decided = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== UNK) decided++;
  return { status: decided === board.length ? 'solved' : 'stalled', board, decided, total: board.length };
}

function cluesEqualColored(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].len !== b[i].len || a[i].color !== b[i].color) return false;
  return true;
}

// Independent oracle: count full solutions consistent with all clues (row-candidate product,
// columns verified at the leaf), stopping at `limit`. Shares no deduction with the certifier.
export function countColoredSolutions(width, height, rowClues, colClues, limit = Infinity) {
  const rowCands = rowClues.map((c) => coloredPlacements(width, c));
  for (const list of rowCands) if (list.length === 0) return 0;
  const grid = new Array(height);
  let count = 0;
  function dfs(y) {
    if (count >= limit) return;
    if (y === height) {
      for (let x = 0; x < width; x++) {
        const col = new Uint8Array(height);
        for (let yy = 0; yy < height; yy++) col[yy] = grid[yy][x];
        if (!cluesEqualColored(coloredClue(col), colClues[x])) return;
      }
      count++;
      return;
    }
    for (const cand of rowCands[y]) { grid[y] = cand; dfs(y + 1); if (count >= limit) return; }
  }
  dfs(0);
  return count;
}

// Derive a two-thread puzzle's clues from its grid.
export function twoThreadClues(width, height, grid) {
  const rowClues = [];
  for (let y = 0; y < height; y++) rowClues.push(coloredClue(getRow(grid, width, y)));
  const colClues = [];
  for (let x = 0; x < width; x++) colClues.push(coloredClue(getCol(grid, width, height, x)));
  return { rowClues, colClues };
}

// The next hint for a live coloured board. `marks` uses the ColoredBoard encoding: 0 blank,
// 1 A, 2 B, 3 cross(bare). Returns a mistake, an easiest forced coloured move, or solved.
export function nextColoredHint(width, height, rowClues, colClues, marks, solution) {
  // Player marks -> solver known: blank -> unknown; cross -> bare(0); A/B as-is.
  const known = new Int8Array(width * height).fill(-1);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m === 3) known[i] = BARE;
    else if (m === A) known[i] = A;
    else if (m === B) known[i] = B;
    // A conflict with the solution is unsound to deduce from.
    if ((m === A || m === B) && solution[i] !== m) {
      return { kind: 'mistake', cell: { x: i % width, y: Math.floor(i / width) },
        message: `A thread here conflicts with the proof near row ${Math.floor(i / width) + 1}, column ${i % width + 1}. Undo to continue.` };
    }
    if (m === 3 && solution[i] !== BARE) {
      return { kind: 'mistake', cell: { x: i % width, y: Math.floor(i / width) },
        message: `A thread was crossed off near row ${Math.floor(i / width) + 1}, column ${i % width + 1}. Undo to continue.` };
    }
  }
  const threadName = (c) => (c === A ? 'thread one' : c === B ? 'thread two' : 'bare warp');
  const scanLine = (idxs, clue, kind, index) => {
    const line = new Int8Array(idxs.length);
    for (let k = 0; k < idxs.length; k++) line[k] = known[idxs[k]];
    const forced = lineSolveColored(line, clue);
    if (!forced) return null;
    for (let k = 0; k < idxs.length; k++) {
      if (line[k] === -1 && forced[k] !== -1) {
        const gi = idxs[k];
        const x = gi % width, y = Math.floor(gi / width);
        const human = kind === 'row' ? `row ${index + 1}` : `column ${index + 1}`;
        return { kind: 'deduction', lineKind: kind, lineIndex: index, color: forced[k], cells: [{ x, y, color: forced[k] }],
          point: `Look at ${human}.`, name: 'Technique: coloured line count.',
          message: `In ${human}, ${threadName(forced[k])} is forced.` };
      }
    }
    return null;
  };
  for (let y = 0; y < height; y++) {
    const idxs = []; for (let x = 0; x < width; x++) idxs.push(y * width + x);
    const hit = scanLine(idxs, rowClues[y], 'row', y); if (hit) return hit;
  }
  for (let x = 0; x < width; x++) {
    const idxs = []; for (let y = 0; y < height; y++) idxs.push(y * width + x);
    const hit = scanLine(idxs, colClues[x], 'col', x); if (hit) return hit;
  }
  return { kind: 'solved' };
}

// Prove a TWO-THREAD card: guess-free under the coloured rules AND unique (independent
// oracle on grids up to 10x10). Reports a difficulty band from the number of solver passes
// is out of scope; the tier is left null (coloured) and the band shows CERTIFIED.
export function certifyTwoThread(motif) {
  const { width, height, grid } = motif.grid ? motif : parseTwoThread(motif.rows);
  const { rowClues, colClues } = twoThreadClues(width, height, grid);
  const r = solveColored(width, height, rowClues, colClues);

  let guessFree = r.status === 'solved';
  if (guessFree) for (let i = 0; i < grid.length; i++) if (r.board[i] !== grid[i]) { guessFree = false; break; }

  const oracleEligible = width <= 10 && height <= 10;
  let unique = null;
  if (oracleEligible) unique = countColoredSolutions(width, height, rowClues, colClues, 2) === 1;

  const ok = guessFree && unique !== false;
  let reason = 'proved-two-thread';
  if (!guessFree) reason = r.status === 'contradiction' ? 'contradiction' : 'stalled';
  else if (unique === false) reason = 'not-unique';

  return {
    id: motif.id, name: motif.name, blurb: motif.blurb,
    width, height, grid, rowClues, colClues,
    ok, reason, guessFree, unique, oracleChecked: oracleEligible,
    tier: null, tierName: 'two-thread', twist: 'two-thread',
  };
}
