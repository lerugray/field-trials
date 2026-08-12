// SHOELEATHER — the CASE SOLVER (the QA spine; SOLVER LAW, non-negotiable).
//
// From M1 onward the repo carries a headless solver run by `node --test`. This is its
// FIRST form (M1 scope): it walks the REAL case data and proves, per case:
//   - REACHABILITY: the winning chain validates from acquirable facts, and every
//     chain-required fact has >= 2 independent acquisition paths (ALWAYS-SOLVABLE law).
//   - UNIQUENESS: enumerating ALL chains buildable from the case, EXACTLY ONE validates
//     (loud failure on zero or more than one), and it is the declared winning chain.
//   - NEAR-MISS REJECTION: every curated plausible-wrong chain fails validation.
//   - ORPHAN LINTER: every fact is chain-relevant or explicitly red-herring tagged.
//
// Challenge-order fuzzing and dialogue reachability join the battery in M2 (they need
// the dialogue engine). A case with no passing solver run DOES NOT EXIST (rule 3).

import { validateChain, CHAIN_FACT_SLOTS } from './case.js';
import { CaseClock } from '../people/case-clock.js';

export function chainKey(c) {
  return [c.suspect, c.victim, ...CHAIN_FACT_SLOTS.map((slot) => c[slot]), c.contradictedStatement]
    .map(String).join('~');
}

// All facts/statements a player could acquire (>=1 path); the reachability frontier.
function acquirable(caseObj) {
  return {
    factIds: new Set(caseObj.facts.filter((f) => f.acquisitionPaths.length >= 1).map((f) => f.id)),
    statementIds: new Set(caseObj.statements.map((s) => s.id)),
  };
}

export function checkReachability(caseObj) {
  const problems = [];
  for (const f of caseObj.chainFacts()) {
    if (f.acquisitionPaths.length < 2) {
      problems.push(`fact "${f.id}" is chain-required but has ${f.acquisitionPaths.length} acquisition path(s); the always-solvable law needs >= 2`);
    }
  }
  if (!caseObj.winningChain) {
    problems.push('case has no declared winning chain');
  } else {
    const res = validateChain(caseObj, caseObj.winningChain, acquirable(caseObj));
    if (!res.valid) problems.push(`winning chain is not reachable/valid: ${res.reasons.join('; ')}`);
  }
  return problems;
}

// Enumerate every chain buildable from the case's facts/statements that VALIDATES.
export function enumerateValidChains(caseObj) {
  const valid = [];
  const stmtIds = caseObj.statements.map((s) => s.id);
  const slotCandidates = CHAIN_FACT_SLOTS.map((slot) => caseObj.factsForChainSlot(slot).map((f) => f.id));
  const visit = (chain, depth) => {
    if (depth === CHAIN_FACT_SLOTS.length) {
      if (validateChain(caseObj, chain).valid) valid.push({ ...chain });
      return;
    }
    const slot = CHAIN_FACT_SLOTS[depth];
    for (const id of slotCandidates[depth]) visit({ ...chain, [slot]: id }, depth + 1);
  };
  for (const suspect of caseObj.accusableSuspects().map((s) => s.id)) {
    for (const contradictedStatement of stmtIds) {
      visit({ suspect, victim: caseObj.victim, contradictedStatement }, 0);
    }
  }
  return valid;
}

export function checkUniqueness(caseObj) {
  const problems = [];
  const valid = enumerateValidChains(caseObj);
  const keys = new Set(valid.map(chainKey));
  if (keys.size === 0) {
    problems.push('NO valid accusation chain exists (case is unwinnable)');
  } else if (keys.size > 1) {
    problems.push(`case has ${keys.size} valid chains; exactly one is required:\n  ${[...keys].join('\n  ')}`);
  } else if (caseObj.winningChain && chainKey(valid[0]) !== chainKey(caseObj.winningChain)) {
    problems.push(`the unique valid chain is not the declared winning chain:\n  found:   ${chainKey(valid[0])}\n  declared:${chainKey(caseObj.winningChain)}`);
  }
  return problems;
}

export function checkNearMisses(caseObj) {
  const problems = [];
  (caseObj.nearMisses || []).forEach((nm, i) => {
    const res = validateChain(caseObj, nm);
    if (res.valid) problems.push(`near-miss #${i} unexpectedly VALIDATES (should reject): ${chainKey(nm)}`);
  });
  return problems;
}

export function checkOrphans(caseObj) {
  const problems = [];
  const wc = caseObj.winningChain;
  const usedFactIds = wc ? new Set(CHAIN_FACT_SLOTS.map((slot) => wc[slot]).map(String)) : new Set();
  for (const f of caseObj.facts) {
    if (f.isRedHerring()) continue;                 // explicitly tagged, allowed
    if (!usedFactIds.has(f.id)) {
      problems.push(`orphan fact "${f.id}": chain-role but not used by the winning chain and not red-herring tagged`);
    }
  }
  // Documents (if any) must tie to a fact or carry a red-herring tag.
  for (const [id, doc] of Object.entries(caseObj.documents || {})) {
    const linked = doc && (doc.linkedFact || doc.redHerring);
    if (!linked) problems.push(`orphan document "${id}": no linked fact and no red-herring tag`);
  }
  return problems;
}

// CHALLENGE-ORDER FUZZ (SOLVER LAW): no order of challenges can strand the win. Wrong
// challenges advance the case clock (each closing an acquisition path). The worst case
// for the player is that EVERY counter-move fires; it dominates all orderings. We fire
// them all (the last-path guard throws if any move would strand a fact) and assert the
// winning chain's facts remain acquirable afterward.
export function checkChallengeOrderFuzz(caseObj) {
  const problems = [];
  const clock = new CaseClock({ counterMoves: caseObj.counterMoves || [] });
  for (let i = 0; i < (caseObj.counterMoves || []).length; i++) {
    try { clock.advance(caseObj); }
    catch (err) { problems.push(`counter-move sequence violates always-solvable: ${err.message}`); }
  }
  const wc = caseObj.winningChain;
  if (wc) {
    for (const slot of CHAIN_FACT_SLOTS) {
      const f = caseObj.fact(wc[slot]);
      if (f && !clock.isFactAcquirable(f)) {
        problems.push(`after all counter-moves, winning-chain fact "${f.id}" (${slot}) is unreachable`);
      }
    }
    // The core contradiction must still hold regardless of challenge order.
    const alibi = caseObj.fact(wc.prologueFact);
    const stmt = caseObj.statement(wc.contradictedStatement);
    if (alibi && stmt && !alibi.contradicts(stmt.claim)) {
      problems.push('the winning contradiction no longer holds');
    }
  }
  return problems;
}

// DIALOGUE REACHABILITY (SOLVER LAW): every dialogue node reachable from root, no dead
// ends, no dangling targets, known guard/effect types.
export function checkDialogueReachability(caseObj) {
  const problems = [];
  for (const [id, tree] of Object.entries(caseObj.dialogues || {})) {
    for (const p of tree.validate()) problems.push(`dialogue "${id}": ${p}`);
  }
  return problems;
}

// PROLOGUE-KEY LAW: if the case has a prologue, its beats must be tutorial-complete AND
// the winning chain must rest on at least one PROLOGUE-KEYED fact (a reading only the
// prologue makes possible). Cases without a prologue skip this check.
export function checkPrologueKey(caseObj) {
  const problems = [];
  if (!caseObj.prologue) return problems;
  for (const p of caseObj.prologue.validate()) problems.push(`prologue: ${p}`);
  const wc = caseObj.winningChain;
  if (wc) {
    const usesKeyed = CHAIN_FACT_SLOTS
      .map((slot) => caseObj.fact(wc[slot]))
      .some((f) => f && f.prologueKeyed);
    if (!usesKeyed) problems.push('winning chain uses no prologue-keyed fact (prologue-key law)');
  }
  return problems;
}

// RED-HERRING HONESTY (M5 fairness): a red herring must be a true fact that does NOT
// bear on the lie. We prove non-load-bearing mechanically: substituting any red-herring
// fact into ANY fact slot of the winning chain must INVALIDATE it. If a red herring can
// stand in for a load-bearing fact, it is not honest — it is a second solution in
// disguise.
export function checkRedHerringHonesty(caseObj) {
  const problems = [];
  const wc = caseObj.winningChain;
  if (!wc) return problems;
  for (const rh of caseObj.redHerrings()) {
    for (const slot of CHAIN_FACT_SLOTS) {
      const candidate = { ...wc, [slot]: rh.id };
      if (validateChain(caseObj, candidate).valid) {
        problems.push(`red herring "${rh.id}" is load-bearing in slot "${slot}" (not an honest herring)`);
      }
    }
  }
  return problems;
}

// NO-PROGRESS-LEAK (M5): the case must not leak how close a wrong guess was. We assert
// there is a curated near-miss set that covers the main failure modes (wrong suspect,
// non-contradicting alibi, red-herring proof) so wrong chains are known to reject
// UNIFORMLY. The uniform deflection itself is a code invariant (board.js).
export function checkNoProgressLeak(caseObj) {
  const problems = [];
  const nm = caseObj.nearMisses || [];
  if (caseObj.winningChain && nm.length < 3) {
    problems.push(`near-miss set is thin (${nm.length}); expand it so wrong chains are known to reject`);
  }
  return problems;
}

export const BLIND_SPACE_FLOOR = 1_000_000;
export const BLIND_PROBE_BUDGET = 50_000;

// Every fact dropdown intentionally contains every pinned fact. This is the actual
// blind-grind surface when the player pins the whole notebook, not the solver's
// slot-tag-pruned uniqueness search.
export function accusationSpaceSize(caseObj) {
  return caseObj.accusableSuspects().length * caseObj.statements.length *
    Math.pow(caseObj.facts.length, CHAIN_FACT_SLOTS.length);
}

export function checkDegenerateSpace(caseObj) {
  const size = accusationSpaceSize(caseObj);
  return size < BLIND_SPACE_FLOOR
    ? [`blind accusation space is ${size}; floor is ${BLIND_SPACE_FLOOR}`]
    : [];
}

function chainAtOrdinal(caseObj, ordinal) {
  const facts = caseObj.facts.map((f) => f.id);
  const statements = caseObj.statements.map((s) => s.id);
  let n = ordinal;
  const contradictedStatement = statements[n % statements.length]; n = Math.floor(n / statements.length);
  const values = {};
  for (let i = CHAIN_FACT_SLOTS.length - 1; i >= 0; i--) {
    values[CHAIN_FACT_SLOTS[i]] = facts[n % facts.length]; n = Math.floor(n / facts.length);
  }
  const suspects = caseObj.accusableSuspects();
  const suspect = suspects[n % suspects.length].id;
  return { suspect, victim: caseObj.victim, ...values, contradictedStatement };
}

// Empirical null-strategy probe: make real validation calls for a large deterministic
// prefix and an equally large session-seeded pseudo-random sample. Neither receives
// closeness feedback, and neither may close inside the bounded grind budget.
export function probeDegenerateStrategy(caseObj, { budget = BLIND_PROBE_BUDGET, seed = 0x51A7E } = {}) {
  const space = accusationSpaceSize(caseObj);
  let enumeratedClosedAt = null;
  for (let i = 0; i < Math.min(budget, space); i++) {
    if (validateChain(caseObj, chainAtOrdinal(caseObj, i)).valid) { enumeratedClosedAt = i + 1; break; }
  }
  let randomClosedAt = null;
  let state = seed >>> 0;
  for (let i = 0; i < budget; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const ordinal = state % space;
    if (validateChain(caseObj, chainAtOrdinal(caseObj, ordinal)).valid) { randomClosedAt = i + 1; break; }
  }
  return { space, budget, enumeratedClosedAt, randomClosedAt };
}

// The full per-case battery. Grows with every system (SOLVER LAW). M2 adds the
// challenge-order fuzz and dialogue reachability; M5 adds fairness audits.
export function runCaseBattery(caseObj) {
  const sections = {
    reachability: checkReachability(caseObj),
    uniqueness: checkUniqueness(caseObj),
    nearMisses: checkNearMisses(caseObj),
    orphans: checkOrphans(caseObj),
    challengeOrder: checkChallengeOrderFuzz(caseObj),
    dialogue: checkDialogueReachability(caseObj),
    prologueKey: checkPrologueKey(caseObj),
    redHerringHonesty: checkRedHerringHonesty(caseObj),
    noProgressLeak: checkNoProgressLeak(caseObj),
    degenerateSpace: checkDegenerateSpace(caseObj),
  };
  const problems = Object.values(sections).flat();
  return { passed: problems.length === 0, sections, problems };
}

// Gate helper: throw loudly with the full report if the case is not solvable.
export function assertCaseSolvable(caseObj) {
  const report = runCaseBattery(caseObj);
  if (!report.passed) {
    throw new Error(`SOLVER LAW FAILED for case "${caseObj.id}":\n- ${report.problems.join('\n- ')}`);
  }
  return report;
}
