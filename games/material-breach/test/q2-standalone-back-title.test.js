import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/view.js';
import { computeButtons } from '../src/layout.js';

test('standalone pause offers a way back to the title', () => {
  const view = createView({ seed: 'q2-standalone' });
  view.overlay = 'pause';
  view.hasShell = false;
  view.facility.status = 'active';

  const buttons = computeButtons(view);
  assert.ok(buttons.some((b) => b.id === 'totitle'), 'pause did not offer a Back control to the title');
});

