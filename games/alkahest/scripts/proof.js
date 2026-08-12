#!/usr/bin/env node
/* ALKAHEST -- proof: render composed scenes to PNG headlessly.
 *
 * The software renderer writes a native-res FrameBuffer that the browser blits;
 * here Node encodes that SAME buffer to a PNG so every art increment can ship a
 * committed, dated proof frame (LOOK-at-it acceptance law) with no browser in
 * the loop. Deterministic: seeded noise + a fixed `t` => identical bytes.
 *
 * Usage: node scripts/proof.js [date]   (date defaults to today, YYYYMMDD)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/png.js");
require("../src/palette.js");
require("../src/render.js");
require("../src/visuals.js");
require("../src/font.js");
require("../src/reagents.js");
require("../src/bench.js");
require("../src/grid.js");
require("../src/acts.js");
require("../src/machine.js");
require("../src/alembic.js");
require("../src/duel.js");
require("../src/formulae.js");
require("../src/run.js");
require("../src/tutorial.js");
require("../src/title.js");
require("../src/well.js");
require("../src/folioui.js");

function stamp() {
  if (process.argv[2]) return process.argv[2];
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

const outDir = path.join(__dirname, "..", "runs", "proof");
fs.mkdirSync(outDir, { recursive: true });

function saveProof(file, fbuf) {
  const bytes = Buffer.from(AL.encodePNG(fbuf));
  if (fs.existsSync(file)) {
    const prior = fs.readFileSync(file);
    if (!prior.equals(bytes)) {
      throw new Error(`proof exists with different pixels: ${path.relative(process.cwd(), file)}; use a new date/stamp`);
    }
    console.log(`kept ${path.relative(process.cwd(), file)} (identical ${AL.W}x${AL.H})`);
    return;
  }
  fs.writeFileSync(file, bytes);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${AL.W}x${AL.H})`);
}

const date = stamp();
// title on the entry palette (nigredo), a fixed flame phase for a stable frame
const fb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawTitle(fb, { act: "nigredo", t: 0.6, showPrompt: true });
const file = path.join(outDir, `title-${date}.png`);
saveProof(file, fb);

// M4 PoC-first frame: shared bench materials and practical-light language.
const poc = new AL.FrameBuffer(AL.W, AL.H);
AL.drawBenchPoc(poc, { act: "nigredo", time: 0.6 });
const pocFile = path.join(outDir, `m4-poc-${date}.png`);
saveProof(pocFile, poc);

// reagent sheet: the six reagents on each act palette (colorblind survival check)
const sheet = new AL.FrameBuffer(AL.W, AL.H);
const TILE = 26, GAP = 6, N = AL.REAGENT_COUNT;
const rowW = N * TILE + (N - 1) * GAP;
const x0 = Math.round((AL.W - rowW) / 2);
AL.ACTS.forEach((act, ai) => {
  const pal = AL.palette(act);
  const y0 = 20 + ai * (TILE + 20);
  // act stone band behind the row
  AL.render.textureFill(sheet, 0, y0 - 6, AL.W, TILE + 12, pal.stoneMid, AL.noise2(1717), { amp: 0.16, scale: 0.05 });
  AL.render.gradientV(sheet, 0, y0 - 6, AL.W, TILE + 12, pal.stoneDark, pal.stoneMid);
  AL.drawText(sheet, pal.name, 4, y0 - 4, pal.ink, { scale: 1 });
  for (let i = 0; i < N; i++) AL.drawReagent(sheet, x0 + i * (TILE + GAP), y0, TILE, i, { light: 0.1 });
});
AL.render.vignette(sheet, 0.35);
const sfile = path.join(outDir, `reagents-${date}.png`);
saveProof(sfile, sheet);

// gameplay: a live well mid-clear, showing the action-legibility surface
const m = new AL.Machine({ seed: 424242, seedRows: 8 });
m.riseOffset = 0.4;
// stage a visible clear + chain/combo readout by matching a row in view
const gy = 5;
for (let x = 1; x <= 3; x++) if (m.grid.cells[gy][x]) m.grid.cells[gy][x] = AL.panel(2);
const hits = m.grid.findMatches();
hits.forEach((k) => { const p = k.split(","); const c = m.grid.cells[+p[1]][+p[0]]; if (c) c.st = "clearing"; });
m.clearing = { cells: hits, timer: m.cfg.clearDuration * 0.5, combo: 5 };
m.lastEvent = { chain: 3, combo: 5, t: 0.2 };
const play = new AL.FrameBuffer(AL.W, AL.H);
AL.drawWell(play, m, { act: "nigredo", cursor: { x: 2, y: 4 }, time: 0.35 });
const pfile = path.join(outDir, `play-${date}.png`);
saveProof(pfile, play);

// the duel: two lit wells, dross exchange live -- run a bout a few seconds in so
// both stacks, an incoming telegraph, and a chain readout are on screen.
const duel = new AL.Duel({ seedP: 20260810, seedR: 11235, aiSeed: 8675309, skill: 0.7, machine: { seedRows: 6 } });
for (let i = 0; i < 220; i++) {
  if (i === 90) duel.player.requestSwap(2, 0); // provoke some player action for the frame
  duel.tick(1 / 60);
}
// stage a visible player chain readout + an incoming slab for the legibility frame
duel.player.lastEvent = { chain: 3, combo: 5, t: duel.time - 0.2 };
duel.rival.drossQueue.push({ width: 6, height: 2 });
const dfb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawDuel(dfb, duel, { act: "nigredo", cursor: { x: 2, y: 4 }, time: duel.time });
const dfile = path.join(outDir, `duel-${date}.png`);
saveProof(dfile, dfb);

// the tutorialette: the CHAIN lesson, planted board + instruction card
const tut = new AL.Tutorial({ seed: 3 });
while (tut.step().id !== "CHAIN") tut._advance(); // jump to the chain lesson for the frame
const tfb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawTutorial(tfb, tut, { act: "nigredo", cursor: { x: 4, y: 0 }, time: 0.4 });
const tfile = path.join(outDir, `tutorial-${date}.png`);
saveProof(tfile, tfb);

function write(name, fbuf) {
  const f = path.join(outDir, `${name}-${date}.png`);
  saveProof(f, fbuf);
}
function force(run, wins, mode) {
  let guard = 0;
  while (!run.isOver() && guard++ < 200) {
    if (run.state === "bout") { run.duel.rival.state = "lost"; run.tick(0.016); }
    else if (run.state === "draft") { if (mode === "stopDraft") return; run.resolveDraft(null); }
    else if (run.state === "workshop") { if (mode === "stopWorkshop") return; run.resolveWorkshop({ kind: "skip" }); }
    if (wins !== undefined && run.history.boutsWon >= wins && mode === "wins") return;
  }
}

// M4 action sheet: dissolution + chain/combo on the player side, queued and
// crushing dross plus a transmute seam on the rival side. Every verb is visible.
const artDuel = new AL.Duel({ seedP: 4104, seedR: 4105, aiSeed: 4106, skill: 0.4, machine: { seedRows: 7 } });
const ay = 4;
for (let ax = 1; ax <= 4; ax++) artDuel.player.grid.cells[ay][ax] = AL.panel(1);
const artHits = artDuel.player.grid.findMatches();
artHits.forEach((key) => { const [x, y] = key.split(",").map(Number); artDuel.player.grid.cells[y][x].st = "clearing"; });
artDuel.player.clearing = { cells: artHits, timer: 0.18, dur: 0.36, combo: artHits.size };
artDuel.player.lastEvent = { chain: 3, combo: Math.max(5, artHits.size), t: 0.05 };
artDuel.rival.drossQueue.push({ width: 5, height: 2 });
artDuel.rival.lastCrush = { t: 0.05, x0: 1, width: 5, height: 2 };
artDuel.rival.lastTransmute = { t: 0.05, count: 5 };
const actionFb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawDuel(actionFb, artDuel, { act: "citrinitas", cursor: { x: 2, y: ay }, time: 0.24 });
write("m4-actions", actionFb);

// Per-act live bench verdicts: identical machine state under each opus light rig.
AL.ACTS.forEach((act) => {
  const afb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawDuel(afb, artDuel, { act, cursor: { x: 2, y: ay }, time: 0.24 });
  write("act-" + act, afb);
});

// the run bout: the full HUD -- act ladder banner, rival telegraph, athanor gauge,
// and the keyed active-brew bar, over a live Citrinitas duel a few seconds in.
const run = new AL.Run({ seed: 20260810 });
["aquaRegia", "calcination", "blackSun"].forEach((id) => run.folio.add(id));
run.duel.player.applyFormulae(run.folio);
for (let i = 0; i < 160; i++) { if (i === 70) run.duel.player.requestSwap(2, 0); run.tick(1 / 60); }
run.duel.player.athanor = 72;
run.duel.player.lastEvent = { chain: 3, combo: 5, t: run.duel.time - 0.2 };
run.duel.player.lastCharge = { t: run.duel.time, amount: 8 };
const rfb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawDuel(rfb, run.duel, { act: run.actName, cursor: { x: 2, y: 4 }, time: run.duel.time, run: run });
write("run-bout", rfb);

// the draft: three cards, one of each class, the class shapes visible (colorblind)
const dr = new AL.Run({ seed: 44 });
force(dr, undefined, "stopDraft");
const drfb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawDraft(drfb, dr, { sel: 1, time: 0.4 });
write("draft", drfb);

// the workshop: a grown folio laid out for remove/upgrade at an act boundary
const wr = new AL.Run({ seed: 8 });
wr.folio.add("separation"); wr.folio.add("aquaRegia"); wr.folio.add("feverPitch"); wr.folio.add("volatility");
force(wr, undefined, "stopWorkshop");
const wfb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawWorkshop(wfb, wr, { sel: 1, time: 0.4 });
write("workshop", wfb);

// the run-end: the opus complete, with roll-up stats
const en = new AL.Run({ seed: 5 });
force(en);
const efb = new AL.FrameBuffer(AL.W, AL.H);
AL.drawRunEnd(efb, en, { time: 0.4 });
write("run-end", efb);
