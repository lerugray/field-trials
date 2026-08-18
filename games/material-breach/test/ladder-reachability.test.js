// Standing M8 retune regressions. These drive the dossier's exact five seeds and competent policy,
// so a locally-correct ladder cannot silently become unreachable or unaffordable in the real sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCompetentPolicy } from '../scripts/measure-ladder.mjs';

const RUNS = ['a', 'b', 'c', 'd', 'e'].map(runCompetentPolicy);

test('the Auditor and Inspector are reached in a majority with five-to-six-cycle plateaus', () => {
  const auditorRuns = RUNS.filter((run) => run.arrivals.auditor !== null);
  const inspectorRuns = RUNS.filter((run) => run.arrivals.inspector !== null);

  assert.ok(auditorRuns.length >= 3, `Guild Auditor reached in only ${auditorRuns.length}/5 dossier seeds`);
  assert.ok(inspectorRuns.length >= 3, `Licensing Inspector reached in only ${inspectorRuns.length}/5 dossier seeds`);

  for (const run of inspectorRuns) {
    assert.ok(
      run.gaps.surveyorToAuditor >= 5 && run.gaps.surveyorToAuditor <= 6,
      `seed ${run.seed}: Surveyor to Auditor gap was ${run.gaps.surveyorToAuditor}, not 5-6 cycles`,
    );
    assert.ok(
      run.gaps.auditorToInspector >= 5 && run.gaps.auditorToInspector <= 6,
      `seed ${run.seed}: Auditor to Inspector gap was ${run.gaps.auditorToInspector}, not 5-6 cycles`,
    );
  }
});

test('the dossier policy answers instruments in most seeds and can afford its first Surveyor', () => {
  const engagedRuns = RUNS.filter((run) => run.answered.length > 0);
  assert.ok(engagedRuns.length >= 3, `instruments answered in only ${engagedRuns.length}/5 dossier seeds`);

  for (const run of RUNS) {
    const firstSurveyorHolding = run.holdingsAtOpenNotice.find((entry) => entry.rung === 'surveyor');
    const surveyorAnswer = run.answered.find((entry) => entry.rung === 'surveyor');
    assert.ok(firstSurveyorHolding, `seed ${run.seed}: no Surveyor holding was measured`);
    assert.equal(
      surveyorAnswer?.cycle,
      firstSurveyorHolding.cycle,
      `seed ${run.seed}: the first Surveyor was not affordable when its notice first opened`,
    );
  }
});
