// SHOELEATHER — the prologue (play AS THE MURDERER; DESIGN-SEED 1).
//
// A short, interactive, FORCED-LINEAR sequence where the player performs the murder
// and cover-up. It is also the TUTORIAL: it exercises every core verb once and
// includes one STAKES-FREE challenge rep (challenge the cover-up's own witness).
//
// PROLOGUE-KEY LAW: each case's winning chain requires at least one PROLOGUE-KEYED
// reading — a clue whose correct interpretation depends on something only witnessed
// here. The prologue is the knowledge asymmetry, not a mood cutscene. A beat may be
// flagged prologueKey; the solver checks the winning chain uses a prologue-keyed fact.

// The core verbs a prologue must exercise (tutorial completeness).
export const CORE_VERBS = Object.freeze(['look', 'take', 'move', 'use', 'talk', 'challenge']);

export class PrologueBeat {
  constructor({ id, prose, verb, action, prologueKey = false, stakesFree = false, killBeat = false }) {
    if (!id) throw new TypeError('prologue beat needs an id');
    if (!CORE_VERBS.includes(verb)) throw new RangeError(`beat ${id}: unknown verb "${verb}"`);
    this.id = String(id);
    this.prose = String(prose || '');
    this.verb = verb;
    this.action = String(action || 'Continue');
    this.prologueKey = !!prologueKey;   // this beat plants the asymmetric knowledge
    this.stakesFree = !!stakesFree;     // a rehearsal (e.g. the challenge rep) that cannot fail
    this.killBeat = !!killBeat;         // presentation-only emphasis; authored prose is untouched
  }
}

export class Prologue {
  constructor({ id, beats = [], card = null }) {
    this.id = String(id);
    this.card = card ? Object.freeze({
      act: String(card.act || ''), timestamp: String(card.timestamp || ''), line: String(card.line || ''),
    }) : null;
    this.beats = beats.map((b) => (b instanceof PrologueBeat ? b : new PrologueBeat(b)));
    if (this.beats.length === 0) throw new Error(`prologue "${id}" has no beats`);
  }

  // Tutorial-completeness + shape checks (a solver-style linter for the prologue).
  validate() {
    const problems = [];
    const verbs = new Set(this.beats.map((b) => b.verb));
    for (const v of CORE_VERBS) if (!verbs.has(v)) problems.push(`prologue "${this.id}" never exercises the "${v}" verb`);
    if (!this.beats.some((b) => b.verb === 'challenge' && b.stakesFree)) {
      problems.push(`prologue "${this.id}" lacks a stakes-free challenge rep`);
    }
    if (!this.beats.some((b) => b.prologueKey)) {
      problems.push(`prologue "${this.id}" plants no prologue-key beat`);
    }
    return problems;
  }

  hasPrologueKey() { return this.beats.some((b) => b.prologueKey); }
}

// Walks the prologue beat by beat (forced-linear). No choices, no failure (except the
// stakes-free challenge, which teaches the verb without cost).
export class PrologueRunner {
  constructor(prologue, { onEvent = null } = {}) {
    this.prologue = prologue;
    this.index = 0;
    this.done = false;
    this.onEvent = onEvent || (() => {});
  }

  current() { return this.done ? null : this.prologue.beats[this.index]; }

  // Perform the current beat's action and advance. Returns the next beat, or null at
  // the end (prologue complete).
  advance() {
    if (this.done) return null;
    const beat = this.prologue.beats[this.index];
    this.onEvent({ type: 'beat-done', beat });
    this.index++;
    if (this.index >= this.prologue.beats.length) {
      this.done = true;
      this.onEvent({ type: 'complete' });
      return null;
    }
    const next = this.prologue.beats[this.index];
    this.onEvent({ type: 'beat', beat: next });
    return next;
  }

  progress() { return { at: Math.min(this.index, this.prologue.beats.length), total: this.prologue.beats.length }; }
}
