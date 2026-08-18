// saves.test.js — atomic run+world persistence + the death-stamp discipline
// (DESIGN-SEED §The loop). A saved state resumes byte-identically; a DEAD stamp boots
// to the scorecard, not a retry.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Run } from '../src/sim/run.js';
import { saveState, loadState, inspectSave, resumableKind, clearSave, saveNoticeFor, SAVE_KEY, WORLD_SAVE_V, loadScores, recordScore, loadFlags, setFlag, ownedSouvenirs, ticketBank, bankTickets, unlockSouvenir, UNLOCK_COST, STARTER_SOUVENIRS, loadSettings, setSetting, DEFAULT_SETTINGS, loadRuns, recordRun } from '../src/engine/saves.js';

test('run history: newest-first, causal fields, capped at 12', () => {
  const store = fakeStore();
  assert.deepEqual(loadRuns(store), []);
  for (let i = 1; i <= 15; i++) recordRun(store, { score: i * 100, seed: i, victory: i % 5 === 0, locale: 1 + (i % 3), stage: 2, culpritCls: 'penny' });
  const runs = loadRuns(store);
  assert.equal(runs.length, 12, 'capped at 12');
  assert.equal(runs[0].seed, 15, 'newest first');
  assert.equal(runs[0].victory, true);      // 15 % 5 === 0
  assert.equal(runs[0].culpritCls, 'penny');
  assert.equal(runs[11].seed, 4, 'oldest kept is the 12th most recent');
});
import { draftableAt } from '../src/sim/catalog.js';

test('settings: defaults load, a set persists + round-trips, unknown keys are ignored', () => {
  const store = fakeStore();
  assert.deepEqual(loadSettings(store), DEFAULT_SETTINGS);
  setSetting(store, 'flashReduce', true);
  setSetting(store, 'gameSpeed', 0.8);
  setSetting(store, 'bogusKey', 999); // never persisted
  const s = loadSettings(store);
  assert.equal(s.flashReduce, true);
  assert.equal(s.gameSpeed, 0.8);
  assert.equal(s.muted, DEFAULT_SETTINGS.muted); // untouched keys keep defaults
  assert.ok(!('bogusKey' in s));
  // A corrupt store degrades to defaults, never throws.
  store.setItem('popinjay:settings:v1', '{not json');
  assert.deepEqual(loadSettings(store), DEFAULT_SETTINGS);
  // No store → defaults (a copy, not the shared object).
  const nil = loadSettings(null); nil.volume = 0; assert.equal(DEFAULT_SETTINGS.volume, 0.8);
});

function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('atomic save → resume continues byte-identically (world + run together)', () => {
  const store = fakeStore();
  const seed = 77;
  const ref = new World({ seed });
  ref.step({ fire: true });
  for (let t = 0; t < 200; t++) ref.step({});
  const refPrint = ref.fingerprint();

  const a = new World({ seed });
  a.step({ fire: true });
  for (let t = 0; t < 120; t++) a.step({});
  const run = new Run({ seed }); run.souvenirs = ['quickSpool'];
  assert.equal(saveState(store, { seed, dead: false, world: a.serialize(), run: run.serialize() }), true);

  const st = loadState(store);
  const resumed = World.fromSerialized(st.world);
  const resumedRun = Run.fromSerialized(st.run);
  assert.deepEqual(resumedRun.souvenirs, ['quickSpool']);
  for (let t = 0; t < 80; t++) resumed.step({});
  assert.equal(resumed.fingerprint(), refPrint, 'resume diverged from the uninterrupted run');
});

test('resumableKind distinguishes alive / dead / absent; seed filter is optional', () => {
  const store = fakeStore();
  const w = new World({ seed: 5 }); for (let t = 0; t < 30; t++) w.step({});
  saveState(store, { seed: 5, dead: false, world: w.serialize(), run: new Run({ seed: 5 }).serialize() });
  assert.equal(resumableKind(store), 'alive', 'single slot resumes without a boot seed');
  assert.equal(resumableKind(store, 5), 'alive', 'a mid-stage save resumes when seed matches');
  assert.equal(resumableKind(store, 6), null, 'a different requested seed does not resume');

  // A death-stamped save reports 'dead' (→ boot to the scorecard).
  const dead = new World({ seed: 5 }); dead.dead = true;
  saveState(store, { seed: 5, dead: true, world: dead.serialize(), run: new Run({ seed: 5 }).serialize() });
  assert.equal(resumableKind(store), 'dead');

  // A just-cleared stage IS resumable (the cleared-ribbon beat must survive a quit).
  const done = new World({ seed: 5 }); done.balloons = []; done.step({});
  saveState(store, { seed: 5, dead: false, world: done.serialize(), run: new Run({ seed: 5 }).serialize() });
  assert.equal(resumableKind(store), 'alive', 'a cleared stage resumes at the ribbon');

  // Between-beat states (tour map / draft / rehearsal) have no World but are resumable.
  saveState(store, { seed: 5, mode: 'tourmap', dead: false, world: null, run: new Run({ seed: 5 }).serialize() });
  assert.equal(resumableKind(store), 'alive', 'a tour-map save resumes');
  saveState(store, { seed: 5, mode: 'draft', dead: false, world: null, run: new Run({ seed: 5 }).serialize() });
  assert.equal(resumableKind(store), 'alive', 'a draft save resumes');
  saveState(store, { seed: 5, mode: 'rehearsal', dead: false, world: null, run: new Run({ seed: 5 }).serialize() });
  assert.equal(resumableKind(store), 'alive', 'a rehearsal save resumes');
});

test('seed 407 resume and death-stamp are recognized (non-default seed anti-scum)', () => {
  const store = fakeStore();
  const seed = 407;
  const w = new World({ seed });
  for (let t = 0; t < 40; t++) w.step({});
  saveState(store, { seed, dead: false, world: w.serialize(), run: new Run({ seed }).serialize() });
  assert.equal(resumableKind(store), 'alive');
  assert.equal(resumableKind(store, 1), null, 'default boot seed must not hijack seed-407 save');
  assert.equal(resumableKind(store, seed), 'alive');

  const deadW = new World({ seed }); deadW.dead = true;
  saveState(store, { seed, dead: true, world: deadW.serialize(), run: new Run({ seed }).serialize() });
  assert.equal(resumableKind(store), 'dead');
  assert.equal(resumableKind(store, 1), null);
});

test('the best-score table keeps a sorted top 10 (seed shown), highest first', () => {
  const store = fakeStore();
  for (let i = 0; i < 15; i++) recordScore(store, { score: i * 100, seed: i });
  const top = loadScores(store);
  assert.equal(top.length, 10, 'capped at 10');
  assert.equal(top[0].score, 1400, 'highest first');
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].score >= top[i].score, 'descending');
  assert.equal(typeof top[0].seed, 'number', 'seed is recorded for sharing');
});

test('persistent unlock flags round-trip (Endless Panic)', () => {
  const store = fakeStore();
  assert.deepEqual(loadFlags(store), {}, 'no flags by default');
  setFlag(store, 'endless', true);
  assert.equal(loadFlags(store).endless, true, 'the unlock persists');
});

test('the TRUNK: starts owning 12, banks tickets, unlocks the rest; the draft is gated to owned', () => {
  const store = fakeStore();
  assert.deepEqual(ownedSouvenirs(store).slice().sort(), STARTER_SOUVENIRS.slice().sort(), 'starts with the 12 starters');
  assert.equal(ticketBank(store), 0);

  // A locked souvenir cannot be unlocked without the bank.
  assert.equal(unlockSouvenir(store, 'ironGores'), false, 'cannot afford yet');
  bankTickets(store, UNLOCK_COST + 5);
  assert.equal(unlockSouvenir(store, 'ironGores'), true, 'affordable now');
  assert.equal(ticketBank(store), 5, 'the cost was deducted');
  assert.ok(ownedSouvenirs(store).includes('ironGores'), 'now owned');

  // The draft pool is GATED to the owned trunk (curation, not dilution).
  const pool = draftableAt(3, [], ownedSouvenirs(store)).map((c) => c.id);
  assert.ok(pool.includes('ironGores'), 'an owned souvenir is draftable');
  assert.ok(!pool.includes('tubaBlast'), 'a still-locked souvenir is NOT draftable');
});

test('inspectSave classifies corrupt, truncated, and version-skew saves with loud notices', () => {
  const store = fakeStore();
  assert.equal(inspectSave(store).fault, null);
  store.setItem(SAVE_KEY, '{not json');
  assert.equal(inspectSave(store).fault, 'corrupt');
  assert.match(saveNoticeFor('corrupt'), /UNREADABLE/);
  store.setItem(SAVE_KEY, '   ');
  assert.equal(inspectSave(store).fault, 'truncated');
  assert.match(saveNoticeFor('truncated'), /TRUNCATED/);
  store.setItem(SAVE_KEY, JSON.stringify({ v: 99, seed: 1, dead: false }));
  assert.equal(inspectSave(store).fault, 'version');
  assert.match(saveNoticeFor('version'), /VERSION/);
  const w = new World({ seed: 1 });
  for (let t = 0; t < 5; t++) w.step({});
  const skew = w.serialize(); skew.v = WORLD_SAVE_V + 50;
  store.setItem(SAVE_KEY, JSON.stringify({ v: 4, seed: 1, dead: false, world: skew, run: new Run({ seed: 1 }).serialize() }));
  assert.equal(inspectSave(store).fault, 'version');
});

test('a corrupt or absent save reads as absent (never crashes the boot)', () => {
  const store = fakeStore();
  assert.equal(loadState(store), null);
  assert.equal(resumableKind(store), null);
  store.setItem(SAVE_KEY, '{not json');
  assert.equal(loadState(store), null);
  assert.equal(inspectSave(store).fault, 'corrupt');
  clearSave(store);
  assert.equal(store.getItem(SAVE_KEY), null);
});
