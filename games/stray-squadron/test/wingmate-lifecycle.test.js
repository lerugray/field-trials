// The scripted wingmate-death test at every phase boundary (M7) — DESIGN-SEED's named
// deliverable and part of the M10 QA battery. It drives whole runs through the run
// flow, forcing a wingmate loss at each phase transition, and asserts the roster,
// support, summary, and flight log stay consistent — a wingmate lost stays lost, is
// counted once, still shows on the roster (never silently vanished), and the run flow
// never breaks around the loss.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/run/runflow.js';
import { rosterSupport } from '../src/run/wingmates.js';
import { createLedger } from '../src/economy/ledger.js';

// A run with a full squad (base + three veterans) so there are wings to lose.
const CONTRACTS = ['Vesper', 'Tuck', 'Marlowe'];

test('a run is drawn with a squad; the roster is living at briefing', () => {
  const run = createRun('wl-briefing', { contracts: CONTRACTS });
  const roster = run.roster();
  assert.ok(roster.length >= 4, 'base squad plus three veterans');
  assert.equal(run.living().length, roster.length, 'everyone alive at the briefing boundary');
  // briefing -> level: launch does not touch the roster
  run.launch();
  assert.equal(run.living().length, roster.length);
});

test('boundary level->debrief: an unrescued distress loses a wingmate, flow continues', () => {
  const run = createRun('wl-mid', { contracts: CONTRACTS });
  run.launch();
  const victim = run.roster()[0];
  const before = rosterSupport(run.roster());
  run.completeLevel({ score: 800, kills: 4, potential: 1000, distress: { wingId: victim.id, rescued: false } });
  // if this seed's route is longer than one level we are at a debrief; if it is a
  // one-level route we are at results — either way the loss must be recorded.
  assert.ok(run.phase === 'debrief' || run.phase === 'results');
  assert.equal(victim.alive, false, 'the victim is down');
  assert.equal(victim.lostAt, run.state.levels[0].id, 'loss node recorded');
  const after = rosterSupport(run.roster());
  assert.equal(after.aliveCount, before.aliveCount - 1);
  assert.equal(after.size, before.size, 'a lost wingmate still shows on the roster');
});

test('boundary debrief->level: a loss persists across the branch, and a boon is taken', () => {
  // find a multi-level route so we get a real debrief boundary
  let run = null;
  for (let i = 0; i < 40 && !run; i++) {
    const r = createRun('wl-branch-' + i, { contracts: CONTRACTS });
    if (r.route.levels >= 3) run = r;
  }
  assert.ok(run, 'expected a multi-level route');
  run.launch();
  const victim = run.roster()[0];
  run.completeLevel({ score: 700, kills: 3, potential: 1000, distress: { wingId: victim.id, rescued: false } });
  assert.equal(run.phase, 'debrief');
  // pick a boon at the branch (the mid-run loadout choice)
  const taken = run.takeBoon('plating');
  assert.deepEqual(taken, ['plating']);
  const open = run.choices().find((c) => !c.locked);
  run.chooseBranch(open.node.id);
  assert.equal(run.phase, 'level');
  assert.equal(victim.alive, false, 'the loss carried across the debrief->level boundary');
  assert.equal(run.living().length, run.roster().length - 1);
});

test('boundary level->results (victory): a loss on the final level is counted once', () => {
  const run = createRun('wl-victory', { contracts: CONTRACTS });
  run.launch();
  const victims = [];
  let guard = 0;
  while (!run.isOver() && guard++ < 20) {
    if (run.phase === 'level') {
      // lose a still-living, not-yet-targeted wingmate on this level
      const target = run.living().find((w) => !victims.includes(w.id));
      if (target) victims.push(target.id);
      run.completeLevel({
        score: 800, kills: 4, potential: 1000,
        distress: target ? { wingId: target.id, rescued: false } : null,
      });
    } else if (run.phase === 'debrief') {
      run.chooseBranch(run.choices().find((c) => !c.locked).node.id);
    }
  }
  const s = run.summary();
  assert.equal(s.victory, true);
  assert.equal(s.wingsLost, victims.length, 'one loss per flown level, counted once each');
  assert.equal(s.wingsHome, s.wingsRostered - s.wingsLost);
  assert.equal(s.lostWings.length, s.wingsLost);
  for (const lw of s.lostWings) assert.ok(lw.name && lw.atNode, 'each loss names a wingmate and a node');
});

test('boundary level->results (death): a loss on the fatal level is recorded', () => {
  const run = createRun('wl-death', { contracts: CONTRACTS });
  run.launch();
  const victim = run.roster()[0];
  run.completeLevel({ score: 120, kills: 1, potential: 1000, died: true, distress: { wingId: victim.id, rescued: false } });
  assert.equal(run.phase, 'results');
  const s = run.summary();
  assert.equal(s.died, true);
  assert.equal(s.wingsLost, 1);
  assert.equal(victim.alive, false);
});

test('a rescued distress costs nothing; the wingmate comes home', () => {
  const run = createRun('wl-rescued', { contracts: CONTRACTS });
  run.launch();
  const w = run.roster()[0];
  run.completeLevel({ score: 800, kills: 4, potential: 1000, distress: { wingId: w.id, rescued: true } });
  assert.equal(w.alive, true, 'a rescued wingmate stays');
  assert.equal(run.summary().wingsLost >= 0, true);
  assert.equal(run.state.lostWings.length, 0);
});

test('the same wingmate is never lost twice (counted once)', () => {
  const run = createRun('wl-twice', { contracts: CONTRACTS });
  run.launch();
  const w = run.roster()[0];
  run.completeLevel({ score: 700, kills: 3, potential: 1000, distress: { wingId: w.id, rescued: false } });
  if (run.phase === 'debrief') {
    run.chooseBranch(run.choices().find((c) => !c.locked).node.id);
    // a stray repeat distress on an already-down wingmate must not double-count
    run.completeLevel({ score: 700, kills: 3, potential: 1000, distress: { wingId: w.id, rescued: false } });
  }
  assert.equal(run.state.lostWings.filter((lw) => lw.id === w.id).length, 1);
});

test('takeBoon is rejected outside a debrief', () => {
  const run = createRun('wl-boon-illegal', { contracts: CONTRACTS });
  assert.throws(() => run.takeBoon('plating'), /only from debrief/);
  run.launch();
  assert.throws(() => run.takeBoon('plating'), /only from debrief/);
});

test('the flight log records wingmates lost per run and lifetime', () => {
  const ledger = createLedger(null);
  ledger.recordRun({ seed: 'r1', totalKills: 6, totalScore: 500, levelsFlown: 3, routeLevels: 4, runMedal: 'silver', victory: false, died: true, wingsLost: 2 }, 'r1');
  ledger.recordRun({ seed: 'r2', totalKills: 9, totalScore: 800, levelsFlown: 4, routeLevels: 4, runMedal: 'gold', victory: true, wingsLost: 1 }, 'r2');
  const log = ledger.log();
  assert.equal(log[0].wingsLost, 2);
  assert.equal(log[1].wingsLost, 1);
  assert.equal(ledger.lifetime().wingsLost, 3, 'lifetime aggregate sums losses');
  assert.ok(ledger.ok(), 'ledger integrity holds with the new field');
});
