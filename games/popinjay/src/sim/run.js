// run.js — the RUN / TOUR state (DESIGN-SEED §The loop): a run = 3 locales × 4 stages
// (each locale's 4th a centerpiece), then the Panic Finale. The Run spans many per-
// stage `World`s and carries the cross-stage meta: the souvenir loadout, banked
// prize tickets, cumulative prestige SCORE, and the run stats the scorecard reads.
// Pure sim — no renderer. The ticket economy is CONVEX (per DESIGN-SEED, the M4 farm
// probe is a build gate: a full run must out-earn a suicide-farm ≥1.5× tickets/min).

import { Stream } from '../engine/streams.js';
import { hashInt } from '../engine/prng.js';
import { draftableAt } from './catalog.js';

export const LOCALES = 3;
export const STAGES_PER_LOCALE = 4;
export const LOCALE_TICKETS = [1, 3, 6]; // per stage-clear, by locale (convex)
export const DRAFT_SIZE = 3;

export class Run {
  constructor({ seed = 1 } = {}) {
    this.seed = seed >>> 0;
    this.locale = 1;
    this.stage = 1;
    this.tickets = 0;
    this.score = 0;              // run-scoped prestige (accumulates across stages)
    this.souvenirs = [];         // the loadout, carried stage to stage
    this.stagesCleared = 0;
    this.totalPops = 0;
    this.bestChain = 0;
    this.over = false;           // the run ended (death or victory)
    this.victory = false;        // survived the finale
    this.scorecard = null;       // the causal death/clear summary (set at end)
  }

  isCenterpiece() { return this.stage === STAGES_PER_LOCALE; }
  ticketMult() { return LOCALE_TICKETS[this.locale - 1] || 1; }

  // Absorb a cleared stage's World: bank tickets (locale mult, doubled on a
  // centerpiece), accumulate prestige + stats, and advance the tour cursor.
  clearStage(world) {
    this.score += world.score;
    this.totalPops += world.pops;
    if (world.bestChain > this.bestChain) this.bestChain = world.bestChain;
    this.stagesCleared += 1;
    const cp = this.isCenterpiece();
    this.tickets += this.ticketMult() * (cp ? 2 : 1);
    if (cp && this.souvenirs.includes('centerpieceMedal')) this.tickets += this.ticketMult(); // Centerpiece Medal: extra
    if (this.souvenirs.includes('seasonPass')) this.tickets += 1;
    if (this.souvenirs.includes('punctual') && world.tick < world.parTicks) this.tickets += 2; // cleared under par
    this._advance();
    return this;
  }

  // Absorb a death: accumulate the final stage's prestige/stats and stamp the
  // scorecard (causal — the culprit, seed, loadout, pops, chain, score).
  die(world) {
    this.score += world.score;
    this.totalPops += world.pops;
    if (world.bestChain > this.bestChain) this.bestChain = world.bestChain;
    this.over = true;
    this.victory = false;
    this.scorecard = {
      outcome: 'downed',
      locale: this.locale, stage: this.stage,
      culpritCls: world.deathCulpritCls || null,
      seed: this.seed,
      souvenirs: [...this.souvenirs],
      pops: this.totalPops, bestChain: this.bestChain,
      score: this.score, tickets: this.tickets,
    };
    return this;
  }

  _advance() {
    this.stage += 1;
    if (this.stage > STAGES_PER_LOCALE) {
      this.stage = 1;
      this.locale += 1;
      if (this.locale > LOCALES) {
        // Past locale 3 → the Panic Finale is next (flagged for the app to stage).
        this.locale = LOCALES; this.stage = STAGES_PER_LOCALE + 1; // sentinel "finale"
        this.finaleReady = true;
      }
    }
  }

  atFinale() { return !!this.finaleReady; }

  // Winning the finale (M4 wires the finale itself): premium ticket multiplier + victory.
  winFinale(finaleScore = 0, premiumMult = 4) {
    this.score += finaleScore;
    this.tickets += this.ticketMult() * premiumMult;
    this.over = true; this.victory = true;
    this.scorecard = { outcome: 'victory', locale: this.locale, stage: 'finale', seed: this.seed, souvenirs: [...this.souvenirs], pops: this.totalPops, bestChain: this.bestChain, score: this.score, tickets: this.tickets };
    return this;
  }

  // Offer a draft of DRAFT_SIZE souvenirs (DESIGN-SEED draft rules): from the tier-
  // eligible, not-owned, IMPLEMENTED pool; no duplicates; a locale-1 offer guarantees
  // ≥1 weapon-class (the bad-luck floor). Deterministic (seeded by the draft index).
  offerDraft() {
    this.draftNumber = (this.draftNumber || 0) + 1;
    const rng = new Stream(hashInt(this.draftNumber, 0x5eed, this.seed));
    const pool = draftableAt(this.locale, this.souvenirs, this.trunk || null); // trunk = owned pool
    const picks = [];
    if (this.locale === 1) {
      const weapons = pool.filter((c) => c.kind === 'weapon');
      if (weapons.length) picks.push(rng.pick(weapons)); // bad-luck floor
    }
    const rest = draftShuffle(rng, pool.filter((c) => !picks.includes(c)));
    for (const c of rest) { if (picks.length >= DRAFT_SIZE) break; picks.push(c); }
    this.lastOffer = picks.map((c) => c.id);
    return picks;
  }

  draftPick(id) { if (id && !this.souvenirs.includes(id)) this.souvenirs.push(id); this.lastOffer = null; return this; }
  draftDecline() { this.lastOffer = null; return this; } // declining grants nothing

  label() { return this.atFinale() ? 'PANIC FINALE' : `${this.locale} – ${this.stage}`; }

  serialize() {
    return {
      seed: this.seed, locale: this.locale, stage: this.stage, tickets: this.tickets,
      score: this.score, souvenirs: [...this.souvenirs], stagesCleared: this.stagesCleared,
      totalPops: this.totalPops, bestChain: this.bestChain, over: this.over, victory: this.victory,
      finaleReady: !!this.finaleReady, scorecard: this.scorecard, recorded: !!this.recorded,
      draftNumber: this.draftNumber || 0, lastOffer: this.lastOffer || null,
    };
  }

  static fromSerialized(d) {
    const r = new Run({ seed: d.seed });
    Object.assign(r, d);
    r.souvenirs = [...(d.souvenirs || [])];
    return r;
  }
}

function draftShuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
