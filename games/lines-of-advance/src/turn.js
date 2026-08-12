// turn.js: turn state, action economy, retreats, and game-end for LINES OF ADVANCE M4.
// Cites docs/RULES-LEDGER.md rows 31-35, 43-47, 63, 73-75.

import {
  cloneState,
  movePiece,
  pieceAt,
  findPiece,
  coordFromXY,
  isFighter,
  isRelay,
  serializeState,
  parseState
} from './state.js';
import { computeCombat, adjacentUnoccupiedSquares, findVictory } from './combat.js';
import { getLegalMoves } from './movement.js';
import { computeCommunications } from './comms.js';
import { isArsenal, arsenalSide } from './terrain.js';
import {
  createDrawState,
  cloneDrawState,
  markDrawProgress,
  completeDrawTurn,
  recordDrawPosition,
  agreeDraw,
  concede
} from './adjudication.js';

const MAX_MOVES_PER_TURN = 5;

function createTurnState(state) {
  return {
    ...state,
    turn: state.turn ?? 'North',
    turnNumber: state.turnNumber ?? 1,
    movedThisTurn: state.movedThisTurn ? state.movedThisTurn.slice() : [],
    hasAttacked: state.hasAttacked ?? false,
    pendingRetreats: state.pendingRetreats ? state.pendingRetreats.slice() : [],
    retreatedThisTurn: state.retreatedThisTurn ? state.retreatedThisTurn.slice() : [],
    log: state.log ? state.log.slice() : [],
    history: state.history ? state.history.slice() : [],
    gameOver: state.gameOver ? { ...state.gameOver } : null,
    combatPreview: state.combatPreview ? { ...state.combatPreview } : null,
    drawState: cloneDrawState(state.drawState)
  };
}

function initTurnState(state, firstSide = 'North') {
  const next = createTurnState(state);
  next.turn = firstSide;
  next.turnNumber = 1;
  next.movedThisTurn = [];
  next.hasAttacked = false;
  next.pendingRetreats = [];
  next.retreatedThisTurn = [];
  next.log = [];
  next.history = [];
  next.gameOver = null;
  next.combatPreview = null;
  next.drawState = createDrawState(next);
  return next;
}

function snapshotForHistory(state) {
  return serializeState(state);
}

function pushHistory(state) {
  const next = createTurnState(state);
  next.history = next.history.slice();
  next.history.push(snapshotForHistory(state));
  if (next.history.length > 100) next.history.shift();
  return next;
}

function hasRetreatPending(state, pieceId) {
  return state.pendingRetreats.some(r => r.id === pieceId);
}

function currentPendingRetreat(state) {
  const side = state.turn;
  return state.pendingRetreats.find(r => {
    const p = pieceAt(state, r.fromX, r.fromY);
    return p && p.side === side;
  }) || null;
}

function retreatDestinations(state, retreat) {
  const p = pieceAt(state, retreat.fromX, retreat.fromY);
  if (!p) return [];
  return adjacentUnoccupiedSquares(state, p);
}

function removePendingRetreat(state, retreatId) {
  const next = createTurnState(state);
  next.pendingRetreats = next.pendingRetreats.filter(r => r.id !== retreatId);
  return next;
}

function destroyPiece(state, pieceId) {
  const next = createTurnState(state);
  next.pieces = next.pieces.filter(p => p.id !== pieceId);
  return next;
}

function recordRetreatOutcome(state, pieceId, destroyed, dest = null) {
  const next = createTurnState(state);
  next.log = next.log.slice();
  const entry = next.log[next.log.length - 1];
  if (entry && entry.side === state.turn && entry.turn === state.turnNumber) {
    entry.events = entry.events || [];
    entry.events.push({
      type: destroyed ? 'retreat-failed' : 'retreat',
      pieceId,
      to: dest ? coordFromXY(dest.x, dest.y) : null,
      destroyed
    });
  }
  return next;
}

function applyRetreat(state, pieceId, x, y) {
  if (state.gameOver) return { state, error: 'Game over' };
  const retreat = state.pendingRetreats.find(r => r.id === pieceId);
  if (!retreat) return { state, error: 'No retreat pending' };
  const p = pieceAt(state, retreat.fromX, retreat.fromY);
  if (!p) {
    const next = removePendingRetreat(state, pieceId);
    return { state: next, error: null };
  }
  const dests = retreatDestinations(state, retreat);
  if (!dests.some(d => d.x === x && d.y === y)) {
    return { state, error: 'Illegal retreat square' };
  }
  let next = pushHistory(state);
  next = movePiece(next, pieceId, x, y);
  next = createTurnState(next);
  next.movedThisTurn = next.movedThisTurn.slice();
  next.movedThisTurn.push(pieceId);
  next.retreatedThisTurn = next.retreatedThisTurn.slice();
  next.retreatedThisTurn.push(pieceId);
  next = removePendingRetreat(next, pieceId);
  next = recordRetreatOutcome(next, pieceId, false, { x, y });
  next = markDrawProgress(next);
  next = checkVictory(next);
  next = recordDrawPosition(next);
  return { state: next, error: null };
}

function autoResolveRetreats(state) {
  // Resolve retreats that have no legal destination by destroying the unit.
  let next = createTurnState(state);
  let changed = true;
  while (changed) {
    changed = false;
    const retreat = currentPendingRetreat(next);
    if (!retreat) break;
    const dests = retreatDestinations(next, retreat);
    if (dests.length === 0) {
      const p = pieceAt(next, retreat.fromX, retreat.fromY);
      next = pushHistory(next);
      if (p) next = destroyPiece(next, p.id);
      next = removePendingRetreat(next, retreat.id);
      next = recordRetreatOutcome(next, retreat.id, true);
      next = markDrawProgress(next);
      next = checkVictory(next);
      changed = true;
    }
  }
  return next;
}

function movesRemaining(state) {
  return Math.max(0, MAX_MOVES_PER_TURN - state.movedThisTurn.length);
}

function canMovePiece(state, pieceId, options = {}) {
  if (state.gameOver) return false;
  // Row 35: once the turn's attack is declared, the movement phase is over.
  if (state.hasAttacked) return false;
  const p = findPiece(state, pieceId);
  if (!p) return false;
  if (p.side !== state.turn) return false;
  if (state.movedThisTurn.includes(pieceId)) return false;
  const comms = options.comms || computeCommunications(state);
  if (isFighter(p.cls)) {
    const audit = comms.status.get(pieceId);
    if (!audit || audit.status === 'isolated') return false;
  }
  return true;
}

function isInRetreatPhase(state) {
  return currentPendingRetreat(state) !== null;
}

function tryTurnMove(state, pieceId, x, y) {
  if (state.gameOver) return { state, error: 'Game over' };
  if (isInRetreatPhase(state)) {
    return applyRetreat(state, pieceId, x, y);
  }
  if (!canMovePiece(state, pieceId)) {
    return { state, error: 'Cannot move this unit' };
  }
  if (movesRemaining(state) === 0) {
    return { state, error: 'No moves remaining' };
  }
  const legal = getLegalMoves(state, pieceId);
  if (!legal.some(d => d.x === x && d.y === y)) {
    return { state, error: 'Illegal move' };
  }
  let next = pushHistory(state);
  const from = findPiece(next, pieceId);
  const fromCoord = from ? coordFromXY(from.x, from.y) : '??';
  next = movePiece(next, pieceId, x, y);
  next = createTurnState(next);
  next.movedThisTurn = next.movedThisTurn.slice();
  next.movedThisTurn.push(pieceId);
  next.log = next.log.slice();
  let entry = next.log.find(e => e.turn === next.turnNumber && e.side === next.turn);
  if (!entry) {
    entry = { turn: next.turnNumber, side: next.turn, moves: [], events: [] };
    next.log.push(entry);
  }
  entry.moves.push({
    pieceId,
    cls: from.cls,
    from: fromCoord,
    to: coordFromXY(x, y)
  });
  next.combatPreview = null;
  next = checkVictory(next);
  next = recordDrawPosition(next);
  return { state: next, error: null };
}

function computeCombatPreview(state, targetId) {
  if (state.gameOver || state.hasAttacked || isInRetreatPhase(state)) {
    return null;
  }
  return computeCombat(state, targetId);
}

function canDeclareAttack(state, targetId, options = {}) {
  if (state.gameOver) return false;
  if (state.hasAttacked) return false;
  if (isInRetreatPhase(state)) return false;
  const result = computeCombat(state, targetId, options);
  return !result.error;
}

function applyCombat(state, targetId) {
  if (state.gameOver) return { state, error: 'Game over' };
  if (state.hasAttacked) return { state, error: 'Attack already declared' };
  if (isInRetreatPhase(state)) return { state, error: 'Resolve retreats first' };

  const result = computeCombat(state, targetId);
  if (result.error) return { state, error: result.error };

  let next = pushHistory(state);
  next = createTurnState(next);
  next.hasAttacked = true;
  next.combatPreview = null;

  const target = findPiece(next, targetId);

  next.log = next.log.slice();
  let entry = next.log.find(e => e.turn === next.turnNumber && e.side === next.turn);
  if (!entry) {
    entry = { turn: next.turnNumber, side: next.turn, moves: [], events: [] };
    next.log.push(entry);
  }
  entry.attack = {
    targetId,
    targetCls: result.targetCls,
    targetCoord: result.targetCoord,
    totalAttack: result.totalAttack,
    totalDefense: result.totalDefense,
    margin: result.margin,
    result: result.result
  };

  if (result.result === 'destroyed') {
    next = destroyPiece(next, targetId);
    entry.events.push({ type: 'destroyed', pieceId: targetId, coord: result.targetCoord });
  } else if (result.result === 'retreat') {
    const dests = result.retreatDestinations;
    if (dests.length === 0) {
      next = destroyPiece(next, targetId);
      entry.events.push({ type: 'destroyed', pieceId: targetId, coord: result.targetCoord });
    } else {
      next.pendingRetreats = next.pendingRetreats.slice();
      next.pendingRetreats.push({ id: targetId, fromX: target.x, fromY: target.y });
      entry.events.push({ type: 'retreat-pending', pieceId: targetId, coord: result.targetCoord });
    }
  } else {
    entry.events.push({ type: 'resist', pieceId: targetId, coord: result.targetCoord });
  }

  if (result.result !== 'resist') next = markDrawProgress(next);
  next = checkVictory(next);
  next = recordDrawPosition(next);
  return { state: next, error: null, combat: result };
}

// Row 76-77: occupying an enemy arsenal uses the turn's single attack.
function applyArsenalCapture(state, x, y) {
  if (state.gameOver) return { state, error: 'Game over' };
  if (state.hasAttacked) return { state, error: 'Attack already declared' };
  if (isInRetreatPhase(state)) return { state, error: 'Resolve retreats first' };
  if (!isArsenal(x, y)) return { state, error: 'Not an arsenal' };
  const occupant = pieceAt(state, x, y);
  if (!occupant || occupant.side !== state.turn || !isFighter(occupant.cls)) {
    return { state, error: 'Friendly fighter must occupy the arsenal' };
  }
  if (arsenalSide(x, y) === state.turn) {
    return { state, error: 'Cannot capture your own arsenal' };
  }
  if (!(state.movedThisTurn || []).includes(occupant.id)) {
    return { state, error: 'Arsenal is already held' };
  }
  if ((state.retreatedThisTurn || []).includes(occupant.id)) {
    return { state, error: 'A retreating unit cannot capture an arsenal' };
  }

  let next = pushHistory(state);
  next = createTurnState(next);
  next.hasAttacked = true;
  next.combatPreview = null;

  next.log = next.log.slice();
  let entry = next.log.find(e => e.turn === next.turnNumber && e.side === next.turn);
  if (!entry) {
    entry = { turn: next.turnNumber, side: next.turn, moves: [], events: [] };
    next.log.push(entry);
  }
  entry.attack = {
    type: 'arsenal-capture',
    coord: coordFromXY(x, y),
    pieceId: occupant.id
  };
  entry.events.push({ type: 'arsenal-captured', coord: coordFromXY(x, y), pieceId: occupant.id });

  next = markDrawProgress(next);
  next = checkVictory(next);
  next = recordDrawPosition(next);
  return { state: next, error: null };
}

function endTurn(state) {
  if (state.gameOver) return state;
  let next = createTurnState(state);
  next.turn = next.turn === 'North' ? 'South' : 'North';
  if (next.turn === 'North') next.turnNumber += 1;
  next.movedThisTurn = [];
  next.hasAttacked = false;
  next.retreatedThisTurn = [];
  next.combatPreview = null;
  next = completeDrawTurn(next);
  if (next.gameOver) return next;
  next = autoResolveRetreats(next);
  next = recordDrawPosition(next);
  return next;
}

function checkVictory(state) {
  if (state.gameOver) return state;
  const victory = findVictory(state);
  if (!victory) return state;
  const next = createTurnState(state);
  next.gameOver = victory;
  return next;
}

function undo(state) {
  if (state.history.length === 0) return state;
  const next = createTurnState(state);
  const previous = parseState(next.history[next.history.length - 1]);
  previous.history = next.history.slice(0, -1);
  // The restored snapshot already contains the log as it was before the last
  // action, so leave it in place. Carrying forward the current log would leave
  // a false record of the undone move.
  return previous;
}

function restart(state, side = 'North') {
  const next = initTurnState(state, side);
  return next;
}

export {
  MAX_MOVES_PER_TURN,
  createTurnState,
  initTurnState,
  pushHistory,
  hasRetreatPending,
  currentPendingRetreat,
  retreatDestinations,
  applyRetreat,
  autoResolveRetreats,
  movesRemaining,
  canMovePiece,
  isInRetreatPhase,
  tryTurnMove,
  computeCombatPreview,
  canDeclareAttack,
  applyCombat,
  applyArsenalCapture,
  endTurn,
  checkVictory,
  undo,
  restart,
  agreeDraw,
  concede
};
