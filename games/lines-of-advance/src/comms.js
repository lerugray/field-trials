// comms.js: lines-of-communication engine for LINES OF ADVANCE M3.
// Cites docs/RULES-LEDGER.md rows 55-72.

import {
  coordFromXY,
  isOnBoard,
  pieceAt,
  isFighter,
  isRelay
} from './state.js';
import {
  activeArsenalsForSide,
  isMountain,
  isArsenal
} from './terrain.js';

const DIRECTIONS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
];

function isEnemyFighterAt(state, x, y, side) {
  const p = pieceAt(state, x, y);
  return p && p.side !== side && isFighter(p.cls);
}

function isOwnRelayAt(state, x, y, side) {
  const p = pieceAt(state, x, y);
  return p && p.side === side && isRelay(p.cls);
}

function isAligned(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
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

function activeArsenals(state, side) {
  const arsenals = activeArsenalsForSide(side);
  return arsenals.filter(({ x, y }) => {
    const occupant = pieceAt(state, x, y);
    return !(occupant && occupant.side !== side && isFighter(occupant.cls));
  });
}

function castRays(state, origin, side, suppliedMap, relayQueue, relayChain, baseRoute, sourceArsenal) {
  for (const [dx, dy] of DIRECTIONS) {
    const route = [...baseRoute];
    let x = origin.x + dx;
    let y = origin.y + dy;
    while (isOnBoard(x, y)) {
      if (isMountain(x, y)) break;
      if (isEnemyFighterAt(state, x, y, side)) break;

      const coord = coordFromXY(x, y);
      route.push(coord);
      if (!suppliedMap.has(coord)) {
        suppliedMap.set(coord, {
          sourceArsenal,
          relayChain: relayChain.slice(),
          route: route.slice()
        });
      }

      if (isOwnRelayAt(state, x, y, side)) {
        relayQueue.push({
          x, y, side,
          relayChain: relayChain.slice(),
          baseRoute: route.slice(),
          sourceArsenal
        });
      }

      x += dx;
      y += dy;
    }
  }
}

function computeSideSupplied(state, side) {
  const suppliedMap = new Map();
  const relayQueue = [];

  for (const arsenal of activeArsenals(state, side)) {
    const origin = { x: arsenal.x, y: arsenal.y };
    const baseRoute = [coordFromXY(origin.x, origin.y)];
    const sourceArsenal = coordFromXY(origin.x, origin.y);
    castRays(state, origin, side, suppliedMap, relayQueue, [], baseRoute, sourceArsenal);
  }

  const processedRelays = new Set();
  while (relayQueue.length > 0) {
    const item = relayQueue.shift();
    const key = `${item.x},${item.y}`;
    if (processedRelays.has(key)) continue;
    processedRelays.add(key);

    const relay = pieceAt(state, item.x, item.y);
    if (!relay || relay.side !== side || !isRelay(relay.cls)) continue;

    const origin = { x: item.x, y: item.y };
    const newChain = item.relayChain.concat(coordFromXY(item.x, item.y));
    castRays(state, origin, side, suppliedMap, relayQueue, newChain, item.baseRoute, item.sourceArsenal);
  }

  return suppliedMap;
}

function fighterComponents(state, side) {
  const fighters = state.pieces.filter(p => p.side === side && isFighter(p.cls));
  const visited = new Set();
  const components = [];

  for (const start of fighters) {
    if (visited.has(start.id)) continue;
    const component = [];
    const stack = [start];
    while (stack.length > 0) {
      const p = stack.pop();
      if (visited.has(p.id)) continue;
      visited.add(p.id);
      component.push(p);
      for (const [dx, dy] of DIRECTIONS) {
        const neighbor = pieceAt(state, p.x + dx, p.y + dy);
        if (neighbor && neighbor.side === side && isFighter(neighbor.cls) && !visited.has(neighbor.id)) {
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return components;
}

function findCutAudit(state, piece) {
  const side = piece.side;
  const pieceCoord = { x: piece.x, y: piece.y };

  for (const arsenal of activeArsenals(state, side)) {
    if (!isAligned(arsenal, pieceCoord)) continue;
    const line = lineSquaresExclusive(arsenal, pieceCoord);
    for (const sq of line) {
      if (isMountain(sq.x, sq.y)) {
        return {
          reason: `Line to arsenal ${coordFromXY(arsenal.x, arsenal.y)} blocked by mountain at ${sq.coord}`,
          cut: sq.coord,
          sourceArsenal: coordFromXY(arsenal.x, arsenal.y)
        };
      }
      const occupant = pieceAt(state, sq.x, sq.y);
      if (occupant && occupant.side !== side && isFighter(occupant.cls)) {
        return {
          reason: `Line to arsenal ${coordFromXY(arsenal.x, arsenal.y)} cut at ${sq.coord} by ${occupant.side.toLowerCase()} ${occupant.cls.toLowerCase()}`,
          cut: sq.coord,
          sourceArsenal: coordFromXY(arsenal.x, arsenal.y)
        };
      }
    }
  }

  return {
    reason: 'No unbroken line to an arsenal or relay; no adjacent supplied unit',
    cut: null,
    sourceArsenal: null
  };
}

function computeCommunications(state) {
  const sideSupplied = {
    North: computeSideSupplied(state, 'North'),
    South: computeSideSupplied(state, 'South')
  };

  const status = new Map();

  // Direct or relay supply for any unit on a supplied square.
  for (const piece of state.pieces) {
    const supplied = sideSupplied[piece.side].get(coordFromXY(piece.x, piece.y));
    if (supplied) {
      status.set(piece.id, {
        status: 'in-communication',
        sourceArsenal: supplied.sourceArsenal,
        relayChain: supplied.relayChain.slice(),
        route: supplied.route.slice()
      });
    }
  }

  // Indirect communication via fighting-unit adjacency.
  for (const side of ['North', 'South']) {
    const components = fighterComponents(state, side);
    for (const component of components) {
      const suppliedMember = component.find(p => status.get(p.id));
      if (!suppliedMember) continue;
      const base = status.get(suppliedMember.id);
      for (const p of component) {
        if (status.get(p.id)) continue;
        const pCoord = coordFromXY(p.x, p.y);
        status.set(p.id, {
          status: 'in-communication',
          sourceArsenal: base.sourceArsenal,
          relayChain: base.relayChain.slice(),
          route: base.route.concat(pCoord),
          via: suppliedMember.id
        });
      }
    }
  }

  // Anything left is isolated.
  for (const piece of state.pieces) {
    if (status.get(piece.id)) continue;
    const audit = findCutAudit(state, piece);
    status.set(piece.id, {
      status: 'isolated',
      sourceArsenal: audit.sourceArsenal,
      relayChain: [],
      route: [],
      ...audit
    });
  }

  // Propagate cut information to adjacent isolated friendly fighters so that
  // indirectly disabled units can render the broken segment near them.
  for (const piece of state.pieces) {
    const audit = status.get(piece.id);
    if (!audit || audit.status !== 'isolated' || audit.cut) continue;
    for (const [dx, dy] of DIRECTIONS) {
      const neighbor = pieceAt(state, piece.x + dx, piece.y + dy);
      if (neighbor && neighbor.side === piece.side && isFighter(neighbor.cls)) {
        const neighborAudit = status.get(neighbor.id);
        if (neighborAudit && neighborAudit.cut) {
          audit.cut = neighborAudit.cut;
          audit.sourceArsenal = neighborAudit.sourceArsenal;
          audit.reason = `Supply cut at ${neighborAudit.cut} (via adjacent unit)`;
          break;
        }
      }
    }
  }

  return { sideSupplied, status };
}

export {
  DIRECTIONS,
  computeCommunications,
  activeArsenals,
  isAligned,
  lineSquaresExclusive
};
