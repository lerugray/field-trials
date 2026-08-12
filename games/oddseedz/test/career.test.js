import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANK_ORDER, RANK_META, MANDATORY_INTERVAL, MISS_FINE, MISS_STRESS,
  rankIndex, nextRank, isTopRank,
  freshCareer, withCareer,
  feeFor, isMandatoryDue, resolveEntry, payEntry,
  recordBout, advanceCalendar,
  winsToPromote, weeksToMandatory,
} from '../src/engine/career.js';
import { makeOpponent } from '../src/engine/battle.js';

test('the ladder is E -> D -> C with rising fees and C at the ceiling', () => {
  assert.deepEqual(RANK_ORDER, ['E', 'D', 'C']);
  assert.equal(RANK_META.E.fee, 0);
  assert.ok(RANK_META.D.fee > RANK_META.E.fee);
  assert.ok(RANK_META.C.fee > RANK_META.D.fee);
  assert.equal(nextRank('E'), 'D');
  assert.equal(nextRank('C'), 'C'); // top stays put
  assert.equal(isTopRank('C'), true);
  assert.equal(isTopRank('E'), false);
  assert.ok(rankIndex('C') > rankIndex('E'));
});

test('a fresh career starts at E with a meet scheduled ahead of the pet', () => {
  const car = freshCareer(1);
  assert.equal(car.rank, 'E');
  assert.equal(car.rankWins, 0);
  assert.equal(car.nextMandatory, 1 + MANDATORY_INTERVAL);
  assert.equal(car.metCycle, false);
  // a migrated older pet is not instantly overdue
  const old = freshCareer(10);
  assert.ok(old.nextMandatory > 10);
});

test('withCareer repairs junk idempotently', () => {
  const clean = withCareer(freshCareer(1), 1);
  assert.deepEqual(withCareer(clean, 1), clean);
  const repaired = withCareer({ rank: 'Z', rankWins: -3, log: 'nope' }, 5);
  assert.equal(repaired.rank, 'E');
  assert.equal(repaired.rankWins, 0);
  assert.deepEqual(repaired.log, []);
});

test('E entry is always free; higher rungs cost money', () => {
  assert.equal(feeFor({}, 'E'), 0);
  assert.ok(feeFor({}, 'D') > 0);
});

test('resolveEntry: a mandatory-due meet is fee-waived at the current rung', () => {
  const estate = { money: 0, career: { ...freshCareer(1), rank: 'D', nextMandatory: 4 } };
  assert.equal(isMandatoryDue(estate, 4), true);
  const e = resolveEntry(estate, 4);
  assert.equal(e.rank, 'D');
  assert.equal(e.fee, 0);
  assert.equal(e.waived, true);
});

test('resolveEntry: broke at a paid rung drops to the free E rung (escape valve)', () => {
  const estate = { money: 5, career: { ...freshCareer(1), rank: 'D', nextMandatory: 99 } };
  const e = resolveEntry(estate, 2);
  assert.equal(e.rank, 'E'); // cannot afford D's 40, so fight E free
  assert.equal(e.fee, 0);
});

test('resolveEntry never returns a fee the estate cannot pay', () => {
  for (const money of [0, 5, 39, 40, 100, 1000]) {
    for (const rank of RANK_ORDER) {
      const estate = { money, career: { ...freshCareer(1), rank, nextMandatory: 99 } };
      const e = resolveEntry(estate, 2);
      assert.ok(e.fee <= money, `fee ${e.fee} must be payable from ${money}`);
    }
  }
});

test('payEntry deducts and never drives money negative', () => {
  assert.equal(payEntry({ money: 100 }, 40).money, 60);
  assert.equal(payEntry({ money: 10 }, 40).money, 0);
});

test('a win at the current rung advances promotion; wins at a lower rung do not', () => {
  let car = freshCareer(1); // E, need 3
  for (let i = 0; i < 2; i++) {
    car = recordBout(car, { rank: 'E', won: true, reward: 60, week: i }).career;
  }
  assert.equal(car.rank, 'E');
  assert.equal(car.rankWins, 2);
  const r = recordBout(car, { rank: 'E', won: true, reward: 60, week: 3 });
  assert.equal(r.promoted, true);
  assert.equal(r.newRank, 'D');
  assert.equal(r.career.rankWins, 0);

  // now at D: an E-rung grind win must NOT count toward D promotion
  const grind = recordBout(r.career, { rank: 'E', won: true, reward: 60, week: 4 });
  assert.equal(grind.career.rank, 'D');
  assert.equal(grind.career.rankWins, 0);
});

test('any bout satisfies the mandatory cycle; a loss still logs and banks the cycle', () => {
  const car = freshCareer(1);
  const r = recordBout(car, { rank: 'E', won: false, reward: 10, week: 2 });
  assert.equal(r.career.metCycle, true);
  assert.equal(r.career.rankWins, 0);
  assert.equal(r.career.log.at(-1).kind, 'loss');
});

test('promotion writes a promote line into the log', () => {
  let car = freshCareer(1);
  for (let i = 0; i < 3; i++) car = recordBout(car, { rank: 'E', won: true, reward: 60, week: i }).career;
  assert.ok(car.log.some((e) => e.kind === 'promote'));
});

test('the career log stays bounded', () => {
  let car = freshCareer(1);
  for (let i = 0; i < 100; i++) car = recordBout(car, { rank: 'E', won: false, reward: 10, week: i }).career;
  assert.ok(car.log.length <= 24);
});

test('advanceCalendar before the deadline is a no-op', () => {
  const estate = { money: 200, career: { ...freshCareer(1), nextMandatory: 5 } };
  const r = advanceCalendar(estate, 3);
  assert.equal(r.missed, false);
  assert.equal(r.estate.money, 200);
  assert.equal(r.estate.career.nextMandatory, 5); // unchanged
});

test('reaching the deadline AFTER competing reschedules cleanly, no fine', () => {
  const estate = { money: 200, career: { ...freshCareer(1), nextMandatory: 5, metCycle: true } };
  const r = advanceCalendar(estate, 5);
  assert.equal(r.missed, false);
  assert.equal(r.fine, 0);
  assert.equal(r.estate.money, 200);
  assert.equal(r.estate.career.nextMandatory, 5 + MANDATORY_INTERVAL);
  assert.equal(r.estate.career.metCycle, false); // cycle resets
});

test('missing a meet at money 0 stresses but does not spam a "fined 0" log line', () => {
  const estate = { money: 0, career: { ...freshCareer(1), rank: 'D', nextMandatory: 5, metCycle: false } };
  const r = advanceCalendar(estate, 5);
  assert.equal(r.missed, true);
  assert.equal(r.fine, 0);
  assert.equal(r.stress, MISS_STRESS);
  assert.equal(r.note, null);
  assert.equal(r.estate.career.log.length, 0, 'zero-amount fine must not append a career log entry');
});

test('missing a meet fines and stresses but never goes negative or demotes', () => {
  const estate = { money: 20, career: { ...freshCareer(1), rank: 'D', nextMandatory: 5, metCycle: false } };
  const r = advanceCalendar(estate, 5);
  assert.equal(r.missed, true);
  assert.equal(r.fine, Math.min(MISS_FINE, 20)); // fine floored to available money
  assert.equal(r.estate.money, 0); // never negative
  assert.equal(r.stress, MISS_STRESS);
  assert.equal(r.estate.career.rank, 'D'); // no demotion — non-death recovery
  assert.equal(r.estate.career.log.at(-1).kind, 'miss');
});

test('winsToPromote and weeksToMandatory read the career for the UI', () => {
  const car = freshCareer(3); // meet at 3+4=7
  assert.equal(winsToPromote(car), RANK_META.E.promoteAfter);
  assert.equal(weeksToMandatory(car, 3), MANDATORY_INTERVAL);
  const top = { ...car, rank: 'C' };
  assert.equal(winsToPromote(top), null); // ceiling: no promotion target
});

test('each rung has a distinct, harder foe stable', () => {
  const e = makeOpponent(1, 'E');
  const d = makeOpponent(1, 'D');
  const c = makeOpponent(1, 'C');
  const sum = (s) => Object.values(s.stats).reduce((a, b) => a + b, 0);
  assert.ok(sum(d) > sum(e), 'D foes out-stat E foes');
  assert.ok(sum(c) > sum(d), 'C foes out-stat D foes');
  assert.equal(c.rank, 'C');
});
