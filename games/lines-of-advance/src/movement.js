// movement.js: verified legal-move generation for LINES OF ADVANCE M3.
// Cites docs/RULES-LEDGER.md rows 15-30, 26, 55-66, 69, 72.

import {
  BOARD_COLS,
  BOARD_ROWS,
  coordFromXY,
  isOnBoard,
  pieceAt,
  movePiece,
  isFighter,
  isRelay
} from './state.js';
import { isMountain, isPassable } from './terrain.js';
import { computeCommunications } from './comms.js';

const DIRECTIONS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
]);

// One-square moves: any of the eight directions to an empty, passable square.
function oneSquareDestinations(state, piece) {
  const dests = [];
  for (const [dx, dy] of DIRECTIONS) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (isLegalDestination(state, x, y)) {
      dests.push({ x, y, coord: coordFromXY(x, y) });
    }
  }
  return dests;
}

// Two-square moves: straight-straight, diagonal-diagonal, or straight+diagonal/L-shape.
function twoSquareDestinations(state, piece) {
  const seen = new Set();
  const dests = [];
  function add(x, y) {
    const coord = coordFromXY(x, y);
    if (seen.has(coord)) return;
    seen.add(coord);
    dests.push({ x, y, coord });
  }
  // 2 straight/diagonal in a direction.
  for (const [dx, dy] of DIRECTIONS) {
    const mx = piece.x + dx;
    const my = piece.y + dy;
    const x = piece.x + 2 * dx;
    const y = piece.y + 2 * dy;
    if (isLegalDestination(state, x, y) && isEmptyPassable(state, mx, my)) {
      add(x, y);
    }
  }
  // L-shapes: one straight then one diagonal (or diagonal then straight).
  // Enumerate the 8 (dx,dy) outcomes with |dx|+|dy| == 3 and neither zero.
  const lShapes = [
    [-2, -1], [-1, -2], [1, -2], [2, -1],
    [-2, 1],  [-1, 2],  [1, 2],  [2, 1]
  ];
  for (const [dx, dy] of lShapes) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (!isLegalDestination(state, x, y)) continue;
    // Two valid step orders; accept if either is unoccupied and passable.
    // orderA: straight then diagonal (row 28).
    const orderA = [ { x: piece.x + Math.sign(dx), y: piece.y }, { x: piece.x + dx, y: piece.y + Math.sign(dy) } ];
    // orderB: diagonal then straight (row 28).
    const orderB = [ { x: piece.x + Math.sign(dx), y: piece.y + Math.sign(dy) }, { x: piece.x + dx, y: piece.y + Math.sign(dy) } ];
    if (isEmptyPassable(state, orderA[0].x, orderA[0].y) && isEmptyPassable(state, orderA[1].x, orderA[1].y)) {
      add(x, y);
    } else if (isEmptyPassable(state, orderB[0].x, orderB[0].y) && isEmptyPassable(state, orderB[1].x, orderB[1].y)) {
      add(x, y);
    }
  }
  return dests;
}

function isEmptyPassable(state, x, y) {
  return isOnBoard(x, y) && isPassable(x, y) && pieceAt(state, x, y) === null;
}

function isLegalDestination(state, x, y) {
  return isOnBoard(x, y) && isPassable(x, y) && pieceAt(state, x, y) === null;
}

function isImmobile(state, piece, comms = null) {
  // Row 63: isolated fighting units are immobile. Row 69: relays may move while isolated.
  if (isRelay(piece.cls)) return false;
  const communicationState = comms || computeCommunications(state);
  const audit = communicationState.status.get(piece.id);
  return !audit || audit.status === 'isolated';
}

function getLegalMoves(state, pieceId, options = {}) {
  const piece = state.pieces.find(p => p.id === pieceId);
  if (!piece) return [];

  if (isImmobile(state, piece, options.comms)) return [];

  const movement = piece.stats.movement;
  if (movement >= 2) {
    // Row 26: two-square movers may be moved only 1 square if the player prefers.
    const dests = twoSquareDestinations(state, piece);
    const seen = new Set(dests.map(d => d.coord));
    for (const d of oneSquareDestinations(state, piece)) {
      if (!seen.has(d.coord)) {
        dests.push(d);
      }
    }
    return dests;
  }
  return oneSquareDestinations(state, piece);
}

function destinationIsLegal(state, pieceId, x, y) {
  return getLegalMoves(state, pieceId).some(d => d.x === x && d.y === y);
}

function tryMovePiece(state, id, x, y) {
  if (!isOnBoard(x, y)) {
    return { state, error: 'Off-board' };
  }
  if (state.sandbox) {
    if (!isPassable(x, y)) {
      return { state, error: 'Mountain' };
    }
    return { state: movePiece(state, id, x, y), error: null };
  }
  if (!destinationIsLegal(state, id, x, y)) {
    return { state, error: 'Illegal move' };
  }
  return { state: movePiece(state, id, x, y), error: null };
}

export {
  DIRECTIONS,
  getLegalMoves,
  tryMovePiece,
  destinationIsLegal,
  isImmobile
};
