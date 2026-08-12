// engine.js: deterministic legal-action adapter, evaluator, and negamax search.
// Rules semantics stay in movement.js, combat.js, comms.js, and turn.js. This module
// only enumerates their public legal actions and applies them through those same APIs.

import { coordFromXY, xyFromCoord, isFighter, isRelay, pieceAt } from './state.js';
import { getLegalMoves } from './movement.js';
import { computeCommunications, activeArsenals } from './comms.js';
import { canMovePiece, isInRetreatPhase, currentPendingRetreat, movesRemaining,
  tryTurnMove, applyCombat, applyArsenalCapture, applyRetreat, endTurn,
  canDeclareAttack } from './turn.js';
import { adjacentUnoccupiedSquares, attackableEnemies, computeCombat } from './combat.js';
import { activeArsenalsForSide, arsenalSide, isArsenal } from './terrain.js';

const ENGINE_SEED = 0x4c4f4135;
const ENGINE_TIME_BUDGET_MS = 900;
const HINT_TIME_BUDGET_MS = 450;
// A millisecond budget is converted to a fixed work quota. That makes move choice
// independent of timer jitter while keeping measured browser work inside the cap.
const ENGINE_NODES_PER_MS = 1;
const ENGINE_MAX_DEPTH = 3;
const WIN_SCORE = 100000;

// Named provisional search weights. Printed attack/defense factors inform the
// material scale; these are evaluation values, not rules or player-facing stats.
const EVAL_WEIGHTS = Object.freeze({
  material: Object.freeze({
    Infantry: 100,
    Cavalry: 105,
    'Foot Artillery': 135,
    'Mounted Artillery': 150,
    'Foot Relay': 72,
    'Mounted Relay': 86
  }),
  isolatedFighterFactor: 0.18,
  connectedFighter: 18,
  connectedRelay: 64,
  suppliedSource: 34,
  relayRouteLink: 10,
  activeArsenal: 230,
  arsenalThreatStep: 18,
  mobility: 2,
  arsenalApproach: 1.5,
  destroyingAttack: 54,
  retreatAttack: 22,
  resistedAttack: 4,
  safeAdvanceReward: 5,
  nonProgressPenalty: 3,
  reversalPenalty: 30
});

function otherSide(side) {
  return side === 'North' ? 'South' : 'North';
}

function distanceToNearestEnemyArsenal(state, piece) {
  const enemy = piece.side === 'North' ? 'South' : 'North';
  // Arsenal activity is position-dependent: an enemy fighter occupying an
  // arsenal neutralizes it. Callers compare different states, so consulting
  // only the static terrain list makes every root/current comparison equal.
  const arsenals = activeArsenals(state, enemy);
  let nearest = Infinity;
  for (const a of arsenals) {
    nearest = Math.min(nearest,
      Math.max(Math.abs(piece.x - a.x), Math.abs(piece.y - a.y)));
  }
  return nearest;
}

function piecePositions(state) {
  const map = new Map();
  for (const p of state.pieces) map.set(p.id, { x: p.x, y: p.y });
  return map;
}

function extractPreviousTurnStart(state, side) {
  // Walk the serialized history to find the start of this side's previous
  // turn. History entries are states pushed before each primitive action; blocks
  // of consecutive entries with the same turn belong to one full turn.
  if (!state.history || state.history.length === 0) return null;
  const currentTurnNumber = state.turnNumber;
  let best = null;
  let blockStart = null;
  let blockTurnNumber = null;
  for (const snapshot of state.history) {
    const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    const completed = parsed.turnNumber < currentTurnNumber || parsed.turn !== state.turn;
    if (parsed.turn === side && completed) {
      if (blockTurnNumber !== parsed.turnNumber) {
        blockTurnNumber = parsed.turnNumber;
        blockStart = parsed;
      }
      best = blockStart;
    } else if (parsed.turn !== side) {
      blockTurnNumber = null;
      blockStart = null;
    }
  }
  return best;
}

function extractPreviousTurnMoves(state, side) {
  // The game log is the authoritative game record for voluntary moves. A
  // genuine reversal requires proof of A->B, not merely that a piece happens
  // to still occupy A when the next turn is searched.
  const entries = (state.log || []).filter(entry => {
    if (entry.side !== side) return false;
    return entry.turn < state.turnNumber || entry.side !== state.turn;
  });
  if (entries.length === 0) return new Map();
  const latestTurn = Math.max(...entries.map(entry => entry.turn));
  const entry = entries.find(candidate => candidate.turn === latestTurn);
  const moves = new Map();
  for (const move of entry?.moves || []) {
    const from = xyFromCoord(move.from);
    const to = xyFromCoord(move.to);
    if (from && to) moves.set(move.pieceId, { from, to });
  }
  return moves;
}

function connectedCount(state, side, comms = computeCommunications(state)) {
  let count = 0;
  for (const piece of state.pieces) {
    if (piece.side === side && comms.status.get(piece.id)?.status === 'in-communication') count += 1;
  }
  return count;
}

function hasImmediateLossThreat(state, side) {
  if (state.gameOver) return state.gameOver.winner !== side;
  const comms = computeCommunications(state);
  const ownFighters = state.pieces.filter(piece => piece.side === side && isFighter(piece.cls));
  if (ownFighters.length === 1) {
    const combat = computeCombat(state, ownFighters[0].id, { comms });
    if (!combat.error && combat.result === 'destroyed') return true;
  }

  // If one arsenal is already neutralized, an enemy fighter that can occupy
  // the other on its next turn creates an immediate one-turn victory threat.
  const ownArsenals = activeArsenals(state, side);
  if (ownArsenals.length === 1) {
    const enemy = otherSide(side);
    for (const piece of state.pieces) {
      if (piece.side !== enemy || !isFighter(piece.cls)) continue;
      for (const destination of getLegalMoves(state, piece.id, { comms })) {
        if (destination.x === ownArsenals[0].x && destination.y === ownArsenals[0].y) return true;
      }
    }
  }
  return false;
}

function tacticalThreatCount(state, side, comms = computeCommunications(state)) {
  let threats = 0;
  for (const piece of state.pieces) {
    if (piece.side !== side) continue;
    const combat = computeCombat(state, piece.id, { comms });
    if (!combat.error && (combat.result === 'destroyed' || combat.result === 'retreat')) {
      threats += 1;
    }
  }
  return threats;
}

function cachedTacticalThreatCount(state, side, comms, context) {
  const cache = context.tacticalThreatCache;
  if (!cache) return tacticalThreatCount(state, side, comms);
  let bySide = cache.get(state);
  if (!bySide) {
    bySide = new Map();
    cache.set(state, bySide);
  }
  if (!bySide.has(side)) bySide.set(side, tacticalThreatCount(state, side, comms));
  return bySide.get(side);
}

function incrementCounter(context, name) {
  if (!context.tempoCounters) return;
  context.tempoCounters[name] = (context.tempoCounters[name] || 0) + 1;
}

function pathSignature(pathActions) {
  if (!pathActions || pathActions.length === 0) return '-';
  return pathActions.map(({ side, action }) => `${side[0]}:${actionKey(action)}`).sort().join('|');
}

function actionKey(action) {
  if (action.type === 'move' || action.type === 'retreat') {
    return `${action.type}:${action.pieceId}:${coordFromXY(action.x, action.y)}`;
  }
  if (action.type === 'attack') return `attack:${action.targetId}`;
  if (action.type === 'arsenal') return `arsenal:${coordFromXY(action.x, action.y)}`;
  return 'end-turn';
}

function actionLabel(action, state = null) {
  if (action.type === 'move' || action.type === 'retreat') {
    const piece = state?.pieces.find(p => p.id === action.pieceId);
    const mark = piece ? piece.cls.split(' ').map(s => s[0]).join('') : action.pieceId;
    return `${mark} ${coordFromXY(action.x, action.y)}`;
  }
  if (action.type === 'attack') {
    const target = state?.pieces.find(p => p.id === action.targetId);
    return `attack ${target ? coordFromXY(target.x, target.y) : action.targetId}`;
  }
  if (action.type === 'arsenal') return `capture ${coordFromXY(action.x, action.y)}`;
  return 'end turn';
}

function legalActions(state, options = {}) {
  if (state.gameOver) return [];

  const maxActions = options.maxActionsPerTurn ?? Infinity;
  const actionCapReached = Number.isFinite(maxActions) &&
    (state.movedThisTurn || []).length >= maxActions;

  if (isInRetreatPhase(state)) {
    const retreat = currentPendingRetreat(state);
    const piece = retreat ? state.pieces.find(p => p.id === retreat.id) : null;
    if (!piece) return [];
    return adjacentUnoccupiedSquares(state, piece).map(dest => ({
      type: 'retreat', pieceId: piece.id, x: dest.x, y: dest.y
    }));
  }

  const actions = [];
  const comms = computeCommunications(state);
  if (!actionCapReached && movesRemaining(state) > 0) {
    const pieces = state.pieces
      .filter(piece => piece.side === state.turn && canMovePiece(state, piece.id, { comms }))
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const piece of pieces) {
      for (const dest of getLegalMoves(state, piece.id, { comms })) {
        actions.push({ type: 'move', pieceId: piece.id, x: dest.x, y: dest.y });
      }
    }
  }

  if (!state.hasAttacked) {
    for (const target of state.pieces) {
      if (target.side !== state.turn && canDeclareAttack(state, target.id, { comms })) {
        actions.push({ type: 'attack', targetId: target.id });
      }
    }
    for (const arsenal of activeArsenalsForSide(otherSide(state.turn))) {
      const occupant = pieceAt(state, arsenal.x, arsenal.y);
      if (occupant && occupant.side === state.turn && isFighter(occupant.cls)
          && (state.movedThisTurn || []).includes(occupant.id)
          && !(state.retreatedThisTurn || []).includes(occupant.id)
          && isArsenal(arsenal.x, arsenal.y) && arsenalSide(arsenal.x, arsenal.y) !== state.turn) {
        actions.push({ type: 'arsenal', x: arsenal.x, y: arsenal.y });
      }
    }
  }

  actions.push({ type: 'end-turn' });
  return actions;
}

function searchState(state) {
  return {
    ...state,
    selectedId: null,
    combatPreview: null,
    history: [],
    log: [],
    // Runtime draw history is deliberately excluded from search nodes. Copying
    // the full repetition map at every node would turn a bounded search into a
    // game-length-dependent allocation cost; the live game adjudicates after
    // the chosen action is applied.
    drawState: null
  };
}

function applyAction(state, action, options = {}) {
  const base = options.recordHistory ? state : searchState(state);
  let result;
  if (action.type === 'move') result = tryTurnMove(base, action.pieceId, action.x, action.y);
  else if (action.type === 'retreat') result = applyRetreat(base, action.pieceId, action.x, action.y);
  else if (action.type === 'attack') result = applyCombat(base, action.targetId);
  else if (action.type === 'arsenal') result = applyArsenalCapture(base, action.x, action.y);
  else if (action.type === 'end-turn') {
    const next = endTurn(base);
    return options.recordHistory ? next : searchState(next);
  }
  else throw new Error(`Unknown engine action: ${action.type}`);
  if (result.error) throw new Error(`Generated illegal ${actionKey(action)}: ${result.error}`);
  if (action.type === 'attack' && options.onCombat) {
    try {
      options.onCombat(result.combat);
    } catch {
      // Optional observation must not alter engine action application.
    }
  }
  return options.recordHistory ? result.state : searchState(result.state);
}

function formatPrincipalVariation(state, pv) {
  const labels = [];
  let cursor = searchState(state);
  for (const action of pv || []) {
    labels.push(actionLabel(action, cursor));
    cursor = applyAction(cursor, action);
  }
  return labels.join(' · ');
}

function tempoWaiverReasons(state, side, piece, comms, context, sideActions) {
  const reasons = [];
  const rootState = context.rootState;
  if (!rootState) return reasons;
  const enemy = otherSide(side);
  const rootEnemyIds = new Set(rootState.pieces.filter(p => p.side === enemy).map(p => p.id));
  const currentEnemyIds = new Set(state.pieces.filter(p => p.side === enemy).map(p => p.id));
  if ([...rootEnemyIds].some(id => !currentEnemyIds.has(id))) reasons.push('winsMaterial');

  if (activeArsenals(state, enemy).length < activeArsenals(rootState, enemy).length) {
    reasons.push('capturesArsenal');
  }

  const rootConnected = context.rootConnectedCounts?.get(side) ?? 0;
  if (connectedCount(state, side, comms) > rootConnected) reasons.push('restoresCommunication');

  if (context.rootImmediateLoss?.get(side) && !hasImmediateLossThreat(state, side)) {
    reasons.push('avoidsImmediateLoss');
  }

  const rootTacticalThreats = context.rootTacticalThreats?.get(side) ?? 0;
  if (rootTacticalThreats > cachedTacticalThreatCount(state, side, comms, context)) {
    reasons.push('tacticalDefense');
  }

  if (sideActions.some(action => action.type === 'retreat' && action.pieceId === piece.id)) {
    reasons.push('forcedRetreat');
  }
  return reasons;
}

function sideTempoEvaluation(state, side, comms, context = {}) {
  let tempo = 0;
  const rootState = context.rootState;
  const rootPositions = context.rootPositions || new Map();
  const previousMoves = context.previousMovesBySide?.get(side) || new Map();
  const previousPositions = context.previousPositionsBySide?.get(side) || new Map();
  const sideActions = (context.pathActions || [])
    .filter(entry => entry.side === side)
    .map(entry => entry.action);
  const movedIds = new Set(sideActions
    .filter(action => action.type === 'move' || action.type === 'retreat')
    .map(action => action.pieceId));
  const hasAttack = sideActions.some(action => action.type === 'attack');
  const hasArsenalCapture = sideActions.some(action => action.type === 'arsenal');

  for (const piece of state.pieces) {
    if (piece.side !== side || !isFighter(piece.cls)) continue;
    const root = rootPositions.get(piece.id);
    const previousPosition = previousPositions.get(piece.id);
    const previousMove = previousMoves.get(piece.id);
    const moved = movedIds.has(piece.id);

    // Diagnostic counter for the removed condition. It matched every piece
    // still sitting on its prior-turn square, including pieces that never moved.
    if (previousPosition && piece.x === previousPosition.x && piece.y === previousPosition.y) {
      incrementCounter(context, 'legacyReversalMatches');
      if (!moved) incrementCounter(context, 'legacyStationaryMatches');
    }

    if (!root || !moved) continue;
    const movedFromRoot = root.x !== piece.x || root.y !== piece.y;
    if (!movedFromRoot) continue;

    const distNow = distanceToNearestEnemyArsenal(state, piece);
    const rootPiece = rootState?.pieces.find(candidate => candidate.id === piece.id)
      || { ...piece, x: root.x, y: root.y };
    const distRoot = rootState
      ? distanceToNearestEnemyArsenal(rootState, rootPiece)
      : Infinity;
    const connected = comms.status.get(piece.id)?.status === 'in-communication';
    const safeAdvance = Number.isFinite(distNow) && Number.isFinite(distRoot)
      && connected && distNow < distRoot;
    const waiverReasons = tempoWaiverReasons(state, side, piece, comms, context, sideActions);

    if (safeAdvance) {
      tempo += EVAL_WEIGHTS.safeAdvanceReward;
      incrementCounter(context, 'safeAdvanceReward');
    } else {
      // S5.3 section 4: unused moves are legal, so a fighter move that makes
      // no safe progress pays a small cost unless it served a listed purpose.
      const nonProgressWaived = hasAttack || hasArsenalCapture
        || waiverReasons.includes('forcedRetreat')
        || waiverReasons.includes('restoresCommunication')
        || waiverReasons.includes('avoidsImmediateLoss')
        || waiverReasons.includes('tacticalDefense');
      if (nonProgressWaived) {
        incrementCounter(context, 'nonProgressWaived');
      } else {
        tempo -= EVAL_WEIGHTS.nonProgressPenalty;
        incrementCounter(context, 'nonProgressPenalty');
      }
    }

    // S5.3 section 2: B->A is a reversal only when this piece genuinely
    // moved A->B on its previous own turn and moved B->A on this path.
    const genuineReturn = previousMove
      && root.x === previousMove.to.x && root.y === previousMove.to.y
      && piece.x === previousMove.from.x && piece.y === previousMove.from.y;
    if (genuineReturn) {
      incrementCounter(context, 'genuineReversalReturns');
      if (waiverReasons.length > 0) {
        incrementCounter(context, 'reversalWaived');
        for (const reason of waiverReasons) incrementCounter(context, `reversalWaived.${reason}`);
      } else {
        tempo -= EVAL_WEIGHTS.reversalPenalty;
        incrementCounter(context, 'reversalPenalty');
      }
    }
  }
  return tempo;
}

function sideEvaluation(state, side, comms, context = {}) {
  let material = 0;
  let communication = 0;
  let routeIntegrity = 0;
  let mobility = 0;
  let attackPressure = 0;
  let victoryProximity = 0;
  let tempo = 0;
  const suppliedSources = new Set();

  for (const piece of state.pieces) {
    if (piece.side !== side) continue;
    const audit = comms.status.get(piece.id);
    const connected = audit?.status === 'in-communication';
    const base = EVAL_WEIGHTS.material[piece.cls] || 0;
    material += isFighter(piece.cls) && !connected
      ? base * EVAL_WEIGHTS.isolatedFighterFactor
      : base;

    if (isFighter(piece.cls) && connected) communication += EVAL_WEIGHTS.connectedFighter;
    if (isRelay(piece.cls) && connected) communication += EVAL_WEIGHTS.connectedRelay;
    if (connected && audit.sourceArsenal) suppliedSources.add(audit.sourceArsenal);
    if (connected && audit.relayChain) {
      routeIntegrity += audit.relayChain.length * EVAL_WEIGHTS.relayRouteLink;
    }
    if (!isFighter(piece.cls) || connected) {
      mobility += getLegalMoves(state, piece.id, { comms }).length;
    }
  }

  routeIntegrity += suppliedSources.size * EVAL_WEIGHTS.suppliedSource;
  const arsenals = activeArsenals(state, side);
  let arsenalSafety = arsenals.length * EVAL_WEIGHTS.activeArsenal;
  for (const arsenal of arsenals) {
    let nearestEnemy = Infinity;
    for (const enemy of state.pieces) {
      if (enemy.side === side || !isFighter(enemy.cls)) continue;
      nearestEnemy = Math.min(nearestEnemy,
        Math.max(Math.abs(enemy.x - arsenal.x), Math.abs(enemy.y - arsenal.y)));
    }
    if (nearestEnemy <= 4) {
      arsenalSafety -= (5 - nearestEnemy) * EVAL_WEIGHTS.arsenalThreatStep;
    }
  }

  // Search pressure uses the real combat collector/resolver. It rewards a
  // currently available result without creating a parallel range rule.
  for (const target of attackableEnemies(state, side, comms)) {
    const combat = computeCombat(state, target.id, { comms });
    if (combat.error) continue;
    if (combat.result === 'destroyed') attackPressure += EVAL_WEIGHTS.destroyingAttack;
    else if (combat.result === 'retreat') attackPressure += EVAL_WEIGHTS.retreatAttack;
    else attackPressure += EVAL_WEIGHTS.resistedAttack;
  }

  const enemyArsenals = activeArsenals(state, otherSide(side));
  for (const piece of state.pieces) {
    if (piece.side !== side || !isFighter(piece.cls)) continue;
    let nearest = Infinity;
    for (const arsenal of enemyArsenals) {
      nearest = Math.min(nearest,
        Math.max(Math.abs(piece.x - arsenal.x), Math.abs(piece.y - arsenal.y)));
    }
    if (Number.isFinite(nearest)) {
      victoryProximity += Math.max(0, 25 - nearest) * EVAL_WEIGHTS.arsenalApproach;
    }

  }

  tempo = sideTempoEvaluation(state, side, comms, context);

  return {
    material,
    communication,
    routeIntegrity,
    arsenalSafety,
    mobility: mobility * EVAL_WEIGHTS.mobility,
    attackPressure,
    victoryProximity,
    tempo,
    total: material + communication + routeIntegrity + arsenalSafety
      + mobility * EVAL_WEIGHTS.mobility + attackPressure + victoryProximity + tempo
  };
}

function evaluatePosition(state, context = {}) {
  if (state.gameOver) {
    if (!state.gameOver.winner) return { score: 0, north: null, south: null };
    const north = state.gameOver.winner === 'North' ? WIN_SCORE : -WIN_SCORE;
    return { score: north, north: null, south: null };
  }
  const comms = computeCommunications(state);
  const north = sideEvaluation(state, 'North', comms, context);
  const south = sideEvaluation(state, 'South', comms, context);
  return { score: Math.round(north.total - south.total), north, south };
}

function evaluateForSide(state, side, context = {}) {
  const score = evaluatePosition(state, context).score;
  return side === 'North' ? score : -score;
}

function positionKey(state) {
  const pieces = state.pieces
    .map(p => `${p.id}:${p.side[0]}:${p.cls}:${p.x},${p.y}`)
    .sort()
    .join('|');
  const retreats = (state.pendingRetreats || [])
    .map(r => `${r.id}:${r.fromX},${r.fromY}`).join('|');
  const retreated = (state.retreatedThisTurn || []).slice().sort().join(',');
  return `${state.rulesetId};${state.turn};${state.hasAttacked ? 1 : 0};${(state.movedThisTurn || []).slice().sort().join(',')};${retreated};${retreats};${pieces}`;
}

function hash32(text, seed = ENGINE_SEED) {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function orderingScore(state, action) {
  if (action.type === 'arsenal') return 50000;
  if (action.type === 'attack') {
    const target = state.pieces.find(p => p.id === action.targetId);
    return 30000 + (target ? EVAL_WEIGHTS.material[target.cls] || 0 : 0);
  }
  if (action.type === 'retreat') return 20000;
  if (action.type === 'move') return 10000;
  return 0;
}

function orderedActions(state, seed, preferredKey = null, transpositionKey = null, maxActionsPerTurn = null) {
  const pKey = positionKey(state);
  const legalOptions = maxActionsPerTurn ? { maxActionsPerTurn } : {};
  return legalActions(state, legalOptions).sort((a, b) => {
    const ak = actionKey(a);
    const bk = actionKey(b);
    if (transpositionKey) {
      if (ak === transpositionKey && bk !== transpositionKey) return -1;
      if (bk === transpositionKey && ak !== transpositionKey) return 1;
    }
    if (preferredKey) {
      if (ak === preferredKey && bk !== preferredKey) return -1;
      if (bk === preferredKey && ak !== preferredKey) return 1;
    }
    const scoreDelta = orderingScore(state, b) - orderingScore(state, a);
    if (scoreDelta) return scoreDelta;
    const hashDelta = hash32(`${pKey}|${ak}`, seed) - hash32(`${pKey}|${bk}`, seed);
    return hashDelta || ak.localeCompare(bk);
  });
}

class NodeBudgetReached extends Error {}

function movesSinceTurnStart(pathActions) {
  let moves = 0;
  for (let i = pathActions.length - 1; i >= 0; i -= 1) {
    const type = pathActions[i].action.type;
    if (type === 'end-turn') break;
    if (type === 'move' || type === 'retreat') moves += 1;
  }
  return moves;
}

// A turn-aware ply expands whole turn sequences. At full width that cannot
// finish inside the shipped budget, so this search-only limit looks one further
// move into the current turn. It never removes a legal root move or restricts
// how many actions the engine may actually play in the live turn.
function effectiveTurnActionCap(state, pathActions, context) {
  if (!context.turnAware) return null;
  const limit = context.searchTurnMoveLimit;
  if (!limit) return context.maxActionsPerTurn;
  const alreadyMoved = (state.movedThisTurn || []).length;
  const relative = alreadyMoved - movesSinceTurnStart(pathActions) + limit;
  return Math.min(context.maxActionsPerTurn, relative);
}

function negamax(state, depth, alpha, beta, context, pathActions = []) {
  if (context.nodes >= context.nodeBudget) throw new NodeBudgetReached();
  context.nodes += 1;
  if (depth === 0 || state.gameOver) {
    return {
      score: evaluateForSide(state, state.turn, { ...context.evalContext, pathActions }),
      pv: []
    };
  }

  // Tempo waivers depend on which kinds of actions produced the position.
  // Include their order-independent summary so path-dependent evaluation does
  // not make otherwise-correct transposition reuse unsound.
  const ttDepth = context.auditBrokenTT ? '*' : depth;
  const turnCap = effectiveTurnActionCap(state, pathActions, context);
  const capTag = context.searchTurnMoveLimit ? `;c${turnCap}` : '';
  const key = `${positionKey(state)};d${ttDepth};p${pathSignature(pathActions)}${capTag}`;
  const originalAlpha = alpha;
  const originalBeta = beta;
  const cached = context.disableTT ? null : context.table.get(key);
  if (cached) {
    context.transpositionHits += 1;
    if (context.auditBrokenTT) return cached;
    if (cached.bound === 'exact') return cached;
    if (cached.bound === 'lower') alpha = Math.max(alpha, cached.score);
    else beta = Math.min(beta, cached.score);
    if (alpha >= beta) return { score: cached.score, pv: [] };
  }

  const position = positionKey(state);
  const actions = orderedActions(
    state,
    context.seed,
    context.preferred.get(position),
    cached?.bestKey,
    turnCap
  );
  if (actions.length === 0) {
    return {
      score: evaluateForSide(state, state.turn, { ...context.evalContext, pathActions }),
      pv: []
    };
  }

  let bestScore = -Infinity;
  let bestPv = [];
  let bestKey = null;
  const side = state.turn;
  for (const action of actions) {
    const child = applyAction(state, action);
    const childPath = context.turnAware
      ? pathActions.concat({ side, action })
      : pathActions;
    const switched = child.turn !== side;
    const childDepth = context.turnAware
      ? (switched ? depth - 1 : depth)
      : depth - 1;
    const result = switched
      ? negamax(child, childDepth, -beta, -alpha, context, childPath)
      : negamax(child, childDepth, alpha, beta, context, childPath);
    const score = switched ? -result.score : result.score;
    if (score > bestScore) {
      bestScore = score;
      bestPv = [action, ...result.pv];
      bestKey = actionKey(action);
    }
    alpha = Math.max(alpha, score);
    if (alpha >= beta) {
      context.cutoffs += 1;
      break;
    }
  }

  const bound = bestScore <= originalAlpha ? 'upper'
    : bestScore >= originalBeta ? 'lower'
      : 'exact';
  const value = { score: bestScore, pv: bestPv, bound, bestKey };
  // Lower and upper scores tighten later windows; only exact values may be reused directly.
  context.table.set(key, value);
  if (bestKey) context.preferred.set(position, bestKey);
  return value;
}

function searchBestAction(state, options = {}) {
  const seed = options.seed ?? ENGINE_SEED;
  const timeBudgetMs = options.timeBudgetMs ?? ENGINE_TIME_BUDGET_MS;
  const nodeBudget = options.nodeBudget ?? Math.max(1, Math.floor(timeBudgetMs * ENGINE_NODES_PER_MS));
  const maxDepth = options.maxDepth ?? ENGINE_MAX_DEPTH;
  const turnAware = options.turnAware ?? false;
  const disableTT = options.disableTT ?? false;
  const auditBrokenTT = options.auditBrokenTT ?? false;
  const maxActionsPerTurn = options.maxActionsPerTurn ?? (turnAware ? 2 : Infinity);
  const searchTurnMoveLimit = options.searchTurnMoveLimit ?? null;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rootCap = effectiveTurnActionCap(state, [], {
    turnAware, maxActionsPerTurn, searchTurnMoveLimit
  });
  const rootActions = orderedActions(state, seed, null, null, rootCap);
  if (rootActions.length === 0) {
    return { action: null, score: evaluateForSide(state, state.turn), depth: 0,
      nodes: 0, elapsedMs: 0, pv: [], seed, nodeBudget, timeBudgetMs };
  }

  let completed = {
    action: rootActions[0], score: evaluateForSide(state, state.turn), depth: 0,
    pv: [rootActions[0]]
  };

  const evalContext = {};
  if (turnAware) {
    const rootState = searchState(state);
    const rootComms = computeCommunications(rootState);
    evalContext.rootState = rootState;
    evalContext.rootPositions = piecePositions(rootState);
    evalContext.previousMovesBySide = new Map();
    evalContext.previousPositionsBySide = new Map();
    evalContext.rootConnectedCounts = new Map();
    evalContext.rootImmediateLoss = new Map();
    evalContext.rootTacticalThreats = new Map();
    evalContext.tempoCounters = {};
    evalContext.tacticalThreatCache = new WeakMap();
    for (const side of ['North', 'South']) {
      evalContext.previousMovesBySide.set(side, extractPreviousTurnMoves(state, side));
      const previous = extractPreviousTurnStart(state, side);
      if (previous) evalContext.previousPositionsBySide.set(side, piecePositions(previous));
      evalContext.rootConnectedCounts.set(side, connectedCount(rootState, side, rootComms));
      evalContext.rootImmediateLoss.set(side, hasImmediateLossThreat(rootState, side));
      evalContext.rootTacticalThreats.set(side, tacticalThreatCount(rootState, side, rootComms));
    }
  }

  const context = {
    seed,
    nodeBudget,
    turnAware,
    disableTT,
    auditBrokenTT,
    maxActionsPerTurn,
    searchTurnMoveLimit,
    evalContext,
    nodes: 0,
    table: new Map(),
    preferred: new Map(),
    transpositionHits: 0,
    cutoffs: 0
  };

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    try {
      const result = negamax(searchState(state), depth, -Infinity, Infinity, context);
      completed = { action: result.pv[0] || rootActions[0], score: result.score, depth, pv: result.pv };
      if (result.pv[0]) context.preferred.set(positionKey(state), actionKey(result.pv[0]));
      if (Math.abs(result.score) >= WIN_SCORE) break;
    } catch (error) {
      if (!(error instanceof NodeBudgetReached)) throw error;
      break;
    }
  }

  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    ...completed,
    nodes: context.nodes,
    elapsedMs: Math.max(0, ended - started),
    seed,
    nodeBudget,
    timeBudgetMs,
    turnAware,
    searchTurnMoveLimit,
    tempoFires: turnAware ? { ...evalContext.tempoCounters } : {},
    transpositionHits: context.transpositionHits,
    cutoffs: context.cutoffs
  };
}

export {
  ENGINE_SEED,
  ENGINE_TIME_BUDGET_MS,
  HINT_TIME_BUDGET_MS,
  ENGINE_NODES_PER_MS,
  ENGINE_MAX_DEPTH,
  WIN_SCORE,
  EVAL_WEIGHTS,
  distanceToNearestEnemyArsenal,
  sideTempoEvaluation,
  actionKey,
  actionLabel,
  formatPrincipalVariation,
  legalActions,
  applyAction,
  evaluatePosition,
  evaluateForSide,
  positionKey,
  searchBestAction
};
