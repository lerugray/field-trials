// staff.js — the non-combat worker caste (M3). Rooms ATTRACT applicants; you never pick from a
// roster (KEEP #3). Staffing is downstream of facilities: a productive department opens posts by
// its size, amenities house and feed the crew, and applicants arrive on their own. Pure and
// clock-free; all chance comes from the per-cycle seeded RNG.
import { CONFIG, ROOM, ARCHETYPE, createStaff, nextId, activeStaff } from './model.js';

// Archetype identity (DIRECTIONS fold 3): each archetype carries named traits so the systems
// differentiate a cast that licensed art cannot. wageSensitive: an unpaid post loses extra morale.
// hazardAverse: a stressed Cornerstone frightens them; the labouring castes are inured to it.
export const ARCHETYPE_TRAITS = Object.freeze({
  [ARCHETYPE.DRUDGE]: { wageSensitive: false, hazardAverse: false, home: ROOM.EXCAVATION },
  [ARCHETYPE.CLERK]: { wageSensitive: true, hazardAverse: true, home: ROOM.RECORDS },
  [ARCHETYPE.ARTIFICER]: { wageSensitive: true, hazardAverse: true, home: ROOM.FABRICATION },
  [ARCHETYPE.WARDEN]: { wageSensitive: false, hazardAverse: false, home: ROOM.HOLDING },
});

// Which archetype a productive department's posts attract. Treasury/Quarters/Commissary are
// amenities (capacity, housing, food), not post-bearing departments.
export const DEPT_ARCHETYPE = Object.freeze({
  [ROOM.EXCAVATION]: ARCHETYPE.DRUDGE,
  [ROOM.RECORDS]: ARCHETYPE.CLERK,
  [ROOM.FABRICATION]: ARCHETYPE.ARTIFICER,
  [ROOM.HOLDING]: ARCHETYPE.WARDEN,
});

function tilesOfType(f, type) {
  let n = 0;
  for (const room of f.rooms || []) if (room.type === type) n += room.size;
  return n;
}

// postCapacity(f) -> { drudge, clerk, artificer, warden }: how many posts the departments open.
export function postCapacity(f) {
  const cap = { [ARCHETYPE.DRUDGE]: 0, [ARCHETYPE.CLERK]: 0, [ARCHETYPE.ARTIFICER]: 0, [ARCHETYPE.WARDEN]: 0 };
  for (const room of f.rooms || []) {
    const arch = DEPT_ARCHETYPE[room.type];
    if (!arch) continue;
    cap[arch] += Math.max(1, Math.floor(room.size / CONFIG.staff.tilesPerPost));
  }
  return cap;
}

export function housingCapacity(f) {
  return CONFIG.staff.baseHousing + tilesOfType(f, ROOM.QUARTERS) * CONFIG.staff.housingPerQuartersTile;
}

export function foodCapacity(f) {
  return CONFIG.staff.baseFood + tilesOfType(f, ROOM.COMMISSARY) * CONFIG.staff.foodPerCommissaryTile;
}

function countByArchetype(staff, arch) {
  return staff.filter((s) => s.archetype === arch && (s.status === 'employed' || s.status === 'grieving')).length;
}

// openPosts(f) -> { archetype: n }: posts a department has opened that are not yet filled.
export function openPosts(f) {
  const cap = postCapacity(f);
  const crew = activeStaff(f);
  const open = {};
  for (const arch of Object.keys(cap)) open[arch] = Math.max(0, cap[arch] - countByArchetype(crew, arch));
  return open;
}

// attractApplicants(f, rng, report): where a department has an open post and there is a bed free,
// an applicant may arrive and take the post. Never a roster pick: the facility posts nothing, the
// applicant simply reports. Returns the number hired this cycle.
export function attractApplicants(f, rng, report, pushLine) {
  const housing = housingCapacity(f);
  const open = openPosts(f);
  let hired = 0;
  for (const arch of Object.keys(open)) {
    for (let i = 0; i < open[arch]; i++) {
      if (activeStaff(f).length >= housing) break; // no bed free
      if (!rng.stream('hiring').chance(CONFIG.staff.applicantChance)) continue;
      const s = createStaff({ id: nextId(f, 'staff'), archetype: arch });
      f.staff.push(s);
      hired += 1;
    }
  }
  if (hired > 0 && pushLine) {
    pushLine(report, {
      kind: 'hiring',
      numeric: `Cycle ${report.cycle}: ${hired} applicant(s) reported and were posted. Crew ${activeStaff(f).length}/${housing} housed.`,
      text: 'The applicants presented themselves against the posted amenities and were entered on the roll.',
    });
  }
  return hired;
}

// runNeeds(f, rng, report, pushLine): the per-cycle life of the crew. Food and rest fall; the
// Commissary and Quarters replenish only as many as they can cover; morale follows needs, pay and
// archetype temperament; then the neglected file grievances and, at the bottom, separate (resign or
// defect). The skeleton-crew floor holds the count from collapsing to zero (fold 11).
export function runNeeds(f, rng, report, pushLine) {
  const cfg = CONFIG.staff;
  const crew = activeStaff(f);

  // Decay, then feed/rest as far as the amenities reach (a shared pool, worst-first so the hungriest
  // are covered before the comfortable).
  for (const s of crew) {
    s.needs.food = Math.max(0, s.needs.food - cfg.needDecay);
    s.needs.rest = Math.max(0, s.needs.rest - cfg.needDecay);
  }
  replenish(crew, 'food', foodCapacity(f), cfg.needReplenish);
  replenish(crew, 'rest', housingCapacity(f), cfg.needReplenish);

  // Morale follows needs, pay and temperament.
  const hazardStressed = f.lossObject.condition < 50;
  for (const s of crew) {
    const traits = ARCHETYPE_TRAITS[s.archetype] || {};
    let delta = 0;
    if (s.needs.food < cfg.lowNeed) delta -= 8;
    if (s.needs.rest < cfg.lowNeed) delta -= 8;
    if (s.missedPaydays > 0) delta -= (traits.wageSensitive ? 6 : 4) * s.missedPaydays;
    if (traits.hazardAverse && hazardStressed) delta -= 5;
    if (s.needs.food > cfg.goodNeed && s.needs.rest > cfg.goodNeed && s.missedPaydays === 0) delta += 5;
    s.morale = Math.max(0, Math.min(100, s.morale + delta));
  }

  // Grievances from low morale (distinct from the payday grievance).
  let grievances = 0;
  for (const s of crew) {
    if (s.morale < cfg.grievanceMorale && s.status !== 'grieving') {
      s.status = 'grieving';
      s.grievances.push({ cycle: report.cycle, reason: 'morale' });
      grievances += 1;
    }
  }
  if (grievances > 0 && pushLine) {
    report.grievancesFiled += grievances;
    pushLine(report, {
      kind: 'grievance',
      numeric: `Cycle ${report.cycle}: ${grievances} grievance(s) filed on morale grounds.`,
      text: 'The grievances have been logged. Their logging is not an admission that conditions were deficient.',
      cause: 'Morale fell below the recorded threshold.',
    });
  }

  // Separation: at rock-bottom morale a post may defect to the incident or simply resign. The
  // skeleton floor holds. A defector strengthens the next raid (they know the section drawing).
  let resigned = 0;
  let defected = 0;
  for (const s of f.staff) {
    if (s.status !== 'grieving') continue;
    if (s.morale > cfg.defectMorale) continue;
    if (activeStaff(f).length <= CONFIG.bootstrap.skeletonCrewFloor) break;
    if (!rng.stream('morale').chance(0.5)) continue;
    if (rng.stream('morale').chance(0.4)) {
      s.status = 'defected';
      f.defectors = (f.defectors || 0) + 1;
      defected += 1;
    } else {
      s.status = 'resigned';
      resigned += 1;
    }
  }
  if ((resigned > 0 || defected > 0) && pushLine) {
    pushLine(report, {
      kind: 'separation',
      numeric: `Cycle ${report.cycle}: ${resigned} resignation(s), ${defected} defection(s).`,
      text: "The separations are recorded as voluntary. Any subsequent conduct by the separated is not the facility's to account for.",
      cause: 'Morale reached the recorded floor.',
    });
  }
  return { grievances, resigned, defected };
}

function replenish(crew, need, capacity, amount) {
  // Feed the lowest first so scarce amenity covers the hungriest.
  const ordered = crew.slice().sort((a, b) => a.needs[need] - b.needs[need]);
  let budget = capacity;
  for (const s of ordered) {
    if (budget <= 0) break;
    s.needs[need] = Math.min(100, s.needs[need] + amount);
    budget -= 1;
  }
}
