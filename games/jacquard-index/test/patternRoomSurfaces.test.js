import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { makeTwoThreadScene } from '../src/scenes/twoThreadScene.js';
import { makeCountingHouseScene } from '../src/scenes/countingHouseScene.js';
import { starterPuzzles } from '../src/content/starter.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { CB_A, CB_B } from '../src/puzzle/coloredBoard.js';

function renderScene(scene) {
  const app = new App(640, 360);
  app.setScene(scene);
  app.step(16);
  app.render();
  return app;
}

function assertApprovedRoomLanguage(fb, label) {
  const window = fb.getPixel(35, 80);
  const wall = fb.getPixel(8, 210);
  const cabinet = fb.getPixel(560, 100);
  const bench = fb.getPixel(30, 346);
  assert.ok(window[1] > 95 && window[2] > 90, `${label}: north-light sash missing (${window})`);
  assert.ok(wall[0] > 35 && wall[0] < 135, `${label}: limewashed wall missing (${wall})`);
  assert.ok(cabinet[0] > cabinet[2] + 15, `${label}: timber drawer bank missing (${cabinet})`);
  assert.ok(bench[0] > bench[2] + 15, `${label}: cutter bench missing (${bench})`);
}

test('base, TWO-THREAD, and COUNTING-HOUSE use the approved room and cabinet language', () => {
  const base = renderScene(makePlayScene(starterPuzzles()[0]));
  const twoShelf = SHELVES.find((s) => s.id === 'two-thread');
  const two = renderScene(makeTwoThreadScene(shelfCards(twoShelf)[0]));
  const countShelf = SHELVES.find((s) => s.id === 'counting-house');
  const counting = renderScene(makeCountingHouseScene(shelfCards(countShelf)[0]));
  assertApprovedRoomLanguage(base.fb, 'base play');
  assertApprovedRoomLanguage(two.fb, 'two-thread play');
  assertApprovedRoomLanguage(counting.fb, 'counting-house play');
});

test('play-room material and light frames are cached while live marks change', () => {
  const app = renderScene(makePlayScene(starterPuzzles()[0]));
  assert.equal(app.scene._artStats.builds, 1);
  const before = Buffer.from(app.fb.data);
  app.input.pressKey('Space');
  app.step(16);
  app.input.releaseKey('Space');
  app.step(16);
  app.render();
  assert.equal(app.scene._artStats.builds, 1, 'laying a stitch must not rebuild the room');
  assert.notDeepEqual(Buffer.from(app.fb.data), before, 'live board marks still render over the cache');
});

test('each dedicated play renderer caches its composed workroom', () => {
  const twoShelf = SHELVES.find((s) => s.id === 'two-thread');
  const countShelf = SHELVES.find((s) => s.id === 'counting-house');
  for (const scene of [
    makeTwoThreadScene(shelfCards(twoShelf)[0]),
    makeCountingHouseScene(shelfCards(countShelf)[0]),
  ]) {
    const app = renderScene(scene);
    app.render();
    assert.equal(app.scene._artStats.builds, 1);
  }
});

test('every built binary shelf pulls its own cabinet drawer without changing room idiom', () => {
  const fixtures = [
    ['loom', 'shuttle'],
    ['negative-cloth', 'keyhole'],
    ['mirror-weave', 'butterfly'],
    ['house-rules', 'thistle'],
    ['patchwork', 'patch'],
  ];
  const cabinetStates = new Set();
  for (const [shelfId, cardId] of fixtures) {
    const s = SHELVES.find((candidate) => candidate.id === shelfId);
    const c = shelfCards(s).find((candidate) => candidate.id === cardId);
    const app = renderScene(makePlayScene(c));
    assertApprovedRoomLanguage(app.fb, shelfId);
    const bytes = [];
    for (let y = 26; y < 333; y += 3) for (let x = 548; x < 624; x += 3) {
      bytes.push(...app.fb.getPixel(x, y));
    }
    cabinetStates.add(Buffer.from(bytes).toString('base64'));
  }
  assert.equal(cabinetStates.size, fixtures.length, 'each shelf should pull a distinct physical drawer');
});

test('base and dedicated woven reveals remain in the cached approved workroom', () => {
  const loomShelf = SHELVES.find((s) => s.id === 'loom');
  const loom = shelfCards(loomShelf).find((c) => c.id === 'shuttle');
  const base = renderScene(makePlayScene(loom));
  for (let y = 0; y < loom.puzzle.height; y++) for (let x = 0; x < loom.puzzle.width; x++) {
    if (loom.puzzle.at(x, y)) base.scene._board.toggleFill(x, y);
  }
  base.step(16); base.render();

  const twoShelf = SHELVES.find((s) => s.id === 'two-thread');
  const twoCard = shelfCards(twoShelf).find((c) => c.id === 'flagAB');
  const two = renderScene(makeTwoThreadScene(twoCard));
  for (let y = 0; y < twoCard.height; y++) for (let x = 0; x < twoCard.width; x++) {
    const value = twoCard.colored.grid[y * twoCard.width + x];
    if (value === CB_A || value === CB_B) two.scene._board.place(x, y, value);
  }
  two.step(16); two.render();

  const countShelf = SHELVES.find((s) => s.id === 'counting-house');
  const countCard = shelfCards(countShelf).find((c) => c.id === 'ch_hourglass');
  const counting = renderScene(makeCountingHouseScene(countCard));
  for (let y = 0; y < countCard.puzzle.height; y++) for (let x = 0; x < countCard.puzzle.width; x++) {
    if (countCard.puzzle.at(x, y)) counting.scene._board.toggleFill(x, y);
  }
  counting.step(16); counting.render();

  for (const [label, app] of [['base reveal', base], ['two-thread reveal', two], ['counting-house reveal', counting]]) {
    assertApprovedRoomLanguage(app.fb, label);
    assert.equal(app.scene._artStats.builds, 1, `${label}: solve should reuse its composed room`);
  }
});
