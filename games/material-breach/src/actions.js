// actions.js — the operator's levers during the untimed ADMIN phase. These mutate the pending
// plan (queue a works order, spend from the treasury); they do NOT advance the sim. The sim only
// advances in commitCycle() (the pacing law). An action returns a result object; it never throws
// for an ordinary rejection (an unaffordable order is a rejected action, not an error).
//
// M1 has a single lever: queue a fortification. Excavation (M2), assignment (M3) and fabrication
// (M4) add the rest against this same shape.
import { CONFIG, ROOM, createOrder, nextId } from './model.js';
import { canExcavate } from './grid.js';
import { designateRoom } from './rooms.js';
import { answerNotice as answerNoticeLadder } from './ladder.js';

// Guard: actions are only legal in ADMIN on an active tenure.
function assertAdmin(facility) {
  if (facility.status !== 'active') return { ok: false, reason: 'the tenure is closed' };
  if (facility.cycle.phase !== 'ADMIN') return { ok: false, reason: 'not in the administration phase' };
  return null;
}

// queueFortify(facility) -> { ok, reason?, order? }. Spends the cost now (affordability is
// immediate feedback) and queues a fortify order that completes after its lead time.
export function queueFortify(facility) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;

  const spec = CONFIG.orders.fortify;
  if (facility.treasury.gold < spec.cost) {
    return { ok: false, reason: `insufficient treasury: ${facility.treasury.gold}g of ${spec.cost}g required` };
  }
  facility.treasury.gold -= spec.cost;
  const order = createOrder({
    id: nextId(facility, 'order'),
    kind: 'fortify',
    target: 'perimeter',
    leadCycles: spec.lead,
  });
  facility.orders.push(order);
  return { ok: true, order };
}

// queueFabricate(facility) -> { ok, reason?, order? }. KEEP #6: traps and doors are MANUFACTURED,
// with lead time. It is a PRODUCTION QUEUE and not a purchase menu, which is why it is gated on a
// standing Fabrication department rather than on gold alone: without the workshop there is nobody
// to make the thing, however much the treasury holds.
export function queueFabricate(facility) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;

  const shop = (facility.rooms || []).filter((r) => r.type === ROOM.FABRICATION);
  if (shop.length === 0) {
    return { ok: false, reason: 'no Fabrication department stands; a work must be manufactured somewhere' };
  }
  const spec = CONFIG.orders.fabricate;
  if (facility.treasury.gold < spec.cost) {
    return { ok: false, reason: `insufficient treasury: ${facility.treasury.gold}g of ${spec.cost}g required` };
  }
  facility.treasury.gold -= spec.cost;
  // The best workshop takes the job, and its quality sets the yield (KEEP #2).
  const quality = shop.reduce((best, r) => Math.max(best, r.quality || 1), 1);
  const order = createOrder({
    id: nextId(facility, 'order'),
    kind: 'fabricate',
    target: 'works',
    leadCycles: spec.lead,
  });
  order.quality = quality;
  facility.orders.push(order);
  return { ok: true, order, quality };
}

// queueExcavate(facility, x, y) -> { ok, reason?, order? }. Orders a cell carved out of the rock.
// Legal only for an unexcavated cell that touches claimed ground (carved, not placed). Spends the
// cost now and refuses a duplicate order on a cell already queued for excavation.
export function queueExcavate(facility, x, y) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;

  if (!canExcavate(facility, x, y)) {
    return { ok: false, reason: 'that cell is not adjacent to claimed ground, or is already carved' };
  }
  const already = facility.orders.some(
    (o) => o.kind === 'excavate' && o.status !== 'cancelled' && o.status !== 'done' && o.target.x === x && o.target.y === y,
  );
  if (already) return { ok: false, reason: 'that cell is already under a works order' };

  const spec = CONFIG.orders.excavate;
  if (facility.treasury.gold < spec.cost) {
    return { ok: false, reason: `insufficient treasury: ${facility.treasury.gold}g of ${spec.cost}g required` };
  }
  facility.treasury.gold -= spec.cost;
  const order = createOrder({
    id: nextId(facility, 'order'),
    kind: 'excavate',
    target: { x, y },
    leadCycles: spec.lead,
  });
  facility.orders.push(order);
  return { ok: true, order };
}

// queueRepair(facility) -> { ok, reason?, order? }. Order remedial works on the Cornerstone. Spends
// the cost now and restores condition on completion. Refused when the Cornerstone is already full.
export function queueRepair(facility) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;
  if (facility.lossObject.condition >= 100) return { ok: false, reason: 'the Cornerstone is at full condition' };
  const spec = CONFIG.orders.repair;
  if (facility.treasury.gold < spec.cost) {
    return { ok: false, reason: `insufficient treasury: ${facility.treasury.gold}g of ${spec.cost}g required` };
  }
  facility.treasury.gold -= spec.cost;
  const order = createOrder({ id: nextId(facility, 'order'), kind: 'repair', target: 'cornerstone', leadCycles: spec.lead });
  facility.orders.push(order);
  return { ok: true, order };
}

// designate(facility, x, y, type) -> { ok, reason? }. Assign a claimed floor cell to a department
// (or type=null to clear it). Designation is free and immediate: it is a filing, not a works order.
export function designate(facility, x, y, type) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;
  return designateRoom(facility, x, y, type);
}

// answerNotice(facility, noticeId) -> { ok, reason? }. Answer a served instrument administratively.
// A filing, not a works order: it discharges immediately during ADMIN.
export function answerNotice(facility, noticeId) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;
  return answerNoticeLadder(facility, noticeId);
}

// cancelOrder(facility, orderId) -> { ok, reason? }. Cancels a still-queued order and refunds its
// cost. Only an order that has not begun can be withdrawn.
export function cancelOrder(facility, orderId) {
  const blocked = assertAdmin(facility);
  if (blocked) return blocked;

  const order = facility.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: 'no such order' };
  if (order.status !== 'queued') return { ok: false, reason: 'order already under way' };
  order.status = 'cancelled';
  const spec = CONFIG.orders[order.kind];
  if (spec && typeof spec.cost === 'number') facility.treasury.gold += spec.cost;
  return { ok: true };
}

// lastQueuedOrder(facility) -> the order a single Withdraw control acts on: the most recently
// raised order that has not yet begun (status 'queued'). An order only leaves 'queued' when a
// cycle is signed over (COMMIT, cycle.js), so this is stable for the whole ADMIN phase it was
// raised in, and it is exactly what cancelOrder(facility, order.id) above will accept.
export function lastQueuedOrder(facility) {
  const queued = facility.orders.filter((o) => o.status === 'queued');
  return queued.length ? queued[queued.length - 1] : null;
}
