// raid.js — the raid resolver (M4). A raider party enters the section and approaches the Cornerstone
// (KEEP #8); the engagement auto-resolves with no input, deterministically from the seed. The
// resolver produces a step-log so the raid is WATCHABLE as movement on the cutaway (DIRECTIONS
// fold 4), not merely a tick. Pure and clock-free.
//
// The OUTCOME model (threat vs defence -> structural loss) is the tuned M1/M2 balance the degenerate
// probe stands on; M4 wraps it in a party, an approach path and a step-log, and adds objectives and
// credentials (the credentialed officers arrive at M5).
import { CONFIG, facilityDefense, activeStaff, detentionCapacity, nextId } from './model.js';
import { createRng } from './rng.js';

// A deterministic entry cell on the section's edge, biased to a side by the raid stream.
function pickEntry(f, rng) {
  const { cols, rows } = f.dims;
  const side = rng.stream('raid').int(0, 4);
  if (side === 0) return { x: 0, y: rng.stream('raid').int(0, rows) };
  if (side === 1) return { x: cols - 1, y: rng.stream('raid').int(0, rows) };
  if (side === 2) return { x: rng.stream('raid').int(0, cols), y: 0 };
  return { x: rng.stream('raid').int(0, cols), y: rows - 1 };
}

// A straight-line approach path (Bresenham) from the entry to the Cornerstone. The cutaway reads it
// as the party crossing the section toward the loss object.
function linePath(from, to) {
  const path = [];
  let x0 = from.x;
  let y0 = from.y;
  const dx = Math.abs(to.x - x0);
  const dy = -Math.abs(to.y - y0);
  const sx = x0 < to.x ? 1 : -1;
  const sy = y0 < to.y ? 1 : -1;
  let err = dx + dy;
  // Bound the loop so a bad input can never spin forever (loud-failure discipline).
  for (let guard = 0; guard < 1000; guard++) {
    path.push({ x: x0, y: y0 });
    if (x0 === to.x && y0 === to.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return path;
}

// Build the step-log: the party walks the path while its strength attrits from `size` at the edge
// to `remaining` at the core. Each step records the head position and the strength then standing.
function buildSteps(path, size, remaining) {
  const steps = [];
  const n = Math.max(1, path.length - 1);
  for (let i = 0; i < path.length; i++) {
    const t = i / n;
    const strength = Math.round(size + (remaining - size) * t);
    const event = i === path.length - 1 ? (remaining > 0 ? 'reached' : 'repelled') : 'advance';
    steps.push({ pos: path[i], strength: Math.max(0, strength), event });
  }
  return steps;
}

// planRaid: the party and its approach, plus the threat/defence numbers that decide the outcome.
export function planRaid(f, rng, cycle) {
  const cfg = CONFIG.raid;
  const jitter = rng.stream('raid').between(-1, 1);
  const defectorThreat = f.defectors || 0; // defectors know the section and strengthen the party
  const threat = Math.max(0, cfg.threatBase + cfg.threatPerCycle * (cycle - 1) + jitter + defectorThreat);
  const defense = facilityDefense(f);
  const scripted = cfg.scriptedFirstCycle && cycle === 1; // the orientation raid cannot breach
  const gap = scripted ? Math.min(0, threat - defense) : threat - defense;
  const size = Math.max(2, Math.round(threat / 3));
  const entry = pickEntry(f, rng);
  const path = linePath(entry, f.lossObject.cell);
  return { threat, defense, gap, scripted, size, objective: 'loot', credentials: false, entry, path };
}

// intelMemo(f): the pre-commit sighting (DIRECTIONS fold 2). Peeks the raid that THIS cycle's
// sign-over will resolve, deterministically and without applying it, and reports it vaguely: a size
// range, never the exact number. Planning is never fully blind, but the memo is imprecise and the
// raid stays auto-resolved.
export function intelMemo(f) {
  const rng = createRng(`${f.seed}:cycle:${f.cycle.number}`);
  const plan = planRaid(f, rng, f.cycle.number);
  const low = Math.max(1, plan.size - 1);
  const high = plan.size + 1;
  return {
    estimateLow: low,
    estimateHigh: high,
    line: `An unidentified party was observed on the access road. Party size estimated ${low} to ${high}. Objective not yet determined.`,
  };
}

// resolveRaid: run the engagement, apply its outcome to the facility, attach a replay to
// facility.lastRaid, and file the report lines. `pushLine` is the report writer from sim.js.
export function resolveRaid(f, rng, report, pushLine) {
  const cfg = CONFIG.raid;
  const plan = planRaid(f, rng, report.cycle);
  const reached = plan.gap > 0;

  let damage = 0;
  let staffLost = 0;
  if (reached) {
    damage = plan.gap * cfg.damagePerGap;
    f.lossObject.condition = Math.max(0, f.lossObject.condition - damage);
    if (rng.stream('raid').chance(0.5) && activeStaff(f).length > 0) {
      activeStaff(f)[0].status = 'resigned'; // a casualty vacates a post
      staffLost = 1;
    }
  }
  const raidersReduced = Math.max(0, Math.min(plan.defense, plan.threat));

  // Capture-and-convert (KEEP #9): a repelled raider may be taken into Holding, if a cell is free.
  let captured = 0;
  if (raidersReduced > 0 && f.captives.length < detentionCapacity(f) && rng.stream('raid').chance(CONFIG.conversion.captureChance)) {
    f.captives.push({ id: nextId(f, 'captive'), cyclesToConvert: CONFIG.conversion.lead });
    captured = 1;
  }
  // Party strength surviving to the core: proportion that got past the defence.
  const survived = reached
    ? Math.max(1, plan.size - Math.round(plan.size * Math.min(1, plan.defense / Math.max(1, plan.threat))))
    : 0;
  const steps = buildSteps(plan.path, plan.size, survived);

  f.lastRaid = {
    cycle: report.cycle,
    party: { size: plan.size, objective: plan.objective, credentials: plan.credentials },
    entry: plan.entry,
    path: plan.path,
    steps,
    reachedCore: reached,
    damage,
    raidersReduced,
    staffLost,
    captured,
  };

  report.casualties.staff += staffLost;
  report.casualties.raiders += raidersReduced;
  report.structuralDamage += damage;

  writeRaidLines(f, report, plan, { reached, damage, staffLost }, pushLine);
  if (captured > 0) {
    pushLine(report, {
      kind: 'capture',
      numeric: `Cycle ${report.cycle}: ${captured} raider(s) taken into Holding. Detention ${f.captives.length}/${detentionCapacity(f)} occupied.`,
      text: 'The detainee was processed into Holding pending review. Their prior affiliation is treated as concluded.',
    });
  }
  return f;
}

function writeRaidLines(f, report, plan, out, pushLine) {
  const cycle = report.cycle;
  if (plan.scripted) {
    pushLine(report, {
      kind: 'raid',
      numeric: `Incident ${cycle}: party of ${plan.size} (objective ${plan.objective}) observed, threat ${Math.max(0, plan.threat)} vs defence ${plan.defense}. Cornerstone ${f.lossObject.condition}/100.`,
      text: 'An unidentified party was observed on the access road and withdrew. The facility was oriented to the incident and sustained no structural loss.',
    });
    return;
  }
  if (out.reached) {
    pushLine(report, {
      kind: 'raid',
      numeric: `Incident ${cycle}: party of ${plan.size} reached the interior. Threat ${plan.threat} exceeded defence ${plan.defense} by ${plan.gap}. Structural loss ${out.damage}. Cornerstone ${f.lossObject.condition}/100.`,
      text: 'The party reached the interior. The loss is recorded as structural and is not attributable to any lapse in the posted procedure.',
      cause: `Defence stood at ${plan.defense} against a threat of ${plan.threat}.`,
    });
    if (out.staffLost > 0) {
      pushLine(report, {
        kind: 'casualty',
        numeric: `Cycle ${cycle}: ${out.staffLost} post vacated (staff casualty).`,
        text: 'The absence is recorded as unplanned and is not attributable to any deficiency in the posted evacuation procedure.',
        cause: 'The interior was reached with the post still standing.',
      });
    }
  } else {
    pushLine(report, {
      kind: 'raid',
      numeric: `Incident ${cycle}: party of ${plan.size} held at the perimeter, threat ${Math.max(0, plan.threat)} did not exceed defence ${plan.defense}. Cornerstone ${f.lossObject.condition}/100.`,
      text: 'The party was held at the perimeter and reduced. The outcome is filed as a resolution of the incident. No commendation attaches.',
    });
  }
}
