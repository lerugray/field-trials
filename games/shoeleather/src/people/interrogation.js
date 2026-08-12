// SHOELEATHER — interrogation challenges (statement x evidence; DESIGN-SEED 4).
//
// A suspect statement can be CHALLENGED with a statement x evidence pairing. A correct
// challenge (the fact CONTRADICTS the suspect's own statement) LANDS: the statement is
// broken. A WRONG challenge COSTS: the suspect visibly HARDENS (finite tolerance) and
// the murderer COUNTER-MOVES (the case clock advances, a path closes). No closeness
// gradient, no hints — landed or not.
//
// Interrogations are ATOMIC SCENES elsewhere (no mid-scene save); this controller is
// the pure mechanic. Tolerance/refuted/challenged persist in SuspectState across
// visits; the clock persists per case.

export class Interrogation {
  constructor({ suspectId, statements, suspectState, notebook, clock, caseData = null, onEvent = null }) {
    if (!suspectState) throw new TypeError('interrogation needs a SuspectState');
    if (!notebook) throw new TypeError('interrogation needs a notebook');
    if (!clock) throw new TypeError('interrogation needs a CaseClock');
    this.suspectId = suspectId ? String(suspectId) : null;
    this.statements = statements; // array of Statement (this suspect's)
    this.state = suspectState;
    this.notebook = notebook;
    this.clock = clock;
    this.caseData = caseData;
    this.onEvent = onEvent || (() => {});
  }

  // Statements the player can currently challenge: this suspect's, logged (heard), and
  // not already refuted.
  challengeable() {
    return this.statements.filter((s) =>
      (this.suspectId === null || s.speaker === this.suspectId) &&
      this.notebook.has(s.id) && !this.state.isRefuted(s.id));
  }

  // Facts the player has to challenge with (logged fact entries).
  availableEvidence() {
    return this.notebook.entries().filter((e) => e.kind === 'fact').map((e) => e.ref);
  }

  // Challenge a statement with a fact. Returns a result descriptor. LANDED when the
  // fact contradicts the statement; otherwise the suspect hardens and counter-moves.
  challenge(statementId, factId) {
    const stmt = this.statements.find((s) => s.id === String(statementId));
    if (!stmt) return this._refuse('no such statement', { statementId });
    if (this.suspectId !== null && stmt.speaker !== this.suspectId) return this._refuse('not this suspect\'s statement', { statementId });
    if (!this.notebook.has(stmt.id)) return this._refuse('you have not heard that statement yet', { statementId });
    if (this.state.isRefuted(stmt.id)) return this._refuse('already broken', { statementId });

    const factEntry = this.notebook.get(factId);
    if (!factEntry || factEntry.kind !== 'fact') return this._refuse('you have no such evidence in hand', { factId });
    const fact = factEntry.ref;

    // A hostile (fully hardened) suspect will not engage until relaxed (afterthought).
    if (this.state.hardened) {
      this.onEvent({ type: 'shut-down', suspect: this.suspectId });
      return { type: 'refused', reason: 'the suspect has shut down; come back later', posture: this.state.posture() };
    }

    this.state.markChallenged(stmt.id);

    if (stmt.refutedBy(fact)) {
      this.state.markRefuted(stmt.id);
      this.onEvent({ type: 'landed', statement: stmt, fact, posture: this.state.posture() });
      return { type: 'landed', statement: stmt, fact, posture: this.state.posture() };
    }

    // Wrong: harden + counter-move (case clock advances).
    this.state.harden();
    let counterMove = null;
    try { counterMove = this.clock.advance(this.caseData); }
    catch (err) { this.onEvent({ type: 'error', message: err.message }); }
    this.onEvent({ type: 'failed', statement: stmt, fact, posture: this.state.posture(), counterMove });
    if (counterMove) this.onEvent({ type: 'counter-move', counterMove });
    return { type: 'failed', posture: this.state.posture(), counterMove, hardened: this.state.hardened };
  }

  _refuse(reason, data) {
    this.onEvent({ type: 'invalid', reason, ...data });
    return { type: 'invalid', reason };
  }
}
