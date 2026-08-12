// The encounter grammar — M4's macro-structure layer. Instead of enemies and
// obstacles each independently smearing across the whole rail, the grammar first
// decides the level's RHYTHM: an ordered run of contiguous chunks, each of one
// authored type, tiling the rail from the start line to the level end. The level
// builder (level.js) then fills each chunk with the matching content.
//
// Three authored chunk types (DESIGN-SEED M4 floor):
//   'wave'   — an enemy-wave stretch (the fight beats)
//   'field'  — an obstacle field to weave (the dodge beats)
//   'rescue' — a calm rescue/pickup beat (the breather beats)
//
// The grammar rules give the level a pulse instead of a mush: it opens on action
// (never a breather), never stacks two breathers back to back, never repeats one
// type more than twice running, and — for any level long enough to hold them —
// guarantees all three types appear. Pure + headless-testable; determinism is the
// seeded-world contract.

import { makeRng } from '../core/rng.js';

export const CHUNK_TYPES = ['wave', 'field', 'rescue'];

export const CHUNK = {
  startS: 34,        // first chunk begins past the start line (no point-blank open)
  // Absorb any leftover shorter than this into the current (final) chunk rather
  // than emitting a runt. Must be >= the largest per-type min (wave, 70) so a
  // freshly started chunk always has room for its own minimum length.
  minTail: 70,
  len: {
    wave:   { min: 70, max: 120 },
    field:  { min: 55, max: 95 },
    rescue: { min: 40, max: 62 },
  },
  weight: { wave: 0.45, field: 0.35, rescue: 0.20 },
};

const AVG_LEN = 80; // rough chunk length, for estimating remaining slots

// Weighted pick over an already-constraint-filtered candidate list.
function weightedPick(rng, candidates) {
  let total = 0;
  for (const c of candidates) total += CHUNK.weight[c];
  let r = rng.next() * total;
  for (const c of candidates) {
    r -= CHUNK.weight[c];
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

// Choose the next chunk type honoring the grammar rules. `prevType`/`runLen` track
// the current same-type run; `used` is the set of types placed so far; `remaining`
// is rail distance left. Returns a type string.
function chooseType(rng, prevType, runLen, used, remaining) {
  // Base candidates: everything, minus the rules.
  let cand = CHUNK_TYPES.filter((t) => {
    if (t === 'rescue' && prevType === 'rescue') return false; // no adjacent breathers
    if (t === 'rescue' && prevType === null) return false;     // open on action
    if (t === prevType && runLen >= 2) return false;           // no 3-in-a-row
    return true;
  });
  // Safety net: constraints should never empty the list, but if they did, drop
  // the run-length rule (the softest one) rather than crash.
  if (cand.length === 0) cand = CHUNK_TYPES.filter((t) => !(t === 'rescue' && prevType === 'rescue'));

  // Variety guarantee: if the level is running out of room and some type has never
  // appeared, force a missing type now (a missing type is always rule-compatible —
  // it can't be the type we just placed, so it never triggers the adjacency rules).
  const missing = CHUNK_TYPES.filter((t) => !used.has(t));
  const slotsLeft = Math.floor(remaining / AVG_LEN);
  if (missing.length > 0 && slotsLeft <= missing.length) {
    const forced = missing.filter((t) => cand.includes(t));
    if (forced.length > 0) return weightedPick(rng, forced);
  }
  return weightedPick(rng, cand);
}

// Assemble the ordered chunk list tiling [sStart, sEnd). Each chunk is
// { index, type, s0, s1 } with s1===next.s0, first.s0===sStart, last.s1===sEnd.
export function buildChunks(seed, sStart = CHUNK.startS, sEnd = 1400) {
  const rng = makeRng(String(seed) + ':grammar');
  const chunks = [];
  const used = new Set();
  let s = sStart;
  let prevType = null;
  let runLen = 0;

  while (s < sEnd - 1e-6) {
    const type = chooseType(rng, prevType, runLen, used, sEnd - s);
    const spec = CHUNK.len[type];
    let s1 = s + rng.range(spec.min, spec.max);
    // Absorb a too-short tail so we never emit a sliver chunk at the end.
    if (sEnd - s1 < CHUNK.minTail) s1 = sEnd;
    if (s1 > sEnd) s1 = sEnd;

    chunks.push({ index: chunks.length, type, s0: s, s1 });
    used.add(type);
    runLen = type === prevType ? runLen + 1 : 1;
    prevType = type;
    s = s1;
  }
  return chunks;
}
