// The Deep Ones layer for INNSMOUTH 2000 (M-b of the underground system).
//
// M-a built a water utility. This is the month in which the water becomes dangerous. It carries four
// things, in the order the monthly step runs them:
//
//   1. DEEP PRESENCE, one hidden value per sea-connected region of the subsurface (src/aquifer.js).
//      It is not a population and there are no Deep One units: presence is how much of the deep is
//      pressed up against the town's ground. It grows from open fissures, dread, a neglected Dagon,
//      and mains left foul; it falls from sealing works, filter houses, the town's holy and civic
//      works, and from drawing the town's water out of sweet ground instead of brine.
//
//   2. CONTAMINATION, one taint value per length of main (stored on the tile, see tools.js). A works
//      standing on brackish or fissured ground takes taint on at its intake; the taint then spreads
//      along connected mains only, and faster where the pressure is down. Filter houses and flushing
//      take it back off.
//
//   3. WHAT THEY DO ABOUT IT: pressure-loss chokes on infested mains, sabotage of pump houses,
//      backflow into a clean stretch, and seepage that damps the ground above (which is what gives
//      the Greening its bridge inland, section 6).
//
//   4. WHAT THE TOWN HEARS: Courier headlines and the Old Priest's counsel, generated from the above
//      rather than scripted.
//
// The ratified depiction (open question 4) governs everything visible here: the Deep Ones are
// IMPLIED. Handprints on a pipe wall, glyphs cut around a fouled pump head, and only at a high
// presence, a shape in a flooded void. There are no monster sprites and no dungeon (anti-goal 7).
//
// Pure of canvas and DOM. Everything stochastic draws from sim.rng, and every rate is an exported
// constant so a tuning pass never has to read the algorithm.

import { TERRAIN } from './mapgen.js';
import {
  STRUCTURE_INFO, hasPipe, isWaterConductor, isWaterSource, isWaterWorks, isFilterHouse,
  QUALITY, TAINT_AT, qualityFor, taintOf, setTaint,
} from './tools.js';
import { SUBSTRATE, computeAquifer } from './aquifer.js';
import { PRESSURE } from './water.js';
import { OMEN_AT, DIRE_AT } from './gods.js';

// The 4 grid neighbours. Named apart from every other module's own table: the single-file build
// flattens all of src/ into one scope.
const DEEP_NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// --- Deep Presence -------------------------------------------------------------------------

export const PRESENCE_MAX = 100;
export const PRESENCE_STAGE = {
  DORMANT: 'dormant', STIRRING: 'stirring', PRESENT: 'present', TEEMING: 'teeming',
};
export const PRESENCE_AT = { stirring: 20, present: 45, teeming: 70 };
export const PRESENCE_LABEL = {
  dormant: 'Quiet', stirring: 'Stirring', present: 'Present', teeming: 'Teeming',
};
// What the player is shown instead of the number. Implied, per the ratified depiction.
export const PRESENCE_SIGN = {
  dormant: 'The void below lies quiet.',
  stirring: 'Webbed handprints on the pipe wall. Something has been down here.',
  present: 'Pale shapes gather in the flooded voids below.',
  teeming: 'The dark below is crowded, and it watches the pump heads.',
};

export function presenceStage(value) {
  const v = value || 0;
  if (v >= PRESENCE_AT.teeming) return PRESENCE_STAGE.TEEMING;
  if (v >= PRESENCE_AT.present) return PRESENCE_STAGE.PRESENT;
  if (v >= PRESENCE_AT.stirring) return PRESENCE_STAGE.STIRRING;
  return PRESENCE_STAGE.DORMANT;
}

// Every rate that moves presence, in one place. Monthly, before the scenario's pace multiplier.
export const PRESENCE_RATE = {
  DRIFT: 0.25, // the deep presses in on its own, slowly, forever
  PER_MOUTH: 0.55, // each open fissure is a door
  MOUTH_CAP: 6, // past which more doors add nothing (anti-goal 2: no runaway)
  PER_DREAD: 0.02, // a frightened town draws them
  PER_DEEPONE: 0.008, // and so does a waterfront that has already turned
  DAGON_DIRE: 1.3, // a god about to break loose over the water
  DAGON_OMEN: 0.6,
  DAGON_CALM_AT: 80, // the pact is orderly: they stop pushing (they do NOT leave)
  DAGON_CALM: 0.5,
  PER_FOUL_MAIN: 0.12, // a tainted main over the region is an invitation
  FOUL_CAP: 10,
  PER_SEAL: 0.35, // a capped fissure is a door shut
  PER_FILTER: 0.5, // sand beds and testing, funded
  FILTER_CAP: 4,
  PER_CIVIC: 0.22, // chapels, the asylum, the constabulary and their inspections
  CIVIC_CAP: 5,
  CLEAN_SOURCING: 0.6, // times the share of the town's works drawing sweet water
  FADE: 1.2, // an inland brine pocket with no road to the sea empties out
};

// --- contamination -------------------------------------------------------------------------

// The monthly risk a works takes taint on at its intake, by the ground it stands in.
export const INTAKE_RISK = { fresh: 0, brackish: 0.35, fissure: 0.75, sea: 0.75 };
export const INTAKE_PRESENCE_WEIGHT = 0.5; // presence/100 times this, added to the ground's risk
export const INTAKE_CREEP = 5; // taint a risky intake takes on every month, dependably
export const INTAKE_JUMP = 14; // ...plus the occasional lurch (clean one month, suspect the next)
export const INTAKE_CLEAN_DECAY = 4; // a sweet intake sheds what it once picked up

// How far BRINE ALONE can foul an intake: to just inside suspect, and no further. Salt makes water
// taste wrong; it does not put anything alive in it. Getting from there to tainted and on to infested
// takes DEEP PRESENCE, so the ceiling rises with how crowded the void beneath has become.
//
// This is the staging the spec asks for in two places at once (section 3's named states, and anti-goal
// 4: "the player needs symptoms before irreversible loss"). Without it a pump sunk in brackish ground
// went straight to infested inside a year, which made brackish ground a trap rather than a trade, and
// gave the player no suspect-then-tainted warning to act on. Caught by probing the proof town's
// trajectory month by month rather than only its end state.
// The ceiling tracks the presence STAGES rather than sliding through them, so the two vocabularies
// line up exactly: a quiet or merely stirring void can only ever make the water SUSPECT, a void with
// something in it can make it TAINTED, and only a teeming one can make it INFESTED. A player who
// learns to read the signs below has learned to predict the water, which is the whole readout.
export const INTAKE_BRINE_CEILING = TAINT_AT.suspect + 12;
export function intakeCeiling(presence) {
  const p = Math.max(0, Math.min(PRESENCE_MAX, presence || 0));
  const lerp = (from, to, t) => from + (to - from) * Math.max(0, Math.min(1, t));
  if (p < PRESENCE_AT.present) {
    // Quiet to stirring: within the suspect band, and never quite out of it.
    return lerp(INTAKE_BRINE_CEILING, TAINT_AT.tainted - 1, p / PRESENCE_AT.present);
  }
  if (p < PRESENCE_AT.teeming) {
    // Present: the tainted band.
    return lerp(TAINT_AT.tainted, TAINT_AT.infested - 1,
      (p - PRESENCE_AT.present) / (PRESENCE_AT.teeming - PRESENCE_AT.present));
  }
  // Teeming: all the way, if the void is full enough.
  return lerp(TAINT_AT.infested, 100, (p - PRESENCE_AT.teeming) / (PRESENCE_MAX - PRESENCE_AT.teeming));
}

export const SPREAD_GOOD = 0.22; // share of the gap to a foul neighbour closed on a pressurized main
export const SPREAD_LOW = 0.45; // ...twice as fast where the pressure is down (spec section 3)
export const SPREAD_DRY = 0.30; // a dead main neither flushes nor holds: it stews
export const SPREAD_MIN = 8; // below this a length is not foul enough to pass anything on
export const CLEAR_RATE = 3; // suspect water clears behind a sweet intake on a pressurized main
export const FILTER_INFESTED_FACTOR = 0.5; // a filter house alone barely touches an infested main
// One set of sand beds treats a fixed volume of water, so a filter house cleanses a SHORT main
// thoroughly and a sprawling one thinly. Without this a single filter house made any network immune
// for good, whatever it was drawing from, which took all the tension out of the milestone (caught by
// probing the proof town: sixty months on a brackish intake and the water was still sweet). It also
// gives filter houses a real planning decision: a big network wants more than one.
export const FILTER_REACH = 12; // lengths of main one filter house cleanses at full strength

// --- what they do --------------------------------------------------------------------------

export const CHOKE_CHANCE = 0.30; // per infested network per month
export const CHOKE_MONTHS = [2, 4];
export const SABOTAGE_BASE = 0.015; // per pump house per month, before everything else
export const SABOTAGE_PER_PRESENCE = 0.16; // times presence/100
export const SABOTAGE_DAGON_DIRE = 0.10;
export const SABOTAGE_DAGON_OMEN = 0.05;
export const SABOTAGE_GROUND = { fresh: 0, brackish: 0.03, fissure: 0.07, sea: 0.07 };
export const SABOTAGE_MONTHS = [3, 6];
export const BACKFLOW_CHANCE = 0.18; // per network carrying both foul and clean lengths
export const BACKFLOW_TAINT = 26;
export const SEEPAGE_CHANCE = 0.10; // per infested length of main per month
// How long the ground above stays damp. Temporary, per section 6, but it has to be long enough to
// actually FUNCTION as the Greening's bridge inland: the growth crawls about a ring a month for up to
// seven rings, so a six-month window meant the wrath had to already be almost on top of the leak for
// the bridge to ever matter. Ten months makes it a mechanic rather than a coincidence.
export const SEEPAGE_MONTHS = 10;

// A headline may not repeat inside this many months, so the Courier never becomes a water bulletin.
export const NEWS_COOLDOWN = 30;

// --- the monthly step ----------------------------------------------------------------------

// Run the Deep Ones' month. Reads sim.water (this month's pressure) and sim.aquifer, mutates the map
// (taint, sabotage and choke timers, damp ground), rebuilds sim.presence and sim.deep, and RETURNS
// the headlines it earned, for sim.js to file with the Courier. It never files them itself, which is
// what keeps this module free of any dependency on the sim module that calls it.
export function stepDeep(sim) {
  const news = [];
  if (!sim.aquifer) sim.aquifer = computeAquifer(sim.map, sim.aquiferOpts);
  const pace = deepPace(sim);
  const survey = surveyWorks(sim);
  const presence = stepPresence(sim, survey, pace);
  ageTimers(sim);
  intakeStep(sim, presence, pace, news);
  spreadStep(sim, pace);
  filterStep(sim);
  clearStep(sim);
  eventStep(sim, presence, pace, news);
  sim.deep = buildDeepState(sim, presence, survey);
  return news;
}

// The scenario's pressure scales (spec section 5), plus the Quiet Cove's opening grace window. A
// young town on the easy start gets its first year and a half before the contamination rolls bite.
export function deepPace(sim) {
  const p = sim.deepPace || {};
  const presence = p.presence ?? 1;
  let contam = p.contam ?? 1;
  const grace = sim.deepGrace || 0;
  if (grace > 0 && (sim.tick || 0) < grace) contam *= 0.25;
  return { presence, contam, inGrace: grace > 0 && (sim.tick || 0) < grace };
}

// Survey the town's water works once: where they stand, what ground they are in, and how many of
// them draw sweet water. "Clean fresh-water sourcing" is a town-wide posture, not a regional one, so
// it is measured here and applied to every region alike.
function surveyWorks(sim) {
  const { map, aquifer } = sim;
  const works = [];
  let sources = 0;
  let sweetSources = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!isWaterWorks(t)) continue;
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    const ground = aquifer.substrate[i] || SUBSTRATE.FRESH;
    works.push({ index: i, col, row, kind: t.structure.kind, ground, tile: t });
    if (!isWaterSource(t)) continue;
    const info = STRUCTURE_INFO[t.structure.kind];
    if (!info || !(info.water > 0)) continue;
    sources++;
    if (ground === SUBSTRATE.FRESH && taintOf(t) < TAINT_AT.suspect) sweetSources++;
  }
  const filters = works.filter((w) => isFilterHouse(w.tile)).length;
  return {
    works,
    sources,
    sweetSources,
    filters,
    cleanShare: sources > 0 ? sweetSources / sources : 0,
  };
}

// Advance every region's Deep Presence one month.
//
// Presence is keyed by TILE INDEX in sim.presence, and a region reads the highest value recorded at
// any tile it now holds. That is what makes it survive the map changing under it: when a Flood Tide
// merges two regions the new one inherits the worse of them rather than resetting, and a region that
// splits carries its reading into both halves. The value is written back to the region's anchor and
// every other entry for its tiles is dropped, so the ledger stays small.
function stepPresence(sim, survey, pace) {
  const { map, aquifer } = sim;
  const previous = sim.presence || {};
  const next = {};
  const byTile = new Map();
  const regions = [];
  for (const region of aquifer.regions) {
    let current = null;
    for (const i of region.tiles) {
      const v = previous[i];
      if (typeof v === 'number' && (current === null || v > current)) current = v;
    }
    if (current === null) current = region.seaConnected ? (sim.deepStart || 0) : 0;
    const local = regionSurvey(map, region);
    const value = clampPresence(current + presenceDelta(sim, region, local, survey) * pace.presence);
    next[region.id] = value;
    for (const i of region.tiles) byTile.set(i, value);
    regions.push({
      id: region.id,
      // Named `tileCount`, not `tiles`: sim.aquifer.regions[].tiles is the ARRAY of tile indexes, and
      // giving a count the same field name made a test index into a number and silently get undefined.
      // One field name, one type.
      tileCount: region.tiles.length,
      fissures: region.fissures.length,
      openFissures: region.openFissures,
      sealedFissures: region.sealedFissures,
      seaConnected: region.seaConnected,
      foulMains: local.foulMains,
      presence: value,
      stage: presenceStage(value),
    });
  }
  sim.presence = next;
  return { regions, byTile };
}

// What the town has put over one region: mains left foul, and works standing in it.
function regionSurvey(map, region) {
  let foulMains = 0;
  let filters = 0;
  let worksHere = 0;
  for (const i of region.tiles) {
    const t = map.tiles[i];
    if (hasPipe(t) && taintOf(t) >= TAINT_AT.tainted) foulMains++;
    if (isFilterHouse(t)) filters++;
    if (isWaterWorks(t)) worksHere++;
  }
  return { foulMains, filters, worksHere };
}

// One region's monthly presence change. Pure over the sim's readings, and exported so a test can
// pin the direction of each term without stepping a whole town.
export function presenceDelta(sim, region, local, survey) {
  // An inland pocket of brine with no road to the sea: whatever got in fades out.
  if (!region.seaConnected) return -PRESENCE_RATE.FADE;

  const dagon = sim.favor ? sim.favor.dagon : PRESENCE_RATE.DAGON_CALM_AT;
  let up = PRESENCE_RATE.DRIFT;
  up += PRESENCE_RATE.PER_MOUTH * Math.min(region.openFissures, PRESENCE_RATE.MOUTH_CAP);
  up += PRESENCE_RATE.PER_DREAD * (sim.dread || 0);
  up += PRESENCE_RATE.PER_DEEPONE * ((sim.pop && sim.pop.deepone) || 0);
  up += PRESENCE_RATE.PER_FOUL_MAIN * Math.min(local.foulMains, PRESENCE_RATE.FOUL_CAP);
  if (dagon <= DIRE_AT) up += PRESENCE_RATE.DAGON_DIRE;
  else if (dagon <= OMEN_AT) up += PRESENCE_RATE.DAGON_OMEN;

  let down = PRESENCE_RATE.PER_SEAL * region.sealedFissures;
  // Dagon's own reading, ratified: high favor does not mean no Deep Ones. It means the pact is
  // orderly, so the deep stops pressing. It never empties the void.
  if (dagon >= PRESENCE_RATE.DAGON_CALM_AT) down += PRESENCE_RATE.DAGON_CALM;
  down += PRESENCE_RATE.CLEAN_SOURCING * (survey ? survey.cleanShare : 0);
  // Funded works only: an insolvent town's filter houses and constables have stopped.
  if (!sim.servicesCut) {
    const counts = sim.counts || {};
    const filters = Math.min((survey ? survey.filters : 0), PRESENCE_RATE.FILTER_CAP);
    down += PRESENCE_RATE.PER_FILTER * filters;
    const civic = (counts.chapel || 0) + (counts.asylum || 0) + (counts.constabulary || 0);
    down += PRESENCE_RATE.PER_CIVIC * Math.min(civic, PRESENCE_RATE.CIVIC_CAP);
  }
  return up - down;
}

function clampPresence(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > PRESENCE_MAX ? PRESENCE_MAX : v;
}

// Run down the month timers: sabotage under repair, a choked main clearing, damp ground drying.
function ageTimers(sim) {
  const { map } = sim;
  for (const t of map.tiles) {
    if (t.structure && t.structure.sabotage > 0) {
      t.structure.sabotage -= 1;
      if (t.structure.sabotage <= 0) delete t.structure.sabotage;
    }
    if (t.pipe && t.pipe.choke > 0) {
      t.pipe.choke -= 1;
      if (t.pipe.choke <= 0) delete t.pipe.choke;
    }
    if (t.damp > 0) {
      t.damp -= 1;
      if (t.damp <= 0) delete t.damp;
    }
  }
}

// The risk that a works standing at this tile takes taint on at its intake, in [0,1]. Ground first,
// then how much of the deep is pressed against that ground. Pure and exported: this is the number a
// player is really deciding about when they choose where to sink a well.
export function intakeRisk(sim, index, presenceByTile = null) {
  const ground = sim.aquifer ? (sim.aquifer.substrate[index] || SUBSTRATE.FRESH) : SUBSTRATE.FRESH;
  const base = INTAKE_RISK[ground] ?? 0;
  const byTile = presenceByTile || (sim.deep ? sim.deep.presenceByTile : null);
  const presence = byTile && byTile.has(index) ? byTile.get(index) : 0;
  const risk = base + (presence / PRESENCE_MAX) * INTAKE_PRESENCE_WEIGHT;
  return risk < 0 ? 0 : risk > 1 ? 1 : risk;
}

// Every works takes on, or sheds, taint at its intake. A well sunk in sweet ground with nothing
// beneath it stays sweet indefinitely, which is the whole point of the spec's "move source inland".
function intakeStep(sim, presence, pace, news) {
  const { rng } = sim;
  let firstSalt = false;
  for (const w of worksOf(sim)) {
    const risk = intakeRisk(sim, w.index, presence.byTile);
    const before = taintOf(w.tile);
    if (risk <= 0) {
      setTaint(w.tile, before - INTAKE_CLEAN_DECAY);
      continue;
    }
    // How far this ground can foul this intake at all, given what is beneath it.
    const local = presence.byTile.has(w.index) ? presence.byTile.get(w.index) : 0;
    const ceiling = intakeCeiling(local);
    if (before >= ceiling) {
      // Already at what the ground and the void together can manage: it sits there, easing back a
      // little if the void has quieted since.
      setTaint(w.tile, Math.max(ceiling, before - INTAKE_CLEAN_DECAY));
      continue;
    }
    let after = before + risk * INTAKE_CREEP * pace.contam;
    if (rng.chance(Math.min(0.6, risk * 0.5 * pace.contam))) after += INTAKE_JUMP * pace.contam;
    const now = setTaint(w.tile, Math.min(ceiling, after));
    if (before < TAINT_AT.suspect && now >= TAINT_AT.suspect) firstSalt = true;
  }
  if (firstSalt && canFileNews(sim, 'salt')) {
    news.push({
      kind: 'water',
      headline: 'THE WELLS TASTE OF SALT',
      sub: 'The town draws its water higher up the hill, and says little about why.',
    });
  }
}

// The works on the map, freshly read (the survey is taken before the intake moves, so this re-reads
// rather than trusting a stale list).
function worksOf(sim) {
  const { map, aquifer } = sim;
  const out = [];
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!isWaterWorks(t)) continue;
    const col = i % map.cols;
    out.push({
      index: i, col, row: (i - col) / map.cols, tile: t,
      ground: aquifer.substrate[i] || SUBSTRATE.FRESH,
    });
  }
  return out;
}

// Taint spreads along CONNECTED MAINS ONLY, and faster where the pressure is down. Written as a
// diffusion over a snapshot, so it is order-independent and deterministic: no RNG, which is what
// lets a test assert the shape of the spread exactly. A shut valve is not a conductor, so the taint
// simply has nowhere to go through it.
function spreadStep(sim, pace) {
  const { map, water } = sim;
  const before = new Map();
  for (let i = 0; i < map.tiles.length; i++) {
    if (isWaterConductor(map.tiles[i])) before.set(i, taintOf(map.tiles[i]));
  }
  if (before.size === 0) return;
  const pressureOf = (i) => (water && water.pipes && water.pipes.has(i)
    ? water.pipes.get(i) : PRESSURE.DRY);
  for (const [i, mine] of before) {
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    let worst = 0;
    for (const [dc, dr] of DEEP_NB) {
      const nc = col + dc;
      const nr = row + dr;
      if (!map.inBounds(nc, nr)) continue;
      const ni = map.index(nc, nr);
      if (!before.has(ni)) continue; // not a conductor: nothing passes
      const v = before.get(ni);
      if (v > worst) worst = v;
    }
    if (worst < SPREAD_MIN || worst <= mine) continue;
    const state = pressureOf(i);
    const rate = state === PRESSURE.LOW ? SPREAD_LOW
      : state === PRESSURE.DRY ? SPREAD_DRY : SPREAD_GOOD;
    setTaint(map.tiles[i], mine + (worst - mine) * rate * pace.contam);
  }
}

// Filter houses cleanse the water in the main they stand on. Three limits, each from the spec:
//   - less effective against an infested network ("a filter house cannot cleanse an infested main
//     alone"), because what is in there is alive and not merely dissolved;
//   - thinner over a long main than a short one, because a set of sand beds treats a fixed volume;
//   - and it does NOT touch the INTAKE. A filter sits downstream of the works; it cleans the water,
//     not the ground the works is standing in. That is what keeps "move the source inland" the only
//     cure that stays cured, and what keeps the query's "the intake tastes of salt" true even in a
//     town that has filtered everything.
// An insolvent town's filter houses are shut, like every other funded service.
function filterStep(sim) {
  if (sim.servicesCut) return;
  const { map, water } = sim;
  if (!water || !water.components) return;
  const info = STRUCTURE_INFO.filterhouse;
  const per = info ? info.filter : 0;
  for (const comp of water.components) {
    if (comp.filters <= 0 || per <= 0) continue;
    const reach = Math.min(1, FILTER_REACH / Math.max(1, comp.tiles.length));
    let strength = per * comp.filters * reach;
    if (comp.quality === QUALITY.INFESTED) strength *= FILTER_INFESTED_FACTOR;
    if (strength <= 0) continue;
    for (const i of comp.tiles) {
      const t = map.tiles[i];
      if (isWaterSource(t)) continue; // the intake is the ground's business, not the filter's
      setTaint(t, taintOf(t) - strength);
    }
  }
}

// Suspect water clears on its own behind a sweet intake at good pressure (spec section 3). Anything
// worse does not: that needs a filter house, a flush, or new pipe.
function clearStep(sim) {
  const { map, water } = sim;
  if (!water || !water.components) return;
  for (const comp of water.components) {
    if (comp.pressure !== PRESSURE.GOOD) continue;
    if (comp.quality !== QUALITY.SUSPECT && comp.quality !== QUALITY.CLEAN) continue;
    let intakeClean = true;
    for (const i of comp.tiles) {
      const t = map.tiles[i];
      if (!isWaterSource(t)) continue;
      if (taintOf(t) >= TAINT_AT.suspect) { intakeClean = false; break; }
    }
    if (!intakeClean) continue;
    for (const i of comp.tiles) {
      const t = map.tiles[i];
      if (isWaterSource(t)) continue; // the intake has its own rule (intakeStep)
      setTaint(t, taintOf(t) - CLEAR_RATE);
    }
  }
}

// What the Deep Ones actually do to the water supply this month.
function eventStep(sim, presence, pace, news) {
  const { map, rng, water } = sim;
  const dagon = sim.favor ? sim.favor.dagon : 100;
  let choked = false;
  let sabotaged = false;
  let backflowed = false;

  // Per network: a choke on an infested main, and backflow into a clean stretch of a foul one.
  if (water && water.components) {
    for (const comp of water.components) {
      // Quality is re-read from the map, because the intake and the spread have both moved since
      // computeWater ran this month.
      let worst = 0;
      let cleanest = null;
      let cleanestIndex = -1;
      for (const i of comp.tiles) {
        const v = taintOf(map.tiles[i]);
        if (v > worst) worst = v;
        if (cleanest === null || v < cleanest) { cleanest = v; cleanestIndex = i; }
      }
      const quality = qualityFor(worst);

      // Pressure loss: an infested network knocks and loses its head for a few months.
      if (quality === QUALITY.INFESTED && comp.tiles.length > 0
          && rng.chance(CHOKE_CHANCE * pace.contam)) {
        const pick = comp.tiles[rng.int(0, comp.tiles.length - 1)];
        const t = map.tiles[pick];
        if (t.pipe) {
          t.pipe.choke = rng.int(CHOKE_MONTHS[0], CHOKE_MONTHS[1]);
          choked = true;
        }
      }

      // Backflow: a foul branch pushes into a clean stretch of the same network. A working filter
      // house prevents it; a shut valve prevents it structurally, by making them two networks.
      if (quality !== QUALITY.CLEAN && worst >= TAINT_AT.tainted
          && cleanest !== null && cleanest < TAINT_AT.suspect
          && !(comp.filters > 0 && !sim.servicesCut)
          && rng.chance(BACKFLOW_CHANCE * pace.contam)) {
        const col = cleanestIndex % map.cols;
        const row = (cleanestIndex - col) / map.cols;
        setTaint(map.tiles[cleanestIndex], cleanest + BACKFLOW_TAINT);
        map.tiles[cleanestIndex].backflow = sim.tick || 0;
        for (const [dc, dr] of DEEP_NB) {
          const nc = col + dc;
          const nr = row + dr;
          if (!map.inBounds(nc, nr)) continue;
          const n = map.tiles[map.index(nc, nr)];
          if (!isWaterConductor(n)) continue;
          setTaint(n, taintOf(n) + BACKFLOW_TAINT * 0.5);
          n.backflow = sim.tick || 0;
        }
        backflowed = true;
      }
    }
  }

  // Per works: sabotage of a pump house, likelier where the ground is open to the sea and likelier
  // still with Dagon neglected.
  for (const w of worksOf(sim)) {
    const info = STRUCTURE_INFO[w.tile.structure.kind];
    if (!info || !(info.water > 0)) continue; // a reservoir or filter house is not worth wrecking
    if (w.tile.structure.sabotage > 0) continue;
    const p = presence.byTile.has(w.index) ? presence.byTile.get(w.index) : 0;
    let chance = SABOTAGE_BASE
      + SABOTAGE_PER_PRESENCE * (p / PRESENCE_MAX)
      + (SABOTAGE_GROUND[w.ground] ?? 0);
    if (dagon <= DIRE_AT) chance += SABOTAGE_DAGON_DIRE;
    else if (dagon <= OMEN_AT) chance += SABOTAGE_DAGON_OMEN;
    if (rng.chance(chance * pace.contam)) {
      w.tile.structure.sabotage = rng.int(SABOTAGE_MONTHS[0], SABOTAGE_MONTHS[1]);
      sabotaged = true;
    }
  }

  // Seepage: an infested main leaks, and the ground above it goes damp. Only leaks and infested pipe
  // do this (section 6), so a clean, maintained network never hands the Greening a bridge.
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!hasPipe(t)) continue;
    if (qualityFor(taintOf(t)) !== QUALITY.INFESTED) continue;
    if (t.terrain === TERRAIN.DEEP || t.terrain === TERRAIN.SHALLOW) continue;
    if (!rng.chance(SEEPAGE_CHANCE * pace.contam)) continue;
    t.damp = SEEPAGE_MONTHS;
  }

  if (choked && canFileNews(sim, 'hymn')) {
    news.push({
      kind: 'water',
      headline: 'A HYMN HEARD IN THE MAINS',
      sub: 'The pipes knock all night in the lower ward, and the taps run thin.',
    });
  }
  if (sabotaged && canFileNews(sim, 'keeper')) {
    news.push({
      kind: 'water',
      headline: 'PUMP KEEPER MISSING AFTER NIGHT SHIFT',
      sub: 'The engine is found broken open, and no man will work that house alone.',
    });
  }
  if (backflowed && canFileNews(sim, 'boil')) {
    news.push({
      kind: 'water',
      headline: 'LOWER WARD ADVISED TO BOIL WATER',
      sub: 'The selectmen say it is a precaution. The water is green in the pail.',
    });
  }
}

// One headline of each sort per NEWS_COOLDOWN months, so the Courier reports the water without
// becoming a water bulletin. The ledger lives on the sim and is saved with it.
function canFileNews(sim, key) {
  if (!sim.deepNoted) sim.deepNoted = {};
  const last = sim.deepNoted[key];
  const tick = sim.tick || 0;
  if (typeof last === 'number' && tick - last < NEWS_COOLDOWN) return false;
  sim.deepNoted[key] = tick;
  return true;
}

// The state the renderer, the query, and the advisor all read. Signs, not numbers.
function buildDeepState(sim, presence, survey) {
  const { map } = sim;
  const glimpses = [];
  const marks = new Map();
  let worstPresence = 0;
  let teeming = 0;
  for (const r of presence.regions) {
    if (r.presence > worstPresence) worstPresence = r.presence;
    if (r.stage === PRESENCE_STAGE.TEEMING) teeming++;
  }
  // A shape in a flooded void, and only at a high presence: the ratified depiction is implied, with
  // rare glimpses. The open fissures of a teeming region are where a silhouette may be seen.
  for (const region of sim.aquifer.regions) {
    const value = presence.byTile.get(region.id);
    if (presenceStage(value) !== PRESENCE_STAGE.TEEMING) continue;
    for (const i of region.fissures) {
      if (map.tiles[i].sealed) continue;
      glimpses.push(i);
      if (glimpses.length >= 24) break;
    }
    if (glimpses.length >= 24) break;
  }
  // Handprints along an infested main; glyphs cut around a fouled pump head.
  let damp = 0;
  let sabotagedWorks = 0;
  let chokedMains = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (t.damp > 0) damp++;
    if (t.structure && t.structure.sabotage > 0) sabotagedWorks++;
    if (t.pipe && t.pipe.choke > 0) chokedMains++;
    const q = qualityFor(taintOf(t));
    if (isWaterWorks(t)) {
      if (q === QUALITY.TAINTED || q === QUALITY.INFESTED) marks.set(i, 'glyph');
    } else if (hasPipe(t) && q === QUALITY.INFESTED) {
      marks.set(i, 'handprint');
    }
  }
  const totals = sim.water && sim.water.totals ? sim.water.totals : {};
  return {
    regions: presence.regions,
    presenceByTile: presence.byTile,
    glimpses,
    marks,
    filters: survey.filters,
    cleanShare: survey.cleanShare,
    totals: {
      presence: worstPresence,
      teeming,
      suspect: totals.suspect || 0,
      tainted: totals.tainted || 0,
      infested: totals.infested || 0,
      sabotaged: sabotagedWorks,
      choked: chokedMains,
      damp,
    },
  };
}

// --- hooks other systems call ---------------------------------------------------------------

// A Flood Tide has taken ground: the sea is now in it. Push the presence of every region the water
// reached, spec section 6 ("Deep Presence spikes along flooded underground regions").
//
// The ledger is keyed by tile index and a drowned tile belongs to no region any more, so the spike is
// written to the drowned tiles AND their neighbours; the next presence step reads the highest value
// under each region and picks it up. Stale entries are dropped by that same rebuild.
export const FLOOD_PRESENCE_SPIKE = 22;
export function spikePresenceFrom(sim, tileIndexes, amount = FLOOD_PRESENCE_SPIKE) {
  if (!tileIndexes || tileIndexes.length === 0) return;
  if (!sim.presence) sim.presence = {};
  const { map } = sim;
  const bump = (i) => {
    const was = typeof sim.presence[i] === 'number' ? sim.presence[i] : 0;
    sim.presence[i] = clampPresence(Math.max(was, was + amount));
  };
  for (const i of tileIndexes) {
    bump(i);
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    for (const [dc, dr] of DEEP_NB) {
      const nc = col + dc;
      const nr = row + dr;
      if (!map.inBounds(nc, nr)) continue;
      bump(map.index(nc, nr));
    }
  }
}

// The presence reading at a tile, for the query and the renderer. 0 where the ground is sweet.
export function presenceAt(sim, index) {
  if (!sim.deep || !sim.deep.presenceByTile) return 0;
  return sim.deep.presenceByTile.get(index) || 0;
}

// The query's underground readout for a tile: what the ground holds, and what is in it. Plain
// English, period register, no em-dashes. The presence is never given as a number: the player is
// told what the survey party saw.
export function explainDeep(sim, col, row) {
  const { map, aquifer } = sim;
  const tile = map.tileAt(col, row);
  if (!tile || !aquifer) return [];
  const index = map.index(col, row);
  const ground = aquifer.substrate[index];
  const lines = [];
  if (ground && ground !== SUBSTRATE.SEA) lines.push(SUBSTRATE_TEXT[ground] || '');
  if (tile.sealed) lines.push('A sealing works caps it. The rock is shut.');
  const stage = presenceStage(presenceAt(sim, index));
  if (stage !== PRESENCE_STAGE.DORMANT) lines.push(PRESENCE_SIGN[stage]);
  if (tile.damp > 0) lines.push('The ground above is damp, and something green is taking to it.');
  return lines.filter(Boolean);
}

// The substrate lines as the query says them (aquifer.js carries the same text for its own callers;
// this is the underground-view phrasing, which names the danger rather than the geology).
const SUBSTRATE_TEXT = {
  fresh: 'The aquifer here runs fresh.',
  brackish: 'The aquifer here is brackish. The sea has been in this ground.',
  fissure: 'The rock is open here. A fissure runs down to the sea.',
};

// The Old Priest's water counsel, most urgent first. advisor.js folds these in ahead of its refrain.
export function deepAdvice(sim) {
  const out = [];
  const water = sim.water;
  const deep = sim.deep;
  if (!water || !water.components) return out;
  const infested = water.components.filter((c) => c.quality === QUALITY.INFESTED);
  const tainted = water.components.filter((c) => c.quality === QUALITY.TAINTED);
  const suspect = water.components.filter((c) => c.quality === QUALITY.SUSPECT);
  const choked = water.components.filter((c) => c.choked > 0);
  const starved = water.components.filter((c) => c.pressure === PRESSURE.LOW);

  if (infested.length) {
    out.push(infested.some((c) => c.filters > 0)
      ? 'The Filter House cannot cleanse an infested main alone. Flush it, or lift the pipe and lay it new.'
      : 'Something is living in the mains. Lift that pipe and lay it new, and cap the fissure that fed it.');
  } else if (tainted.length) {
    out.push('Close a valve or the taint will reach the hill ward. Then flush what is behind it.');
  } else if (suspect.length) {
    out.push('Several households report singing in the pipes. A filter house would tell us what is in the water.');
  }
  if (choked.length) out.push('The lower mains have lost pressure. They knock at night, and nobody will say why.');
  else if (starved.length) out.push('The lower mains have lost pressure. The works cannot meet what the town draws.');
  if (deep && deep.totals && deep.totals.sabotaged > 0) {
    out.push('A pump house has been broken open again. Set a watch on it, or move the intake inland.');
  }
  const brackish = brackishSources(sim);
  if (brackish > 0 && !infested.length) {
    out.push('The pump draws brackish water. Sink a well higher up the hill, where the ground runs sweet.');
  }
  if (deep && deep.totals && deep.totals.presence >= PRESENCE_AT.present) {
    out.push('Clean water is a mercy. A bargained water is a debt.');
  }
  return out;
}

// How many of the town's sources stand in ground the sea has been in.
function brackishSources(sim) {
  if (!sim.aquifer) return 0;
  let n = 0;
  for (const w of worksOf(sim)) {
    if (!isWaterSource(w.tile)) continue;
    const info = STRUCTURE_INFO[w.tile.structure.kind];
    if (!info || !(info.water > 0)) continue;
    if (w.ground === SUBSTRATE.BRACKISH || w.ground === SUBSTRATE.FISSURE) n++;
  }
  return n;
}
