// sim.js — the placeholder M1 content that makes the cycle spine resolve end-to-end. This is the
// COMMIT/RAID/REPORT logic cycle.js delegates to. It is pure (mutates only the working clone the
// spine hands it) and clock-free; all chance comes from the per-cycle seeded RNG.
//
// M1 STATUS: this economy is deliberately thin and placeholder. Excavation (M2), the real staff
// model (M3), the raid resolver (M4) and the bureaucratic ladder (M5) replace most of it. What is
// real and permanent here is the SHAPE: income and orders resolve in COMMIT, a raid resolves in
// RAID, payday and consequences and the loss check resolve in REPORT, and every report line pairs
// prose with a number (the flavour-pairing law, DIRECTIONS fold 20).
import { CONFIG, activeStaff, createStaff, nextId, ARCHETYPE, scoreOf, countClaimed, facilityDefense } from './model.js';
import { applyExcavation, spreadClaim, countClaimedGold, countExcavated } from './grid.js';
import { refreshRooms } from './rooms.js';
import { attractApplicants, runNeeds, housingCapacity } from './staff.js';
import { resolveRaid as resolveRaidM4 } from './raid.js';
import { runLadder } from './ladder.js';

// Push a report line. Every line carries BOTH an instrument half (`numeric`, exact) and a prose
// half (`text`, deflecting, in-voice, no em-dash). `cause` cites a state the player could have
// changed (backward attribution, DIRECTIONS fold 9). `kind` lets the consequence test enumerate.
function pushLine(report, { kind, numeric, text, cause = null }) {
  report.lines.push({ kind, numeric, text, cause });
}

// ---- COMMIT: income lands, queued orders tick down and complete, territory spreads --------------
export function applyCommit(facility, rng, report) {
  // Advance every open order. On completion, apply its effect.
  let carved = 0;
  for (const order of facility.orders) {
    if (order.status === 'done' || order.status === 'cancelled') continue;
    order.status = 'in-progress';
    order.cyclesRemaining -= 1;
    if (order.cyclesRemaining <= 0) {
      order.cyclesRemaining = 0;
      order.status = 'done';
      if (order.kind === 'fortify') {
        facility.fortify += CONFIG.orders.fortify.amount;
        pushLine(report, {
          kind: 'order-complete',
          numeric: `Works order ${order.id} completed: fortification +${CONFIG.orders.fortify.amount} (now ${facility.fortify}).`,
          text: 'The fortification works are recorded as complete to the standard then in force.',
        });
      } else if (order.kind === 'excavate') {
        if (applyExcavation(facility, order.target.x, order.target.y)) carved += 1;
      } else if (order.kind === 'fabricate') {
        // KEEP #6: what comes off the line is a THING, entered in the works register, not a number
        // added to a total. Doors and traps alternate so the register reads as a list of items the
        // facility owns rather than as a defence counter under another name.
        const works = facility.works;
        const kind = works.length % 2 === 0 ? 'door set' : 'deterrent device';
        const defense = Math.max(1, Math.round(CONFIG.orders.fabricate.amount * (order.quality || 1)));
        works.push({ id: order.id, kind, defense });
        pushLine(report, {
          kind: 'order-complete',
          numeric: `Works order ${order.id} completed: ${kind} installed, defence +${defense} (works now ${works.length}, defence ${facilityDefense(facility)}).`,
          text: 'The manufactured item is recorded as installed to the standard then in force. Its performance is not warranted against any particular class of visitor.',
        });
      } else if (order.kind === 'repair') {
        const before = facility.lossObject.condition;
        facility.lossObject.condition = Math.min(100, before + CONFIG.orders.repair.restore);
        pushLine(report, {
          kind: 'order-complete',
          numeric: `Works order ${order.id} completed: Cornerstone repair +${facility.lossObject.condition - before} (now ${facility.lossObject.condition}/100).`,
          text: 'The remedial works to the loss object are recorded as complete to the standard then in force.',
        });
      }
    }
  }

  // Claimed territory spreads into what has been carved (KEEP #7).
  const newlyClaimed = spreadClaim(facility);
  // Newly claimed ground can complete a department; recompute the room list and the gold ceiling.
  if (carved > 0 || newlyClaimed > 0) refreshRooms(facility);
  // The claims backlog: carved cells not yet claimed. It feeds forward as pending work.
  report.claimsBacklog = countExcavated(facility) - countClaimed(facility);
  if (carved > 0 || newlyClaimed > 0) {
    pushLine(report, {
      kind: 'excavation',
      numeric: `Cycle ${report.cycle}: ${carved} cell(s) carved, ${newlyClaimed} cell(s) claimed.`,
      text: 'The works are recorded against the section drawing. Claimed ground is held at the standard then in force.',
    });
  }

  // Income. Once a gold seam is worked the founding charter stipend lapses (fold 11); until then the
  // stipend is the only tap. Income is capped at treasury capacity; overflow is lost.
  const claimedGold = countClaimedGold(facility);
  const income =
    claimedGold > 0 ? claimedGold * CONFIG.terrain.goldPerSeamPerCycle : CONFIG.bootstrap.charterStipend;
  const before = facility.treasury.gold;
  facility.treasury.gold = Math.min(before + income, facility.treasury.capacity);
  const received = facility.treasury.gold - before;
  pushLine(report, {
    kind: 'income',
    numeric:
      claimedGold > 0
        ? `Cycle ${report.cycle}: gold receipts +${received}g from ${claimedGold} seam(s). Treasury ${facility.treasury.gold}/${facility.treasury.capacity}g.`
        : `Charter stipend cycle ${report.cycle}: +${received}g. Treasury ${facility.treasury.gold}/${facility.treasury.capacity}g.`,
    text:
      claimedGold > 0
        ? 'Receipts from the worked seams are recorded. The founding stipend has lapsed accordingly.'
        : 'The founding stipend was received against the standing charter. No further entitlement is implied.',
  });

  // Conversion (KEEP #9): held captives convert into working staff over cycles, if a bed is free.
  let converted = 0;
  const remaining = [];
  for (const captive of facility.captives) {
    captive.cyclesToConvert -= 1;
    if (captive.cyclesToConvert <= 0 && activeStaff(facility).length < housingCapacity(facility)) {
      facility.staff.push(createStaff({ id: nextId(facility, 'staff'), archetype: ARCHETYPE.DRUDGE }));
      converted += 1;
    } else {
      remaining.push(captive);
    }
  }
  facility.captives = remaining;
  if (converted > 0) {
    pushLine(report, {
      kind: 'conversion',
      numeric: `Cycle ${report.cycle}: ${converted} detainee(s) converted to staff. Crew ${activeStaff(facility).length}.`,
      text: 'The detainee has been entered on the roll as a member of the workforce. The change of status is treated as voluntary.',
    });
  }

  // Rooms attract applicants (KEEP #3): a department with an open post and a bed free draws staff.
  attractApplicants(facility, rng, report, pushLine);
  return facility;
}

// ---- RAID: delegated to the M4 resolver (party, approach path, watchable step-log) --------------
export function resolveRaid(facility, rng, report) {
  return resolveRaidM4(facility, rng, report, pushLine);
}

// ---- REPORT: payday, its consequences, and the loss check --------------------------------------
export function runReport(facility, rng, report) {
  runPayday(facility, rng, report);
  runNeeds(facility, rng, report, pushLine);
  runLadder(facility, rng, report, pushLine); // serve/answer/expire instruments; escalate or soften
  checkTermination(facility, report);

  // The tenure counters advance once per resolved cycle. Solvency low-water mark tracks the score.
  facility.tenure.cyclesSurvived += 1;
  facility.tenure.lowestSolvency = Math.min(facility.tenure.lowestSolvency, facility.treasury.gold);

  // On close, record the score (tenure + solvency; Ray-ratified, no win screen).
  if (facility.status !== 'active' && facility.score == null) {
    facility.score = scoreOf(facility);
    pushLine(report, {
      kind: 'score',
      numeric: `Closing score: ${facility.score} (cycles survived ${facility.tenure.cyclesSurvived}, solvency at close ${Math.max(0, facility.treasury.gold)}g).`,
      text: 'The tenure is recorded and closed. No commendation attaches to the outcome; the figure is a record, not a result.',
    });
  }
  return facility;
}

function runPayday(facility, rng, report) {
  if (report.cycle % CONFIG.payday.everyNCycles !== 0) return;

  const crew = activeStaff(facility);
  const owed = crew.reduce((sum, s) => sum + s.wage, 0);
  let disbursed = 0;
  let paid = 0;

  // Pay post by post in a stable order until the gold will not cover the next wage.
  for (const s of crew) {
    if (facility.treasury.gold >= s.wage) {
      facility.treasury.gold -= s.wage;
      disbursed += s.wage;
      paid += 1;
      s.missedPaydays = 0;
    } else {
      s.missedPaydays += 1;
    }
  }
  facility.payroll.lastPaidCycle = report.cycle;

  pushLine(report, {
    kind: 'payday',
    numeric: `Payday cycle ${report.cycle}: ${paid}/${crew.length} posts paid, ${disbursed}g disbursed of ${owed}g owed.`,
    text:
      paid === crew.length
        ? 'Payroll was observed and closed in full.'
        : 'The remainder have been issued a written explanation, which they have acknowledged receipt of.',
  });

  // Grievances at two consecutive missed paydays; a quit roll at three (fold 15), never below the
  // skeleton-crew floor (fold 11): the last of them stay, unpaid and grieving, rather than quit.
  let grievancesFiled = 0;
  for (const s of crew) {
    if (s.missedPaydays >= CONFIG.payday.grievanceAtMissed && s.status !== 'grieving') {
      s.status = 'grieving';
      s.grievances.push({ cycle: report.cycle, reason: 'pay' });
      grievancesFiled += 1;
    }
  }
  if (grievancesFiled > 0) {
    report.grievancesFiled += grievancesFiled;
    pushLine(report, {
      kind: 'grievance',
      numeric: `Cycle ${report.cycle}: ${grievancesFiled} grievance(s) filed for deferred pay.`,
      text: 'The grievances have been logged and acknowledged. Their acknowledgement does not constitute a finding.',
      cause: 'Two consecutive paydays were deferred.',
    });
  }

  // Separation (resignation and defection) is handled by morale in runNeeds, which factors deferred
  // pay through missedPaydays. Payday only pays and files the pay grievance.
}

function checkTermination(facility, report) {
  if (facility.status !== 'active') return;
  if (facility.lossObject.condition <= 0 || facility.ladder.condemned) {
    facility.status = 'condemned';
    pushLine(report, {
      kind: 'terminal',
      numeric: `Cycle ${report.cycle}: Cornerstone condition ${facility.lossObject.condition}/100. Tenure closed by condemnation.`,
      text: facility.ladder.condemned
        ? 'A condemnation order was allowed to stand. The premises are condemned and the tenure is at an end.'
        : 'The premises are condemned. The charter is treated as breached and the tenure is at an end.',
    });
  } else if (facility.treasury.gold < 0) {
    facility.status = 'insolvent';
    pushLine(report, {
      kind: 'terminal',
      numeric: `Cycle ${report.cycle}: treasury ${facility.treasury.gold}g. Tenure closed.`,
      text: 'The facility is insolvent. Obligations exceed the treasury and the tenure is at an end.',
    });
  }
}
