import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summonAllowed } from '../src/ui/battle-gate.js';

test('summon is allowed when no battle overlay is visible', () => {
  const res = summonAllowed({ battleVisible: false });
  assert.equal(res.ok, true);
  assert.equal(res.reason, undefined);
});

test('summon is blocked while the battle overlay is visible', () => {
  const res = summonAllowed({ battleVisible: true });
  assert.equal(res.ok, false);
  assert.ok(res.reason);
  assert.ok(res.reason.includes('bout'));
});
