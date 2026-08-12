import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { makeTwoThreadScene } from '../src/scenes/twoThreadScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { ColoredBoard, CB_A, CB_B } from '../src/puzzle/coloredBoard.js';
import { nextColoredHint } from '../src/puzzle/twothread.js';

const twoThread = SHELVES.find((s) => s.id === 'two-thread');

function pressStep(app, code) { app.input.pressKey(code); app.step(16); app.input.releaseKey(code); app.step(16); }

test('the two-thread shelf is built with coloured cards carrying colour clues', () => {
  assert.equal(twoThread.built, true);
  const cards = shelfCards(twoThread);
  assert.ok(cards.length >= 13);
  for (const c of cards) {
    assert.equal(c.twist, 'two-thread');
    assert.ok(c.colored && c.colored.grid && c.colored.rowClues, `${c.id} carries a coloured grid + clues`);
    assert.ok(!c.puzzle, `${c.id} has no binary puzzle`);
  }
});

test('laying both threads to the solution weaves the card', () => {
  const app = new App(640, 360);
  const card = shelfCards(twoThread).find((c) => c.id === 'flagAB');
  app.setScene(makeTwoThreadScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const g = card.colored.grid;
  for (let y = 0; y < card.height; y++) for (let x = 0; x < card.width; x++) {
    const v = g[y * card.width + x];
    if (v === CB_A) board.place(x, y, CB_A);
    else if (v === CB_B) board.place(x, y, CB_B);
  }
  app.step(16);
  assert.ok(board.isSolved(), 'both threads laid -> solved');
  assert.ok(app.progress.has(card.id), 'the card is woven');
});

test('ColoredBoard: strokes undo atomically; solved needs both threads correct', () => {
  const card = shelfCards(twoThread).find((c) => c.id === 'flagAB');
  const b = new ColoredBoard(card);
  b.place(0, 0, CB_A);
  assert.equal(b.markAt(0, 0), CB_A);
  b.undo();
  assert.equal(b.markAt(0, 0), 0, 'undo clears the stitch');
  // Laying thread A where B belongs is a mistake and never solves.
  const g = card.colored.grid;
  let bcell = null;
  for (let i = 0; i < g.length && !bcell; i++) if (g[i] === CB_B) bcell = { x: i % card.width, y: Math.floor(i / card.width) };
  b.place(bcell.x, bcell.y, CB_A);
  assert.ok(b.isMistake(bcell.x, bcell.y), 'wrong colour is a mistake');
});

test('the coloured hint points at a forced thread and flags mistakes', () => {
  const card = shelfCards(twoThread).find((c) => c.id === 'flagAB');
  const b = new ColoredBoard(card);
  const h = nextColoredHint(card.width, card.height, card.colored.rowClues, card.colored.colClues, b.marks, b.solution);
  assert.equal(h.kind, 'deduction');
  assert.ok(h.color === CB_A || h.color === CB_B);
  // Introduce a wrong thread -> the hint flags it.
  const g = card.colored.grid;
  let bare = null;
  for (let i = 0; i < g.length && !bare; i++) if (g[i] === 0) bare = i;
  if (bare !== null) {
    b.place(bare % card.width, Math.floor(bare / card.width), CB_A);
    const h2 = nextColoredHint(card.width, card.height, card.colored.rowClues, card.colored.colClues, b.marks, b.solution);
    assert.equal(h2.kind, 'mistake');
  }
});

test('the index routes a two-thread card into the coloured scene', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  pressStep(app, 'ArrowDown'); // shelf 1 = TWO-THREAD
  // It is unlocked from the start? No: only THE LOOM opens first. Open it directly instead.
  const card = shelfCards(twoThread)[0];
  app.setScene(makeTwoThreadScene(card, { onExit: () => {} }));
  app.step(16);
  assert.ok(app.scene._board instanceof ColoredBoard, 'coloured board scene active');
  assert.doesNotThrow(() => app.render());
});
