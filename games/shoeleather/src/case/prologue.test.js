import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prologue, PrologueRunner, PrologueBeat, CORE_VERBS } from './prologue.js';

function completeBeats() {
  return [
    { id: 'b-look', verb: 'look', prose: 'The office is quiet.', action: 'Look around' },
    { id: 'b-move', verb: 'move', prose: 'You cross to the desk.', action: 'Move' },
    { id: 'b-take', verb: 'take', prose: 'You take the boning knife.', action: 'Take the knife' },
    { id: 'b-use', verb: 'use', prose: 'You set the tape to record early.', action: 'Set the tape', prologueKey: true },
    { id: 'b-talk', verb: 'talk', prose: 'The partner turns. You speak.', action: 'Speak' },
    { id: 'b-chal', verb: 'challenge', prose: 'Rehearse the lie against the valet.', action: 'Challenge (rehearsal)', stakesFree: true },
  ];
}

test('a complete prologue validates clean', () => {
  const p = new Prologue({ id: 'case1', beats: completeBeats() });
  assert.deepEqual(p.validate(), []);
  assert.ok(p.hasPrologueKey());
});

test('validate flags a missing core verb', () => {
  const beats = completeBeats().filter((b) => b.verb !== 'take');
  const p = new Prologue({ id: 'x', beats });
  assert.ok(p.validate().some((s) => /"take" verb/.test(s)));
});

test('validate flags a missing stakes-free challenge rep', () => {
  const beats = completeBeats().map((b) => b.verb === 'challenge' ? { ...b, stakesFree: false } : b);
  const p = new Prologue({ id: 'x', beats });
  assert.ok(p.validate().some((s) => /stakes-free challenge/.test(s)));
});

test('validate flags a missing prologue-key beat', () => {
  const beats = completeBeats().map((b) => ({ ...b, prologueKey: false }));
  const p = new Prologue({ id: 'x', beats });
  assert.ok(p.validate().some((s) => /prologue-key beat/.test(s)));
});

test('runner walks beats forced-linear to completion', () => {
  const p = new Prologue({ id: 'x', beats: completeBeats() });
  const seen = [];
  const runner = new PrologueRunner(p, { onEvent: (e) => { if (e.type === 'beat-done') seen.push(e.beat.id); } });
  assert.equal(runner.current().id, 'b-look');
  while (runner.advance()) { /* walk */ }
  assert.ok(runner.done);
  assert.equal(runner.current(), null);
  assert.equal(seen.length, 6);
  assert.deepEqual(runner.progress(), { at: 6, total: 6 });
});

test('empty prologue and bad verb throw', () => {
  assert.throws(() => new Prologue({ id: 'x', beats: [] }), /no beats/);
  assert.throws(() => new PrologueBeat({ id: 'b', verb: 'sniff' }), /unknown verb/);
});

test('CORE_VERBS covers the tutorial verb set', () => {
  assert.deepEqual([...CORE_VERBS].sort(), ['challenge', 'look', 'move', 'take', 'talk', 'use']);
});
