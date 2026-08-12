// M11 Part A inc6 — the register-carried combat SURFACE (directive §4: "all combat
// verbs and outcomes render through the register engine's prose, in-voice, no menu-speak
// on the player surface"). The shell asks this layer for the words it shows: the verb
// LABELS on the choice line (not "fight/talk/flee"), the voiced BEAT after an action, and
// the OUTCOME banner. Strings are authored in-voice per register in data/register/
// combat.json; selection is seeded so a fight's phrasing is deterministic but varied.
//
// Everything returned is [SEED]-marked (hard rule 5) and stripped at draw. This module is
// pure and headless; it holds no state.
import { mulberry32 } from './prng.js';

export function createCombatProse(data = {}) {
  const labels = data.labels || {};
  const beats = data.beats || {};
  const outcomes = data.outcomes || {};
  const approaches = data.approaches || {};
  const responses = data.responses || {};
  const kills = data.kills || {};
  const joins = data.joins || {};

  const pick = (arrOrStr, seed, fallback) => {
    if (Array.isArray(arrOrStr)) {
      if (!arrOrStr.length) return fallback;
      return arrOrStr[Math.floor(mulberry32((seed >>> 0) || 1)() * arrOrStr.length)];
    }
    return arrOrStr || fallback;
  };

  // The short in-voice name for a verb on the choice line (never "fight/talk/flee").
  function label(verb) {
    return labels[verb] || `[SEED] ${verb}`;
  }

  // The voiced line shown after the player commits a verb (the combat note surface).
  function beat(verb, seed = 0) {
    return pick(beats[verb], seed, `[SEED] you ${verb}`);
  }

  // The player's approach line for a combat talk verb (overawe / impress / bargain / bind).
  function approach(verb, seed = 0) {
    return pick(approaches[verb], seed, `[SEED] you ${verb}`);
  }

  // The being's response line for a talk outcome, keyed by class where the register
  // distinguishes classes (recruit / parley / verb-unavailable / talk-hardened).
  function response(key, cls = 'mundane', seed = 0) {
    const norm = String(key).replace(/-/g, '_');
    const byClass = responses[norm] || {};
    const arr = byClass[cls] || byClass.mundane || outcomes[norm] || [];
    return pick(arr, seed, `[SEED] ${norm}`);
  }

  // The banner when a fight ends or a verb is refused. Accepts engine keys with either
  // hyphens or underscores ('flee-fail' | 'flee_fail', 'talk-hardened', 'item-fumble'…).
  function outcome(key, seed = 0) {
    const norm = String(key).replace(/-/g, '_');
    return pick(outcomes[norm], seed, `[SEED] ${norm}`);
  }

  // The C1 kill beat / C2 join beat — one voiced line per CLASS (mundane / strange /
  // uncanny / sacred), banded from the felled-or-turned being's weirdness + sacredness.
  function killLine(cls, seed = 0) { return pick(kills[cls], seed, `[SEED] it falls`); }
  function joinLine(cls, seed = 0) { return pick(joins[cls], seed, `[SEED] it joins you`); }

  // Classify a being record into a kill/join class from what its data affords.
  function classOf(ref) {
    if (!ref) return 'mundane';
    if (ref.sacred) return 'sacred';
    const w = (ref.register && typeof ref.register.weirdness === 'number') ? ref.register.weirdness : 0;
    if (w >= 0.6) return 'uncanny';
    if (w >= 0.3) return 'strange';
    return 'mundane';
  }

  return { label, beat, approach, response, outcome, killLine, joinLine, classOf };
}
