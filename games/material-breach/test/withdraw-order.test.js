// Release-gate Q3: cancelOrder() (full refund) and actCancelOrder() were implemented and shipped,
// but nothing on the player's path ever called them — "F is an instant irreversible 50g." This
// test exercises the PLAYER PATH: real dispatch() ids through the same switch input.js's pointer
// and keyboard handlers call, and computeButtons() as the renderer/hit-tester actually see it —
// not actions.js's cancelOrder() directly. That engine function already has its own contract
// baked into actions.js's own docstring; what was missing was a live control that reaches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/view.js';
import { dispatch } from '../src/input.js';
import { computeButtons } from '../src/layout.js';
import { CONFIG } from '../src/model.js';

function toDesk(seed) {
  const view = createView({ seed });
  dispatch(view, 'enter'); // title -> orientation
  dispatch(view, 'begin'); // orientation -> the desk (ADMIN, overlay null)
  assert.equal(view.overlay, null, 'did not reach the desk');
  return view;
}

test('Withdraw stands only once an order is queued, refunds it, and retires itself (release-gate Q3)', () => {
  const view = toDesk('withdraw-flow');

  assert.ok(!computeButtons(view).some((b) => b.id === 'withdraw'), 'Withdraw showed with nothing queued');

  const treasuryBefore = view.facility.treasury.gold;
  dispatch(view, 'fortify'); // the same action-bar click a player uses to raise the order
  assert.equal(view.facility.treasury.gold, treasuryBefore - CONFIG.orders.fortify.cost, 'fortify did not spend');
  assert.equal(view.facility.orders.length, 1);
  assert.equal(view.facility.orders[0].status, 'queued');

  // The control now stands and is enabled. Its label is a bare verb (measured on the built
  // artifact: "Withdraw NNg" clipped its own [C] key hint off a 105px action-bar slot), and the
  // refund figure is read back on the status strip's note the instant it is used, below.
  const withdrawBtn = computeButtons(view).find((b) => b.id === 'withdraw');
  assert.ok(withdrawBtn, 'Withdraw did not appear once an order was queued');
  assert.ok(withdrawBtn.enabled, 'Withdraw rendered disabled while the tenure is active');

  dispatch(view, 'withdraw'); // the player path: through the real dispatcher, not cancelOrder() directly
  assert.equal(view.facility.treasury.gold, treasuryBefore, 'the withdrawn order did not refund its cost');
  assert.equal(view.facility.orders[0].status, 'cancelled', 'the order was not marked cancelled');
  assert.match(view.lastActionNote, /[Ww]ithdrawn/, 'no in-register read-back for the withdrawal');

  // The control retires itself once nothing stands to withdraw.
  assert.ok(!computeButtons(view).some((b) => b.id === 'withdraw'), 'Withdraw kept showing with nothing left queued');

  // A redundant click (button gone, but a stray keypress could still reach the dispatcher) is a
  // refusal, never a second payout.
  dispatch(view, 'withdraw');
  assert.equal(view.facility.treasury.gold, treasuryBefore, 'a redundant withdraw click paid out again');
});

test('Withdraw acts on the most recently raised order first (LIFO), never the wrong one', () => {
  const view = toDesk('withdraw-order-lifo');

  dispatch(view, 'fortify');
  const firstId = view.facility.orders[0].id;
  const afterFirst = view.facility.treasury.gold;
  dispatch(view, 'fortify');
  const secondId = view.facility.orders[1].id;
  assert.equal(view.facility.orders.length, 2);

  dispatch(view, 'withdraw');
  const first = view.facility.orders.find((o) => o.id === firstId);
  const second = view.facility.orders.find((o) => o.id === secondId);
  assert.equal(first.status, 'queued', 'withdraw cancelled the earlier order instead of the last-raised one');
  assert.equal(second.status, 'cancelled', 'withdraw did not cancel the most recently raised order');
  assert.equal(view.facility.treasury.gold, afterFirst, 'the second order did not refund on withdraw');

  // One order still stands queued; Withdraw now reaches it.
  assert.ok(computeButtons(view).some((b) => b.id === 'withdraw'), 'Withdraw dropped out with a surviving queued order');
  dispatch(view, 'withdraw');
  assert.equal(first.status, 'cancelled', 'the surviving order was never reachable');
  assert.equal(view.facility.treasury.gold, afterFirst + CONFIG.orders.fortify.cost, 'the surviving order did not refund');
});

test('Withdraw cannot reach an order once it has been signed into progress (engine contract, live path)', () => {
  const view = toDesk('withdraw-signed');

  dispatch(view, 'fortify');
  assert.ok(computeButtons(view).some((b) => b.id === 'withdraw'), 'Withdraw did not offer the freshly queued order');

  dispatch(view, 'sign'); // opens the pre-commit checklist (the two-confirm guard)
  dispatch(view, 'confirm'); // the real second confirm; commitCycle actually runs here
  if (view.overlay === 'raid') dispatch(view, 'skip-replay'); // the watchable replay, dismissed same as a player would
  assert.equal(view.overlay, null, 'did not return to the desk after the cycle resolved');

  // Fortify's lead time is 1 cycle, so the order is DONE, not merely in-progress, by now — either
  // way cancelOrder() only accepts 'queued', and the live control must agree.
  assert.equal(view.facility.orders[0].status, 'done', 'fortify did not complete on its lead time');
  assert.ok(!computeButtons(view).some((b) => b.id === 'withdraw'), 'Withdraw still offered a completed order');
});
