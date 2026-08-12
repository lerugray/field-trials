// SHOELEATHER — per-suspect state (persists across visits).
//
// DESIGN-SEED M2: dialogue has PERSISTENT visit state; tolerance and statement logs
// persist across visits; suspects RELAX after time spent elsewhere (a visit-count
// timer). Suspect state is DIEGETIC (portrait posture stages, never numbers) — this
// object holds the numbers; the renderer maps posture() to a portrait tell.
//
// Tolerance counts DOWN from maxTolerance as the suspect HARDENS on wrong challenges.
// Relaxation restores some tolerance once the player has spent enough turns elsewhere.

export const POSTURES = Object.freeze(['open', 'guarded', 'defensive', 'hostile']);

export class SuspectState {
  constructor({ maxTolerance = 3 } = {}) {
    this.maxTolerance = maxTolerance;
    this.tolerance = maxTolerance;     // hardening drains this toward 0
    this.visitCount = 0;
    this.seenNodes = new Set();        // dialogue nodes visited (across all visits)
    this.challenged = new Set();       // statement ids already challenged (any outcome)
    this.refuted = new Set();          // statement ids successfully broken by evidence
    this.leftAtTick = null;            // world tick when the player last left this suspect
    this.hardenedThisVisit = 0;        // wrong challenges landed this visit
    this.afterthoughtArmed = false;    // set on re-entering a relaxed suspect (per visit)
  }

  beginVisit() { this.visitCount++; this.hardenedThisVisit = 0; return this.visitCount; }

  // The afterthought question: armed when the player re-enters a suspect who has
  // relaxed while they were away. It "hits harder" — an afterthought-guarded dialogue
  // line opens that the suspect would otherwise resist. Cleared when the visit ends.
  armAfterthought() { this.afterthoughtArmed = true; }
  disarmAfterthought() { this.afterthoughtArmed = false; }
  leave(tick) { this.leftAtTick = tick; }

  markSeen(nodeId) { this.seenNodes.add(String(nodeId)); }
  isSeen(nodeId) { return this.seenNodes.has(String(nodeId)); }

  // A wrong challenge hardens the suspect: tolerance drops, posture stiffens.
  harden() {
    this.tolerance = Math.max(0, this.tolerance - 1);
    this.hardenedThisVisit++;
    return this.tolerance;
  }
  get hardened() { return this.tolerance <= 0; }

  // The suspect relaxes if enough turns have passed since the player left. Returns the
  // amount recovered (0 if not due). The afterthought-question mechanic fires when a
  // relaxed suspect is re-entered.
  relaxIfDue(currentTick, threshold = 3, recover = 1) {
    if (this.leftAtTick === null) return 0;
    if (currentTick - this.leftAtTick < threshold) return 0;
    const before = this.tolerance;
    this.tolerance = Math.min(this.maxTolerance, this.tolerance + recover);
    this.leftAtTick = null;
    return this.tolerance - before;
  }

  // Diegetic posture stage from the tolerance ratio (renderer picks a portrait tell).
  posture() {
    const r = this.maxTolerance === 0 ? 0 : this.tolerance / this.maxTolerance;
    if (r >= 0.99) return 'open';
    if (r > 0.5) return 'guarded';
    if (r > 0) return 'defensive';
    return 'hostile';
  }

  markChallenged(statementId) { this.challenged.add(String(statementId)); }
  hasChallenged(statementId) { return this.challenged.has(String(statementId)); }
  markRefuted(statementId) { this.refuted.add(String(statementId)); }
  isRefuted(statementId) { return this.refuted.has(String(statementId)); }

  toJSON() {
    return {
      maxTolerance: this.maxTolerance, tolerance: this.tolerance, visitCount: this.visitCount,
      seenNodes: [...this.seenNodes], challenged: [...this.challenged], refuted: [...this.refuted],
      leftAtTick: this.leftAtTick,
    };
  }

  static fromJSON(obj) {
    const s = new SuspectState({ maxTolerance: obj?.maxTolerance ?? 3 });
    if (obj) {
      s.tolerance = obj.tolerance ?? s.maxTolerance;
      s.visitCount = obj.visitCount ?? 0;
      s.seenNodes = new Set(obj.seenNodes || []);
      s.challenged = new Set(obj.challenged || []);
      s.refuted = new Set(obj.refuted || []);
      s.leftAtTick = obj.leftAtTick ?? null;
    }
    return s;
  }
}
