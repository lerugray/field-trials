import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, MODES, AUTOSAVE_SLOT } from './engine.js';
import { Scene, SceneGraph } from './scene.js';
import { DebugLog } from './debug-log.js';
import { SaveManager, MemoryStore } from './save.js';
import { rect } from './geometry.js';
import { buildToyCase } from '../case/fixtures/toy-case.js';
import { buildCase1 } from '../case/fixtures/case-1.js';

function build() {
  const graph = new SceneGraph();
  graph.add(new Scene({
    id: 'hall', name: 'Front Hall',
    hotspots: [
      { id: 'lamp', bounds: rect(4, 4, 10, 10), label: 'Lamp', kind: 'look' },
      { id: 'door', bounds: rect(40, 4, 10, 10), label: 'Door', kind: 'exit' },
    ],
    links: [{ to: 'kitchen', via: 'door' }],
  }));
  graph.add(new Scene({
    id: 'kitchen', name: 'Kitchen',
    hotspots: [{ id: 'knife', bounds: rect(4, 4, 10, 10), label: 'Knife', kind: 'take' }],
  }));
  const log = new DebugLog();
  const save = new SaveManager(new MemoryStore());
  return { engine: new Engine({ graph, log, save, startScene: 'hall' }), log, save };
}

test('start enters the initial scene and auto-checkpoints', () => {
  const { engine, save } = build();
  engine.start();
  assert.equal(engine.sceneId, 'hall');
  assert.ok(save.has(AUTOSAVE_SLOT)); // scene-boundary checkpoint
});

test('start throws on a missing scene id', () => {
  const { engine } = build();
  assert.throws(() => engine.start('nowhere'), /does not exist/);
});

test('focus cycling brushes hotspots and emits sweep on first touch', () => {
  const { engine } = build();
  engine.start();
  const sweeps = [];
  engine.on('sweep', (p) => sweeps.push(p.hotspot.id));
  engine.focusNext(); // lamp
  engine.focusNext(); // door
  engine.focusNext(); // lamp again (wrap) → already brushed, no new sweep
  assert.deepEqual(sweeps, ['lamp', 'door']);
  assert.ok(engine.sweep.isSwept(engine.scene));
});

test('select on an exit transitions and auto-checkpoints the new scene', () => {
  const { engine, save } = build();
  engine.start();
  engine.focus.focusById('door');
  const res = engine.select();
  assert.equal(res.type, 'exit');
  assert.equal(engine.sceneId, 'kitchen');
  const rec = save.load(AUTOSAVE_SLOT);
  assert.equal(rec.data.scene, 'kitchen');
});

test('select on a non-exit emits interact', () => {
  const { engine } = build();
  engine.start();
  let interacted = null;
  engine.on('interact', (p) => { interacted = p; });
  engine.focus.focusById('lamp');
  const res = engine.select();
  assert.equal(res.type, 'interact');
  assert.equal(res.kind, 'look');
  assert.equal(interacted.hotspot.id, 'lamp');
});

test('select with nothing focused is a safe none', () => {
  const { engine } = build();
  engine.start();
  assert.deepEqual(engine.select(), { type: 'none' });
});

test('entering a missing scene fails loudly and stays put', () => {
  const { engine, log } = build();
  engine.start();
  let err = null;
  engine.on('error', (e) => { err = e; });
  assert.equal(engine.enter('atlantis'), false);
  assert.equal(engine.sceneId, 'hall'); // did not move
  assert.ok(log.hasErrors());
  assert.equal(err.where, 'enter');
});

test('atomic mode refuses checkpoint and named save (no mid-scene save law)', () => {
  const { engine, save } = build();
  engine.start();
  save.delete(AUTOSAVE_SLOT);
  engine.setMode(MODES.ATOMIC);
  assert.equal(engine.canCheckpoint(), false);
  assert.equal(engine.checkpoint(), false);
  let err = null;
  engine.on('error', (e) => { err = e; });
  assert.equal(engine.saveTo('manual'), false);
  assert.equal(save.has(AUTOSAVE_SLOT), false);
  assert.match(err.message, /Cannot save/);
});

test('snapshot/restore preserves scene and sweep', () => {
  const { engine } = build();
  engine.start();
  engine.focusNext(); // brush lamp
  const snap = engine.snapshot();
  engine.enter('kitchen');
  assert.equal(engine.sceneId, 'kitchen');
  assert.ok(engine.restore(snap));
  assert.equal(engine.sceneId, 'hall');
  assert.ok(engine.sweep.isBrushed('hall', 'lamp'));
});

test('saveTo a named slot then loadFrom restores it', () => {
  const { engine } = build();
  engine.start();
  engine.focusNext();
  assert.ok(engine.saveTo('manual'));
  engine.enter('kitchen');
  assert.ok(engine.loadFrom('manual'));
  assert.equal(engine.sceneId, 'hall');
});

test('loadFrom empty slot fails soft; corrupt slot fails loud', () => {
  const { engine, save, log } = build();
  engine.start();
  assert.equal(engine.loadFrom('ghost'), false); // empty → warn, false
  save.store.set('shoeleather:save:bad', '{broken');
  assert.equal(engine.loadFrom('bad'), false);
  assert.ok(log.hasErrors());
});

test('restore rejects a snapshot with an unknown scene', () => {
  const { engine } = build();
  engine.start();
  assert.equal(engine.restore({ scene: 'void', sweep: {} }), false);
});

test('restart resets sweep and returns to the start scene', () => {
  const { engine } = build();
  engine.start();
  engine.focusNext();
  engine.enter('kitchen');
  engine.setMode(MODES.ATOMIC);
  engine.restart();
  assert.equal(engine.sceneId, 'hall');
  assert.equal(engine.mode, MODES.EXPLORE);
  assert.equal(engine.sweep.brushedCount('hall'), 0);
});

function caseBuild() {
  const caseData = buildToyCase();
  const graph = new SceneGraph();
  graph.add(new Scene({
    id: 'restaurant', name: 'Restaurant',
    hotspots: [
      { id: 'valet-log', bounds: rect(4, 4, 10, 10), label: 'Valet log', kind: 'look', meta: { fact: 'f-chef-at-restaurant' } },
      { id: 'chef', bounds: rect(40, 4, 10, 10), label: 'The chef', kind: 'talk', meta: { statement: 's-chef-alibi' } },
      { id: 'nothing', bounds: rect(60, 4, 10, 10), label: 'A wall', kind: 'look' },
    ],
  }));
  const log = new DebugLog();
  const save = new SaveManager(new MemoryStore());
  const engine = new Engine({ graph, log, save, startScene: 'restaurant', caseData });
  return { engine, caseData, log, save };
}

test('interacting with a fact hotspot logs the fact and emits fact-logged', () => {
  const { engine } = caseBuild();
  engine.start();
  let logged = null;
  engine.on('fact-logged', (p) => { logged = p.fact.id; });
  engine.focus.focusById('valet-log');
  const res = engine.select();
  assert.equal(res.acquired.kind, 'fact');
  assert.equal(logged, 'f-chef-at-restaurant');
  assert.ok(engine.notebook.has('f-chef-at-restaurant'));
  assert.equal(engine.notebook.get('f-chef-at-restaurant').scene, 'restaurant');
});

test('re-observing an already-known fact does not re-emit', () => {
  const { engine } = caseBuild();
  engine.start();
  let count = 0;
  engine.on('fact-logged', () => { count++; });
  engine.focus.focusById('valet-log');
  engine.select();
  engine.select();
  assert.equal(count, 1);
});

test('talking to a suspect logs their statement verbatim', () => {
  const { engine } = caseBuild();
  engine.start();
  engine.focus.focusById('chef');
  const res = engine.select();
  assert.equal(res.acquired.kind, 'statement');
  assert.ok(engine.notebook.has('s-chef-alibi'));
});

test('a plain hotspot acquires nothing', () => {
  const { engine } = caseBuild();
  engine.start();
  engine.focus.focusById('nothing');
  assert.equal(engine.select().acquired, null);
});

test('a hotspot naming a missing fact fails loudly', () => {
  const { engine, log } = caseBuild();
  engine.start();
  engine.scene.addHotspot({ id: 'bad', bounds: rect(80, 4, 8, 8), label: 'Bad', kind: 'look', meta: { fact: 'ghost' } });
  engine.focus = new (engine.focus.constructor)(engine.scene); // rebuild ring for new hotspot
  engine.focus.focusById('bad');
  engine.select();
  assert.ok(log.hasErrors());
});

test('notebook state rides the checkpoint and restores', () => {
  const { engine } = caseBuild();
  engine.start();
  engine.focus.focusById('valet-log');
  engine.select();               // log a fact
  engine.saveTo('manual');
  engine.restart();              // wipes notebook
  assert.ok(!engine.notebook.has('f-chef-at-restaurant'));
  engine.loadFrom('manual');
  assert.ok(engine.notebook.has('f-chef-at-restaurant'));
});

function talkBuild() {
  const caseData = buildToyCase();
  const graph = new SceneGraph();
  graph.add(new Scene({
    id: 'restaurant', name: 'Restaurant',
    hotspots: [
      { id: 'chef', bounds: rect(40, 4, 10, 10), label: 'The chef', kind: 'talk', meta: { suspect: 'chef' } },
      { id: 'valet', bounds: rect(4, 4, 10, 10), label: 'Valet log', kind: 'look', meta: { fact: 'f-chef-at-restaurant' } },
    ],
  }));
  const log = new DebugLog();
  const save = new SaveManager(new MemoryStore());
  const engine = new Engine({ graph, log, save, startScene: 'restaurant', caseData });
  return { engine, caseData, log, save };
}

test('talking opens an atomic interrogation and enters the root node', () => {
  const { engine } = talkBuild();
  engine.start();
  engine.focus.focusById('chef');
  const res = engine.select();
  assert.equal(res.type, 'interrogation');
  assert.equal(engine.mode, MODES.ATOMIC);
  assert.equal(engine.interrogation.runner.current().id, 'open');
});

test('dialogue choice reveals a statement then ending returns to explore + checkpoints', () => {
  const { engine, save } = talkBuild();
  engine.start();
  engine.focus.focusById('chef'); engine.select();
  engine.dialogueChoose('ask');            // reveals s-chef-alibi
  assert.ok(engine.notebook.has('s-chef-alibi'));
  engine.dialogueChoose('leave-2');        // to:null ends the interview
  assert.equal(engine.interrogation, null);
  assert.equal(engine.mode, MODES.EXPLORE);
  assert.equal(save.load('auto').data.scene, 'restaurant'); // checkpoint on exit
});

test('a correct challenge inside the interview breaks the statement', () => {
  const { engine } = talkBuild();
  engine.start();
  engine.focus.focusById('valet'); engine.select();   // learn f-chef-at-restaurant
  engine.focus.focusById('chef'); engine.select();     // interview
  engine.dialogueChoose('ask');                        // hear the alibi
  const res = engine.challenge('s-chef-alibi', 'f-chef-at-restaurant');
  assert.equal(res.type, 'landed');
  assert.ok(engine.suspectState('chef').isRefuted('s-chef-alibi'));
});

test('a wrong challenge hardens the suspect and advances the clock', () => {
  const { engine } = talkBuild();
  engine.start();
  engine.focus.focusById('chef'); engine.select();
  engine.dialogueChoose('ask'); // hear the alibi
  engine.notebook.logFact(engine.caseData.fact('f-means')); // a non-contradicting fact
  const st = engine.suspectState('chef');
  const res = engine.challenge('s-chef-alibi', 'f-means');
  assert.equal(res.type, 'failed');
  assert.equal(st.tolerance, 2);         // hardened
  assert.equal(engine.clock.count, 1);   // murderer counter-moved
});

test('no saving inside an interrogation (atomic gate)', () => {
  const { engine } = talkBuild();
  engine.start();
  engine.focus.focusById('chef'); engine.select();
  assert.equal(engine.saveTo('manual'), false); // atomic scene refuses
});

test('afterthought arms when re-entering a relaxed suspect', () => {
  const { engine } = talkBuild();
  engine.start();
  const st = engine.suspectState('chef');
  st.harden();                 // make relaxation meaningful
  engine.focus.focusById('chef'); engine.select();
  engine.dialogueChoose('leave-1');   // leave -> starts relaxation timer at current tick
  const leftTick = st.leftAtTick;
  engine.tick = leftTick + 5;         // simulate time spent elsewhere
  let armed = false;
  engine.on('afterthought', () => { armed = true; });
  engine.focus.focusById('chef'); engine.select(); // re-enter
  assert.ok(armed);
  assert.ok(engine.interrogation.state.afterthoughtArmed);
});

test('suspect state + clock ride the checkpoint', () => {
  const { engine } = talkBuild();
  engine.start();
  engine.focus.focusById('valet'); engine.select();
  engine.focus.focusById('chef'); engine.select();
  engine.dialogueChoose('ask');
  engine.challenge('s-chef-alibi', 'f-chef-at-restaurant'); // landed, persisted in state
  engine.dialogueChoose('leave-2'); // ends interview + checkpoints
  engine.saveTo('manual');          // manual slot survives restart's auto-checkpoint
  engine.restart();
  assert.ok(!engine.suspectState('chef').isRefuted('s-chef-alibi'));
  engine.loadFrom('manual');
  assert.ok(engine.suspectState('chef').isRefuted('s-chef-alibi'));
});

test('the board opens as an atomic scene and solves on the exact chain', () => {
  const { engine } = talkBuild();
  engine.start();
  const c = engine.caseData;
  // pin everything the winning chain needs
  for (const id of Object.values(c.winningChain)) if (c.fact(id)) { engine.notebook.logFact(c.fact(id)); engine.notebook.pin(id); }
  engine.notebook.logStatement(c.statement('s-chef-alibi')); engine.notebook.pin('s-chef-alibi');
  assert.ok(engine.openBoard());
  assert.equal(engine.mode, MODES.ATOMIC);
  for (const [slot, id] of Object.entries(c.winningChain)) if (slot !== 'victim') engine.boardSet(slot, id);
  let solved = null;
  engine.on('case-solved', (e) => { solved = e; });
  const res = engine.boardSubmit();
  assert.equal(res.type, 'solved');
  assert.ok(engine.solved);
  assert.ok(solved.chain);
});

test('a wrong board submission deflects and advances the clock', () => {
  const { engine } = talkBuild();
  engine.start();
  const c = engine.caseData;
  for (const id of Object.values(c.winningChain)) if (c.fact(id)) { engine.notebook.logFact(c.fact(id)); engine.notebook.pin(id); }
  engine.notebook.logStatement(c.statement('s-chef-alibi')); engine.notebook.pin('s-chef-alibi');
  engine.openBoard();
  for (const [slot, id] of Object.entries(c.winningChain)) if (slot !== 'victim') engine.boardSet(slot, id);
  engine.boardSet('prologueFact', 'f-chef-knife'); // wrong: no contradiction
  const res = engine.boardSubmit();
  assert.equal(res.type, 'deflected');
  assert.equal(engine.clock.count, 1);
  assert.ok(!engine.solved);
});

test('no saving while the board is open (atomic gate)', () => {
  const { engine } = talkBuild();
  engine.start();
  engine.openBoard();
  assert.equal(engine.saveTo('manual'), false);
  engine.closeBoard();
  assert.equal(engine.mode, MODES.EXPLORE);
});

test('the prologue plays forced-linear then enters the investigation', () => {
  const caseData = buildCase1();
  const graph = new SceneGraph();
  graph.add(new Scene({ id: 'restaurant', name: 'Restaurant' }));
  const log = new DebugLog();
  const save = new SaveManager(new MemoryStore());
  const engine = new Engine({ graph, log, save, startScene: 'restaurant', caseData });

  assert.ok(engine.startPrologue());
  assert.equal(engine.mode, MODES.ATOMIC); // no saving during the prologue
  assert.equal(engine.saveTo('manual'), false);
  const beats = caseData.prologue.beats.length;
  let ended = false;
  engine.on('prologue-end', () => { ended = true; });
  for (let i = 0; i < beats; i++) engine.prologueAdvance();
  assert.ok(ended);
  assert.equal(engine.prologueRunner, null);
  assert.equal(engine.mode, MODES.EXPLORE);
  assert.equal(engine.sceneId, 'restaurant'); // investigation began
});

test('a throwing listener is captured, not fatal', () => {
  const { engine, log } = build();
  engine.start();
  engine.on('focus', () => { throw new Error('bad listener'); });
  engine.focusNext(); // should not throw
  assert.ok(log.hasErrors());
});
