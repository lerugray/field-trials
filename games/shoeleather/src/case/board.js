// SHOELEATHER — the accusation board (THE GOTCHA, DESIGN-SEED 5).
//
// A SLOTTED ASSERTION filled from PINNED notebook facts:
//   [SUSPECT] killed [VICTIM] by [MEANS] at [TIME/PLACE];
//   the alibi fails because [FACT] contradicts [STATEMENT]; proven by [EVIDENCE].
//
// Chains validate on fact identity AND suspect binding (validateChain). A wrong
// submission gets ONE UNIFORM in-register deflection line (NO closeness gradient,
// ever) and advances the case clock: the murderer counter-moves and remaining paths
// get harder. No attempt cap. The case closes only on the exact chain.
//
// The board is an ATOMIC scene (no saving inside it) — the engine enforces that.

import { validateChain, accusation, CHAIN_FACT_SLOTS } from './case.js';

// The single deflection. Same line every time — no hint about how close you were.
export const DEFLECTION = 'That is a theory, Lieutenant. It is not a case. We are finished here.';

export const BOARD_SLOTS = Object.freeze(['suspect', 'means', 'time', 'place', 'alibiMechanism', 'prologueFact', 'contradictedStatement', 'corroboration', 'physicalContradiction']);
const FACT_SLOTS = new Set(CHAIN_FACT_SLOTS);

export class AccusationBoard {
  constructor({ caseData, notebook, clock, onEvent = null }) {
    if (!caseData) throw new TypeError('board needs case data');
    if (!notebook) throw new TypeError('board needs a notebook');
    if (!clock) throw new TypeError('board needs a case clock');
    this.caseData = caseData;
    this.notebook = notebook;
    this.clock = clock;
    this.onEvent = onEvent || (() => {});
    this.victim = caseData.victim;
    this.slots = Object.fromEntries(BOARD_SLOTS.map((slot) => [slot, null]));
    this.attempts = 0;
    this.solved = false;
  }

  // Candidates offered for a slot. Fact/statement slots draw ONLY from PINNED notebook
  // entries (you must decide something matters before you can assert it). The suspect
  // slot draws from the case's named suspects.
  candidatesFor(slot) {
    if (slot === 'suspect') return this.caseData.accusableSuspects().map((s) => ({ id: s.id, label: s.name }));
    if (slot === 'contradictedStatement') {
      return this.notebook.pinned().filter((e) => e.kind === 'statement').map((e) => ({ id: e.id, label: '"' + e.text() + '"' }));
    }
    if (FACT_SLOTS.has(slot)) {
      return this.notebook.pinned().filter((e) => e.kind === 'fact').map((e) => ({ id: e.id, label: e.text() || e.id }));
    }
    throw new RangeError(`unknown board slot "${slot}"`);
  }

  set(slot, id) {
    if (!(slot in this.slots)) throw new RangeError(`unknown board slot "${slot}"`);
    this.slots[slot] = id === null ? null : String(id);
    this.onEvent({ type: 'slot', slot, id: this.slots[slot] });
    return this.slots[slot];
  }

  clear(slot) { return this.set(slot, null); }

  isComplete() { return BOARD_SLOTS.every((s) => this.slots[s] !== null); }

  victimName() {
    const victim = this.caseData.suspect(this.victim);
    if (!victim) throw new Error(`victim "${this.victim}" has no display-name fixture`);
    return victim.name;
  }

  chain() {
    return accusation({ ...this.slots, victim: this.victim });
  }

  // Submit the assembled chain. Exact chain -> solved. Otherwise ONE uniform
  // deflection and the clock advances (a counter-move). No closeness gradient.
  //
  // `trap` requests the TRAP ending (DESIGN-SEED 6): the assembled chain PLUS staging
  // an in-fiction demonstration that forces the confession. The chain must still be
  // exact; the trap only changes the ENDING (a superior one), never the validity bar.
  submit(trap = false) {
    if (!this.isComplete()) {
      const missing = BOARD_SLOTS.filter((s) => this.slots[s] === null);
      const reason = 'The board is not finished. Every slot must be filled from your PINNED notes.';
      this.onEvent({ type: 'incomplete', missing, reason });
      return { type: 'incomplete', missing, reason };
    }
    const unpinned = [];
    for (const slot of [...CHAIN_FACT_SLOTS, 'contradictedStatement']) {
      if (!this.notebook.isPinned(this.slots[slot])) unpinned.push(slot);
    }
    if (unpinned.length > 0) {
      const reason = `The board cannot be submitted. Pin these slots from your notebook first: ${unpinned.join(', ')}.`;
      this.onEvent({ type: 'invalid', unpinned, reason });
      return { type: 'invalid', unpinned, reason };
    }
    this.attempts++;
    const result = validateChain(this.caseData, this.chain());
    if (result.valid) {
      this.solved = true;
      const variant = (trap && this.caseData.trap) ? 'trap' : 'staged';
      this.onEvent({ type: 'solved', chain: this.chain(), variant });
      return { type: 'solved', chain: this.chain(), variant };
    }
    let counterMove = null;
    try { counterMove = this.clock.advance(this.caseData); }
    catch (err) { this.onEvent({ type: 'error', message: err.message }); }
    this.onEvent({ type: 'deflected', line: DEFLECTION, counterMove });
    return { type: 'deflected', line: DEFLECTION, counterMove };
  }
}
