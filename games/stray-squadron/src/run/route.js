// The branching sector map — M5's macro-structure above the level. Where M4's
// grammar authored the rhythm INSIDE one level, the route authors the shape of a
// whole RUN: an ordered set of ranks (each rank is one played level), branching
// between them so the pilot chooses a path. Classic rail-shooter route map: start
// on a fixed first level, branch out through the middle, converge on the final
// approach (the boss slot lands M8; here the final rank is just the last level).
//
// The route is a layered DAG:
//   - rank 0 is a single START node (every run opens the same first level)
//   - the final rank is a single node (the run's climax slot)
//   - middle ranks fan out to 2-3 nodes each
//   - every node has 1-3 forward branches; every node is reachable from START and
//     can reach the final (no dead ends, no orphans)
//
// Each node carries where it is (sector theme), how hard it reads (threat 1-3,
// ramping with depth), a spoiler-free reward hint the map shows BEFORE you commit,
// and its own level seed so two nodes in the same sector still play differently.
// Pure + headless-testable; determinism is the seeded-world contract.

import { makeRng } from '../core/rng.js';
import { SECTORS } from '../world/sectors.js';

export const ROUTE = {
  minLevels: 3,       // shortest complete run (DESIGN-SEED: 3-5 for the prototype)
  maxLevels: 5,
  midWidthMin: 2,     // middle ranks fan out to this many nodes...
  midWidthMax: 3,     // ...up to this many
  maxBranch: 3,       // a node offers at most this many forward choices
  maxThreat: 3,       // threat reads 1..3 (icon pips on the map)
};

// The spoiler-free reward hints the map shows before commit. Never a promise of an
// exact reward — a read on the flavor of the path, so a choice has texture.
export const REWARD_HINTS = ['supplies', 'salvage', 'quiet', 'contested'];

// Pick a rank's sector, biased away from repeating the immediately preceding
// rank's sectors so a path reads as travel, not a stuck backdrop.
function pickSector(rng, avoidIds) {
  const fresh = SECTORS.filter((s) => !avoidIds.has(s.id));
  const pool = fresh.length ? fresh : SECTORS;
  return pool[rng.int(0, pool.length - 1)];
}

// Threat ramps with depth: shallow ranks read calmer, the final rank reads hardest.
// A small seeded jitter keeps sibling nodes on a rank from all looking identical.
function threatFor(rng, rank, lastRank) {
  const base = lastRank <= 1 ? ROUTE.maxThreat
    : 1 + Math.round((rank / lastRank) * (ROUTE.maxThreat - 1));
  const jitter = rng.int(-1, 1) * (rank > 0 && rank < lastRank ? 1 : 0);
  return Math.max(1, Math.min(ROUTE.maxThreat, base + jitter));
}

// Wire rank r's nodes forward to rank r+1's nodes so that every source has >=1
// outgoing branch (<= maxBranch) and every target has >=1 incoming edge. Mutates
// each source node's `branches` array (holds target ids).
function linkRanks(rng, srcNodes, dstNodes) {
  // 1) every source gets one edge to a random target
  for (const src of srcNodes) {
    const t = dstNodes[rng.int(0, dstNodes.length - 1)];
    src.branches.push(t.id);
  }
  // 2) cover any target with no incoming edge yet, from a random source
  const covered = new Set(srcNodes.flatMap((s) => s.branches));
  for (const dst of dstNodes) {
    if (covered.has(dst.id)) continue;
    // prefer a source that still has room; fall back to any
    const room = srcNodes.filter((s) => s.branches.length < ROUTE.maxBranch);
    const pool = room.length ? room : srcNodes;
    const src = pool[rng.int(0, pool.length - 1)];
    src.branches.push(dst.id);
    covered.add(dst.id);
  }
  // 3) a little extra connectivity so choices exist, never past maxBranch and never
  //    a duplicate edge
  for (const src of srcNodes) {
    if (dstNodes.length < 2) break;
    while (src.branches.length < ROUTE.maxBranch && rng.next() < 0.45) {
      const t = dstNodes[rng.int(0, dstNodes.length - 1)];
      if (!src.branches.includes(t.id)) src.branches.push(t.id);
      else break;
    }
  }
}

// Build a full branching route from a run seed. Returns:
//   { seed, levels, ranks:[[node,...],...], nodes:{id->node}, startId, finalId }
// where each node is
//   { id, rank, index, sectorId, sectorName, threat, hint, levelSeed, branches:[id] }
export function buildRoute(seed) {
  const rng = makeRng(String(seed) + ':route');
  const levels = rng.int(ROUTE.minLevels, ROUTE.maxLevels);
  const lastRank = levels - 1;

  const ranks = [];
  const nodes = {};
  let prevIds = new Set();

  for (let r = 0; r < levels; r++) {
    const width = (r === 0 || r === lastRank)
      ? 1
      : rng.int(ROUTE.midWidthMin, ROUTE.midWidthMax);
    const rankNodes = [];
    const usedThisRank = new Set();
    for (let i = 0; i < width; i++) {
      const sector = pickSector(rng, usedThisRank.size ? usedThisRank : prevIds);
      usedThisRank.add(sector.id);
      const node = {
        id: r + '-' + i,
        rank: r,
        index: i,
        sectorId: sector.id,
        sectorName: sector.name,
        threat: threatFor(rng, r, lastRank),
        hint: REWARD_HINTS[rng.int(0, REWARD_HINTS.length - 1)],
        levelSeed: String(seed) + ':L' + r + '-' + i,
        branches: [],
      };
      rankNodes.push(node);
      nodes[node.id] = node;
    }
    ranks.push(rankNodes);
    prevIds = usedThisRank;
  }

  // Link consecutive ranks.
  for (let r = 0; r < lastRank; r++) linkRanks(rng, ranks[r], ranks[r + 1]);

  return {
    seed: String(seed),
    levels,
    ranks,
    nodes,
    startId: ranks[0][0].id,
    finalId: ranks[lastRank][0].id,
  };
}

// The nodes a given node can branch to (the choices the map offers at that step).
export function branchesOf(route, nodeId) {
  const n = route.nodes[nodeId];
  if (!n) return [];
  return n.branches.map((id) => route.nodes[id]);
}
