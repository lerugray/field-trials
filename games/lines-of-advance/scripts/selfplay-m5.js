// Reproducible M5 depth acceptance: 20 mirrored communication-collapse games.
// This is a narrow tactical conversion check, not a general strength rating.

import { createPiece, createState } from '../src/state.js';
import {
  applyAction,
  formatPrincipalVariation,
  searchBestAction
} from '../src/engine.js';

const GAMES = 20;
const DEEP_DEPTH = 2;
const SHALLOW_DEPTH = 1;
const NODE_BUDGET = 160;
const MAX_ACTIONS = 12;

function northConversionPosition() {
  const state = createState();
  state.turn = 'South';
  state.pieces = [
    createPiece({ id: 'n1', side: 'North', cls: 'Infantry', x: 4, y: 16 }),
    createPiece({ id: 'n2', side: 'North', cls: 'Infantry', x: 5, y: 16 }),
    createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 5, y: 17 })
  ];
  return state;
}

function southConversionPosition() {
  const state = createState();
  state.turn = 'North';
  state.pieces = [
    createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 4, y: 3 }),
    createPiece({ id: 's2', side: 'South', cls: 'Infantry', x: 5, y: 3 }),
    createPiece({ id: 'n1', side: 'North', cls: 'Infantry', x: 5, y: 2 })
  ];
  return state;
}

function play(gameNumber) {
  const deepSide = gameNumber % 2 === 0 ? 'North' : 'South';
  let state = deepSide === 'North' ? northConversionPosition() : southConversionPosition();
  let nodes = 0;
  let lastPv = '';
  let actions = 0;
  while (!state.gameOver && actions < MAX_ACTIONS) {
    const depth = state.turn === deepSide ? DEEP_DEPTH : SHALLOW_DEPTH;
    const result = searchBestAction(state, {
      seed: 20260808 + gameNumber,
      maxDepth: depth,
      nodeBudget: NODE_BUDGET
    });
    if (!result.action) break;
    nodes += result.nodes;
    lastPv = formatPrincipalVariation(state, result.pv);
    state = applyAction(state, result.action);
    actions += 1;
  }
  return {
    game: gameNumber + 1,
    deepSide,
    winner: state.gameOver?.winner || null,
    actions,
    nodes,
    pv: lastPv
  };
}

const results = Array.from({ length: GAMES }, (_, index) => play(index));
const deepWins = results.filter(result => result.winner === result.deepSide).length;
const shallowWins = results.filter(result => result.winner && result.winner !== result.deepSide).length;
const draws = results.length - deepWins - shallowWins;
const totalNodes = results.reduce((sum, result) => sum + result.nodes, 0);

console.log(JSON.stringify({
  benchmark: 'mirrored communication-collapse conversion',
  games: GAMES,
  depths: `${DEEP_DEPTH} vs ${SHALLOW_DEPTH}`,
  deepWins,
  shallowWins,
  draws,
  totalNodes,
  averageNodes: Math.round(totalNodes / GAMES),
  samplePv: results[0].pv
}, null, 2));

if (deepWins <= shallowWins) process.exitCode = 1;
