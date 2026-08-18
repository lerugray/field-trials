// DIRECTIONS fold 19 — the cross-state property test: {ladder rung} x {solvent/insolvent} x {reload}
// must preserve the deadlines and rung state unchanged. Insolvency is terminal (Ray-ratified: a run
// ends at condemnation or insolvency), so the ladder and everything else stop; the round-trip must
// still reproduce the closed state exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, createNotice, CONFIG } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { runLadder, activeNotice } from '../src/ladder.js';
import { createRng } from '../src/rng.js';
import { save, load } from '../src/persistence.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

function roundTrip(f) {
  const store = memStorage();
  assert.equal(save(f, store).ok, true);
  const res = load(store);
  assert.equal(res.ok, true);
  return res.facility;
}

const push = (r, l) => r.lines.push(l);

test('a served notice survives save/load with its rung and stamped deadline intact', () => {
  for (const rung of ['surveyor', 'auditor', 'inspector']) {
    const f = createFacility({ seed: `sl-${rung}` });
    // Escalate to the target rung and serve a notice.
    f.ladder.rung = rung === 'surveyor' ? 'none' : rung === 'auditor' ? 'surveyor' : 'auditor';
    f.ladder.pressure = rung === 'surveyor' ? CONFIG.ladder.firstPressureToServe : CONFIG.ladder.pressureToServe;
    runLadder(f, createRng('x'), { cycle: 3, structuralDamage: 0, lines: [] }, push);
    const notice = activeNotice(f);
    assert.ok(notice, `no notice at rung ${rung}`);

    const g = roundTrip(f);
    assert.equal(g.ladder.rung, f.ladder.rung, 'rung changed across reload');
    const gn = activeNotice(g);
    assert.equal(gn.rung, notice.rung);
    assert.equal(gn.cyclesRemaining, notice.cyclesRemaining, 'deadline changed across reload');
    assert.equal(gn.instrument, notice.instrument);
  }
});

test('solvent and near-insolvent facilities round-trip identically', () => {
  for (const gold of [400, 5, 0]) {
    const f = createFacility({ seed: `solv-${gold}` });
    f.treasury.gold = gold;
    f.ladder.rung = 'auditor';
    const g = roundTrip(f);
    assert.deepEqual(g, f);
  }
});

test('a closed (insolvent) tenure round-trips with its terminal status and score', () => {
  // Insolvency comes from a lapsed tax lien seizing funds the facility does not have. Hold the
  // Cornerstone so the close is monetary, and let an Auditor's lien lapse unanswered.
  let f = createFacility({ seed: 'insolvent' });
  f.cycle.number = 3; // payday leaves less than one lien's value after this cycle's stipend
  f.treasury.gold = 0;
  f.fortify = 999; // no structural loss: the close must come from money
  f.ladder.rung = 'auditor';
  f.notices.push(
    createNotice({ id: 'notice-insolvency', rung: 'auditor', deadlineCycles: 1, cycleServed: f.cycle.number - 1 }),
  );
  let guard = 0;
  while (f.status === 'active' && guard++ < 15) f = commitCycle(f);
  assert.equal(f.status, 'insolvent', 'the lapsed tax lien did not drive the facility insolvent');
  const g = roundTrip(f);
  assert.equal(g.status, f.status);
  assert.equal(g.score, f.score);
  assert.equal(g.ladder.rung, f.ladder.rung);
});
