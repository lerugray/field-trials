// adjudication.js: shared draw and concession handling for browser and harness play.

const REPETITION_LIMIT = 3;
const NO_PROGRESS_TURN_LIMIT = 80;

function drawPositionKey(state) {
  const pieces = (state.pieces || [])
    .map(piece => `${piece.id}:${piece.side[0]}:${piece.cls}:${piece.x},${piece.y}`)
    .sort()
    .join('|');
  const retreats = (state.pendingRetreats || [])
    .map(retreat => `${retreat.id}:${retreat.fromX},${retreat.fromY}`)
    .join('|');
  const moved = (state.movedThisTurn || []).slice().sort().join(',');
  const retreated = (state.retreatedThisTurn || []).slice().sort().join(',');
  return `${state.rulesetId};${state.turn};${state.hasAttacked ? 1 : 0};${moved};${retreated};${retreats};${pieces}`;
}

function createDrawState(state) {
  return {
    positionCounts: { [drawPositionKey(state)]: 1 },
    noProgressTurns: 0,
    progressThisTurn: false
  };
}

function cloneDrawState(drawState) {
  if (!drawState) return null;
  return {
    positionCounts: { ...(drawState.positionCounts || {}) },
    noProgressTurns: drawState.noProgressTurns || 0,
    progressThisTurn: Boolean(drawState.progressThisTurn)
  };
}

function markDrawProgress(state) {
  if (!state.drawState) return state;
  return {
    ...state,
    drawState: { ...cloneDrawState(state.drawState), progressThisTurn: true }
  };
}

function completeDrawTurn(state) {
  if (!state.drawState || state.gameOver) return state;
  const drawState = cloneDrawState(state.drawState);
  drawState.noProgressTurns = drawState.progressThisTurn
    ? 0
    : drawState.noProgressTurns + 1;
  drawState.progressThisTurn = false;
  const next = { ...state, drawState };
  if (drawState.noProgressTurns >= NO_PROGRESS_TURN_LIMIT) {
    next.gameOver = { winner: null, result: 'draw', reason: '80-turn no-progress draw' };
  }
  return next;
}

function recordDrawPosition(state) {
  if (!state.drawState || state.gameOver) return state;
  const drawState = cloneDrawState(state.drawState);
  const key = drawPositionKey(state);
  const count = (drawState.positionCounts[key] || 0) + 1;
  drawState.positionCounts[key] = count;
  const next = { ...state, drawState };
  if (count >= REPETITION_LIMIT) {
    next.gameOver = { winner: null, result: 'draw', reason: 'threefold repetition' };
  }
  return next;
}

function agreeDraw(state) {
  if (state.gameOver) return state;
  return { ...state, gameOver: { winner: null, result: 'draw', reason: 'draw agreed' } };
}

function concede(state, side = state.turn) {
  if (state.gameOver) return state;
  const winner = side === 'North' ? 'South' : 'North';
  return { ...state, gameOver: { winner, reason: `${side} conceded` } };
}

export {
  REPETITION_LIMIT,
  NO_PROGRESS_TURN_LIMIT,
  drawPositionKey,
  createDrawState,
  cloneDrawState,
  markDrawProgress,
  completeDrawTurn,
  recordDrawPosition,
  agreeDraw,
  concede
};
