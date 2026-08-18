import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/view.js';
import { dispatch } from '../src/input.js';
import { computeButtons } from '../src/layout.js';

test('closing report can be dismissed without destroying the filed record', () => {
  const view = createView({ seed: 'q4-closed' });
  view.facility.status = 'condemned';
  view.facility.lastReport = { filed: true };
  view.overlay = 'closed';

  const before = view.facility.lastReport;
  dispatch(view, 'dismiss');
  assert.equal(view.overlay, 'pause', 'closing report dismiss did not return to pause');
  assert.equal(view.facility.lastReport, before, 'dismiss destroyed or replaced the closing record');

  // From pause, the player can bring the closing report sheet back.
  assert.ok(computeButtons(view).some((b) => b.id === 'closedreport'), 'pause did not offer the closing report return control');
  dispatch(view, 'closedreport');
  assert.equal(view.overlay, 'closed', 'closedreport did not restore the closing report sheet');
});

