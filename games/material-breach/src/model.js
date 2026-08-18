// model.js — the data model, as pure data (DESIGN-SEED M0). Nothing here advances the sim;
// these are the shapes and the founding state. Advancement lives only in commitCycle() (cycle.js).
//
// The numeric skeleton (CONFIG) is the DIRECTIONS 2026-08-14 systems folds 11-15. Shapes are LAW;
// the numbers are provisional and retunable ±50% with the reasoning logged in PROGRESS.
import { createRng } from './rng.js';

export const VERSION = '0.0.0';

// The four phases of one cycle. The sim only ever moves forward through these, and only inside
// commitCycle(). ADMIN is untimed (the pacing law); the rest resolve without input.
export const PHASES = Object.freeze(['ADMIN', 'COMMIT', 'RAID', 'REPORT']);

// What a cell is made of. Contents of ROCK are unknown until surveyed (DIRECTIONS fold 1:
// excavation conceals until surveyed; the instrument reports nothing about rock it has not seen).
export const CELL = Object.freeze({
  ROCK: 'rock', // solid, unexcavated; the raw material
  GOLD: 'gold', // a gold seam inside the rock; income when worked
  FLOOR: 'floor', // excavated; becomes useful once claimed
});

// Departments, in the game's own register: posts and departments, never reference-game room names
// (clean-room, DESIGN-SEED §2). Each carries the post it opens and the KEEP mechanic it serves.
export const ROOM = Object.freeze({
  EXCAVATION: 'excavation', // the working face; where the worker caste digs (KEEP #5)
  TREASURY: 'treasury', // holds gold; its tile count sets treasury capacity (KEEP #2)
  RECORDS: 'records', // research/administration; bigger works faster (KEEP #2)
  FABRICATION: 'fabrication', // traps and doors are manufactured, with lead time (KEEP #6)
  HOLDING: 'holding', // detention, the head of the capture-and-convert pipeline (KEEP #9)
  QUARTERS: 'quarters', // rest; a staff need
  COMMISSARY: 'commissary', // food; a staff need
});

// The worker caste is a logistics layer, not an army (KEEP #5). Staff archetypes carry 2-3 named
// grievance triggers so the systems differentiate a cast that licensed art cannot (fold 3). These
// are declared here as the shape; the sim wires them from M3.
export const ARCHETYPE = Object.freeze({
  DRUDGE: 'drudge', // the worker caste: digs, claims, hauls, drags. Wage tier 1.
  CLERK: 'clerk', // records and correspondence. Wage tier 2.
  ARTIFICER: 'artificer', // fabrication of traps and doors. Wage tier 2.
  WARDEN: 'warden', // holding and conversion. Wage tier 3.
});

// The bureaucratic escalation ladder (DESIGN-SEED §1). Each rung serves a non-combat instrument
// that must be answered administratively; killing the officer never withdraws the notice.
export const RUNG = Object.freeze(['none', 'surveyor', 'auditor', 'inspector']);
export const INSTRUMENT = Object.freeze({
  none: null,
  surveyor: 'schedule-of-dilapidations',
  auditor: 'tax-lien',
  inspector: 'condemnation-order',
});

// Works-order and notice status vocabularies.
export const ORDER_STATUS = Object.freeze(['queued', 'in-progress', 'done', 'cancelled']);
export const NOTICE_STATUS = Object.freeze(['served', 'answered', 'expired', 'withdrawn']);

// The provisional numeric skeleton. One place to retune (DIRECTIONS systems folds 11-15).
export const CONFIG = Object.freeze({
  bootstrap: {
    startingTreasury: 400, // fold 11
    charterStipend: 12, // guaranteed per-cycle income until first gold seam income (fold 11)
    skeletonCrewFloor: 3, // staff never quit below this; they stay unpaid-and-grieving (fold 11)
    // Placeholder M1 content: the facility is inherited with a standing night shift, so payday,
    // needs and grievances have something to act on before the attract-applicants mechanic (M3).
    // The previous manager's crew. Retune / replace at M3.
    foundingCrew: 4,
  },
  // Placeholder M1 defence model (replaced by real excavation/staff/fabrication at M2-M4). Defence
  // is what stands between a raider party and the Cornerstone. Numbers are provisional; the LAW is
  // only that zero input loses (Gate 3).
  defense: {
    perClaimedCell: 1, // claimed territory is defensible ground (KEEP #7)
    perStaff: 1, // a standing crew slows a raid
  },
  treasury: {
    // Treasury cap = base (the founding charter's bonded capacity) + tiles × perTile (fold 15).
    // The base exists so the starting 400 has somewhere to sit before any treasury is dug.
    baseCapacity: 500,
    perTile: 100,
  },
  quality: {
    softCapTiles: 6, // quality is linear to here, then sub-linear (fold 12)
  },
  wages: {
    // 10 / 25 / 60 by tier (fold 15). Archetypes map onto these tiers.
    tiers: [10, 25, 60],
  },
  payday: {
    everyNCycles: 3, // fold 15
    grievanceAtMissed: 2, // 2 consecutive missed paydays file a grievance (fold 15)
    quitRollAtMissed: 3, // 3 consecutive trigger a quit roll (fold 15)
  },
  raid: {
    minCadence: 3, // roughly every 3-5 cycles, rung-dependent (fold 15)
    maxCadence: 5,
    // Placeholder M1 threat model. A party's threat climbs as the tenure runs; unopposed it
    // reaches the Cornerstone. Cycle 1 is scripted survivable (fold 5). Provisional numbers.
    threatBase: 6,
    threatPerCycle: 2,
    damagePerGap: 3, // retune: competent facilities need enough tenure to reach the Inspector
    scriptedFirstCycle: true, // the first raid cannot breach: it is the orientation raid (fold 5)
  },
  detention: {
    startingCells: 1, // capture-and-convert reachable before the economy can build it (fold 14)
  },
  // Placeholder M1 works orders: the one lever the operator has before excavation (M2) and
  // fabrication (M4) land. Fortification is bought, has lead time, and raises defence permanently.
  orders: {
    fortify: { cost: 50, lead: 1, amount: 2 },
    // Excavation (M2): carve a cell out of the rock. Adjacent-to-claimed only; on completion the
    // cell is excavated, surveyed and becomes claimable floor. KEEP #1 (carved, not placed).
    excavate: { cost: 15, lead: 1 },
    // Repair (M5): restore Cornerstone condition lost to a breaching raid, over a lead time.
    repair: { cost: 40, lead: 1, restore: 25 },
    // Fabrication (KEEP #6): traps and doors are MANUFACTURED, with lead time. A workshop and a
    // production queue, not a purchase menu. The order is only available while a Fabrication
    // department stands, it takes longer than a fortification because it is made rather than
    // built, and its yield scales with the department's quality (KEEP #2 made mechanical again).
    fabricate: { cost: 35, lead: 2, amount: 3 },
  },
  // Territory (M2). Claimed floor is defensible and workable; claiming spreads one ring per cycle
  // from claimed cells into adjacent excavated floor (KEEP #7). A claimed gold seam yields income.
  terrain: {
    claimSpreadPerCycle: 1, // rings of claim spread applied each COMMIT
    goldPerSeamPerCycle: 8, // income from each claimed, worked gold seam
  },
  // Staff (M3). Rooms ATTRACT applicants; you never pick from a roster (KEEP #3). A productive
  // department opens posts by its size; amenities (Quarters, Commissary) house and feed the crew.
  staff: {
    tilesPerPost: 2, // a productive department opens one post per this many tiles (min 1)
    housingPerQuartersTile: 2, // beds per Quarters tile
    foodPerCommissaryTile: 2, // covers per Commissary tile
    baseHousing: 4, // the inherited crew is already housed (the founding footprint)
    baseFood: 4,
    applicantChance: 0.6, // chance per cycle that one open, housed post is filled by an applicant
    needDecay: 14, // food and rest fall this much each cycle
    needReplenish: 22, // amenities restore this much each cycle, up to capacity
    lowNeed: 30, // below this a need drags morale
    goodNeed: 70, // above this (and paid) morale recovers
    defectMorale: 15, // at or below this morale a neglected post may defect or resign
    grievanceMorale: 30, // below this a grievance is filed
  },
  // The bureaucratic escalation ladder (M5). Escalation advances on missed deadlines and unresolved
  // findings, never on elapsed time alone (fold 13). Each rung serves a non-combat instrument with a
  // deadline in cycles; answering is administrative; killing the officer never withdraws the notice.
  ladder: {
    softenAfterOnTimeCycles: 3, // 3 consecutive on-time answered cycles soften the rung one step (fold 13)
    firstPressureToServe: 8, // dossier target: the first officer follows eight filed incidents
    pressureToServe: 5, // later officers follow five further findings, subject to the plateau floor
    minimumRungGap: 5, // service-to-service cycles; preserves a real local-dominance plateau
    pressurePerIncident: 1, // every signed-over incident produces an administrative finding
    pressurePerBreach: 1, // a breach adds one further finding beyond the incident itself
    deadlines: { surveyor: 4, auditor: 4, inspector: 3 }, // cycles to answer each instrument (fold 10)
    answerCost: { surveyor: 9, auditor: 12, inspector: 15 }, // priced from observed holdings at each rung
    ignoreConditionHit: 10, // retune: an unanswered schedule shortens the tenure without erasing a phase
  },
  // Detention and conversion (M5, KEEP #9). Repelled raiders can be captured into Holding cells and
  // converted, over cycles, into working staff. Defence produces capital instead of only consuming it.
  conversion: { captureChance: 0.5, lead: 2 },
  // The closing score (Ray-ratified: tenure + solvency, no win screen). Cycles survived weighted by
  // the solvency record.
  scoring: { perCycle: 10 },
  grid: {
    cols: 24,
    rows: 16,
    goldSeamRate: 0.06, // fraction of rock cells that hide a gold seam
  },
});

// wageForTier(1|2|3) -> gold. Tier is 1-indexed to read like the design.
export function wageForTier(tier) {
  return CONFIG.wages.tiers[tier - 1] ?? CONFIG.wages.tiers[0];
}

// The wage tier each archetype is hired at.
const ARCHETYPE_TIER = Object.freeze({
  [ARCHETYPE.DRUDGE]: 1,
  [ARCHETYPE.CLERK]: 2,
  [ARCHETYPE.ARTIFICER]: 2,
  [ARCHETYPE.WARDEN]: 3,
});

// roomQuality(tileCount) -> effectiveness multiplier. Room size drives effectiveness (KEEP #2),
// and returns diminish past the soft cap so a single maximised room cannot win (fold 12,
// degenerate probe). At exactly softCap tiles the multiplier is 1.0.
export function roomQuality(tileCount) {
  const cap = CONFIG.quality.softCapTiles;
  if (tileCount <= 0) return 0;
  if (tileCount <= cap) return tileCount / cap; // linear ramp up to the cap
  return 1 + Math.sqrt(tileCount - cap) * 0.1; // sub-linear beyond it
}

// treasuryCapacity(treasuryTiles) -> gold ceiling. KEEP #2 made mechanical (fold 15).
export function treasuryCapacity(treasuryTiles) {
  return CONFIG.treasury.baseCapacity + treasuryTiles * CONFIG.treasury.perTile;
}

// countClaimed(facility) -> number of claimed floor cells. Claimed territory is defensible.
export function countClaimed(facility) {
  let n = 0;
  for (const row of facility.grid) for (const cell of row) if (cell.claimed) n++;
  return n;
}

// Staff who still turn up: employed or grieving (grieving staff still stand a post), not resigned.
export function activeStaff(facility) {
  return facility.staff.filter((s) => s.status === 'employed' || s.status === 'grieving');
}

// detentionCapacity(facility) -> how many captives can be held: the free founding cell plus the
// tiles of any Holding department (KEEP #9). Capture-and-convert produces capital from defence.
export function detentionCapacity(facility) {
  let holding = 0;
  for (const room of facility.rooms || []) if (room.type === ROOM.HOLDING) holding += room.size;
  return CONFIG.detention.startingCells + holding;
}

// facilityDefense(facility) -> the placeholder M1 defence value standing between raiders and the
// Cornerstone: fortification plus claimed ground plus the standing crew. Replaced at M2-M4.
export function facilityDefense(facility) {
  return (
    facility.fortify +
    countClaimed(facility) * CONFIG.defense.perClaimedCell +
    activeStaff(facility).length * CONFIG.defense.perStaff +
    worksDefense(facility)
  );
}

// The manufactured works: the doors and traps a Fabrication department has produced (KEEP #6).
// Kept as its own register rather than folded into `fortify`, because a fortification is bought and
// a door is MADE, and the ledger has to be able to tell the player which is which.
export function worksDefense(facility) {
  return (facility.works || []).reduce((sum, w) => sum + w.defense, 0);
}

// ---- pure data factories -------------------------------------------------------------------

let makeCell = (kind) => ({
  kind, // one of CELL
  excavated: false, // dug out of the rock yet?
  claimed: false, // claimed territory becomes useful (KEEP #7)
  surveyed: false, // has the instrument seen it? (fold 1)
  roomType: null, // which department this cell is designated to, if any (one of ROOM)
});

export function createStaff({ id, archetype }) {
  const tier = ARCHETYPE_TIER[archetype] ?? 1;
  return {
    id,
    archetype,
    tier,
    wage: wageForTier(tier),
    morale: 50, // 0..100
    needs: { food: 100, rest: 100 }, // 0..100, decay is M3's job
    grievances: [], // filed grievances accumulate here
    missedPaydays: 0,
    status: 'employed', // employed | grieving | resigned | converted
    postId: null, // the post this staffer fills, if assigned
  };
}

export function createRoom({ id, type, cells = [] }) {
  return {
    id,
    type, // one of ROOM
    cells: cells.slice(), // [{x,y}] claimed footprint
    get size() {
      return this.cells.length;
    },
  };
}

export function createPost({ id, type, roomId }) {
  return {
    id,
    type, // the post opened by a room; mirrors ROOM keys for M0
    roomId,
    staffId: null, // who fills it
  };
}

export function createOrder({ id, kind, target, leadCycles }) {
  return {
    id,
    kind, // e.g. 'excavate', 'claim', 'build', 'fabricate', 'repair'
    target, // cell coord, room id, or item spec
    leadCycles, // how many cycles until it completes (KEEP #6: manufacture has lead time)
    cyclesRemaining: leadCycles,
    status: 'queued', // one of ORDER_STATUS
  };
}

export function createNotice({ id, rung, deadlineCycles, cycleServed }) {
  return {
    id,
    rung, // one of RUNG
    instrument: INSTRUMENT[rung], // the served document
    deadlineCycles, // how many cycles the facility has to answer
    cyclesRemaining: deadlineCycles, // stamped on the notice itself (fold 10)
    cycleServed,
    cycleAnswered: null, // stamped by the timely ADMIN action; runLadder counts the filing once
    status: 'served', // one of NOTICE_STATUS
  };
}

// createFacility({ seed, cols, rows }) -> the founding state, as pure data. Deterministic in the
// seed. Lays a small claimed footprint around the loss object so the operator is not fully blind
// (the rest of the map is unsurveyed rock, per fold 1), and scatters gold seams into the rock.
export function createFacility({ seed = 'material-breach', cols, rows } = {}) {
  const nCols = cols ?? CONFIG.grid.cols;
  const nRows = rows ?? CONFIG.grid.rows;
  const rng = createRng(seed);
  const seams = rng.stream('geology');

  // All rock to start; scatter gold seams; leave the rest solid and unsurveyed.
  const grid = [];
  for (let y = 0; y < nRows; y++) {
    const row = [];
    for (let x = 0; x < nCols; x++) {
      const kind = seams.chance(CONFIG.grid.goldSeamRate) ? CELL.GOLD : CELL.ROCK;
      row.push(makeCell(kind));
    }
    grid.push(row);
  }

  // The loss object sits at the centre. One loss object, a single thing the raiders walk toward
  // (KEEP #8). Named THE CORNERSTONE: it bears the founding charter; when it is reached both the
  // structure and the charter are breached, filed as one event. Register call, listed to ratify.
  const cx = Math.floor(nCols / 2);
  const cy = Math.floor(nRows / 2);
  const lossObject = {
    id: 'cornerstone',
    label: 'the Cornerstone',
    cell: { x: cx, y: cy },
    condition: 100, // 0 = breached; the terminal loss state
  };

  // A small founding footprint: the loss-object cell and its orthogonal neighbours are excavated,
  // claimed, surveyed floor. Everything else stays unknown rock.
  const footprint = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx + 1, y: cy },
    { x: cx, y: cy - 1 },
    { x: cx, y: cy + 1 },
  ];
  for (const { x, y } of footprint) {
    if (x < 0 || y < 0 || x >= nCols || y >= nRows) continue;
    const cell = grid[y][x];
    cell.kind = CELL.FLOOR;
    cell.excavated = true;
    cell.claimed = true;
    cell.surveyed = true;
  }

  const facility = {
    version: VERSION,
    seed,
    dims: { cols: nCols, rows: nRows },
    status: 'active', // active | condemned | insolvent (the two terminal loss states from M5)
    cycle: { number: 1, phase: 'ADMIN' },
    treasury: {
      gold: CONFIG.bootstrap.startingTreasury,
      capacity: treasuryCapacity(0), // no treasury tiles yet; base capacity only
    },
    fortify: 0, // placeholder M1 defence investment, raised by a completed fortify order
    grid,
    rooms: [],
    posts: [],
    staff: [], // filled below with the inherited crew (placeholder content)
    orders: [],
    notices: [],
    ladder: {
      rung: 'none', // current escalation rung (RUNG)
      pressure: 0, // accrues on missed deadlines / unresolved findings, never on elapsed time (fold 13)
      onTimeStreak: 0, // timely answered instruments; 3 softens the rung (fold 13)
      condemned: false, // set when a condemnation order lapses unanswered (terminal)
      condemnationWithdrawn: false, // set when a condemnation is answered administratively (the secret)
    },
    detention: {
      cells: CONFIG.detention.startingCells, // free capacity so capture-and-convert is reachable (fold 14)
    },
    captives: [], // repelled raiders taken into Holding, converting into staff over cycles (KEEP #9)
    works: [], // manufactured doors and traps, produced by Fabrication with lead time (KEEP #6)
    lossObject,
    // Payroll and tenure bookkeeping the sim reads. Never wall-clock time.
    payroll: { lastPaidCycle: 0 }, // the cycle payday was last observed
    defectors: 0, // staff who separated to the incident; they strengthen later raids
    tenure: {
      cyclesSurvived: 0, // how long the facility stood; half of the closing solvency score (M5)
      lowestSolvency: CONFIG.bootstrap.startingTreasury, // the worst the treasury reached
    },
    score: null, // the closing score, set at termination (tenure + solvency; Ray-ratified)
    counters: { nextId: 1 },
    log: [], // the loud-failure / in-register event log; populated from M1
  };

  // Seed the inherited crew (placeholder M1 content). Deterministic: ids mint in order.
  for (let i = 0; i < CONFIG.bootstrap.foundingCrew; i++) {
    facility.staff.push(createStaff({ id: nextId(facility, 'staff'), archetype: ARCHETYPE.DRUDGE }));
  }

  return facility;
}

// scoreOf(facility) -> the closing score (Ray-ratified: tenure + solvency, no win screen). Cycles
// survived weighted, plus the solvency held at close. There is no victory; this is how a tenure is
// recorded when it ends at condemnation or insolvency.
export function scoreOf(facility) {
  return facility.tenure.cyclesSurvived * CONFIG.scoring.perCycle + Math.max(0, facility.treasury.gold);
}

// A tiny deterministic id minter that reads/writes the facility's own counter (no Math.random).
export function nextId(facility, prefix) {
  const n = facility.counters.nextId++;
  return `${prefix}-${n}`;
}
