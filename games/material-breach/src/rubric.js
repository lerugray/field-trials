// rubric.js — THE THREE-TIER COMPLETION RUBRIC (DESIGN-SEED §7, verified at M8).
//
// The rubric is wired to the completion hook (collection contract item 7): when a tenure ends, the
// host shell is told which tiers were reached. M1 wired the hook; M8 is where the tiers themselves
// are defined, computed and tested, because until M5 landed the ladder there was nothing to reach.
//
// The seed's three tiers, verbatim:
//
//   finished — complete a full tenure to its terminal condition and file the closing report.
//   mastered — hold the facility past the first Licensing Inspector with the treasury solvent and
//              zero unanswered administrative orders at close.
//   secret   — cause a condemnation order to be WITHDRAWN ADMINISTRATIVELY, without the officer who
//              served it becoming a casualty.
//
// Every tier is computed from the facility's own recorded state, never from a running tally that a
// bug could desynchronise: the notices carry their own statuses, the treasury carries its own
// figure, and the tenure carries its own counters. A rubric that kept its own score would be a
// second source of truth about the game, and the after-action report is the only one there is.
import { RUNG } from './model.js';

/**
 * rubricOf(facility) -> { finished, mastered, secret, reasons }
 *
 * `reasons` explains each verdict in plain language, because the rubric is read by a host shell and
 * by a human reading a proof, and a bare triple of booleans tells neither of them why.
 */
export function rubricOf(f) {
  const closed = f.status !== 'active';
  const notices = f.notices || [];

  // finished: the tenure reached a terminal condition. Both endings count. There is no win screen
  // (Ray-ratified: tenure with a solvency score), so "finished" means the tenure was seen through
  // to its end and the closing report filed, not that anything was beaten.
  const finished = closed && !!f.lastReport;

  // mastered: held PAST the first Licensing Inspector. An inspector's condemnation order that was
  // discharged (answered, and therefore withdrawn) is the record that the facility got past him;
  // an inspector notice still standing, or one that lapsed, is not.
  const inspectorPassed = notices.some((n) => n.rung === 'inspector' && (n.status === 'answered' || n.status === 'withdrawn'));
  const solventAtClose = f.treasury.gold >= 0;
  const unanswered = notices.filter((n) => n.status === 'served').length;
  const mastered = finished && inspectorPassed && solventAtClose && unanswered === 0;

  // secret: a condemnation order withdrawn administratively, with the officer who served it not a
  // casualty. `condemnationWithdrawn` is set by answerNotice when the instrument is an inspector's.
  //
  // ON THE SECOND CLAUSE, PLAINLY: no code path in this game sets `officerCasualty`. Officers are
  // placed on the drawing and are not participants in the raid resolver, so a raid cannot kill one
  // and neither can the player. The clause is therefore a STANDING GUARD against a mechanic that
  // does not exist rather than an active constraint, and the secret tier currently reduces to
  // "withdraw a condemnation administratively". It is written and read anyway, because the day
  // officers become raid participants this is the line that has to already be here, and because
  // quietly dropping a clause from a ratified rubric is how a rubric stops meaning anything.
  // Surfaced in the M8 acceptance dossier rather than left as a comment.
  const officerCasualty = !!f.ladder.officerCasualty;
  const secret = !!f.ladder.condemnationWithdrawn && !officerCasualty;

  return {
    finished,
    mastered,
    secret,
    reasons: {
      finished: finished
        ? `the tenure closed as ${f.status} at cycle ${f.tenure.cyclesSurvived} and the closing report was filed`
        : closed
          ? 'the tenure closed but no closing report was filed'
          : 'the tenure is still running',
      mastered: mastered
        ? 'a Licensing Inspector was answered, the treasury closed solvent and no instrument stood unanswered'
        : [
            inspectorPassed ? null : 'no Licensing Inspector was answered',
            solventAtClose ? null : `the treasury closed at ${f.treasury.gold}g`,
            unanswered === 0 ? null : `${unanswered} instrument(s) stood unanswered at close`,
            finished ? null : 'the tenure has not closed',
          ]
            .filter(Boolean)
            .join('; '),
      secret: secret
        ? 'a condemnation order was withdrawn administratively'
        : officerCasualty
          ? 'a condemnation order was withdrawn, but the officer who served it became a casualty'
          : 'no condemnation order was withdrawn administratively',
    },
  };
}

/** The tiers reached, highest first, as the completion hook reports them. */
export function tiersReached(f) {
  const r = rubricOf(f);
  const out = [];
  if (r.secret) out.push('secret');
  if (r.mastered) out.push('mastered');
  if (r.finished) out.push('finished');
  return out;
}

export const TIERS = Object.freeze(['finished', 'mastered', 'secret']);
export { RUNG };
