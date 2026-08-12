// Negotiation — the talk/recruit layer (CHARACTER-DESIGN-2026-08-02, "stat-keyed
// negotiation, SMT-style, mid-encounter"). Your statline decides WHICH approaches
// exist against a given being; the being's interaction profile decides which
// verbs bite and how hard.
//
// This is pure verb-gating, faithful to the lock: an approach APPEARS iff your
// rank in its stat meets the being's resistance for that verb. There is no
// stat-scaled roll — availability IS capability, so a shown approach succeeds.
// The tension lives in whether you have the approach at all (different
// statlines recruit different beings — roster composition is the build) and in
// capacity/upkeep, not in a dice check the stats secretly weight.
import { rankIndex, VERB_STAT } from './character.js';

// A being's per-verb difficulty maps to the rank you must reach to attempt it.
// 'open' beings yield to a STEADY hand; 'hard' ones demand SHARP.
export const DIFFICULTY_RANK = { open: 'STEADY', hard: 'SHARP' };

// availableApproaches(character, being): the approaches this character can make
// against this being. Empty for a sacred being (refuses all verbs), and empty
// for any verb whose stat rank falls short of the being's resistance.
export function availableApproaches(character, being) {
  if (!being || being.sacred) return [];
  const profile = being.interaction || {};
  const out = [];
  for (const verb of Object.keys(VERB_STAT)) {
    if (!(verb in profile)) continue; // this verb doesn't bite this being
    const difficulty = profile[verb];
    const need = DIFFICULTY_RANK[difficulty] ?? 'STEADY';
    const stat = VERB_STAT[verb];
    const have = character.rankIndex(stat);
    if (have >= rankIndex(need)) {
      out.push({ verb, stat, difficulty, requiredRank: need, margin: have - rankIndex(need) });
    }
  }
  return out;
}

// Whether a specific verb is a legal approach right now.
export function canApproach(character, being, verb) {
  return availableApproaches(character, being).some((a) => a.verb === verb);
}

// resolveApproach(character, being, verb, roster?): attempt the approach.
//   - illegal verb (not shown for this pairing) -> { ok:false, reason }
//   - legal + being recruitable + roster has room -> recruit (follower added)
//   - legal + being recruitable + roster FULL     -> parley (it stands down)
//   - legal + being not recruitable               -> parley
// A legal approach never "fails" (availability is capability); the only reason a
// win doesn't become a follower is that you have no room for it.
export function resolveApproach(character, being, verb, roster = null) {
  if (!canApproach(character, being, verb)) {
    return { ok: false, reason: 'unavailable' };
  }
  if (roster && being.recruitable && !being.sacred) {
    const r = roster.recruit(being);
    if (r.ok) return { ok: true, outcome: 'recruit', verb, follower: r.follower };
    // full (or a late refusal): the approach still lands — they stand down.
    return { ok: true, outcome: 'parley', verb, reason: r.reason };
  }
  return { ok: true, outcome: 'parley', verb };
}
