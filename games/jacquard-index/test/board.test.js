import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import {
  Board, BLANK, FILLED, CROSSED, PENCIL_FILL, PENCIL_NONE,
} from '../src/puzzle/board.js';

const T = () => Puzzle.fromAscii(['###', '.#.', '.#.']); // clues let us test auto-X/win

test('toggleFill cycles a cell fill on and off', () => {
  const b = new Board(T(), { autoX: false });
  b.toggleFill(0, 0);
  assert.equal(b.primaryAt(0, 0), FILLED);
  b.toggleFill(0, 0);
  assert.equal(b.primaryAt(0, 0), BLANK);
});

test('toggleCross cycles a cross; fill replaces a cross', () => {
  const b = new Board(T(), { autoX: false });
  b.toggleCross(2, 2);
  assert.equal(b.primaryAt(2, 2), CROSSED);
  b.toggleFill(2, 2);
  assert.equal(b.primaryAt(2, 2), FILLED); // fill overrides cross
});

test('pencil marks blank cells and setting a primary clears the pencil', () => {
  const b = new Board(T(), { autoX: false });
  b.togglePencilFill(1, 1);
  assert.equal(b.pencilAt(1, 1), PENCIL_FILL);
  assert.equal(b.primaryAt(1, 1), BLANK);
  b.toggleFill(1, 1);
  assert.equal(b.primaryAt(1, 1), FILLED);
  assert.equal(b.pencilAt(1, 1), PENCIL_NONE); // pencil cleared
});

test('pencil does not apply over a non-blank primary', () => {
  const b = new Board(T(), { autoX: false });
  b.toggleFill(0, 0);
  b.togglePencilFill(0, 0);
  assert.equal(b.pencilAt(0, 0), PENCIL_NONE);
  assert.equal(b.primaryAt(0, 0), FILLED);
});

test('auto-X crosses the rest of a satisfied line', () => {
  const b = new Board(T()); // autoX default ON; row 0 clue [3]
  b.toggleFill(0, 0);
  b.toggleFill(1, 0);
  b.toggleFill(2, 0); // row 0 now satisfied [3]; col 0 clue [1] also satisfied
  // Row 0 is fully filled so nothing to auto-X there; but col 0 clue [1] is satisfied,
  // so col 0 rows 1,2 auto-cross.
  assert.equal(b.primaryAt(0, 1), CROSSED);
  assert.equal(b.primaryAt(0, 2), CROSSED);
});

test('auto-X never overwrites a pencil mark', () => {
  const b = new Board(T());
  b.togglePencilFill(0, 1); // pencil on a cell col 0 will try to auto-X
  b.toggleFill(0, 0);
  b.toggleFill(1, 0);
  b.toggleFill(2, 0); // col 0 clue [1] satisfied -> auto-X col 0 blanks
  assert.equal(b.pencilAt(0, 1), PENCIL_FILL); // preserved
  assert.equal(b.primaryAt(0, 1), BLANK);      // not crossed over the pencil
  assert.equal(b.primaryAt(0, 2), CROSSED);    // the pencil-free blank got crossed
});

test('auto-X can be disabled', () => {
  const b = new Board(T(), { autoX: false });
  b.toggleFill(0, 0);
  b.toggleFill(1, 0);
  b.toggleFill(2, 0);
  assert.equal(b.primaryAt(0, 1), BLANK); // no auto-X
});

test('drag stroke paints only cells in the first cell prior state', () => {
  const b = new Board(Puzzle.fromAscii(['.....', '.....']), { autoX: false });
  b.toggleCross(2, 0); // put a cross mid-row
  // Drag-fill across the row: starts on a BLANK cell, should stop at the cross.
  b.beginStroke(0, 0, 'fill');
  b.extendStroke(1, 0);
  b.extendStroke(2, 0); // conflicting (CROSSED) -> ends stroke
  b.extendStroke(3, 0); // ignored, stroke ended
  b.endStroke();
  assert.equal(b.primaryAt(0, 0), FILLED);
  assert.equal(b.primaryAt(1, 0), FILLED);
  assert.equal(b.primaryAt(2, 0), CROSSED); // untouched by the fill stroke
  assert.equal(b.primaryAt(3, 0), BLANK);   // stroke had ended
});

test('a drag stroke undoes atomically as one unit', () => {
  const b = new Board(Puzzle.fromAscii(['....']), { autoX: false });
  b.beginStroke(0, 0, 'fill');
  b.extendStroke(1, 0);
  b.extendStroke(2, 0);
  b.endStroke();
  assert.equal(b.primaryAt(2, 0), FILLED);
  assert.ok(b.canUndo());
  b.undo();
  for (let x = 0; x < 4; x++) assert.equal(b.primaryAt(x, 0), BLANK); // all reverted
  assert.ok(b.canRedo());
  b.redo();
  assert.equal(b.primaryAt(1, 0), FILLED);
});

test('undo reverts auto-X bundled into the same stroke', () => {
  const b = new Board(T());
  b.toggleFill(0, 0); // col 0 clue [1] satisfied -> auto-X (0,1),(0,2) in THIS stroke
  b.toggleFill(1, 0);
  b.toggleFill(2, 0); // col 2 clue [1] satisfied -> auto-X (2,1),(2,2) in THIS stroke
  assert.equal(b.primaryAt(0, 1), CROSSED); // from stroke 1
  assert.equal(b.primaryAt(2, 1), CROSSED); // from stroke 3
  b.undo(); // undo stroke 3 only -> its fill AND its auto-X revert
  assert.equal(b.primaryAt(2, 0), BLANK);
  assert.equal(b.primaryAt(2, 1), BLANK); // stroke-3 auto-X reverted
  assert.equal(b.primaryAt(2, 2), BLANK);
  assert.equal(b.primaryAt(0, 1), CROSSED); // stroke-1 auto-X untouched
});

test('line satisfaction drives clue dimming', () => {
  const b = new Board(T(), { autoX: false });
  assert.ok(!b.isRowSatisfied(0));
  b.toggleFill(0, 0); b.toggleFill(1, 0); b.toggleFill(2, 0);
  assert.ok(b.isRowSatisfied(0));
  assert.ok(b.isColSatisfied(0)); // col 0 clue [1], one fill
});

test('isSolved when filled cells match the solution', () => {
  const p = T();
  const b = new Board(p, { autoX: false });
  assert.ok(!b.isSolved());
  // Fill exactly the solution cells.
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.at(x, y)) b.toggleFill(x, y);
    }
  }
  assert.ok(b.isSolved());
});

test('isMistake flags a fill off the solution', () => {
  const b = new Board(T(), { autoX: false });
  b.toggleFill(0, 1); // col 0 row 1 is empty in the solution
  assert.ok(b.isMistake(0, 1));
  assert.ok(!b.isMistake(0, 0)); // row 0 col 0 is filled in solution
});

test('no-op verbs do not push an undo entry', () => {
  const b = new Board(T(), { autoX: false });
  b.togglePencilFill(0, 0); // pencil
  b.toggleFill(0, 0);        // clears pencil, fills
  const undosBefore = b._undo.length;
  // Re-fill an already-filled? toggling fill would blank it (a real change). Instead,
  // begin a stroke that changes nothing: pencil over a filled cell.
  b.togglePencilFill(0, 0); // primary FILLED -> pencil ignored -> no change
  assert.equal(b._undo.length, undosBefore);
});

test('undo and serialized history stay bounded after 1,000 operations', () => {
  const b = new Board(Puzzle.fromAscii(['..........']), { autoX: false });
  for (let i = 0; i < 1000; i++) b.toggleFill(i % 10, 0);

  const state = b.saveState();
  assert.equal(b._undo.length, 100, 'live undo history is capped at 100 atomic actions');
  assert.equal(state.undo.length, 100, 'the save blob carries at most the same 100 actions');
  for (let i = 0; i < 100; i++) assert.equal(b.undo(), true);
  assert.equal(b.undo(), false, 'the cap keeps undo available for the most recent 100 actions');
  assert.equal(b.saveState().redo.length, 100, 'redo history is capped too');
});
