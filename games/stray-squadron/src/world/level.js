// Level composition — M4's payoff. Ties the three M4 layers together: pick the
// sector theme, run the encounter grammar for the level's chunk rhythm, then fill
// each chunk with the content its type calls for. The result is one object the
// runtime (main.js) drives and the fairness harness audits.
//
//   'wave'   -> clustered enemy waves     (enemies.js)
//   'field'  -> a weave-able obstacle run (obstacles.js)
//   'rescue' -> a calm pickup/breather    (pickups.js)
//
// Each chunk draws from an independent per-chunk RNG fork, so one chunk's content
// can never desync another's — and the whole level stays deterministic from the
// seed (the seeded-world contract). Pure + headless-testable.

import { makeRng } from '../core/rng.js';
import { pickSector, sectorById } from './sectors.js';
import { buildChunks, CHUNK } from './grammar.js';
import { fillWaveChunk, poseEnemy, WAVE } from '../combat/enemies.js';
import { fillFieldChunk, OBSTACLE } from '../flight/obstacles.js';
import { fillRescueChunk } from '../combat/pickups.js';

// S6 — route threat (1..3) into MODEST content deltas. Threat 2 is the baseline and
// returns the exact prior values so a threat-2 (or threat-omitted) level is byte-
// identical to before. Threat 1 eases off; threat 3 leans in — a few more enemies per
// wave, a heavier gunner mix, and a denser obstacle field. All within the fairness
// bounds (the harness audits every threat; see test/fairness.test.js). The map has
// promised harder branches since M5 — this makes the promise true before the boss.
export function threatTuning(threat) {
  const t = threat == null ? 2 : threat;
  // Wave SIZE is the dodgeability-sensitive knob (a wave shares one station, so more
  // enemies there crowds the steer frame — the 3000-seed sweep found one unfair seed
  // when threat 3 pushed the cap to 5). So threat 3 does NOT enlarge waves past the
  // baseline; it leans on the SAFE knobs instead — a heavier gunner mix (more fire,
  // each bolt still dodgeable) and a denser obstacle field. Threat 1 eases the cap.
  return {
    droneP: t <= 1 ? 0.74 : t >= 3 ? 0.54 : 0.65,                       // lower => more gunners
    sizeMax: t <= 1 ? Math.max(WAVE.sizeMin, WAVE.sizeMax - 1) : WAVE.sizeMax,
    maxGap: t <= 1 ? OBSTACLE.maxGapS + 4
          : t >= 3 ? OBSTACLE.maxGapS - 4 : OBSTACLE.maxGapS,           // obstacle spacing
  };
}

// Assemble a complete level from a seed. Returns:
//   { seed, theme, chunks, enemies, obstacles, pickups }
// `sectorId` (M5) lets the route map assign a level's sector per NODE rather than
// deriving it from the seed alone; omit it for the M4 seed-picks-the-sector path.
export function buildLevel(seed, sStart = CHUNK.startS, sEnd = 1400, sectorId = null, threat = 2) {
  const theme = sectorId ? sectorById(sectorId) : pickSector(seed);
  const chunks = buildChunks(seed, sStart, sEnd);
  const rng = makeRng(String(seed) + ':level');
  const tune = threatTuning(threat);

  const enemies = [];
  const obstacles = [];
  const pickups = [];
  let waveId = 0, enemyId = 1, pickupId = 1;

  for (const c of chunks) {
    const crng = rng.fork(c.index); // independent, reproducible per-chunk stream
    if (c.type === 'wave') {
      const r = fillWaveChunk(crng, c.s0, c.s1, enemies, waveId, enemyId,
        { droneP: tune.droneP, sizeMax: tune.sizeMax });
      waveId = r.waveId; enemyId = r.id;
    } else if (c.type === 'field') {
      fillFieldChunk(crng, c.s0, c.s1, obstacles, { maxGap: tune.maxGap });
    } else if (c.type === 'rescue') {
      const r = fillRescueChunk(crng, c.s0, c.s1, pickups, pickupId);
      pickupId = r.id;
    }
  }

  // Seed every enemy's initial pose so a still frame reads without a step.
  for (const e of enemies) poseEnemy(e);

  return { seed, theme, chunks, enemies, obstacles, pickups, threat };
}

// Which chunk a given rail station falls in (or null past the end) — handy for
// the HUD's sector/beat readout and for tests asserting per-chunk coverage.
export function chunkAt(chunks, s) {
  for (const c of chunks) if (s >= c.s0 && s < c.s1) return c;
  return null;
}
