import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init } from './main.js';

// Minimal DOM/window stub: enough for init() to build the UI, start the engine, wire
// input, size the stage, and boot. The rAF paint loop is stubbed to a no-op, so this
// exercises construction end-to-end without a real canvas. It proves "nothing
// happens" is impossible on boot (CLAUDE.md rule 9).

function makeElement(tag) {
  const el = {
    tag, className: '', textContent: '', innerHTML: '', href: '', download: '',
    width: 0, height: 0, style: {}, dataset: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    click() {},
    getContext() { return ctxStub(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  };
  return el;
}

function ctxStub() {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'canvas') return { width: 0, height: 0 };
      return () => {};
    },
    set() { return true; },
  });
}

function makeDoc() {
  const app = makeElement('div');
  const body = makeElement('body');
  return {
    readyState: 'complete',
    body,
    getElementById(id) { return id === 'app' ? app : null; },
    createElement(tag) { return makeElement(tag); },
    addEventListener() {},
  };
}

function makeWin(search = '') {
  const ls = {};
  Object.defineProperties(ls, {
    getItem: { value: (k) => (k in ls ? ls[k] : null) },
    setItem: { value: (k, v) => { Object.defineProperty(ls, k, { value: String(v), enumerable: true, configurable: true, writable: true }); } },
    removeItem: { value: (k) => { delete ls[k]; } },
  });
  return {
    innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
    localStorage: ls,
    location: { search },
    addEventListener() {},
    requestAnimationFrame() { return 0; }, // no-op: paint loop not driven in the test
    ImageData: class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } },
    Blob: class {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    alert() {},
  };
}

test('fresh boot opens the title / case-select front door without throwing', () => {
  const doc = makeDoc();
  const win = makeWin(); // no ?case -> the title screen
  let result;
  assert.doesNotThrow(() => { result = init(doc, win); });
  assert.ok(result.state.titleOpen, 'fresh boot should open the title / case-select');
  assert.ok(!result.engine.prologueRunner, 'the prologue must wait for a case to be chosen');
  assert.ok(!result.log.hasErrors(), 'boot produced a loud error: ' + result.log.export());
  assert.match(result.log.export(), /engine harness booted/);
});

test('choosing a case boots into its prologue end-to-end without throwing', () => {
  const doc = makeDoc();
  const win = makeWin('?case=1'); // a chosen case skips the title
  let result;
  assert.doesNotThrow(() => { result = init(doc, win); });
  assert.ok(!result.state.titleOpen, 'a chosen case skips the title');
  assert.ok(result.engine.prologueRunner, 'expected the prologue to be playing');
  assert.equal(result.engine.sceneId, null);
  assert.ok(!result.log.hasErrors(), 'boot produced a loud error: ' + result.log.export());
});

test('walking the prologue enters the investigation and auto-checkpoints', () => {
  const doc = makeDoc();
  const win = makeWin('?case=1');
  const { engine } = init(doc, win);
  // Advance through every prologue beat.
  while (engine.prologueRunner) engine.prologueAdvance();
  assert.equal(engine.sceneId, 'restaurant');
  assert.ok(win.localStorage['shoeleather:save:case-1:auto'], 'no auto checkpoint after the prologue (per-case namespaced slot)');
});

test('choosing Case 2 boots into the cruise-ship prologue', () => {
  const doc = makeDoc();
  const win = makeWin('?case=2');
  const { engine } = init(doc, win);
  assert.ok(engine.prologueRunner, 'Case 2 should play its prologue');
  while (engine.prologueRunner) engine.prologueAdvance();
  assert.equal(engine.sceneId, 'stateroom');
});

test('per-case saves are isolated: a Case 2 checkpoint does not leak into Case 1', () => {
  const win = makeWin('?case=2');               // shared localStorage across both boots
  const e2 = init(makeDoc(), win).engine;
  while (e2.prologueRunner) e2.prologueAdvance(); // Case 2 checkpoints under its own namespace
  assert.equal(e2.sceneId, 'stateroom');
  win.location.search = '?case=1';               // now boot Case 1 against the SAME storage
  const e1 = init(makeDoc(), win).engine;
  assert.ok(e1.prologueRunner, 'Case 1 must start fresh, not resume Case 2\'s stateroom checkpoint');
});
