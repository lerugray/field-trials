// reachability.js — the JUMP-PHYSICS REACHABILITY VALIDATOR (M2, verification fold:
// "the validator calls the REAL tick function — simulated jump execution, never
// closed-form ballistics — enforces an edge-landing margin over void, and one seed per N
// is proven by a bot that actually collects every pod"). Pure sim; no WebGL.
//
// How it works: from each island we simulate AIMED hops (yaw pointed at a target, full
// forward, trying 1/2/3 jumps) through the real updatePlayer + archipelagoGround, and
// record which island the player ACTUALLY lands on (a short hop may land on an
// intermediate island; that's a real edge too). That yields a reach graph. BFS from the
// spawn pad proves every pod island and the exit island are reachable. runCollectBot()
// then chains real hops along that graph and asserts every pod is collected — the deep
// per-N proof.

import { createPlayer, updatePlayer } from './player.js';
import { archipelagoGround } from './islands.js';
import { generateSphere } from './generate.js';
import { TIMESTEP, tuning } from './tuning.js';

// Max reroll attempts before a sphere is served best-effort with a LOUD flag. In practice
// the generator's calibrated bands make attempt 0 valid ~always; this is a safety net.
const MAX_ATTEMPTS = 40;

// Yaw that makes the player's forward axis point from A to B. player.moveBasis: forward
// = (-sin yaw, -cos yaw), so aim(yaw) = atan2(-(Bx-Ax), -(Bz-Az)).
function aimYaw(A, B) {
  return Math.atan2(-(B.cx - A.cx), -(B.cz - A.cz));
}

// Which island the player is standing on at (x,z,y): the one whose top they're within
// (radius − margin) of horizontally and level with vertically. Returns index or -1.
function standingIsland(islands, x, z, y, margin = 0) {
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < islands.length; i++) {
    const o = islands[i];
    const d = Math.hypot(x - o.cx, z - o.cz);
    if (d <= o.radius - margin + 1e-9 && Math.abs(y - o.topY) < 0.2 && d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}

// Simulate one aimed hop from island `fromIdx` toward island `aimIdx` using at most
// `maxJumps` jumps. Starts at the FROM island's center (a running start across the pad),
// full forward, chaining jumps at each apex. Returns the island index actually landed on
// (with the edge-landing margin enforced) or -1 (fell into the void / overshot).
export function simulateAimedHop(islands, fromIdx, aimIdx, maxJumps, T = tuning) {
  const A = islands[fromIdx], B = islands[aimIdx];
  const yaw = aimYaw(A, B);
  const ground = archipelagoGround(islands);
  const p = createPlayer({ x: A.cx, y: A.topY, z: A.cz });
  p.grounded = true;
  const margin = T.land.reachEdgeMargin;
  let held = false;
  for (let i = 0; i < 300; i++) {
    let jump = false;
    if (!held) {
      if (p.jumpsUsed === 0 && p.grounded) jump = true;
      else if (p.jumpsUsed > 0 && p.jumpsUsed < maxJumps && !p.grounded && p.vel.y <= 0) jump = true;
    }
    updatePlayer(p, { f: 1, s: 0, jump, yaw }, TIMESTEP, ground, undefined, T);
    held = jump;
    if (p.grounded && i > 2) {
      const idx = standingIsland(islands, p.pos.x, p.pos.z, p.pos.y, margin);
      return idx === fromIdx ? -1 : idx; // landing back on start is not progress
    }
  }
  return -1;
}

// One-hop neighbors of island `fromIdx`: the set of islands reachable by aiming at every
// other island with the best of 1/2/3 jumps. Returns a Map landedIdx → {aim, jumps} (the
// cheapest strategy that reaches it) so a bot can replay the exact hop.
export function reachNeighbors(islands, fromIdx, T = tuning) {
  const nbrs = new Map();
  for (let aim = 0; aim < islands.length; aim++) {
    if (aim === fromIdx) continue;
    for (let jumps = 1; jumps <= T.jump.count; jumps++) {
      const landed = simulateAimedHop(islands, fromIdx, aim, jumps, T);
      if (landed >= 0 && !nbrs.has(landed)) nbrs.set(landed, { aim, jumps });
    }
  }
  return nbrs;
}

// The full reach graph: adjacency[i] = Map neighborIdx → {aim, jumps}.
export function buildReachGraph(islands, T = tuning) {
  return islands.map((_, i) => reachNeighbors(islands, i, T));
}

// BFS island indices reachable from `start` over a prebuilt graph (or build one).
export function reachableSet(islands, start = 0, graph = null, T = tuning) {
  const g = graph || buildReachGraph(islands, T);
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const nb of g[cur].keys()) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  }
  return seen;
}

// Validate a generated sphere: is every pod island and the exit island reachable from the
// spawn pad (island 0)? Returns { ok, reachable, missing:[{type,island}], graph }.
export function validateSphere(sphere, T = tuning) {
  const { islands, pods, exit } = sphere;
  const graph = buildReachGraph(islands, T);
  const reachable = reachableSet(islands, 0, graph, T);
  const missing = [];
  for (let k = 0; k < pods.length; k++) if (!reachable.has(pods[k].island)) missing.push({ type: 'pod', island: pods[k].island, index: k });
  if (!reachable.has(exit.island)) missing.push({ type: 'exit', island: exit.island });
  return { ok: missing.length === 0, reachable, missing, graph };
}

// Generate + validate glue: generate a sphere and reroll the layout (deterministic
// attempt salt) until the reachability validator passes. Pure & deterministic — resume
// recomputes the exact same valid sphere from (worldSeed, sphereIndex), storing nothing.
// Returns the sphere augmented with { valid, attempt, reachable, missing }; on the (near-
// impossible) exhaustion it returns the last layout with valid=false so the game still has
// a playable sphere — the caller logs that LOUDLY (hard rule 4). Never throws.
export function makeValidatedSphere(worldSeed, sphereIndex = 0, T = tuning) {
  let last = null, lastV = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const sphere = generateSphere(worldSeed, sphereIndex, attempt, T);
    const v = validateSphere(sphere, T);
    last = sphere; lastV = v;
    if (v.ok) return { ...sphere, valid: true, attempt, reachable: v.reachable, missing: [] };
  }
  return { ...last, valid: false, attempt: MAX_ATTEMPTS, reachable: lastV.reachable, missing: lastV.missing };
}

// Shortest island path start→goal over the graph (BFS), or null.
function shortestPath(graph, start, goal) {
  if (start === goal) return [start];
  const prev = new Map([[start, null]]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const nb of graph[cur].keys()) {
      if (!prev.has(nb)) { prev.set(nb, cur); if (nb === goal) { const path = [goal]; let c = cur; while (c !== null) { path.unshift(c); c = prev.get(c); } return path; } q.push(nb); }
    }
  }
  return null;
}

// The DEEP per-N proof: a bot that chains REAL hops from the spawn pad and collects every
// pod, then reaches the exit island. Greedy — repeatedly path to the nearest island with
// an uncollected pod, execute each hop via the recorded strategy, collecting pods on any
// island it lands on. Returns { ok, collected, total, reachedExit, hops }.
export function runCollectBot(sphere, T = tuning) {
  const { islands, pods, exit } = sphere;
  const graph = buildReachGraph(islands, T);
  const podByIsland = new Map(pods.map((p, k) => [p.island, k]));
  const collected = new Set();
  let cur = 0, hops = 0;

  const collectHere = (idx) => { if (podByIsland.has(idx)) collected.add(podByIsland.get(idx)); };
  collectHere(0);

  // Walk one graph edge cur→next, replaying the recorded hop through the real tick;
  // returns the island actually landed on (must equal `next` for a valid edge).
  const doHop = (from, next) => {
    const strat = graph[from].get(next);
    if (!strat) return -1;
    hops++;
    return simulateAimedHop(islands, from, strat.aim, strat.jumps, T);
  };

  const targetsLeft = () => pods.map((p) => p.island).filter((isl) => !collected.has(podByIsland.get(isl)));

  let guard = 0;
  while (collected.size < pods.length && guard++ < 200) {
    // Nearest reachable uncollected-pod island by path length.
    let best = null;
    for (const isl of targetsLeft()) {
      const path = shortestPath(graph, cur, isl);
      if (path && (!best || path.length < best.path.length)) best = { isl, path };
    }
    if (!best) break; // an uncollected pod is unreachable from here
    for (let s = 1; s < best.path.length; s++) {
      const landed = doHop(cur, best.path[s]);
      if (landed < 0) return { ok: false, collected: collected.size, total: pods.length, reachedExit: false, hops, failedAt: { from: cur, to: best.path[s] } };
      cur = landed; collectHere(cur);
    }
  }

  // Finally, reach the exit island.
  let reachedExit = cur === exit.island;
  if (!reachedExit) {
    const path = shortestPath(graph, cur, exit.island);
    if (path) {
      reachedExit = true;
      for (let s = 1; s < path.length; s++) { const landed = doHop(cur, path[s]); if (landed < 0) { reachedExit = false; break; } cur = landed; collectHere(cur); }
    }
  }

  return { ok: collected.size === pods.length && reachedExit, collected: collected.size, total: pods.length, reachedExit, hops };
}
