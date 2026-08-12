import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, createPiece } from '../src/state.js';
import { computeCombat, findVictory, attackableEnemies } from '../src/combat.js';

function place(state, side, cls, x, y) {
  const p = createPiece({ side, cls, x, y });
  state.pieces.push(p);
  return p;
}

function targetAt(state, x, y) {
  return state.pieces.find(p => p.x === x && p.y === y)?.id;
}

// Combat tests use the x=8 corridor: no mountains on this file, so a relay at y=18
// supplies North units and a relay at y=1 supplies South units all the way across.

// Row 42: if offense <= defense, target resists.
test('single infantry attack on infantry resists (row 42)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'North', 'Infantry', 8, 4);
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.totalAttack, 4);
  assert.equal(result.totalDefense, 6);
  assert.equal(result.result, 'resist');
});

// Row 44: if offense exceeds defense by 2+, target destroyed.
test('two infantry exceed infantry defense by 2 and destroy it (row 44)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'North', 'Infantry', 8, 3); // on the South fort square
  place(s, 'North', 'Infantry', 8, 4);
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.totalAttack, 8);
  assert.equal(result.totalDefense, 6);
  assert.equal(result.result, 'destroyed');
  assert.equal(result.destroyed, true);
});

// Row 41: defenders in range add their defense to the target square.
test('supporting defender raises total defense (row 41)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'South', 'Infantry', 8, 3); // in fort, defender
  place(s, 'North', 'Infantry', 8, 4);
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.totalAttack, 4);
  assert.equal(result.totalDefense, 16);
  assert.equal(result.result, 'resist');
});

// Row 43: offense exceeds defense by exactly 1 -> forced retreat.
test('margin of one forces retreat (row 43)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Foot Artillery', 8, 2); // defense 8
  place(s, 'North', 'Infantry', 8, 4); // 4
  place(s, 'North', 'Foot Artillery', 8, 5); // range 3, 5 -> total 9, margin 1
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.totalAttack, 9);
  assert.equal(result.totalDefense, 8);
  assert.equal(result.result, 'retreat');
  assert.ok(result.retreatDestinations.length > 0);
});

// Row 45: forced retreat with no adjacent unoccupied square destroys target.
test('forced retreat with no escape destroys target (row 45)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Foot Artillery', 8, 2); // defense 8
  place(s, 'North', 'Infantry', 8, 4); // 4
  place(s, 'North', 'Foot Artillery', 8, 5); // 5 -> margin 1
  // Fill every adjacent square with a friendly relay so retreat is impossible.
  // Relays do not contribute defensive fire (row 70), so they do not inflate defense.
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    place(s, 'South', 'Foot Relay', 8 + dx, 2 + dy);
  }
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.result, 'destroyed');
});

// Row 63: isolated fighting units lose offensive and defensive value.
test('isolated target has zero defense (row 63)', () => {
  const s = createState();
  place(s, 'South', 'Foot Relay', 4, 2); // e3, supplied by South arsenal e2
  place(s, 'South', 'Infantry', 3, 2);   // d3, adjacent to relay, in comm
  place(s, 'North', 'Infantry', 2, 2);   // off all lines, isolated
  const result = computeCombat(s, targetAt(s, 2, 2));
  assert.equal(result.totalAttack, 4);
  assert.equal(result.totalDefense, 0);
  assert.equal(result.result, 'destroyed');
});

test('isolated attacker contributes zero attack (row 63)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'North', 'Infantry', 8, 4); // supplied
  place(s, 'North', 'Infantry', 9, 2); // adjacent to target, isolated
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.totalAttack, 4);
  assert.equal(result.result, 'resist');
});

// Row 64: friendly units with intact communication can defend a unit in the square.
test('supplied friendly in range contributes defense (row 64)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'South', 'Infantry', 8, 3); // in fort, supplied, defender
  place(s, 'North', 'Infantry', 8, 4);
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.totalDefense, 16);
});

// Row 16/22: terrain defense bonuses apply to supplied infantry and artillery.
test('infantry in fort defends with +4 (rows 10-11, 16)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Infantry', 8, 3); // in South fort, supplied
  place(s, 'North', 'Infantry', 8, 5); // range 2
  const result = computeCombat(s, targetAt(s, 8, 3));
  assert.equal(result.totalDefense, 10);
});

test('artillery on pass defends with +2 (rows 10, 22)', () => {
  const s = createState();
  // South pass at m6 (12,5). Supply via South relay at m2 (12,1).
  place(s, 'South', 'Foot Relay', 12, 1);
  place(s, 'South', 'Foot Artillery', 12, 5); // on pass, supplied
  // North attacker: supplied relay at (12,10) on the (20,18) diagonal, then south ray.
  place(s, 'North', 'Foot Relay', 12, 10);
  place(s, 'North', 'Infantry', 12, 7); // range 2 to target
  const result = computeCombat(s, targetAt(s, 12, 5));
  assert.equal(result.totalDefense, 10);
});

// Row 43 + 73 Reading A: isolated unit cannot retreat, so margin-1 destroys it.
test('isolated target cannot retreat and is destroyed at margin one (rows 43, 73)', () => {
  const s = createState();
  place(s, 'South', 'Foot Relay', 4, 2);
  place(s, 'South', 'Infantry', 3, 2);
  place(s, 'North', 'Infantry', 2, 2); // isolated
  const result = computeCombat(s, targetAt(s, 2, 2));
  assert.equal(result.totalAttack, 4);
  assert.equal(result.totalDefense, 0);
  assert.equal(result.result, 'destroyed');
});

// Row 49-51: cavalry charge.
test('four aligned cavalry charge adjacent target at 7 each (rows 49-51)', () => {
  const s = createState();
  place(s, 'South', 'Infantry', 10, 10);
  // Supply the charging column via a North relay on the (20,18) diagonal.
  place(s, 'North', 'Foot Relay', 12, 10); // supplied; extends diagonally to (10,12)
  place(s, 'North', 'Cavalry', 10, 11);
  place(s, 'North', 'Cavalry', 10, 12);
  place(s, 'North', 'Cavalry', 10, 13);
  place(s, 'North', 'Cavalry', 10, 14);
  const result = computeCombat(s, targetAt(s, 10, 10));
  assert.equal(result.totalAttack, 28);
  assert.equal(result.result, 'destroyed');
  assert.ok(result.attackBreakdown.every(b => b.value === 7));
});

// Row 50: charge may not target a unit on a pass or in a fort.
test('cavalry charge is barred against target on a pass (row 50)', () => {
  const s = createState();
  place(s, 'South', 'Foot Relay', 12, 1); // supplies pass square via x=12
  place(s, 'South', 'Infantry', 12, 5); // South pass
  // Supply the column from relay at (15,7), which lies on the (4,18) diagonal.
  place(s, 'North', 'Foot Relay', 15, 7);
  place(s, 'North', 'Cavalry', 13, 5);
  place(s, 'North', 'Cavalry', 14, 5);
  place(s, 'North', 'Cavalry', 15, 5);
  place(s, 'North', 'Cavalry', 16, 5);
  const result = computeCombat(s, targetAt(s, 12, 5));
  // Charge blocked; cavalry in range attack normally (lead dist 1, next dist 2).
  assert.equal(result.chargeSet.length, 0);
  assert.equal(result.totalAttack, 8);
});

// Row 53: cavalry in a fort cannot charge.
test('cavalry in a fort cannot charge (row 53)', () => {
  const s = createState();
  place(s, 'South', 'Foot Relay', 8, 1);  // supplies South target via chain
  place(s, 'South', 'Foot Relay', 9, 2);  // supplied by (8,1) diagonal
  place(s, 'South', 'Infantry', 9, 3);    // supplied by (9,2); target east of lead
  place(s, 'North', 'Foot Relay', 8, 18); // supplies x=8 column
  // Lead cavalry inside the South fort; column extends south away from target.
  place(s, 'North', 'Cavalry', 8, 3);
  place(s, 'North', 'Cavalry', 8, 2);
  place(s, 'North', 'Cavalry', 8, 1);
  place(s, 'North', 'Cavalry', 8, 0);
  const result = computeCombat(s, targetAt(s, 9, 3));
  assert.equal(result.chargeSet.length, 0);
  // Lead and next cavalry are in range, attacking normally.
  assert.equal(result.totalAttack, 8);
});

// Row 38: fire travels in straight lines only.
test('fire requires straight line from attacker to target (row 38)', () => {
  const s = createState();
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'North', 'Infantry', 9, 4); // not aligned with target
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.error, 'No attacker in range');
});

// Row 48: only mountains block fire.
test('units do not block fire (row 48)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 12, 10); // on (20,18) diagonal
  place(s, 'South', 'Infantry', 10, 10);
  place(s, 'South', 'Infantry', 10, 11); // intervening friendly
  place(s, 'North', 'Infantry', 10, 12); // supplied by (12,10) diagonal, can see target through friendly
  const result = computeCombat(s, targetAt(s, 10, 10));
  assert.equal(result.totalAttack, 4);
});

// Row 75: victory by eliminating all enemy fighting units.
test('findVictory detects elimination of all enemy fighters (row 75)', () => {
  const s = createState();
  place(s, 'North', 'Infantry', 4, 5);
  assert.deepEqual(findVictory(s), { winner: 'North', reason: 'all enemy fighting units eliminated' });
});

// Row 75, 76: victory by capturing both enemy arsenals.
test('findVictory detects both arsenals captured by enemy fighters (rows 75-76)', () => {
  const s = createState();
  place(s, 'North', 'Infantry', 4, 1);
  place(s, 'North', 'Infantry', 20, 1);
  place(s, 'South', 'Infantry', 4, 18); // keep a South fighter so elimination is not the trigger
  assert.deepEqual(findVictory(s), { winner: 'North', reason: 'both enemy arsenals captured' });
});

test('attackableEnemies lists only enemies with at least one attacker in range', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 10, 10);
  place(s, 'South', 'Infantry', 10, 10);
  place(s, 'North', 'Infantry', 10, 12);
  place(s, 'South', 'Infantry', 2, 2); // out of range of everyone
  const enemies = attackableEnemies(s, 'North');
  assert.equal(enemies.length, 1);
  assert.equal(enemies[0].x, 10);
});

// Row 37: any enemy unit can be targeted, including relays (defense 1, no attack value).
test('enemy relay can be attacked and uses its printed defense (row 37)', () => {
  const s = createState();
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Mounted Relay', 8, 2); // not a fighter, but an enemy unit
  place(s, 'North', 'Infantry', 8, 4);
  const result = computeCombat(s, targetAt(s, 8, 2));
  assert.equal(result.error, undefined);
  assert.equal(result.totalAttack, 4);
  assert.equal(result.totalDefense, 1);
  assert.equal(result.result, 'destroyed');
});
