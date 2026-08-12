// match.js: headless engine-vs-engine single-game runner for S2.

import { performance } from 'node:perf_hooks';
import { createState, resetToTestPreset, resetToCommsDrill, resetToCommCut } from '../../src/state.js';
import { legalActions, applyAction, actionKey } from '../../src/engine.js';
import { formatLoa1, formatAction, formatGameRecord, parseLoa1 } from '../../src/notation.js';
import { computePathologyMetrics } from './metrics.js';
import { validateAction, makeRc2Adapter } from './engine-adapter.js';

const DEFAULT_MAX_TURNS = 200;
const DEFAULT_NO_PROGRESS_TURNS = 80;
const DEFAULT_PASS_TURNS = 10;
const DEFAULT_HARD_TIMEOUT_MS = 60_000;

function otherSide(side) {
  return side === 'North' ? 'South' : 'North';
}

function stateFromOpening(opening) {
  if (typeof opening === 'string') return parseLoa1(opening);
  if (opening.type === 'preset') {
    const base = createState();
    if (opening.preset === 'standard' || opening.preset === 'test') return resetToTestPreset(base);
    if (opening.preset === 'comms-drill') return resetToCommsDrill(base);
    if (opening.preset === 'comm-cut') return resetToCommCut(base);
  }
  if (opening.loa1) return parseLoa1(opening.loa1);
  return parseLoa1(formatLoa1(opening.state));
}

function normalizeEngines(engines) {
  return {
    north: engines.north && typeof engines.north.choose === 'function'
      ? engines.north
      : makeRc2Adapter('engine-north', engines.north || {}),
    south: engines.south && typeof engines.south.choose === 'function'
      ? engines.south
      : makeRc2Adapter('engine-south', engines.south || {})
  };
}

function noProgressEvent(event) {
  return event && (
    event.type === 'destroyed' ||
    event.type === 'retreat' ||
    event.type === 'retreat-failed' ||
    event.type === 'arsenal-captured'
  );
}

async function runGame(options = {}) {
  const {
    opening = { type: 'preset', preset: 'standard' },
    engines,
    pairId = '0',
    gameId = '0',
    openingId = 'standard',
    openingCluster = 'standard',
    maxTurns = DEFAULT_MAX_TURNS,
    noProgressTurns = DEFAULT_NO_PROGRESS_TURNS,
    passTurns = DEFAULT_PASS_TURNS,
    hardTimeoutMs = DEFAULT_HARD_TIMEOUT_MS,
    seed = 1
  } = options;

  let state = stateFromOpening(opening);
  const startLoa1 = formatLoa1(state);
  const actorBySide = normalizeEngines(engines);

  const actionEntries = [];
  const positionHistory = new Map();
  let turnCounter = 0;
  let noProgressCounter = 0;
  let passCounter = 0;
  let result = null;
  let reason = null;
  let forfeitEngine = null;

  function recordPosition(loa1) {
    const key = `${loa1}|${state.turn}`;
    const count = (positionHistory.get(key) ?? 0) + 1;
    positionHistory.set(key, count);
    return count;
  }

  function positionCount(loa1) {
    return positionHistory.get(`${loa1}|${state.turn}`) ?? 0;
  }

  recordPosition(startLoa1);

  while (!result && turnCounter < maxTurns) {
    const side = state.turn;
    const engine = actorBySide[side.toLowerCase()];
    const beforeLoa1 = formatLoa1(state);
    const legal = legalActions(state);

    if (legal.length === 0) {
      // No legal actions: adjudicate draw rather than hang.
      result = 'draw';
      reason = 'noprog';
      break;
    }

    let choice;
    const started = performance.now();
    let timeoutId = null;
    try {
      choice = await Promise.race([
        engine.choose(state),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('timeout')), hardTimeoutMs);
        })
      ]);
    } catch (error) {
      result = side === 'North' ? 'South' : 'North';
      reason = 'timeout';
      forfeitEngine = side;
      break;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
    const elapsedMs = performance.now() - started;

    if (!choice || !choice.action) {
      result = side === 'North' ? 'South' : 'North';
      reason = 'crash';
      forfeitEngine = side;
      break;
    }

    const validation = validateAction(state, choice.action);
    if (validation.error) {
      result = side === 'North' ? 'South' : 'North';
      reason = 'illegal';
      forfeitEngine = side;
      break;
    }

    const action = validation.action;
    let combatResult = null;
    state = applyAction(state, action, {
      recordHistory: true,
      onCombat(combat) { combatResult = combat?.result || null; }
    });
    const afterLoa1 = formatLoa1(state);

    const beforeState = parseLoa1(beforeLoa1);
    actionEntries.push({
      before: beforeLoa1,
      after: afterLoa1,
      side,
      engine: engine.id,
      action: formatAction(action, beforeState),
      actionObj: action,
      actionKey: actionKey(action),
      combatResult,
      score: choice.score ?? null,
      depth: choice.depth ?? null,
      nodes: choice.nodes ?? null,
      elapsedMs: choice.elapsedMs ?? elapsedMs,
      pv: (choice.pv || []).map(a => formatAction(a, beforeState)),
      legalCount: legal.length,
      legalActions: legal.map(a => formatAction(a, beforeState))
    });

    recordPosition(afterLoa1);

    if (state.gameOver) {
      result = state.gameOver.winner || 'draw';
      reason = state.gameOver.reason;
      break;
    }

    if (positionCount(afterLoa1) >= 3) {
      result = 'draw';
      reason = 'rep3';
      break;
    }

    // End-of-turn adjudication checks.
    const turnEnded = state.turn !== side;
    if (turnEnded) {
      // Collect actions belonging to the turn that just ended.
      const turnActions = [];
      for (let i = actionEntries.length - 1; i >= 0; i -= 1) {
        if (actionEntries[i].side !== side) break;
        turnActions.unshift(actionEntries[i]);
      }

      // No-progress: 80 full turns without material/forced event.
      const turnNumber = side === 'North' ? state.turnNumber : state.turnNumber - 1;
      const eventful = turnActions.some(entry =>
        entry.actionObj.type === 'arsenal'
        || entry.combatResult === 'destroyed'
        || entry.combatResult === 'retreat'
      ) || state.log.some(e =>
        e.turn === turnNumber && e.side === side &&
        (e.events || []).some(noProgressEvent)
      );
      if (eventful) {
        noProgressCounter = 0;
      } else {
        noProgressCounter += 1;
      }
      if (noProgressCounter >= noProgressTurns) {
        result = 'draw';
        reason = 'noprog';
        break;
      }

      // Pass-loop check: both sides chose only E for consecutive full turns.
      const onlyEndTurn = turnActions.length === 1 && turnActions[0].action === 'E';
      if (onlyEndTurn) {
        passCounter += 1;
      } else {
        passCounter = 0;
      }
      if (passCounter >= passTurns * 2) {
        result = 'draw';
        reason = 'noprog';
        break;
      }

      turnCounter += 1;
    }
  }

  if (!result) {
    result = 'draw';
    reason = 'maxturn';
  }

  const resultReasonMap = {
    'all enemy fighting units eliminated': 'elim',
    'both enemy arsenals captured': 'arsenal',
    'threefold repetition': 'rep3',
    '80-turn no-progress draw': 'noprog'
  };
  const resultReason = resultReasonMap[reason] || reason;

  const record = {
    schema: 'loa-engine-result-v1',
    gameId,
    pairId,
    openingId,
    openingCluster,
    start: startLoa1,
    engines: {
      north: { id: actorBySide.north.id, seed: actorBySide.north.seed, options: actorBySide.north.options },
      south: { id: actorBySide.south.id, seed: actorBySide.south.seed, options: actorBySide.south.options }
    },
    control: {
      maxTurns,
      noProgressTurns,
      passTurns,
      hardTimeoutMs,
      seed
    },
    actions: actionEntries,
    result,
    reason: resultReason,
    record: formatGameRecord(startLoa1, actionEntries.map(e => e.actionObj), result, resultReason, {
      pairId,
      openingId,
      openingCluster,
      seed: String(seed)
    }),
    forfeitEngine,
    pathologyMetrics: null
  };

  record.pathologyMetrics = computePathologyMetrics(record);
  return record;
}

export {
  runGame,
  stateFromOpening,
  DEFAULT_MAX_TURNS,
  DEFAULT_NO_PROGRESS_TURNS,
  DEFAULT_PASS_TURNS,
  DEFAULT_HARD_TIMEOUT_MS
};
