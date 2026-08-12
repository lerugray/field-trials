#!/usr/bin/env node
// key-audit.js: position-key completeness audit per spec S3 hypothesis 7.

import { createState, createPiece, resetToTestPreset, resetToCommsDrill,
  resetToCommCut, cloneState } from '../../src/state.js';
import { legalActions, evaluatePosition, positionKey, applyAction } from '../../src/engine.js';
import { activeArsenals } from '../../src/comms.js';
import { makeLcg } from '../../src/state.js';
import { formatLoa1 } from '../../src/notation.js';

const SAMPLE_COUNT = Number(process.env.LOA_KEY_AUDIT_SAMPLES) || 1000;
const OMIT_RETREATED = process.env.LOA_KEY_AUDIT_OMIT_RETREATED === '1';

function activeArsenalList(state) {
  return ['North', 'South'].flatMap(side =>
    activeArsenals(state, side).map(a => `${side}:${a.x},${a.y}`)
  ).sort();
}

function auditedPositionKey(state) {
  const key = positionKey(state);
  if (!OMIT_RETREATED) return key;
  const fields = key.split(';');
  fields.splice(4, 1);
  return fields.join(';');
}

function behaviorSignature(state) {
  try {
    return JSON.stringify({
      legal: legalActions(state).map(a => `${a.type}:${a.pieceId || ''}:${a.targetId || ''}:${a.x ?? ''},${a.y ?? ''}`).sort(),
      eval: evaluatePosition(state).score,
      arsenals: activeArsenalList(state),
      gameOver: state.gameOver ? `${state.gameOver.winner}:${state.gameOver.reason}` : null
    });
  } catch (e) {
    return `error:${e.message}`;
  }
}

function behaviorDiffers(a, b) {
  return behaviorSignature(a) !== behaviorSignature(b);
}

function mutate(state, field) {
  const next = cloneState(state);
  if (field === 'turn') {
    next.turn = next.turn === 'North' ? 'South' : 'North';
  } else if (field === 'hasAttacked') {
    next.hasAttacked = !next.hasAttacked;
  } else if (field === 'movedThisTurn-empty') {
    next.movedThisTurn = [];
  } else if (field === 'movedThisTurn-add') {
    const piece = next.pieces.find(p => p.side === next.turn);
    if (piece && !next.movedThisTurn.includes(piece.id)) {
      next.movedThisTurn = [...next.movedThisTurn, piece.id];
    }
  } else if (field === 'pendingRetreats-order') {
    if (next.pendingRetreats.length >= 2) {
      next.pendingRetreats = [next.pendingRetreats[1], next.pendingRetreats[0]];
    }
  } else if (field === 'retreatedThisTurn') {
    const piece = next.pieces.find(p => p.side === next.turn);
    if (piece) next.retreatedThisTurn = [piece.id];
  } else if (field === 'turnNumber') {
    next.turnNumber += 1;
  } else if (field.startsWith('piece-')) {
    const idx = Number(field.split('-')[1]);
    if (next.pieces[idx]) {
      const p = next.pieces[idx];
      next.pieces = next.pieces.map((pp, i) => i === idx ? { ...pp, x: (pp.x + 1) % 25 } : pp);
    }
  } else if (field === 'rulesetId') {
    next.rulesetId = 'mutated';
  }
  return next;
}

function generatePositions(count) {
  const positions = [];
  const rng = makeLcg(20260809);
  const presets = [resetToCommsDrill, resetToCommCut, resetToTestPreset];

  function combatContactState() {
    const state = createState();
    state.pieces = [
      // Two supplied North infantry destroy s1 at 8:6. Marking either as
      // retreated changes the real result to resisted at 4:6.
      createPiece({ id: 'n1', side: 'North', cls: 'Infantry', x: 1, y: 0 }),
      createPiece({ id: 'n2', side: 'North', cls: 'Infantry', x: 2, y: 0 }),
      createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 3, y: 0 }),
      createPiece({ id: 's2', side: 'South', cls: 'Infantry', x: 24, y: 0 })
    ];
    state.turn = 'North';
    return state;
  }

  for (let i = 0; i < count; i += 1) {
    let state = i % 4 === 0
      ? combatContactState()
      : presets[i % presets.length](createState());
    // Drive short playouts into and through combat contact: forced retreats
    // first, then attacks, then moves that close on an enemy.
    let plies = 0;
    const targetPlies = i % 4;
    while (plies < targetPlies && !state.gameOver) {
      const actions = legalActions(state);
      if (actions.length === 0) break;
      const retreats = actions.filter(action => action.type === 'retreat');
      const attacks = actions.filter(action => action.type === 'attack');
      const moves = actions.filter(action => action.type === 'move').sort((a, b) => {
        const pieceA = state.pieces.find(piece => piece.id === a.pieceId);
        const pieceB = state.pieces.find(piece => piece.id === b.pieceId);
        const enemies = state.pieces.filter(piece => piece.side !== state.turn);
        const distance = (action, piece) => Math.min(...enemies.map(enemy =>
          Math.max(Math.abs(action.x - enemy.x), Math.abs(action.y - enemy.y))), Infinity);
        return distance(a, pieceA) - distance(b, pieceB);
      });
      const end = actions.find(action => action.type === 'end-turn');
      const pool = retreats.length ? retreats : attacks.length ? attacks : moves.length ? moves : [end];
      const action = pool[Math.floor(rng() * Math.min(pool.length, 3))];
      try {
        state = applyAction(state, action, { recordHistory: true });
      } catch {
        break;
      }
      plies += 1;
    }
    positions.push(state);
  }
  return positions;
}

const fields = [
  'turn', 'hasAttacked', 'movedThisTurn-empty', 'movedThisTurn-add',
  'pendingRetreats-order', 'retreatedThisTurn', 'turnNumber', 'rulesetId'
];

const positions = generatePositions(SAMPLE_COUNT);
let collisions = 0;
let tested = 0;
const examples = [];
const sensitivityByField = {};

for (const state of positions) {
  for (let i = 0; i < Math.min(state.pieces.length, 3); i += 1) {
    fields.push(`piece-${i}`);
  }
  for (const field of fields) {
    const mutated = mutate(state, field);
    tested += 1;
    const behaviorChanged = behaviorDiffers(state, mutated);
    if (behaviorChanged) {
      sensitivityByField[field] = (sensitivityByField[field] || 0) + 1;
    }
    if (auditedPositionKey(state) === auditedPositionKey(mutated) && behaviorChanged) {
      collisions += 1;
      if (examples.length < 5) {
        examples.push({ field, before: formatLoa1(state), after: formatLoa1(mutated) });
      }
    }
  }
  // Keep fields list bounded by removing piece fields added for this state.
  while (fields.length > 8) fields.pop();
}

const report = {
  keyVariant: OMIT_RETREATED ? 'BROKEN:retreatedThisTurn-omitted' : 'fixed',
  samples: positions.length,
  mutationsTested: tested,
  behaviorChangingRetreatedMutations: sensitivityByField.retreatedThisTurn || 0,
  collisions,
  verdict: collisions === 0 ? 'PASS' : 'FAIL',
  examples
};

console.log(JSON.stringify(report, null, 2));
process.exit(collisions === 0 ? 0 : 1);
