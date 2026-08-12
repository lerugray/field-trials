// book.js: minimal opening book for the S2 harness.
// Implements the simplest allowed option: the existing test preset plus the
// scenario probes, used as paired mini-matches with color swapping.

import { createState, resetToTestPreset, resetToCommsDrill, resetToCommCut, makeLcg } from '../../src/state.js';
import { formatLoa1 } from '../../src/notation.js';
import { legalActions, applyAction } from '../../src/engine.js';

const PRESETS = Object.freeze({
  standard: resetToTestPreset,
  test: resetToTestPreset,
  'comms-drill': resetToCommsDrill,
  'comm-cut': resetToCommCut
});

function makeOpening(preset, seed = 1, prefixLength = 0) {
  let state = PRESETS[preset](createState());
  const lcg = makeLcg(seed);
  // Apply a seeded legal prefix of completed side turns. The old policy always
  // preferred End Turn, so every seed and prefix length collapsed to the same
  // position. This policy plays one to three legal moves, takes a legal attack
  // or newly entered arsenal when available, then ends the turn.
  for (let t = 0; t < prefixLength && !state.gameOver; t += 1) {
    const side = state.turn;
    const moveTarget = 1 + Math.floor(lcg() * 3);
    let turnEnded = false;
    let safety = 0;
    while (!turnEnded && safety < 20) {
      safety += 1;
      const actions = legalActions(state);
      if (actions.length === 0) break;
      const tactical = actions.filter(action => action.type === 'arsenal' || action.type === 'attack');
      const moves = actions.filter(action => action.type === 'move' || action.type === 'retreat');
      const endTurn = actions.find(a => a.type === 'end-turn');
      let action;
      if (tactical.length > 0) action = tactical[Math.floor(lcg() * tactical.length)];
      else if ((state.movedThisTurn || []).length < moveTarget && moves.length > 0) {
        action = moves[Math.floor(lcg() * moves.length)];
      } else action = endTurn || actions[Math.floor(lcg() * actions.length)];
      state = applyAction(state, action, { recordHistory: true });
      turnEnded = state.turn !== side;
    }
  }
  return {
    openingId: `${preset}-s${seed}-p${prefixLength}`,
    cluster: preset,
    loa1: formatLoa1(state),
    seed,
    prefixLength
  };
}

function buildBook(options = {}) {
  const {
    presets = ['standard'],
    seeds = [1],
    prefixLengths = [0],
    pairs = 1
  } = options;

  const openings = [];
  for (const preset of presets) {
    for (const seed of seeds) {
      for (const prefixLength of prefixLengths) {
        openings.push(makeOpening(preset, seed, prefixLength));
      }
    }
  }

  // Repeat to reach requested pair count.
  const result = [];
  for (let i = 0; i < pairs; i += 1) {
    result.push(openings[i % openings.length]);
  }
  return result;
}

export { buildBook, makeOpening, PRESETS };
