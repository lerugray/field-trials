// Medals + the in-level medal-pace indicator + the performance gate — M5's
// "how well am I doing, and what does it unlock" layer. Three pieces, all pure:
//
//   1. A medal for a finished level: score measured against what that level had to
//      GIVE (its potential), not an absolute number — so a light level and a heavy
//      one are both winnable clean.
//   2. A live pace read while flying: project the final score from progress so far
//      and report which medal you are ON TRACK for (the visible in-level indicator
//      DESIGN-SEED asks for at the branch decision).
//   3. The performance gate: a branch into deeper danger opens only if you earned a
//      medal — but the calmer branch is ALWAYS open, so performance is a reward, a
//      good run reaching further, never a wall that strands a struggling pilot.
//
// Headless-testable; no rendering, no timing.

export const MEDALS = ['none', 'bronze', 'silver', 'gold'];

// A medal is earned at this fraction of the level's potential score.
export const MEDAL_FRACTION = { bronze: 0.35, silver: 0.6, gold: 0.85 };

// UI styling for each medal (label + accent). Shape/label always carries the read
// (accessibility law); color is the accent only.
export const MEDAL_STYLE = {
  none:   { label: '—',      color: '#6f8a92' },
  bronze: { label: 'BRONZE', color: '#d3894a' },
  silver: { label: 'SILVER', color: '#cfd6dd' },
  gold:   { label: 'GOLD',   color: '#ffd24a' },
};

// Where medal rank r sits on the ladder (none=0 .. gold=3).
export function rankOf(medal) {
  const i = MEDALS.indexOf(medal);
  return i < 0 ? 0 : i;
}

// The most score a level can give: every enemy killed + every score cache grabbed.
// Heal pods carry 0 score, so they don't inflate the target.
export function levelPotential(level) {
  let total = 0;
  for (const e of level.enemies || []) total += e.score || 0;
  for (const p of level.pickups || []) total += p.score || 0;
  return total;
}

// The medal a score of `score` earns against a level worth `potential`. A level
// with nothing to score (all heal pods) can't be missed — completing it is gold.
export function medalFor(score, potential) {
  const frac = potential > 0 ? score / potential : 1;
  if (frac >= MEDAL_FRACTION.gold) return 'gold';
  if (frac >= MEDAL_FRACTION.silver) return 'silver';
  if (frac >= MEDAL_FRACTION.bronze) return 'bronze';
  return 'none';
}

// The live pace read. `progress` is the fraction of the level flown (0..1). Project
// the final score by linear extrapolation (capped at the potential — you can't out-
// score what's there) and report the medal that pace lands. Before any meaningful
// progress the pace is unknown ('none', projected 0).
export function medalPace(score, progress, potential) {
  if (!(progress > 0.02)) return { medal: 'none', projected: 0 };
  const projected = Math.min(potential, Math.round(score / progress));
  return { medal: medalFor(projected, potential), projected };
}

// The performance gate applied to a branch decision. `choices` is the list of
// destination nodes; `medalEarned` is the medal from the level just flown. Returns
// the same choices tagged { node, locked }: a branch into a HIGHER threat than the
// calmest option is "elite" and locked until a medal (bronze+) is earned. The
// lowest-threat branch is never locked, so there is always a way onward.
export function evaluateChoices(choices, medalEarned) {
  if (!choices.length) return [];
  const minThreat = Math.min(...choices.map((c) => c.threat));
  const earned = rankOf(medalEarned) >= rankOf('bronze');
  return choices.map((node) => ({
    node,
    // elite = deeper danger than the safe branch; locked only if unearned
    locked: node.threat > minThreat && !earned,
  }));
}
