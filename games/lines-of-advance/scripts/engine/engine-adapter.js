// engine-adapter.js: thin wrapper around src/engine.js for the S2 harness.

import { searchBestAction, legalActions, actionKey, applyAction } from '../../src/engine.js';

function makeRc2Adapter(id, options = {}) {
  const seed = options.seed ?? 0x4c4f4135;
  const timeBudgetMs = options.timeBudgetMs ?? 900;
  const nodeBudget = options.nodeBudget ?? Math.max(1, Math.floor(timeBudgetMs * 1));
  const maxDepth = options.maxDepth ?? 3;
  const turnAware = options.turnAware ?? false;
  const maxActionsPerTurn = options.maxActionsPerTurn ?? undefined;
  const searchTurnMoveLimit = options.searchTurnMoveLimit ?? undefined;

  return {
    id,
    seed,
    options: { timeBudgetMs, nodeBudget, maxDepth, turnAware, maxActionsPerTurn, searchTurnMoveLimit },
    choose(state) {
      const result = searchBestAction(state, {
        seed,
        timeBudgetMs,
        nodeBudget,
        maxDepth,
        turnAware,
        maxActionsPerTurn,
        searchTurnMoveLimit
      });
      return {
        action: result.action,
        score: result.score,
        depth: result.depth,
        nodes: result.nodes,
        elapsedMs: result.elapsedMs,
        pv: result.pv ?? []
      };
    }
  };
}

function makeRandomAdapter(id, options = {}) {
  let seed = options.seed ?? 1;
  function next() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  return {
    id,
    seed,
    options: { random: true },
    choose(state) {
      const legal = legalActions(state);
      const action = legal[Math.floor(next() * legal.length)];
      return { action, score: 0, depth: 0, nodes: 0, elapsedMs: 0, pv: [] };
    }
  };
}

function makePassAdapter(id) {
  return {
    id,
    seed: 0,
    options: { pass: true },
    choose(state) {
      return { action: { type: 'end-turn' }, score: 0, depth: 0, nodes: 0, elapsedMs: 0, pv: [] };
    }
  };
}

function makeFirstActionAdapter(id) {
  return {
    id,
    seed: 0,
    options: { firstAction: true },
    choose(state) {
      const legal = legalActions(state);
      return { action: legal[0], score: 0, depth: 0, nodes: 0, elapsedMs: 0, pv: [] };
    }
  };
}

function makeIllegalAdapter(id) {
  return {
    id,
    seed: 0,
    options: { illegal: true },
    choose(state) {
      // Always forfeit by proposing a move to an off-board square.
      return { action: { type: 'move', pieceId: 'nonexistent', x: 99, y: 99 }, score: 0, depth: 0, nodes: 0, elapsedMs: 0, pv: [] };
    }
  };
}

function validateAction(state, action) {
  const legal = legalActions(state);
  const key = actionKey(action);
  const match = legal.find(a => actionKey(a) === key);
  if (!match) {
    return {
      error: `illegal action ${key}; legal: ${legal.map(actionKey).join(', ')}`
    };
  }
  return { action: match };
}

export { makeRc2Adapter, makeRandomAdapter, makePassAdapter, makeFirstActionAdapter, makeIllegalAdapter, validateAction };
