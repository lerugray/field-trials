// THE JACQUARD INDEX — browser boot shim (the only DOM-touching module).
//
// Owns the requestAnimationFrame clock, the canvas, input wiring, error capture, and
// blitting the native framebuffer to screen with nearest-neighbor screen-fill scaling
// (hard-rule 3a: fractional-but-nearest where screen-fill wins — fillViewport). Everything above this line is pure and node-tested; this file is kept
// thin on purpose. Guarded so it is inert when imported without a DOM (bundle tests).

import { App } from '../engine/app.js';
import { fillViewport, screenToNative } from '../engine/viewport.js';
import { makeTitleScene } from '../scenes/titleScene.js';
import { makeIndexScene, makeIndexSceneAt } from '../scenes/indexScene.js';
import { makePlayScene } from '../scenes/playScene.js';
import { makeTwoThreadScene } from '../scenes/twoThreadScene.js';
import { makeCountingHouseScene } from '../scenes/countingHouseScene.js';
import { allCatalogueCardsById, SHELVES, shelfCards } from '../content/shelves.js';
import { loadSave, writeSave, clearSave } from '../engine/save.js';
import { PALETTE } from '../gfx/palette.js';

export const BASE_W = 640;
export const BASE_H = 360;

export function boot(doc, win) {
  const app = new App(BASE_W, BASE_H);
  let storage = null;
  try {
    if (win.localStorage && typeof win.localStorage.getItem === 'function') storage = win.localStorage;
  } catch (_) { /* some privacy modes expose localStorage through a throwing getter */ }
  const cardsById = allCatalogueCardsById();
  const knownCardIds = new Set(Object.keys(cardsById));
  let loaded = storage ? loadSave(storage, knownCardIds) : { status: 'empty', data: null, notice: null };
  let resumeScene = null;
  const indexOptions = { onExitToTitle: (a) => showSavedTitle(a) };

  function indexReturnFor(cardId) {
    const shelfIndex = SHELVES.findIndex((shelf) => shelf.memberIds.includes(cardId));
    const cards = shelfIndex >= 0 ? shelfCards(SHELVES[shelfIndex]) : [];
    const cardIndex = cards.findIndex((card) => card.id === cardId);
    return { shelf: Math.max(0, shelfIndex), card: Math.max(0, cardIndex) };
  }

  function sceneFromLocation(location) {
    if (location.scene === 'index') return makeIndexSceneAt(location.view, location.shelf, location.card, indexOptions);
    const card = cardsById[location.cardId];
    if (!card) throw new Error('saved pattern card is no longer in the index');
    const expectedScene = card.twist === 'two-thread' ? 'two-thread'
      : (card.twist === 'counting-house' ? 'counting-house' : 'play');
    if (location.scene !== expectedScene) throw new Error('saved pattern uses the wrong loom');
    const ret = indexReturnFor(card.id);
    const back = (a) => a.setScene(makeIndexSceneAt('cards', ret.shelf, ret.card, indexOptions));
    if (location.scene === 'two-thread') return makeTwoThreadScene(card, { onExit: back, resume: location });
    if (location.scene === 'counting-house') return makeCountingHouseScene(card, { onExit: back, resume: location });
    return makePlayScene(card, { onExit: back, resume: location });
  }

  if (loaded.status === 'ok') {
    try {
      resumeScene = sceneFromLocation(loaded.data.location);
      if (resumeScene._board) {
        if (resumeScene._board.isSolved() !== loaded.data.location.solved) {
          throw new Error('saved completion state conflicts with its marks');
        }
        if (loaded.data.location.solvedLogged
          && !loaded.data.progress.includes(loaded.data.location.cardId)) {
          throw new Error('saved completion is missing from the master index');
        }
      }
    } catch (_) {
      try { clearSave(storage); } catch (_) { /* the visible recovery notice still wins */ }
      loaded = { status: 'corrupt', data: null, notice: 'SAVE COULD NOT BE READ - FRESH INDEX STARTED' };
    }
  }

  if (storage) {
    app.configureSaving((progress, location) => writeSave(storage, progress, location), {
      suspended: loaded.status === 'ok',
    });
  }

  // Loud-failure law: browser-level errors also land in the exportable log.
  win.addEventListener('error', (e) => {
    app.log.error(`window: ${e.message} @ ${e.filename || '?'}:${e.lineno || 0}`, Math.round(app.elapsed));
  });
  win.addEventListener('unhandledrejection', (e) => {
    app.log.error(`promise: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, Math.round(app.elapsed));
  });

  let canvas = doc.getElementById('jacquard');
  if (!canvas) {
    canvas = doc.createElement('canvas');
    canvas.id = 'jacquard';
    doc.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d', { alpha: false });

  // Offscreen native-res surface: the framebuffer is putImageData'd here at 1:1, then
  // drawImage'd to the visible canvas scaled with smoothing OFF (crisp pixels).
  const native = doc.createElement('canvas');
  native.width = BASE_W;
  native.height = BASE_H;
  const nctx = native.getContext('2d');

  let vp = fillViewport(1, 1, BASE_W, BASE_H);

  function resize() {
    canvas.width = win.innerWidth;
    canvas.height = win.innerHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    vp = fillViewport(canvas.width, canvas.height, BASE_W, BASE_H);
  }
  win.addEventListener('resize', resize);
  resize();

  // ---- Input wiring (mapped to native coords) ----
  function pointerAt(e) {
    const rect = canvas.getBoundingClientRect();
    const p = screenToNative(vp, e.clientX - rect.left, e.clientY - rect.top);
    app.input.movePointer(p.x, p.y, p.inside && p.x < BASE_W && p.y < BASE_H);
  }
  canvas.addEventListener('mousemove', pointerAt);
  canvas.addEventListener('mousedown', (e) => { pointerAt(e); app.input.pressButton(e.button); });
  win.addEventListener('mouseup', (e) => app.input.releaseButton(e.button));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  win.addEventListener('blur', () => app.input.releaseAll());

  win.addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); exportLog(); return; }
    app.input.pressKey(e.code);
  });
  win.addEventListener('keyup', (e) => app.input.releaseKey(e.code));

  function exportLog() {
    try {
      const blob = new win.Blob([app.log.toText() || '(log empty)'], { type: 'text/plain' });
      const url = win.URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = 'jacquard-debug-log.txt';
      a.click();
      win.URL.revokeObjectURL(url);
      app.log.info('debug log exported', Math.round(app.elapsed));
    } catch (err) {
      app.log.error(`log export failed: ${err.message}`, Math.round(app.elapsed));
    }
  }

  function startFresh(a) {
    if (storage) {
      try { clearSave(storage); } catch (err) { a.log.error(`save clear: ${err.message}`, Math.round(a.elapsed)); }
    }
    a.progress = new Set();
    a.suspendSaving(false);
    a.setScene(makeIndexScene(indexOptions));
    a.checkpointSave(true);
  }

  function continueSaved(a, saved = loaded, scene = resumeScene) {
    a.progress = new Set(saved.data.progress);
    a.suspendSaving(false);
    a.setScene(scene);
    a.checkpointSave(true);
  }

  function showSavedTitle(a) {
    let saved = storage ? loadSave(storage, knownCardIds)
      : { status: 'empty', data: null, notice: null };
    let scene = null;
    if (saved.status === 'ok') {
      try {
        scene = sceneFromLocation(saved.data.location);
        if (scene._board && scene._board.isSolved() !== saved.data.location.solved) {
          throw new Error('saved completion state conflicts with its marks');
        }
        if (saved.data.location.solvedLogged
          && !saved.data.progress.includes(saved.data.location.cardId)) {
          throw new Error('saved completion is missing from the master index');
        }
      } catch (_) {
        try { clearSave(storage); } catch (_) { /* the visible recovery notice still wins */ }
        saved = { status: 'corrupt', data: null, notice: 'SAVE COULD NOT BE READ - FRESH INDEX STARTED' };
        scene = null;
      }
    }
    a.suspendSaving(true);
    a.setScene(makeTitleScene({
      resumeAvailable: saved.status === 'ok',
      notice: saved.notice,
      onContinue: (nextApp) => continueSaved(nextApp, saved, scene),
      onNew: startFresh,
    }));
  }

  if (loaded.notice) app.log.info(`save: ${loaded.notice}`, Math.round(app.elapsed));
  app.setScene(makeTitleScene({
    resumeAvailable: loaded.status === 'ok',
    notice: loaded.notice,
    onContinue: continueSaved,
    onNew: startFresh,
  }));

  // ---- Frame loop ----
  const [or, og, ob] = PALETTE.oilDeep;
  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    try {
      app.step(dt);
      app.render();
      nctx.putImageData(new win.ImageData(app.fb.data, BASE_W, BASE_H), 0, 0);
      ctx.imageSmoothingEnabled = false;
      // Letterbox in deep oil, then blit the frame nearest-scaled.
      ctx.fillStyle = `rgb(${or},${og},${ob})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(native, vp.offX, vp.offY, vp.dispW, vp.dispH);
    } catch (err) {
      // Last-ditch loud failure: even if the loop itself throws, log it and keep going.
      app.log.error(`frame loop: ${err.message}`, Math.round(app.elapsed));
    }
    win.requestAnimationFrame(frame);
  }
  win.requestAnimationFrame(frame);

  return app;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(document, window));
  } else {
    boot(document, window);
  }
}
