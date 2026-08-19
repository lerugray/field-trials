// app.js — browser bootstrap (the ONLY module that touches window/document; never
// imported by `node --test`). Wires: a DPR-aware, letterboxed canvas at the logical
// VIEW resolution; the title card; a FIXED-TIMESTEP game loop driving the sim from
// keyboard + gamepad input; LOUD error surfacing (hard rule 4 — window errors + sim/render
// exceptions paint a red banner AND land in the exportable debuglog).
//
// Determinism law (rule 6): the sim advances ONLY in whole 1/60 s ticks from an
// accumulator, so a slow or fast display never changes the simulation.

import { VIEW, DT, FINALE } from './tuning.js';
import { debuglog } from './engine/debuglog.js';
import { World } from './sim/world.js';
import { Balloon } from './sim/balloon.js';
import { Drop } from './sim/drop.js';
import { generateStage, generateFinale } from './sim/generate.js';
import { botInput, finaleSurvivalInput } from './sim/bot.js';
import { Run } from './sim/run.js';
import { drawTitle } from './render/title.js';
import { drawGame, Effects, nativeScreen } from './render/game.js';
import { drawHUD } from './render/hud.js';
import { presentFrame, scrim, drawTitleExtras, drawResumeHint, drawConfirmNewRun, drawClearedRibbon, drawDowned, drawCenterpiece, drawRehearsal, drawPaused, drawOptions, drawTrunk, drawTourMap, drawDraft, drawScorecard, drawErrorBanner, drawSaveNotice, drawControllerNotice } from './render/overlays.js';
import { beginSlide, updateSlide, paintSlide, slideActive, holdSlide, resetSlide } from './render/transition.js';
import { saveState, loadState, inspectSave, resumableKind, clearSave, saveNoticeFor, loadScores, recordScore, loadFlags, setFlag, ownedSouvenirs, ticketBank, bankTickets, unlockSouvenir, UNLOCK_COST, loadSettings, setSetting, loadRuns, recordRun } from './engine/saves.js';
import { CATALOG } from './sim/catalog.js';
import { createBand } from './engine/band.js';
import { POPINJAY_BAND_OVERRIDES } from './engine/audio-posture.js';
import { SCORE_PERFORMANCE, TRACKS, registerTracks, trackForMode, quantizeToBeat, sfxFor, SFX_EVENTS } from './engine/score.js';
import { NATIVE, computeLetterbox, cssToNative, beginTextLayer, takeTextLayer, paintTextLayer } from './render/px.js';
import { ACTIONS, loadBindings, serializeBindings, setKeyBinding, setPadBinding, cloneBindings, resolveActions, applyReservedMenuCodes, createInputState, createPadSession, keyBindingLabel, keyCodeLabel, keyBindingConflict, padBindingConflict, padButtonLabel, padBindingLabel, REBIND_ROWS, BINDS_KEY, simIntent, isRebindCancelCode, pauseControlLines } from './engine/input.js';
import { registerTypography } from './render/fontData.js';

const BUILD = 'M7';

const TITLE = 'title', PLAYING = 'playing', SCORECARD = 'scorecard', DRAFT = 'draft', TOURMAP = 'tourmap', TRUNK = 'trunk', REHEARSAL = 'rehearsal', OPTIONS = 'options';
const LOCALE_NAMES = ['Emerald Midway', 'The Windward Pier', 'Sunset Ironworks']; // locale flavour (M5 art expands)
const SOUV_NAME = Object.fromEntries(CATALOG.map((c) => [c.id, c.name])); // id → display name (no raw IDs on-screen)

function boot() {
  const canvas = document.getElementById('stage');
  if (!canvas) { document.body.innerHTML = 'FATAL: no #stage canvas'; return; }
  const ctx = canvas.getContext('2d');
  if (!ctx) { document.body.innerHTML = 'FATAL: no 2D context'; return; }

  // Seed comes from the URL (?seed=) so the capture harness is reproducible; else 1.
  const params = new URLSearchParams(location.search);
  const urlSeed = params.get('seed');
  let seed = (parseInt(urlSeed, 10) || 1) >>> 0; // mutable: the title's seed entry can change it
  let seedInput = '';       // digits typed on the title (seed-sharing)
  let confirmNewRun = false; // Enter with a live save must confirm before overwrite

  // Persistence (file:// Chromium allows localStorage; guard anyway so a locked-down
  // store can never crash the boot — a save failure is logged, not fatal).
  let store = null;
  try { store = window.localStorage; } catch (_) { store = null; }

  // LOUD save fault notice (rule 4): corrupt/truncated/version-skew → graceful new run.
  let saveNotice = null;
  if (store) {
    const inspected = inspectSave(store);
    if (inspected.fault) {
      saveNotice = saveNoticeFor(inspected.fault);
      debuglog.warn('save load failed', { fault: inspected.fault });
      clearSave(store);
    } else if (!urlSeed && inspected.state && resumableKind(store) != null) {
      // Adopt the saved run's seed on relaunch — the anti-scum stamp must hold for ALL seeds.
      seed = inspected.state.seed >>> 0;
    }
  }

  // Prove the deterministic core runs in-browser too (headless boot, no side effects).
  try {
    const probe = new World({ seed }).run(60);
    debuglog.info('sim boot ok', { seed, tick: probe.tick, fingerprint: probe.fingerprint() });
  } catch (e) { debuglog.error('sim boot failed', String(e && e.stack || e)); }

  // ----- session state --------------------------------------------------------
  let mode = TITLE;
  let world = null;
  const effects = new Effects();
  let paused = false;

  // ----- THE HOUSE BAND (audio) ----------------------------------------------
  // Code-composed WebAudio only (hard rule 10). Started LAZILY on the first user
  // gesture — browsers block audio before one, and the proof harness (which never
  // sends a keydown) therefore captures in silence. Headless-safe: no AudioContext,
  // a throwing init, or a missing gesture all degrade to silent no-ops, never a crash.
  // (`settings` is initialized just below, after the localStorage `store`.)
  let band = null, audioTried = false;
  function ensureAudio() {
    if (audioTried) return; audioTried = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { debuglog.info('audio: no AudioContext — running silent'); return; }
      const ac = new AC();
      band = createBand({
        ctx: ac,
        seed,
        gain: settings.muted ? 0 : settings.volume,
        ...POPINJAY_BAND_OVERRIDES,
        performance: SCORE_PERFORMANCE,
      });
      registerTracks(band); band.start(); band._ac = ac;
      debuglog.info('audio: House Band started', { seed });
    } catch (e) { band = null; debuglog.error('audio init failed', String(e && e.stack || e)); }
  }
  function applyAudioSettings() {
    if (band) { try { band.setGain(settings.muted ? 0 : settings.volume); } catch (_) { /* ignore */ } }
  }
  function audioUpdate(m, w) {
    if (!band) return;
    try { if (band._ac.state === 'suspended') band._ac.resume(); } catch (_) { /* ignore */ }
    band.setTrack(settings.muted ? null : trackForMode(m, w));
    if (w && !settings.muted) {
      let heat = 0;
      if (w.stage && w.stage.meta && (w.stage.meta.finale || w.stage.meta.endless)) heat = Math.min(1, w.tick / (FINALE.survivalTicks || 5400));
      else if (w.tick > w.parTicks) heat = Math.min(1, (w.tick - w.parTicks) / 600);
      band.setParams({ heat });
    }
  }
  function audioSfx(events, m, w) {
    if (!band || settings.muted || !events.length) return;
    const bpm = (TRACKS[trackForMode(m, w)] || TRACKS.stage).bpm;
    const now = band._ac.currentTime, q = quantizeToBeat(now, bpm);
    // The SFX level is RELATIVE to the music (the split control): scale each one-shot.
    for (const ev of events) if (SFX_EVENTS.has(ev.type)) sfxFor(ev, sfxScaledBand(band, settings.sfx), now, q);
  }
  // Wrap the band so every SFX voice call is scaled by the relative SFX level. The
  // music tracks call band.voices directly, so only SFX are attenuated (the split).
  function sfxScaledBand(b, scale) {
    if (scale >= 0.999) return b;
    const v = {};
    for (const name of Object.keys(b.voices)) {
      const fn = b.voices[name];
      v[name] = (t, ...rest) => { const o = rest[rest.length - 1]; if (o && typeof o === 'object' && 'vol' in o) o.vol *= scale; return fn(t, ...rest); };
    }
    return { voices: v };
  }
  function toggleMute() { settings.muted = !settings.muted; setSetting(store, 'muted', settings.muted); applyAudioSettings(); if (band) { try { band.setTrack(settings.muted ? null : trackForMode(mode, world)); } catch (_) { /* ignore */ } } }

  // Options + the accessibility floor, persisted. First boot honors a system
  // reduced-motion preference if the player hasn't chosen otherwise.
  const settings = loadSettings(store);
  try {
    if (!(store && store.getItem('popinjay:settings:v1')) && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) { settings.reduceMotion = true; }
  } catch (_) { /* no matchMedia — leave the default */ }
  effects.calm = settings.flashReduce || settings.reduceMotion; // damp the loud effects
  let bindings;
  try { bindings = loadBindings(store && JSON.parse(store.getItem(BINDS_KEY))); } catch (_) { bindings = loadBindings(null); }
  const padSession = createPadSession();
  const padInput = createInputState();
  let livePad = null;
  let inputTick = 0;
  let rebindingAction = null, bindingFeedback = null;
  let optPane = 'settings';
  let draftCursor = 0;
  let canResume = resumableKind(store, seed) === 'alive';

  // The RUN/TOUR (interstitials + the finale gameplay are later M4 increments; this
  // wires the tour spine + ticket economy + scorecard). The loadout carries stage to
  // stage; on clear the Run banks tickets and advances; on death it stamps a scorecard.
  // A run draws its draft pool from the OWNED trunk (curated meta).
  function makeRun() { const r = new Run({ seed }); r.trunk = store ? ownedSouvenirs(store) : null; return r; }
  let run = makeRun();

  // Death-stamp discipline: a DEAD save boots straight to the prize counter (a killed
  // process shows the scorecard, never a retry). Restore the ended run for its card.
  if (resumableKind(store, seed) === 'dead') {
    try { const st = loadState(store); run = Run.fromSerialized(st.run); if (!run.scorecard) run.die(World.fromSerialized(st.world)); mode = SCORECARD; }
    catch (e) { debuglog.error('dead-save restore failed', String(e && e.stack || e)); }
  }

  // The comfort assists (composure hearts + par-off) applied to a fresh World.
  function assistOpts() { return { startHearts: settings.composure, parOff: settings.parOff }; }
  function stageForRun() {
    const stage = run.atFinale() ? generateFinale() : generateStage(seed, { locale: run.locale, stage: run.stage });
    const world = new World({ seed, stage, ...assistOpts() });
    // A soak with a FORCED loadout equips it every stage (and folds it into the run so
    // it carries + shows) — so the wire-build and sidearm-build paths are always tested.
    if (soakActive && soakLoadout.length) for (const s of soakLoadout) if (!run.souvenirs.includes(s)) run.souvenirs.push(s);
    for (const s of run.souvenirs) world.equip(s); // carry the loadout
    world.tickets = run.tickets;                    // HUD shows the run's banked tickets
    return world;
  }

  function startStage(resume) {
    if (resume && resumableKind(store, seed) === 'alive') {
      try {
        const st = loadState(store);
        run = Run.fromSerialized(st.run);
        // Between-beat resume: restore the exact untimed state the player left.
        if (st.mode === DRAFT) {
          draftOffer = (run.lastOffer || []).map((id) => CATALOG.find((c) => c.implemented && c.id === id)).filter(Boolean);
          mode = DRAFT;
          return;
        } else if (st.mode === TOURMAP) {
          mode = TOURMAP;
          return;
        } else if (st.mode === REHEARSAL) {
          startRehearsal();
          return;
        }
        world = World.fromSerialized(st.world);
        for (const s of run.souvenirs) if (!world.hasSouvenir(s)) world.equip(s);
        debuglog.info('stage resume', { seed, tick: world.tick, locale: run.locale, stage: run.stage });
      } catch (e) { debuglog.error('resume failed — starting fresh', String(e && e.stack || e)); world = stageForRun(); }
    } else {
      world = stageForRun();
      debuglog.info('stage start', { seed, locale: run.locale, stage: run.stage });
    }
    effects.items.length = 0;
    paused = false;
    saveAcc = 0;
    // A CENTERPIECE announces itself with a brief title card (the quasi-boss beat).
    const m = world.stage.meta || {};
    cpBanner = m.centerpiece ? m.centerpieceName : null;
    cpTimer = cpBanner ? 2.6 : 0;
    mode = PLAYING;
    persistResume(); // a resumable save exists from stage entry (quit-anywhere resume)
  }

  // Advance the tour after a clear (banking tickets); on the finale sentinel, close the
  // run as a victory (the finale GAMEPLAY is a later M4 increment).
  let draftOffer = null;
  function onStageCleared() {
    const prevLocale = run.locale;
    run.clearStage(world); // advances the cursor (to the finale sentinel after 3-4)
    // A locale transition plays the TOUR MAP interstitial (the reference's signature
    // moment — the route pin advances). Otherwise straight to the draft.
    if (!run.atFinale() && run.locale !== prevLocale) { mode = TOURMAP; persistResume(); return; }
    beginDraft();
  }

  function beginDraft() {
    // Between stages: draft 1 of 3 souvenirs (untimed; may decline). The next started
    // stage is the PANIC FINALE when the cursor reached the sentinel.
    draftOffer = run.offerDraft();
    draftCursor = 0;
    if (draftOffer.length) { mode = DRAFT; persistResume(); } else startStage(false);
  }

  // REHEARSAL BURST: each locale interstitial opens a ~12 s finale preview (invincible,
  // no clock) so the Panic Finale's rules arrive TAUGHT before it counts.
  let rehearsalWorld = null, rehearsalTimer = 0;
  function startRehearsal() {
    rehearsalWorld = new World({ seed, stage: generateFinale({ endless: true }) });
    rehearsalWorld.invincible = true;
    for (const s of run.souvenirs) rehearsalWorld.equip(s);
    rehearsalTimer = FINALE.rehearsalTicks / 60; // seconds
    mode = REHEARSAL;
    persistResume();
  }

  function finishDraft(index) {
    if (index != null && draftOffer[index]) run.draftPick(draftOffer[index].id);
    else run.draftDecline();
    draftOffer = null;
    startStage(false);
  }

  // Show the prize counter. `stampDead` persists the ended run so a reload lands here,
  // not on a retry (death-stamp discipline).
  // Record a finished run ONCE (best-score table + trunk bank + run history). Sets
  // run.recorded so a re-entry (or a boot from the dead save) can't double-count.
  function recordRunOnce() {
    if (!store || run.recorded) return;
    recordScore(store, { score: run.score, seed, victory: run.victory }); // best-score table
    bankTickets(store, run.tickets);                                       // trunk bank
    const sc = run.scorecard || {};                                       // run history (causal)
    recordRun(store, { score: run.score, seed, victory: run.victory, locale: sc.locale, stage: sc.stage, culpritCls: sc.culpritCls });
    run.recorded = true;
  }
  function showScorecard(stampDead) {
    recordRunOnce(); // record BEFORE the stamp so the persisted run carries recorded=true
    if (stampDead) saveState(store, { seed, dead: true, world: world ? world.serialize() : null, run: run.serialize() });
    mode = SCORECARD;
  }

  function newRun() { run = makeRun(); clearSave(store); startStage(false); }
  function startNewRunFromTitle() {
    if (seedInput) { seed = (parseInt(seedInput, 10) || 1) >>> 0; seedInput = ''; run = makeRun(); canResume = false; }
    startStage(false);
  }

  // ----- M7 ACCEPTANCE SOAK ---------------------------------------------------
  // Drive the SHIPPED stack (sim + render + audio + save + the whole flow) through
  // real bot playthroughs, so the acceptance harness can watch for pageerrors, stalls,
  // and dead controls over ≥2 full tours. The bot supplies input each tick; the flow
  // transitions (clear→advance, draft, tour-map, rehearsal, finale, scorecard) auto-
  // resolve. A non-mortal soak plays invincible so tours COMPLETE (clearance axis);
  // a mortal soak exercises the death→scorecard path.
  let soakActive = false;
  const SOAK_BATCH = 80;      // bot ticks per frame while soaking (fast-forward)
  const SOAK_STAGE_CAP = 30000; // a stage the bot can't clear within this is a BLOCKER (bot cap ~24k)
  // FORCED loadouts (DESIGN-SEED M7): random drafts must not leave the sidearm path
  // untested — the soak forces each build so walk/climb/fire AND the sidearm are exercised.
  const SOAK_LOADOUTS = {
    baseline: [],
    wire: ['secondBarrel', 'quickSpool', 'skyAnchor'],
    sidearm: ['gallerySidearm', 'plumeHat'],
  };
  let soakLoadout = [];
  const soak = { tours: 0, target: 2, stages: 0, drafts: 0, finales: 0, victories: 0, deaths: 0, sidearmShots: 0, loadout: 'mixed', mortal: false, lastTick: -1, stallTicks: 0, done: false };
  function soakStart(opts = {}) {
    soak.target = opts.tours || 2; soak.mortal = !!opts.mortal;
    soak.loadout = opts.loadout || 'mixed'; soakLoadout = SOAK_LOADOUTS[opts.loadout] || [];
    soak.tours = 0; soak.stages = 0; soak.drafts = 0; soak.finales = 0; soak.victories = 0; soak.deaths = 0; soak.sidearmShots = 0;
    soak.lastTick = -1; soak.stallTicks = 0; soak.done = false; soak.stalled = false;
    soakActive = true;
    newRun();
  }
  function soakAdvance() {
    if (!soakActive) return;
    if (!soak.mortal && mode === PLAYING && world) world.invincible = true; // clearance axis: complete tours
    if (mode === PLAYING && world) {
      if (world.finale && soak._lastMode !== 'finale') { soak.finales += 1; soak._lastMode = 'finale'; }
      // A stage the invincible bot can't clear within the cap is a BLOCKER (the
      // generator's fallback promises clearability — this would be a real regression).
      if (!world.dead && !world.cleared && !world.finale && world.tick > SOAK_STAGE_CAP) {
        debuglog.error('soak: stage not cleared by bot within cap', { locale: run.locale, stage: run.stage, tick: world.tick });
        soakActive = false; soak.done = true; soak.stalled = true; return;
      }
      if (world.cleared && !world.dead) { soak.stages += 1; soak._lastMode = null; onStageCleared(); }
    } else if (mode === TOURMAP) { startRehearsal(); }
    else if (mode === REHEARSAL) { rehearsalWorld = null; beginDraft(); }
    else if (mode === DRAFT) { soak.drafts += 1; finishDraft(0); } // always take card 1
    else if (mode === SCORECARD) {
      if (run.victory) soak.victories += 1; else soak.deaths += 1;
      soak.tours += 1; soak._lastMode = null;
      if (soak.tours >= soak.target) { soakActive = false; soak.done = true; }
      else newRun();
    }
  }

  // ENDLESS PANIC (unlocked by a first victory): the finale with no clock — survive as
  // long as you can. A downing → the scorecard (survival time = the badge).
  function startEndless() {
    run = makeRun(); run.locale = 3; run.stage = "endless"; run.endless = true;
    world = new World({ seed, stage: generateFinale({ endless: true }), ...assistOpts() });
    for (const s of run.souvenirs) world.equip(s);
    effects.items.length = 0; paused = false; saveAcc = 0; cpTimer = 0;
    clearSave(store);
    mode = PLAYING;
  }

  function persistResume() {
    // Persist any state where the player can later press R and continue. Title,
    // scorecard, options and trunk do NOT overwrite the existing slot.
    if (mode === TITLE || mode === SCORECARD || mode === OPTIONS || mode === TRUNK) return;
    const state = { seed, mode, dead: false, world: null, run: run.serialize() };
    if (mode === PLAYING && world) {
      state.dead = !!world.dead;
      state.world = world.serialize();
    }
    if (!saveState(store, state) && store) debuglog.warn('persistResume failed (storage unavailable)');
  }

  function persistBindings() {
    if (!store) return;
    try { store.setItem(BINDS_KEY, JSON.stringify(serializeBindings(bindings))); } catch (_) { /* storage blocked */ }
  }

  function browserGamepads() {
    try {
      // window.getGamepads is the headless/harness override and wins when present
      // (Chromium always exposes navigator.getGamepads, which would starve the hook).
      if (typeof window !== 'undefined' && typeof window.getGamepads === 'function') return window.getGamepads();
      if (typeof navigator !== 'undefined' && navigator.getGamepads) return navigator.getGamepads();
    } catch (_) { /* browser denied access */ }
    return [];
  }

  const keysDown = new Set();
  function simInput() {
    return simIntent(resolveActions({ keys: keysDown, pad: livePad }, bindings));
  }

  function settingsRows() {
    return OPT_ITEMS.map((it) => ({
      label: it.label, type: it.type, min: it.min, max: it.max,
      value: settings[it.key], text: optFmt(it),
      on: it.type === 'toggle' && (it.invert ? !settings[it.key] : settings[it.key]),
    })).concat([{ label: 'Controller', type: 'nav', text: 'REBIND', on: false }]);
  }
  function bindRows() {
    return [
      ...REBIND_ROWS.map(([action, label]) => ({
        action, label,
        type: 'binding',
        text: rebindingAction === action
          ? 'PRESS KEY OR PAD'
          : `${keyBindingLabel(bindings, action)}  ·  ${padBindingLabel(bindings, action)}`,
        on: rebindingAction === action,
      })),
      { label: 'Reset defaults', type: 'nav', text: 'RESTORE', on: false, reset: true },
      { label: 'Back', type: 'nav', text: 'OPTIONS', on: false, back: true },
    ];
  }
  function optAllRows() { return optPane === 'binds' ? bindRows() : settingsRows(); }
  function optCount() { return optAllRows().length; }
  function windowedItems(items, cursor, vis = 8) {
    if (items.length <= vis) return { items, cursor };
    const start = cursor < vis ? 0 : cursor - vis + 1;
    return { items: items.slice(start, start + vis), cursor: cursor - start };
  }
  function optHint() {
    if (rebindingAction) return 'PRESS KEY OR PAD BUTTON  ·  ESC CANCELS';
    if (bindingFeedback) return bindingFeedback;
    if (optPane === 'binds') return 'UP / DOWN CHOOSE  ·  ENTER REBINDS  ·  ESC CANCELS REBIND OR GOES BACK';
    return 'UP / DOWN CHOOSE  ·  LEFT / RIGHT ADJUST  ·  ENTER TOGGLE  ·  ESC BACK';
  }
  // One refusal line for both seams: the control the player just offered, and the
  // action already holding it. Keyboard and pad read identically in the hint row.
  function conflictLine(controlLabel, conflict) {
    const label = REBIND_ROWS.find(([action]) => action === conflict)?.[1] || conflict;
    return `${controlLabel} ALREADY BINDS ${label} - CHOOSE ANOTHER`.toUpperCase();
  }
  function beginRebind(action) {
    bindingFeedback = null;
    rebindingAction = action;
    padInput.reset();
  }
  function optBack() {
    if (rebindingAction) { rebindingAction = null; return; }
    if (optPane === 'binds') { optPane = 'settings'; optCursor = settingsRows().length - 1; return; }
    mode = optReturn;
  }
  function optActivate() {
    if (optPane === 'binds') {
      const row = bindRows()[optCursor];
      if (!row) return;
      if (row.reset) { bindings = cloneBindings(); bindingFeedback = null; persistBindings(); return; }
      if (row.back) { optPane = 'settings'; optCursor = settingsRows().length - 1; return; }
      if (row.action) beginRebind(row.action);
      return;
    }
    if (optCursor === OPT_ITEMS.length) { optPane = 'binds'; optCursor = 0; return; }
    optAdjust(0);
  }

  function pollPad() {
    const nativePad = padSession.read(browserGamepads());
    const pressedPadButton = padSession.edgeButton(nativePad);
    if (rebindingAction && pressedPadButton >= 0) {
      const padConflict = padBindingConflict(bindings, rebindingAction, pressedPadButton);
      if (padConflict) {
        bindingFeedback = conflictLine(padButtonLabel(pressedPadButton), padConflict);
        rebindingAction = null;
        padSession.capture(pressedPadButton);
        livePad = padSession.suppressCaptured(nativePad);
        padInput.reset();
        padSession.tickNotice();
        return;
      }
      setPadBinding(bindings, rebindingAction, [pressedPadButton]);
      bindingFeedback = null;
      rebindingAction = null;
      padSession.capture(pressedPadButton);
      persistBindings();
      livePad = padSession.suppressCaptured(nativePad);
      padInput.reset();
      padSession.tickNotice();
      return;
    }
    livePad = padSession.suppressCaptured(nativePad);
    // Menus honour RESERVED_MENU_CODES even after a rebind (keyboard lockout-recovery).
    // simInput() still calls resolveActions alone, so climb/walk rebinds stay live in play.
    padInput.update(applyReservedMenuCodes(resolveActions({ keys: keysDown, pad: livePad }, bindings), keysDown), ++inputTick);
    padSession.tickNotice();
    if (pressedPadButton >= 0) ensureAudio();
  }

  function inLivePlay() {
    return (mode === PLAYING || mode === REHEARSAL) && !paused && !soakActive;
  }

  function processPadMenus() {
    const p = padInput;
    if (rebindingAction) return;
    if (mode === TITLE) {
      if (confirmNewRun) {
        if (p.pressed(ACTIONS.CONFIRM)) { confirmNewRun = false; startNewRunFromTitle(); return; }
        if (p.pressed(ACTIONS.CANCEL)) { confirmNewRun = false; return; }
        return;
      }
      if (p.pressed(ACTIONS.OPTIONS)) { optReturn = TITLE; optPane = 'settings'; optCursor = 0; mode = OPTIONS; return; }
      if (p.pressed(ACTIONS.SIDEARM)) { mode = TRUNK; trunkCursor = 0; return; }
      if (p.pressed(ACTIONS.TUBA)) {
        if (canResume) { startStage(true); return; }
        if (store && loadFlags(store).endless) { startEndless(); return; }
      }
      if (p.pressed(ACTIONS.CONFIRM)) {
        saveNotice = null;
        if (canResume) { confirmNewRun = true; return; }
        startNewRunFromTitle();
      }
      return;
    }
    if (mode === PLAYING || mode === REHEARSAL) {
      if (p.pressed(ACTIONS.PAUSE) || (paused && p.pressed(ACTIONS.CANCEL))) { paused = !paused; persistResume(); }
      if (mode === PLAYING && paused && p.pressed(ACTIONS.OPTIONS)) { optReturn = PLAYING; optPane = 'settings'; optCursor = 0; mode = OPTIONS; return; }
      if (mode === PLAYING && paused && p.pressed(ACTIONS.QUIT)) { persistResume(); paused = false; mode = TITLE; canResume = resumableKind(store, seed) === 'alive'; return; }
      if (mode === PLAYING && world && world.cleared && !paused && p.pressed(ACTIONS.CONFIRM)) onStageCleared();
      if (mode === REHEARSAL && rehearsalWorld && (p.pressed(ACTIONS.CONFIRM) || p.pressed(ACTIONS.FIRE))) { rehearsalWorld = null; beginDraft(); }
      return;
    }
    if (mode === OPTIONS) {
      const n = optCount();
      if (p.pressed(ACTIONS.UP)) optCursor = (optCursor + n - 1) % n;
      if (p.pressed(ACTIONS.DOWN)) optCursor = (optCursor + 1) % n;
      if (p.pressed(ACTIONS.LEFT)) optAdjust(-1);
      if (p.pressed(ACTIONS.RIGHT)) optAdjust(1);
      if (p.pressed(ACTIONS.CONFIRM) || p.pressed(ACTIONS.FIRE)) optActivate();
      if (p.pressed(ACTIONS.CANCEL) || p.pressed(ACTIONS.PAUSE) || p.pressed(ACTIONS.OPTIONS)) optBack();
      return;
    }
    if (mode === SCORECARD) {
      if (p.pressed(ACTIONS.CONFIRM) || p.pressed(ACTIONS.FIRE)) newRun();
      else if (p.pressed(ACTIONS.CANCEL) || p.pressed(ACTIONS.PAUSE)) { mode = TITLE; canResume = resumableKind(store, seed) === 'alive'; }
      return;
    }
    if (mode === DRAFT) {
      const n = (draftOffer && draftOffer.length) || 3;
      if (p.pressed(ACTIONS.LEFT) || p.pressed(ACTIONS.UP)) draftCursor = Math.max(0, draftCursor - 1);
      if (p.pressed(ACTIONS.RIGHT) || p.pressed(ACTIONS.DOWN)) draftCursor = Math.min(n - 1, draftCursor + 1);
      if (p.pressed(ACTIONS.CONFIRM) || p.pressed(ACTIONS.FIRE)) finishDraft(draftCursor);
      if (p.pressed(ACTIONS.CANCEL) || p.pressed(ACTIONS.PAUSE)) finishDraft(null);
      return;
    }
    if (mode === TOURMAP) {
      if (p.pressed(ACTIONS.CONFIRM) || p.pressed(ACTIONS.FIRE)) startRehearsal();
      return;
    }
    if (mode === TRUNK) {
      const locked = CATALOG.filter((c) => c.implemented && !(store ? ownedSouvenirs(store) : []).includes(c.id));
      if (p.pressed(ACTIONS.DOWN) || p.pressed(ACTIONS.RIGHT)) trunkCursor = Math.min(locked.length - 1, trunkCursor + 1);
      if (p.pressed(ACTIONS.UP) || p.pressed(ACTIONS.LEFT)) trunkCursor = Math.max(0, trunkCursor - 1);
      if ((p.pressed(ACTIONS.CONFIRM) || p.pressed(ACTIONS.FIRE)) && locked[trunkCursor] && unlockSouvenir(store, locked[trunkCursor].id)) { run = makeRun(); trunkCursor = Math.max(0, trunkCursor - 1); }
      if (p.pressed(ACTIONS.CANCEL) || p.pressed(ACTIONS.PAUSE) || p.pressed(ACTIONS.OPTIONS)) mode = TITLE;
    }
  }

  // LOUD error surfacing: any logged error flips the banner.
  let banner = null;
  debuglog.onEntry((e) => { if (e.level === 'error') banner = e; });
  window.addEventListener('error', (ev) => debuglog.error('window error: ' + ev.message,
    ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : null));
  window.addEventListener('unhandledrejection', (ev) => debuglog.error('unhandled rejection',
    String(ev.reason && ev.reason.stack || ev.reason)));

  window.addEventListener('keydown', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    // Prevent the page from scrolling on the game keys.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(ev.key)) ev.preventDefault();
    if (rebindingAction) {
      ev.preventDefault();
      if (isRebindCancelCode(ev.code)) { rebindingAction = null; return; }
      if (keysDown.has(ev.code)) return; // still holding the key that opened the row
      const conflict = keyBindingConflict(bindings, rebindingAction, ev.code);
      if (conflict) {
        bindingFeedback = conflictLine(keyCodeLabel(ev.code), conflict);
        rebindingAction = null;
        padInput.reset();
        return;
      }
      setKeyBinding(bindings, rebindingAction, [ev.code]);
      bindingFeedback = null;
      rebindingAction = null;
      persistBindings();
      return;
    }
    keysDown.add(ev.code);
    ensureAudio(); // the first gesture starts the House Band (browsers require one)
    if (k === 'l') { exportLog(); return; }
    if (k === 'm') { toggleMute(); return; } // master audio mute (split sliders: M6 options)
    // Reboundable Pause/Options/Quit/Confirm/Cancel/arrows are consumed from keysDown
    // by pollPad → processPadMenus (same action-state as the pad). Letter doors, seed
    // digits, and extra recovery letters that are not actions stay here. pollPad runs
    // immediately so a Playwright/OS tap that keyups before the next rAF is not lost.
    if (mode === TITLE && !confirmNewRun) {
      if (k === 'r' && canResume) startStage(true);
      else if (k === 't') { mode = TRUNK; trunkCursor = 0; }
      else if (k === 'e' && store && loadFlags(store).endless) startEndless();
      else if (/^[0-9]$/.test(k) && seedInput.length < 9) seedInput += k;
      else if (k === 'Backspace') seedInput = seedInput.slice(0, -1);
    } else if (mode === OPTIONS && k === 'b') {
      optBack();
    } else if (mode === SCORECARD && k === 'e') {
      mode = TITLE; canResume = resumableKind(store, seed) === 'alive';
    } else if (mode === DRAFT) {
      if (k === '1' || k === '2' || k === '3') finishDraft(Number(k) - 1);
      else if (k === 'd') finishDraft(null);
    } else if (mode === TRUNK && (k === 'b' || k === 't')) {
      mode = TITLE;
    }
    pollPad();
    processPadMenus();
  });
  window.addEventListener('keyup', (ev) => { keysDown.delete(ev.code); });
  // Never leave keys "stuck" held if focus is lost mid-press.
  window.addEventListener('blur', () => { keysDown.clear(); padInput.reset(); });
  window.addEventListener('gamepadconnected', (ev) => { padSession.connect(ev.gamepad); ensureAudio(); });
  window.addEventListener('gamepaddisconnected', (ev) => {
    const result = padSession.disconnect(ev.gamepad, { inPlay: inLivePlay() });
    padInput.reset();
    if (world && world.player) world.player.knockVx = 0;
    if (rehearsalWorld && rehearsalWorld.player) rehearsalWorld.player.knockVx = 0;
    if (result.interruptedPlay) { paused = true; persistResume(); }
  });

  // ----- Integer present of the native buffer (largest scale that fits) ----
  // Continuous VIEW-fit left fractional nearest-neighbour (2.667× at 1280×800) —
  // the operator release look rejected that. Letterbox bars match the page bg.
  let dpr = 1, box = { scale: 1, x: 0, y: 0, w: NATIVE.w, h: NATIVE.h };
  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    box = computeLetterbox(cw, ch);
  }
  function mouseToNative(ev) {
    const r = canvas.getBoundingClientRect();
    return cssToNative(ev.clientX - r.left, ev.clientY - r.top, box);
  }

  // Save when the tab is hidden or the page is unloading (a resume must always exist).
  window.addEventListener('pagehide', persistResume);
  window.addEventListener('visibilitychange', () => { if (document.hidden) persistResume(); });

  // ----- fixed-timestep loop --------------------------------------------------
  let acc = 0, last = 0, saveAcc = 0, deathTimer = 0, cpTimer = 0, cpBanner = null, trunkCursor = 0;
  let txDemo = null;        // the proof harness's frozen-transition staging (see transitionDemo)
  // The OPTIONS screen (M6 accessibility floor). Each row reads + writes `settings`.
  let optCursor = 0, optReturn = TITLE;
  const OPT_ITEMS = [
    { key: 'volume', label: 'Master volume', type: 'scale', step: 0.1, min: 0, max: 1 },
    { key: 'sfx', label: 'SFX level', type: 'scale', step: 0.1, min: 0, max: 1 },
    { key: 'muted', label: 'Mute all', type: 'toggle' },
    { key: 'gameSpeed', label: 'Game speed', type: 'scale', step: 0.1, min: 0.8, max: 1.0 },
    { key: 'composure', label: 'Composure hearts', type: 'count', step: 1, min: 3, max: 5 },
    { key: 'parOff', label: 'Closing bell (par)', type: 'toggle', invert: true },
    { key: 'flashReduce', label: 'Flash-reduce', type: 'toggle' },
    { key: 'reduceMotion', label: 'Reduce motion', type: 'toggle' },
  ];
  function optFmt(it) {
    if (it.type === 'count') return String(settings[it.key]);
    if (it.type === 'toggle') return (it.invert ? !settings[it.key] : settings[it.key]) ? 'ON' : 'OFF';
    return `${Math.round(settings[it.key] * 100)}%`;
  }
  function optAdjust(dir) {
    if (optPane !== 'settings' || rebindingAction) return;
    const it = OPT_ITEMS[optCursor];
    if (!it || it.type === 'nav' || it.type === 'binding') return;
    if (it.type === 'toggle') settings[it.key] = !settings[it.key]; // arrows and Enter all flip
    else { const v = settings[it.key] + dir * it.step; settings[it.key] = Math.max(it.min, Math.min(it.max, it.type === 'count' ? Math.round(v) : +v.toFixed(2))); }
    setSetting(store, it.key, settings[it.key]);
    effects.calm = settings.flashReduce || settings.reduceMotion; // apply live
    applyAudioSettings();
    if (world) world.parOff = settings.parOff; // par-off applies live; composure at next stage
  }
  const MAX_FRAME = 0.25;   // clamp so a stall can't spiral the sim
  const SAVE_EVERY = 1.0;   // persistResume cadence (s of real time) while playing
  function frame(now) {
    const t = now / 1000;
    let dtReal = last ? t - last : 0;
    last = t;
    if (dtReal > MAX_FRAME) dtReal = MAX_FRAME;

    try {
      pollPad();
      processPadMenus();
      if (mode === PLAYING && !paused) {
        if (soakActive) {
          // The soak runs FAST-FORWARD: a big batch of bot-driven ticks per frame (a
          // real-time 60 fps drive of a full tour would take ~20 min). Render still runs.
          for (let k = 0; k < SOAK_BATCH && mode === PLAYING && world && !world.dead && !world.cleared; k++) {
            const bi = world.finale ? finaleSurvivalInput(world) : botInput(world);
            // Exercise the SIDEARM verb (X) on the sidearm build — fire when ammo is up.
            if (world.souvenirs.has('gallerySidearm') && world.sidearmAmmo > 0 && world.tick % 24 === 0) { bi.sidearm = true; soak.sidearmShots += 1; }
            world.step(bi);
          }
        } else {
          acc += dtReal * settings.gameSpeed; // global speed assist (never a gate)
          const input = simInput();
          while (acc >= DT) { world.step(input); acc -= DT; }
        }
        const evs = world.drainEvents();
        for (const ev of evs) {
          if (ev.type === 'denied' && store && !loadFlags(store).deniedHint) {
            setFlag(store, 'deniedHint', true);
            effects.items.push({ kind: 'banner', x: ev.x, y: ev.y - 28, text: 'ONE WIRE. WAIT RETURN', age: 0, life: 2.8 });
          }
        }
        effects.ingest(evs); audioSfx(evs, PLAYING, world);
        if (world.dead) {
          // Stamp the scorecard + DEAD save the moment HP hits zero (before the counter
          // renders — a kill now shows the scorecard on reboot, never a retry).
          if (!run.over) { run.die(world); recordRunOnce(); saveState(store, { seed, dead: true, world: world.serialize(), run: run.serialize() }); }
          deathTimer += dtReal;
          if (deathTimer >= 1.0) { deathTimer = 0; mode = SCORECARD; } // let the culprit read first (already recorded + stamped)
        } else if (world.finaleWon && !run.over) {
          // Surviving the finale = VICTORY: premium payout, unlock Endless, scorecard.
          run.winFinale(world.score);
          if (store) setFlag(store, 'endless', true);
          showScorecard(true);
        } else { saveAcc += dtReal; if (saveAcc >= SAVE_EVERY) { persistResume(); saveAcc = 0; } }
      }
      if (mode === REHEARSAL && rehearsalWorld && !paused) {
        acc += dtReal * settings.gameSpeed; // global speed assist (never a gate)
        const input = simInput();
        while (acc >= DT) { rehearsalWorld.step(input); acc -= DT; }
        const revs = rehearsalWorld.drainEvents();
        effects.ingest(revs); audioSfx(revs, REHEARSAL, rehearsalWorld);
        rehearsalTimer -= dtReal;
        if (rehearsalTimer <= 0) { rehearsalWorld = null; beginDraft(); }
      }
      if (cpTimer > 0) cpTimer -= dtReal;
      // M7 soak: auto-resolve the flow + a STALL detector (the sim tick must advance
      // while a bot is driving a live stage; a frozen tick over ~2 s is a dead control).
      if (soakActive) {
        if (mode === PLAYING && world && !world.dead && !world.cleared) {
          if (world.tick === soak.lastTick) { if (++soak.stallTicks > 120) { debuglog.error('soak STALL — sim tick frozen under bot input', { tick: world.tick, locale: run.locale, stage: run.stage }); soakActive = false; soak.done = true; soak.stalled = true; } }
          else { soak.stallTicks = 0; soak.lastTick = world.tick; }
        }
        soakAdvance();
      }
      effects.update(dtReal);
      updateSlide(dtReal);   // the flow transition runs on real time and gates nothing
      // The House Band follows the screen: each mode gets its register (title/stage/
      // waltz/panic), and the galop's heat tracks the finale clock / past-par pressure.
      audioUpdate(mode, mode === REHEARSAL ? rehearsalWorld : (paused ? null : world));
      render();
    } catch (e) {
      debuglog.error('loop failed', String(e && e.stack || e));
      renderBannerOnly();
    }
    requestAnimationFrame(frame);
  }

  // ----- the SLIDE CHANGE (stage/locale flow transitions) ---------------------
  // A scene change is detected here rather than wired into every flow function, so
  // no path can forget one. The transition NEVER gates anything: the incoming screen
  // is painted and live on the very frame the change happens, and the outgoing frame
  // merely dissolves off the top of it. See render/transition.js.
  let lastSceneKey = null, skipSlide = false;
  function sceneKey() {
    if (mode === PLAYING) return `P|${run.locale}|${run.stage}|${paused ? 'x' : ''}`;
    if (mode === REHEARSAL) return 'R';
    return String(mode);
  }
  function slideKind(prev, next) {
    // The tour reaching a NEW PLACE is the signature moment and gets the longer,
    // scallop-edged plate; everything else gets the quick one.
    if (next === TOURMAP || prev === TOURMAP) return 'locale';
    if (prev[0] === 'P' && next[0] === 'P' && prev.split('|')[1] !== next.split('|')[1]) return 'locale';
    return 'stage';
  }
  // The proof harness stages screens directly through window.POPINJAY, which is not a
  // player action — a staged jump must not leave a half-dissolved frame in a capture.
  function suppressSlide() { resetSlide(); skipSlide = true; }

  function render() {
    const p = nativeScreen().painter;
    const key = sceneKey();
    if (skipSlide) { skipSlide = false; }
    else if (lastSceneKey !== null && key !== lastSceneKey && !soakActive) {
      beginSlide(p, slideKind(lastSceneKey, key), settings.reduceMotion);
    }
    lastSceneKey = key;

    // Body/HUD/menu copy is queued for the display-res text layer (print-class
    // carve-out); wordmark/t5big stays in the native art buffer. skipNative keeps
    // the upscaled frame from carrying a soft double of the same glyphs.
    beginTextLayer({ skipNative: true });

    if (mode === TITLE) {
      drawTitle(ctx, { w: VIEW.w, h: VIEW.h, seed: seedInput ? (parseInt(seedInput, 10) || 0) : seed, build: BUILD });
      if (confirmNewRun) {
        // The confirm dialog occludes the title controls; discard their queued type and
        // darken the background so the question reads cleanly.
        takeTextLayer();
        beginTextLayer({ skipNative: true });
        scrim(p, 0.66);
        drawConfirmNewRun(p);
      } else {
        drawTitleExtras(p, titleExtrasData());
        if (canResume) drawResumeHint(p);
      }
      if (saveNotice) drawSaveNotice(p, saveNotice);
    } else if (mode === SCORECARD) {
      drawScorecard(p, scorecardData());
    } else if (mode === DRAFT) {
      drawDraft(p, {
        offer: draftOffer,
        held: run.souvenirs.length ? String(run.souvenirs.length) : 'NONE',
        cursor: draftCursor,
        pad: padSession.isConnected(),
      });
    } else if (mode === TOURMAP) {
      drawTourMap(p, { locale: run.locale, names: LOCALE_NAMES });
    } else if (mode === TRUNK) {
      drawTrunk(p, trunkData());
    } else if (mode === OPTIONS) {
      const vis = windowedItems(optAllRows(), optCursor, 8);
      drawOptions(p, { items: vis.items, cursor: vis.cursor, hint: optHint() });
    } else if (mode === REHEARSAL && rehearsalWorld) {
      drawGame(ctx, rehearsalWorld, { w: VIEW.w, h: VIEW.h }, effects);
      drawRehearsal(p, Math.max(0, Math.ceil(rehearsalTimer)));
      if (paused) drawPaused(p, pauseOverlay());
    } else {
      drawGame(ctx, world, { w: VIEW.w, h: VIEW.h }, effects);
      drawHUD(ctx, world, { w: VIEW.w, h: VIEW.h });
      if (world.dead) drawDowned(p);
      else if (world.cleared) drawClearedRibbon(p, { score: world.score, timeBonus: world.timeBonus });
      if (cpTimer > 0 && cpBanner) drawCenterpiece(p, cpBanner, Math.min(1, cpTimer / 0.6));
      if (paused) drawPaused(p, pauseOverlay());
    }
    if (padSession.getNotice()) drawControllerNotice(p, padSession.getNotice());
    // The whole frame — world, HUD and overlays — is ONE picture in ONE buffer, so
    // the transition composites over the finished thing and it is presented once.
    if (slideActive()) paintSlide(p);
    const textQ = takeTextLayer();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1c1916';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.imageSmoothingEnabled = false;
    presentFrame(ctx, box.w, box.h, box.x, box.y);
    // Display-res body text at the integer present cell (print-class carve-out).
    paintTextLayer(ctx, textQ, box, box.scale);
    // The frozen-transition proof: once a CLEAN stage frame is sitting on the buffer
    // (the arming counter waits out the staged jump, which is suppressed, so nothing
    // is dissolving yet), snapshot it, move the tour on, and hold the plate.
    if (txDemo && --txDemo.armed <= 0) {
      const ph = txDemo.phase; txDemo = null;
      beginSlide(p, 'locale', false); holdSlide(ph);
      run.locale = 2; run.stage = 1; mode = TOURMAP; skipSlide = true;
    }
    if (banner) drawErrorBanner(ctx, canvas.width / dpr, banner.msg);
    window.__popinjayReady = true; // capture-harness readiness signal
  }

  function renderBannerOnly() {
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (banner) drawErrorBanner(ctx, canvas.width / dpr, banner.msg);
      window.__popinjayReady = true;
    } catch (_) { /* never throw out of the failure path */ }
  }

  // ----- overlay DATA adapters -------------------------------------------------
  // Every overlay surface is painted by src/render/overlays.js into the SAME native
  // buffer as the world, the HUD and the title card, so there is no vector text over
  // a pixel frame anywhere in the game. What is left here is plumbing: the session
  // state each surface needs, shaped into plain data, so the render layer stays pure
  // and headlessly testable and never reaches into a store, a Run or the settings.

  function titleExtrasData() {
    return {
      seed, seedInput,
      bank: store ? ticketBank(store) : 0,
      endless: !!(store && loadFlags(store).endless),
      scores: store ? loadScores(store) : [],
      runs: store ? loadRuns(store) : [],
    };
  }

  function pauseOverlay() {
    if (!padSession.isConnected()) return undefined;
    return {
      heading: 'CONTROLS · KEY > PAD',
      rows: pauseControlLines(bindings).map((line) => {
        const i = line.indexOf(':');
        return [line.slice(0, i), line.slice(i + 1)];
      }),
      footer: 'START RESUME  ·  BACK OPTIONS  ·  LB QUIT',
    };
  }

  function trunkData() {
    const owned = store ? ownedSouvenirs(store) : [];
    const implemented = CATALOG.filter((c) => c.implemented);
    const locked = implemented.filter((c) => !owned.includes(c.id));
    return {
      owned: implemented.filter((c) => owned.includes(c.id)),
      locked,
      bank: store ? ticketBank(store) : 0,
      cursor: Math.max(0, Math.min(locked.length - 1, trunkCursor)),
      cost: UNLOCK_COST,
    };
  }

  // The next trunk unlock — the scorecard's one-more-run hook.
  function unlockData() {
    if (!store) return null;
    const owned = ownedSouvenirs(store);
    const next = CATALOG.find((c) => c.implemented && !owned.includes(c.id));
    if (!next) return { complete: true };
    return { name: next.name, bank: ticketBank(store), cost: UNLOCK_COST };
  }

  // Souvenirs reach the prize counter by their DISPLAY names, never a raw catalogue
  // id — poster type, not code.
  function scorecardData() {
    const sc = run.scorecard;
    return { sc, souvenirs: sc ? sc.souvenirs.map((id) => SOUV_NAME[id] || id) : [], unlock: unlockData() };
  }

  window.addEventListener('resize', resize);

  // Expose a small debug surface (the export path failures land in) + a capture hook
  // to start the stage headlessly from the proof harness.
  window.POPINJAY = {
    debuglog, exportLog, version: BUILD,
    startStage, get mode() { return mode; },
    get paused() { return paused; },
    get souvenirs() { return run && run.souvenirs ? run.souvenirs.slice() : []; },
    get ready() { return window.__popinjayReady === true; },
    // Integer present letterbox (native buffer → window). Capture/harness + input remap.
    get present() { return { scale: box.scale, x: box.x, y: box.y, w: box.w, h: box.h, native: { w: NATIVE.w, h: NATIVE.h } }; },
    mouseToNative,
    // Jump to a specific generated stage (proof harness / debugging).
    startStageAt(locale, stage) { run.locale = locale; run.stage = stage; startStage(false); },
    // Force the closing-bell state (low par) so the telegraph + red par dial are
    // capturable without waiting a real minute (proof harness).
    dripDemo(locale = 2, stage = 2) { run.locale = locale; run.stage = stage; startStage(false); world.parTicks = 30; },
    // Scatter one of every drop silhouette + arm the effects for the proof harness.
    dropsDemo(locale = 1, stage = 2) {
      run.locale = locale; run.stage = stage; startStage(false);
      const gTop = world.stage.floorBelow(0, 0).y;
      const kinds = ['medallion', 'slow', 'freeze', 'shield', 'dynamite'];
      kinds.forEach((k, i) => world.drops.push(new Drop({ kind: k, x: 260 + i * 190, y: gTop - 180 - i * 4, id: 100 + i })));
      world.shield = true; // one badge only — proves slot below valance (not two-effect mask)
    },
    // Show the tour-map interstitial (advanced to locale 2) for the proof harness.
    tourmapDemo() { run = new Run({ seed }); run.locale = 2; run.stage = 1; mode = TOURMAP; },
    // Jump straight into the Panic Finale for the proof harness.
    finaleDemo() { run = new Run({ seed }); run.locale = 3; run.stage = 5; run.finaleReady = true; startStage(false); },
    // Stage a between-stage souvenir draft for the proof harness.
    draftDemo() { run = new Run({ seed }); draftOffer = run.offerDraft(); draftCursor = 0; mode = DRAFT; },
    // Stage a death scorecard for the proof harness (a mid-run downing).
    scorecardDemo() {
      run = new Run({ seed });
      run.souvenirs = ['secondBarrel', 'quickSpool'];
      run.clearStage({ score: 4200, pops: 38, bestChain: 4 }); // 1-1 clear (banks a ticket)
      run.clearStage({ score: 1600, pops: 15, bestChain: 3 }); // 1-2 clear
      run.die({ score: 900, pops: 8, bestChain: 2, deathCulpritCls: 'penny' });
      mode = SCORECARD;
    },
    // Equip the weapon-class souvenirs + fire them for the proof harness.
    souvenirDemo(locale = 2, stage = 3) {
      run.locale = locale; run.stage = stage; startStage(false);
      world.equip('secondBarrel').equip('quickSpool').equip('gallerySidearm').equip('skyAnchor');
      world.step({ fire: true }); world.step({ fire: false }); world.step({ fire: true }); // two wires
      world.step({ sidearm: true }); // a bullet
    },
    // Light a dynamite fuse for the proof harness (the telegraphed cascade).
    dynamiteDemo(locale = 1, stage = 3) { run.locale = locale; run.stage = stage; startStage(false); world.dynamiteFuse = 42; },
    // Stage a composure hit for the proof harness (culprit outline + i-frame pulse).
    hitDemo(locale = 1, stage = 2) {
      run.locale = locale; run.stage = stage; startStage(false);
      const gTop = world.stage.floorBelow(0, 0).y;
      world.balloons.push(new Balloon({ cls: 'grand', x: world.player.x, floorY: gTop, y: world.player.feetY - 20, vy: 0, id: 9001 }));
    },
    // CHAIN FANFARE staging for the proof harness: a stacked column of pennies popped
    // in quick succession, building the chain so the escalated bursts + confetti + ×N
    // callouts are captured (signature law #3 — splits are the loudest moment).
    chainDemo(locale = 1, stage = 1) {
      startStage(false);
      world.balloons = []; world._nextBalloonId = 1; world.chain = 0; world.chainExpireTick = 0;
      const gTop = world.stage.floorBelow(0, 0).y;
      // Pop a spread of balloons in one tick via the real pop pathway — the chain
      // builds 1→5 and each escalated burst + confetti + ×N callout is captured.
      const spots = [[360, 430, 'parade'], [520, 350, 'fair'], [700, 450, 'penny'], [860, 370, 'fair'], [1000, 430, 'penny']];
      spots.forEach(([x, y, cls], i) => {
        const b = new Balloon({ cls, x, floorY: gTop, y, vy: 0, id: 500 + i });
        world.balloons.push(b); world._resolveHit(b);
      });
    },
    // FULL-VOCABULARY frame for the colorblind sim: one of every balloon class + a
    // weighted GORE + every drop silhouette, so a CVD transform can confirm each reads
    // by SHAPE, never colour alone (aesthetic law / accessibility floor).
    paletteDemo() {
      run.locale = 3; run.stage = 1; startStage(false);
      world.balloons = []; world._nextBalloonId = 1;
      const gTop = world.stage.floorBelow(0, 0).y;
      const row = [['grand', 200], ['parade', 380], ['fair', 540], ['penny', 680]];
      row.forEach(([cls, x], i) => world.balloons.push(new Balloon({ cls, x, floorY: gTop, y: 300, vy: 0, id: i + 1 })));
      world.balloons.push(new Balloon({ cls: 'grand', x: 860, floorY: gTop, y: 300, vy: 0, id: 9, weighted: true })); // a gore
      const kinds = ['medallion', 'slow', 'freeze', 'shield', 'dynamite'];
      kinds.forEach((k, i) => world.drops.push(new Drop({ kind: k, x: 260 + i * 190, y: gTop - 150, id: 100 + i })));
      world.timeSlow = 240; world.shield = true;
    },
    // M7 ACCEPTANCE SOAK: drive the shipped stack through N full bot tours. The harness
    // polls soakState() for completion + counters, watching the error traps meanwhile.
    soakStart(opts) { soakStart(opts || {}); },
    soakState() { return { active: soakActive, mode, ...soak }; },
    get controller() {
      return {
        connected: padSession.isConnected(),
        profile: padSession.getActive() && padSession.getActive().profile,
        notice: padSession.getNotice(),
        rebinding: rebindingAction,
        bindingFeedback,
        optPane,
        optCursor,
        bindings,
        pauseControls: pauseOverlay(),
      };
    },
    // DEAD-CONTROL probe: the live player/wire/tick state so the acceptance harness can
    // assert position + fire deltas after REAL keyboard bursts (verification bar).
    probe() { return { mode, playerX: world ? world.player.x : null, feetY: world ? world.player.feetY : null, wires: world ? world.wires.length : 0, balloons: world ? world.balloons.length : 0, tick: world ? world.tick : 0, hearts: world ? world.hearts : 0 }; },
    // Show the OPTIONS screen for the proof harness (a mid-list selection).
    optionsDemo() { optReturn = TITLE; optPane = 'settings'; optCursor = 3; mode = OPTIONS; },
    // Show the PAUSE menu (controls + help on one screen) for the proof harness.
    pauseDemo() { run.locale = 1; run.stage = 1; startStage(false); paused = true; },
    // Force a fatal hit (verification): a pinned penny on the player, 1 heart left → the
    // loop downs the player → the scorecard flow records the run (best-score/bank/history).
    killDemo() {
      run.locale = 1; run.stage = 1; startStage(false); world.hearts = 1;
      const g = world.stage.floorBelow(0, 0).y;
      const b = new Balloon({ cls: 'penny', x: world.player.x, floorY: g, y: world.player.feetY - 8, vy: 0, id: 9500 });
      b.hspeed = 0; world.balloons.push(b);
    },
    // WORST-CASE PHOTOSENSITIVITY BURST staging (composite analysis harness): the
    // loudest possible frame churn — a dynamite cascade + a big multi-pop chain + the
    // galop's closing-bell state, all at once. Idempotent: callable repeatedly to
    // SUSTAIN the burst so the flash-rate/flash-area analysis sees the true worst case.
    photoBurst() {
      if (mode !== PLAYING || !world) { run.locale = 3; run.stage = 2; startStage(false); }
      world.parTicks = 1;              // instantly past par → closing-bell galop visuals
      world.dynamiteFuse = 3;          // a cascade about to blow (the boom ring)
      world.chain = 0; world.chainExpireTick = 0;
      const gTop = world.stage.floorBelow(0, 0).y;
      const cls = ['grand', 'parade', 'fair', 'penny'];
      for (let i = 0; i < 12; i++) {   // a spread of pops → chained bursts + confetti everywhere
        const b = new Balloon({ cls: cls[i % 4], x: 120 + i * 90, y: 180 + (i % 5) * 70, floorY: gTop, vy: 0, id: 700 + i });
        world.balloons.push(b); world._resolveHit(b);
      }
    },
    // ---- overlay staging for the proof harness (the M8 surfaces) ----
    // THE TRUNK with a mid-list selection, so the description card is populated.
    trunkDemo() { mode = TRUNK; trunkCursor = 4; },
    // A cleared stage: empty the roster and let the sim's own clear path fire, so the
    // ribbon shows a REAL score and time bonus rather than staged numbers.
    clearedDemo(locale = 1, stage = 2) {
      run.locale = locale; run.stage = stage; startStage(false);
      world.balloons = [];
      world.step({});
    },
    // A CENTERPIECE announcement — each locale's 4th stage is the quasi-boss.
    centerpieceDemo(locale = 1) { run.locale = locale; run.stage = 4; startStage(false); },
    // The rehearsal burst (the taught-first finale preview), banner and all.
    rehearsalDemo() { run = new Run({ seed }); run.locale = 2; run.stage = 1; startRehearsal(); },
    // The title card's furniture with a populated record: a banked run history, a
    // ticket bank, the endless door open, a seed mid-type and a resumable save.
    titleExtrasDemo() {
      if (store) {
        recordScore(store, { score: 918200, seed: 1, victory: true });
        recordScore(store, { score: 44120, seed: 7 });
        recordScore(store, { score: 31000, seed: 22 });
        recordRun(store, { score: 918200, seed: 1, victory: true });
        recordRun(store, { score: 8100, seed: 1, locale: 2, stage: 3, culpritCls: 'penny' });
        recordRun(store, { score: 5400, seed: 1, locale: 1, stage: 2 });
        bankTickets(store, 14);
        setFlag(store, 'endless', true);
      }
      seedInput = '4077'; canResume = true; mode = TITLE;
    },
    // The LOUD-failure banner. It sets the banner DIRECTLY rather than logging a real
    // error, because the capture harness fails any proof whose debug log carries one —
    // this proves the banner's ART, not the error path the suite already covers.
    bannerDemo(msg) { banner = { level: 'error', tick: 0, msg: msg || "render failed: can't read 'x' of undefined" }; },
    // The SLIDE CHANGE, frozen mid-plate for the proof harness. A transition lasts a
    // fifth of a second, so a capture that raced it would be a different frame every
    // run; this stages a real locale change and HOLDS it at a fixed phase, so the
    // proof is of the transition itself and is reproducible.
    transitionDemo(phase = 0.45) {
      run = new Run({ seed }); run.locale = 1; run.stage = 1; startStage(false);
      txDemo = { phase: Math.max(0, Math.min(1, phase)), armed: 2 };
    },
    // Deterministic FEEL-GATE staging for the proof harness: a Grand parked in the
    // player's column, a wire fired at it — a real capture of the signature verbs.
    feelGate() {
      startStage(false);
      clearSave(store);
      world.balloons = [];
      world._nextBalloonId = 1;
      const gTop = world.stage.floorBelow(0, 0).y;
      world.balloons.push(new Balloon({ cls: 'grand', x: world.player.x, floorY: gTop, y: 190, vy: 0, id: 1 }));
      world.step({ fire: true }); // launch the wire; the loop climbs it toward the Grand
    },
  };

  // Every debug/proof hook is a STAGED jump, not a player action, so none of them may
  // leave a half-dissolved plate in a capture. Wrapping the surface here (rather than
  // remembering it in fifteen places) means a hook added later is covered by default.
  // transitionDemo is wrapped too, and needs to be: its own jump to the stage must NOT
  // dissolve, or the plate it later snapshots would be a mid-dissolve composite rather
  // than a clean frame. (It was, on the first capture — the proof showed the title card
  // bleeding through the tour map.) It arms itself instead, and fires from render().
  for (const k of Object.keys(window.POPINJAY)) {
    const d = Object.getOwnPropertyDescriptor(window.POPINJAY, k);
    if (!d || typeof d.value !== 'function' || !d.writable) continue;
    const fn = d.value;
    window.POPINJAY[k] = (...args) => { const r = fn(...args); suppressSlide(); return r; };
  }

  function exportLog() {
    const text = debuglog.export() || '(debug log empty)';
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `popinjay-debug-${BUILD}.txt`;
      a.click();
    } catch (_) { console.log(text); }
  }

  resize();
  requestAnimationFrame(frame);
}

async function launchPopinjay() {
  try { await registerTypography(); }
  catch (e) { debuglog.error('period typography registration failed', String(e && e.stack || e)); }
  boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', launchPopinjay);
} else {
  launchPopinjay();
}
