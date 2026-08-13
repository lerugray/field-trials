// gates.mjs — run the M2 exit gates at full sample size and print the report
// (DESIGN-SEED M2: the baseline curve committed as constants + MEASURED). The
// test suite asserts these gates at moderate N; this prints the authoritative
// numbers for the operator / the M2-GATES doc.
//
//   node scripts/gates.mjs

import { TUNING } from '../src/tuning.js';
import { measureBaseline, checkBands, degeneracySweep } from '../src/baseline.js';
import { runContrastChecks } from '../src/legibility.js';
import { measureEconomy, sinkAlwaysOpen, noEarlySpike } from '../src/economy.js';
import { checkIdiom } from '../src/artgate.js';
import { TRACKS, probeTrack } from '../src/score.js';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function pngDims(rel) { const b = readFileSync(resolve(GROOT, rel)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

function pct(x) { return (100 * x).toFixed(1) + '%'; }
function num(a) { return a.map((x) => String(x).padStart(4)).join(' '); }

console.log('THE OFFICE OF THE ROAD — M2 + M4 exit gates\n');

// Gate 1: baseline win-rate curve
const fights = TUNING.baselineProbeFights;
const base = measureBaseline(fights);
const bands = checkBands(base);
console.log(`GATE 1 — auto-win baseline (${fights} seeded fights/tier, default comp):`);
for (const tier of ['routine', 'elite', 'boss']) {
  const [lo, hi] = TUNING.winRateBands[tier];
  console.log(`  ${tier.padEnd(8)} ${pct(base[tier].winRate).padStart(6)}  band [${pct(lo)}, ${pct(hi)}]  avg rounds ${base[tier].avgRounds.toFixed(1)}`);
}
console.log('  -> ' + (bands.ok ? 'ALL IN BAND' : 'OUT OF BAND: ' + JSON.stringify(bands.fails)) + '\n');

// Gate 2: job-comp degeneracy sweep
const sw = degeneracySweep(500);
console.log(`GATE 2 — job-comp degeneracy sweep (${sw.comps.length} comps, ladder ${TUNING.degeneracyLadder.join('>')}):`);
console.log(`  median ${sw.median.toFixed(3)}  best ${sw.best.toFixed(3)}  spread ${pct(sw.spread)} (limit ${pct(TUNING.degeneracyMargin)})`);
console.log('  top 3:   ' + sw.comps.slice(0, 3).map((c) => c.jobIds.join('/') + ' ' + c.score.toFixed(2)).join('  |  '));
console.log('  bottom 3:' + sw.comps.slice(-3).map((c) => c.jobIds.join('/') + ' ' + c.score.toFixed(2)).join('  |  '));
console.log('  over-margin (degenerate): ' + (sw.overMargin.length ? sw.overMargin.map((c) => c.jobIds.join('/')).join(', ') : 'none'));
console.log('  trap-tier (below floor):  ' + (sw.trapTier.length ? sw.trapTier.map((c) => c.jobIds.join('/')).join(', ') : 'none'));
console.log('  -> ' + (sw.overMargin.length === 0 ? 'NO DEGENERATE COMP' : 'DEGENERACY DETECTED') + '\n');

// Gate 3: legibility contrast
const con = runContrastChecks();
console.log('GATE 3 — legibility contrast (WCAG; body >=4.5, edge >=3):');
console.log('  -> ' + (con.ok ? 'ALL PAIRS PASS' : 'FAILURES: ' + JSON.stringify(con.fails)));
console.log('  (colour-vision-deficiency proofs: proofs/combat-cvd-*.png)\n');

const m2Ok = bands.ok && sw.overMargin.length === 0 && con.ok;
console.log(m2Ok ? 'M2 GATES: ALL GREEN\n' : 'M2 GATES: ATTENTION NEEDED\n');

// ---------------------------------------------------------------------------
// M4 — economy closed loop (null-strategy vs greedy-strategy probe)
// ---------------------------------------------------------------------------
console.log('THE OFFICE OF THE ROAD — M4 exit gates\n');
const eco = measureEconomy(60, 8);
const [glo, ghi] = TUNING.economyGoldPerLegBand;
const goldPerLegOk = eco.goldPerLeg >= glo && eco.goldPerLeg <= ghi;
const worthOk = eco.greedyWorthFrac >= TUNING.economyGreedyWorthFrac;
const sinkOk = sinkAlwaysOpen();
const spikeOk = noEarlySpike(60);
const strandOk = eco.minGold >= 0;
const floorOk = eco.floorOk;

console.log(`GATE 4 — economy closed loop (${eco.N} seeds × ${eco.legs} legs, null vs greedy):`);
console.log(`  sample seed 1 — gold curve per leg:`);
console.log(`    null (hoard)  ${num(eco.sample.nul.goldCurve)}   wealth ${eco.sample.nul.wealth}`);
console.log(`    greedy (buy)  ${num(eco.sample.grd.goldCurve)}   wealth ${eco.sample.grd.wealth}  (spent ${eco.sample.grd.equipmentSpent} on kit)`);
console.log(`    divergence    ${num(eco.sample.divergence)}`);
console.log(`  measured net gold/leg (null, surviving): ${eco.goldPerLeg.toFixed(1)}  band [${glo}, ${ghi}]  -> ${goldPerLegOk ? 'IN BAND' : 'OUT'}`);
console.log(`  greedy survives ≥ null (buying is worth it): ${pct(eco.greedyWorthFrac)} of seeds (floor ${pct(TUNING.economyGreedyWorthFrac)})  -> ${worthOk ? 'PASS' : 'FAIL'}`);
console.log(`  depth: null avg ${eco.nAvgLegs.toFixed(1)} legs (${eco.nWipe} wipes) · greedy avg ${eco.gAvgLegs.toFixed(1)} legs (${eco.gWipe} wipes)`);
console.log(`  divergence is real (median final Δ ${eco.medDiv}⚠, greedy spent ${eco.greedySpent}⚠ on kit): ${eco.greedySpent > 0 ? 'PASS' : 'FAIL'}`.replace(/⚠/g, ''));
console.log(`  always-open resupply sink: ${sinkOk ? 'PASS' : 'FAIL'}  ·  no early power spike: ${spikeOk ? 'PASS' : 'FAIL'}`);
console.log(`  never strands (min gold ${eco.minGold} ≥ 0): ${strandOk ? 'PASS' : 'FAIL'}  ·  mandate reward floor holds: ${floorOk ? 'PASS' : 'FAIL'}`);
const m4Ok = goldPerLegOk && worthOk && sinkOk && spikeOk && strandOk && floorOk && eco.greedySpent > 0;
console.log('  -> ' + (m4Ok ? 'ECONOMY HEALTHY' : 'ECONOMY NEEDS ATTENTION') + '\n');

console.log(m4Ok ? 'M4 GATES: GREEN\n' : 'M4 GATES: ATTENTION NEEDED\n');

// ---------------------------------------------------------------------------
// M6 — art idiom + pixel gate (every binding sliced on the native grid)
// ---------------------------------------------------------------------------
console.log('THE OFFICE OF THE ROAD — M6 exit gates\n');
const dims = {
  iconset: pngDims("materials/art-packs/Willibab-s-Retro-Icons/Willibab's Retro Icons/Willibab's Retro Icons/Iconset.png"),
  overworld: pngDims('materials/art-packs/WILLIBAB_OVERWORLD/WILLIBAB_OVERWORLD/Tileset 1x/OW_A2.png'),
  town: pngDims('materials/art-packs/WILLIBAB_TOWN/WILLIBAB_TOWN/Tileset/TOWNS_ALL_1x.png'),
  battler: [1296, 864],
};
const idiom = checkIdiom(dims);
console.log('GATE 5 — art idiom + pixel grid (bindings sliced on the native grid):');
console.log(`  iconset ${dims.iconset[0]}×${dims.iconset[1]} @32 · overworld ${dims.overworld[0]}×${dims.overworld[1]} @16 · battler ${dims.battler[0]}×${dims.battler[1]} @144`);
console.log(`  town ${dims.town[0]}x${dims.town[1]} @16 (cobblestone)`);
  console.log(`  checked ${idiom.checked} bindings (icons + terrain/town tiles + battler frame)`);
console.log('  -> ' + (idiom.ok ? 'ALL GRID-ALIGNED & IN-BOUNDS' : 'FAILS: ' + JSON.stringify(idiom.fails)));
console.log('  (colour-vision-deficiency re-run on the art surfaces: proofs/*-cvd-*-m6*.png)\n');

console.log(idiom.ok ? 'M6 GATES: GREEN\n' : 'M6 GATES: ATTENTION NEEDED\n');

// ---------------------------------------------------------------------------
// M7 — score density (the CHP audio-probe pattern, over a counting voice stub)
// ---------------------------------------------------------------------------
console.log('THE OFFICE OF THE ROAD — M7 exit gates\n');
console.log('GATE 6 — score density (code-composed tracks, one per state):');
const dens = {};
for (const [name, spec] of Object.entries(TRACKS)) {
  const p = probeTrack(spec);
  dens[name] = p;
  const kit = (p.byVoice.kick | 0) + (p.byVoice.snare | 0) + (p.byVoice.hat | 0);
  const voices = Object.keys(p.byVoice).filter((k) => p.byVoice[k] > 0).join('+');
  console.log(`  ${name.padEnd(7)} ${spec.bpm}bpm · ${spec.len} steps · ${p.notes} notes (${p.perStep.toFixed(2)}/step) · ${voices}${kit ? ' · KIT' : ''}`);
}
const kitOf = (n) => (dens[n].byVoice.kick | 0) + (dens[n].byVoice.snare | 0) + (dens[n].byVoice.hat | 0);
const allProduce = Object.values(dens).every((p) => p.notes > 0 && p.perStep > 0.03 && p.perStep <= 4);
const kitOnlyCombat = Object.keys(TRACKS).every((n) => (n === 'combat') === (kitOf(n) > 0));
const combatBusiest = dens.combat.perStep >= dens.office.perStep && dens.office.perStep <= dens.march.perStep;
const scoreOk = allProduce && kitOnlyCombat && combatBusiest;
console.log(`  every track voiced + in-band: ${allProduce ? 'PASS' : 'FAIL'} · kit is combat-only: ${kitOnlyCombat ? 'PASS' : 'FAIL'} · office quietest / combat busiest: ${combatBusiest ? 'PASS' : 'FAIL'}`);
console.log('  -> ' + (scoreOk ? 'SCORE VOICED & DISTINCT (register: Weiss to direct)' : 'SCORE NEEDS ATTENTION') + '\n');

// ---------------------------------------------------------------------------
// TEXT — objective readability gate (Pickett M10 pattern; shipped bitmap face)
// ---------------------------------------------------------------------------
console.log('THE OFFICE OF THE ROAD — text readability gate\n');
console.log('GATE 7 — complete catalog wrap/clip + ink x-height + layout probe:');
const textRun = spawnSync(process.execPath, ['scripts/text-gate.mjs'], { cwd: GROOT, encoding: 'utf8' });
if (textRun.stdout) process.stdout.write(textRun.stdout);
if (textRun.stderr) process.stderr.write(textRun.stderr);
const textOk = textRun.status === 0;
const layoutRun = spawnSync(process.execPath, ['scripts/layout-gate.mjs'], { cwd: GROOT, encoding: 'utf8' });
if (layoutRun.stdout) process.stdout.write(layoutRun.stdout);
if (layoutRun.stderr) process.stderr.write(layoutRun.stderr);
const layoutOk = layoutRun.status === 0;
console.log('  -> ' + (textOk && layoutOk ? 'TEXT READABILITY GREEN' : 'TEXT READABILITY FAILED') + '\n');

const allOk = m2Ok && m4Ok && idiom.ok && scoreOk && textOk && layoutOk;
console.log(allOk ? 'ALL GATES (M2 + M4 + M6 + M7 + TEXT): GREEN' : 'GATES: ATTENTION NEEDED');
process.exit(allOk ? 0 : 1);
