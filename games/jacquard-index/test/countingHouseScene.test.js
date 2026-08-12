import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makeCountingHouseScene } from '../src/scenes/countingHouseScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';

const shelf = SHELVES.find((s) => s.id === 'counting-house');

test('COUNTING-HOUSE is built with proved even-height cards', () => {
  assert.equal(shelf.built, true);
  const cards = shelfCards(shelf);
  assert.ok(cards.length >= 13);
  for (const c of cards) {
    assert.equal(c.twist, 'counting-house');
    assert.equal(c.puzzle.height % 2, 0, `${c.id} even height`);
  }
});

test('solving a ledger card through the scene weaves it; auto-X is off', () => {
  const app = new App(640, 360);
  const card = shelfCards(shelf)[0];
  app.setScene(makeCountingHouseScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  assert.equal(board.autoX, false, 'auto-X withheld so the twist keeps its row info hidden');
  const p = card.puzzle;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.at(x, y)) board.toggleFill(x, y);
  app.step(16);
  assert.ok(board.isSolved());
  assert.ok(app.progress.has(card.id));
  assert.doesNotThrow(() => app.render());
});

test('the scene renders mid-solve without error (ledgers + bracket)', () => {
  const app = new App(640, 360);
  const card = shelfCards(shelf).find((c) => c.id === 'ch_heart');
  app.setScene(makeCountingHouseScene(card, { onExit: () => {} }));
  app.step(16);
  const b = app.scene._board, p = card.puzzle;
  let n = 0;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.at(x, y) && n++ % 2 === 0) b.toggleFill(x, y);
  assert.doesNotThrow(() => { app.step(16); app.render(); });
});
