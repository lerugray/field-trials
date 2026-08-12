// M12 B1 — the diagnosability event log (ring buffer). Records side effects with
// tick / mode / seed / kind / outcome, caps at ~200, and round-trips through JSON so
// a saved run carries its record. Old saves without a log restore cleanly (empty).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventLog, EVENTLOG_CAP } from '../src/engine/eventlog.js';

test('logs shape entries and default missing fields', () => {
  const el = createEventLog();
  const e = el.log('rest', { mode: 'overworld', outcome: 'camp 1→5 hp', seed: 42 });
  assert.deepEqual(e, { tick: 0, mode: 'overworld', seed: 42, kind: 'rest', outcome: 'camp 1→5 hp' });
  const bare = el.log('death');
  assert.equal(bare.kind, 'death');
  assert.equal(bare.mode, '');
  assert.equal(bare.seed, null);
  assert.equal(bare.outcome, '');
  assert.equal(el.size, 2);
});

test('the ring caps at capacity, dropping the oldest', () => {
  const el = createEventLog({ cap: 3 });
  for (let i = 0; i < 10; i++) el.log('step', { tick: i, outcome: `#${i}` });
  const all = el.entries();
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((e) => e.outcome), ['#7', '#8', '#9'], 'kept the last 3');
});

test('recent returns the tail in order for the overlay', () => {
  const el = createEventLog();
  for (let i = 0; i < 30; i++) el.log('step', { outcome: `#${i}` });
  const r = el.recent(20);
  assert.equal(r.length, 20);
  assert.equal(r[0].outcome, '#10');
  assert.equal(r[19].outcome, '#29');
});

test('serialize/restore round-trips the buffer', () => {
  const el = createEventLog();
  el.log('combat', { mode: 'overworld', seed: 7, outcome: 'win' });
  el.log('rest', { mode: 'overworld', outcome: 'camp' });
  const snap = JSON.parse(JSON.stringify(el.serialize()));
  const back = createEventLog();
  back.restore(snap);
  assert.deepEqual(back.entries(), el.entries());
});

test('the default cap is 200 and restore tolerates a missing/old snapshot', () => {
  assert.equal(EVENTLOG_CAP, 200);
  const el = createEventLog();
  el.log('x');
  assert.doesNotThrow(() => el.restore(undefined));
  assert.doesNotThrow(() => el.restore({}));
  assert.equal(el.size, 1, 'a bad snapshot leaves the log untouched');
});
