// tuning.js — EVERY gameplay constant and curve lives here (DESIGN-SEED M1).
// Each entry names its SHAPE (linear / geometric / step / flat) and its intended
// FEEL in a one-line comment. No magic numbers scattered through the engine —
// invisible tuning is the likeliest quiet failure (CLAUDE.md: failures are loud).
//
// Rule: if a number in game logic changes the FEEL of the game, it belongs here.
// Pure data + pure helpers only — no DOM, no RNG, importable by node --test.

export const TUNING = {
  // ---- Time & pacing -------------------------------------------------------
  // A TICK is the engine's atomic step. The march advances one tick at a time;
  // combat, generation lookahead, and autosave cadence all count in ticks so the
  // whole engine is deterministic under seed (DESIGN-SEED stack).
  tickMs: 100, // flat — real milliseconds per tick at 1x speed. 10 ticks/sec.

  // Speed control (M1). A seeded config value with a UI control from the first
  // march loop. step — discrete multipliers, never a continuous slider.
  speedSteps: [0.5, 1, 2, 4], // step — allowed march/combat speed multipliers
  defaultSpeedIndex: 1, // flat — start at 1x (speedSteps[1])

  // ---- The road (M1 skeleton) ---------------------------------------------
  // A leg is one stretch of road between pause points. Distance is measured in
  // "paces"; the party covers pacesPerTick paces each tick at 1x.
  pacesPerTick: 1, // flat — one pace per tick; speed multiplies wall-clock, not paces
  legLengthPaces: 120, // flat — paces in one road leg before a pause point (~12s at 1x)

  // Encounter ticker (M1 skeleton — real combat is M2). How often the road
  // offers an encounter, expressed as a per-pace chance drawn from the encounter
  // stream. Kept low so a leg has a handful of encounters, not a wall of them.
  encounterChancePerPace: 0.04, // flat — ~1 in 25 paces rolls an encounter (~5/leg)
  encounterMinGapPaces: 8, // flat — no two encounters closer than this (breathing room)
  // Opening grace (release look): no encounter rolls until the party has covered
  // this many paces after START. ~5s at 1× — a stranger can read the desk first.
  firstEncounterMinPaces: 50, // flat — first-minutes pacing; does not invent new verbs
  // Road encounter tier mix (M4). The open road is ORDINARY work: routine
  // dominates (winnable card-free — the zero-card law), elites are occasional
  // contested crossings, bosses are rare jurisdictions the deck is meant for.
  // A weighted single draw off the encounter stream (replaces the M1 uniform
  // placeholder). Weights sum to 1; determinism preserved (same one draw/roll).
  roadTierWeights: { routine: 0.80, elite: 0.16, boss: 0.04 }, // step — routine-heavy road

  // ---- Save cadence (M1) ---------------------------------------------------
  // "The Office holds the file open" — autosave at every structural beat. This
  // is the tick interval for the safety heartbeat autosave between beats.
  autosaveHeartbeatTicks: 50, // flat — belt-and-suspenders autosave every 5s at 1x

  // ---- Determinism probe (M1) ---------------------------------------------
  determinismProbeTicks: 200, // flat — save/reload must match this many ticks byte-for-byte

  // ---- Party + jobs (M2) ---------------------------------------------------
  partySize: 4, // flat — active frames the Office assigns to a road
  // Base stat block for a level-1 frame BEFORE the job's weighting is applied.
  // A job multiplies these (see jobs.js weights); this is the shared chassis.
  baseStats: { hp: 32, atk: 10, def: 6, mag: 9, spd: 10 }, // flat — the neutral frame
  // Attrition (M2 core): HP and supplies persist across encounters; recovery only
  // at camps/towns, at cost. Supplies are the expedition's consumable reserve.
  startSupplies: 40, // flat — supplies a fresh expedition carries
  campRecoverHpFrac: 0.5, // step — a camp rest restores this fraction of missing HP...
  campRecoverSupplyCost: 6, // flat — ...and deducts this many supplies to do it
  supplyPerEncounter: 1, // linear — supplies consumed by fielding one encounter

  // ---- Combat resolver (M2) ------------------------------------------------
  // Damage = max(dmgFloor, round(power * ATK|MAG - target.DEF * defScale)).
  dmgFloor: 1, // flat — a landed blow always removes at least this much
  defScale: 0.6, // linear — how much a point of DEF mitigates incoming power
  healScale: 1.0, // linear — MAG-to-healing conversion
  guardDefBonus: 0.6, // step — fractional DEF raise a guard/ward grants for a round
  combatMaxRounds: 40, // flat — resolver hard stop (a stalled fight is a loud defect)
  // Enemy encounter tiers (skeleton scaling; real bestiary art wires at M2 inc3).
  // Each tier: enemy count + a stat multiplier vs the base frame chassis.
  // Tuned so the auto-resolver hits the committed win bands below (measured by
  // the M2 baseline probe over 2000 seeded fights with the default comp).
  encounterTiers: {
    routine: { count: 3, mult: 1.44 }, // step — the road's ordinary work (~94% auto-win)
    elite: { count: 3, mult: 1.62 }, // step — a contested crossing (~54%)
    boss: { count: 1, mult: 3.4 }, // step — a jurisdiction that will not yield (~11%)
  },

  // ---- M2 exit gates -------------------------------------------------------
  // Committed target auto-win bands (DESIGN-SEED M2). M3 tunes the tarot deck
  // against THIS baseline. Bands carry a small tolerance over the stated targets
  // (routine 90-95, elite 40-60, boss <15) to absorb sample noise.
  winRateBands: {
    routine: [0.88, 0.97], // target 90–95%
    elite: [0.38, 0.62], // target 40–60%
    boss: [0.0, 0.16], // target <15%
  },
  baselineProbeFights: 2000, // seeded fights per tier the baseline probe runs
  // Job-comp degeneracy sweep: a comp's ladder score may not exceed the median
  // comp's by more than this fraction; comps below the floor are flagged trap-tier.
  degeneracyMargin: 0.5, // step — max allowed (best/median − 1)
  degeneracyFloor: 0.6, // step — below floor×median = trap-tier
  degeneracyLadder: ['routine', 'routine', 'elite', 'routine', 'elite', 'boss'], // fixed seeded ladder

  // ---- The tarot deck (M3) -------------------------------------------------
  handSize: 3, // step — cards held in-hand during a fight
  cardDamageBase: 22, // flat — a strike card deals card.power × this
  cardHealBase: 14, // flat — a heal card restores card.power × this
  cardBuffBase: 10, // flat — a rally/ordinance raises ATK by card.power × this per frame
  cardWardBase: 8, // flat — a ward card raises DEF by card.power × this
  // A frame is "in danger" (heals/wards read decisive) below this HP fraction.
  cardDangerFrac: 0.4, // step — below 40% max HP, protection reads as decisive
  drawOnHandStep: true, // flat — draw to hand size when a fight begins / a card is played
  deckRemoveCost: 8, // flat — supplies to strike a card from the deck at camp (thin-deck)
  omenEveryLegs: 1, // step — a road omen is read at the start of each leg (flavour)

  // ---- Mandates + the ledger (M4) ------------------------------------------
  // The Office issues a mandate: a quest-chain with a terminus (a destination
  // leg). Reaching it DISCHARGES the mandate and pays its reward into the ledger;
  // the Office then issues the next. Generated on the `mandate` stream (never
  // perturbs combat/terrain), so mandate content is deterministic under seed.
  mandateLegSpan: [3, 5], // step — legs from issue to a mandate's terminus (a haul)
  mandateRewardBase: 26, // linear — base disbursement for discharging a mandate
  mandateRewardPerLeg: 9, // linear — added per leg of span (a longer haul pays more)
  // THE FLOOR (DESIGN-SEED M4): no discharge ever pays less than this. Combined
  // with per-leg encounter gold, forward progress is never worse than standing
  // still — a bad route/mandate can slow the ledger but never reverse it.
  mandateRewardFloor: 24, // flat — minimum mandate disbursement (progress ≥ standstill)
  mandateSideRange: [1, 2], // step — optional side-clauses attached to a mandate
  mandateSideBonus: 16, // flat — gold a met side-clause disburses
  mandateFrugalPerLeg: 2.4, // linear — a "frugal" clause allows this many encounters/leg of span
  mandateProvisionFrac: 0.5, // step — a "provisioned" clause wants supplies ≥ this frac of start

  // Combat victory disbursement (gold into the ledger), per encounter tier. The
  // road's pay scale — the always-on income the economy's sinks are curved against.
  goldPerWin: { routine: 7, elite: 19, boss: 52 }, // step — pay rises steeply with tier

  // ---- The quartermaster: towns, shops, equipment (M4) ---------------------
  // Some pause points are TOWNS (a quartermaster); the rest are plain camps.
  // A town stocks equipment gated by leg (no early run-ending power spike) and an
  // always-open RESUPPLY sink (the economy's guaranteed gold outlet).
  townEveryLegs: 2, // step — every Nth pause point is a town (a quartermaster present)
  shopStockSize: 4, // step — equipment lines a town's quartermaster stocks
  shopSellFraction: 0.5, // linear — fraction of price the quartermaster returns on a sell
  resupplyBlock: 8, // flat — supplies delivered per resupply purchase
  resupplyCost: 10, // linear — gold per resupply block (the always-open sink; never sold out)

  // ---- Route branches (M4) -------------------------------------------------
  // At each pause point the party ROUTES the next leg: a branch choice with a
  // legible safety-vs-resource tradeoff. A safe road is maintained (a supply
  // toll) but quiet; an exposed verge is free to travel but fights more (and so
  // pays more). Every branch still advances toward the floored mandate reward —
  // no branch makes forward progress worse than standing still. Content is a pure
  // function of (seed, leg); the chosen mods ride on the leg (march.legMods).
  routeBranchCount: 3, // step — branches offered at a pause point (safe/ordinary/exposed)
  // Archetype bands [lo,hi]; the exact figure is jittered per (seed,leg) inside.
  routeEncounterMult: { posted: [0.5, 0.7], ordinary: [0.9, 1.1], verge: [1.4, 1.7] }, // step
  routeGoldMult: { posted: [0.85, 0.95], ordinary: [1.0, 1.1], verge: [1.3, 1.5] }, // step
  routeSupplyToll: { posted: [2, 4], ordinary: [0, 1], verge: [0, 0] }, // step — supplies paid to take the road

  // ---- M4 economy exit gate (committed targets, MEASURED by the probe) ------
  // The intended net gold a surviving expedition banks per leg (income from the
  // road + amortized mandate discharge, minus the survival sinks). The economy
  // probe (economy.js) measures the actual figure over N seeded runs; the gate
  // asserts it lands in this band — the "intended gold balance per leg index".
  economyGoldPerLegBand: [30, 90], // step — target net gold/leg for a surviving run
  // A greedy (buy-everything) run must survive at least as deep as a hoarding
  // null run in at least this fraction of seeds — equipment must be WORTH buying.
  economyGreedyWorthFrac: 0.75, // step — greedy-survives-≥-null share (buying pays off)

  // ---- Certifications: job mastery (M5) ------------------------------------
  // Job mastery is the certification currency: jobs level ACROSS runs (fixed at
  // swap time within a run), and configuration compounds run-over-run. Mastery is
  // earned by fielding a job in won fights and banked when the expedition ends;
  // each level adds a small multiplier to that job's whole stat block. Default
  // (level 0 → ×1) leaves the M2 baseline exactly untouched.
  masteryXpPerWin: { routine: 1, elite: 3, boss: 8 }, // linear — mastery/job per won fight, by tier
  masteryXpPerLevel: 20, // linear — mastery XP to advance one certification level
  masteryStatPerLevel: 0.03, // linear — +3% to the job's stat block per level (compounds)
  masteryLevelCap: 10, // flat — certification levels per job (the wall's height, v1)

  // ---- Escalation curve (M5) -----------------------------------------------
  // Runs get DEEPER as the certification wall fills: a new expedition escalates
  // to a level set by the deepest leg ever reached, scaling BOTH enemy strength
  // and the road's pay (tougher, but richer). A fresh ledger (deepestLeg 0) →
  // level 0 → ×1, so the M2 baseline + economy gate are untouched.
  escalationEveryLegs: 3, // step — deepest-leg reached per escalation level
  escalationStep: 0.08, // linear — +8% enemy strength AND reward per escalation level
  escalationCap: 6, // flat — escalation ceiling (the world only deepens so far, v1)

  // ---- Abandon valve + no-progress detector (M5) ---------------------------
  // The player may FILE FOR EARLY RETURN at any camp/town — ends the run and
  // banks a reduced share of certification credit. A no-progress detector
  // surfaces the valve loudly when the expedition has stopped advancing.
  abandonCreditFrac: 0.5, // step — mastery share banked on a voluntary early return
  noProgressLegs: 2, // flat — consecutive stalled legs before the valve is surfaced loudly
};

// clampSpeedIndex: keep a speed index inside the speedSteps array (pure).
export function clampSpeedIndex(i) {
  const n = TUNING.speedSteps.length;
  if (i < 0) return 0;
  if (i >= n) return n - 1;
  return i | 0;
}

// speedAt: the multiplier for a given speed index (pure).
export function speedAt(i) {
  return TUNING.speedSteps[clampSpeedIndex(i)];
}
