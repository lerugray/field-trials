// combat.js: deterministic summed combat for LINES OF ADVANCE M4.
// Cites docs/RULES-LEDGER.md rows 36-54, 63-64, 67, 75-78.

import {
  isOnBoard,
  pieceAt,
  coordFromXY,
  isFighter,
  isRelay
} from './state.js';
import { isMountain, isPass, isFort, terrainDefenseBonus, activeArsenalsForSide } from './terrain.js';
import { computeCommunications } from './comms.js';

const DIRECTIONS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
]);

function isAligned(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

function lineLength(a, b) {
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

function lineSquaresExclusive(a, b) {
  const squares = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let x = a.x + dx;
  let y = a.y + dy;
  while (!(x === b.x && y === b.y)) {
    squares.push({ x, y, coord: coordFromXY(x, y) });
    x += dx;
    y += dy;
  }
  return squares;
}

function hasClearFireLine(state, from, to) {
  if (!isAligned(from, to)) return false;
  for (const sq of lineSquaresExclusive(from, to)) {
    if (isMountain(sq.x, sq.y)) return false;
    // Row 48: only mountains block fire; units do not.
  }
  return true;
}

function inRange(attacker, target) {
  if (!isAligned(attacker, target)) return false;
  const dist = lineLength(attacker, target);
  return dist > 0 && dist <= attacker.stats.range;
}

function unitDefense(state, piece, comms) {
  // Row 63: isolated fighting units lose all defensive value.
  if (isFighter(piece.cls)) {
    const audit = comms.status.get(piece.id);
    if (!audit || audit.status === 'isolated') return 0;
  }
  // Relays contribute their printed defense (1) when defending the square they occupy.
  return piece.stats.defense + terrainDefenseBonus(piece.cls, piece.x, piece.y);
}

function unitAttack(state, piece, target, comms, chargeAttackers = new Set()) {
  // Row 63: isolated fighting units lose all offensive value.
  if (isFighter(piece.cls)) {
    const audit = comms.status.get(piece.id);
    if (!audit || audit.status === 'isolated') return 0;
  }
  // Row 46: a dislodged unit forced to retreat cannot contribute its offensive factor
  // to any counter-attack on the turn it retreats.
  if (state.retreatedThisTurn && state.retreatedThisTurn.includes(piece.id)) return 0;

  if (piece.cls === 'Cavalry' && chargeAttackers.has(piece.id)) {
    return piece.stats.chargeAttack || piece.stats.attack;
  }
  return piece.stats.attack;
}

function isCavalryChargeTarget(state, target, comms) {
  // Row 50: charging cavalry may not attack a unit occupying a pass or garrisoning a fort.
  if (isPass(target.x, target.y)) return false;
  if (isFort(target.x, target.y)) {
    const occupant = pieceAt(state, target.x, target.y);
    // A fort is only a "garrison" if the target actually occupies it.
    if (occupant && occupant.id === target.id) return false;
  }
  return true;
}

function cavalryLines(state, side) {
  // Find all straight lines of 4 friendly cavalry with no gaps.
  const cavalry = state.pieces.filter(p => p.side === side && p.cls === 'Cavalry');
  if (cavalry.length < 4) return [];

  const byCoord = new Map();
  for (const p of cavalry) byCoord.set(`${p.x},${p.y}`, p);

  const lines = [];
  for (const start of cavalry) {
    for (const [dx, dy] of DIRECTIONS) {
      const line = [start];
      for (let i = 1; i < 4; i += 1) {
        const p = byCoord.get(`${start.x + i * dx},${start.y + i * dy}`);
        if (!p) break;
        line.push(p);
      }
      if (line.length === 4) {
        lines.push({ line, direction: { dx, dy }, lead: line[0], rear: line[3] });
      }
    }
  }
  // Each physical line is detected twice (once from each end). Deduplicate by sorted IDs.
  const seen = new Set();
  return lines.filter(ln => {
    const key = ln.line.map(p => p.id).sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chargeAttackersForTarget(state, target, comms) {
  // Row 49: 4 cavalry aligned, leading unit in direct contact with target.
  const lines = cavalryLines(state, target.side === 'North' ? 'South' : 'North');
  const attackers = new Set();
  for (const { line, lead, rear } of lines) {
    // Lead must be adjacent to target and in a straight line with it.
    if (!isAligned(lead, target)) continue;
    if (lineLength(lead, target) !== 1) continue;
    // Row 50: target may not be on a pass or in a fort.
    if (!isCavalryChargeTarget(state, target, comms)) continue;
    // Row 53: a cavalry unit occupying a fort cannot charge while it remains there.
    let blocked = false;
    for (const c of line) {
      if (isFort(c.x, c.y)) { blocked = true; break; }
      // Row 63: isolated cavalry cannot contribute.
      const audit = comms.status.get(c.id);
      if (!audit || audit.status === 'isolated') { blocked = true; break; }
    }
    if (blocked) continue;
    // Row 51: rear cavalry attack reaches up to 4 squares via the lead square.
    // The lead is 1 square from the target, so the whole column attacks if the rear is
    // within range 3 of the target (3 squares from lead + 1 = 4). That is always true for
    // a 4-cavalry column with adjacent lead, but verify against the rear's effective range.
    if (lineLength(rear, target) > 4) continue;
    for (const c of line) attackers.add(c.id);
  }
  return attackers;
}

function collectAttackers(state, target, comms) {
  const chargeSet = chargeAttackersForTarget(state, target, comms);
  const attackerSide = target.side === 'North' ? 'South' : 'North';

  // Row 51: in a charging column, the rearmost cavalry can reach up to 4 squares from
  // its position via the leading cavalry's square. Charging cavalry therefore attack if
  // they are aligned with the target and within 4 squares, even if that exceeds their
  // normal range of 2.
  function canAttack(p) {
    if (!isAligned(p, target)) return false;
    if (!hasClearFireLine(state, p, target)) return false;
    if (inRange(p, target)) return true;
    if (chargeSet.has(p.id) && lineLength(p, target) <= 4) return true;
    return false;
  }

  const attackers = [];
  for (const p of state.pieces) {
    if (p.side !== attackerSide) continue;
    if (!isFighter(p.cls)) continue;
    if (!canAttack(p)) continue;
    attackers.push(p);
  }
  return { attackers, chargeSet };
}

function collectDefenders(state, target, comms) {
  // Row 41: defending units must be opposing units in position and range to fire on the target
  // square. Relays have no offensive strength (row 70) and therefore do not contribute.
  const defenders = [];
  const defenderSide = target.side;
  for (const p of state.pieces) {
    if (p.side !== defenderSide) continue;
    if (!isFighter(p.cls)) continue;
    if (p.id === target.id) continue;
    if (!inRange(p, target)) continue;
    if (!hasClearFireLine(state, p, target)) continue;
    defenders.push(p);
  }
  return defenders;
}

function attackableEnemies(state, side, comms) {
  const enemies = [];
  const attackerSide = side;
  for (const p of state.pieces) {
    if (p.side === attackerSide) continue;
    const { attackers } = collectAttackers(state, p, comms);
    if (attackers.length > 0) enemies.push(p);
  }
  return enemies;
}

function computeCombat(state, targetId, options = {}) {
  const target = state.pieces.find(p => p.id === targetId);
  if (!target) {
    return { error: 'Invalid target' };
  }
  const comms = options.comms || computeCommunications(state);
  const { attackers, chargeSet } = collectAttackers(state, target, comms);
  if (attackers.length === 0) {
    return { error: 'No attacker in range' };
  }

  const defenderSide = target.side;
  const targetDefense = unitDefense(state, target, comms);
  const defenders = collectDefenders(state, target, comms);

  const attackBreakdown = attackers.map(p => ({
    id: p.id,
    cls: p.cls,
    coord: coordFromXY(p.x, p.y),
    base: p.stats.attack,
    value: unitAttack(state, p, target, comms, chargeSet),
    charging: chargeSet.has(p.id)
  }));

  const defenseBreakdown = [
    { id: target.id, cls: target.cls, coord: coordFromXY(target.x, target.y), base: target.stats.defense, value: targetDefense, terrain: terrainDefenseBonus(target.cls, target.x, target.y) }
  ].concat(defenders.map(p => ({
    id: p.id,
    cls: p.cls,
    coord: coordFromXY(p.x, p.y),
    base: p.stats.defense,
    value: unitDefense(state, p, comms),
    terrain: terrainDefenseBonus(p.cls, p.x, p.y)
  })));

  const totalAttack = attackBreakdown.reduce((sum, e) => sum + e.value, 0);
  const totalDefense = defenseBreakdown.reduce((sum, e) => sum + e.value, 0);

  const margin = totalAttack - totalDefense;
  let result;
  let retreatDestinations = [];
  let destroyed = false;
  let forcedRetreat = false;

  if (margin <= 0) {
    result = 'resist';
  } else if (margin === 1) {
    // Row 43: target must retreat as first move of its side's next turn.
    // Row 45: if no adjacent unoccupied square, destroyed instead.
    // Row 73 (Reading A): isolated units are immobile, so a forced retreat is impossible;
    // they are destroyed instead.
    const targetAudit = comms.status.get(target.id);
    if (!targetAudit || targetAudit.status === 'isolated') {
      result = 'destroyed';
      destroyed = true;
    } else {
      retreatDestinations = adjacentUnoccupiedSquares(state, target);
      if (retreatDestinations.length === 0) {
        result = 'destroyed';
        destroyed = true;
      } else {
        result = 'retreat';
        forcedRetreat = true;
      }
    }
  } else {
    result = 'destroyed';
    destroyed = true;
  }

  return {
    targetId,
    targetCoord: coordFromXY(target.x, target.y),
    targetCls: target.cls,
    totalAttack,
    totalDefense,
    margin,
    result,
    destroyed,
    forcedRetreat,
    retreatDestinations,
    attackBreakdown,
    defenseBreakdown,
    chargeSet: Array.from(chargeSet)
  };
}

function adjacentUnoccupiedSquares(state, piece) {
  const squares = [];
  for (const [dx, dy] of DIRECTIONS) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (isOnBoard(x, y) && !isMountain(x, y) && pieceAt(state, x, y) === null) {
      squares.push({ x, y, coord: coordFromXY(x, y) });
    }
  }
  return squares;
}

function findVictory(state) {
  // Row 75: victory by eliminating all enemy fighting units or capturing both enemy arsenals.
  for (const side of ['North', 'South']) {
    const enemy = side === 'North' ? 'South' : 'North';
    const enemyFighters = state.pieces.filter(p => p.side === enemy && isFighter(p.cls));
    if (enemyFighters.length === 0) return { winner: side, reason: 'all enemy fighting units eliminated' };

    const coords = activeArsenalsForSide(enemy);
    let captured = 0;
    for (const { x, y } of coords) {
      const occupant = pieceAt(state, x, y);
      if (occupant && occupant.side === side && isFighter(occupant.cls)) captured += 1;
    }
    if (captured === 2) return { winner: side, reason: 'both enemy arsenals captured' };
  }
  return null;
}

export {
  DIRECTIONS,
  hasClearFireLine,
  inRange,
  unitDefense,
  unitAttack,
  cavalryLines,
  chargeAttackersForTarget,
  collectAttackers,
  collectDefenders,
  attackableEnemies,
  computeCombat,
  adjacentUnoccupiedSquares,
  findVictory
};
