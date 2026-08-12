// Simulation core for INNSMOUTH 2000 (M3 growth sim).
//
// The heart of the game: zones that reach a road sprout buildings through development tiers,
// population accrues by resident class, and the dread meter reshuffles WHO lives here. The core
// dial (DESIGN-SEED): dread pushes the Unwary out and pulls Cultists and Deep Ones in; the player
// trades tax base against the favour economy. Fully seeded and deterministic so node --test can
// assert on the trajectory. Pure of canvas and DOM. Shrines, the university, and services (which
// steer Cultists and Scholars) arrive in later milestones; M3 grows Unwary / Deep Ones / Cultists
// from dread and waterfront alone, and requires only road access (the power requirement is M5).

import { makeRng } from './rng.js';
import { TERRAIN } from './mapgen.js';
import {
  ZONE, STRUCTURE_INFO, TOOL, hasNetwork, hasPipe, isWaterTerrain, clampRange, QUALITY,
} from './tools.js';
import { computePower, energizedNear } from './power.js';
import { computeWater, waterAt, waterCapAt, qualityAt, isFoulQuality, PRESSURE } from './water.js';
import { computeAquifer, aquiferOptions } from './aquifer.js';
import { stepDeep, PRESENCE_AT } from './deep.js';
import {
  makeFavor, stepFavor, POST_WRATH_FAVOR, favorStage, FAVOR_STAGE, GOD, GOD_LIST, GOD_INFO,
  cthulhuRecovery, DOOM_AWAKENINGS,
} from './gods.js';
import { triggerWrath, advanceDisaster } from './disasters.js';

// The four resident classes (DESIGN-SEED: our R in the demand model).
export const CLASS = {
  UNWARY: 'unwary',
  CULTIST: 'cultist',
  DEEP_ONE: 'deepone',
  SCHOLAR: 'scholar',
};

// Game speeds. The value is the real-time interval (ms) between sim ticks; the browser loop uses
// it. PAUSED never steps. One tick advances the calendar by one month.
export const SPEED = {
  PAUSED: 'paused',
  CREEP: 'creep', // a slow, contemplative step (M9): watch the town live and the living world breathe
  SLOW: 'slow',
  MEDIUM: 'medium',
  FAST: 'fast',
};
export const SPEED_MS = {
  [SPEED.PAUSED]: Infinity,
  [SPEED.CREEP]: 2400,
  [SPEED.SLOW]: 1200,
  [SPEED.MEDIUM]: 500,
  [SPEED.FAST]: 150,
};

// The tick interval actually used, given the player's chosen speed and whether the world should
// hold back (M9 disaster auto-slow). When auto-slow is on and a wrath is loose, the sim ticks no
// faster than SLOW so the player can watch and react; the chosen speed is left untouched and resumes
// the instant the disaster clears. A already-slower speed (CREEP) is never sped up.
export function effectiveTickMs(speed, disasterActive, autoSlow) {
  const base = SPEED_MS[speed] ?? Infinity;
  if (autoSlow && disasterActive && Number.isFinite(base)) return Math.max(base, SPEED_MS[SPEED.SLOW]);
  return base;
}

export const MAX_LEVEL = 3; // development tiers per lot

// The city ordinances (DESIGN-SEED). Each has a monthly upkeep and effects; the god-favour hooks
// (Harbor Tithes -> Dagon, Masked Processions -> Nyarlathotep) arrive with the M6 gods layer.
export const ORDINANCE = {
  CURFEW: 'curfew',
  MASKED_PROCESSIONS: 'maskedProcessions',
  HARBOR_TITHES: 'harborTithes',
};
export const ORDINANCE_INFO = {
  curfew: { label: 'Curfew', upkeep: 20, blurb: 'Quiets the streets. Eases dread; the shops earn less.' },
  maskedProcessions: { label: 'Masked Processions', upkeep: 30, blurb: 'The old rites in the open. Eases dread.' },
  harborTithes: { label: 'Harbor Tithes', upkeep: 15, blurb: 'A levy on the sea-bounty. The wharves pay in.' },
};

// Economic constants (placeholder scale for the prototype; tune freely).
export const ECON = {
  START_TREASURY: 20000,
  TAX_UNIT: 10, // money per resident per unit tax rate per month
  SEA_BOUNTY: 6, // money per Deep One per month (their unlocked income)
  COMMERCIAL_INCOME: 40, // money per commercial building per month
  ROAD_UPKEEP: 1,
  BUILDING_UPKEEP: 3,
  DEFAULT_TAX: 0.07,
};

// Bankruptcy (M8): a town whose treasury runs negative cannot pay for its rites and services. Its
// ordinances shut off at once (no new upkeep may be taken on while insolvent), and after a short
// grace the funded municipal services (constabulary, asylum, chapel) go dark, so their dread relief
// is lost and the town spirals unless the coffers are set right. The reference-era ritual: overspend
// and the genre's core tension bites back.
export const BANKRUPT_GRACE = 3; // months insolvent before the watch goes unpaid and services cut
export const CLASS_LIST = ['unwary', 'cultist', 'deepone', 'scholar'];

// Town titles by population (the reference's Village/Town/City ladder, in a period New England
// register). Shown in the top bar; a plain genre readout of how the settlement has grown.
export const TOWN_TITLES = [
  { at: 0, title: 'Landing' },
  { at: 50, title: 'Hamlet' },
  { at: 150, title: 'Village' },
  { at: 400, title: 'Town' },
  { at: 1000, title: 'Port' },
  { at: 2500, title: 'City' },
];
export function townTitle(pop) {
  let t = TOWN_TITLES[0].title;
  for (const s of TOWN_TITLES) if (pop >= s.at) t = s.title;
  return t;
}
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];



// Any road within Chebyshev radius `rad` (road access lets a lot develop).
function hasRoadNear(map, col, row, rad = 2) {
  for (let dr = -rad; dr <= rad; dr++) {
    for (let dc = -rad; dc <= rad; dc++) {
      if (dc === 0 && dr === 0) continue;
      const t = map.tileAt(col + dc, row + dr);
      if (hasNetwork(t, 'road')) return true;
    }
  }
  return false;
}

// Any water within Chebyshev radius `rad` (waterfront lots draw Deep Ones).
function hasWaterNear(map, col, row, rad = 1) {
  for (let dr = -rad; dr <= rad; dr++) {
    for (let dc = -rad; dc <= rad; dc++) {
      const t = map.tileAt(col + dc, row + dr);
      if (t && isWaterTerrain(t.terrain)) return true;
    }
  }
  return false;
}

// The largest structure coverage radius, so a single box scan finds every structure that could
// reach a lot.
const MAX_COVER_RADIUS = 6;

// Count the service structures whose coverage reaches (col,row), by kind. A structure covers a
// lot when the lot is within that structure's own radius (Chebyshev distance).
export function coverCounts(map, col, row) {
  const out = { constabulary: 0, asylum: 0, chapel: 0, shrine: 0, university: 0 };
  for (let dr = -MAX_COVER_RADIUS; dr <= MAX_COVER_RADIUS; dr++) {
    for (let dc = -MAX_COVER_RADIUS; dc <= MAX_COVER_RADIUS; dc++) {
      const t = map.tileAt(col + dc, row + dr);
      if (!t || !t.structure) continue;
      const info = STRUCTURE_INFO[t.structure.kind];
      if (!info || info.radius <= 0) continue;
      if (Math.max(Math.abs(dc), Math.abs(dr)) <= info.radius && out[t.structure.kind] !== undefined) {
        out[t.structure.kind]++;
      }
    }
  }
  return out;
}

// A fresh tally of everything the town can hold. The structure keys are read from STRUCTURE_INFO
// rather than typed out, because a hand-maintained duplicate of that list is exactly what produced
// the university-upkeep defect: `reassignAndTally` built its counts object without a `university`
// key, the tally guard is `if (counts[kind] !== undefined)`, so universities were never counted, and
// their 40/month upkeep was never charged nor their dread relief credited (the class assignment
// still worked, because classFor scans the map directly through coverCounts). Derived once, here,
// the whole class of bug is gone: a new structure kind is counted, billed, and dread-credited the
// moment it is added to STRUCTURE_INFO. test/economy.test.js holds this.
export function emptyCounts() {
  const counts = { residential: 0, commercial: 0, industrial: 0, road: 0, pipe: 0 };
  for (const kind of Object.keys(STRUCTURE_INFO)) counts[kind] = 0;
  return counts;
}

export function makeSim(map, opts = {}) {
  const sim = {
    map,
    rng: makeRng(opts.seed ?? 'Innsmouth-sim'),
    scenario: opts.scenario ?? 'standard',
    year: opts.year ?? 1927,
    foundedYear: opts.year ?? 1927, // the year the town was laid; survival milestones count from here
    month: opts.month ?? 0, // 0 = January
    tick: 0,
    speed: opts.speed ?? SPEED.PAUSED,
    // Ambient dread the meter eases toward, on top of industry and Deep Ones. Later milestones
    // (disasters, ordinances, the deeper Innsmouth taint) drive this; the player fights it down.
    dreadBase: opts.dreadBase ?? 6,
    dread: opts.dread ?? (opts.dreadBase ?? 6), // 0..100
    pop: { unwary: 0, cultist: 0, deepone: 0, scholar: 0 },
    counts: emptyCounts(),
    // Power state from the last step (energized tiles, network totals). Render + query read it.
    power: { energized: new Set(), components: [], totals: { capacity: 0, demand: 0, powered: 0, unpowered: 0 } },
    // Water state from the last step (M-a): served/low-served coverage, per-main pressure, totals.
    // Render, query, and the growth gate all read this one computed state.
    water: {
      served: new Set(), lowServed: new Set(), pipes: new Map(), taints: new Map(),
      owner: new Map(), byId: new Map(), components: [],
      totals: {
        capacity: 0, demand: 0, pressurized: 0, low: 0, dry: 0,
        suspect: 0, tainted: 0, infested: 0,
      },
    },
    // The subsurface (M-b). `aquifer` is DERIVED from terrain every step, never stored on a tile, so
    // an old save loads with a correct one and a Flood Tide moves the brine inland for free. The
    // scenario scales how far the brine reaches and how fissured the near-shore rock is.
    aquiferOpts: aquiferOptions(opts.aquifer),
    aquifer: null,
    // Deep Presence, the hidden weight of the deep against the town's ground. Keyed by tile index so
    // it survives the map changing under it (see deep.js stepPresence). `deep` is the derived reading
    // the renderer, the query, and the Old Priest all use; `deepStart` is the scenario's opening
    // value for a sea-connected region (the Quiet Cove starts dormant, spec section 5).
    presence: opts.presence ? { ...opts.presence } : {},
    deep: null,
    deepStart: opts.deepStart ?? 6,
    // The scenario's water pressure scales, and the opening grace window in months during which the
    // contamination rolls are quartered (the Quiet Cove's "first 18 to 24 months").
    deepPace: opts.deepPace ? { presence: 1, contam: 1, ...opts.deepPace } : { presence: 1, contam: 1 },
    deepGrace: opts.deepGrace ?? 0,
    // When each sort of water headline was last filed, so the Courier reports the water without
    // becoming a water bulletin.
    deepNoted: opts.deepNoted ? { ...opts.deepNoted } : {},

    // Economy.
    treasury: opts.treasury ?? ECON.START_TREASURY,
    taxRates: {
      unwary: ECON.DEFAULT_TAX, cultist: ECON.DEFAULT_TAX,
      deepone: ECON.DEFAULT_TAX, scholar: ECON.DEFAULT_TAX,
    },
    ordinances: { curfew: false, maskedProcessions: false, harborTithes: false },
    // Bankruptcy state (M8): how many consecutive months the treasury has been negative, and whether
    // the funded services have been cut (their dread relief goes dark until the coffers recover).
    bankruptMonths: opts.bankruptMonths ?? 0,
    servicesCut: opts.servicesCut ?? false,

    // The gods layer (M6): a favor track per god, the gods whose wrath came due last step, the
    // active wrath in progress (a crawling Greening/Burning, or the flash of an instant strike),
    // and the last wrath's herald line for the UI.
    favor: opts.favor ? { ...makeFavor(), ...opts.favor } : makeFavor(),
    pendingWrath: [],
    disaster: null,
    lastWrath: null,
    // The Cthulhu doom clock (M8): how many Awakenings have struck, which survival milestones the
    // town has already passed, and the ending once the dreamer fully wakes (null while the town
    // still stands). `ended` freezes the sim and is surfaced as an end screen.
    awakenings: opts.awakenings ?? 0,
    survivalNoted: opts.survivalNoted ? { ...opts.survivalNoted } : {},
    ended: opts.ended ?? null,
    // The Innsmouth Courier's event log (M7): notable months become period-voice headlines,
    // newest last, capped. The newspaper overlay reads this; nothing else depends on it.
    events: [],
    // The Courier's flavor cycle (M9): a quiet month still goes to press. `flavorIndex` walks the
    // rotating filler column (so no two consecutive fillers repeat) and `lastFlavorTick` throttles
    // it. A real headline always takes the page; filler fills only the silence.
    flavorIndex: 0,
    lastFlavorTick: opts.lastFlavorTick ?? 0,
    // Auto-slow (M9): when a wrath is loose the sim holds back to no faster than SLOW so the player
    // can watch and react (effectiveTickMs applies it). On by default; the chosen speed is untouched.
    autoSlow: opts.autoSlow ?? true,
    // First-contact onboarding (M7): each soft in-fiction prompt fires once, when the novel layer
    // first touches the town (a shrine raised, the first Cultist or Deep One, dread climbing toward
    // the gods). `hints` is a queue the UI shows one at a time and dismisses; `onboarded` records
    // which prompts have already fired so none repeats.
    hints: [],
    onboarded: { shrine: false, cultist: false, deepone: false, dread: false, water: false, below: false },
    // Whether a neglected favor track looses its wrath automatically on the sim clock. The playable
    // game turns this on (main.js); it stays off by default so a headless sim can be stepped for
    // growth or economy without the gods razing the town. The disasters menu / summonWrath fire
    // regardless of this flag.
    wrath: opts.wrath ?? false,
    // Scenario-only pressure scale. Quiet Cove halves negative favor movement to give a learner
    // an establishment window; neutral and positive appeasement retain their ordinary strength.
    wrathPace: opts.wrathPace ?? 1,

    setSpeed(s) { if (SPEED_MS[s] !== undefined) this.speed = s; return this; },

    formatDate() { return `${MONTHS[this.month]} ${this.year}`; },

    totalPopulation() {
      return this.pop.unwary + this.pop.cultist + this.pop.deepone + this.pop.scholar;
    },

    setTax(cls, rate) {
      if (this.taxRates[cls] !== undefined) this.taxRates[cls] = clampRange(rate, 0, 0.2);
      return this;
    },

    toggleOrdinance(key) {
      if (this.ordinances[key] === undefined) return this;
      // An insolvent town cannot take on new upkeep; it may only switch an ordinance OFF (M8).
      if (!this.ordinances[key] && this.treasury < 0) return this;
      this.ordinances[key] = !this.ordinances[key];
      return this;
    },

    // Spend from the treasury if it can bear it; returns whether the charge went through.
    spend(cost) {
      if (cost <= 0) return true;
      if (this.treasury < cost) return false;
      this.treasury -= cost;
      return true;
    },

    // Advance one month: compute power, grow lots (power gates their height), retally, ease dread,
    // then settle the monthly budget.
    step() {
      if (this.ended) return this; // the dreamer has waked; the world is still
      this.tick++;
      this.month++;
      if (this.month >= 12) { this.month = 0; this.year++; }
      // Snapshot the quantities the Courier watches, before the month resolves.
      const before = {
        favor: { ...this.favor },
        pop: this.totalPopulation(),
        deepone: this.pop.deepone,
        cultist: this.pop.cultist,
        treasury: this.treasury,
      };
      // How many headlines stand before this month resolves: if none is filed all month (a wrath,
      // an omen, a milestone), the Courier prints filler instead (M9 flavor cycle, below).
      const eventsAtMonthStart = this.events.length;
      // A crawling wrath advances a ring before the town lives its month.
      advanceDisaster(this);
      this.power = computePower(this.map);
      // The subsurface is re-read from the terrain first: a Flood Tide last month may have put the
      // sea into ground that was sweet, and the whole M-b layer keys off that reading (M-b).
      this.aquifer = computeAquifer(this.map, this.aquiferOpts);
      // Water is computed after power, because a pump house only runs on a live grid (M-a).
      this.water = computeWater(this.map, this.power);
      // Then the deep takes its month: presence, intakes, spread, and what it does about the town.
      // It reads this month's pressure and writes taint, sabotage, and chokes back onto the map...
      const deepNews = stepDeep(this);
      // ...so the water is computed a second time, and what the player sees on the map, in the query,
      // and at the growth gate is the state AFTER the deep has had its turn. Without this, a
      // sabotaged pump or a choked main would not bite until the following month.
      this.water = computeWater(this.map, this.power);
      for (const item of deepNews) noteNews(this, item.kind, item.headline, item.sub);
      growLots(this, this.power, this.water);
      reassignAndTally(this);
      updateDread(this);
      // The gods stir: decay favor, then loose the wrath of the worst-neglected god if one came
      // due (only one per month, and not while another wrath is still crawling the streets). Newly
      // due gods JOIN a persistent queue rather than overwrite it, so when two tracks floor the same
      // month the second is not lost to the single disaster slot — the gods do not forget (M8).
      for (const g of stepFavor(this)) if (!this.pendingWrath.includes(g)) this.pendingWrath.push(g);
      if (this.wrath && this.pendingWrath.length && !this.disaster) {
        this.summonWrath(this.pendingWrath.shift());
      }
      this.treasury += computeBudget(this).net;
      applyBankruptcy(this);
      detectExposure(this);
      detectNews(this, before);
      detectSurvival(this);
      detectOnboarding(this);
      // Only in a month with no real headline does the broadsheet fall back on filler.
      if (this.events.length === eventsAtMonthStart) detectFlavor(this);
      return this;
    },

    // Loose a god's wrath now and sate that god (the disasters menu and the favor floor both call
    // this). Returns the wrath event, and files the Courier's front-page headline.
    summonWrath(god) {
      if (this.ended) return null; // the story is over; nothing more can be loosed
      const event = triggerWrath(this, god);
      if (event) {
        const h = WRATH_HEADLINE[event.kind] || ['A WRATH FALLS UPON THE TOWN', event.message];
        noteNews(this, 'wrath', h[0], h[1]);
        if (god === GOD.CTHULHU) {
          // The doom clock (M8): the Awakening tightens (theAwakening bumped this.awakenings). Each
          // recovers less favor than the last, so the next comes sooner; the DOOM_AWAKENINGS-th ends
          // the town for good.
          this.favor[god] = cthulhuRecovery(this.awakenings);
          if (this.awakenings >= DOOM_AWAKENINGS && !this.ended) {
            this.ended = { kind: 'doom', year: this.year, month: this.month, awakenings: this.awakenings };
            noteNews(this, 'doom', 'R’LYEH HAS RISEN; INNSMOUTH IS LOST',
              'The dreamer wakes in full. The town is given over to the sea and the dark.');
          }
        } else if (this.favor[god] !== undefined) {
          this.favor[god] = POST_WRATH_FAVOR;
        }
      }
      return event;
    },

    // A player action the world itself answers for. applyTool stays a pure map mutation, so the
    // consequences that belong to the gods land here: capping a fissure is stone and iron across a
    // door Dagon uses, and he takes it personally (spec section 3: "may anger Dagon slightly").
    noteBuild(tool) {
      if (tool === TOOL.SEAL && this.favor.dagon !== undefined) {
        this.favor.dagon = clampRange(this.favor.dagon - SEAL_DAGON_COST, 0, 100);
      }
      return this;
    },
  };

  return sim;
}

// What a sealing works costs the town in Dagon's regard.
export const SEAL_DAGON_COST = 4;

// Grow zoned lots that have road access, one tier per eligible month, gated by class demand. A
// lot can put up a first-tier structure on road access alone, but it needs the two utilities to
// grow taller (M5 power, M-a water), and the lower of the two caps wins:
//   no power -> tier 1;                    powered -> the full tier cap
//   no water -> tier 1;   low pressure -> tier 2;   good water -> the full tier cap
// So a shack goes up on a road alone, and full density needs a live grid AND a pressurized main.
// `power` and `water` are the per-step states from computePower / computeWater.
function growLots(sim, power, water) {
  const { map, rng } = sim;
  const demand = computeDemand(sim);
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const tile = map.tiles[map.index(col, row)];
      if (!tile.zone) continue;
      if (isWaterTerrain(tile.terrain)) continue;
      if (hasNetwork(tile, 'road')) continue; // a road paved over the lot
      if (!hasRoadNear(map, col, row)) {
        // No access: a partly built lot slowly decays back to nothing.
        if (tile.building && rng.chance(0.15)) {
          tile.building.level -= 1;
          if (tile.building.level <= 0) tile.building = null;
        }
        continue;
      }
      const powerCap = (power && energizedNear(map, power, col, row)) ? MAX_LEVEL : 1;
      const waterCap = water ? waterCapAt(map, water, col, row, MAX_LEVEL) : MAX_LEVEL;
      const cap = Math.min(powerCap, waterCap);
      const d = demand[tile.zone];
      if (!tile.building) {
        if (rng.chance(d * 0.6)) tile.building = { level: 1, cls: CLASS.UNWARY };
      } else if (tile.building.level < cap) {
        if (rng.chance(d * 0.35)) tile.building.level += 1;
      }
    }
  }
}

// Class demand per zone type in [0,1]. Residential is steady (dread reshuffles class, not the
// total wish to settle); commercial follows population; industrial holds a working baseline.
export function computeDemand(sim) {
  const pop = sim.totalPopulation();
  return {
    [ZONE.RESIDENTIAL]: 0.75,
    [ZONE.COMMERCIAL]: Math.min(0.9, 0.25 + pop / 400),
    [ZONE.INDUSTRIAL]: 0.6,
  };
}

// Decide a residential lot's resident class from dread, waterfront, and the chapel-versus-shrine
// tension (DESIGN-SEED core dial). Deep Ones take the waterfront once dread rises. Inland, a shrine
// pulls Cultists in at far lower dread than the ambient threshold, while a chapel in reach holds
// folk to the Old Faith even against high dread. Where both cover a lot, the shrine only prevails
// if it out-numbers the chapel: the tension the player must manage.
export function classFor(sim, col, row) {
  const waterfront = hasWaterNear(sim.map, col, row, 1);
  if (waterfront && sim.dread >= 30) return CLASS.DEEP_ONE;
  const cov = coverCounts(sim.map, col, row);
  if (cov.shrine - cov.chapel > 0 && sim.dread >= 20) return CLASS.CULTIST; // the shrine holds sway
  // The university draws Scholars to its campus (STUDY: "Scholars come for the university"), so long
  // as the cult has not claimed the ground and the town is not overwhelmed by dread. Scholars are the
  // educated Unwary; they ease dread but risk an Exposure when the Containment Wing fails (M8).
  if (cov.university > 0 && sim.dread < 60) return CLASS.SCHOLAR;
  if (cov.chapel > 0) return CLASS.UNWARY; // the Old Faith keeps them
  if (sim.dread >= 50) return CLASS.CULTIST;
  return CLASS.UNWARY;
}

// Reassign residential classes and retally population, building counts, and roads.
function reassignAndTally(sim) {
  const { map } = sim;
  const pop = { unwary: 0, cultist: 0, deepone: 0, scholar: 0 };
  const counts = emptyCounts();
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const tile = map.tiles[map.index(col, row)];
      if (hasNetwork(tile, 'road')) counts.road++;
      if (hasPipe(tile)) counts.pipe++;
      if (tile.structure && counts[tile.structure.kind] !== undefined) counts[tile.structure.kind]++;
      if (!tile.building || !tile.zone) continue;
      counts[tile.zone] = (counts[tile.zone] || 0) + 1;
      if (tile.zone !== ZONE.RESIDENTIAL) continue;
      const cls = classFor(sim, col, row);
      tile.building.cls = cls;
      pop[cls] += tile.building.level * 8; // 8 souls per tier
    }
  }
  sim.pop = pop;
  sim.counts = counts;
}

// Why is this lot the way it is? (M7 query "why".) Plain-English diagnostics for the query window:
// a stalled lot says what holds it back (no road, no power), a built one says how it fares, and a
// residential lot says why its residents are who they are. Pure over sim + map; truthful to the
// model (dread reshuffles class, it does not stall growth, so we never claim otherwise).
export function explainLot(sim, col, row) {
  const { map, power, water } = sim;
  const tile = map.tileAt(col, row);
  if (!tile) return [];
  const zoned = tile.zone && !isWaterTerrain(tile.terrain) && !hasNetwork(tile, 'road');
  if (!zoned) return [];
  const lines = [];
  const road = hasRoadNear(map, col, row);
  const powered = !!(power && energizedNear(map, power, col, row));
  const service = water ? waterAt(water, map.index(col, row)) : PRESSURE.GOOD;
  if (!road) {
    lines.push('Stalled: no road within reach.');
  } else if (!tile.building) {
    lines.push('Zoned and served. Awaiting settlement.');
  } else {
    const powerCap = powered ? MAX_LEVEL : 1;
    const waterCap = water ? waterCapAt(map, water, col, row, MAX_LEVEL) : MAX_LEVEL;
    const cap = Math.min(powerCap, waterCap);
    if (!powered) lines.push('No power: not on a working grid.');
    // The water growth-blockers, in the spec's own words. Foul water still waters a lot, but nothing
    // is built up over a main that runs like that, so it reads ahead of a pressure complaint.
    const quality = water ? qualityAt(water, map.index(col, row)) : QUALITY.CLEAN;
    if (service === PRESSURE.DRY) lines.push('No water: cannot grow beyond a poor first tier.');
    else if (isFoulQuality(quality)) {
      lines.push('Tainted water: the lot will not build up while the main runs foul.');
    } else if (service === PRESSURE.LOW) lines.push('Low pressure: cannot fully build up.');
    if (tile.building.level >= cap) {
      if (cap >= MAX_LEVEL) lines.push('Fully built up.');
      else if (waterCap < powerCap) lines.push('As high as it grows on this water.');
      else lines.push('As high as it grows unpowered.');
    } else {
      lines.push('Growing.');
    }
  }
  if (tile.zone === ZONE.RESIDENTIAL && tile.building) lines.push(classReason(sim, col, row));
  return lines;
}

// Explain a residential lot's resident class (mirrors classFor). Plain English, period register.
function classReason(sim, col, row) {
  const waterfront = hasWaterNear(sim.map, col, row, 1);
  if (waterfront && sim.dread >= 30) return 'The waterfront has turned to the Deep Ones.';
  const cov = coverCounts(sim.map, col, row);
  if (cov.shrine - cov.chapel > 0 && sim.dread >= 20) return 'A shrine holds sway. The cult has come.';
  if (cov.university > 0 && sim.dread < 60) return 'Scholars gather for the university nearby.';
  if (cov.chapel > 0) return 'The Old Faith keeps them from the cult.';
  if (sim.dread >= 50) return 'Dread has turned them to the cult.';
  return 'The Unwary hold on here, for now.';
}

// The monthly budget: income (taxes, sea-bounty, commerce) minus expenses (maintenance, ordinance
// upkeep). Pure over sim state; the budget window reads the same lines. Returns whole-money values.
export function computeBudget(sim) {
  const tax = Math.round(
    CLASS_LIST.reduce((s, c) => s + sim.pop[c] * sim.taxRates[c] * ECON.TAX_UNIT, 0),
  );
  const bounty = Math.round(
    sim.pop.deepone * ECON.SEA_BOUNTY * (sim.ordinances.harborTithes ? 1.5 : 1),
  );
  const commerce = Math.round(
    sim.counts.commercial * ECON.COMMERCIAL_INCOME * (sim.ordinances.curfew ? 0.9 : 1),
  );
  const income = tax + bounty + commerce;

  const buildings = sim.counts.residential + sim.counts.commercial + sim.counts.industrial;
  const maintenance = sim.counts.road * ECON.ROAD_UPKEEP + buildings * ECON.BUILDING_UPKEEP;
  let ordinanceUpkeep = 0;
  for (const key of Object.keys(sim.ordinances)) {
    if (sim.ordinances[key]) ordinanceUpkeep += ORDINANCE_INFO[key].upkeep;
  }
  // Power sources and services carry a monthly upkeep (M5).
  let services = 0;
  for (const kind of Object.keys(STRUCTURE_INFO)) {
    services += (sim.counts[kind] || 0) * STRUCTURE_INFO[kind].upkeep;
  }
  const expenses = maintenance + ordinanceUpkeep + services;

  return {
    income, expenses, net: income - expenses,
    lines: { tax, bounty, commerce, maintenance, ordinanceUpkeep, services },
  };
}

// Resolve the town's solvency after the month settles (M8). A negative treasury forces every
// ordinance off (and blocks re-enabling any while insolvent, see toggleOrdinance); after a short
// grace the funded municipal services are cut, so updateDread stops crediting their relief. Recovery
// (treasury back to zero or above) clears the cut, though the player must re-enable their ordinances.
function applyBankruptcy(sim) {
  if (sim.treasury < 0) {
    const wasCut = sim.servicesCut;
    sim.bankruptMonths++;
    for (const k of Object.keys(sim.ordinances)) sim.ordinances[k] = false;
    sim.servicesCut = sim.bankruptMonths >= BANKRUPT_GRACE;
    if (sim.servicesCut && !wasCut) {
      noteNews(sim, 'money', 'THE WATCH GOES UNPAID',
        'Constable and keeper walk off unpaid; the town is left to its own dread.');
    }
  } else {
    sim.bankruptMonths = 0;
    sim.servicesCut = false;
  }
}

// Ease the dread meter toward a target driven by industry and Deep Ones (up) and Scholars, the
// public-order ordinances, and the town's services (down or up). Chapels, the constabulary, and
// the asylum press dread down; shrines press it up (STRUCTURE_INFO.dread carries each sign).
function updateDread(sim) {
  const ordinanceRelief = (sim.ordinances.curfew ? 6 : 0) + (sim.ordinances.maskedProcessions ? 9 : 0);
  let structureDread = 0;
  for (const kind of Object.keys(STRUCTURE_INFO)) {
    const d = STRUCTURE_INFO[kind].dread;
    // A cut (unfunded) service stops working: its dread RELIEF goes dark while the town is insolvent.
    // Dread-RAISING structures (shrines) need no funding and keep their effect.
    if (sim.servicesCut && d < 0) continue;
    structureDread += (sim.counts[kind] || 0) * d;
  }
  const target = clampRange(
    sim.dreadBase
    + 2.0 * sim.counts.industrial
    + 0.03 * sim.pop.deepone
    - 0.04 * sim.pop.scholar
    - ordinanceRelief
    + structureDread,
    0, 100,
  );
  sim.dread = clampRange(sim.dread + (target - sim.dread) * 0.25, 0, 100);
}

// --- The Innsmouth Courier: headlines from real sim events (M7) ---------------------------
// A dry New England broadsheet sliding by degrees into cosmic dread. Headlines are generated from
// what actually happened in the sim this month; the newspaper overlay renders these strings.
const NEWS_CAP = 40;

const WRATH_HEADLINE = {
  flood: ['THE TIDE TAKES THE LOWER WARD', 'The sea has climbed the seawall in the night.'],
  awakening: ['THE GROUND HEAVES; RUIN IN THE STREETS', 'Whole rows are thrown down, and no man will say why.'],
  greening: ['UNNATURAL GROWTH CHOKES THE LANES', 'A green rot spreads block by block, past all cutting.'],
  burning: ['FIRE AND RIOT RUN THE STREETS', 'The mob has the torches, and will not be stilled.'],
  rift: ['A DISTRICT FOUND OUT OF TRUE', 'Surveyors report the streets no longer meet as once they did.'],
};

const OMEN_HEADLINE = {
  dagon: 'FISHERMEN REPORT THE WATER RUNNING BLACK',
  cthulhu: 'THE WHOLE TOWN SHARES A TROUBLED DREAM',
  shub: 'STRANGE SHOOTS BREAK THE COBBLESTONES',
  nyarlathotep: 'CROWDS GATHER MUTTERING AFTER DARK',
  yog: 'SURVEYORS FIND THE ANGLES WILL NOT HOLD',
};

const POP_MILESTONES = [50, 100, 250, 500, 1000, 2000];

function noteNews(sim, kind, headline, sub = '') {
  sim.events.push({ kind, headline, sub, year: sim.year, month: sim.month, tick: sim.tick });
  if (sim.events.length > NEWS_CAP) sim.events.shift();
}

// Compare month-over-month to file the Courier's headlines: gods sliding into omen, the first of a
// new class settling in, population milestones passed, the coffers running dry.
function detectNews(sim, before) {
  for (const g of GOD_LIST) {
    const was = favorStage(before.favor[g]);
    const now = favorStage(sim.favor[g]);
    if (now === FAVOR_STAGE.OMEN && was !== FAVOR_STAGE.OMEN && was !== FAVOR_STAGE.DIRE) {
      noteNews(sim, 'omen', OMEN_HEADLINE[g] || 'AN ILL OMEN OVER THE TOWN', GOD_INFO[g].omen);
    }
  }
  if (before.deepone === 0 && sim.pop.deepone > 0) {
    noteNews(sim, 'class', 'THE WATERFRONT KEEPS TO ITSELF', 'The old families are seen no more by day.');
  }
  if (before.cultist === 0 && sim.pop.cultist > 0) {
    noteNews(sim, 'class', 'A CONGREGATION GATHERS AFTER DARK', 'Lamps burn late where the shrine stands.');
  }
  const pop = sim.totalPopulation();
  for (const m of POP_MILESTONES) {
    if (before.pop < m && pop >= m) noteNews(sim, 'growth', `INNSMOUTH NUMBERS ${m} SOULS`, 'The town grows along the shore.');
  }
  if (before.treasury >= 0 && sim.treasury < 0) {
    noteNews(sim, 'money', 'TOWN COFFERS RUN DRY', 'The ledger is deep in the red.');
  }
}

// First-contact onboarding (M7): soft in-fiction teaching prompts, each fired once as the novel
// layer first touches the town. The UI shows one at a time and dismisses it.
const ONBOARDING = {
  shrine: 'A shrine draws the cult and raises the dread around it. Watch who your townsfolk become.',
  cultist: 'The Unwary do not stay where dread grows. Some have turned to the cult.',
  deepone: 'The waterfront has taken to the deep. The Deep Ones pay a sea-bounty, but dread rises.',
  dread: 'As dread climbs the gods grow hungry. Watch the Gods panel; a wrath is heralded first.',
  // M-b: the first time the water goes off, and the first time the deep is genuinely against the
  // town's ground. Both fire once, softly, in the world's own voice.
  water: 'The water has gone off in one of the mains. Press U to go below and look at it. A filter house can name what is in it; a flush carries it away.',
  below: 'Something has come up the pipes. Cap the fissures that feed it, keep the intakes in sweet ground, and do not leave a main foul.',
};
function detectOnboarding(sim) {
  const fire = (key) => {
    if (sim.onboarded[key]) return;
    sim.onboarded[key] = true;
    sim.hints.push(ONBOARDING[key]);
  };
  if (sim.counts.shrine > 0) fire('shrine');
  if (sim.pop.cultist > 0) fire('cultist');
  if (sim.pop.deepone > 0) fire('deepone');
  if (sim.dread >= 40) fire('dread');
  const wt = sim.water && sim.water.totals ? sim.water.totals : null;
  if (wt && (wt.suspect > 0 || wt.tainted > 0 || wt.infested > 0)) fire('water');
  if (sim.deep && sim.deep.totals && sim.deep.totals.presence >= PRESENCE_AT.present) fire('below');
}

// Exposure events (M8): the price of Scholars. A large campus in a dread-soaked town risks
// uncovering what should have stayed buried; an Exposure spikes the town's dread. Risk scales with
// the Scholar population and the standing dread, so a big campus is a live hazard the player weighs
// against the Scholars' tax base and their own small dread relief. (An Exposure that lifts dread past
// the Scholar threshold converts the campus away, a self-correcting feedback.)
export const EXPOSURE_MIN_SCHOLARS = 40; // below this the campus is too small to loose anything
function detectExposure(sim) {
  if (sim.pop.scholar < EXPOSURE_MIN_SCHOLARS) return;
  // Occasional, not monthly: an Exposure is a dramatic beat, so the risk stays low even for a big
  // dread-soaked campus (a first pass fired ~30%/month and flooded the Courier — a playtest catch).
  const risk = clampRange((sim.pop.scholar / 1600) * (sim.dread / 100), 0, 0.05);
  if (sim.rng.chance(risk)) {
    sim.dread = clampRange(sim.dread + 10, 0, 100);
    noteNews(sim, 'exposure', 'A SCHOLAR IS FOUND RAVING',
      'What the campus uncovered should have stayed buried. A dread runs through the town.');
  }
}

// Survival milestones (M8): the counter-beat to the doom clock. A town that holds together across
// the decades earns the Courier's notice. These fire once each, on the sim clock, from the years
// survived since founding; they give the endless game a shape of endurance against the Awakening.
const SURVIVAL_MARKS = [25, 50, 75, 100];
function detectSurvival(sim) {
  if (sim.ended) return;
  const survived = sim.year - sim.foundedYear;
  for (const mark of SURVIVAL_MARKS) {
    if (survived >= mark && !sim.survivalNoted[mark]) {
      sim.survivalNoted[mark] = true;
      noteNews(sim, 'survival', `INNSMOUTH HAS STOOD ${mark} YEARS`,
        'The town endures along the shore, and the deep still keeps its dreaming.');
    }
  }
}

// The Courier's flavor cycle (M9): a quiet month still fills a column. A rotating set of dry New
// England broadsheet filler that slides, by degrees, from harbor almanac into cosmic unease, in the
// same period register as the real headlines. Flavor only: detectFlavor runs only in a month where
// nothing real was filed, and no more than once every FLAVOR_COOLDOWN months, so filler can never
// crowd the record. The pool walks in order (no immediate repeat) and wraps. Deterministic: no RNG,
// so a seeded run and its save reload print the same column.
const FLAVOR_COOLDOWN = 4; // quiet months between fillers
const FLAVOR_FILLER = [
  ['TIDE TABLES AND SHIPPING NOTES', 'The packet from Newburyport is again behindhand.'],
  ['MARKET PRICES HOLD ALONG THE SHORE', 'Salt cod steady; the gold trade asks no questions.'],
  ['SELECTMEN TO MEET ON THE SEAWALL', 'The old stones want mending before the autumn gales.'],
  ['A FINE CATCH REPORTED OFF THE REEF', 'The boats come back low in the water, and the crews say little.'],
  ['NOTES FROM THE PARISH REGISTER', 'Fewer christenings this season, and stranger names given.'],
  ['THE FOG SITS LATE UPON THE HARBOR', 'Old hands cannot recall a summer so grey.'],
  ['GULLS SEEN INLAND IN GREAT NUMBER', 'They wheel over the rooftops and will not settle.'],
  ['A HYMN HEARD FROM THE WATER AT NIGHT', 'The watch reports singing, and no vessel to sing it.'],
  ['THE DEVIL REEF LIES QUIET, FOR NOW', 'Fishermen give it a wide berth, as their fathers did.'],
  ['LAMPS BURN LATE IN THE LOWER WARD', 'What business keeps them, no neighbor will say.'],
  ['THE WELLS TASTE OF SALT AND SOMETHING ELSE', 'The town draws its water higher up the hill.'],
  ['STRANGERS ASK THE ROAD TO THE SHORE', 'They are told it, and are not seen to leave.'],
];

function detectFlavor(sim) {
  if (sim.tick - sim.lastFlavorTick < FLAVOR_COOLDOWN) return;
  const idx = sim.flavorIndex % FLAVOR_FILLER.length;
  sim.flavorIndex++;
  sim.lastFlavorTick = sim.tick;
  const [headline, sub] = FLAVOR_FILLER[idx];
  noteNews(sim, 'flavor', headline, sub);
}



export { hasRoadNear, hasWaterNear, noteNews, FLAVOR_FILLER, FLAVOR_COOLDOWN };
