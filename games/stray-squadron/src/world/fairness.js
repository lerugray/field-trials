// The batch-seed fairness harness (DESIGN-SEED M4). A procedurally assembled level
// is only as good as its worst seed, so this analyzer audits an assembled level for
// the two fairness laws the seed makes non-negotiable:
//
//   1. NO UNAVOIDABLE HIT — at every rail station there is a reachable spot in the
//      steer frame that clears every collision hazard (obstacles as static disks;
//      each enemy wave across its full weave). A rail shooter must never hand the
//      player a station with no safe pixel.
//   2. NO DEAD STRETCH — no long content-free run of rail. Every authored chunk
//      carries content (fight, dodge, or a reward), so a level is never empty air.
//
// It also checks CONTAINMENT: every hazard sits inside the reachable frame, so the
// ship can always position around it. Pure + headless; the test drives it across N
// seeds and it stands as a regression from M4 on (run at every milestone).

import { FLIGHT } from '../flight/flight.js';
import { OBSTACLE } from '../flight/obstacles.js';
import { PICKUP } from '../combat/pickups.js';
import { poseEnemy } from '../combat/enemies.js';

export const FAIRNESS = {
  shipRadius: OBSTACLE.shipRadius, // 0.7 — the ship's collision disk
  stationStep: 1.0,                // along-rail sampling for the obstacle scan
  gridStep: 0.2,                   // frame-plane grid for the clear-point search
  deadMax: 100,                    // longest tolerated content-free rail stretch
                                   // (observed worst across 1000 seeds is ~85)
  weaveSamples: 8,                 // enemy weave-phase samples per wave
};

// The rectangle the ship's CENTER can occupy (frame minus its own radius).
function frameBounds(shipR) {
  return {
    x0: -FLIGHT.steerRangeX + shipR, x1: FLIGHT.steerRangeX - shipR,
    y0: -FLIGHT.steerRangeY + shipR, y1: FLIGHT.steerRangeY - shipR,
  };
}

// Does a point in the frame clear every disk? Disks are {lat, vert, radius} and
// the ship's radius is folded into the disk's exclusion radius.
function pointClears(lat, vert, disks, shipR) {
  for (const d of disks) {
    if (Math.hypot(lat - d.lat, vert - d.vert) < d.radius + shipR) return false;
  }
  return true;
}

// Is there ANY point in the steer frame that clears all the given disks? Grid
// search at gridStep; also probes the four frame corners (a clear gap often hides
// at an edge a coarse grid can skip).
function clearPointExists(disks, shipR) {
  const b = frameBounds(shipR);
  if (disks.length === 0) return true;
  for (let lat = b.x0; lat <= b.x1 + 1e-9; lat += FAIRNESS.gridStep) {
    for (let vert = b.y0; vert <= b.y1 + 1e-9; vert += FAIRNESS.gridStep) {
      if (pointClears(lat, vert, disks, shipR)) return true;
    }
  }
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
  return corners.some(([lat, vert]) => pointClears(lat, vert, disks, shipR));
}

// Analyze one assembled level (from world/level.js). Returns
//   { ok, problems:[...], metrics:{ maxDeadGap, worstStation } }
export function analyzeLevel(level) {
  const { chunks, enemies, obstacles, pickups } = level;
  const shipR = FAIRNESS.shipRadius;
  const problems = [];
  const sStart = chunks[0].s0;
  const sEnd = chunks[chunks.length - 1].s1;

  // --- CONTAINMENT: every hazard inside the reachable frame ---------------------
  for (const o of obstacles) {
    if (Math.abs(o.lat) > OBSTACLE.latRange + 1e-6 || Math.abs(o.vert) > OBSTACLE.vertRange + 1e-6) {
      problems.push(`obstacle at s=${o.s.toFixed(1)} outside the frame`);
    }
  }
  for (const p of pickups) {
    if (Math.abs(p.lat) > PICKUP.latRange + 1e-6 || Math.abs(p.vert) > PICKUP.vertRange + 1e-6) {
      problems.push(`pickup at s=${p.s.toFixed(1)} outside the frame`);
    }
  }

  // --- NO UNAVOIDABLE HIT (obstacles): a clear point at every station -----------
  let worstStation = null;
  for (let s = sStart; s <= sEnd; s += FAIRNESS.stationStep) {
    const active = [];
    for (const o of obstacles) {
      if (Math.abs(o.s - s) <= o.radius + shipR) active.push(o);
    }
    if (active.length && !clearPointExists(active, shipR)) {
      worstStation = s;
      problems.push(`no clear point at station s=${s.toFixed(1)} (${active.length} obstacles)`);
    }
  }

  // --- NO UNAVOIDABLE HIT (enemy contact): a clear point at every station across
  // the weave. Only enemies whose bodies actually overlap a station can be
  // contacted there, so — like obstacles — we pool by STATION, not by whole wave
  // (wave members are spread along the rail and are never co-located). Enemies
  // weave, so we sample the weave clock across a full period at each station.
  const minFreq = Math.min(1, ...enemies.map((e) => e.freq || 1));
  const weavePeriod = (Math.PI * 2) / minFreq;
  for (let s = sStart; s <= sEnd; s += FAIRNESS.stationStep) {
    const near = enemies.filter((e) => Math.abs(e.s - s) <= e.radius + shipR);
    if (near.length === 0) continue;
    for (let i = 0; i < FAIRNESS.weaveSamples; i++) {
      const t = (weavePeriod * i) / FAIRNESS.weaveSamples;
      const disks = near.map((m) => {
        const e = { ...m, t };
        poseEnemy(e);
        return { lat: e.lat, vert: e.vert, radius: e.radius };
      });
      if (!clearPointExists(disks, shipR)) {
        problems.push(`no clear point vs enemies at s=${s.toFixed(1)} (weave phase ${i})`);
        break;
      }
    }
  }

  // --- NO DEAD STRETCH: bounded gaps between content along the rail --------------
  const stations = [
    sStart, sEnd,
    ...obstacles.map((o) => o.s),
    ...enemies.map((e) => e.s),
    ...pickups.map((p) => p.s),
  ].filter((s) => s >= sStart && s <= sEnd).sort((a, b) => a - b);
  let maxDeadGap = 0;
  for (let i = 1; i < stations.length; i++) {
    const gap = stations[i] - stations[i - 1];
    if (gap > maxDeadGap) maxDeadGap = gap;
  }
  if (maxDeadGap > FAIRNESS.deadMax) {
    problems.push(`dead stretch of ${maxDeadGap.toFixed(1)} (> ${FAIRNESS.deadMax})`);
  }

  return { ok: problems.length === 0, problems, metrics: { maxDeadGap, worstStation } };
}

// Run the analyzer over a batch of seeds, given a level builder. Returns
//   { ok, worstDeadGap, failures:[{seed, problems}] }
export function auditSeeds(seeds, buildLevel) {
  const failures = [];
  let worstDeadGap = 0;
  for (const seed of seeds) {
    const report = analyzeLevel(buildLevel(seed));
    if (report.metrics.maxDeadGap > worstDeadGap) worstDeadGap = report.metrics.maxDeadGap;
    if (!report.ok) failures.push({ seed, problems: report.problems });
  }
  return { ok: failures.length === 0, worstDeadGap, failures };
}
