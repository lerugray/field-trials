import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_RULESET_ID,
  DORMANT_VARIANT_HOOKS,
  validateReleaseHooks
} from '../src/release-config.js';

test('v1 names the base ruleset and keeps every post-v1 hook dormant', () => {
  assert.equal(BASE_RULESET_ID, 'base-v1');
  assert.deepEqual(Object.keys(DORMANT_VARIANT_HOOKS), [
    'combatResolver',
    'displayRenderer',
    'informationReferee'
  ]);
  assert.ok(Object.values(DORMANT_VARIANT_HOOKS).every(hook => (
    hook.enabled === false && hook.implementation === null
  )));
  assert.equal(validateReleaseHooks(), true);
});

test('release validation rejects an enabled or implemented variant hook', () => {
  assert.throws(() => validateReleaseHooks({
    combatResolver: { id: 'test', enabled: true, implementation: null }
  }), /must remain dormant/);
  assert.throws(() => validateReleaseHooks({
    displayRenderer: { id: 'test', enabled: false, implementation() {} }
  }), /must remain dormant/);
});
