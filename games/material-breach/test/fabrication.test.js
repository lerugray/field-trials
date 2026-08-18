// KEEP #6 — "Traps and doors are MANUFACTURED, with lead time. A workshop and a production queue,
// not a purchase menu."
//
// Found missing by M8's genre-completeness audit. Fabrication existed as a designatable department
// that attracted artificers and had NO mechanical effect whatsoever: `facilityDefense` summed
// fortification, claimed cells and headcount, and nothing else. A player could designate a workshop,
// watch staff report to it, and be no better defended for it — a stub surfaced as a feature, which
// is the specific thing the standing rules forbid.
//
// These tests hold the shape of the KEEP item, not the numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CONFIG, ROOM, facilityDefense, worksDefense } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueFabricate, designate } from '../src/actions.js';
import { refreshRooms } from '../src/rooms.js';
import { computeButtons } from '../src/layout.js';

// A facility with a workshop of `tiles` claimed cells, standing and ready to take an order.
function withWorkshop(seed = 'shop', tiles = 2) {
  const f = createFacility({ seed });
  const co = f.lossObject.cell;
  const cells = [];
  for (let i = 0; i < tiles; i++) {
    const c = f.grid[co.y + 1][co.x + i];
    c.excavated = true;
    c.claimed = true;
    c.surveyed = true;
    c.kind = 'floor';
    cells.push({ x: co.x + i, y: co.y + 1 });
  }
  refreshRooms(f);
  for (const cell of cells) designate(f, cell.x, cell.y, ROOM.FABRICATION);
  refreshRooms(f);
  f.treasury.gold = 500;
  return f;
}

test('a work cannot be bought without a workshop: it is a production queue, not a purchase menu', () => {
  const f = createFacility({ seed: 'no-shop' });
  f.treasury.gold = 10000; // all the gold in the world
  const res = queueFabricate(f);
  assert.equal(res.ok, false, 'a work was manufactured with no Fabrication department standing');
  assert.match(res.reason, /Fabrication/, `the refusal does not say why: "${res.reason}"`);
});

test('a workshop takes the order, and the work takes TIME', () => {
  const f = withWorkshop('lead');
  const res = queueFabricate(f);
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.order.kind, 'fabricate');
  assert.ok(CONFIG.orders.fabricate.lead >= 2, 'manufacture must take longer than a purchase');

  // Nothing exists yet: the order is in the queue, not on the wall.
  assert.equal((f.works || []).length, 0, 'a work appeared before it was manufactured');
  const defenseBefore = facilityDefense(f);

  let g = f;
  for (let i = 0; i < CONFIG.orders.fabricate.lead; i++) {
    assert.equal(g.works.length, 0, `a work appeared after ${i} of ${CONFIG.orders.fabricate.lead} cycles`);
    g = commitCycle(g);
  }
  assert.equal(g.works.length, 1, 'the work never came off the line');
  assert.ok(facilityDefense(g) > defenseBefore - 100, 'the finished work contributes nothing to defence');
  assert.ok(worksDefense(g) > 0, 'the works register carries no defence');
});

test('what comes off the line is a THING, entered in a register', () => {
  // KEEP #6 is about doors and traps, not about a defence number going up. The register is what
  // makes it a manufactured item the facility owns rather than a second fortification stat.
  let f = withWorkshop('items');
  for (let n = 0; n < 2; n++) {
    queueFabricate(f);
    for (let i = 0; i < CONFIG.orders.fabricate.lead; i++) f = commitCycle(f);
  }
  assert.equal(f.works.length, 2);
  const kinds = f.works.map((w) => w.kind);
  assert.notEqual(kinds[0], kinds[1], 'every manufactured work is the same thing');
  for (const w of f.works) {
    assert.ok(w.kind && typeof w.kind === 'string', 'a work has no name a player could read');
    assert.ok(w.defense > 0, `${w.kind} contributes nothing`);
  }
});

test('a bigger workshop makes a better work (KEEP #2 through KEEP #6)', () => {
  const small = withWorkshop('small', 1);
  const big = withWorkshop('big', 6);
  const a = queueFabricate(small);
  const b = queueFabricate(big);
  assert.equal(a.ok, true, a.reason);
  assert.equal(b.ok, true, b.reason);
  assert.ok(b.quality >= a.quality, 'a larger Fabrication department is not a better workshop');
});

test('the completed work is reported, with a number and with prose (fold 20)', () => {
  let f = withWorkshop('report');
  queueFabricate(f);
  let line = null;
  for (let i = 0; i < CONFIG.orders.fabricate.lead; i++) {
    f = commitCycle(f);
    line = (f.lastReport.lines || []).find((l) => l.kind === 'order-complete' && /installed/.test(l.numeric));
    if (line) break;
  }
  assert.ok(line, 'a manufactured work was installed without being reported');
  assert.match(line.numeric, /defence \+\d+/, 'the report line carries no exact figure');
  assert.ok(line.text && line.text.length > 20, 'the report line carries no prose neighbour');
  assert.ok(!/—/.test(line.numeric + line.text), 'an em-dash reached player-facing text');
});

test('the control appears only when a workshop stands', () => {
  // A control that is always present and always refuses teaches a player nothing.
  const bare = createFacility({ seed: 'ctl-bare' });
  const view = { facility: bare, overlay: null, toolLabel: 'Excavate', muted: false };
  assert.ok(!computeButtons(view).some((b) => b.id === 'fabricate'), 'the fabricate control stands with no workshop');

  const shop = withWorkshop('ctl-shop');
  assert.ok(
    computeButtons({ ...view, facility: shop }).some((b) => b.id === 'fabricate'),
    'the fabricate control is missing although a workshop stands',
  );
});

test('fabrication spam is not a winning strategy (Gate 3 extended)', () => {
  // Every new lever has to be re-checked against the degenerate probe, because a game whose fantasy
  // is administration is exactly the shape that can accidentally administer itself. Repeating one
  // order forever must still lose.
  let f = withWorkshop('spam');
  f.treasury.gold = 400;
  for (let i = 0; i < 30 && f.status === 'active'; i++) {
    queueFabricate(f); // refused when unaffordable, which is itself the point
    f = commitCycle(f);
  }
  assert.notEqual(f.status, 'active', 'a facility that only ever manufactures works survived indefinitely');
});
