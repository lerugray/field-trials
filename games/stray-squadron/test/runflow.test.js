// M5.3 — the run-flow state machine. A run must walk the route legally from any
// seed: briefing, levels, gated branch choices, and a correct end on victory or
// death. The flow is pure, so we can fly whole runs headlessly and assert them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/run/runflow.js';
import { rankOf } from '../src/run/medals.js';

test('a fresh run opens on the briefing, nothing flown yet', () => {
  const run = createRun('flow-1');
  assert.equal(run.phase, 'briefing');
  assert.equal(run.currentNode(), null);
  assert.equal(run.isOver(), false);
});

test('launch flies the fixed start level; completing a mid level opens a debrief', () => {
  const run = createRun('flow-2');
  const node = run.launch();
  assert.equal(node.id, run.route.startId);
  assert.equal(run.phase, 'level');
  // a strong clear -> a medal, then (if not final) a debrief with choices
  run.completeLevel({ score: 900, kills: 5, potential: 1000 });
  if (run.route.levels > 1) {
    assert.equal(run.phase, 'debrief');
    assert.equal(run.lastMedal, 'gold');
    const cs = run.choices();
    assert.ok(cs.length >= 1);
    assert.ok(cs.some((c) => !c.locked), 'always a way onward');
  } else {
    assert.equal(run.phase, 'results');
  }
});

test('flying a full winning run reaches the final and reports victory', () => {
  const run = createRun('flow-win');
  run.launch();
  let guard = 0;
  while (!run.isOver() && guard++ < 20) {
    if (run.phase === 'level') {
      run.completeLevel({ score: 800, kills: 4, potential: 1000 });
    } else if (run.phase === 'debrief') {
      const open = run.choices().find((c) => !c.locked);
      run.chooseBranch(open.node.id);
    }
  }
  const s = run.summary();
  assert.equal(run.phase, 'results');
  assert.equal(s.victory, true);
  assert.equal(s.died, false);
  // the last node flown is the route's final node
  assert.equal(s.path[s.path.length - 1], run.route.finalId);
  assert.equal(s.levelsFlown, s.path.length);
  assert.ok(s.totalScore > 0);
  assert.ok(rankOf(s.runMedal) >= 1);
});

test('dying mid-run ends the run immediately, no victory', () => {
  const run = createRun('flow-death');
  run.launch();
  run.completeLevel({ score: 120, kills: 1, potential: 1000, died: true });
  assert.equal(run.phase, 'results');
  const s = run.summary();
  assert.equal(s.died, true);
  assert.equal(s.victory, false);
  assert.equal(s.runMedal, 'none');           // death forfeits the run medal
  assert.equal(s.levels[0].medal, 'none');    // and the level medal
  assert.equal(s.levelsFlown, 1);
});

test('the gate is enforced: a locked branch cannot be chosen', () => {
  // find a seed whose start node offers a threat split (a lockable elite branch)
  let run = null;
  for (let i = 0; i < 80 && !run; i++) {
    const r = createRun('gate-' + i);
    r.launch();
    r.completeLevel({ score: 0, kills: 0, potential: 1000 }); // no medal earned
    if (r.phase === 'debrief') {
      const cs = r.choices();
      if (cs.some((c) => c.locked)) run = r;
    }
  }
  assert.ok(run, 'expected some seed to present a gated branch');
  const locked = run.choices().find((c) => c.locked);
  assert.throws(() => run.chooseBranch(locked.node.id), /gated/);
  // an unlocked branch still works
  const open = run.choices().find((c) => !c.locked);
  assert.doesNotThrow(() => run.chooseBranch(open.node.id));
  assert.equal(run.phase, 'level');
});

test('illegal transitions throw (no completing outside a level, no double-launch)', () => {
  const run = createRun('flow-illegal');
  assert.throws(() => run.completeLevel({ score: 0 }), /only from level/);
  assert.throws(() => run.chooseBranch('0-0'), /only from debrief/);
  run.launch();
  assert.throws(() => run.launch(), /only from briefing/);
});

test('choosing a node that is not a branch is rejected', () => {
  const run = createRun('flow-badbranch');
  run.launch();
  run.completeLevel({ score: 900, kills: 5, potential: 1000 });
  if (run.phase === 'debrief') {
    assert.throws(() => run.chooseBranch('99-99'), /not a branch/);
  }
});

test('deterministic: same seed + same play -> identical summary', () => {
  const play = (seed) => {
    const run = createRun(seed);
    run.launch();
    let guard = 0;
    while (!run.isOver() && guard++ < 20) {
      if (run.phase === 'level') run.completeLevel({ score: 700, kills: 3, potential: 1000 });
      else if (run.phase === 'debrief') run.chooseBranch(run.choices().find((c) => !c.locked).node.id);
    }
    return run.summary();
  };
  assert.deepEqual(play('repeat-me'), play('repeat-me'));
});
