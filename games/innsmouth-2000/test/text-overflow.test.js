// TEXT-OVERFLOW DETECTOR (M8, DIRECTIONS-M8-20260804-text-overflow).
//
// The operator reviewed the M7 art pass and found text bounding out of its boxes. That is a
// legibility-floor defect (game text must never clip), so this standing test walks every chrome
// surface the UI can draw, measures each rendered text run against the box it lives in, at ALL
// THREE proof viewports AND each chrome text-scale setting, and FAILS on any clip or escape. It is
// a class guard: this family of defect can never ship again. The monospace model is calibrated to
// the proof browser (Chrome, 0.55 advance) so the node detector agrees with the file:// captures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import {
  buildTopBar, drawTopBar,
  buildBudgetWindow, drawBudgetWindow,
  buildFavorWindow, drawFavorWindow,
  buildDisasterMenu, drawDisasterMenu,
  buildQueryWindow, drawQueryWindow,
  buildStartMenu, drawStartMenu,
  buildTitleScreen, drawTitleScreen,
  buildHelpWindow, drawHelpWindow,
  buildQuickstartWindow, drawQuickstartWindow,
  buildToolbar, buildToolbarTooltip, drawToolbarTooltip, toolbarTooltipLines,
  setChromeScale,
} from '../src/ui.js';
import {
  buildDemand, drawDemand,
  buildCourierTicker, drawCourierTicker,
  buildCourierWindow, drawCourierWindow,
  buildOnboarding, drawOnboarding,
  buildEndScreen, drawEndScreen,
} from '../src/overlays.js';
import { drawStatusStrip, drawHeraldLine, statusStripH, heraldBandH } from '../src/strips.js';
import { GOD_LIST } from '../src/gods.js';
import { advise, buildAdvisorWindow, drawAdvisorWindow } from '../src/advisor.js';
import { makeProbe, escapes, rowCollisions } from './support/text-probe.js';

const VIEWPORTS = [[1280, 800], [1440, 900], [2560, 1440]];
const SCALES = [1, 1.25, 1.5];

// The Help window always carries a live Sound line in the running game, so in the game it is always
// ONE BLOCK TALLER than a bare buildHelpWindow(vw, vh) reports. Every Help build below now passes
// one, so what this gate measures is the panel the player actually sees. Without it the detector was
// measuring a panel shorter than the real one, and M-b's new section landed within 30px of the
// 1280x800 ceiling at the largest text scale, which is close enough for that gap to have mattered.
// The no-tracks case is the longest of the three real lines, so it is the one worth gating.
const HELP_MUSIC_LINE = 'Music: no tracks found in assets/music. The town stays quiet.';

function townMap(cols = 30, rows = 30) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  for (let r = 0; r < rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP;
  return m;
}

// A sim with content on every readout: a shrine, some population, and a raised dread/treasury so
// the numbers are wide (multi-digit funds, a full dread meter).
function loadedSim() {
  const m = townMap();
  applyTool(m, TOOL.SHRINE, 5, 5);
  applyTool(m, TOOL.CONSTABULARY, 7, 7);
  const sim = makeSim(m, { dread: 88 });
  sim.treasury = 1234567; // a wide funds readout
  sim.pop.unwary = 820; sim.pop.cultist = 140; sim.pop.deepone = 260; sim.pop.scholar = 55;
  sim.step();
  return sim;
}

// The longest real Courier stories (from src/sim.js), with a wide dateline year.
const LONG_EVENTS = [
  { kind: 'wrath', headline: 'THE GROUND HEAVES; RUIN IN THE STREETS', sub: 'Whole rows are thrown down, and no man will say why.', year: 1925, month: 8 },
  { kind: 'wrath', headline: 'A DISTRICT FOUND OUT OF TRUE', sub: 'Surveyors report the streets no longer meet as once they did.', year: 1925, month: 11 },
  { kind: 'omen', headline: 'FISHERMEN REPORT THE WATER RUNNING BLACK', sub: 'The tide runs high and black against the wharves.', year: 1926, month: 2 },
  { kind: 'class', headline: 'THE WATERFRONT KEEPS TO ITSELF', sub: 'The old families are seen no more by day.', year: 1926, month: 5 },
];

// The longest onboarding line.
const LONG_ONBOARDING = 'A shrine draws the cult and raises the dread around it. Watch who your townsfolk become.';

// Run a draw against a probe and return the text records.
function probe(drawFn) {
  const p = makeProbe();
  drawFn(p.ctx);
  return p.texts;
}

// Collect (not throw) every text run that escapes `box`, tagged by surface/viewport/scale, so one
// run reports the whole list of offenders instead of halting at the first.
function collectFits(out, texts, box, where) {
  for (const b of escapes(texts, box)) out.push(`${where}: "${b.text}" ${b.edge} by ${b.over}px`);
}
function assertClean(out) {
  assert.equal(out.length, 0, `text escapes its box:\n  ${out.join('\n  ')}`);
}

// Every window surface: the drawn text must stay inside the panel frame.
test('windows: no text escapes its panel at any viewport or chrome scale', () => {
  const out = [];
  for (const [vw, vh] of VIEWPORTS) {
    for (const scale of SCALES) {
      setChromeScale(scale);
      const tag = `${vw}x${vh}@${scale}`;
      const sim = loadedSim();

      // The Town Ledger, solvent and insolvent (the insolvency note is the widest new line).
      const L = buildBudgetWindow(vw, vh);
      collectFits(out, probe((c) => drawBudgetWindow(c, L, sim)), L.frame, `Ledger ${tag}`);
      const broke = loadedSim();
      broke.treasury = -87654; broke.servicesCut = true;
      collectFits(out, probe((c) => drawBudgetWindow(c, L, broke)), L.frame, `Ledger(insolvent) ${tag}`);

      // Favor of the Gods: exercise all three favor stages (calm shows the longest appease hints,
      // omen/dire show the omen lines) so every branch's text is measured.
      for (const stageName of ['calm', 'omen', 'dire']) {
        const val = stageName === 'calm' ? 70 : stageName === 'omen' ? 25 : 8;
        for (const g of GOD_LIST) sim.favor[g] = val;
        const F = buildFavorWindow(vw, vh);
        collectFits(out, probe((c) => drawFavorWindow(c, F, sim)), F.frame, `Favor(${stageName}) ${tag}`);
      }

      // Summon a Wrath menu.
      const D = buildDisasterMenu(vw, vh);
      collectFits(out, probe((c) => drawDisasterMenu(c, D)), D.frame, `Wrath menu ${tag}`);

      // The start / scenario picker (its blurbs are the widest lines).
      const SM = buildStartMenu(vw, vh);
      collectFits(out, probe((c) => drawStartMenu(c, SM)), SM.frame, `Start menu ${tag}`);
      const TS = buildTitleScreen(vw, vh, { canContinue: true });
      collectFits(out, probe((c) => drawTitleScreen(c, TS)), TS.frame, `Title screen ${tag}`);

      // The Help and Legend window.
      const HW = buildHelpWindow(vw, vh, { musicLine: HELP_MUSIC_LINE });
      collectFits(out, probe((c) => drawHelpWindow(c, HW)), HW.frame, `Help ${tag}`);

      // The Quickstart window (M9.7).
      const QS = buildQuickstartWindow(vw, vh);
      collectFits(out, probe((c) => drawQuickstartWindow(c, QS)), QS.frame, `Quickstart ${tag}`);

      // The query window, with the longest real readout strings (from tools.describeTile /
      // sim.explainLot / classReason). The window is sized to its content, so this guards that.
      const desc = {
        title: 'Lot 128, 264',
        lines: ['Ground: Marsh grass', 'The campus and its Containment Wing. Draws Scholars, eases dread, holds the Rift at bay.', 'Burned out. Blackened ground and charred stubs.', 'The waterfront has turned to the Deep Ones.', 'No power: not on a working grid.'],
      };
      const Q = buildQueryWindow(40, 40, { lines: desc.lines, title: desc.title });
      collectFits(out, probe((c) => drawQueryWindow(c, Q, desc)), Q.frame, `Query ${tag}`);

      // The Old Priest advisor, in several counsel states (angry god, insolvency, doom, calm).
      const states = [
        () => { const s = loadedSim(); s.favor.dagon = 6; return s; },
        () => { const s = loadedSim(); s.treasury = -400; s.servicesCut = true; s.awakenings = 2; return s; },
        () => { const s = loadedSim(); s.ended = { kind: 'doom', year: 1955, month: 2, awakenings: 4 }; return s; },
        () => makeSim(townMap(), { dread: 4 }),
      ];
      for (const mk of states) {
        const asim = mk();
        const adv = advise(asim);
        const A = buildAdvisorWindow(vw, vh, { scale, lines: adv.lines });
        collectFits(out, probe((c) => drawAdvisorWindow(c, A, adv)), A.frame, `Advisor ${tag}`);
      }
    }
  }
  assertClean(out);
});

// The overlays: minimap has no text, but the demand gadget, the Courier ticker + full paper, and the
// onboarding banner all carry text that must stay inside their frames.
test('overlays: no text escapes its frame at any viewport or chrome scale', () => {
  const out = [];
  for (const [vw, vh] of VIEWPORTS) {
    for (const scale of SCALES) {
      setChromeScale(scale);
      const tag = `${vw}x${vh}@${scale}`;
      const sim = loadedSim();

      const dem = buildDemand(vw, vh, { scale });
      collectFits(out, probe((c) => drawDemand(c, dem, sim)), dem.frame, `Demand ${tag}`);

      const tick = buildCourierTicker(vw, Math.round(26 * scale), { scale });
      collectFits(out, probe((c) => drawCourierTicker(c, tick, LONG_EVENTS[LONG_EVENTS.length - 1])), tick.frame, `Courier ticker ${tag}`);

      const cw = buildCourierWindow(vw, vh, { scale });
      collectFits(out, probe((c) => drawCourierWindow(c, cw, LONG_EVENTS)), cw.frame, `Courier paper ${tag}`);

      const ob = buildOnboarding(vw, Math.round(46 * scale), { scale });
      collectFits(out, probe((c) => drawOnboarding(c, ob, LONG_ONBOARDING)), ob.frame, `Onboarding ${tag}`);

      const es = buildEndScreen(vw, vh, { scale });
      const ended = { kind: 'doom', year: 2001, month: 5, awakenings: 4 };
      collectFits(out, probe((c) => drawEndScreen(c, es, ended, 1927)), es.frame, `EndScreen ${tag}`);
    }
  }
  assertClean(out);
});

// The top bar spans the full width; its readouts, meter, and buttons must not run off the bar nor
// collide with one another as the chrome scale grows.
test('top bar: readouts, meter, and buttons fit and do not collide', () => {
  const out = [];
  for (const [vw, vh] of VIEWPORTS) {
    for (const scale of SCALES) {
      setChromeScale(scale);
      const tag = `${vw}x${vh}@${scale}`;
      const sim = loadedSim();
      const tb = buildTopBar(vw);
      const texts = probe((c) => drawTopBar(c, tb, sim, sim.speed, false));
      collectFits(out, texts, tb.panel, `TopBar ${tag}`);
      // Collision: exclude the text-size button's stacked "A"s (a deliberate small-over-large glyph).
      const flowing = texts.filter((t) => t.text !== 'A');
      for (const h of rowCollisions(flowing)) out.push(`TopBar ${tag}: "${h.a}" / "${h.b}" overlap ${h.overlap}px`);
    }
  }
  assert.equal(out.length, 0, `top bar overflow/collision:\n  ${out.join('\n  ')}`);
});

// The bottom bands (status strip + herald) span the full width; a long tool readout, refusal, or a
// god's cry must be fit to the viewport, never clipped off the right edge.
test('bottom strips: the status line and herald fit the viewport width', () => {
  const out = [];
  for (const [vw, vh] of VIEWPORTS) {
    for (const scale of SCALES) {
      setChromeScale(scale);
      const tag = `${vw}x${vh}@${scale}`;
      const map = townMap();
      const camera = { viewportW: vw, viewportH: vh, zoom: 2 };
      const hover = { col: 12, row: 8 };
      const longMsg = 'You cannot place that on the water. Choose clear, dry land away from the shore.';
      const strip = { x: 0, y: vh - statusStripH(scale), w: vw, h: statusStripH(scale) };
      collectFits(out, probe((c) => drawStatusStrip(c, camera, hover, map, TOOL.SHRINE, longMsg, scale)), strip, `Status ${tag}`);

      const hband = { x: 0, y: vh - statusStripH(scale) - heraldBandH(scale), w: vw, h: heraldBandH(scale) };
      const cry = 'The air splits along a seam of cold violet. The gate is opening.';
      collectFits(out, probe((c) => drawHeraldLine(c, camera, cry, 'wrath', scale)), hband, `Herald ${tag}`);
    }
  }
  assertClean(out);
});

// The palette tooltip (Ray's hover-popup ask): every icon's popup is sized to its own text, so it
// must never clip itself, at any viewport or chrome scale -- including the widest label
// ("Whale-Oil Works") paired with its widest cost/key line.
test('palette tooltips: no text escapes its own popup at any viewport or chrome scale', () => {
  const out = [];
  for (const [vw, vh] of VIEWPORTS) {
    for (const scale of SCALES) {
      setChromeScale(scale);
      const tag = `${vw}x${vh}@${scale}`;
      const tb = buildToolbar({});
      for (const b of tb.buttons) {
        const lines = toolbarTooltipLines(b.tool);
        const layout = buildToolbarTooltip(b.rect, lines, vw, vh);
        collectFits(out, probe((c) => drawToolbarTooltip(c, layout, lines)), layout, `Tooltip(${b.tool}) ${tag}`);
      }
    }
  }
  assertClean(out);
});

// Largest-font layout gate: every text-bearing surface must fit inside the viewport and its text
// must stay inside its frame. This is where the old 0.55 MONO_ADVANCE used to clip the Help window
// at 1.5x and where the top bar used to overlap its own buttons on a 1280-wide screen.
test('largest chrome scale: text-bearing surfaces fit the viewport and text does not clip', () => {
  const out = [];
  const scale = 1.5;
  setChromeScale(scale);
  const sim = loadedSim();
  const adv = advise(sim);
  const desc = {
    title: 'Lot 128, 264',
    lines: ['Ground: Marsh grass', 'The campus and its Containment Wing. Draws Scholars, eases dread, holds the Rift at bay.', 'Burned out. Blackened ground and charred stubs.', 'The waterfront has turned to the Deep Ones.', 'No power: not on a working grid.'],
  };

  function inside(name, box, vw, vh, tag) {
    if (box.x < 0) out.push(`${name} ${tag}: left edge ${box.x}px off-screen`);
    if (box.y < 0) out.push(`${name} ${tag}: top edge ${box.y}px off-screen`);
    if (box.x + box.w > vw + 0.001) out.push(`${name} ${tag}: right edge ${box.x + box.w - vw}px past viewport`);
    if (box.y + box.h > vh + 0.001) out.push(`${name} ${tag}: bottom edge ${box.y + box.h - vh}px past viewport`);
  }

  for (const [vw, vh] of VIEWPORTS) {
    const tag = `${vw}x${vh}@${scale}`;

    // Centred windows.
    const L = buildBudgetWindow(vw, vh);
    inside('Ledger', L.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawBudgetWindow(c, L, sim)), L.frame, `Ledger ${tag}`);

    const F = buildFavorWindow(vw, vh);
    inside('Favor', F.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawFavorWindow(c, F, sim)), F.frame, `Favor ${tag}`);

    const D = buildDisasterMenu(vw, vh);
    inside('Wrath', D.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawDisasterMenu(c, D)), D.frame, `Wrath ${tag}`);

    const SM = buildStartMenu(vw, vh);
    inside('Start', SM.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawStartMenu(c, SM)), SM.frame, `Start ${tag}`);

    const TS = buildTitleScreen(vw, vh, { canContinue: true });
    inside('Title', TS.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawTitleScreen(c, TS)), TS.frame, `Title ${tag}`);

    const HW = buildHelpWindow(vw, vh, { musicLine: HELP_MUSIC_LINE });
    inside('Help', HW.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawHelpWindow(c, HW)), HW.frame, `Help ${tag}`);

    const QS = buildQuickstartWindow(vw, vh);
    inside('Quickstart', QS.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawQuickstartWindow(c, QS)), QS.frame, `Quickstart ${tag}`);

    const Q = buildQueryWindow(40, 40, { lines: desc.lines, title: desc.title });
    inside('Query', Q.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawQueryWindow(c, Q, desc)), Q.frame, `Query ${tag}`);

    const A = buildAdvisorWindow(vw, vh, { scale, lines: adv.lines });
    inside('Advisor', A.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawAdvisorWindow(c, A, adv)), A.frame, `Advisor ${tag}`);

    // Overlays and bars.
    const dem = buildDemand(vw, vh, { scale });
    inside('Demand', dem.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawDemand(c, dem, sim)), dem.frame, `Demand ${tag}`);

    const topbar = buildTopBar(vw);
    inside('TopBar', topbar.panel, vw, vh, tag);
    const topTexts = probe((c) => drawTopBar(c, topbar, sim, sim.speed, false));
    collectFits(out, topTexts, topbar.panel, `TopBar ${tag}`);
    const flowing = topTexts.filter((t) => t.text !== 'A');
    for (const h of rowCollisions(flowing)) out.push(`TopBar ${tag}: "${h.a}" / "${h.b}" overlap ${h.overlap}px`);

    const ticker = buildCourierTicker(vw, topbar.panel.h, { scale });
    inside('Ticker', ticker.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawCourierTicker(c, ticker, LONG_EVENTS[LONG_EVENTS.length - 1])), ticker.frame, `Ticker ${tag}`);

    const ob = buildOnboarding(vw, topbar.panel.h + Math.round(12 * scale), { scale });
    inside('Onboarding', ob.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawOnboarding(c, ob, LONG_ONBOARDING)), ob.frame, `Onboarding ${tag}`);

    const cw = buildCourierWindow(vw, vh, { scale });
    inside('Courier', cw.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawCourierWindow(c, cw, LONG_EVENTS)), cw.frame, `Courier ${tag}`);

    const es = buildEndScreen(vw, vh, { scale });
    inside('EndScreen', es.frame, vw, vh, tag);
    collectFits(out, probe((c) => drawEndScreen(c, es, { kind: 'doom', year: 2001, month: 5, awakenings: 4 }, 1927)), es.frame, `EndScreen ${tag}`);

    const camera = { viewportW: vw, viewportH: vh, zoom: 2 };
    const strip = { x: 0, y: vh - statusStripH(scale), w: vw, h: statusStripH(scale) };
    inside('Status', strip, vw, vh, tag);
    collectFits(out, probe((c) => drawStatusStrip(c, camera, null, null, TOOL.QUERY, '', scale)), strip, `Status ${tag}`);

    const hband = { x: 0, y: vh - statusStripH(scale) - heraldBandH(scale), w: vw, h: heraldBandH(scale) };
    inside('Herald', hband, vw, vh, tag);
    collectFits(out, probe((c) => drawHeraldLine(c, camera, 'A cold violet seam splits the sky above the wharves.', 'wrath', scale)), hband, `Herald ${tag}`);
  }
  setChromeScale(1);
  assert.equal(out.length, 0, `largest-scale layout failure:\n  ${out.join('\n  ')}`);
});
