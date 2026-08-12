// cp-018 — chronicle export from the record overlay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventLog } from '../src/engine/eventlog.js';

test('toText returns a non-empty, well-formed chronicle', () => {
  const el = createEventLog();
  el.log('encounter', { mode: 'dungeon', outcome: 'fight vs Rat', tick: 5 });
  el.log('combat-round', { outcome: 'Round 1 - Rat strikes Initiate: rolled 1, dealt 1, you 9/10', tick: 6 });
  el.log('death', { mode: 'dungeon', outcome: 'Initiate fell', tick: 7 });

  const text = el.toText();
  assert.ok(text.length > 0, 'exported chronicle should not be empty');
  assert.ok(text.includes('tick 5 · encounter: fight vs Rat'));
  assert.ok(text.includes('tick 6 · combat-round: Round 1 - Rat strikes Initiate'));
  assert.ok(text.includes('tick 7 · death: Initiate fell'));
  assert.ok(!text.includes('\n\n'), 'no blank lines in the default export');
});

test('toText can omit ticks', () => {
  const el = createEventLog();
  el.log('rest', { outcome: 'camp 1→5 hp' });
  const text = el.toText({ tick: false });
  assert.ok(text.includes('rest: camp 1→5 hp'));
  assert.ok(!text.includes('tick'));
});

test('toText remains valid after the ring drops old entries', () => {
  const el = createEventLog({ cap: 3 });
  for (let i = 0; i < 10; i++) el.log('step', { outcome: `#${i}` });
  const text = el.toText();
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('#7'));
  assert.ok(lines[2].includes('#9'));
});
