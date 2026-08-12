// THE JACQUARD INDEX — the generator / proving pipeline.
//
// The seed's generator "builds clue-sets from motifs and PROVES each puzzle per the
// streamline law." This module is that gate: it turns a motif (a code-drawn shape) into
// a Puzzle and runs the full proof battery before the puzzle is allowed into the library
// — machine-checked unique solution AND guess-free logical solvability, with the deepest
// technique tier tagged. A motif that fails is a build failure (hard-rule 4), never
// content. Uniqueness is oracle-brute-checked on small grids (studio amendment) and
// implied by the guess-free certificate on larger ones.

import { Puzzle } from './puzzle.js';
import { certify } from './solver.js';
import { deepestTier } from './tiers.js';
import { countSolutions } from './oracle.js';

// Oracle brute-force is bounded (studio amendment: every puzzle <= 10x10). Beyond that,
// a guess-free certificate already proves the deduced grid is the unique forced one.
const ORACLE_MAX = 10;

export function buildPuzzle(motif) {
  const puzzle = motif.puzzle || Puzzle.fromAscii(motif.rows);
  const cert = certify(puzzle);
  const tier = deepestTier(puzzle);

  const oracleEligible = puzzle.width <= ORACLE_MAX && puzzle.height <= ORACLE_MAX;
  let solutionCount = null;
  let unique = null;
  if (oracleEligible) {
    solutionCount = countSolutions(puzzle, 2);
    unique = solutionCount === 1;
  }

  const guessFree = cert.ok;
  // ok requires guess-free, a tier, and (where checked) oracle uniqueness.
  const ok = guessFree && tier !== null && unique !== false;
  let reason;
  if (!guessFree) reason = cert.reason;         // stalled / contradiction / mismatch
  else if (unique === false) reason = 'not-unique';
  else if (tier === null) reason = 'no-tier';
  else reason = 'proved';

  return {
    id: motif.id,
    name: motif.name,
    blurb: motif.blurb,
    puzzle,
    ok,
    reason,
    guessFree,
    unique,             // true / false / null (unchecked-large)
    solutionCount,      // number / null
    oracleChecked: oracleEligible,
    tier: tier ? tier.tier : null,
    tierName: tier ? tier.name : null,
  };
}

// Prove an entire library; returns the built records and a list of any that failed.
export function validateLibrary(motifs) {
  const built = motifs.map(buildPuzzle);
  const failures = built.filter((b) => !b.ok);
  return { built, failures, allProved: failures.length === 0 };
}
