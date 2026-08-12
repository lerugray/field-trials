import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  createPiece,
  selectPiece,
  clearSelection,
  movePiece,
  resetToTestPreset,
  resetToCommsDrill,
  serializeState,
  parseState,
  pieceAt,
  findPiece,
  isFighter,
  isRelay,
  unitStats,
  BOARD_COLS,
  BOARD_ROWS
} from '../src/state.js';

test('createState starts empty and rules-verified', () => {
  const s = createState();
  assert.equal(s.pieces.length, 0);
  assert.equal(s.selectedId, null);
  assert.equal(s.moveCount, 0);
  assert.equal(s.rulesStatus, 'rules: 92.7% verified');
  assert.equal(s.sandbox, false);
  assert.equal(s.settings.sfx, true);
});

test('createPiece validates side, class, board bounds, and terrain', () => {
  const p = createPiece({ side: 'North', cls: 'Infantry', x: 0, y: 0 });
  assert.equal(p.side, 'North');
  assert.equal(p.cls, 'Infantry');
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
  assert.equal(p.stats.attack, 4);
  assert.equal(p.stats.defense, 6);
  assert.equal(p.stats.movement, 1);
  assert.ok(isFighter(p.cls));
  assert.ok(!isRelay(p.cls));
  assert.throws(() => createPiece({ side: 'East', cls: 'Infantry', x: 0, y: 0 }));
  assert.throws(() => createPiece({ side: 'North', cls: 'Tank', x: 0, y: 0 }));
  assert.throws(() => createPiece({ side: 'North', cls: 'Infantry', x: 25, y: 0 }));
  assert.throws(() => createPiece({ side: 'North', cls: 'Infantry', x: 6, y: 11 })); // mountain
});

test('unitStats returns verified values', () => {
  assert.equal(unitStats('Cavalry').movement, 2);
  assert.equal(unitStats('Foot Artillery').attack, 5);
  assert.equal(unitStats('Mounted Artillery').movement, 2);
  assert.equal(unitStats('Foot Relay').defense, 1);
  assert.equal(unitStats('Mounted Relay').movement, 2);
});

test('selectPiece and clearSelection are immutable', () => {
  let s = createState();
  s = resetToTestPreset(s);
  const id = s.pieces[0].id;
  const s2 = selectPiece(s, id);
  assert.equal(s2.selectedId, id);
  assert.equal(s.selectedId, null);
  const s3 = clearSelection(s2);
  assert.equal(s3.selectedId, null);
  assert.equal(s2.selectedId, id);
});

test('movePiece moves a piece and increments counter', () => {
  let s = createState();
  s = resetToTestPreset(s);
  const p = s.pieces[0];
  const s2 = movePiece(s, p.id, 5, 5);
  assert.equal(s2.pieces[0].x, 5);
  assert.equal(s2.pieces[0].y, 5);
  assert.equal(s2.moveCount, 1);
  assert.equal(s.pieces[0].x, p.x);
});

test('movePiece rejects off-board and mountain coordinates', () => {
  let s = createState();
  s = resetToTestPreset(s);
  const p = s.pieces[0];
  const s2 = movePiece(s, p.id, 99, 99);
  assert.deepEqual(s2, s);
  const s3 = movePiece(s, p.id, 6, 11);
  assert.deepEqual(s3, s);
});

test('opening preset has the verified 17-unit roster per side (rows 13-14)', () => {
  let s = createState();
  s = resetToTestPreset(s);
  assert.equal(s.pieces.length, 34);
  assert.equal(s.preset, 'standard');
  assert.equal(s.moveCount, 0);
  const north = s.pieces.filter(p => p.side === 'North');
  const south = s.pieces.filter(p => p.side === 'South');
  assert.equal(north.length, 17);
  assert.equal(south.length, 17);
  for (const side of [north, south]) {
    assert.equal(side.filter(p => p.cls === 'Infantry').length, 9);
    assert.equal(side.filter(p => p.cls === 'Cavalry').length, 4);
    assert.equal(side.filter(p => p.cls === 'Foot Artillery').length, 1);
    assert.equal(side.filter(p => p.cls === 'Mounted Artillery').length, 1);
    assert.equal(side.filter(p => p.cls === 'Foot Relay').length, 1);
    assert.equal(side.filter(p => p.cls === 'Mounted Relay').length, 1);
  }
});

test('resetToTestPreset restores moved pieces', () => {
  let s = createState();
  s = resetToTestPreset(s);
  const p = s.pieces[0];
  s = movePiece(s, p.id, 12, 10);
  s = selectPiece(s, p.id);
  const s2 = resetToTestPreset(s);
  assert.equal(s2.pieces[0].x, p.x);
  assert.equal(s2.pieces[0].y, p.y);
  assert.equal(s2.selectedId, null);
  assert.equal(s2.moveCount, 0);
});

test('comms drill preset loads without error', () => {
  let s = createState();
  s = resetToCommsDrill(s);
  assert.equal(s.preset, 'comms-drill');
  assert.ok(s.pieces.some(p => p.side === 'North' && p.cls === 'Infantry' && p.x === 4 && p.y === 16));
  assert.ok(s.pieces.some(p => p.side === 'South' && p.cls === 'Infantry' && p.x === 5 && p.y === 17));
});

test('serialize/parse round-trip preserves state', () => {
  let s = createState();
  s = resetToTestPreset(s);
  s = selectPiece(s, s.pieces[3].id);
  s = movePiece(s, s.pieces[0].id, 7, 7);
  s.sandbox = true;
  s.showAllComms = true;
  s.settings.music = true;
  s.turn = 'South';
  s.turnNumber = 3;
  s.movedThisTurn = [s.pieces[0].id];
  s.hasAttacked = true;
  s.pendingRetreats = [{ id: 'x', fromX: 1, fromY: 2 }];
  s.log = [{ turn: 1, side: 'North', moves: [], events: [] }];
  const json = serializeState(s);
  const s2 = parseState(json);
  assert.deepEqual(s2.board, s.board);
  assert.equal(s2.pieces.length, s.pieces.length);
  for (let i = 0; i < s.pieces.length; i += 1) {
    assert.equal(s2.pieces[i].id, s.pieces[i].id);
    assert.equal(s2.pieces[i].side, s.pieces[i].side);
    assert.equal(s2.pieces[i].cls, s.pieces[i].cls);
    assert.equal(s2.pieces[i].x, s.pieces[i].x);
    assert.equal(s2.pieces[i].y, s.pieces[i].y);
  }
  assert.equal(s2.selectedId, s.selectedId);
  assert.equal(s2.moveCount, s.moveCount);
  assert.equal(s2.preset, s.preset);
  assert.equal(s2.rulesetId, 'base-v1');
  assert.equal(s2.rulesStatus, s.rulesStatus);
  assert.equal(s2.sandbox, s.sandbox);
  assert.equal(s2.showAllComms, s.showAllComms);
  assert.equal(s2.settings.music, s.settings.music);
  assert.equal(s2.turn, s.turn);
  assert.equal(s2.turnNumber, s.turnNumber);
  assert.deepEqual(s2.movedThisTurn, s.movedThisTurn);
  assert.equal(s2.hasAttacked, s.hasAttacked);
  assert.deepEqual(s2.pendingRetreats, s.pendingRetreats);
  assert.deepEqual(s2.log, s.log);
});

test('parseState rejects unsupported versions', () => {
  assert.throws(() => parseState('{"version":1}'));
  assert.throws(() => parseState('{"version":99}'));
});

test('save files tag the base ruleset and reject unavailable rulesets', () => {
  const state = createState();
  const raw = JSON.parse(serializeState(state));
  assert.equal(raw.version, 4);
  assert.equal(raw.rulesetId, 'base-v1');
  assert.equal(parseState({ version: 3 }).rulesetId, 'base-v1');
  assert.throws(() => parseState({ version: 4, rulesetId: 'post-v1-test' }), /Unsupported ruleset/);
});

test('pieceAt and findPiece locate pieces', () => {
  let s = createState();
  s = resetToTestPreset(s);
  const p = s.pieces[0];
  assert.equal(pieceAt(s, p.x, p.y).id, p.id);
  assert.equal(findPiece(s, p.id).id, p.id);
  assert.equal(pieceAt(s, 24, 19), null);
  assert.equal(findPiece(s, 'missing'), null);
});

test('relay classes are not fighters', () => {
  assert.ok(isRelay('Foot Relay'));
  assert.ok(isRelay('Mounted Relay'));
  assert.ok(!isFighter('Foot Relay'));
  assert.ok(!isFighter('Mounted Relay'));
});

test('serialized state never embeds undo history (exponential-growth regression)', async () => {
  const { pushHistory } = await import('../src/turn.js');
  let state = resetToTestPreset(createState());
  const firstLen = serializeState(state).length;

  // 20 successive history pushes: with embedded history this doubles per push
  // (2^20 x base by the end); without it, size stays flat.
  for (let i = 0; i < 20; i++) state = pushHistory(state);
  const lastLen = serializeState(state).length;
  assert.ok(
    lastLen < firstLen * 2,
    `snapshot grew ${firstLen} -> ${lastLen}; history is leaking into serialization`
  );

  // Round-trip: a parsed save starts with an empty runtime-only undo stack.
  const parsed = parseState(serializeState(state));
  assert.deepEqual(parsed.history, []);

  // Legacy saves that DO carry embedded history load safely and discard it.
  const legacy = JSON.parse(serializeState(state));
  legacy.history = [serializeState(state)];
  assert.deepEqual(parseState(JSON.stringify(legacy)).history, []);
});
