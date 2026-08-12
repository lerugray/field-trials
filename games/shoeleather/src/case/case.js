// SHOELEATHER — the case model + accusation-chain validation.
//
// A Case bundles the typed facts, suspect statements, documents, the ONE winning
// accusation chain, and a curated near-miss set. The GOTCHA board (DESIGN-SEED 5) is
// a SLOTTED ASSERTION:
//
//   [SUSPECT] killed [VICTIM] by [MEANS] at [TIME], in [PLACE];
//   [ALIBI MECHANISM] fails because [PROLOGUE FACT] contradicts [STATEMENT],
//   corroborated by [DOCUMENT/WITNESS], with [PHYSICAL CONTRADICTION].
//
// Chains validate on FACT IDENTITY and SUSPECT BINDING (the alibi must be the
// suspect's OWN statement; the proving evidence must bind the suspect to the act).
// This predicate is what the solver enumerates over to prove reachability + a UNIQUE
// winning chain, and what a wrong submission fails against (one uniform deflection).

import { Fact, Statement } from './fact.js';

export class Case {
  constructor(spec) {
    if (!spec || !spec.id) throw new TypeError('Case needs an id');
    this.id = String(spec.id);
    this.title = spec.title ? String(spec.title) : this.id;
    this.victim = String(spec.victim);
    this.suspects = (spec.suspects || []).map((s) => ({
      id: String(s.id), name: String(s.name || s.id), accusable: s.accusable !== false,
    }));
    this.endingWitnesses = (spec.endingWitnesses || []).map(String);
    this._facts = new Map();
    this._statements = new Map();
    for (const f of spec.facts || []) this.addFact(f instanceof Fact ? f : new Fact(f));
    for (const s of spec.statements || []) this.addStatement(s instanceof Statement ? s : new Statement(s));
    this.documents = spec.documents || {};
    this.winningChain = spec.winningChain || null;
    this.nearMisses = spec.nearMisses || [];
    // M2: ordered counter-moves (murderer's responses to wrong moves) and dialogue
    // trees per suspect. Both feed the solver's challenge-order + dialogue checks.
    this.counterMoves = spec.counterMoves || [];
    this.dialogues = spec.dialogues || {};
    this.prologue = spec.prologue || null; // M3: play-as-the-murderer tutorial + key
  }

  addFact(f) {
    const fact = f instanceof Fact ? f : new Fact(f);
    if (this._facts.has(fact.id)) throw new Error(`duplicate fact id "${fact.id}"`);
    this._facts.set(fact.id, fact);
    return fact;
  }

  addStatement(s) {
    const st = s instanceof Statement ? s : new Statement(s);
    if (this._statements.has(st.id)) throw new Error(`duplicate statement id "${st.id}"`);
    this._statements.set(st.id, st);
    return st;
  }

  fact(id) { return this._facts.get(String(id)) || null; }
  statement(id) { return this._statements.get(String(id)) || null; }
  suspect(id) { return this.suspects.find((s) => s.id === String(id)) || null; }
  accusableSuspects() { return this.suspects.filter((s) => s.accusable); }

  get facts() { return [...this._facts.values()]; }
  get statements() { return [...this._statements.values()]; }
  chainFacts() { return this.facts.filter((f) => f.role === 'chain'); }
  factsForChainSlot(slot) { return this.chainFacts().filter((f) => f.chainSlot === String(slot)); }
  redHerrings() { return this.facts.filter((f) => f.isRedHerring()); }
}

// A filled accusation. Slot values reference case ids (facts/statements/suspects) plus
// the victim value, so every slot is fact-identity checkable.
export const CHAIN_FACT_SLOTS = Object.freeze([
  'means', 'time', 'place', 'alibiMechanism', 'prologueFact', 'corroboration', 'physicalContradiction',
]);

export function accusation({ suspect, victim, means, time, place, alibiMechanism, prologueFact, contradictedStatement, corroboration, physicalContradiction }) {
  return { suspect, victim, means, time, place, alibiMechanism, prologueFact, contradictedStatement, corroboration, physicalContradiction };
}

// Validate a filled chain against a case. Returns { valid, reasons }. `known`
// optionally gates on reachability (only facts/statements the player could have
// acquired); omit to validate against the full case (used for uniqueness enumeration).
export function validateChain(caseObj, chain, known = null) {
  const reasons = [];
  const knownFact = (id) => !known || known.factIds.has(String(id));
  const knownStmt = (id) => !known || known.statementIds.has(String(id));

  const suspect = caseObj.accusableSuspects().find((s) => s.id === String(chain.suspect)) || null;
  if (!suspect) reasons.push(`suspect "${chain.suspect}" is not in this case`);
  if (String(chain.victim) !== caseObj.victim) reasons.push(`victim "${chain.victim}" is not the victim`);

  const stmt = caseObj.statement(chain.contradictedStatement);
  if (!stmt) reasons.push(`statement "${chain.contradictedStatement}" does not exist`);
  else {
    if (!knownStmt(stmt.id)) reasons.push(`statement "${stmt.id}" not yet acquired`);
    if (stmt.speaker !== chain.suspect) reasons.push(`statement "${stmt.id}" is not the suspect's own alibi (suspect binding)`);
  }

  const alibi = caseObj.fact(chain.prologueFact);
  if (!alibi) reasons.push(`prologue-keyed fact "${chain.prologueFact}" does not exist`);
  else {
    if (!knownFact(alibi.id)) reasons.push(`fact "${alibi.id}" not yet acquired`);
    if (!alibi.prologueKeyed) reasons.push(`fact "${alibi.id}" is not prologue-keyed`);
    if (!stmt || !alibi.contradicts(stmt.claim)) {
      reasons.push(`fact "${chain.prologueFact}" does not contradict statement "${chain.contradictedStatement}"`);
    }
  }

  for (const slot of CHAIN_FACT_SLOTS) {
    const id = chain[slot];
    const f = caseObj.fact(id);
    if (!f) { reasons.push(`${slot} fact "${id}" does not exist`); continue; }
    if (!knownFact(f.id)) reasons.push(`${slot} fact "${f.id}" not yet acquired`);
    if (f.role !== 'chain') reasons.push(`${slot} fact "${f.id}" is a red herring, not load-bearing`);
    if (f.chainSlot !== slot) reasons.push(`${slot} fact "${f.id}" is not tagged for that load-bearing slot`);
  }

  for (const slot of ['means', 'time', 'place']) {
    const f = caseObj.fact(chain[slot]);
    if (f && f.claim.subject !== caseObj.victim) reasons.push(`${slot} fact "${f.id}" is not bound to the victim`);
  }
  for (const slot of ['alibiMechanism', 'prologueFact', 'physicalContradiction']) {
    const f = caseObj.fact(chain[slot]);
    if (f && f.claim.subject !== chain.suspect) reasons.push(`${slot} fact "${f.id}" does not bind the suspect`);
  }
  const corroboration = caseObj.fact(chain.corroboration);
  if (corroboration && !corroboration.tags.some((t) => t === 'document' || t === 'witness')) {
    reasons.push(`corroboration fact "${corroboration.id}" is not sourced to a document or witness`);
  }

  // Every load-bearing fact slot must be a DISTINCT fact.
  const factSlots = CHAIN_FACT_SLOTS.map((slot) => chain[slot]).map(String);
  if (new Set(factSlots).size !== factSlots.length) reasons.push('a single fact fills more than one slot');

  return { valid: reasons.length === 0, reasons };
}
