// metrics.js: S3.2 pathology metrics computed from an S2 game record.

import { computeCommunications, activeArsenals } from '../../src/comms.js';
import { isFighter } from '../../src/state.js';
import { parseLoa1, parseAction } from '../../src/notation.js';

function sideOfLoa1(loa1) {
  return loa1.match(/ t=([NS]) /)?.[1];
}

function fullTurns(actions) {
  // Group primitive actions into full turns. Each turn ends with an E action
  // (or game end). The first turn begins from the implicit start state.
  const turns = [];
  let current = [];
  for (const entry of actions) {
    current.push(entry);
    if (entry.action === 'E') {
      turns.push(current);
      current = [];
    }
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

function moveOfPiece(turn, pieceId) {
  for (const entry of turn) {
    const a = parseAction(entry.action);
    if ((a.type === 'move' || a.type === 'retreat') && a.pieceId === pieceId) {
      return { ...a, before: entry.before, after: entry.after };
    }
  }
  return null;
}

function firstMove(turn) {
  for (const entry of turn) {
    const a = parseAction(entry.action);
    if (a.type === 'move' || a.type === 'retreat') {
      return { ...a, before: entry.before };
    }
  }
  return null;
}

function lastMoveOfPiece(turn, pieceId) {
  let last = null;
  for (const entry of turn) {
    const a = parseAction(entry.action);
    if ((a.type === 'move' || a.type === 'retreat') && a.pieceId === pieceId) {
      last = { ...a, before: entry.before, after: entry.after };
    }
  }
  return last;
}

function isReversal(prevTurn, currTurn) {
  // A turn contains an exact reversal if at least one of its moves moves a
  // piece back to the square that piece occupied at the start of that side's
  // previous full turn.
  if (!prevTurn || prevTurn.length === 0 || currTurn.length === 0) return false;
  const prevSide = sideOfLoa1(prevTurn[0].before);
  const currSide = sideOfLoa1(currTurn[0].before);
  if (prevSide !== currSide) return false;
  return countPieceReturns(prevTurn, currTurn).returns > 0;
}

function countPieceReturns(prevTurn, currTurn) {
  if (!prevTurn || prevTurn.length === 0 || currTurn.length === 0) {
    return { returns: 0, eligible: 0 };
  }
  const prevSide = sideOfLoa1(prevTurn[0].before);
  const currSide = sideOfLoa1(currTurn[0].before);
  if (prevSide !== currSide) return { returns: 0, eligible: 0 };
  let returns = 0;
  let eligible = 0;
  for (const entry of currTurn) {
    const a = parseAction(entry.action);
    if (a.type !== 'move' && a.type !== 'retreat') continue;
    const prevMove = lastMoveOfPiece(prevTurn, a.pieceId);
    if (!prevMove) continue;
    eligible += 1;
    const startOfPrev = parseLoa1(prevMove.before);
    const pieceBeforePrev = startOfPrev.pieces.find(p => p.id === a.pieceId);
    if (!pieceBeforePrev) continue;
    if (a.x === pieceBeforePrev.x && a.y === pieceBeforePrev.y) returns += 1;
  }
  return { returns, eligible };
}

function isFirstMoveReversal(prevTurn, currTurn) {
  if (!prevTurn || prevTurn.length === 0 || currTurn.length === 0) return false;
  const prevSide = sideOfLoa1(prevTurn[0].before);
  const currSide = sideOfLoa1(currTurn[0].before);
  if (prevSide !== currSide) return false;
  const first = firstMove(currTurn);
  if (!first) return false;
  const prevMove = lastMoveOfPiece(prevTurn, first.pieceId);
  if (!prevMove) return false;
  const startOfPrev = parseLoa1(prevMove.before);
  const pieceBeforePrev = startOfPrev.pieces.find(p => p.id === first.pieceId);
  if (!pieceBeforePrev) return false;
  return first.x === pieceBeforePrev.x && first.y === pieceBeforePrev.y;
}

function distanceToNearestEnemyArsenal(state, piece) {
  const enemy = piece.side === 'North' ? 'South' : 'North';
  const arsenals = activeArsenals(state, enemy);
  let nearest = Infinity;
  for (const a of arsenals) {
    nearest = Math.min(nearest, Math.max(Math.abs(piece.x - a.x), Math.abs(piece.y - a.y)));
  }
  return nearest;
}

function isAdvancingMove(entry) {
  const a = parseAction(entry.action);
  if (a.type !== 'move' && a.type !== 'retreat') return false;
  const before = parseLoa1(entry.before);
  const piece = before.pieces.find(p => p.id === a.pieceId);
  if (!piece || !isFighter(piece.cls)) return false;
  const beforeDist = distanceToNearestEnemyArsenal(before, piece);
  const after = parseLoa1(entry.after);
  const movedPiece = after.pieces.find(p => p.id === a.pieceId);
  if (!movedPiece) return false;
  const afterDist = distanceToNearestEnemyArsenal(after, movedPiece);
  if (afterDist >= beforeDist) return false;
  // Must remain in communication after the move.
  const comms = computeCommunications(after);
  const audit = comms.status.get(a.pieceId);
  return audit && audit.status === 'in-communication';
}

function hasAttack(turn) {
  for (const entry of turn) {
    const a = parseAction(entry.action);
    if (a.type === 'attack') return true;
  }
  return false;
}

function hasArsenalAction(turn) {
  for (const entry of turn) {
    const a = parseAction(entry.action);
    if (a.type === 'arsenal') return true;
  }
  return false;
}

function missedArsenalOpportunities(turn) {
  // Count whether a Z action was legal at the first decision of the turn
  // but the turn did not contain a Z action.
  if (turn.length === 0) return 0;
  if (hasArsenalAction(turn)) return 0;
  const first = turn[0];
  return first.legalActions && first.legalActions.some(a => a.type === 'arsenal') ? 1 : 0;
}

function computeCycleLength2Count(actions) {
  // Count exact two-position cycles: the position after a full turn equals
  // the position two full turns earlier, and the intervening turn is the
  // opponent's reply between them.
  const turns = fullTurns(actions);
  let count = 0;
  for (let i = 2; i < turns.length; i += 1) {
    const prevAfter = turns[i - 2][turns[i - 2].length - 1]?.after;
    const currAfter = turns[i][turns[i].length - 1]?.after;
    if (prevAfter && currAfter && prevAfter === currAfter) count += 1;
  }
  return count;
}

function computeCompletedDepthHistogram(actions) {
  const hist = {};
  for (const entry of actions) {
    const d = entry.depth ?? 0;
    hist[d] = (hist[d] ?? 0) + 1;
  }
  return hist;
}

function computePathologyMetrics(record) {
  const actions = record.actions || [];
  const turns = fullTurns(actions);
  let reversalTurns = 0;
  let firstMoveReversalTurns = 0;
  let reversalPieceReturns = 0;
  let reversalEligiblePieceMoves = 0;
  let attackTurns = 0;
  let arsenalAttempts = 0;
  let advancingFighterMoves = 0;
  let fighterMoves = 0;

  // Build per-side previous turns for reversal metrics.
  const lastOwnTurn = { N: null, S: null };
  for (const turn of turns) {
    if (turn.length === 0) continue;
    const side = sideOfLoa1(turn[0].before);
    if (!side) continue;
    const pieceReturns = countPieceReturns(lastOwnTurn[side], turn);
    if (pieceReturns.returns > 0) reversalTurns += 1;
    reversalPieceReturns += pieceReturns.returns;
    reversalEligiblePieceMoves += pieceReturns.eligible;
    if (isFirstMoveReversal(lastOwnTurn[side], turn)) firstMoveReversalTurns += 1;
    if (hasAttack(turn)) attackTurns += 1;
    if (hasArsenalAction(turn) || missedArsenalOpportunities(turn)) arsenalAttempts += 1;
    for (const entry of turn) {
      const a = parseAction(entry.action);
      if (a.type === 'move' || a.type === 'retreat') {
        const before = parseLoa1(entry.before);
        const piece = before.pieces.find(p => p.id === a.pieceId);
        if (piece && isFighter(piece.cls)) {
          fighterMoves += 1;
          if (isAdvancingMove(entry)) advancingFighterMoves += 1;
        }
      }
    }
    lastOwnTurn[side] = turn;
  }

  const turnCount = turns.length;
  return {
    reverseRate: turnCount ? reversalTurns / turnCount : 0,
    perPieceReturnRate: reversalEligiblePieceMoves
      ? reversalPieceReturns / reversalEligiblePieceMoves : 0,
    absoluteReversalCount: reversalPieceReturns,
    firstMoveReverseRate: turnCount ? firstMoveReversalTurns / turnCount : 0,
    advanceRate: fighterMoves ? advancingFighterMoves / fighterMoves : 0,
    absoluteAdvancingMoves: advancingFighterMoves,
    attackTurns,
    arsenalAttempts,
    cycleLength2Count: computeCycleLength2Count(actions),
    completedDepthHistogram: computeCompletedDepthHistogram(actions),
    _raw: {
      turnCount,
      reversalTurns,
      firstMoveReversalTurns,
      reversalPieceReturns,
      reversalEligiblePieceMoves,
      advancingFighterMoves,
      fighterMoves
    }
  };
}

export {
  computePathologyMetrics,
  fullTurns,
  isReversal,
  countPieceReturns,
  isFirstMoveReversal,
  isAdvancingMove
};
