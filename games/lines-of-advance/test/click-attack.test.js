// B1 regression: clicking a legal enemy target with a friendly selected must
// commit the attack (not select the enemy). Drag and keyboard paths stay intact.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  resetToCommsDrill,
  selectPiece,
  findPiece,
  pieceAt,
  coordFromXY
} from '../src/state.js';
import { initTurnState } from '../src/turn.js';
import { makeInputHandlers } from '../src/input.js';

globalThis.requestAnimationFrame = (cb) => {
  cb();
  return 0;
};

// makeInputHandlers registers a document keydown listener.
if (typeof globalThis.document === 'undefined') {
  const docListeners = new Map();
  globalThis.document = {
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners.get(type) || [];
      docListeners.set(type, list.filter((f) => f !== fn));
    }
  };
}

function mockSvg() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((f) => f !== fn));
    },
    emit(type, evt) {
      for (const fn of listeners.get(type) || []) fn(evt);
    }
  };
}

function squareEvent(coord, clientX = 10, clientY = 10) {
  const target = {
    closest(sel) {
      return sel === '[data-coord]' ? this : null;
    },
    getAttribute(name) {
      return name === 'data-coord' ? coord : null;
    }
  };
  return { target, clientX, clientY };
}

function setupCommsDrill() {
  let state = initTurnState(resetToCommsDrill(createState()));
  const svg = mockSvg();
  const handlers = makeInputHandlers(
    { svg },
    () => state,
    (next) => { state = next; }
  );
  const northF17 = state.pieces.find((p) => p.side === 'North' && coordFromXY(p.x, p.y) === 'f17');
  const southF18 = state.pieces.find((p) => p.side === 'South' && coordFromXY(p.x, p.y) === 'f18');
  assert.ok(northF17, 'comms drill places North on f17');
  assert.ok(southF18, 'comms drill places South on f18');
  return { getState: () => state, setState: (s) => { state = s; }, svg, handlers, northF17, southF18 };
}

test('B1: click on legal enemy with friendly selected commits attack', () => {
  const { getState, setState, svg, northF17, southF18 } = setupCommsDrill();
  setState(selectPiece(getState(), northF17.id));

  svg.emit('pointerdown', squareEvent('f18'));
  svg.emit('pointerup', squareEvent('f18'));

  const after = getState();
  assert.equal(after.hasAttacked, true);
  assert.equal(pieceAt(after, southF18.x, southF18.y), null);
  assert.equal(after.selectedId, null);
  assert.notEqual(findPiece(after, northF17.id)?.side, 'South');
});

test('B1: click on enemy with nothing selected still selects the enemy', () => {
  const { getState, svg, southF18 } = setupCommsDrill();
  assert.equal(getState().selectedId, null);

  svg.emit('pointerdown', squareEvent('f18'));
  svg.emit('pointerup', squareEvent('f18'));

  assert.equal(getState().selectedId, southF18.id);
  assert.equal(getState().hasAttacked, false);
  assert.ok(pieceAt(getState(), southF18.x, southF18.y));
});

test('B1: drag from friendly onto enemy still attacks', () => {
  const { getState, setState, svg, northF17, southF18 } = setupCommsDrill();
  setState(selectPiece(getState(), northF17.id));

  svg.emit('pointerdown', squareEvent('f17', 0, 0));
  svg.emit('pointerup', squareEvent('f18', 40, 40));

  const after = getState();
  assert.equal(after.hasAttacked, true);
  assert.equal(pieceAt(after, southF18.x, southF18.y), null);
});
