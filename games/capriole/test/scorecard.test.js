// node --test — the CARNIVAL SCORECARD + ticket payout (M4). Death files a causal report
// (sphere reached, what killed you, the caprice line); a full clear files a VICTORY report
// at the premium multiplier; tickets reward DEPTH (sphere N pays N) so deep runs strictly
// beat farming shallow ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advanceSphere, applyDamage } from '../src/sim/world.js';
import { buildScorecard, computeTickets, causeLabel } from '../src/sim/scorecard.js';
import { tuning } from '../src/sim/tuning.js';

test('death files a causal scorecard: sphere, cause, caprice line, phase frozen', () => {
  const w = createWorld(1, 4, ['spring-heels', 'iron-goat']);
  w.spheresCleared = 4; // cleared spheres 0..3, died on sphere index 4
  applyDamage(w, 99, { x: 0, z: 1 }, true, 'swooper');
  assert.ok(w.dead && w.diedThisTick);
  assert.equal(w.phase, 'dead', 'run freezes on death');
  const sc = w.scorecard;
  assert.equal(sc.outcome, 'death');
  assert.equal(sc.sphereNumber, 5, 'died on sphere 5 (index 4)');
  assert.equal(sc.act, 2, 'sphere index 4 is act 2');
  assert.equal(sc.cause, 'swooper');
  assert.equal(sc.causeLabel, 'a Swooper');
  assert.equal(sc.capriceLine, 'Spring Heels · Iron Goat', 'the caprice line that shaped the run');
  assert.equal(sc.caprices.length, 2);
});

test('victory files a scorecard at the premium multiplier', () => {
  const w = createWorld(3, tuning.run.spheres - 1);
  w.spheresCleared = tuning.run.spheres - 1; // cleared spheres 0..7 already this run
  advanceSphere(w); // clear the final sphere → 9 total
  assert.equal(w.phase, 'victory');
  const sc = w.scorecard;
  assert.equal(sc.outcome, 'victory');
  assert.equal(sc.cause, null, 'no cause on a win');
  assert.equal(sc.spheresCleared, tuning.run.spheres, 'all nine cleared');
  assert.equal(sc.tickets.mult, tuning.tickets.victoryMult, 'premium multiplier applied');
  assert.equal(sc.tickets.total, sc.tickets.subtotal * tuning.tickets.victoryMult);
});

test('ticket math: sphere N pays N, act bosses add a bonus', () => {
  // Cleared 6 spheres (indices 0..5): base = 1+2+3+4+5+6 = 21; bosses among {2,5,8} < 6 = {2,5} = 2.
  const w = createWorld(1, 6);
  w.spheresCleared = 6;
  w.skipTickets = 2;
  const t = computeTickets(w, 'death');
  assert.equal(t.base, 21);
  assert.equal(t.bossCleared, 2);
  assert.equal(t.bossBonus, 2 * tuning.tickets.bossBonus);
  assert.equal(t.skip, 2);
  assert.equal(t.subtotal, 21 + 2 * tuning.tickets.bossBonus + 2);
  assert.equal(t.mult, 1);
  assert.equal(t.total, t.subtotal);
});

test('deep runs strictly beat farming shallow ones', () => {
  const shallow = createWorld(1, 3); shallow.spheresCleared = 3;
  const deep = createWorld(1, 7); deep.spheresCleared = 7;
  assert.ok(computeTickets(deep, 'death').total > computeTickets(shallow, 'death').total * 2,
    'clearing 7 pays far more than farming 3 twice over');
});

test('a full victory out-pays dying on the last sphere (the premium is real)', () => {
  const win = createWorld(1, 8); win.spheresCleared = 9;
  const died = createWorld(1, 8); died.spheresCleared = 8; // died on the final sphere
  assert.ok(computeTickets(win, 'victory').total > computeTickets(died, 'death').total);
});

test('a pure (no-caprice) ascent reads legibly on the scorecard', () => {
  const w = createWorld(1, 2); w.spheresCleared = 2;
  const sc = buildScorecard(w, 'death');
  assert.equal(sc.capriceLine, 'no caprices — a pure ascent');
});

test('causeLabel maps every archetype + the net, and falls back safely', () => {
  assert.equal(causeLabel('boss'), 'the Gatekeeper');
  assert.equal(causeLabel('net'), 'the long fall');
  assert.equal(causeLabel('drifter'), 'a Drifter');
  assert.ok(causeLabel('mystery').length > 0, 'unknown cause still yields a label');
});

test('the net toll can be the fatal cause', () => {
  const w = createWorld(2, 1);
  w.hp = 1;
  applyDamage(w, tuning.fall.netTollHp, { x: 0, z: 0 }, false, 'net');
  assert.ok(w.dead);
  assert.equal(w.scorecard.cause, 'net');
  assert.equal(w.scorecard.causeLabel, 'the long fall');
});
