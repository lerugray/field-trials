// meta.test.js — THE CERTIFICATION LEDGER (DESIGN-SEED M5). Job mastery is the
// cross-run currency: earned by fielding a job in won fights, banked at run-end,
// compounding a small stat overlay. A fresh ledger must leave the baseline exact.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/tuning.js';
import {
  createMeta, masteryXp, masteryLevel, masteryMult, masteryMultByJob,
  createRunMastery, earnMastery, bankRun, serializeMeta, parseMeta,
} from '../src/meta.js';
import { deriveStats, JOB_IDS } from '../src/jobs.js';
import { createParty, changeJob, frameStats } from '../src/party.js';

test('a fresh ledger is empty and leaves the baseline exactly untouched', () => {
  const meta = createMeta();
  assert.equal(meta.runs, 0);
  for (const jid of JOB_IDS) {
    assert.equal(masteryLevel(meta, jid), 0);
    assert.equal(masteryMult(meta, jid), 1);
    // level-0 mastery block === the plain baseline block
    assert.deepEqual(deriveStats(jid, 1, masteryMult(meta, jid)), deriveStats(jid));
  }
});

test('mastery XP accrues, levels at the configured step, and caps', () => {
  const meta = createMeta();
  meta.mastery.bailiff = TUNING.masteryXpPerLevel * 3; // exactly 3 levels
  assert.equal(masteryLevel(meta, 'bailiff'), 3);
  assert.ok(Math.abs(masteryMult(meta, 'bailiff') - (1 + 3 * TUNING.masteryStatPerLevel)) < 1e-9);
  meta.mastery.bailiff = TUNING.masteryXpPerLevel * 999;
  assert.equal(masteryLevel(meta, 'bailiff'), TUNING.masteryLevelCap, 'levels cap');
});

test('earnMastery credits by tier; bankRun folds into the ledger and reports gains', () => {
  const run = createRunMastery();
  earnMastery(run, 'bailiff', 'routine'); // +1
  earnMastery(run, 'bailiff', 'boss'); // +8
  earnMastery(run, 'surveyor', 'elite'); // +3
  assert.equal(run.bailiff, TUNING.masteryXpPerWin.routine + TUNING.masteryXpPerWin.boss);
  const meta = createMeta();
  const gains = bankRun(meta, run, 5);
  assert.equal(masteryXp(meta, 'bailiff'), 9);
  assert.equal(meta.runs, 1);
  assert.equal(meta.deepestLeg, 5);
  assert.ok(gains.bailiff.xp === 9 && gains.bailiff.before === 0);
});

test('bankRun with a fraction banks reduced credit (the abandon valve)', () => {
  const meta = createMeta();
  const run = { bailiff: 20 };
  bankRun(meta, run, 3, 0.5);
  assert.equal(masteryXp(meta, 'bailiff'), 10, 'half credit');
});

test('mastery compounds a job stat block and flows into a party frame', () => {
  const meta = createMeta();
  meta.mastery.bailiff = TUNING.masteryXpPerLevel * 4; // level 4 → +12%
  const mult = masteryMult(meta, 'bailiff');
  const plain = createParty(['bailiff', 'chirurgeon', 'surveyor', 'sumpter']);
  const skilled = createParty(['bailiff', 'chirurgeon', 'surveyor', 'sumpter'], masteryMultByJob(meta));
  assert.ok(skilled.frames[0].max.atk > plain.frames[0].max.atk, 'mastery raises the frame');
  assert.deepEqual(skilled.frames[0].max, frameStats('bailiff', { arm: null, guard: null }, mult));
  // an un-mastered job in the same party is unchanged
  assert.deepEqual(skilled.frames[1].max, plain.frames[1].max);
});

test('the run holds mastery fixed across a job swap', () => {
  const meta = createMeta();
  meta.mastery.notary = TUNING.masteryXpPerLevel * 5; // notary mastered, bailiff not
  const party = createParty(['bailiff', 'chirurgeon', 'surveyor', 'sumpter'], masteryMultByJob(meta));
  changeJob(party, 0, 'notary'); // frame 0 swaps into the mastered notary
  assert.equal(party.frames[0].masteryMult, masteryMult(meta, 'notary'));
  assert.deepEqual(party.frames[0].max, frameStats('notary', { arm: null, guard: null }, masteryMult(meta, 'notary')));
});

test('meta serialize/parse round-trips; a corrupt ledger resets, never throws', () => {
  const meta = createMeta();
  meta.mastery.bailiff = 44; meta.runs = 3; meta.deepestLeg = 7;
  const round = parseMeta(JSON.parse(JSON.stringify(serializeMeta(meta))));
  assert.deepEqual(round, meta);
  assert.deepEqual(parseMeta('not json{'), createMeta());
  assert.deepEqual(parseMeta(null), createMeta());
  assert.deepEqual(parseMeta('{"v":99}'), createMeta(), 'wrong version → fresh');
});
