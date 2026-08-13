// Exact live resume + terminal run integrity (audit finding 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMarch } from '../src/engine.js';
import { createParty } from '../src/party.js';
import { createDeck, drawUp } from '../src/deck.js';
import { createMandate } from '../src/mandate.js';
import { makeEnemies, initCombat, stepCombat } from '../src/combat.js';
import { createLedger, recordMatter, recordRoute } from '../src/report.js';
import { createMeta, isRunClosed, masteryXp, parseMeta } from '../src/meta.js';
import {
  SAVE_KEY, LEGACY_SAVE_KEYS, RUN_CLOSED, applySave, createStorage,
  invalidateLegacySaves, makeSave, parseSave, parseSaveRecord,
} from '../src/save.js';
import { closeExpedition } from '../src/run.js';

function liveCombatSave(runId = 'run-mid-combat') {
  const config = { seed: 8080, speedIndex: 3 };
  const march = createMarch(config.seed);
  const party = createParty();
  const deck = createDeck(undefined, march.streams.shuffle);
  drawUp(deck, 3, march.streams.shuffle);
  const enemies = makeEnemies('elite', march.streams.combat);
  const st = initCombat(party, enemies);
  stepCombat(st, march.streams.combat);
  stepCombat(st, march.streams.combat);
  const ledger = createLedger();
  recordRoute(ledger, march.leg, { id: 'verge', label: 'The Verge', safety: 'exposed', encounterMult: 1.7 });
  recordMatter(ledger, march.leg, 'elite');
  const progressTrk = { lastGold: 7, lastGear: 1, lastXp: 3, streak: 1 };
  const combat = {
    tier: 'elite', st, enemies, acc: 217, floats: [{ side: 'enemy', idx: 0, text: '-4', color: '#fff', life: 321 }],
    round: st.round, leg: march.leg, line: 'A live resolver line.', done: false, outMs: 0,
    draft: null, left: true,
  };
  const ui = {
    screen: 'combat', paused: true, focus: -1, ticker: ['matter filed'], combat,
    noProgress: true, omen: { arcana: 'the_moon', name: 'The Moon' }, muted: false, escLevel: 2,
  };
  const mandate = createMandate(march.streams.mandate, 0, march.leg, march.encounterCount, party.supplies);
  const runMastery = { bailiff: 4 };
  return makeSave(config, march, party, deck, mandate, runMastery, { runId, ledger, progressTrk, ui });
}

test('quit mid-combat restores the complete live file byte-exactly', () => {
  const raw = JSON.stringify(liveCombatSave());
  const restored = applySave(parseSave(raw));
  const roundTrip = makeSave(restored.config, restored.march, restored.party, restored.deck,
    restored.mandate, restored.runMastery, {
      runId: restored.runId, ledger: restored.ledger, progressTrk: restored.progressTrk, ui: restored.ui,
    });
  assert.equal(JSON.stringify(roundTrip), raw, 'the complete open file survives JSON -> restore -> JSON byte-exactly');
  assert.equal(restored.ui.screen, 'combat');
  assert.equal(restored.ui.paused, true);
  assert.equal(restored.ui.combat.st.party, restored.party, 'resolver points at the canonical restored party');
  assert.equal(restored.ui.combat.st.partyW[0].e, restored.party.frames[0], 'initiative wrapper is rewired');
  assert.deepEqual(restored.ledger.routeByLeg, { 0: { id: 'verge', label: 'The Verge', safety: 'exposed', enc: 1.7 } });
});

test('mid-combat continuations remain byte-identical after exact resume', () => {
  const raw = JSON.stringify(liveCombatSave('run-continuation'));
  const a = applySave(parseSave(raw));
  const b = applySave(parseSave(raw));
  for (let i = 0; i < 40 && !a.ui.combat.st.done; i++) {
    assert.deepEqual(stepCombat(a.ui.combat.st, a.march.streams.combat), stepCombat(b.ui.combat.st, b.march.streams.combat));
    assert.equal(JSON.stringify(a.party), JSON.stringify(b.party));
    assert.equal(JSON.stringify(a.ui.combat.st.log), JSON.stringify(b.ui.combat.st.log));
  }
});

test('pending combat draft and its screen resume exactly', () => {
  const env = liveCombatSave('run-draft');
  env.ui.combat.st.done = true;
  env.ui.combat.st.victory = true;
  env.ui.combat.done = true;
  env.ui.combat.draft = { options: ['the_tower', 'justice', 'the_sun'], focus: 2 };
  env.ui.focus = 2;
  const restored = applySave(parseSave(JSON.stringify(env)));
  assert.equal(restored.ui.screen, 'combat');
  assert.deepEqual(restored.ui.combat.draft, env.ui.combat.draft);
  assert.equal(restored.ui.focus, 2);
});

function assertTerminalClosure({ cause, frac, runId }) {
  const storage = createStorage(null);
  const meta = createMeta();
  const open = liveCombatSave(runId);
  storage.write(SAVE_KEY, JSON.stringify(open));
  const first = closeExpedition({ storage, meta, runId, runMastery: { bailiff: 20 }, deepestLeg: 4, closedAtTick: 91, frac, cause, gold: 33 });
  assert.equal(first.banked, true);
  assert.equal(parseSave(storage.read(SAVE_KEY)), null, 'closed run is not resumable');
  assert.equal(parseSaveRecord(storage.read(SAVE_KEY)).status, RUN_CLOSED);
  assert.equal(isRunClosed(meta, runId), true);
  const afterFirst = JSON.stringify(meta);
  const second = closeExpedition({ storage, meta, runId, runMastery: { bailiff: 20 }, deepestLeg: 4, closedAtTick: 91, frac, cause, gold: 33 });
  assert.equal(second.banked, false, 'repeated closure does not bank');
  assert.equal(JSON.stringify(meta), afterFirst, 'meta ledger is unchanged by repeat closure');
  assert.equal(meta.runs, 1);
  return meta;
}

test('wipe closes the run save and can never double-bank', () => {
  const meta = assertTerminalClosure({ cause: 'reduced', frac: 1, runId: 'run-wipe' });
  assert.equal(masteryXp(meta, 'bailiff'), 20);
});

test('early return closes the run save and can never double-bank', () => {
  const meta = assertTerminalClosure({ cause: 'abandoned', frac: 0.5, runId: 'run-early' });
  assert.equal(masteryXp(meta, 'bailiff'), 10);
});

test('successful closure uses the same non-resumable idempotent transaction', () => {
  const meta = assertTerminalClosure({ cause: 'completed', frac: 1, runId: 'run-success' });
  assert.equal(meta.closedRuns['run-success'].cause, 'completed');
});

test('known v4 saves are explicitly invalidated without touching current storage', () => {
  const storage = createStorage(null);
  storage.write(LEGACY_SAVE_KEYS[0], JSON.stringify({ v: 4, march: {} }));
  storage.write(SAVE_KEY, JSON.stringify(liveCombatSave('run-current')));
  assert.deepEqual(invalidateLegacySaves(storage), LEGACY_SAVE_KEYS);
  assert.equal(storage.read(LEGACY_SAVE_KEYS[0]), null);
  assert.ok(parseSave(storage.read(SAVE_KEY)));
});

test('closed-run receipts survive meta serialization and block stale OPEN files', () => {
  const storage = createStorage(null);
  const meta = createMeta();
  const staleRaw = JSON.stringify(liveCombatSave('run-crash-window'));
  closeExpedition({ storage, meta, runId: 'run-crash-window', runMastery: { bailiff: 5 }, deepestLeg: 2, cause: 'reduced' });
  const reloadedMeta = parseMeta(storage.read('office-of-the-road/certifications/v1'));
  storage.write(SAVE_KEY, staleRaw); // simulate interruption before CLOSED marker persisted
  const stale = parseSave(storage.read(SAVE_KEY));
  assert.ok(stale, 'the stale bytes still describe an OPEN save');
  assert.equal(isRunClosed(reloadedMeta, stale.runId), true, 'permanent receipt suppresses resume and rebank');
});
