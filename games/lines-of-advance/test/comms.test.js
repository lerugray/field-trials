import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  createPiece,
  movePiece,
  resetToTestPreset,
  resetToCommsDrill
} from '../src/state.js';
import { computeCommunications } from '../src/comms.js';

test('opening deploys each side in its territory and every unit in communication (rows 57-61, 82)', () => {
  const state = resetToTestPreset(createState());
  const comms = computeCommunications(state);

  for (const piece of state.pieces) {
    assert.ok(piece.side === 'North' ? piece.y >= 10 : piece.y <= 9);
    assert.equal(comms.status.get(piece.id).status, 'in-communication');
  }
});

test('infantry on an arsenal line is in communication', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 2 }));
  const comms = computeCommunications(s);
  const audit = comms.status.get(s.pieces[0].id);
  assert.equal(audit.status, 'in-communication');
  assert.equal(audit.sourceArsenal, 'e2');
});

test('mountain blocks direct supply beyond it', () => {
  let s = createState();
  // South arsenal e2 casts a line north; e9 (4,8) is a South mountain square.
  const comms = computeCommunications(s);
  const southSquares = comms.sideSupplied.South;
  // e8 (4,7) is the last supplied square before the ridge.
  assert.ok(southSquares.has('e8'));
  assert.ok(!southSquares.has('e9'));
});

test('relay extends supply along a new straight line', () => {
  let s = createState();
  // North relay on the arsenal line, extending east to a friendly infantry.
  s.pieces.push(createPiece({ side: 'North', cls: 'Foot Relay', x: 4, y: 16 })); // e17
  s.pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 8, y: 16 }));   // i17 (North fort, passable)
  const comms = computeCommunications(s);
  const infantry = s.pieces.find(p => p.cls === 'Infantry');
  const audit = comms.status.get(infantry.id);
  assert.equal(audit.status, 'in-communication');
  assert.equal(audit.sourceArsenal, 'e19');
  assert.deepEqual(audit.relayChain, ['e17']);
});

test('indirect communication spreads through adjacent fighting units', () => {
  let s = resetToCommsDrill(createState());
  const comms = computeCommunications(s);
  const direct = s.pieces.find(p => p.side === 'North' && p.x === 4 && p.y === 16);
  const indirect = s.pieces.find(p => p.side === 'North' && p.x === 5 && p.y === 16);
  assert.equal(comms.status.get(direct.id).status, 'in-communication');
  assert.equal(comms.status.get(indirect.id).status, 'in-communication');
  assert.equal(comms.status.get(indirect.id).via, direct.id);
});

test('enemy fighter on the line cuts supply', () => {
  let s = resetToCommsDrill(createState());
  const enemy = s.pieces.find(p => p.side === 'South' && p.x === 5 && p.y === 17);
  s = movePiece(s, enemy.id, 4, 17); // step onto e18, between arsenal e19 and infantry e17

  const comms = computeCommunications(s);
  const northUnits = s.pieces.filter(p => p.side === 'North');
  for (const p of northUnits) {
    assert.equal(comms.status.get(p.id).status, 'isolated');
  }
});

test('cut line audit names the cutting square and enemy unit', () => {
  let s = resetToCommsDrill(createState());
  const enemy = s.pieces.find(p => p.side === 'South' && p.x === 5 && p.y === 17);
  s = movePiece(s, enemy.id, 4, 17);

  const comms = computeCommunications(s);
  const direct = s.pieces.find(p => p.side === 'North' && p.x === 4 && p.y === 16);
  const audit = comms.status.get(direct.id);
  assert.equal(audit.status, 'isolated');
  assert.ok(audit.reason.includes('e18'));
  assert.ok(audit.reason.toLowerCase().includes('south'));
});

test('enemy relay does not sever a line', () => {
  let s = createState();
  // South infantry supplied by e2; place an enemy (North) relay on the line at e3.
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 3 }));
  s.pieces.push(createPiece({ side: 'North', cls: 'Foot Relay', x: 4, y: 2 }));
  const comms = computeCommunications(s);
  const southInf = s.pieces.find(p => p.side === 'South');
  assert.equal(comms.status.get(southInf.id).status, 'in-communication');
});

test('out-of-communication enemy fighter still severs a line', () => {
  let s = resetToCommsDrill(createState());
  const enemy = s.pieces.find(p => p.side === 'South' && p.x === 5 && p.y === 17);
  // The South cutter starts isolated (far from its own arsenals).
  const before = computeCommunications(s);
  assert.equal(before.status.get(enemy.id).status, 'isolated');

  s = movePiece(s, enemy.id, 4, 17); // step onto e18
  const after = computeCommunications(s);
  // Even though the cutter is isolated, it still severs the North line.
  const northUnits = s.pieces.filter(p => p.side === 'North');
  for (const p of northUnits) {
    assert.equal(after.status.get(p.id).status, 'isolated');
  }
});

test('coverage set includes an arsenal ray and relay reradiation but stops at a cut', () => {
  const s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Foot Relay', x: 4, y: 3 })); // e4
  s.pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 4, y: 5 }));  // e6 cuts northward rays

  const coverage = computeCommunications(s).sideSupplied.South;
  assert.ok(coverage.has('e3'), 'arsenal ray reaches e3');
  assert.ok(coverage.has('e4'), 'arsenal ray reaches the relay at e4');
  assert.ok(coverage.has('e5'), 'relay ray reaches the square before the cutter');
  assert.ok(coverage.has('f4'), 'relay reradiates east from e4');
  assert.deepEqual(coverage.get('f4').relayChain, ['e4']);
  assert.ok(!coverage.has('e6'), 'the enemy fighter square is not covered');
  assert.ok(!coverage.has('e7'), 'coverage does not pass through the cut');
});
