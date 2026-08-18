// The bureaucratic escalation ladder (M5): officers serve instruments with deadlines, answered
// administratively; ignoring one escalates the rung; a clean streak softens it; and killing the
// officer never withdraws the notice (fold 17b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, createNotice, nextId, CONFIG } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { runLadder, answerNotice, activeNotice, OFFICER, INSTRUMENT_NAME } from '../src/ladder.js';
import { createRng } from '../src/rng.js';

const push = (r, l) => r.lines.push(l);
const mkReport = (cycle, dmg = 0) => ({ cycle, structuralDamage: dmg, lines: [] });

test('accrued findings serve a Royal Surveyor with a stamped deadline (fold 10)', () => {
  const f = createFacility({ seed: 'ladder' });
  f.ladder.pressure = CONFIG.ladder.firstPressureToServe;
  runLadder(f, createRng('x'), mkReport(2), push);
  const notice = activeNotice(f);
  assert.ok(notice, 'no notice was served at the pressure threshold');
  assert.equal(f.ladder.rung, 'surveyor');
  assert.equal(notice.instrument, 'schedule-of-dilapidations');
  assert.equal(notice.cyclesRemaining, CONFIG.ladder.deadlines.surveyor);
});

test('answering an instrument pays the remediation and discharges it', () => {
  const f = createFacility({ seed: 'answer' });
  f.ladder.pressure = CONFIG.ladder.firstPressureToServe;
  runLadder(f, createRng('x'), mkReport(2), push);
  const notice = activeNotice(f);
  const gold0 = f.treasury.gold;
  const res = answerNotice(f, notice.id);
  assert.equal(res.ok, true);
  assert.equal(f.treasury.gold, gold0 - CONFIG.ladder.answerCost.surveyor);
  assert.equal(notice.status, 'answered');
  assert.equal(activeNotice(f), null);
});

test('an ignored instrument lapses at its deadline, hits the Cornerstone, and escalates', () => {
  const f = createFacility({ seed: 'ignore' });
  f.ladder.pressure = CONFIG.ladder.firstPressureToServe;
  runLadder(f, createRng('x'), mkReport(2), push);
  const notice = activeNotice(f);
  const cond0 = f.lossObject.condition;
  // Tick past the deadline without answering.
  for (let c = 3; c <= 3 + CONFIG.ladder.deadlines.surveyor; c++) runLadder(f, createRng('x'), mkReport(c), push);
  assert.equal(notice.status, 'expired');
  assert.ok(f.lossObject.condition < cond0, 'an expired instrument did not hit the Cornerstone');
});

test('killing the officer never withdraws the notice (fold 17b)', () => {
  // Serve a notice with a generous deadline, then resolve several raids (which reduce raiders to
  // zero). The notice must still stand: no raid casualty path withdraws an instrument.
  const f = createFacility({ seed: 'kill-officer' });
  f.fortify = 100; // hold the perimeter so raiders are reduced to zero each incident
  f.ladder.pressure = CONFIG.ladder.firstPressureToServe;
  runLadder(f, createRng('x'), mkReport(2), push);
  const notice = activeNotice(f);
  assert.ok(notice);
  notice.cyclesRemaining = 99; // generous deadline: it will not lapse during the test
  let g = f;
  for (let i = 0; i < 3; i++) g = commitCycle(g);
  const still = g.notices.find((n) => n.id === notice.id);
  assert.equal(still.status, 'served', 'the notice was withdrawn by raider casualties');
});

test('quiet cycles never soften the rung (the comeback lever, fold 13)', () => {
  const f = createFacility({ seed: 'soften' });
  f.ladder.rung = 'auditor';
  f.ladder.onTimeStreak = CONFIG.ladder.softenAfterOnTimeCycles - 1;
  for (let cycle = 5; cycle < 15; cycle++) runLadder(f, createRng('x'), mkReport(cycle), push);
  assert.equal(f.ladder.onTimeStreak, CONFIG.ladder.softenAfterOnTimeCycles - 1);
  assert.equal(f.ladder.rung, 'auditor');
});

test('three timely answered instruments soften the rung (the comeback lever, fold 13)', () => {
  const f = createFacility({ seed: 'soften-answered' });
  f.ladder.rung = 'auditor';

  for (let cycle = 5; cycle < 5 + CONFIG.ladder.softenAfterOnTimeCycles; cycle++) {
    f.cycle.number = cycle;
    const notice = createNotice({
      id: nextId(f, 'notice'),
      rung: 'auditor',
      deadlineCycles: CONFIG.ladder.deadlines.auditor,
      cycleServed: cycle - 1,
    });
    f.notices.push(notice);
    assert.equal(answerNotice(f, notice.id).ok, true);
    runLadder(f, createRng('x'), mkReport(cycle), push);
  }

  assert.equal(f.ladder.rung, 'surveyor');
});

test('answering a condemnation order withdraws it (the secret), and letting it lapse condemns', () => {
  // Withdrawn path.
  const f = createFacility({ seed: 'secret' });
  f.ladder.rung = 'auditor';
  f.ladder.pressure = CONFIG.ladder.pressureToServe;
  runLadder(f, createRng('x'), mkReport(4), push); // escalates to inspector, serves condemnation
  const notice = activeNotice(f);
  assert.equal(notice.rung, 'inspector');
  f.treasury.gold = CONFIG.ladder.answerCost.inspector;
  answerNotice(f, notice.id);
  assert.equal(notice.status, 'withdrawn');
  assert.equal(f.ladder.condemnationWithdrawn, true);

  // Lapsed path condemns.
  const g = createFacility({ seed: 'condemn' });
  g.ladder.rung = 'auditor';
  g.ladder.pressure = CONFIG.ladder.pressureToServe;
  runLadder(g, createRng('y'), mkReport(4), push);
  const cn = activeNotice(g);
  for (let c = 5; c <= 5 + CONFIG.ladder.deadlines.inspector; c++) runLadder(g, createRng('y'), mkReport(c), push);
  assert.equal(cn.status, 'expired');
  assert.equal(g.ladder.condemned, true);
});
