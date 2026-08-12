import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { Puzzle } from '../src/puzzle/puzzle.js';
import {
  mirrorImage, isSymmetric, certifyMirror, AXES,
} from '../src/puzzle/mirror.js';
import { MIRROR_MOTIFS, MIRROR_TEACHING } from '../src/content/mirrorMotifs.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { twistFor, cardBand } from '../src/puzzle/twists.js';

test('every MIRROR-WEAVE card is symmetric on its axis and proved guess-free + unique', () => {
  const failures = [];
  for (const m of MIRROR_MOTIFS) {
    assert.ok(AXES.includes(m.axis), `${m.id} declares a known axis`);
    const r = certifyMirror(m);
    if (!r.ok) failures.push(`${m.id}:${r.reason}`);
    assert.ok(r.tier, `${m.id} carries a base tier`);
  }
  assert.deepEqual(failures, [], `unproved mirror cards: ${failures.join(', ')}`);
  assert.equal(MIRROR_MOTIFS[0].id, MIRROR_TEACHING);
});

test('mirrorImage and isSymmetric agree on the three axes', () => {
  assert.deepEqual(mirrorImage(0, 1, 'v', 5, 5), { x: 4, y: 1 });
  assert.deepEqual(mirrorImage(1, 0, 'h', 5, 5), { x: 1, y: 4 });
  assert.deepEqual(mirrorImage(0, 0, 'rot180', 5, 5), { x: 4, y: 4 });
  const p = Puzzle.fromAscii(['#.#', '...', '#.#']);
  for (const axis of AXES) assert.equal(isSymmetric((x, y) => p.at(x, y), 3, 3, axis), true);
  const asym = Puzzle.fromAscii(['#..', '...', '...']);
  assert.equal(isSymmetric((x, y) => asym.at(x, y), 3, 3, 'v'), false);
});

test('certifyMirror REJECTS a grid that lacks the declared symmetry', () => {
  const r = certifyMirror({ id: 'bad', name: 'BAD', axis: 'v', rows: ['#..', '...', '...'] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-symmetric');
});

test('the shelf is built and its band reads the base tier through the twist', () => {
  const shelf = SHELVES.find((s) => s.id === 'mirror-weave');
  assert.equal(shelf.built, true);
  const cards = shelfCards(shelf);
  assert.ok(cards.length >= 13);
  assert.equal(twistFor('mirror-weave').fold, true);
  for (const c of cards) {
    assert.equal(c.twist, 'mirror-weave');
    assert.match(cardBand(c).tierName, /^T\d/, `${c.id} shows a tier band`);
  }
});

test('the loom weaves both sides: a laid stitch mirrors across the fold', () => {
  const app = new App(640, 360);
  const card = shelfCards(SHELVES.find((s) => s.id === 'mirror-weave')).find((c) => c.id === 'butterfly');
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const p = card.puzzle;
  // Lay a correct, off-axis stitch; its mirror must weave itself.
  board.toggleFill(0, 0);
  app.step(16);
  const m = mirrorImage(0, 0, 'v', p.width, p.height);
  assert.equal(board.primaryAt(m.x, m.y), 1, 'the mirror stitch is woven automatically');
});

test('folded marks share one history entry so undo drains and redo does not re-mirror', () => {
  const app = new App(640, 360);
  const card = shelfCards(SHELVES.find((s) => s.id === 'mirror-weave')).find((c) => c.id === 'butterfly');
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const m = mirrorImage(0, 0, 'v', card.puzzle.width, card.puzzle.height);

  app.input.pressKey('Space'); app.step(16);
  app.input.releaseKey('Space'); app.step(16);
  assert.equal(board.primaryAt(0, 0), 1);
  assert.equal(board.primaryAt(m.x, m.y), 1);
  assert.equal(board._undo.length, 1, 'fold is atomic with the originating stitch');

  app.input.pressKey('KeyZ'); app.step(16);
  app.input.releaseKey('KeyZ'); app.step(16);
  assert.equal(board.primaryAt(0, 0), 0);
  assert.equal(board.primaryAt(m.x, m.y), 0);
  assert.equal(board._undo.length, 0, 'undo stack actually drains');
  assert.equal(board._redo.length, 1);
  app.step(16);
  assert.equal(board._undo.length, 0, 'fold reconciliation does not create history after undo');

  app.input.pressKey('KeyR'); app.step(16);
  app.input.releaseKey('KeyR'); app.step(16);
  assert.equal(board.primaryAt(0, 0), 1);
  assert.equal(board.primaryAt(m.x, m.y), 1);
  assert.equal(board._undo.length, 1, 'redo restores the same atomic fold');
});

test('solving one half completes the pattern through the fold', () => {
  const app = new App(640, 360);
  const card = shelfCards(SHELVES.find((s) => s.id === 'mirror-weave')).find((c) => c.id === 'butterfly');
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const board = app.scene._board;
  const p = card.puzzle;
  // Fill only the left half + centre column of the true pattern; the fold does the rest.
  const mid = Math.floor(p.width / 2);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x <= mid; x++) {
      if (p.at(x, y)) board.toggleFill(x, y);
    }
  }
  app.step(16);
  assert.ok(board.isSolved(), 'the fold completes the far half');
  assert.ok(app.progress.has(card.id), 'the card is woven');
});
