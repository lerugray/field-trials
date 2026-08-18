// THE THREE-TIER COMPLETION RUBRIC (DESIGN-SEED §7), verified at M8.
//
// The contract wires the completion hook at M1 and VERIFIES the rubric at M8 (§6 item 7). These are
// that verification: each tier is earned, and — more importantly — each tier is shown to be
// WITHHELD when its conditions are not met. A rubric that only ever says yes is not a rubric, and
// "the tier fires" is the easy half; "the tier does not fire when it should not" is the half that
// catches a condition wired to the wrong field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CONFIG } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { answerNotice } from '../src/ladder.js';
import { rubricOf, tiersReached, TIERS } from '../src/rubric.js';

// A facility taken to its terminal condition by doing nothing, which the degenerate probe already
// proves must happen. This is the plainest possible "finished".
function runToClose(seed = 'rubric', maxCycles = 40) {
  let f = createFacility({ seed });
  for (let i = 0; i < maxCycles && f.status === 'active'; i++) f = commitCycle(f);
  return f;
}

test('the rubric names exactly the three tiers the seed defines', () => {
  assert.deepEqual([...TIERS], ['finished', 'mastered', 'secret']);
});

test('a running tenure has reached nothing', () => {
  const f = createFacility({ seed: 'running' });
  const r = rubricOf(f);
  assert.equal(r.finished, false, 'a tenure that has not ended is reported as finished');
  assert.equal(r.mastered, false);
  assert.equal(r.secret, false);
  assert.match(r.reasons.finished, /still running/);
  assert.deepEqual(tiersReached(f), []);
});

test('FINISHED: a tenure taken to its terminal condition, with the closing report filed', () => {
  const f = runToClose('finished');
  assert.notEqual(f.status, 'active', 'the facility never closed; the probe cannot test the tier');
  const r = rubricOf(f);
  assert.equal(r.finished, true, r.reasons.finished);
  assert.ok(f.lastReport, 'a closed tenure filed no closing report');
  assert.ok(tiersReached(f).includes('finished'));
});

test('FINISHED is not awarded for a closed tenure with no closing report', () => {
  // The seed's wording is "complete a full tenure to its terminal condition AND file the closing
  // report". Both halves, so both are checked.
  const f = runToClose('noreport');
  f.lastReport = null;
  assert.equal(rubricOf(f).finished, false, 'finished was awarded without a closing report');
});

test('MASTERED requires an answered Licensing Inspector, solvency, and a clean desk at close', () => {
  const base = runToClose('mastered');
  // Construct the exact state the seed describes: an inspector's condemnation order answered (and
  // therefore withdrawn), the treasury solvent, nothing left standing.
  const f = structuredClone(base);
  f.notices.push({ id: 'n-insp', rung: 'inspector', instrument: 'condemnation-order', status: 'withdrawn', cyclesRemaining: 2 });
  f.treasury.gold = 120;
  for (const n of f.notices) if (n.status === 'served') n.status = 'answered';
  assert.equal(rubricOf(f).mastered, true, rubricOf(f).reasons.mastered);

  // Each condition removed in turn must withhold the tier.
  const insolvent = structuredClone(f);
  insolvent.treasury.gold = -1;
  assert.equal(rubricOf(insolvent).mastered, false, 'mastered survived an insolvent close');
  assert.match(rubricOf(insolvent).reasons.mastered, /treasury closed at -1g/);

  const unanswered = structuredClone(f);
  unanswered.notices.push({ id: 'n-open', rung: 'surveyor', instrument: 'schedule-of-dilapidations', status: 'served', cyclesRemaining: 1 });
  assert.equal(rubricOf(unanswered).mastered, false, 'mastered survived an unanswered instrument');
  assert.match(rubricOf(unanswered).reasons.mastered, /stood unanswered/);

  const noInspector = structuredClone(f);
  noInspector.notices = noInspector.notices.filter((n) => n.rung !== 'inspector');
  assert.equal(rubricOf(noInspector).mastered, false, 'mastered was awarded without a Licensing Inspector');
  assert.match(rubricOf(noInspector).reasons.mastered, /no Licensing Inspector/);
});

test('MASTERED is not awarded for an inspector whose order merely LAPSED', () => {
  // Lapsing a condemnation order is how a tenure ends, not how it is mastered. This is the
  // difference between "an inspector came" and "the facility was held past him".
  const f = runToClose('lapsed');
  f.notices.push({ id: 'n-lapse', rung: 'inspector', instrument: 'condemnation-order', status: 'expired', cyclesRemaining: 0 });
  f.treasury.gold = 300;
  for (const n of f.notices) if (n.status === 'served') n.status = 'answered';
  assert.equal(rubricOf(f).mastered, false, 'a lapsed condemnation order counted as being held past');
});

test('SECRET: a condemnation order withdrawn administratively', () => {
  // Driven through the real action, not by setting the flag: the tier has to be reachable by
  // something a player actually does at the desk.
  const f = createFacility({ seed: 'secret' });
  f.treasury.gold = CONFIG.ladder.answerCost.inspector + 50;
  f.notices.push({
    id: 'n-c',
    rung: 'inspector',
    instrument: 'condemnation-order',
    status: 'served',
    cyclesRemaining: 3,
    cycleServed: 1,
  });
  const res = answerNotice(f, 'n-c');
  assert.equal(res.ok, true, res.reason);
  assert.equal(f.ladder.condemnationWithdrawn, true);
  assert.equal(rubricOf(f).secret, true, rubricOf(f).reasons.secret);
  // Secret is independent of finishing: it is a thing done during a tenure, not at its end.
  assert.ok(tiersReached(f).includes('secret'));
});

test('SECRET is withheld when the serving officer became a casualty', () => {
  // The seed's second clause. NOTE, and this is recorded in the M8 acceptance dossier rather than
  // buried here: no code path in the game sets `officerCasualty`, because officers are placed on
  // the drawing and are not participants in the raid resolver. The clause is a standing guard
  // against a mechanic that does not exist, and this test pins the guard so that the day officers
  // can die, the tier already refuses to fire.
  const f = createFacility({ seed: 'casualty' });
  f.ladder.condemnationWithdrawn = true;
  assert.equal(rubricOf(f).secret, true);
  f.ladder.officerCasualty = true;
  assert.equal(rubricOf(f).secret, false, 'the secret tier survived the officer becoming a casualty');
  assert.match(rubricOf(f).reasons.secret, /became a casualty/);
});

test('the rubric reads the facility, and never writes to it', () => {
  const f = runToClose('readonly');
  const before = JSON.stringify(f);
  rubricOf(f);
  tiersReached(f);
  assert.equal(JSON.stringify(f), before, 'the rubric mutated the facility it was asked about');
});

test('tiersReached reports highest first, so a shell can take the head', () => {
  const f = runToClose('order');
  f.ladder.condemnationWithdrawn = true;
  f.notices.push({ id: 'n-i', rung: 'inspector', instrument: 'condemnation-order', status: 'withdrawn', cyclesRemaining: 1 });
  f.treasury.gold = 10;
  for (const n of f.notices) if (n.status === 'served') n.status = 'answered';
  const tiers = tiersReached(f);
  assert.deepEqual(tiers, ['secret', 'mastered', 'finished']);
});

test('every tier carries a plain-language reason, awarded or not', () => {
  // The LEGIBILITY LAW applies to what the game reports about itself, not only to what it draws.
  for (const f of [createFacility({ seed: 'reasons' }), runToClose('reasons2')]) {
    const r = rubricOf(f);
    for (const tier of TIERS) {
      assert.equal(typeof r.reasons[tier], 'string');
      assert.ok(r.reasons[tier].length > 8, `the ${tier} reason is too thin to read: "${r.reasons[tier]}"`);
    }
  }
});
