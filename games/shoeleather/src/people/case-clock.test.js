import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaseClock } from './case-clock.js';
import { buildToyCase } from '../case/fixtures/toy-case.js';

test('advance applies counter-moves in order and closes paths', () => {
  const clock = new CaseClock({ counterMoves: [
    { id: 'a', closesPath: 'doorman' },
    { id: 'b', closesPath: 'coroner-report' },
  ] });
  assert.equal(clock.advance().id, 'a');
  assert.ok(clock.isPathClosed('doorman'));
  assert.equal(clock.count, 1);
  assert.equal(clock.advance().id, 'b');
  assert.ok(clock.isPathClosed('coroner-report'));
  assert.equal(clock.advance(), null); // no more scripted moves
  assert.equal(clock.count, 3);
});

test('open paths and acquirability reflect closures', () => {
  const c = buildToyCase();
  const fact = c.fact('f-chef-at-restaurant'); // paths: doorman, valet-log
  const clock = new CaseClock({ counterMoves: [{ id: 'a', closesPath: 'doorman' }] });
  clock.advance();
  assert.deepEqual(clock.openPaths(fact), ['valet-log']);
  assert.ok(clock.isFactAcquirable(fact)); // still one path open
});

test('always-solvable: a counter-move may not close a fact\'s last path', () => {
  const c = buildToyCase();
  // Close doorman first (ok), then try to close valet-log (the last path) -> refused.
  const clock = new CaseClock({ counterMoves: [
    { id: 'a', closesPath: 'doorman' },
    { id: 'b', closesPath: 'valet-log' },
  ] });
  clock.advance(c);
  assert.throws(() => clock.advance(c), /last path/);
});

test('round-trips through JSON', () => {
  const moves = [{ id: 'a', closesPath: 'doorman' }];
  const clock = new CaseClock({ counterMoves: moves });
  clock.advance();
  const c2 = CaseClock.fromJSON(JSON.parse(JSON.stringify(clock.toJSON())), moves);
  assert.equal(c2.count, 1);
  assert.ok(c2.isPathClosed('doorman'));
});
