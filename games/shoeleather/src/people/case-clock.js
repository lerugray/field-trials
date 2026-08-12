// SHOELEATHER — the case clock + counter-moves (DESIGN-SEED 5).
//
// A wrong challenge or a wrong accusation ADVANCES THE CASE CLOCK: the murderer
// counter-moves and remaining paths get harder. Counter-moves are an ordered list per
// case; each advance applies the next one, which typically CLOSES one acquisition path
// of a fact. ALWAYS-SOLVABLE LAW: a counter-move may never close a fact's LAST open
// path — it routes to a harder substitute, never to deletion of the last path. This
// object enforces that invariant against the case so a wrong move can never soft-lock.

export class CaseClock {
  // counterMoves: ordered [{ id, closesPath, describe }]. closesPath is an acquisition
  // path label the murderer removes; describe is in-register prose for the event log.
  constructor({ counterMoves = [] } = {}) {
    this.counterMoves = counterMoves.map((c) => ({ id: String(c.id), closesPath: c.closesPath || null, describe: c.describe || '' }));
    this.count = 0;
    this.closedPaths = new Set();
  }

  // Advance the clock by one counter-move. `caseObj` (optional) enforces the always-
  // solvable invariant: refuse to close a path that is a fact's last open one.
  advance(caseObj = null) {
    this.count++;
    const cm = this.counterMoves[this.count - 1] || null;
    if (cm && cm.closesPath) {
      if (caseObj && this._wouldStrand(caseObj, cm.closesPath)) {
        throw new Error(`counter-move "${cm.id}" would close the last path to a fact (always-solvable law)`);
      }
      this.closedPaths.add(cm.closesPath);
    }
    return cm;
  }

  isPathClosed(path) { return this.closedPaths.has(String(path)); }

  // Open acquisition paths remaining for a fact (its paths minus the closed ones).
  openPaths(fact) { return fact.acquisitionPaths.filter((p) => !this.closedPaths.has(p)); }

  // A fact is still acquirable if at least one of its paths is open.
  isFactAcquirable(fact) { return this.openPaths(fact).length >= 1; }

  _wouldStrand(caseObj, path) {
    for (const f of caseObj.facts) {
      if (!f.acquisitionPaths.includes(path)) continue;
      const openAfter = f.acquisitionPaths.filter((p) => p !== path && !this.closedPaths.has(p));
      if (openAfter.length === 0) return true; // this path is the fact's last one
    }
    return false;
  }

  toJSON() { return { count: this.count, closedPaths: [...this.closedPaths] }; }

  static fromJSON(obj, counterMoves = []) {
    const c = new CaseClock({ counterMoves });
    if (obj) { c.count = obj.count || 0; c.closedPaths = new Set(obj.closedPaths || []); }
    return c;
  }
}
