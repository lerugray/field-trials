import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { Board, BLANK, CROSSED } from '../src/puzzle/board.js';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { twistFor } from '../src/puzzle/twists.js';

const houseShelf = SHELVES.find((s) => s.id === 'house-rules');

test('HOUSE RULES is built with a full shelf of proved (ordinary guess-free) base cards', () => {
  assert.equal(houseShelf.built, true);
  const cards = shelfCards(houseShelf);
  assert.ok(cards.length >= 13);
  const { certify } = twistFor('house-rules');
  const failures = cards.filter((c) => !certify(c).ok).map((c) => c.id);
  assert.deepEqual(failures, [], `unproved house-rules cards: ${failures.join(', ')}`);
  // Distinct from THE LOOM (no duplicate pictures across the two base-machine shelves).
  const loom = new Set(SHELVES[0].memberIds);
  for (const c of cards) assert.ok(!loom.has(c.id), `${c.id} should not also be in THE LOOM`);
});

test('Board.reset wipes marks and history back to a bare loom', () => {
  const p = Puzzle.fromAscii(['##', '..']);
  const b = new Board(p);
  b.toggleFill(0, 0);
  b.toggleCross(1, 1);
  assert.notEqual(b.primary[0], BLANK);
  b.reset();
  for (let i = 0; i < b.primary.length; i++) assert.equal(b.primary[i], BLANK);
  b.undo(); // nothing to undo after a reset (history cleared) -> no throw, no change
  for (let i = 0; i < b.primary.length; i++) assert.equal(b.primary[i], BLANK);
});

function firstEmptyCells(puzzle, n) {
  const cells = [];
  for (let y = 0; y < puzzle.height && cells.length < n; y++)
    for (let x = 0; x < puzzle.width && cells.length < n; x++)
      if (!puzzle.at(x, y)) cells.push({ x, y });
  return cells;
}

test('a wrong stitch is struck through (converted to a cross) and logged as a strike', () => {
  const app = new App(640, 360);
  const card = shelfCards(houseShelf)[0];
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const [empty] = firstEmptyCells(card.puzzle, 1);
  board.toggleFill(empty.x, empty.y); // lay a stitch where the pattern is bare
  app.step(16);                        // the play scene enforces the penalty
  assert.equal(board.primaryAt(empty.x, empty.y), CROSSED, 'the wrong stitch is struck out');
  assert.match(app.log.toText(), /strike 1\/3/);
});

test('undo after a penalty restores the playable pre-mistake cloth without farming strikes', () => {
  const app = new App(640, 360);
  const card = shelfCards(houseShelf)[0];
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const [empty] = firstEmptyCells(card.puzzle, 1);

  // One player action owns both the bad fill and the supervisor's struck cross.
  board.toggleFill(empty.x, empty.y);
  app.step(16);
  assert.equal(board.primaryAt(empty.x, empty.y), CROSSED);
  assert.equal(board._undo.length, 1, 'penalty consequence is part of the bad stitch');

  for (let i = 0; i < 3; i++) {
    app.input.pressKey('KeyZ'); app.step(16);
    app.input.releaseKey('KeyZ'); app.step(16);
  }
  assert.equal(board.primaryAt(empty.x, empty.y), BLANK, 'undo removes the wrong stitch and its cross');
  assert.equal(board._undo.length, 0, 'repeated undo drains and then stays empty');
  assert.equal((app.log.toText().match(/house-rules: strike/g) || []).length, 1, 'the strike remains history but is never re-applied');
  assert.doesNotMatch(app.log.toText(), /cloth tore/, 'three undos can never tear the cloth');

  app.input.pressKey('KeyR'); app.step(16);
  app.input.releaseKey('KeyR'); app.step(16);
  assert.equal(board.primaryAt(empty.x, empty.y), CROSSED, 'redo restores the whole penalized action');
  assert.equal((app.log.toText().match(/house-rules: strike/g) || []).length, 1, 'redo does not create a new strike');
});

test('a correct stitch never strikes', () => {
  const app = new App(640, 360);
  const card = shelfCards(houseShelf)[0];
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  // Lay a genuinely correct stitch.
  let placed = null;
  for (let y = 0; y < card.puzzle.height && !placed; y++)
    for (let x = 0; x < card.puzzle.width && !placed; x++)
      if (card.puzzle.at(x, y)) placed = { x, y };
  board.toggleFill(placed.x, placed.y);
  app.step(16);
  assert.equal(board.primaryAt(placed.x, placed.y), 1, 'a correct stitch stays laid');
  assert.doesNotMatch(app.log.toText(), /strike/);
});

test('three strikes tears the cloth back to a bare loom', () => {
  const app = new App(640, 360);
  const card = shelfCards(houseShelf)[0];
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const empties = firstEmptyCells(card.puzzle, 3);
  for (const e of empties) { board.toggleFill(e.x, e.y); app.step(16); }
  // After the third strike the board is wiped.
  for (let i = 0; i < board.primary.length; i++) assert.equal(board.primary[i], BLANK, 'cloth torn -> bare loom');
  assert.match(app.log.toText(), /cloth tore/);
});

test('the twist tag reads as HOUSE RULES and renders without error', () => {
  const app = new App(640, 360);
  const card = shelfCards(houseShelf)[0];
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  assert.equal(twistFor(card.twist).marginLabel.includes('HOUSE RULES'), true);
  assert.doesNotThrow(() => { app.step(16); app.render(); });
});
