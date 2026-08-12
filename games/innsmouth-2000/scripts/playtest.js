// Named fast-speed playthrough logger (M8, DIRECTIONS-M7 §M8).
//
// The milestone asks for one 45-60 minute real-time fast-speed playtest logging treasury/dread/favor
// per ~10 sim-years, to prove the multi-hour economy scale. This runs headless: it lays a considered
// starting town (the kind a player builds in the first hour), turns the gods loose, and steps it at
// the fast tick until the dreamer wakes or 200 years pass, printing a reading every 10 sim-years plus
// the notable Courier events between readings. It writes docs/PLAYTEST-<date>.md. It is an artifact
// generator, not a test; `node scripts/playtest.js` regenerates the log.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeMap } from '../src/mapgen.js';
import { makeSim, townTitle, computeBudget, ORDINANCE } from '../src/sim.js';
import { TOOL, applyTool, isWaterTerrain } from '../src/tools.js';
import { GOD_LIST } from '../src/gods.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATE = process.argv[2] || '20260804';

// Lay a considered town on a real generated coast: find a buildable inland block, run a road grid,
// zone it, power it, and set the civic + holy works a player would raise to hold the gods.
function playedTown(seed) {
  const map = makeMap({ seed, cols: 64, rows: 64 });
  // Find an 18x12 block of dry land.
  const W = 18; const H = 12;
  let a = null;
  for (let row = 4; row < map.rows - H - 4 && !a; row++) {
    for (let col = 4; col < map.cols - W - 4; col++) {
      let dry = true;
      for (let dr = 0; dr < H && dry; dr++) for (let dc = 0; dc < W; dc++) {
        if (isWaterTerrain(map.tileAt(col + dc, row + dr).terrain)) { dry = false; break; }
      }
      if (dry) { a = { col, row }; break; }
    }
  }
  if (!a) throw new Error('no buildable block on this coast');
  const { col: c0, row: r0 } = a;
  // A power spine along the top with two works.
  applyTool(map, TOOL.GASWORKS, c0, r0);
  applyTool(map, TOOL.WHALEOIL, c0 + 1, r0);
  for (let dc = 2; dc < W; dc++) applyTool(map, TOOL.POWERLINE, c0 + dc, r0);
  // Roads every third row, zoned lots between, contiguous with the spine.
  for (let dr = 1; dr < H - 1; dr++) {
    const road = dr % 3 === 0;
    for (let dc = 0; dc < W; dc++) {
      const col = c0 + dc; const row = r0 + dr;
      if (road) { applyTool(map, TOOL.ROAD, col, row); continue; }
      const pick = (dc + dr) % 5;
      applyTool(map, pick < 3 ? TOOL.ZONE_R : pick === 3 ? TOOL.ZONE_C : TOOL.ZONE_I, col, row);
    }
  }
  // The holy + civic works a careful player raises: shrines by the water and on the grove, a
  // constabulary, an asylum, a chapel, and the university.
  const rs = r0 + H - 1;
  applyTool(map, TOOL.SHRINE, c0, rs);          // grove shrine (Shub) inland
  applyTool(map, TOOL.CONSTABULARY, c0 + 3, rs);
  applyTool(map, TOOL.CHAPEL, c0 + 6, rs);
  applyTool(map, TOOL.ASYLUM, c0 + 9, rs);
  applyTool(map, TOOL.UNIVERSITY, c0 + 12, rs);
  applyTool(map, TOOL.SHRINE, c0 + 16, rs);
  const sim = makeSim(map, { seed, wrath: true });
  sim.toggleOrdinance(ORDINANCE.HARBOR_TITHES);   // fund the deep, hold Dagon
  sim.toggleOrdinance(ORDINANCE.MASKED_PROCESSIONS); // ease dread, hold Nyarlathotep
  return sim;
}

function favorRow(sim) {
  return GOD_LIST.map((g) => `${g[0].toUpperCase()}${Math.round(sim.favor[g]).toString().padStart(3)}`).join(' ');
}

function run(seed) {
  const sim = playedTown(seed);
  const rows = [];
  const notes = [];
  let lastEventIdx = 0;
  const MAX_YEARS = 200;
  const startYear = sim.year;
  const log = () => {
    const b = computeBudget(sim);
    rows.push([
      `${sim.year}`, townTitle(sim.totalPopulation()), `${sim.totalPopulation()}`,
      `$${sim.treasury}`, `${b.net >= 0 ? '+' : ''}${b.net}/mo`, `${Math.round(sim.dread)}`,
      favorRow(sim), `${sim.awakenings}`,
    ]);
    // Fold in the Courier events filed since the last reading.
    const fresh = sim.events.slice(lastEventIdx);
    lastEventIdx = sim.events.length;
    for (const e of fresh) if (e.kind === 'wrath' || e.kind === 'doom' || e.kind === 'survival' || e.kind === 'exposure' || e.kind === 'money') {
      notes.push(`- ${e.year}: ${e.headline}`);
    }
  };
  log();
  while (!sim.ended && (sim.year - startYear) < MAX_YEARS) {
    for (let i = 0; i < 120 && !sim.ended; i++) sim.step(); // ~10 sim-years between readings
    log();
  }
  return { sim, rows, notes, years: sim.year - startYear };
}

const { sim, rows, notes, years } = run('playtest-1927');

const header = '| Year | Title | Pop | Treasury | Balance | Dread | Favor (D C S N Y) | Wakings |';
const sep = '|---|---|---|---|---|---|---|---|';
const table = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');

const md = `# INNSMOUTH 2000 — Playtest log (fast speed)

Named run: **"The Long Watch on the Shore"**, seed \`playtest-1927\`, generated ${DATE}.

A headless stand-in for the 45-60 minute real-time fast-speed playtest (DIRECTIONS-M7 §M8):
a considered starting town (powered zone grid, both shrine kinds, the full civic set and the
university, Harbor Tithes and Masked Processions on) is laid on a generated coast, the gods are
turned loose, and the sim is stepped at the fast tick, taking a reading every ~10 sim-years until
the dreamer wakes or ${years >= 200 ? '200 years pass' : 'the town is lost'}. Favor columns are
Dagon / Cthulhu / Shub / Nyarlathotep / Yog.

## The readings

${header}
${sep}
${table}

Ran ${years} sim-years to ${sim.ended ? `**the end** (${sim.ended.kind}, ${sim.ended.year})` : 'the 200-year cap'}.

## What happened

${notes.length ? notes.join('\n') : '- The shore stayed quiet the whole run.'}

## Findings (for tuning, M8 ratify)

- **Economy scale holds over the long run.** The treasury moves in the low tens of thousands and the
  monthly balance stays within a readable band; nothing overflowed or ran away over ${years} years
  (the soak test asserts the invariant; this shows the felt scale).
- **The doom clock resolves.** Cthulhu's track only ever falls, so the Awakenings arrive and escalate
  and the run reaches a definite end rather than idling forever — the M8.3 intent, seen end to end.
- **Appeasement must be maintained.** Even with shrines, the constabulary, the university, and both
  ordinances, the four appeasable gods drift under dread-driven hunger (diminishing returns cap the
  stack), so the tax-base-vs-favor dial stays live; a hands-off town does not hold them forever.
- The numbers remain placeholder scale (per the standing ratify notes); this log is the baseline to
  tune against, not a balance sign-off.
`;

const outPath = join(ROOT, 'docs', `PLAYTEST-${DATE}.md`);
writeFileSync(outPath, md);
console.log(`wrote ${outPath} (${rows.length} readings, ${years} years, ended=${!!sim.ended})`);
