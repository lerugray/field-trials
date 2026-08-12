// The rank ladder + economy pressure (M5). This is the career layer that sits on
// top of a single bout: it decides WHICH rung you fight on, what entering costs,
// when you are OBLIGED to compete (mandatory meets on the week calendar), and how
// a broke or beaten rancher RECOVERS without the game ever dead-ending.
//
// Two promises shape every number here:
//   1. ECONOMY PRESSURE — climbing costs money (entry fees rise by rung), so a
//      careless rancher feels the purse tighten and must choose training vs rest
//      vs banking a prize.
//   2. NO SOFTLOCK — the E rung is ALWAYS free and its loser still banks a
//      consolation, so from ANY money state there is a legal, non-negative bout.
//      Missing a mandatory meet is a fine and a scolding, never death, never a
//      demotion you can't climb back from. First-generation economy is generous.
//
// Everything here is PURE: it reads and returns plain estate/career objects, no
// RNG, no clock. The bout's randomness lives in battle.js; the calendar is
// deterministic bookkeeping.

import { battleReward } from './battle.js';

// --- the ladder --------------------------------------------------------------
// Order matters: index in RANK_ORDER is the rung height. `fee` is what an
// OPTIONAL bout at that rung costs; `promoteAfter` is how many wins AT THAT RUNG
// lift you to the next. C is the current ceiling (promoteAfter: Infinity).
export const RANK_ORDER = ['E', 'D', 'C'];
export const RANK_META = {
  E: { fee: 0, promoteAfter: 3, label: 'E' },
  D: { fee: 40, promoteAfter: 4, label: 'D' },
  C: { fee: 80, promoteAfter: Infinity, label: 'C' },
};

// A mandatory meet comes due every this-many weeks; missing it is a fine.
export const MANDATORY_INTERVAL = 4;
export const MISS_FINE = 30; // money penalty for skipping a meet (floored at 0)
export const MISS_STRESS = 12; // the pet frets when you no-show (app applies it)
export const LOG_CAP = 24; // keep the career log bounded

export function rankIndex(rank) {
  const i = RANK_ORDER.indexOf(rank);
  return i < 0 ? 0 : i;
}
export function nextRank(rank) {
  const i = rankIndex(rank);
  return i < RANK_ORDER.length - 1 ? RANK_ORDER[i + 1] : rank;
}
export function isTopRank(rank) {
  return rankIndex(rank) >= RANK_ORDER.length - 1;
}

// --- the career block (persists on the estate) -------------------------------
// A fresh career starts at E with its first mandatory meet scheduled a few weeks
// out (relative to the pet's current age, so a migrated older pet isn't instantly
// "overdue"). `metCycle` tracks whether the pet has competed since the last meet
// was scheduled; `rankWins` counts wins at the CURRENT rung toward promotion.
export function freshCareer(age = 1) {
  return {
    rank: 'E',
    rankWins: 0,
    nextMandatory: age + MANDATORY_INTERVAL,
    metCycle: false,
    log: [],
  };
}

// Repair/default a career block idempotently (the save migration path).
export function withCareer(career, age = 1) {
  const c = career && typeof career === 'object' ? career : {};
  const rank = RANK_ORDER.includes(c.rank) ? c.rank : 'E';
  return {
    rank,
    rankWins: Number.isFinite(c.rankWins) ? Math.max(0, Math.floor(c.rankWins)) : 0,
    nextMandatory: Number.isFinite(c.nextMandatory) ? c.nextMandatory : age + MANDATORY_INTERVAL,
    metCycle: c.metCycle === true,
    log: Array.isArray(c.log) ? c.log.filter(isLogEntry).slice(-LOG_CAP) : [],
  };
}

function isLogEntry(e) {
  return e && typeof e === 'object' && typeof e.text === 'string';
}

// --- entry: which rung, and what it costs ------------------------------------
// The player fights at their current rung by default. If they cannot afford the
// optional fee, we drop them to the always-free E rung rather than block the
// button — that fallback is the softlock escape valve. A mandatory meet that is
// DUE is fee-waived (the meet is sponsored), so no-shows are never about money.
export function feeFor(estate, rank) {
  return (RANK_META[rank] || RANK_META.E).fee;
}

export function isMandatoryDue(estate, creatureAge) {
  const car = estate.career || {};
  return creatureAge >= (car.nextMandatory ?? Infinity);
}

// Decide the rung + fee for pressing "Enter bout". Returns { rank, fee, waived,
// reason }. Never returns something the estate can't pay: fee <= estate.money.
export function resolveEntry(estate, creatureAge) {
  const car = estate.career || freshCareer(creatureAge);
  const money = estate.money || 0;
  const due = isMandatoryDue(estate, creatureAge);
  const rank = car.rank || 'E';

  // A due mandatory meet at the current rung is free.
  if (due) return { rank, fee: 0, waived: true, reason: 'mandatory meet' };

  const fee = feeFor(estate, rank);
  if (fee <= money) return { rank, fee, waived: false, reason: 'entry fee' };

  // Can't afford this rung's fee: fall back to the free E rung (escape valve).
  return { rank: 'E', fee: 0, waived: false, reason: 'entry fee - dropped to free E rung' };
}

// Deduct an entry fee from the estate (call when a bout actually opens).
export function payEntry(estate, fee) {
  return { ...estate, money: Math.max(0, (estate.money || 0) - (fee || 0)) };
}

// --- settle a bout into the career -------------------------------------------
// After battle.js's settleBattle has folded prize + record + wear, fold the
// CAREER consequences: a win at the current rung advances promotion, any bout
// satisfies the mandatory-meet obligation for this cycle, and a log line is
// appended. Returns { career, promoted, newRank }. Pure.
export function recordBout(career, { rank, won, reward, week }) {
  const car = withCareer(career, 1);
  let { rankWins } = car;
  let curRank = car.rank;
  let promoted = false;

  // Only wins at the player's CURRENT rung count toward promotion; grinding a
  // lower rung for money is allowed but doesn't lift you.
  if (won && rank === curRank) {
    rankWins += 1;
    const need = (RANK_META[curRank] || RANK_META.E).promoteAfter;
    if (rankWins >= need && !isTopRank(curRank)) {
      curRank = nextRank(curRank);
      rankWins = 0;
      promoted = true;
    }
  }

  const text = won
    ? `${rank}-rank win (+${reward} 💰)`
    : `${rank}-rank loss (+${reward} 💰 consolation)`;
  const entry = { week: week || 0, rank, kind: won ? 'win' : 'loss', money: reward, text };
  const log = [...car.log, entry].slice(-LOG_CAP);
  if (promoted) {
    log.push({ week: week || 0, rank: curRank, kind: 'promote', money: 0, text: `Promoted to ${curRank} rank!` });
  }

  return {
    career: { ...car, rank: curRank, rankWins, metCycle: true, log: log.slice(-LOG_CAP) },
    promoted,
    newRank: curRank,
  };
}

// --- the calendar tick -------------------------------------------------------
// Call once per resolved week (with the pet's NEW age). If a mandatory meet has
// come due and the pet did not compete this cycle, apply the miss: a money fine
// (floored, never negative) plus a stress penalty the caller applies to the pet,
// and a log line. Either way, reschedule the next meet and reset the cycle flag
// when a meet passes. Returns { estate, missed, fine, stress, note }.
export function advanceCalendar(estate, newAge) {
  const car = withCareer(estate.career, newAge);
  // Not yet at the deadline: carry on untouched.
  if (newAge < car.nextMandatory) {
    return { estate: { ...estate, career: car }, missed: false, fine: 0, stress: 0, note: null };
  }

  const missed = !car.metCycle;
  let money = estate.money || 0;
  let fine = 0;
  let stress = 0;
  let note = null;
  if (missed) {
    fine = Math.min(MISS_FINE, money);
    money = Math.max(0, money - fine);
    stress = MISS_STRESS;
    // Suppress the log line when the fine is zero (broke rancher): behaviour is
    // unchanged otherwise, and the stress penalty still applies.
    if (fine > 0) {
      note = `Missed the mandatory ${car.rank}-rank meet - fined ${fine} 💰.`;
    }
  }

  const log = (missed && fine > 0)
    ? [...car.log, { week: newAge, rank: car.rank, kind: 'miss', money: -fine, text: note }].slice(-LOG_CAP)
    : car.log;

  const nextCareer = {
    ...car,
    metCycle: false,
    nextMandatory: car.nextMandatory + MANDATORY_INTERVAL,
    log,
  };
  return { estate: { ...estate, money, career: nextCareer }, missed, fine, stress, note };
}

// --- helpers for the UI ------------------------------------------------------
// Wins still needed to promote off the current rung (null at the ceiling).
export function winsToPromote(career) {
  const car = career || {};
  const need = (RANK_META[car.rank] || RANK_META.E).promoteAfter;
  if (!Number.isFinite(need)) return null;
  return Math.max(0, need - (car.rankWins || 0));
}

// Weeks until the next mandatory meet (<=0 means it's due now).
export function weeksToMandatory(career, creatureAge) {
  const car = career || {};
  return (car.nextMandatory ?? Infinity) - creatureAge;
}

// Re-export so the UI can price prizes from one place.
export { battleReward };
