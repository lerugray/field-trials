// SHOELEATHER — headless game core.
//
// This is the engine loop with NO canvas and NO DOM: it wires the scene graph, sweep
// tracker, focus ring, save manager and debug log into one observable object. The
// browser layer (main.js) drives it with input events and renders off its state and
// emitted events; `node --test` drives it directly. Keeping the core headless is what
// lets the whole engine be tested and, later, lets the SOLVER walk real case data.
//
// Laws embodied here:
//  - INPUT LAW: focus moves by keyboard (next/prev) or mouse (at), never a timer.
//  - SWEEP LAW: moving focus onto a hotspot brushes it (discovery), emitting 'sweep'.
//  - SAVE LAW: auto-checkpoint on every scene boundary; the atomic-scene gate refuses
//    saves during interrogations / the board (mode 'atomic'); restart always offered.
//  - LOUD-FAILURE LAW: a bad transition logs an error, emits 'error', and refuses to
//    move — never a silent "nothing happens".

import { FocusRing } from './focus.js';
import { SweepTracker } from './sweep.js';
import { Notebook } from '../case/notebook.js';
import { SuspectState } from '../people/suspect-state.js';
import { CaseClock } from '../people/case-clock.js';
import { DialogueRunner } from '../people/dialogue.js';
import { Interrogation } from '../people/interrogation.js';
import { AccusationBoard } from '../case/board.js';
import { PrologueRunner } from '../case/prologue.js';

// Turns a suspect must spend un-visited before they relax (the visit-count timer).
export const RELAX_THRESHOLD = 3;

export const MODES = Object.freeze({ EXPLORE: 'explore', ATOMIC: 'atomic' });
export const AUTOSAVE_SLOT = 'auto';

export class Engine {
  constructor({ graph, log, save, sweep = null, startScene = null, notebook = null, caseData = null }) {
    if (!graph) throw new TypeError('engine needs a scene graph');
    if (!log) throw new TypeError('engine needs a debug log');
    if (!save) throw new TypeError('engine needs a save manager');
    this.graph = graph;
    this.log = log;
    this.save = save;
    this.sweep = sweep || new SweepTracker();
    this.startScene = startScene;
    // M1 evidence spine: a case's typed facts/statements, and the notebook they log
    // into. Optional so the M0 engine-harness world (no case data) still runs.
    this.caseData = caseData;
    this.notebook = notebook || new Notebook();
    // M2 people: per-suspect persistent state, the shared counter-move clock, and the
    // active interrogation session (null unless mid-interview, an ATOMIC scene).
    this.suspects = new Map();
    this.clock = new CaseClock({ counterMoves: caseData ? caseData.counterMoves : [] });
    this.interrogation = null;
    this.board = null;        // active accusation board (an atomic scene)
    this.solved = false;      // set when the exact chain closes the case
    this.prologueRunner = null; // active play-as-murderer prologue
    this.mode = MODES.EXPLORE;
    this.tick = 0;
    this.sceneId = null;
    this.focus = null;
    this._listeners = new Map();
  }

  // Get or lazily create a suspect's persistent state.
  suspectState(id) {
    const key = String(id);
    let s = this.suspects.get(key);
    if (!s) {
      const def = this.caseData && this.caseData.suspect(key);
      s = new SuspectState({ maxTolerance: (def && def.maxTolerance) || 3 });
      this.suspects.set(key, s);
    }
    return s;
  }

  // --- events -------------------------------------------------------------
  on(event, fn) {
    let set = this._listeners.get(event);
    if (!set) { set = new Set(); this._listeners.set(event, set); }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); }
      catch (err) { this.log.capture('engine.listener', err, { event }); }
    }
  }

  // --- lifecycle ----------------------------------------------------------
  start(sceneId = this.startScene) {
    if (!sceneId) throw new TypeError('start needs a scene id');
    if (!this.graph.has(sceneId)) throw new Error(`start scene "${sceneId}" does not exist`);
    this.startScene = sceneId;
    this._transition(sceneId, { checkpoint: true, reason: 'start' });
    return this;
  }

  get scene() { return this.sceneId ? this.graph.get(this.sceneId) : null; }

  // --- prologue (play as the murderer; forced-linear, atomic) -------------
  startPrologue() {
    if (!this.caseData || !this.caseData.prologue) return false;
    this.setMode(MODES.ATOMIC);
    this.prologueRunner = new PrologueRunner(this.caseData.prologue, { onEvent: (e) => this.emit('prologue', e) });
    this.log.info('engine.prologue', 'prologue begin', { id: this.caseData.prologue.id });
    this.emit('prologue-begin', { beat: this.prologueRunner.current() });
    return true;
  }

  prologueAdvance() {
    if (!this.prologueRunner) return null;
    const next = this.prologueRunner.advance();
    if (next === null) this.endPrologue();
    return next;
  }

  endPrologue() {
    this.prologueRunner = null;
    this.setMode(MODES.EXPLORE);
    this.emit('prologue-end', {});
    this.start(); // now enter the investigation start scene (+ checkpoint)
  }

  // Enter a scene through normal play (scene boundary → auto-checkpoint in explore).
  // Returns true on success; on a missing target it stays put and fails LOUDLY.
  enter(sceneId) {
    if (!this.graph.has(sceneId)) {
      this.log.error('engine.enter', `no such scene "${sceneId}"`, { from: this.sceneId });
      this.emit('error', { where: 'enter', message: `no such scene "${sceneId}"` });
      return false;
    }
    this._transition(sceneId, { checkpoint: this.mode === MODES.EXPLORE, reason: 'enter' });
    return true;
  }

  _transition(sceneId, { checkpoint, reason }) {
    this.sceneId = String(sceneId);
    this.focus = new FocusRing(this.scene);
    this.tick++;
    this.log.info('engine.scene', `enter ${this.sceneId}`, { reason, tick: this.tick });
    this.emit('enter', { scene: this.scene, reason });
    if (checkpoint) this.checkpoint();
  }

  // --- focus + sweep ------------------------------------------------------
  _land(hotspot) {
    if (hotspot && this.sweep.brush(this.sceneId, hotspot.id)) {
      this.log.trace('engine.sweep', `brushed ${hotspot.id}`, { scene: this.sceneId });
      this.emit('sweep', { hotspot, coverage: this.sweep.coverage(this.scene) });
    }
    this.emit('focus', { hotspot, cursorKind: this.focus.cursorKind() });
    return hotspot;
  }

  focusNext() { return this._land(this.focus.next()); }
  focusPrev() { return this._land(this.focus.prev()); }
  focusAt(x, y) { return this._land(this.focus.focusAt(x, y)); }

  cursorKind() { return this.focus ? this.focus.cursorKind() : 'default'; }

  // Act on the focused hotspot. Exits transition; other verbs emit 'interact' for
  // higher layers (facts/dialogue arrive in M1/M2). Returns a small result descriptor.
  select() {
    const h = this.focus ? this.focus.focused() : null;
    if (!h) return { type: 'none' };
    const exitTo = this.scene.exitVia(h.id);
    if (exitTo) {
      const ok = this.enter(exitTo);
      return { type: 'exit', to: exitTo, ok };
    }
    // A hotspot bound to a suspect opens an interrogation (an atomic scene).
    if (h.meta && h.meta.suspect && this.caseData && this.caseData.dialogues[h.meta.suspect]) {
      const ok = this.talkTo(h.meta.suspect);
      return { type: 'interrogation', suspect: h.meta.suspect, ok };
    }
    // A hotspot bound to the board opens the GOTCHA (an atomic scene).
    if (h.meta && h.meta.board) {
      const ok = this.openBoard();
      return { type: 'board', ok };
    }
    // Evidence acquisition: a hotspot bound to a fact/statement logs it on interact.
    // This is the VISIBLE moment of fact acquisition (action-legibility law).
    const acquired = this._acquire(h);
    this.log.info('engine.interact', `${h.kind} ${h.id}`, { scene: this.sceneId });
    this.emit('interact', { hotspot: h, kind: h.kind, acquired });
    return { type: 'interact', hotspot: h, kind: h.kind, acquired };
  }

  // Log any fact/statement a hotspot reveals. Returns a descriptor of what was newly
  // acquired (null if nothing, or already known).
  _acquire(h) {
    if (!h.meta || !this.caseData) return null;
    const factIds = h.meta.facts || (h.meta.fact ? [h.meta.fact] : []);
    const acquiredFacts = [];
    for (const factId of factIds) {
      const fact = this.caseData.fact(factId);
      if (!fact) { this.log.error('engine.acquire', `hotspot ${h.id} names unknown fact "${factId}"`); continue; }
      const isNew = !this.notebook.has(fact.id);
      this.notebook.logFact(fact, { scene: this.sceneId });
      if (isNew) { this.emit('fact-logged', { fact, scene: this.sceneId }); acquiredFacts.push(fact.id); }
    }
    if (acquiredFacts.length) return { kind: 'fact', id: acquiredFacts[0], ids: acquiredFacts };
    if (h.meta.statement) {
      const st = this.caseData.statement(h.meta.statement);
      if (!st) { this.log.error('engine.acquire', `hotspot ${h.id} names unknown statement "${h.meta.statement}"`); return null; }
      const isNew = !this.notebook.has(st.id);
      this.notebook.logStatement(st, { scene: this.sceneId });
      if (isNew) { this.emit('statement-logged', { statement: st, scene: this.sceneId }); return { kind: 'statement', id: st.id }; }
    }
    return null;
  }

  // --- interrogation (atomic scene) ---------------------------------------
  // Begin an interview: relax the suspect if due (arming the afterthought), start a
  // visit, enter ATOMIC mode (no mid-scene save), and open the dialogue + challenge
  // controllers. Returns false if the suspect has no dialogue.
  talkTo(suspectId) {
    const tree = this.caseData && this.caseData.dialogues[suspectId];
    if (!tree) { this.log.error('engine.talkTo', `no dialogue for "${suspectId}"`); return false; }
    const state = this.suspectState(suspectId);
    const recovered = state.relaxIfDue(this.tick, RELAX_THRESHOLD);
    if (recovered > 0) { state.armAfterthought(); this.emit('afterthought', { suspect: suspectId }); }

    this.setMode(MODES.ATOMIC);
    const runner = new DialogueRunner(tree, state, {
      notebook: this.notebook, caseData: this.caseData,
      onEvent: (e) => {
        if (e.type === 'statement') this.emit('statement-logged', { statement: e.statement, scene: 'interview' });
        this.emit('dialogue', e);
      },
    });
    const interro = new Interrogation({
      suspectId, statements: this.caseData.statements,
      suspectState: state, notebook: this.notebook, clock: this.clock, caseData: this.caseData,
      onEvent: (e) => this.emit('challenge', e),
    });
    this.interrogation = { suspectId, runner, interro, state };
    runner.enter();
    this.log.info('engine.talkTo', `interview ${suspectId}`, { visit: state.visitCount, afterthought: state.afterthoughtArmed });
    this.emit('interrogation-begin', { suspect: suspectId, node: runner.current(), posture: state.posture() });
    return true;
  }

  dialogueChoose(optionId) {
    if (!this.interrogation) return null;
    const node = this.interrogation.runner.choose(optionId);
    if (node === null) this.endInterrogation();
    return node;
  }

  challenge(statementId, factId) {
    if (!this.interrogation) return { type: 'invalid', reason: 'not in an interview' };
    return this.interrogation.interro.challenge(statementId, factId);
  }

  // Leave the interview: start the relaxation timer, disarm the afterthought, return to
  // EXPLORE, and auto-checkpoint (a scene boundary).
  endInterrogation() {
    if (!this.interrogation) return;
    const { suspectId, state } = this.interrogation;
    state.leave(this.tick);
    state.disarmAfterthought();
    this.interrogation = null;
    this.setMode(MODES.EXPLORE);
    this.emit('interrogation-end', { suspect: suspectId });
    this.checkpoint();
  }

  // --- accusation board (atomic scene) ------------------------------------
  // Open the GOTCHA. Requires case data. Enters ATOMIC mode (no mid-board save).
  openBoard() {
    if (!this.caseData) { this.log.error('engine.openBoard', 'no case data'); return false; }
    this.setMode(MODES.ATOMIC);
    this.board = new AccusationBoard({
      caseData: this.caseData, notebook: this.notebook, clock: this.clock,
      onEvent: (e) => this.emit('board', e),
    });
    this.emit('board-open', {});
    return true;
  }

  boardSet(slot, id) { return this.board ? this.board.set(slot, id) : null; }

  // Submit the board. On solve, the case closes and we emit case-solved (the ending is
  // always a scene). On deflection, the clock has advanced; the player stays at the board.
  boardSubmit(trap = false) {
    if (!this.board) return { type: 'invalid', reason: 'no board open' };
    const res = this.board.submit(trap);
    if (res.type === 'solved') {
      this.solved = true;
      this.log.info('engine.board', 'case solved', { chain: res.chain, variant: res.variant });
      this.emit('case-solved', { chain: res.chain, variant: res.variant });
    }
    return res;
  }

  // Leave the board without solving (return to exploring; auto-checkpoint).
  closeBoard() {
    if (!this.board) return;
    this.board = null;
    this.setMode(MODES.EXPLORE);
    this.emit('board-close', {});
    if (!this.solved) this.checkpoint();
  }

  // --- mode gate ----------------------------------------------------------
  setMode(mode) {
    if (mode !== MODES.EXPLORE && mode !== MODES.ATOMIC) {
      throw new RangeError(`unknown engine mode "${mode}"`);
    }
    this.mode = mode;
    this.emit('mode', { mode });
    return this;
  }

  canCheckpoint() { return this.mode === MODES.EXPLORE; }

  // --- persistence --------------------------------------------------------
  snapshot() {
    const suspects = {};
    for (const [id, s] of this.suspects) suspects[id] = s.toJSON();
    return {
      version: 1, scene: this.sceneId, tick: this.tick,
      sweep: this.sweep.toJSON(),
      notebook: this.notebook ? this.notebook.toJSON() : null,
      suspects, clock: this.clock.toJSON(),
    };
  }

  restore(snap) {
    if (!snap || !this.graph.has(snap.scene)) {
      this.log.error('engine.restore', 'snapshot references unknown scene', { snap });
      this.emit('error', { where: 'restore', message: 'snapshot references unknown scene' });
      return false;
    }
    this.sweep = SweepTracker.fromJSON(snap.sweep);
    if (snap.notebook && this.caseData) this.notebook = Notebook.fromJSON(snap.notebook, this.caseData);
    this.suspects = new Map();
    for (const [id, obj] of Object.entries(snap.suspects || {})) this.suspects.set(id, SuspectState.fromJSON(obj));
    this.clock = CaseClock.fromJSON(snap.clock, this.caseData ? this.caseData.counterMoves : []);
    this.tick = Number.isInteger(snap.tick) ? snap.tick : this.tick;
    this._transition(snap.scene, { checkpoint: false, reason: 'restore' });
    return true;
  }

  // Auto-checkpoint into the autosave slot. Refused (loud) inside an atomic scene.
  checkpoint(slot = AUTOSAVE_SLOT) {
    if (!this.canCheckpoint()) {
      this.log.warn('engine.checkpoint', 'refused: atomic scene has no mid-scene save', { slot });
      return false;
    }
    const stamp = `${this.scene ? this.scene.name : '?'} @${this.tick}`;
    this.save.save(slot, this.snapshot(), stamp);
    this.emit('checkpoint', { slot, stamp });
    return true;
  }

  // Named-slot save from the menu — also gated by the atomic rule.
  saveTo(slot) {
    if (!this.canCheckpoint()) {
      this.log.warn('engine.saveTo', 'refused: no saving inside an atomic scene', { slot });
      this.emit('error', { where: 'save', message: 'Cannot save during this scene.' });
      return false;
    }
    return this.checkpoint(slot);
  }

  loadFrom(slot) {
    let rec;
    try { rec = this.save.load(slot); }
    catch (err) {
      this.log.capture('engine.load', err, { slot });
      this.emit('error', { where: 'load', message: err.message });
      return false;
    }
    if (!rec) {
      this.log.warn('engine.load', `empty slot "${slot}"`);
      return false;
    }
    return this.restore(rec.data);
  }

  // Case restart is always offered (seed law).
  restart() {
    this.sweep = new SweepTracker();
    this.notebook = new Notebook();
    this.suspects = new Map();
    this.clock = new CaseClock({ counterMoves: this.caseData ? this.caseData.counterMoves : [] });
    this.interrogation = null;
    this.board = null;
    this.solved = false;
    this.prologueRunner = null;
    this.tick = 0;
    this.setMode(MODES.EXPLORE);
    this.log.info('engine.restart', 'case restarted');
    this.emit('restart', {});
    this._transition(this.startScene, { checkpoint: true, reason: 'restart' });
    return this;
  }
}
