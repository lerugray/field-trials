// Deterministic five-seed ladder dossier. This is the headless competent policy used to price
// escalation against the economy that actually exists in play, rather than against starting gold.
//
// Run: node scripts/measure-ladder.mjs
import { createFacility, ROOM, CELL } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import {
  answerNotice,
  queueRepair,
  queueExcavate,
  queueFortify,
  queueFabricate,
  designate,
} from '../src/actions.js';
import { activeNotice } from '../src/ladder.js';
import { canExcavate } from '../src/grid.js';

const SEEDS = ['a', 'b', 'c', 'd', 'e'];
const CEILING = 120;
const MAX_EXCAVATIONS_PER_CYCLE = 5;
const ROOM_ORDER = [
  ROOM.EXCAVATION,
  ROOM.TREASURY,
  ROOM.RECORDS,
  ROOM.FABRICATION,
  ROOM.HOLDING,
  ROOM.QUARTERS,
  ROOM.COMMISSARY,
];

function designateClaimedFloor(facility) {
  for (let y = 0; y < facility.dims.rows; y++) {
    for (let x = 0; x < facility.dims.cols; x++) {
      const cell = facility.grid[y][x];
      if (!cell.claimed || cell.kind !== CELL.FLOOR || cell.roomType) continue;
      designate(facility, x, y, ROOM_ORDER[(x + y) % ROOM_ORDER.length]);
    }
  }
}

function excavateOutward(facility) {
  let queued = 0;
  for (let y = 0; y < facility.dims.rows && queued < MAX_EXCAVATIONS_PER_CYCLE; y++) {
    for (let x = 0; x < facility.dims.cols && queued < MAX_EXCAVATIONS_PER_CYCLE; x++) {
      if (!canExcavate(facility, x, y)) continue;
      if (queueExcavate(facility, x, y).ok) queued += 1;
    }
  }
  return queued;
}

export function runCompetentPolicy(seed) {
  let facility = createFacility({ seed });
  const arrivals = { surveyor: null, auditor: null, inspector: null };
  const holdingsAtOpenNotice = [];
  const answered = [];

  while (facility.status === 'active' && facility.tenure.cyclesSurvived < CEILING) {
    const notice = activeNotice(facility);
    if (notice) {
      holdingsAtOpenNotice.push({ cycle: facility.cycle.number, rung: notice.rung, gold: facility.treasury.gold });
      const result = answerNotice(facility, notice.id);
      if (result.ok) answered.push({ cycle: facility.cycle.number, rung: notice.rung, cost: result.cost });
    }

    if (facility.lossObject.condition < 100) queueRepair(facility);
    designateClaimedFloor(facility);
    excavateOutward(facility);
    queueFortify(facility);
    queueFabricate(facility);

    facility = commitCycle(facility);
    for (const noticeServed of facility.notices) {
      if (arrivals[noticeServed.rung] === null) arrivals[noticeServed.rung] = noticeServed.cycleServed;
    }
  }

  const reached = Object.entries(arrivals).filter(([, cycle]) => cycle !== null).map(([rung]) => rung);
  return {
    seed,
    cycles: facility.tenure.cyclesSurvived,
    close: facility.status,
    highestRung: reached.at(-1) || 'none',
    answered,
    arrivals,
    gaps: {
      surveyorToAuditor:
        arrivals.surveyor !== null && arrivals.auditor !== null ? arrivals.auditor - arrivals.surveyor : null,
      auditorToInspector:
        arrivals.auditor !== null && arrivals.inspector !== null ? arrivals.inspector - arrivals.auditor : null,
    },
    holdingsAtOpenNotice,
    closingGold: facility.treasury.gold,
    closingCondition: facility.lossObject.condition,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(JSON.stringify(SEEDS.map(runCompetentPolicy), null, 2));
}
