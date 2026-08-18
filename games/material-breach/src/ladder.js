// ladder.js — the bureaucratic escalation ladder (M5), the game's defining mechanic. Adventurers
// escalate not by force but by paperwork: a Royal Surveyor, then a Guild Auditor, then a Licensing
// Inspector, each serving a non-combat instrument (a schedule of dilapidations, a tax lien, a
// condemnation order) that must be answered administratively. Killing the officer never withdraws
// the notice. Escalation advances on missed deadlines and unresolved findings, never on elapsed
// time alone (fold 13). Pure and clock-free.
import { CONFIG, RUNG, INSTRUMENT, createNotice, nextId } from './model.js';

// Plain-language names for the officers, for the register (LEGIBILITY LAW: no bare rung tokens).
export const OFFICER = Object.freeze({
  surveyor: 'Royal Surveyor',
  auditor: 'Guild Auditor',
  inspector: 'Licensing Inspector',
});
export const INSTRUMENT_NAME = Object.freeze({
  surveyor: 'schedule of dilapidations',
  auditor: 'tax lien',
  inspector: 'condemnation order',
});

function nextRung(rung) {
  const i = RUNG.indexOf(rung);
  return RUNG[Math.min(i + 1, RUNG.length - 1)];
}
function prevRung(rung) {
  const i = RUNG.indexOf(rung);
  return RUNG[Math.max(i - 1, 0)];
}

// The one currently-served, unanswered notice, if any.
export function activeNotice(f) {
  return f.notices.find((n) => n.status === 'served') || null;
}

// runLadder(f, rng, report, pushLine): the per-cycle life of the ladder. Accrue pressure from
// unresolved findings, tick and expire served notices, soften after timely answered instruments,
// and dispatch the next officer when pressure is high and no notice stands.
export function runLadder(f, rng, report, pushLine) {
  const cfg = CONFIG.ladder;
  const L = f.ladder;

  // 1) Each signed-over incident produces a finding. A breach produces one additional finding.
  // Findings are cycle-driven state, never wall-clock input; an unsigned desk remains unchanged.
  if (f.lastRaid?.cycle === report.cycle) L.pressure += cfg.pressurePerIncident;
  if (report.structuralDamage > 0) L.pressure += cfg.pressurePerBreach;

  // 2) Tick served notices; the lapsed expire, with a consequence. The deadline is on the notice
  // itself (fold 10). An expired condemnation closes the tenure.
  let expired = 0;
  for (const n of f.notices) {
    if (n.status !== 'served') continue;
    n.cyclesRemaining -= 1;
    if (n.cyclesRemaining <= 0) {
      n.status = 'expired';
      expired += 1;
      L.pressure += 2;
      // The consequence fits the instrument. A lapsed schedule of dilapidations hits the structure;
      // a lapsed tax lien SEIZES funds (and can carry the treasury below zero into insolvency, the
      // only path to a negative treasury); a lapsed condemnation order closes the tenure.
      let consequence;
      if (n.rung === 'auditor') {
        f.treasury.gold -= cfg.answerCost.auditor; // seizure, may go negative
        consequence = `Funds seized ${cfg.answerCost.auditor}g. Treasury ${f.treasury.gold}g.`;
      } else if (n.rung === 'inspector') {
        L.condemned = true;
        consequence = `Cornerstone condition ${f.lossObject.condition}/100.`;
      } else {
        f.lossObject.condition = Math.max(0, f.lossObject.condition - cfg.ignoreConditionHit);
        consequence = `Cornerstone condition ${f.lossObject.condition}/100.`;
      }
      pushLine(report, {
        kind: 'notice-expired',
        numeric: `Cycle ${report.cycle}: ${INSTRUMENT_NAME[n.rung]} (notice ${n.id}) lapsed unanswered. ${consequence}`,
        text: 'The unanswered instrument is recorded as accepted by inaction. The consequence attaches to the premises, not to any individual.',
        cause: 'The deadline stamped on the notice was allowed to elapse.',
      });
    }
  }

  // 3) The comeback lever: only a notice answered during this cycle advances the streak. Quiet
  // cycles do not count. Three timely answered instruments soften the rung one step (fold 13),
  // while any expiry resets the streak.
  if (expired > 0) {
    L.onTimeStreak = 0;
  } else if (f.notices.some((n) => n.cycleAnswered === report.cycle)) {
    L.onTimeStreak += 1;
    if (L.onTimeStreak >= cfg.softenAfterOnTimeCycles) {
      const was = L.rung;
      L.rung = prevRung(L.rung);
      L.onTimeStreak = 0;
      pushLine(report, {
        kind: 'ladder-soften',
        numeric: `Cycle ${report.cycle}: standing softened from ${OFFICER[was] || was} to ${OFFICER[L.rung] || 'no active officer'} after ${cfg.softenAfterOnTimeCycles} clean cycles.`,
        text: "The facility's standing is revised downward. No commendation attaches; the revision is procedural.",
      });
    }
  }

  // 4) Dispatch the next officer when findings reach the applicable threshold and the prior rung
  // has held its full plateau. The first threshold controls onset; later thresholds control cadence.
  const latestService = f.notices.reduce((latest, n) => Math.max(latest, n.cycleServed), 0);
  const threshold = L.rung === 'none' ? cfg.firstPressureToServe : cfg.pressureToServe;
  const plateauComplete = latestService === 0 || report.cycle - latestService >= cfg.minimumRungGap;
  if (L.pressure >= threshold && plateauComplete && !activeNotice(f)) {
    const rung = nextRung(L.rung);
    L.rung = rung;
    L.pressure = 0;
    const deadline = cfg.deadlines[rung];
    const notice = createNotice({ id: nextId(f, 'notice'), rung, deadlineCycles: deadline, cycleServed: report.cycle });
    f.notices.push(notice);
    pushLine(report, {
      kind: 'notice-served',
      numeric: `Cycle ${report.cycle}: a ${OFFICER[rung]} served a ${INSTRUMENT_NAME[rung]} (notice ${notice.id}). Answer due within ${deadline} cycles.`,
      text: 'The officer entered the premises without presenting credentials at the counter. The instrument has been accepted for filing. He has been admitted.',
      cause: 'Unresolved findings accrued to the threshold for a served instrument.',
    });
  }
}

// answerNotice(f, noticeId) -> { ok, reason? }. Answer a served instrument administratively: pay the
// remediation and the notice is discharged. Answering a condemnation order withdraws it (the secret
// completion). This is a player action during ADMIN; it does not advance the sim.
export function answerNotice(f, noticeId) {
  if (f.status !== 'active') return { ok: false, reason: 'the tenure is closed' };
  const n = f.notices.find((x) => x.id === noticeId);
  if (!n) return { ok: false, reason: 'no such notice' };
  if (n.status !== 'served') return { ok: false, reason: 'the notice is not open' };
  const cost = CONFIG.ladder.answerCost[n.rung];
  if (f.treasury.gold < cost) {
    return { ok: false, reason: `insufficient treasury: ${f.treasury.gold}g of ${cost}g required to answer` };
  }
  f.treasury.gold -= cost;
  if (n.rung === 'inspector') {
    n.status = 'withdrawn'; // a condemnation withdrawn administratively (the secret)
    f.ladder.condemnationWithdrawn = true;
  } else {
    n.status = 'answered';
  }
  n.cycleAnswered = f.cycle.number;
  return { ok: true, cost, instrument: INSTRUMENT_NAME[n.rung] };
}
