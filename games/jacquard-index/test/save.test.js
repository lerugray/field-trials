import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import {
  SAVE_KEY, SAVE_VERSION, loadSave, writeSave,
} from '../src/engine/save.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { makeTwoThreadScene } from '../src/scenes/twoThreadScene.js';
import { makeCountingHouseScene } from '../src/scenes/countingHouseScene.js';
import { makeTitleScene } from '../src/scenes/titleScene.js';
import { SHELVES, shelfCards, allCatalogueCardsById } from '../src/content/shelves.js';
import { PENCIL_FILL, FILLED } from '../src/puzzle/board.js';
import { CB_B } from '../src/puzzle/coloredBoard.js';
import { boot } from '../src/boot/browser.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const knownIds = new Set(Object.keys(allCatalogueCardsById()));

test('save serialization round-trip preserves progress, pencil marks, undo, and redo', () => {
  const storage = memoryStorage();
  const card = shelfCards(SHELVES[0])[0];
  const app = new App(640, 360);
  const scene = makePlayScene(card);
  app.setScene(scene);
  app.configureSaving((progress, location) => writeSave(storage, progress, location, 12345));
  app.progress.add(card.id);

  scene._board.togglePencilFill(0, 0);
  scene._board.toggleFill(1, 0);
  scene._board.undo(); // leave one entry on each side of the history boundary

  app.step(16); // stable end-of-frame checkpoint writes the changed state
  const raw = storage.getItem(SAVE_KEY);
  assert.ok(raw);

  const loaded = loadSave(storage, knownIds);
  assert.equal(loaded.status, 'ok');
  assert.deepEqual(loaded.data.progress, [card.id]);
  const resumed = makePlayScene(card, { resume: loaded.data.location });
  assert.equal(resumed._board.pencilAt(0, 0), PENCIL_FILL);
  assert.equal(resumed._board._undo.length, 1);
  assert.equal(resumed._board._redo.length, 1);
  resumed._board.redo();
  assert.equal(resumed._board.primaryAt(1, 0), FILLED);
  assert.equal(resumed._board.pencilAt(0, 0), PENCIL_FILL);
});

test('specialized two-thread and counting-house looms round-trip their board state', () => {
  const storage = memoryStorage();
  const twoCard = shelfCards(SHELVES[1])[0];
  const two = makeTwoThreadScene(twoCard);
  two._board.place(0, 0, CB_B);
  writeSave(storage, new Set(), two.saveState(), 12345);
  const twoLocation = loadSave(storage, knownIds).data.location;
  const resumedTwo = makeTwoThreadScene(twoCard, { resume: twoLocation });
  assert.equal(resumedTwo._board.markAt(0, 0), CB_B);
  assert.equal(resumedTwo._board._undo.length, 1);

  const countingCard = shelfCards(SHELVES[2])[0];
  const counting = makeCountingHouseScene(countingCard);
  counting._board.togglePencilFill(0, 0);
  writeSave(storage, new Set(), counting.saveState(), 12346);
  const countingLocation = loadSave(storage, knownIds).data.location;
  const resumedCounting = makeCountingHouseScene(countingCard, { resume: countingLocation });
  assert.equal(resumedCounting._board.pencilAt(0, 0), PENCIL_FILL);
  assert.equal(resumedCounting._board.autoX, false);
  assert.equal(resumedCounting._board._undo.length, 1);
});

test('corrupt save is discarded with a visible fresh-start notice and can be replaced', () => {
  const storage = memoryStorage({ [SAVE_KEY]: '{not json' });
  const loaded = loadSave(storage, knownIds);
  assert.equal(loaded.status, 'corrupt');
  assert.match(loaded.notice, /COULD NOT BE READ/);
  assert.equal(storage.getItem(SAVE_KEY), null, 'bad record is removed for a clean start');

  const title = makeTitleScene({ notice: loaded.notice });
  const app = new App(640, 360).setScene(title);
  assert.equal(app.scene._saveNotice, loaded.notice, 'recovery notice is carried by the visible title scene');
  assert.doesNotThrow(() => app.render());

  writeSave(storage, new Set(), { scene: 'index', view: 'shelves', shelf: 0, card: 0 }, 12346);
  assert.equal(loadSave(storage, knownIds).status, 'ok', 'fresh work saves normally after recovery');
});

test('version mismatch is discarded through its distinct notice path', () => {
  const storage = memoryStorage({
    [SAVE_KEY]: JSON.stringify({
      version: SAVE_VERSION + 1, savedAt: 1, progress: [],
      location: { scene: 'index', view: 'shelves', shelf: 0, card: 0 },
    }),
  });
  const loaded = loadSave(storage, knownIds);
  assert.equal(loaded.status, 'version-mismatch');
  assert.match(loaded.notice, /VERSION IS INCOMPATIBLE/);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

function bootEnv(storage) {
  const raf = [];
  const listeners = {};
  const ctx = { fillRect() {}, drawImage() {}, putImageData() {}, imageSmoothingEnabled: false };
  function canvas() {
    return {
      id: 'jacquard', style: {}, getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener() {},
    };
  }
  const win = {
    localStorage: storage, innerWidth: 1280, innerHeight: 800,
    addEventListener(type, fn) { listeners[type] = fn; },
    requestAnimationFrame(fn) { raf.push(fn); },
    ImageData: class { constructor(data) { this.data = data; } },
    Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  };
  const visible = canvas();
  const doc = {
    getElementById: () => visible, createElement: (tag) => (tag === 'canvas' ? canvas() : { click() {} }),
    body: { appendChild() {} },
  };
  return { win, doc, listeners, tick(t) { const fn = raf.shift(); if (fn) fn(t); } };
}

test('browser boot offers explicit continue/new choice and Continue restores location', () => {
  const storage = memoryStorage();
  const completed = shelfCards(SHELVES[0])[0].id;
  writeSave(storage, new Set([completed]), { scene: 'index', view: 'cards', shelf: 0, card: 2 }, 12347);
  const env = bootEnv(storage);
  const app = boot(env.doc, env.win);
  assert.equal(app.scene._resumeAvailable, true);
  env.tick(16);
  env.listeners.keydown({ code: 'Enter', preventDefault() {} });
  env.tick(32);
  assert.ok(app.progress.has(completed));
  assert.match(app.log.toText(), /CONTINUE SAVED WORK/);
  assert.deepEqual(app.scene.saveState(), { scene: 'index', view: 'cards', shelf: 0, card: 2 });
});

test('Escape from the index preserves Continue/New when a valid save exists', () => {
  const storage = memoryStorage();
  writeSave(storage, new Set(), { scene: 'index', view: 'shelves', shelf: 0, card: 0 }, 12348);
  const env = bootEnv(storage);
  const app = boot(env.doc, env.win);

  env.tick(16);
  env.listeners.keydown({ code: 'Enter', preventDefault() {} });
  env.tick(32); // Continue into the saved index shelf list.
  env.listeners.keyup({ code: 'Enter' });
  env.listeners.keydown({ code: 'Escape', preventDefault() {} });
  env.tick(48);
  env.listeners.keyup({ code: 'Escape' });

  assert.equal(app.scene._resumeAvailable, true, 'returning title offers CONTINUE SAVED WORK and NEW INDEX');
  env.listeners.keydown({ code: 'KeyC', preventDefault() {} });
  env.tick(64);
  assert.deepEqual(app.scene.saveState(), { scene: 'index', view: 'shelves', shelf: 0, card: 0 });
});

test('browser boot displays corrupt-save recovery instead of crashing or silently wiping', () => {
  const storage = memoryStorage({ [SAVE_KEY]: 'definitely not json' });
  const env = bootEnv(storage);
  const app = boot(env.doc, env.win);
  assert.match(app.scene._saveNotice, /COULD NOT BE READ/);
  assert.equal(app.scene._resumeAvailable, false);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.doesNotThrow(() => { env.tick(16); app.render(); });
  assert.match(app.log.toText(), /FRESH INDEX STARTED/);
});
