// SHOELEATHER — browser entry (the visible layer).
//
// Wires the headless Engine to a real screen: the world raster on an integer-upscaled
// canvas, the CRISP text layer on an overlay canvas above it (text-layer law), mouse
// + full keyboard input (input law), the document reader with zoom, a HUD that makes
// every mechanic VISIBLE (action-legibility law: cursor verb, sweep coverage,
// checkpoint flash), and a LOUD error banner wired to the debug log (rule 9).
//
// All DOM access is inside init(); the pure helpers below are exported so `node
// --test` can exercise the coordinate + fit math without a browser.

import { Engine, MODES } from './engine/engine.js';
import { SaveManager } from './engine/save.js';
import { Settings } from './engine/settings.js';
import { DebugLog } from './engine/debug-log.js';
import { DEFAULT_KEYMAP } from './engine/focus.js';
import { Framebuffer } from './render/framebuffer.js';
import { paintRoom } from './render/scene-paint.js';
import { paintSceneArt } from './render/scene-art.js';
import { paintPortrait } from './render/portrait.js';
import { reveal as revealText, isComplete as revealDone } from './render/typewriter.js';
import { HELP, CONTROL_HINT } from './help.js';
import { HouseBandPlayer, HouseBandController } from './audio/player.js';
import { sessionSeed } from './audio/house-band.js';
import { PrologueRunner } from './case/prologue.js';
import { buildEndingScene } from './case/ending.js';
import { PALETTE } from './render/palette.js';
import { buildM1World } from './world/m1-world.js';
import { buildCase2World } from './world/case-2-world.js';
import { LOGICAL_W, LOGICAL_H, UPSCALE_STEPS, GAME_TITLE, GAME_SUBTITLE, CASES } from './config.js';

// --- pure helpers (node-testable) -----------------------------------------

// Largest integer upscale that still fits the viewport, floored at the smallest step.
export function fitFactor(winW, winH, logicalW, logicalH, steps = UPSCALE_STEPS) {
  let best = steps[0];
  for (const s of steps) {
    if (logicalW * s <= winW && logicalH * s <= winH) best = s;
  }
  return best;
}

// Map a device-space point (relative to the canvas rect) to logical world coords.
export function deviceToLogical(px, py, factor) {
  return { x: Math.floor(px / factor), y: Math.floor(py / factor) };
}

export function setEndingMode(ui, engine, active) {
  ui.bar.style.display = active ? 'none' : 'flex';
  ui.stage.style.pointerEvents = active ? 'none' : '';
  if (active) {
    ui.toast.textContent = '';
    ui.toast.style.display = 'none';
    if (engine.focus) engine.focus.clear();
  }
}

export function paintPortraitCanvas(canvas, win, options) {
  const portrait = new Framebuffer(80, 100);
  paintPortrait(portrait, options);
  const up = portrait.upscale(2);
  canvas.width = up.width; canvas.height = up.height;
  canvas.getContext('2d').putImageData(new win.ImageData(new Uint8ClampedArray(up.data), up.width, up.height), 0, 0);
}

export function boardSlotWidth(maxLabelLength) {
  return Math.max(220, Math.min(940, maxLabelLength * 9 + 48));
}

// Confrontation portraits are a visible state machine. The accused alone hardens
// through the chain; a witness stays open unless the current beat calls on them.
export function endingPortraitState({ isAccused, isSpeaker, beatIndex }) {
  if (!isAccused) return isSpeaker ? 'guarded' : 'open';
  if (beatIndex >= 7) return 'hostile';
  if (beatIndex >= 5) return 'defensive';
  if (beatIndex >= 3) return 'guarded';
  return 'open';
}

// CSS cursor for a hotspot verb (also carries a text label in the HUD; never hue-only).
export function cursorCss(kind) {
  switch (kind) {
    case 'exit': return 'e-resize';
    case 'take': return 'grab';
    case 'talk': return 'help';
    case 'use': return 'pointer';
    case 'look': return 'crosshair';
    default: return 'default';
  }
}

export function verbLabel(kind) {
  return { look: 'LOOK', take: 'TAKE', talk: 'TALK', use: 'READ', exit: 'GO' }[kind] || '';
}

// A LocalStorage-shaped adapter matching the SaveManager store interface.
export function localStorageStore(ls) {
  return {
    get: (k) => (ls.getItem(k) ?? null),
    set: (k, v) => ls.setItem(k, v),
    remove: (k) => ls.removeItem(k),
    keys: () => Object.keys(ls).filter(Boolean),
  };
}

// --- browser init ----------------------------------------------------------

export function init(doc = document, win = window) {
  const log = new DebugLog();
  installLoudFailures(log, win);

  // Case selection: ?case=2 boots the cruise-ship case; default is Case 1.
  const params = (win.location && win.location.search) || '';
  const world = /[?&]case=2\b/.test(params) ? buildCase2World() : buildM1World();
  // Saves are namespaced PER CASE so switching cases at the title never resumes another
  // case's checkpoint into the wrong graph (each case owns its own auto/named slots).
  const store = win.localStorage ? localStorageStore(win.localStorage) : memoryFallback();
  const save = new SaveManager(store, { prefix: `shoeleather:save:${world.caseData.id}:` });
  const engine = new Engine({ graph: world.graph, log, save, startScene: world.startScene, caseData: world.caseData });

  const ui = buildDom(doc);
  const fb = new Framebuffer(LOGICAL_W, LOGICAL_H);
  const state = {
    factor: 2,
    hoverKind: 'default',
    openDoc: null,          // DocumentReader when the reader overlay is open
    notebookOpen: false,
    interrogationOpen: false,
    boardOpen: false,
    prologueOpen: false,
    optionsOpen: false,
    helpOpen: false,
    reducedMotion: false,
    reveal: null,           // active typewriter reveal for the prologue prose
    checkpointFlash: 0,     // frames remaining on the "saved" flash
    backdropArt: null,      // forced scene-art id behind the prologue/ending prose
    titleOpen: false,       // the title / case-select front door
    endingOpen: false,
    sceneDirty: true,
  };
  try { doc.title = GAME_TITLE; } catch (_) { /* headless may lack a title element */ }

  // --- error surface (loud-failure law) -----------------------------------
  const showError = (msg) => {
    ui.banner.textContent = 'ERROR: ' + msg;
    ui.banner.style.display = 'block';
  };
  log.addSink((e) => { if (e.level === 'error') showError(e.message); });
  engine.on('error', (e) => showError(e.message));

  // --- engine → view wiring -----------------------------------------------
  engine.on('enter', () => { state.sceneDirty = true; state.openDoc = null; });
  engine.on('checkpoint', () => { state.checkpointFlash = state.reducedMotion ? 1 : 90; });
  engine.on('restart', () => { ui.banner.style.display = 'none'; });

  // --- world raster paint --------------------------------------------------
  function repaintWorld() {
    // A forced backdrop (prologue/ending) overrides the world scene: the ratified
    // murder-scene picture sits behind the full-screen prose (M4 full art pass).
    if (state.backdropArt && paintSceneArt(fb, state.backdropArt)) { state.sceneDirty = false; return; }
    const scene = engine.scene;
    const bg = scene && scene.background;
    if (bg && bg.paint === 'art' && paintSceneArt(fb, bg.art)) {
      // M4 full-pass composed scene (VACUUM SEALED bar).
    } else if (bg && bg.paint === 'room') {
      paintRoom(fb, { tint: bg.tint || PALETTE.smog, lamp: bg.lamp || null });
    } else {
      fb.clear(PALETTE.umber);
    }
    state.sceneDirty = false;
  }

  // --- overlay (crisp text + HUD + focus) ---------------------------------
  function drawOverlay(ctx) {
    const f = state.factor;
    ctx.clearRect(0, 0, LOGICAL_W * f, LOGICAL_H * f);
    ctx.imageSmoothingEnabled = false;
    ctx.font = '14px "Courier New", monospace';
    ctx.textBaseline = 'top';

    // Focused hotspot outline + verb label (visible representation of focus).
    const h = engine.focus && engine.focus.focused();
    if (h && !state.openDoc && !state.titleOpen && !state.endingOpen) {
      const b = h.bounds;
      ctx.strokeStyle = 'rgba(232,220,192,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(b.x * f + 1, b.y * f + 1, b.w * f - 2, b.h * f - 2);
      ctx.setLineDash([]);
      const label = `${verbLabel(h.kind)}: ${h.label}`;
      drawPill(ctx, label, b.x * f, Math.max(0, b.y * f - 20));
    }

    if (!state.titleOpen && !state.endingOpen) {
      // HUD bar: scene name, sweep coverage, mode.
      const scene = engine.scene;
      const cov = scene ? engine.sweep.coverage(scene) : { found: 0, total: 0, swept: false };
      const sweepMsg = cov.swept ? 'scene swept' : `swept ${cov.found}/${cov.total}`;
      const hud = `${scene ? scene.name : ''}    ${sweepMsg}`;
      drawPill(ctx, hud, 8, 8);

      // Checkpoint flash (the save landing, made visible).
      if (state.checkpointFlash > 0) {
        ctx.globalAlpha = Math.min(1, state.checkpointFlash / 90);
        drawPill(ctx, 'checkpoint saved', LOGICAL_W * f - 160, 8);
        ctx.globalAlpha = 1;
        state.checkpointFlash--;
      }

      // Controls hint (keyboard path is discoverable).
      drawPill(ctx, CONTROL_HINT, 8, LOGICAL_H * f - 24);
    }

    if (state.openDoc) drawDocument(ctx, state.openDoc);
  }

  function drawPill(ctx, text, x, y) {
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(18,14,10,0.82)';
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillText(text, x + 6, y + 3);
  }

  function drawDocument(ctx, docReader) {
    const W = LOGICAL_W * state.factor, H = LOGICAL_H * state.factor;
    ctx.fillStyle = 'rgba(8,6,4,0.72)';
    ctx.fillRect(0, 0, W, H);
    const pad = 40;
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);
    const size = docReader.zoom.size();
    ctx.fillStyle = '#241c14';
    ctx.font = `${size}px "Courier New", monospace`;
    const charW = ctx.measureText('M').width || size * 0.6;
    const cols = Math.max(8, Math.floor((W - pad * 2 - 32) / charW));
    const lines = docReader.layout(cols);
    let y = pad + 16;
    for (const line of lines) {
      ctx.fillText(line, pad + 16, y);
      y += size + 4;
    }
    ctx.font = '14px "Courier New", monospace';
    drawPill(ctx, '+/- zoom   esc close', pad + 8, H - pad - 22);
  }

  // --- render loop (rAF for PAINT only; all logic is event-driven) --------
  function frame() {
    if (state.sceneDirty) repaintWorld();
    const wctx = ui.worldCanvas.getContext('2d');
    const img = new win.ImageData(new Uint8ClampedArray(fb.data), fb.width, fb.height);
    wctx.putImageData(img, 0, 0);
    const octx = ui.overlay.getContext('2d');
    drawOverlay(octx);
    // Typewriter reveal for the prologue prose (M7 text speed; presentation only).
    if (state.reveal) {
      const { text, startMs, cps } = state.reveal;
      const elapsed = nowMs() - startMs;
      ui.pProse.textContent = revealText(text, cps, elapsed, false);
      if (revealDone(text, cps, elapsed, false)) state.reveal = null;
    }
    win.requestAnimationFrame(frame);
  }
  const nowMs = () => (win.performance && win.performance.now ? win.performance.now() : 0);

  // --- input (mouse) -------------------------------------------------------
  ui.overlay.addEventListener('mousemove', (ev) => {
    if (state.openDoc || state.notebookOpen || state.interrogationOpen || state.boardOpen || state.optionsOpen || state.helpOpen || state.titleOpen || state.endingOpen) return;
    const r = ui.overlay.getBoundingClientRect();
    const p = deviceToLogical(ev.clientX - r.left, ev.clientY - r.top, state.factor);
    engine.focusAt(p.x, p.y);
    const kind = engine.cursorKind();
    ui.overlay.style.cursor = cursorCss(kind);
  });
  ui.overlay.addEventListener('click', () => {
    if (!state.openDoc && !state.notebookOpen && !state.interrogationOpen && !state.boardOpen && !state.optionsOpen && !state.helpOpen && !state.titleOpen && !state.endingOpen) act();
  });

  // --- notebook (DOM crisp-text panel) + evidence toasts ------------------
  const notebook = makeNotebookPanel(doc, ui, engine, world, win);
  const toast = (msg) => {
    if (!state.endingOpen) showToast(doc, ui, msg);
  };
  engine.on('fact-logged', (p) => { toast('Noted: ' + (p.fact.prose || p.fact.id)); if (state.notebookOpen) notebook.render(); });
  engine.on('statement-logged', (p) => { toast('Statement logged: ' + p.statement.speaker); if (state.notebookOpen) notebook.render(); });
  engine.on('enter', () => { if (state.notebookOpen) notebook.render(); });
  function toggleNotebook(force) {
    state.notebookOpen = force === undefined ? !state.notebookOpen : force;
    ui.notebook.style.display = state.notebookOpen ? 'flex' : 'none';
    if (state.notebookOpen) notebook.render();
  }

  // --- interrogation panel -------------------------------------------------
  const interro = makeInterrogationPanel(doc, ui, engine, win);
  engine.on('interrogation-begin', () => { state.interrogationOpen = true; interro.resetLog(); ui.interro.style.display = 'flex'; interro.render(); });
  engine.on('interrogation-end', () => { state.interrogationOpen = false; ui.interro.style.display = 'none'; });
  engine.on('dialogue', () => { if (state.interrogationOpen) interro.render(); });
  engine.on('challenge', () => { if (state.interrogationOpen) interro.render(); });
  engine.on('afterthought', () => toast('You are halfway out the door before the question comes back to you. They are at ease now.'));
  ui.challengeBtn.addEventListener('click', () => interro.toggleChallenge());
  ui.leaveBtn.addEventListener('click', () => engine.endInterrogation());

  // --- accusation board + ending ------------------------------------------
  const boardPanel = makeBoardPanel(doc, ui, engine);
  engine.on('board-open', () => { state.boardOpen = true; ui.bDeflect.textContent = ''; ui.board.style.display = 'flex'; boardPanel.render(); });
  engine.on('board-close', () => { state.boardOpen = false; ui.board.style.display = 'none'; });
  engine.on('case-solved', (e) => {
    state.boardOpen = false; ui.board.style.display = 'none';
    state.notebookOpen = false;
    state.interrogationOpen = false;
    state.openDoc = null;
    state.endingOpen = true;
    ui.notebook.style.display = 'none';
    ui.interro.style.display = 'none';
    ui.board.style.display = 'none';
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    setEndingMode(ui, engine, true);
    // the reveal returns to the murder scene behind the prose.
    state.backdropArt = world.backdropArt || null; state.sceneDirty = true;
    showEnding(doc, ui, engine, win, e.chain, e.variant, () => {
      state.endingOpen = false;
      ui.ending.style.display = 'none'; setEndingMode(ui, engine, false);
      state.backdropArt = null; state.sceneDirty = true; engine.restart();
    });
  });
  ui.accuseBtn.addEventListener('click', () => { if (engine.mode !== MODES.ATOMIC) engine.openBoard(); });
  const doSubmit = (trap) => {
    const res = engine.boardSubmit(trap);
    if (res.type === 'deflected') ui.bDeflect.textContent = res.line + (res.counterMove && res.counterMove.describe ? '  (' + res.counterMove.describe + ')' : '');
    else if (res.type === 'incomplete' || res.type === 'invalid') ui.bDeflect.textContent = res.reason || 'The board is not finished. Every slot must be filled from your pinned notes.';
  };
  ui.submitBtn.addEventListener('click', () => doSubmit(false));
  ui.trapBtn.addEventListener('click', () => doSubmit(true));
  ui.boardCloseBtn.addEventListener('click', () => engine.closeBoard());

  // --- prologue (play as the murderer) ------------------------------------
  function renderBeat(beat) {
    if (!beat) return;
    const card = engine.caseData.prologue && engine.caseData.prologue.card;
    ui.prologue.className = beat.killBeat ? 'sl-prologue sl-prologue-kill' : 'sl-prologue';
    ui.prologue.dataset.beat = beat.killBeat ? 'murder' : beat.id;
    ui.pKicker.textContent = beat.killBeat ? 'THE MURDER' : (card?.line || 'BEFORE');
    ui.pAction.textContent = beat.action;
    ui.pNote.textContent = beat.prologueKey ? 'You will remember this.'
      : beat.stakesFree ? 'A rehearsal. It costs nothing.' : '';
    // Typewriter reveal (M7 text speed), instant under reduced motion or cps<=0.
    const cps = settings.get('textSpeedCps');
    if (state.reducedMotion || cps <= 0) { ui.pProse.textContent = beat.prose; state.reveal = null; }
    else { ui.pProse.textContent = ''; state.reveal = { text: beat.prose, startMs: nowMs(), cps }; }
  }
  // Advancing also skips an in-progress reveal to full first (single-press skip).
  function prologueAction() {
    if (state.reveal) { ui.pProse.textContent = state.reveal.text; state.reveal = null; return; }
    engine.prologueAdvance();
  }
  engine.on('prologue-begin', (e) => {
    state.prologueOpen = true; ui.prologue.style.display = 'flex';
    const card = engine.caseData.prologue.card;
    ui.pAct.textContent = card?.act || '';
    ui.pTime.textContent = card?.timestamp || '';
    ui.pCard.style.display = card ? 'flex' : 'none';
    state.backdropArt = world.backdropArt || null; state.sceneDirty = true; // the murder scene, behind the prose
    renderBeat(e.beat);
  });
  engine.on('prologue', (e) => { if (e.type === 'beat') renderBeat(e.beat); });
  engine.on('prologue-end', () => {
    state.prologueOpen = false; ui.prologue.style.display = 'none'; state.reveal = null;
    state.backdropArt = null; state.sceneDirty = true;
  });
  ui.pAction.addEventListener('click', () => prologueAction());

  // --- input (keyboard path) ----------------------------------------------
  win.addEventListener('keydown', (ev) => {
    if (state.endingOpen) return;
    if (state.titleOpen) return; // the title's case buttons take keyboard focus natively
    if (state.helpOpen) { if (ev.key === 'Escape' || ev.key === '?') { toggleHelp(false); ev.preventDefault(); } return; }
    if (state.optionsOpen) { if (ev.key === 'Escape') { toggleOptions(false); ev.preventDefault(); } return; }
    if (ev.key === '?') { toggleHelp(true); ev.preventDefault(); return; }
    if (state.prologueOpen) { if (ev.key === 'Enter' || ev.key === ' ') { prologueAction(); ev.preventDefault(); } return; }
    if (state.interrogationOpen) { interro.handleKey(ev); ev.preventDefault(); return; }
    if (state.boardOpen) { if (ev.key === 'Escape') { engine.closeBoard(); ev.preventDefault(); } return; }
    if (state.notebookOpen) {
      if (ev.key === 'Escape') { toggleNotebook(false); ev.preventDefault(); }
      return; // let the search input take the rest (so 'n' types normally)
    }
    if (state.openDoc) {
      if (ev.key === '+' || ev.key === '=') { state.openDoc.zoom.zoomIn(); ev.preventDefault(); return; }
      if (ev.key === '-' || ev.key === '_') { state.openDoc.zoom.zoomOut(); ev.preventDefault(); return; }
      if (ev.key === 'Escape') { state.openDoc = null; ev.preventDefault(); return; }
      return;
    }
    const action = DEFAULT_KEYMAP[ev.key];
    if (!action) return;
    ev.preventDefault();
    if (action === 'focus-next') engine.focusNext();
    else if (action === 'focus-prev') engine.focusPrev();
    else if (action === 'select') act();
    else if (action === 'notebook') toggleNotebook();
    else if (action === 'back') { /* M1: back to a menu; no-op for now */ }
  });

  // Resolve the focused hotspot: exits transition, evidence logs, documents open.
  function act() {
    const focused = engine.focus && engine.focus.focused();
    if (!focused) return;
    const res = engine.select(); // handles exits + logs any bound fact/statement
    if (res.type === 'exit' || res.type === 'interrogation' || res.type === 'board') return;
    if (focused.meta && focused.meta.document) {
      const docReader = world.documents[focused.meta.document];
      if (docReader) { docReader.zoom.reset(); state.openDoc = docReader; }
      else log.error('main.act', `missing document ${focused.meta.document}`);
      return;
    }
    // Every interaction must produce VISIBLE feedback (loud-failure law, rule 9):
    // a flavour hotspot that reveals no fact still acknowledges the look, so
    // "nothing happens" is impossible.
    if (res.type === 'interact' && !res.acquired) toast(focused.label);
  }

  // --- menu buttons (named access points) ---------------------------------
  ui.notebookBtn.addEventListener('click', () => toggleNotebook());
  ui.nbClose.addEventListener('click', () => toggleNotebook(false));
  ui.saveBtn.addEventListener('click', () => engine.saveTo('manual'));
  ui.loadBtn.addEventListener('click', () => engine.loadFrom('manual') || engine.loadFrom('auto'));
  ui.restartBtn.addEventListener('click', () => engine.restart());
  ui.logBtn.addEventListener('click', () => exportLog(doc, win, log));

  // --- settings / accessibility (M7) --------------------------------------
  const settings = new Settings(store).load();
  function applySettings() {
    const css = settings.toCss();
    try {
      ui.root.style.fontFamily = css.fontFamily;
      ui.root.style.fontSize = (15 * settings.get('textScale')) + 'px';
    } catch (_) { /* headless stub has a bare style object */ }
    state.reducedMotion = settings.get('reducedMotion');
  }
  applySettings();

  function optRow(label, controlEl) {
    const row = el(doc, 'div', 'sl-o-row');
    const l = el(doc, 'span', 'sl-o-label'); l.textContent = label;
    row.append(l, controlEl); return row;
  }
  function toggleControl(getVal, onToggle) {
    const b = button(doc, getVal() ? 'On' : 'Off');
    b.addEventListener('click', () => { onToggle(); b.textContent = getVal() ? 'On' : 'Off'; });
    return b;
  }
  function renderOptions() {
    ui.oBody.innerHTML = '';
    // text size
    const sizeWrap = el(doc, 'div', 'sl-o-ctrl');
    const minus = button(doc, 'A-'); const plus = button(doc, 'A+');
    const readout = el(doc, 'span', 'sl-o-read'); readout.textContent = settings.toCss().fontScalePct + '%';
    const bump = (d) => { settings.set('textScale', settings.get('textScale') + d); settings.save(); applySettings(); readout.textContent = settings.toCss().fontScalePct + '%'; };
    minus.addEventListener('click', () => bump(-0.1)); plus.addEventListener('click', () => bump(0.1));
    sizeWrap.append(minus, readout, plus);
    ui.oBody.append(optRow('Text size', sizeWrap));
    // dyslexia font
    ui.oBody.append(optRow('Dyslexia-friendly font', toggleControl(
      () => settings.get('dyslexiaFont'), () => { settings.set('dyslexiaFont', !settings.get('dyslexiaFont')); settings.save(); applySettings(); })));
    // reduced motion
    ui.oBody.append(optRow('Reduced motion', toggleControl(
      () => settings.get('reducedMotion'), () => { settings.set('reducedMotion', !settings.get('reducedMotion')); settings.save(); applySettings(); })));
    // photosensitivity-safe
    ui.oBody.append(optRow('Photosensitivity-safe (no flashing)', toggleControl(
      () => settings.get('photosensitivitySafe'), () => { settings.set('photosensitivitySafe', !settings.get('photosensitivitySafe')); settings.save(); })));
    const note = el(doc, 'div', 'sl-o-note');
    note.textContent = 'No timers anywhere: reading, interrogations, and the board are untimed, forever.';
    ui.oBody.append(note);
  }
  function toggleOptions(force) {
    state.optionsOpen = force === undefined ? !state.optionsOpen : force;
    ui.options.style.display = state.optionsOpen ? 'flex' : 'none';
    if (state.optionsOpen) renderOptions();
  }
  ui.optionsBtn.addEventListener('click', () => toggleOptions());
  ui.oClose.addEventListener('click', () => toggleOptions(false));

  // Help overlay (controls + the loop).
  function renderHelp() {
    ui.hBody.innerHTML = '';
    for (const section of HELP) {
      const h = el(doc, 'div', 'sl-help-sec');
      const t = el(doc, 'div', 'sl-help-t'); t.textContent = section.title;
      h.append(t);
      for (const line of section.lines) { const l = el(doc, 'div', 'sl-help-l'); l.textContent = line; h.append(l); }
      ui.hBody.append(h);
    }
  }
  function toggleHelp(force) {
    state.helpOpen = force === undefined ? !state.helpOpen : force;
    ui.help.style.display = state.helpOpen ? 'flex' : 'none';
    if (state.helpOpen) renderHelp();
  }
  ui.helpBtn.addEventListener('click', () => toggleHelp());
  ui.hClose.addEventListener('click', () => toggleHelp(false));

  // --- House Band (WebAudio) -----------------------------------------------
  // Created on the first click (autoplay policy requires a user gesture).
  let band = null;
  ui.musicBtn.addEventListener('click', () => {
    try {
      if (!band) {
        const AC = win.AudioContext || win.webkitAudioContext;
        if (!AC) { log.warn('audio', 'no WebAudio in this browser'); ui.musicBtn.textContent = 'Music: n/a'; return; }
        const intensityProvider = () => state.endingOpen ? 1
          : state.boardOpen ? 0.85
            : state.interrogationOpen ? 0.6
              : Math.min(0.75, 0.2 + engine.clock.count * 0.15);
        band = new HouseBandController(() => {
          const entropy = win.crypto?.getRandomValues
            ? win.crypto.getRandomValues(new Uint32Array(1))[0]
            : Math.floor((win.performance?.now?.() || Date.now()) * 1000);
          return new HouseBandPlayer(new AC(), { bars: 8, seed: sessionSeed(world.caseData.id, entropy), intensityProvider });
        });
      }
      const on = band.toggle();
      ui.musicBtn.textContent = on ? 'Music: on' : 'Music: off';
      ui.root.dataset.musicState = on ? 'on' : 'off';
      ui.root.dataset.musicInstances = String(band.runningCount());
    } catch (err) { log.capture('audio', err); }
  });

  // --- fit + boot ----------------------------------------------------------
  function resize() {
    state.factor = fitFactor(win.innerWidth, win.innerHeight - 40, LOGICAL_W, LOGICAL_H);
    const f = state.factor;
    ui.worldCanvas.style.width = LOGICAL_W * f + 'px';
    ui.worldCanvas.style.height = LOGICAL_H * f + 'px';
    ui.overlay.width = LOGICAL_W * f;
    ui.overlay.height = LOGICAL_H * f;
  }
  win.addEventListener('resize', resize);
  resize();

  function setBottomBarEnabled(enabled) {
    const disabled = !enabled;
    for (const b of ui.barButtons) b.disabled = disabled;
  }

  // Boot: no explicit case chosen -> the title / case-select front door; a chosen case
  // (?case=N) resumes a checkpoint if present, else plays its prologue.
  const fresh = !save.has('auto');
  const wantsDemo = win.location && /[?&]demo=/.test(win.location.search || '');
  const wantsSoak = win.location && /[?&]soak=/.test(win.location.search || '');
  const caseChosen = /[?&]case=\d/.test(params);
  const openTitle = () => {
    state.titleOpen = true;
    ui.title.style.display = 'flex';
    setBottomBarEnabled(false);
    state.backdropArt = world.backdropArt || 'restaurant-office'; state.sceneDirty = true;
    for (const b of ui.tCases) b.onclick = () => { try { win.location.search = '?' + b.dataset.param; } catch (_) { /* headless */ } };
  };
  if (!caseChosen && !wantsDemo && !wantsSoak) {
    openTitle();
  } else if (fresh && world.caseData && world.caseData.prologue && !wantsDemo) {
    engine.startPrologue();
  } else {
    engine.start();
    try { if (save.has('auto')) engine.loadFrom('auto'); }
    catch (err) { log.capture('main.boot', err); }
  }
  win.requestAnimationFrame(frame);

  // QA/proof hook (harmless, opt-in via ?demo=notebook): acquire a few facts and open
  // the notebook, so a headless screenshot can prove the evidence spine end-to-end.
  if (win.location && /[?&]demo=notebook/.test(win.location.search || '') && engine.caseData.id === 'case-1') {
    try {
      engine.enter('morgue'); engine.focus.focusById('tod-board'); engine.select();
      engine.focus.focusById('coroner-report'); engine.select();
      engine.enter('restaurant');
      engine.focus.focusById('valet-log'); engine.select();
      engine.focus.focusById('knife-rack'); engine.select();
      engine.focus.focusById('chef'); engine.select(); engine.dialogueChoose('ask'); engine.endInterrogation();
      engine.focus.focusById('waiter'); engine.select(); engine.dialogueChoose('w-ask'); engine.endInterrogation();
      engine.notebook.pin('f-chef-at-restaurant');
      engine.notebook.addToGroup('the alibi', 'f-chef-at-restaurant');
      engine.notebook.addToGroup('the alibi', 's-chef-alibi');
      engine.notebook.crossRef('f-chef-at-restaurant', 's-chef-alibi');
      if (/[?&]portrait=hostile/.test(win.location.search)) for (let i = 0; i < 3; i++) engine.suspectState('chef').harden();
      toggleNotebook(true);
    } catch (err) { log.capture('main.demo', err); }
  }
  if (win.location && /[?&]demo=interro/.test(win.location.search || '')) {
    try {
      const script = SOAK_SCRIPTS[engine.caseData.id]; // case-aware interview demo
      const [iScene, suspect] = script ? script.interview : ['restaurant', 'chef'];
      for (const [scene, hotspot] of (script ? script.acquire : [])) { engine.enter(scene); engine.focus.focusById(hotspot); engine.select(); }
      engine.enter(iScene);
      engine.focus.focusById(suspect); engine.select();        // open the interview
      engine.dialogueChoose('ask');                            // hear the alibi
      if (/[?&]portrait=hostile/.test(win.location.search)) for (let i = 0; i < 3; i++) engine.suspectState(suspect).harden();
      interro.toggleChallenge();                               // show the challenge form
    } catch (err) { log.capture('main.demo', err); }
  }
  if (win.location && /[?&]demo=board/.test(win.location.search || '')) {
    try {
      const c = engine.caseData;
      const script = SOAK_SCRIPTS[c.id]; // case-aware: fill the board from this case's winning chain
      if (!script) throw new Error(`no demo=board script for case "${c.id}"`);
      for (const id of script.pins) {
        if (c.fact(id)) { engine.notebook.logFact(c.fact(id), { scene: 'demo' }); engine.notebook.pin(id); }
        else if (c.statement(id)) { engine.notebook.logStatement(c.statement(id), { scene: 'interview' }); engine.notebook.pin(id); }
      }
      engine.openBoard();
      for (const [slot, value] of Object.entries(script.winning)) engine.boardSet(slot, value);
      boardPanel.render();
      if (/[?&]solve/.test(win.location.search)) engine.boardSubmit(/[?&]trap/.test(win.location.search)); // -> ending scene
    } catch (err) { log.capture('main.demo', err); }
  }

  // SOAK (acceptance): drive a full WIN or LOSS path through the SHIPPED build in a
  // real browser and write a DOM result marker. The accusation is driven by REAL DOM
  // events (button clicks + select changes) through the real handlers; evidence
  // acquisition uses the engine navigation the player's clicks would trigger. A
  // headless runner (scripts/soak.mjs) dumps the DOM and checks the marker.
  if (win.location && /[?&]demo=options/.test(win.location.search || '')) { try { toggleOptions(true); } catch (err) { log.capture('main.demo', err); } }
  if (win.location && /[?&]demo=help/.test(win.location.search || '')) { try { toggleHelp(true); } catch (err) { log.capture('main.demo', err); } }
  const soakMatch = win.location && (win.location.search || '').match(/[?&]soak=(win|loss)/);
  if (soakMatch) { runSoak(soakMatch[1], { doc, win, engine, ui, log, boardPanel }); }

  log.info('main', 'SHOELEATHER engine harness booted', { logical: `${LOGICAL_W}x${LOGICAL_H}` });
  return { engine, log, ui, state };
}

// Per-case acceptance scripts: the acquisitions, interview, pins, and board fills for a
// full WIN and a LOSS walk. Keyed by case id so the soak works for every shipped case.
const SOAK_SCRIPTS = {
  'case-1': {
    acquire: [['morgue', 'coroner-report'], ['morgue', 'tod-board'], ['restaurant', 'valet-log'], ['restaurant', 'knife-rack']],
    acquireExtra: [['studio', 'staff-ledger']],
    interview: ['restaurant', 'chef'], lossAcquire: ['morgue', 'bank-letter'],
    pins: ['f-means', 'f-time', 'f-place', 'f-tape-mechanism', 'f-chef-at-restaurant', 'f-valet-corroboration', 'f-chef-knife', 's-chef-alibi'], lossPin: 'f-partner-debt',
    winning: { suspect: 'chef', means: 'f-means', time: 'f-time', place: 'f-place', alibiMechanism: 'f-tape-mechanism', prologueFact: 'f-chef-at-restaurant', contradictedStatement: 's-chef-alibi', corroboration: 'f-valet-corroboration', physicalContradiction: 'f-chef-knife' },
    losing: { suspect: 'chef', means: 'f-means', time: 'f-time', place: 'f-place', alibiMechanism: 'f-tape-mechanism', prologueFact: 'f-chef-at-restaurant', contradictedStatement: 's-chef-alibi', corroboration: 'f-valet-corroboration', physicalContradiction: 'f-partner-debt' },
  },
  'case-2': {
    acquire: [['stateroom', 'the-berth'], ['stateroom', 'dinner-tray'], ['lounge', 'lounge-clock'], ['lounge', 'steward-note'], ['office', 'purser-desk']],
    interview: ['lounge', 'purser'], lossAcquire: ['stateroom', 'open-ledger'],
    pins: ['f-means', 'f-time', 'f-place', 'f-clock-mechanism', 'f-purser-corridor', 'f-deck-log-corroboration', 'f-purser-weapon', 's-purser-alibi'], lossPin: 'f-purser-skim',
    winning: { suspect: 'purser', means: 'f-means', time: 'f-time', place: 'f-place', alibiMechanism: 'f-clock-mechanism', prologueFact: 'f-purser-corridor', contradictedStatement: 's-purser-alibi', corroboration: 'f-deck-log-corroboration', physicalContradiction: 'f-purser-weapon' },
    losing: { suspect: 'purser', means: 'f-means', time: 'f-time', place: 'f-place', alibiMechanism: 'f-clock-mechanism', prologueFact: 'f-purser-corridor', contradictedStatement: 's-purser-alibi', corroboration: 'f-deck-log-corroboration', physicalContradiction: 'f-purser-skim' },
  },
};

// A full real-browser acceptance walk. Writes <div id="soak"> with the verdict.
function runSoak(mode, { doc, win, engine, ui, log, boardPanel }) {
  const fireChange = (sel, value) => { sel.value = value; sel.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const acquire = (scene, hotspot) => { engine.enter(scene); engine.focus.focusById(hotspot); engine.select(); };
  let ok = false, detail = '';
  try {
    const script = SOAK_SCRIPTS[engine.caseData.id];
    if (!script) throw new Error(`no soak script for case "${engine.caseData.id}"`);
    while (engine.prologueRunner) ui.pAction.click();   // click through the prologue (real clicks)

    // Acquire the load-bearing evidence (the player's sweep + interviews).
    for (const [scene, hotspot] of script.acquire) acquire(scene, hotspot);
    for (const [scene, hotspot] of script.acquireExtra || []) acquire(scene, hotspot);
    const [iScene, suspect] = script.interview;
    engine.enter(iScene); engine.focus.focusById(suspect); engine.select();  // interview the suspect
    engine.dialogueChoose('ask');                        // hear the alibi (reveals the statement)
    engine.endInterrogation();
    if (mode === 'loss') acquire(...script.lossAcquire); // the red-herring the wrong chain leans on

    // Pin what the board needs (candidates come only from pinned notes).
    for (const id of script.pins) engine.notebook.pin(id);
    if (mode === 'loss') engine.notebook.pin(script.lossPin);

    // Make the accusation through REAL DOM: click Accuse, set the selects, submit.
    ui.accuseBtn.click();
    boardPanel.render();
    const values = mode === 'win' ? script.winning : script.losing;
    for (const sel of ui.bSentence.querySelectorAll('select')) fireChange(sel, values[sel.dataset.slot]);
    ui.submitBtn.click();

    if (mode === 'win') {
      ok = engine.solved === true && ui.ending.style.display !== 'none';
      detail = `solved=${engine.solved} ending=${ui.ending.style.display !== 'none'}`;
    } else {
      ok = engine.solved === false && !!ui.bDeflect.textContent && engine.clock.count >= 1;
      detail = `solved=${engine.solved} deflected=${!!ui.bDeflect.textContent} clock=${engine.clock.count}`;
    }
  } catch (err) { log.capture('soak', err); detail = 'threw: ' + err.message; }

  const errors = log.errorCount();
  const verdict = ok && errors === 0 ? 'OK' : 'FAIL';
  const marker = doc.createElement('div');
  marker.id = 'soak-result';
  marker.textContent = `SOAK ${mode} ${verdict} errors=${errors} ${detail}`;
  doc.body.appendChild(marker);
  try { doc.title = marker.textContent; } catch (_) { /* headless has no title elem sometimes */ }
}

// --- DOM scaffolding + global handlers ------------------------------------

function buildDom(doc) {
  const root = doc.getElementById('app') || doc.body;
  root.innerHTML = '';
  root.dataset.designCalls = 'DESIGN_CALLS_20260811';
  root.dataset.artRound = 'ART_ROUND_20260811';
  const stage = el(doc, 'div', 'sl-stage');
  const worldCanvas = doc.createElement('canvas');
  worldCanvas.width = LOGICAL_W; worldCanvas.height = LOGICAL_H;
  worldCanvas.className = 'sl-world';
  const overlay = doc.createElement('canvas');
  overlay.className = 'sl-overlay';
  stage.appendChild(worldCanvas);
  stage.appendChild(overlay);

  const bar = el(doc, 'div', 'sl-bar');
  const notebookBtn = button(doc, 'Notebook (n)');
  const accuseBtn = button(doc, 'Accuse');
  const saveBtn = button(doc, 'Save');
  const loadBtn = button(doc, 'Load');
  const restartBtn = button(doc, 'Restart Case');
  const musicBtn = button(doc, 'Music: off');
  const optionsBtn = button(doc, 'Options');
  const helpBtn = button(doc, 'Help (?)');
  const logBtn = button(doc, 'Export Debug Log');
  const barButtons = [notebookBtn, accuseBtn, saveBtn, loadBtn, restartBtn, musicBtn, optionsBtn, helpBtn, logBtn];
  bar.append(notebookBtn, accuseBtn, saveBtn, loadBtn, restartBtn, musicBtn, optionsBtn, helpBtn, logBtn);

  const banner = el(doc, 'div', 'sl-banner');
  banner.style.display = 'none';

  // Notebook overlay (crisp DOM text layer above the stage).
  const notebook = el(doc, 'div', 'sl-notebook');
  notebook.style.display = 'none';
  const nbHead = el(doc, 'div', 'sl-nb-head');
  const nbTitle = el(doc, 'div', 'sl-nb-title'); nbTitle.textContent = 'NOTEBOOK';
  const nbSearch = doc.createElement('input');
  nbSearch.className = 'sl-nb-search'; nbSearch.type = 'text'; nbSearch.placeholder = 'search facts...';
  const nbClose = button(doc, 'Close (esc)');
  nbHead.append(nbTitle, nbSearch, nbClose);
  const nbFilters = el(doc, 'div', 'sl-nb-filters');
  const nbPeople = el(doc, 'div', 'sl-nb-people');
  const nbBody = el(doc, 'div', 'sl-nb-body');
  const nbFoot = el(doc, 'div', 'sl-nb-foot');
  notebook.append(nbHead, nbFilters, nbPeople, nbBody, nbFoot);

  const toast = el(doc, 'div', 'sl-toast');
  toast.style.display = 'none';
  stage.appendChild(toast);

  // Interrogation overlay (portrait + dialogue + challenge + event log).
  const interro = el(doc, 'div', 'sl-interro');
  interro.style.display = 'none';
  const iLeft = el(doc, 'div', 'sl-i-left');
  const portrait = doc.createElement('canvas');
  portrait.width = 160; portrait.height = 200; portrait.className = 'sl-portrait';
  const iSpeaker = el(doc, 'div', 'sl-i-speaker');
  const iPosture = el(doc, 'div', 'sl-i-posture');
  iLeft.append(portrait, iSpeaker, iPosture);
  const iRight = el(doc, 'div', 'sl-i-right');
  const iText = el(doc, 'div', 'sl-i-text');
  const iOptions = el(doc, 'div', 'sl-i-options');
  const iChallenge = el(doc, 'div', 'sl-i-challenge');
  const iLog = el(doc, 'div', 'sl-i-log');
  const iBar = el(doc, 'div', 'sl-i-bar');
  const challengeBtn = button(doc, 'Challenge (c)');
  const leaveBtn = button(doc, 'Leave (esc)');
  iBar.append(challengeBtn, leaveBtn);
  iRight.append(iText, iOptions, iChallenge, iLog, iBar);
  interro.append(iLeft, iRight);

  // Accusation board overlay (the GOTCHA).
  const board = el(doc, 'div', 'sl-board');
  board.style.display = 'none';
  const bTitle = el(doc, 'div', 'sl-b-title'); bTitle.textContent = 'THE ACCUSATION';
  const bSentence = el(doc, 'div', 'sl-b-sentence');
  const bDeflect = el(doc, 'div', 'sl-b-deflect');
  const bBar = el(doc, 'div', 'sl-b-bar');
  const submitBtn = button(doc, 'Make the accusation');
  const trapBtn = button(doc, 'Stage the demonstration');
  const boardCloseBtn = button(doc, 'Step back');
  bBar.append(submitBtn, trapBtn, boardCloseBtn);
  board.append(bTitle, bSentence, bDeflect, bBar);

  // Ending overlay (the confrontation is always a scene).
  const ending = el(doc, 'div', 'sl-ending');
  ending.style.display = 'none';

  // Help overlay (controls + the loop). Reuses the options panel styling.
  const help = el(doc, 'div', 'sl-options sl-help');
  help.style.display = 'none';
  const hTitle = el(doc, 'div', 'sl-o-title'); hTitle.textContent = 'HOW TO PLAY';
  const hBody = el(doc, 'div', 'sl-o-body');
  const hClose = button(doc, 'Close (esc)');
  help.append(hTitle, hBody, hClose);

  // Options overlay (M7 accessibility/QoL).
  const options = el(doc, 'div', 'sl-options');
  options.style.display = 'none';
  const oTitle = el(doc, 'div', 'sl-o-title'); oTitle.textContent = 'OPTIONS';
  const oBody = el(doc, 'div', 'sl-o-body');
  const oClose = button(doc, 'Close (esc)');
  options.append(oTitle, oBody, oClose);

  // Prologue overlay (play as the murderer; forced-linear).
  const prologue = el(doc, 'div', 'sl-prologue');
  prologue.style.display = 'none';
  const pCard = el(doc, 'div', 'sl-p-card');
  const pAct = el(doc, 'div', 'sl-p-act');
  const pTime = el(doc, 'div', 'sl-p-time');
  pCard.append(pAct, pTime);
  const pKicker = el(doc, 'div', 'sl-p-kicker'); pKicker.textContent = 'BEFORE';
  const pProse = el(doc, 'div', 'sl-p-prose');
  const pNote = el(doc, 'div', 'sl-p-note');
  const pAction = button(doc, 'Continue');
  pAction.className = 'sl-btn sl-p-action';
  prologue.append(pCard, pKicker, pProse, pNote, pAction);

  // Title / case-select overlay (the front door). The name reads from the swappable
  // GAME_TITLE constant; the case buttons are built from CASES (no baked-in name art).
  const title = el(doc, 'div', 'sl-title');
  title.style.display = 'none';
  const tName = el(doc, 'div', 'sl-t-name'); tName.textContent = GAME_TITLE;
  const tSub = el(doc, 'div', 'sl-t-sub'); tSub.textContent = GAME_SUBTITLE;
  const tPrompt = el(doc, 'div', 'sl-t-prompt'); tPrompt.textContent = 'CHOOSE A CASE';
  title.append(tName, tSub, tPrompt);
  const tCases = [];
  for (const c of CASES) {
    const b = doc.createElement('button');
    b.className = 'sl-btn sl-t-case';
    const ct = el(doc, 'div', 'sl-t-ct'); ct.textContent = c.title;
    const cb = el(doc, 'div', 'sl-t-cb'); cb.textContent = c.blurb;
    b.append(ct, cb);
    b.dataset.param = c.param;
    title.append(b);
    tCases.push(b);
  }

  root.append(banner, stage, notebook, interro, board, ending, prologue, options, help, title, bar);
  return {
    root, stage, worldCanvas, overlay, bar, barButtons, notebookBtn, accuseBtn, saveBtn, loadBtn, restartBtn, musicBtn, logBtn, banner,
    notebook, nbSearch, nbClose, nbFilters, nbPeople, nbBody, nbFoot, toast,
    interro, portrait, iSpeaker, iPosture, iText, iOptions, iChallenge, iLog, challengeBtn, leaveBtn,
    board, bSentence, bDeflect, submitBtn, trapBtn, boardCloseBtn, ending,
    prologue, pCard, pAct, pTime, pKicker, pProse, pNote, pAction,
    options, oBody, oClose, optionsBtn,
    help, hBody, hClose, helpBtn,
    title, tCases,
  };
}

function el(doc, tag, cls) { const e = doc.createElement(tag); if (cls) e.className = cls; return e; }
function button(doc, text) { const b = doc.createElement('button'); b.textContent = text; b.className = 'sl-btn'; return b; }

let toastTimer = null;
function showToast(doc, ui, msg) {
  ui.toast.textContent = msg;
  ui.toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.style.display = 'none'; }, 2600);
}

// The notebook panel: search box, facet filter chips, entry rows with pin toggles,
// and a KNOWN-FACTS case-review mode. Renders off the engine's live Notebook.
function makeNotebookPanel(doc, ui, engine, world, win) {
  // linkFrom: the entry armed for cross-referencing (two-click link).
  const state = { query: '', filter: {}, review: false, linkFrom: null };

  ui.nbSearch.addEventListener('input', () => { state.query = ui.nbSearch.value; render(); });

  function chip(label, active, onClick) {
    const b = doc.createElement('button');
    b.className = 'sl-chip' + (active ? ' sl-chip-on' : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function rowBtn(label, cls, onClick, title) {
    const b = doc.createElement('button');
    b.className = 'sl-rowbtn' + (cls ? ' ' + cls : '');
    b.textContent = label; if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderFilters() {
    ui.nbFilters.innerHTML = '';
    const facets = engine.notebook.facets();
    ui.nbFilters.append(chip(state.review ? 'All entries' : 'Case review (known facts)', state.review, () => { state.review = !state.review; render(); }));
    for (const p of facets.people) {
      ui.nbFilters.append(chip('who: ' + p, state.filter.person === p, () => { state.filter.person = state.filter.person === p ? null : p; render(); }));
    }
    for (const t of facets.types) {
      ui.nbFilters.append(chip('type: ' + t, state.filter.type === t, () => { state.filter.type = state.filter.type === t ? null : t; render(); }));
    }
    for (const g of engine.notebook.groups()) {
      ui.nbFilters.append(chip('grp: ' + g, state.filter.group === g, () => { state.filter.group = state.filter.group === g ? null : g; render(); }));
    }
  }

  function currentEntries() {
    if (state.review) return engine.notebook.reviewKnownFacts();
    let entries = state.query ? engine.notebook.search(state.query) : engine.notebook.entries();
    const f = state.filter;
    if (f.person) entries = entries.filter((e) => e.person() === f.person);
    if (f.type) entries = entries.filter((e) => e.type() === f.type);
    if (f.group) entries = entries.filter((e) => e.groups.has(f.group));
    // pinned first, then observation order
    return entries.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }

  function render() {
    renderFilters();
    ui.nbPeople.innerHTML = '';
    for (const person of engine.caseData.accusableSuspects()) {
      const card = el(doc, 'div', 'sl-nb-person');
      const canvas = doc.createElement('canvas'); canvas.className = 'sl-nb-portrait';
      const posture = engine.suspectState(person.id).posture();
      paintPortraitCanvas(canvas, win, { personId: person.id, posture });
      const caption = el(doc, 'div', 'sl-nb-person-caption');
      const name = el(doc, 'div', 'sl-nb-person-name'); name.textContent = person.name;
      const tell = el(doc, 'div', 'sl-nb-person-tell');
      tell.textContent = { open: 'at ease', guarded: 'guarded', defensive: 'on the defensive', hostile: 'shut down' }[posture];
      caption.append(name, tell); card.append(canvas, caption); ui.nbPeople.append(card);
    }
    ui.nbBody.innerHTML = '';
    const entries = currentEntries();
    if (entries.length === 0) {
      const empty = el(doc, 'div', 'sl-nb-empty');
      empty.textContent = engine.notebook.size === 0 ? 'Nothing observed yet. Sweep the scene and look.' : 'No entries match.';
      ui.nbBody.append(empty);
    }
    for (const e of entries) {
      const row = el(doc, 'div', 'sl-nb-row');
      const pin = doc.createElement('button');
      pin.className = 'sl-pin' + (e.pinned ? ' sl-pin-on' : '');
      pin.textContent = e.pinned ? 'Unpin (space)' : 'Pin (space)';
      pin.title = e.pinned ? 'Unpin this note' : 'Pin this note';
      pin.addEventListener('click', () => { e.pinned ? engine.notebook.unpin(e.id) : engine.notebook.pin(e.id); render(); });

      const xrefs = engine.notebook.crossRefsOf(e.id);
      const link = rowBtn(state.linkFrom === e.id ? 'linking' : 'link', state.linkFrom === e.id ? 'sl-rowbtn-on' : '',
        () => {
          if (state.linkFrom && state.linkFrom !== e.id) { engine.notebook.crossRef(state.linkFrom, e.id); state.linkFrom = null; }
          else { state.linkFrom = state.linkFrom === e.id ? null : e.id; }
          render();
        }, 'cross-reference two entries');
      const grp = rowBtn('group', '', () => {
        const name = win.prompt ? win.prompt('Add to group:') : null;
        if (name) { engine.notebook.addToGroup(name.trim(), e.id); render(); }
      }, 'add to a group');

      const meta = el(doc, 'span', 'sl-nb-meta');
      const tags = [...e.groups].map((g) => '#' + g).join(' ');
      const xr = xrefs.length ? `  link:${xrefs.length}` : '';
      meta.textContent = `${e.person()} / ${e.type()}${e.scene ? ' / ' + e.scene : ''}${tags ? '  ' + tags : ''}${xr}`;
      const text = el(doc, 'span', 'sl-nb-text');
      text.textContent = e.kind === 'statement' ? '"' + e.text() + '"' : e.text();
      row.append(pin, link, grp, meta, text);
      ui.nbBody.append(row);
    }
    const cov = engine.notebook.size;
    ui.nbFoot.textContent = `${cov} observed  /  ${engine.notebook.pinned().length} pinned`;
  }

  return { render };
}

// The interrogation panel: diegetic portrait (posture, never a number), the current
// dialogue line + guarded options, a statement x evidence challenge form, and an event
// log where landed challenges and counter-moves surface visibly (action-legibility).
function makeInterrogationPanel(doc, ui, engine, win) {
  const state = { challengeMode: false, log: [] };

  function suspect() { return engine.interrogation ? engine.interrogation.state : null; }
  function suspectName(id) { const s = engine.caseData && engine.caseData.suspect(id); return s ? s.name : id; }

  function pushLog(line) { state.log.push(line); if (state.log.length > 6) state.log.shift(); }

  function drawPortrait() {
    const s = suspect(); if (!s) return;
    paintPortraitCanvas(ui.portrait, win, { posture: s.posture(), personId: engine.interrogation.suspectId, tint: PALETTE.walnut });
  }

  function render() {
    const inter = engine.interrogation;
    if (!inter) return;
    const node = inter.runner.current();
    const s = inter.state;
    drawPortrait();
    ui.iSpeaker.textContent = suspectName(inter.suspectId);
    // Posture as WORDS, still diegetic (a read of demeanour, not a tolerance number).
    ui.iPosture.textContent = { open: 'at ease', guarded: 'guarded', defensive: 'on the defensive', hostile: 'shut down' }[s.posture()];
    ui.iText.textContent = node ? node.text : '';

    ui.iOptions.innerHTML = '';
    if (node) {
      inter.runner.options().forEach((o, i) => {
        const b = button(doc, `${i + 1}. ${o.text}`);
        b.className = 'sl-btn sl-i-opt';
        b.addEventListener('click', () => engine.dialogueChoose(o.id));
        ui.iOptions.append(b);
      });
    }
    renderChallenge();
    ui.iLog.innerHTML = '';
    for (const line of state.log) { const d = el(doc, 'div', 'sl-i-logline'); d.textContent = line; ui.iLog.append(d); }
  }

  function renderChallenge() {
    ui.iChallenge.innerHTML = '';
    if (!state.challengeMode) return;
    const inter = engine.interrogation;
    const statements = inter.interro.challengeable();
    const evidence = inter.interro.availableEvidence();
    if (statements.length === 0) { ui.iChallenge.textContent = 'No statements to challenge yet. Get them talking.'; return; }
    if (evidence.length === 0) { ui.iChallenge.textContent = 'You have no evidence in hand. Go and find some.'; return; }

    const sSel = doc.createElement('select'); sSel.className = 'sl-i-sel';
    for (const st of statements) { const o = doc.createElement('option'); o.value = st.id; o.textContent = '"' + st.text + '"'; sSel.append(o); }
    const eSel = doc.createElement('select'); eSel.className = 'sl-i-sel';
    for (const f of evidence) { const o = doc.createElement('option'); o.value = f.id; o.textContent = f.prose || f.id; eSel.append(o); }
    const present = button(doc, 'Present');
    present.addEventListener('click', () => {
      const res = engine.challenge(sSel.value, eSel.value);
      if (res.type === 'landed') pushLog('The contradiction lands. ' + suspectName(inter.suspectId) + ' has no answer.');
      else if (res.type === 'failed') pushLog('That was nothing. ' + suspectName(inter.suspectId) + ' hardens.' + (res.counterMove ? ' ' + (res.counterMove.describe || '') : ''));
      else if (res.type === 'refused') pushLog(res.reason);
      else pushLog('That does not work here.');
      state.challengeMode = false;
      render();
    });
    const lbl1 = el(doc, 'div', 'sl-i-clabel'); lbl1.textContent = 'Their statement:';
    const lbl2 = el(doc, 'div', 'sl-i-clabel'); lbl2.textContent = 'Your evidence:';
    ui.iChallenge.append(lbl1, sSel, lbl2, eSel, present);
  }

  function toggleChallenge() { state.challengeMode = !state.challengeMode; render(); }

  function handleKey(ev) {
    if (ev.key === 'Escape') { engine.endInterrogation(); return; }
    if (ev.key === 'c') { toggleChallenge(); return; }
    const n = parseInt(ev.key, 10);
    if (!Number.isNaN(n) && engine.interrogation) {
      const opts = engine.interrogation.runner.options();
      if (n >= 1 && n <= opts.length) engine.dialogueChoose(opts[n - 1].id);
    }
  }

  return { render, handleKey, toggleChallenge, resetLog: () => { state.log = []; state.challengeMode = false; } };
}

// The accusation board: the slotted assertion sentence with a <select> per slot drawn
// from PINNED notebook entries. Submit validates the exact chain; a wrong submission
// shows the one uniform deflection line (no gradient).
function makeBoardPanel(doc, ui, engine) {
  // Human-readable sentence scaffold with slot placeholders in order.
  const PARTS = [
    { text: 'The killer is ' }, { slot: 'suspect' },
    { text: '. They killed ' }, { victim: true },
    { text: ' by ' }, { slot: 'means' },
    { text: ', at ' }, { slot: 'time' },
    { text: ', in ' }, { slot: 'place' },
    { text: '. The alibi was built with ' }, { slot: 'alibiMechanism' },
    { text: ', but fails because ' }, { slot: 'prologueFact' },
    { text: ' contradicts ' }, { slot: 'contradictedStatement' },
    { text: '. Corroborated by ' }, { slot: 'corroboration' },
    { text: ', with the physical contradiction ' }, { slot: 'physicalContradiction' },
    { text: '.' },
  ];

  function slotSelect(slot) {
    const sel = doc.createElement('select');
    sel.className = 'sl-b-slot';
    sel.dataset.slot = slot;
    const labels = [];
    const blank = doc.createElement('option'); blank.value = ''; blank.textContent = `[ ${slot} ]`; sel.append(blank);
    for (const c of engine.board.candidatesFor(slot)) {
      const o = doc.createElement('option');
      o.value = c.id; o.textContent = c.label; o.title = c.label; sel.append(o);
      labels.push(c.label);
    }
    const maxLabel = labels.reduce((m, l) => Math.max(m, String(l).length), 0);
    const px = boardSlotWidth(maxLabel);
    sel.style.width = `${px}px`;
    sel.style.maxWidth = '100%';
    sel.value = engine.board.slots[slot] || '';
    sel.title = `Select ${slot}`;
    sel.addEventListener('change', () => { engine.boardSet(slot, sel.value || null); ui.bDeflect.textContent = ''; });
    return sel;
  }

  function render() {
    if (!engine.board) return;
    ui.bSentence.innerHTML = '';
    for (const part of PARTS) {
      if (part.text) { const s = el(doc, 'span', 'sl-b-frag'); s.textContent = part.text; ui.bSentence.append(s); }
      else if (part.victim) { const s = el(doc, 'span', 'sl-b-victim'); s.textContent = engine.board.victimName(); ui.bSentence.append(s); }
      else ui.bSentence.append(slotSelect(part.slot));
    }
  }

  return { render };
}

// The ending is ALWAYS a scene. Default: the lieutenant walks the chain and the
// suspect breaks. TRAP variant (superior): he stages the demonstration instead.
function showEnding(doc, ui, engine, win, chain, variant, onRestart) {
  const c = engine.caseData;
  const scene = buildEndingScene(c, chain, variant);
  const runner = new PrologueRunner({ id: `ending-${c.id}`, beats: scene.beats });

  function render() {
    const beat = runner.current();
    ui.ending.innerHTML = '';
    ui.ending.dataset.beat = beat.id;
    const kicker = el(doc, 'div', 'sl-end-kicker'); kicker.textContent = 'CONFRONTATION';
    const cast = el(doc, 'div', 'sl-end-cast');
    const accused = endingPersonCard(scene.accused, true, beat.speaker === scene.accused.name);
    const witnesses = el(doc, 'div', 'sl-end-witnesses');
    for (const witness of scene.witnesses) witnesses.append(endingPersonCard(witness, false, beat.speaker === witness.name));
    cast.append(accused, witnesses);
    ui.ending.append(kicker, cast);
    if (beat.card) {
      const card = el(doc, 'div', 'sl-end-title'); card.textContent = beat.card;
      const again = button(doc, 'A new case (restart)'); again.addEventListener('click', onRestart);
      ui.ending.append(card, again);
      return;
    }
    const speaker = el(doc, 'div', 'sl-end-speaker'); speaker.textContent = beat.speaker;
    const prose = el(doc, 'div', 'sl-end-line'); prose.textContent = beat.prose;
    const reaction = el(doc, 'div', 'sl-end-reaction'); reaction.textContent = beat.reaction;
    const action = button(doc, beat.action); action.className = 'sl-btn sl-end-action';
    action.addEventListener('click', () => { runner.advance(); render(); });
    ui.ending.append(speaker, prose, reaction, action);
  }
  function endingPersonCard(person, isAccused, isSpeaker) {
    const posture = endingPortraitState({ isAccused, isSpeaker, beatIndex: runner.index });
    const card = el(doc, 'div', `sl-end-person ${isAccused ? 'sl-end-accused' : 'sl-end-witness'}${isSpeaker ? ' sl-end-active' : ''}`);
    const canvas = doc.createElement('canvas'); canvas.className = 'sl-end-portrait';
    paintPortraitCanvas(canvas, win, { personId: person.id, posture });
    const name = el(doc, 'div', 'sl-end-person-name'); name.textContent = person.name;
    const tell = el(doc, 'div', 'sl-end-person-tell');
    tell.textContent = isAccused
      ? { open: 'composed', guarded: 'guarded', defensive: 'pressed back', hostile: 'composure gone' }[posture]
      : (isSpeaker ? 'giving account' : 'watching');
    card.append(canvas, name, tell); return card;
  }
  render();
  ui.ending.style.display = 'flex';
}

function installLoudFailures(log, win) {
  if (!win || !win.addEventListener) return;
  win.addEventListener('error', (ev) => log.capture('window.error', ev.error || ev.message));
  win.addEventListener('unhandledrejection', (ev) => log.capture('unhandledrejection', ev.reason));
}

function exportLog(doc, win, log) {
  const text = log.export() || '(log empty)';
  try {
    const blob = new win.Blob([text], { type: 'text/plain' });
    const url = win.URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url; a.download = 'shoeleather-debug.txt';
    doc.body.appendChild(a); a.click(); a.remove();
    win.URL.revokeObjectURL(url);
  } catch (_) {
    win.alert && win.alert(text);
  }
}

function memoryFallback() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), remove: (k) => m.delete(k), keys: () => [...m.keys()] };
}

// Auto-boot in a browser; harmless under node import (guarded).
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
}
