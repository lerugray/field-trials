// v1 release configuration. These named seams are inert until a post-v1 build
// supplies a separately reviewed implementation and explicitly enables it.

const BASE_RULESET_ID = 'base-v1';
const APP_VERSION = '1.0.0-rc.2';
const BUILD_STAMP = 'rc2-20260808';

const DORMANT_VARIANT_HOOKS = Object.freeze({
  combatResolver: Object.freeze({ id: 'crt-dice-odds', enabled: false, implementation: null }),
  displayRenderer: Object.freeze({ id: 'display-1981', enabled: false, implementation: null }),
  informationReferee: Object.freeze({ id: 'fog-referee', enabled: false, implementation: null })
});

function validateReleaseHooks(hooks = DORMANT_VARIANT_HOOKS) {
  for (const hook of Object.values(hooks)) {
    if (hook.enabled || hook.implementation !== null) {
      throw new Error(`Post-v1 hook must remain dormant: ${hook.id}`);
    }
  }
  return true;
}

export { APP_VERSION, BUILD_STAMP, BASE_RULESET_ID, DORMANT_VARIANT_HOOKS, validateReleaseHooks };
