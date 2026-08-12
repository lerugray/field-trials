import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';

function pressStep(app, code) { app.input.pressKey(code); app.step(16); app.input.releaseKey(code); app.step(16); }

test('index opens THE LOOM drawer, then a card; weaving it slots a punched card into progress', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);

  const loomCards = shelfCards(SHELVES[0]);
  const first = loomCards[0];
  assert.ok(!app.progress.has(first.id));

  pressStep(app, 'Enter'); // open THE LOOM drawer (shelf 0, selected)
  pressStep(app, 'Enter'); // open the first card in the drawer
  const scene = app.scene;
  assert.ok(scene._board, 'should be in the play scene now');

  // Solve it via the board.
  const p = first.puzzle;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.at(x, y)) scene._board.toggleFill(x, y);
  app.step(16);
  assert.ok(app.progress.has(first.id), 'weaving should record progress');

  // Return to the drawer.
  pressStep(app, 'Escape');
  assert.match(app.log.toText(), /index:/);
});

test('sealed drawers cannot be opened (locked shelves do not enter a card view)', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  pressStep(app, 'ArrowDown'); // select shelf 1 (TWO-THREAD, unbuilt/sealed)
  pressStep(app, 'Enter');     // attempt to open
  assert.ok(!app.scene._board, 'a sealed drawer does not open a card view');
  assert.match(app.log.toText(), /sealed/i);
});

test('Escape returns from the card grid to the drawer list without error', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  pressStep(app, 'Enter');      // open THE LOOM
  pressStep(app, 'ArrowRight'); // move card selection
  pressStep(app, 'Escape');     // back to the drawer list
  assert.doesNotThrow(() => { app.step(16); app.render(); });
});

test('the index renders both views without error', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  assert.doesNotThrow(() => { app.step(16); app.render(); });
  pressStep(app, 'Enter'); // into the card grid
  assert.doesNotThrow(() => { app.step(16); app.render(); });
});

test('ArrowUp and ArrowDown navigate the four-column card grid without a FAULT', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  pressStep(app, 'Enter');
  pressStep(app, 'ArrowDown'); // card 0 -> card 4
  pressStep(app, 'ArrowUp');   // card 4 -> card 0
  assert.equal(app.log.entries.filter((e) => e.level === 'ERROR').length, 0);
  pressStep(app, 'Enter');
  assert.match(app.log.toText(), new RegExp(`index: open ${shelfCards(SHELVES[0])[0].name}`));
});

test('opening a different drawer resets selection to its teaching card', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  for (const id of SHELVES[0].memberIds) app.progress.add(id); // unlock TWO-THREAD
  app.step(16);
  pressStep(app, 'Enter');
  for (let i = 0; i < 7; i++) pressStep(app, 'ArrowRight');
  pressStep(app, 'Escape');
  pressStep(app, 'ArrowDown');
  pressStep(app, 'Enter');
  pressStep(app, 'Enter');
  assert.match(app.log.toText(), new RegExp(`index: open ${shelfCards(SHELVES[1])[0].name}`));
});

test('Escape on the shelf list returns to the title', () => {
  const app = new App(640, 360);
  app.setScene(makeIndexScene());
  app.step(16);
  pressStep(app, 'Escape');
  pressStep(app, 'Enter');
  assert.match(app.log.toText(), /title: OPEN INDEX/, 'Enter after Escape should act on the title scene');
});
