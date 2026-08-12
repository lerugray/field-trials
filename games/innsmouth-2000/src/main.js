// Browser entry for INNSMOUTH 2000 (M1 substrate + M2 tools).
//
// Wires the seeded coastal map, the camera, the dimetric renderer, and the OS-window toolbar to
// a canvas. Left button uses the selected tool (paint on drag); right button drags to pan; the
// wheel and +/- zoom; arrows pan; the query tool opens a draggable info window. This is the only
// module that touches the DOM; everything it imports is pure or canvas-injected.

import { makeMap } from './mapgen.js';
import { makeCamera } from './camera.js';
import { buildTileSprites, drawMap, drawAtmosphere, tileScreenFaces, drawAmbient } from './render.js';
import { scanAmbientSites, computeAmbient } from './ambient.js';
import { worldToTile, tileToWorld, worldToTileElevated } from './geometry.js';
import { CHROME } from './palette.js';
import {
  TOOL, TOOL_COST, toolCostAt, applyTool, canApply, isWaterTerrain, describeTile, VIEW,
} from './tools.js';
import { makeSim, SPEED, effectiveTickMs, explainLot } from './sim.js';
import { explainWater } from './water.js';
import { explainDeep } from './deep.js';
import { SUBSTRATE, substrateAt } from './aquifer.js';
import {
  buildToolbar, hitToolbar, overToolbar, inRect, drawToolbar,
  buildToolbarTooltip, drawToolbarTooltip, toolbarTooltipLines,
  hitViewToggle, viewToggleTooltipLines, viewForTool,
  buildQueryWindow, drawQueryWindow, toolForNumberKey,
  buildTopBar, drawTopBar, hitSpeed, overTopBar,
  buildBudgetWindow, drawBudgetWindow, budgetHit, overBudget, budgetControls, drawFocusRing,
  buildFavorWindow, drawFavorWindow, favorHit, overFavor,
  buildDisasterMenu, drawDisasterMenu, disasterHit, overDisaster,
  buildStartMenu, drawStartMenu, startMenuHit,
  buildTitleScreen, drawTitleScreen, titleScreenHit,
  buildHelpWindow, drawHelpWindow, helpHit, overHelp,
  buildQuickstartWindow, drawQuickstartWindow, quickstartHit, overQuickstart,
  cycleChromeScale, getChromeScale, setChromeScale,
} from './ui.js';
import { GOD_LIST, wrathForecast } from './gods.js';
import {
  buildMinimap, drawMinimap, overMinimap, minimapToTile,
  buildDemand, drawDemand, overDemand,
  buildCourierTicker, drawCourierTicker, overCourierTicker,
  buildCourierWindow, drawCourierWindow, courierHit, overCourier,
  buildOnboarding, drawOnboarding, overOnboarding,
  buildEndScreen, drawEndScreen, endScreenHit,
} from './overlays.js';
import { initMusic } from './music.js';
import { drawStatusStrip, drawHeraldLine } from './strips.js';
import { serializeSave, deserializeSave } from './save.js';
import { advise, buildAdvisorWindow, drawAdvisorWindow, advisorHit, overAdvisor } from './advisor.js';
import { scenarioFor, applyScenario } from './scenarios.js';

export function boot(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const seed = opts.seed ?? 'Innsmouth';
  const cols = opts.cols ?? 96;
  const rows = opts.rows ?? 96;

  let map = makeMap({ seed, cols, rows }); // `let`: a loaded save (M8) swaps in a new map + sim
  const sprites = buildTileSprites((w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  });

  const camera = makeCamera({
    mapCols: cols, mapRows: rows,
    viewportW: canvas.width, viewportH: canvas.height,
  });
  camera.panTo(0, camera.bounds.maxY * 0.62); // open on the shore

  // Title screen backdrop (operator-directed M9 title package): a second, fully built coastal town
  // that exists only to fill the title plate behind the menu. It is paused and never simulated
  // once the player starts a game.
  const titleSeed = `${seed}-title`;
  const titleMap = makeMap({ seed: titleSeed, cols, rows });
  const titleSim = makeSim(titleMap, { seed: titleSeed, wrath: false, scenario: 'standard' });
  const titleCamera = makeCamera({ mapCols: cols, mapRows: rows, viewportW: canvas.width, viewportH: canvas.height, zoom: 2 });
  const titleTownSpot = layTitleTown(titleMap);
  if (titleTownSpot) {
    for (let i = 0; i < 36; i++) titleSim.step();
    titleSim.setSpeed(SPEED.PAUSED);
    const tw = tileToWorld(titleTownSpot.col, titleTownSpot.row);
    titleCamera.panTo(tw.x, tw.y);
  } else {
    titleSim.setSpeed(SPEED.PAUSED);
    titleCamera.panTo(0, titleCamera.bounds.maxY * 0.62);
  }
  let titleAmbientSites = scanAmbientSites(titleMap);

  // Difficulty / scenario start (M8): ?scenario=easy|hard|recovery picks the treasury, ambient
  // dread, and (for recovery) a pre-flooded shore; the default is the standard town.
  const scenarioKey = opts.scenario
    || (typeof location !== 'undefined' ? (/(?:\?|&)scenario=(\w+)/.exec(location.search) || [])[1] : null)
    || 'standard';
  const scenario = scenarioFor(scenarioKey);
  let sim = makeSim(map, { seed, wrath: true, scenario: scenarioKey, ...scenario.opts });
  sim.setSpeed(scenario.startSpeed);
  applyScenario(sim, scenarioKey);
  // Which scenario is live right now (music.js's calm-band track differs for After the Tide);
  // `let` because startNewGame below swaps towns and this must track the one actually playing.
  let activeScenario = scenarioKey;

  // --- window state (declared before the demo/proof pre-run, which may open the favor window) ---
  let budgetOpen = false;
  let favorOpen = false;
  let disastersOpen = false;
  let courierOpen = false;
  let advisorOpen = false;
  let helpOpen = false;
  let quickstartOpen = false; // the first-five-minutes walkthrough (M9.7), from the start modal or Q
  let startOpen = false; // the difficulty / scenario picker (M8), reached from New Game
  let titleOpen = false; // title plate precedes the first-boot scenario picker
  let focusIndex = -1; // the keyboard focus stop within the Ledger (-1 = none)

  const search = typeof location !== 'undefined' ? location.search : '';
  const wantDemo = opts.demo || /(?:\?|&)demo\b/.test(search);
  // A proof hook: ?wrath=<kind> grows the demo town cleanly, then looses one named wrath and lets
  // it settle mid-effect, with the favor window open (the tightened M6 proof rule: show the claim).
  const wrathParam = opts.wrath || (/(?:\?|&)wrath=(\w+)/.exec(search) || [])[1] || null;
  const wantFavor = opts.panel === 'favor' || /(?:\?|&)favor\b/.test(search);
  const wantMenu = opts.panel === 'menu' || /(?:\?|&)menu\b/.test(search);
  // M7 proof hooks (headless cannot click): open the Courier or the Ledger, and set a larger chrome
  // text scale, so the milestone's new surfaces can be captured.
  const wantNews = opts.panel === 'news' || /(?:\?|&)news\b/.test(search);
  const wantLedger = opts.panel === 'ledger' || /(?:\?|&)ledger\b/.test(search);
  const wantEnd = opts.panel === 'end' || /(?:\?|&)end\b/.test(search); // the doom end screen (M8)
  const wantPriest = opts.panel === 'priest' || /(?:\?|&)priest\b/.test(search); // the advisor (M8)
  const wantHelp = opts.panel === 'help' || /(?:\?|&)help\b/.test(search); // the help/legend (M8)
  // M9 proof hook: frame the coastal town (water + roads + shrines) so the living world shows all of
  // its ambient life at once (gulls and shadows over the water, a cart on a lane, a procession).
  const wantAmbient = opts.panel === 'ambient' || /(?:\?|&)ambient\b/.test(search);
  // M-b proof hook: a two-plane coastal town with its intake sunk in brackish ground, run on for
  // three years so the water goes off ON ITS OWN, then opened below the street. Nothing is painted
  // in by hand: the taint, the presence, the sabotage and the signs are all the sim's own doing.
  const wantUnderground = opts.panel === 'underground' || /(?:\?|&)underground\b/.test(search);
  // ...and its companion: lay that same two-plane town and run it on, but stay ABOVE the street, so
  // the surface consequences (seeped damp ground, the works' own art) can be seen and captured.
  const wantAbove = /(?:\?|&)above\b/.test(search);
  const scaleParam = opts.scale || (/(?:\?|&)scale=(\w+)/.exec(search) || [])[1] || null;
  if (scaleParam === 'big') setChromeScale(1.5);
  else if (scaleParam === 'mid') setChromeScale(1.25);
  else {
    // High-DPI first session: the 11-13 px chrome floor is illegible on 1440p+ and Retina displays.
    // Default to the first bump when the CSS viewport or pixel density calls for it (M7 legibility).
    const cssW = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const cssH = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    if (cssW >= 2560 || cssH >= 1440 || dpr >= 2) setChromeScale(1.25);
  }
  const GOD_FOR_WRATH = {
    flood: 'dagon', awakening: 'cthulhu', greening: 'shub', burning: 'nyarlathotep', rift: 'yog',
  };
  const godsProof = wrathParam || wantFavor || wantMenu || wantNews || wantLedger || wantEnd
    || wantPriest || wantHelp || wantAmbient || wantUnderground;
  let demoSpot = null;
  let undergroundProof = null; // where the M-b proof put its works, so the query can open on one
  if (wantDemo || godsProof) {
    sim.wrath = false; // the gods wait for the deliberate summons below
    demoSpot = godsProof ? layGodsProofTown(map) : layDemoScene(map);
    // The M-b proof lays the whole underground over that town: a trunk main, works in three kinds of
    // ground, a filter house, and a valve shut on one branch.
    if (wantUnderground && demoSpot) {
      undergroundProof = layUndergroundProof(map, demoSpot, sim.aquiferOpts);
    }
    if (demoSpot) {
      // The gods-proof town is built up directly; a few steps settle power and class. The plain
      // demo grows from empty lots over its pre-run. The underground proof runs on for three years,
      // which is how long the brackish intake takes to poison its own network unaided.
      // Five years below the street: long enough for a brackish intake to poison its own network
      // outright and for the deep to crowd the void, which is what the milestone is about.
      const preRun = wantUnderground ? 60 : godsProof ? 3 : 44;
      for (let i = 0; i < preRun; i++) sim.step();
      let focus = demoSpot;
      if (wrathParam && GOD_FOR_WRATH[wrathParam]) {
        const ev = sim.summonWrath(GOD_FOR_WRATH[wrathParam]);
        // Let a crawling wrath spread a few rings so the proof shows it mid-effect, front still
        // alight (flames / fresh growth on the leading edge), not just the seed and not burned out.
        const rings = (wrathParam === 'greening' || wrathParam === 'burning') ? 3 : 1;
        for (let i = 0; i < rings; i++) sim.step();
        void ev;
        // Camera stays on the town: each wrath is seeded in or reaches the built streets, so the
        // town centre frames the disaster mid-effect.
      }
      // The doom end proof: let some years pass, then loose Cthulhu until the dreamer fully wakes.
      if (wantEnd) {
        for (let i = 0; i < 84; i++) sim.step(); // seven years stand before the end
        for (let i = 0; i < 8 && !sim.ended; i++) sim.summonWrath('cthulhu');
      }
      // The advisor proof: nudge a god toward anger so the Priest gives real counsel, then open him.
      if (wantPriest) { sim.favor.dagon = 8; sim.favor.shub = 24; advisorOpen = true; }
      if (wantHelp) helpOpen = true;
      favorOpen = wantFavor;
      disastersOpen = wantMenu;
      courierOpen = wantNews;
      budgetOpen = wantLedger;
      if (wantLedger) focusIndex = 0; // show the keyboard focus ring on the first tax control
      sim.setSpeed(SPEED.PAUSED); // freeze for a clean capture
      // A proof capture is about the map, not about the onboarding banner sitting over it.
      if (wantUnderground) sim.hints.length = 0;
      camera.setZoom(2);
      // The ambient proof frames the shore: pan a few tiles seaward so open water fills the lower
      // frame, where the gulls, the sea shadows, and a drifting fog bank read cleanly.
      const framed = wantAmbient ? { col: focus.col + 4, row: focus.row + 6 } : focus;
      const w = tileToWorld(framed.col, framed.row);
      camera.panTo(w.x, w.y);
    }
  }

  // The title plate greets an ordinary first boot; New Game then opens the scenario picker. Named
  // scenarios and proof hooks keep their direct-entry behavior, while ?start still targets the picker.
  const scenarioChosen = !!(opts.scenario || (typeof location !== 'undefined' && /(?:\?|&)scenario=/.test(location.search)));
  const wantStart = /(?:\?|&)start\b/.test(search);
  if (wantStart) {
    startOpen = true;
    sim.setSpeed(SPEED.PAUSED);
  } else if (!wantDemo && !godsProof && !scenarioChosen) {
    titleOpen = true;
    sim.setSpeed(SPEED.PAUSED);
  }

  // --- interaction state ---
  let selectedTool = wantUnderground && !wantAbove ? TOOL.PIPE : TOOL.QUERY;
  // Which plane the player is working on (M-a). The underground view keeps the same map, camera,
  // and chrome; only the palette and what the map draws change.
  let view = wantUnderground && !wantAbove ? VIEW.UNDERGROUND : VIEW.SURFACE;
  let topbar = buildTopBar(canvas.width);
  let toolbar = buildToolbar({ y: topbar.panel.h + 8, view });
  // Rebuild the top bar, Courier ticker, and toolbar together: the toolbar docks below both bars,
  // and all three grow with the chrome text scale.
  function relayoutBars() {
    topbar = buildTopBar(canvas.width);
    const th = buildCourierTicker(canvas.width, topbar.panel.h, { scale: getChromeScale() }).frame.h;
    const ty = topbar.panel.h + th + 8;
    // The palette gets the room above the Demand gadget docked bottom-left, and tightens its own
    // pitch if the full-size wells will not fit (the long surface palette at the largest text
    // scale on a small viewport). Without this the view toggle would hide under the gadget.
    const maxH = Math.max(120, currentDemand().frame.y - ty - 8);
    toolbar = buildToolbar({ y: ty, view, maxH });
  }
  relayoutBars();
  let lastTick = 0;
  let hover = null; // tile under the cursor
  let hoveredTool = null; // toolbar tool under the cursor, for the hover tooltip
  let hoveredViewToggle = false; // the view toggle under the cursor (it is not a tool)
  let toolbarFocusIndex = -1; // the keyboard focus stop within the toolbar (-1 = none)
  let message = null; // last refusal/feedback line
  // { col, row, x, y } open query window.
  let query = null;
  // The demo opens a query on the shrine so proofs show a structure readout beside the town art.
  if (demoSpot && !godsProof) query = { col: demoSpot.col - 2, row: demoSpot.row - 2, x: 80, y: 470 };
  // The M-b proof opens a query on the pump house it sank in brackish ground, which is the single
  // most informative readout in the milestone: the network's pressure and quality, the state of the
  // intake, the ground it stands in, and whatever the survey party saw down there. Every line of it
  // is read off three years of ordinary simulation, not written in for the capture.
  if (undergroundProof && undergroundProof.pump) {
    query = { col: undergroundProof.pump.col, row: undergroundProof.pump.row, x: 96, y: 300 };
  }
  // Music: loops a supplied track (assets/music/) at a bed volume if present, else silent.
  const music = initMusic(typeof window !== 'undefined' ? window : null);
  const mode = { pan: false, paint: false, winDrag: false };
  let lastX = 0;
  let lastY = 0;
  let lastPaintKey = null;

  let dirty = true;
  const markDirty = () => { dirty = true; };

  // Switch plane (M-a). The palette follows the view; a tool that only exists on the other plane
  // gives way to Query rather than staying selected where it cannot be used.
  function setView(next) {
    if (view === next) return;
    view = next;
    const wanted = viewForTool(selectedTool);
    if (wanted && wanted !== view) selectedTool = TOOL.QUERY;
    toolbarFocusIndex = -1;
    message = null;
    relayoutBars();
    markDirty();
  }

  // Selecting a tool that belongs to the other plane takes the player there, so the build tools
  // and the view are never out of step (the spec's "build tools switch context").
  function selectTool(tool) {
    selectedTool = tool;
    const wanted = viewForTool(tool);
    if (wanted && wanted !== view) setView(wanted);
  }

  // Ambient animation (M9): the living world painted over the map. The sites it attaches to
  // (water, roads, shrines) are scanned occasionally; the per-frame entities are cheap and hard-
  // capped. A reduced-motion / low-power toggle stills every moving thing; it honours the OS's
  // reduced-motion preference and a ?still proof hook on first boot, and the player can flip it
  // from the top-bar gull button or the M key.
  let reducedMotion = /(?:\?|&)still\b/.test(search)
    || (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;
  let ambientSites = scanAmbientSites(map);
  let lastSiteScan = 0;
  let lastAmbientDraw = 0;
  const AMBIENT_INTERVAL = 66; // ~15fps: the throttle that keeps the living world cheap
  const SITE_RESCAN_MS = 2000; // road/shrine/water change slowly; rescan seldom
  function refreshAmbientSites() { ambientSites = scanAmbientSites(map); }

  function resize() {
    const w = canvas.clientWidth || opts.width || 1280;
    const h = canvas.clientHeight || opts.height || 800;
    canvas.width = w;
    canvas.height = h;
    camera.setViewport(w, h).clampToBounds();
    titleCamera.setViewport(w, h).clampToBounds();
    relayoutBars();
    markDirty();
  }

  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Screen -> tile, elevation-corrected (M9.7: the cursor/tile misalignment fix -- see
  // geometry.js's worldToTileElevated for the full story and its measured limit).
  function tileUnder(sx, sy) {
    const w = camera.screenToWorld(sx, sy);
    return worldToTileElevated(w.x, w.y, map);
  }

  function paintAt(t) {
    if (sim.ended) return;
    if (!map.inBounds(t.col, t.row)) return;
    const key = `${t.col},${t.row}`;
    if (key === lastPaintKey) return; // one application per tile per drag stroke
    lastPaintKey = key;
    // The bulldozer works the plane the player is looking at, so clearing a lot above never lifts
    // the main below, and vice versa. The sealing works needs the scenario's own subsurface settings
    // to know whether there is a fissure here at all.
    const opts = { view, tick: sim.tick, aquiferOpts: sim.aquiferOpts };
    const check = canApply(map, selectedTool, t.col, t.row, opts);
    if (!check.ok) { message = check.reason; markDirty(); return; }
    // What the tool costs AT this tile: almost always its flat price, but working a valve that is
    // already fitted is free (tools.js owns that rule, so the charge and the act cannot disagree).
    const cost = toolCostAt(map, selectedTool, t.col, t.row);
    if (!sim.spend(cost)) { message = 'The treasury cannot bear it.'; markDirty(); return; }
    const result = applyTool(map, selectedTool, t.col, t.row, opts);
    // Consequences the world answers for rather than the map: capping a fissure angers Dagon.
    sim.noteBuild(selectedTool, t.col, t.row);
    // A flush is invisible on the map until the next tick, so it says what it did.
    if (selectedTool === TOOL.FLUSH && result.ok) {
      message = `The mains are run off: ${result.tiles} lengths flushed.`;
    } else {
      message = null;
    }
    markDirty();
  }

  // Save / load (M8). The town lives in the browser's local store under one slot; a load swaps in a
  // whole new sim + map (both are `let`, so every closure picks up the new one). Feedback goes to the
  // status strip in plain English. Wrapped in try/catch because a double-clicked file:// page may
  // refuse storage; the player is told rather than left guessing.
  const SAVE_KEY = 'innsmouth2000-save';
  const AUTO_SAVE_TICKS = 6;
  let lastAutoSaveTick = sim.tick;
  function hasSavedTown() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (err) { return false; }
  }
  function saveTown() {
    try {
      localStorage.setItem(SAVE_KEY, serializeSave(sim));
      message = 'Town saved.';
    } catch (err) {
      message = 'Could not save the town in this browser.';
    }
  }
  function loadTown({ fromTitle = false } = {}) {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (!text) { message = 'There is no saved town to load.'; return; }
      sim = deserializeSave(text);
      map = sim.map;
      activeScenario = scenarioFor(sim.scenario).key;
      query = null; budgetOpen = false; favorOpen = false; disastersOpen = false; courierOpen = false; focusIndex = -1;
      camera.setViewport(canvas.width, canvas.height).clampToBounds();
      relayoutBars();
      refreshAmbientSites();
      lastAutoSaveTick = sim.tick;
      titleOpen = false;
      message = 'Town loaded.';
    } catch (err) {
      message = 'Could not load a town from this browser.';
      if (fromTitle) titleOpen = true;
    }
  }

  // Begin a fresh game on the chosen scenario (M8). Rebuilds the map + sim and resets the view; both
  // are `let`, so every closure picks up the new ones (the same swap the loader performs).
  function startNewGame(key) {
    map = makeMap({ seed, cols, rows });
    sim = makeSim(map, { seed, wrath: true, scenario: key, ...scenarioFor(key).opts });
    sim.setSpeed(scenarioFor(key).startSpeed);
    applyScenario(sim, key);
    activeScenario = key;
    startOpen = false;
    titleOpen = false;
    query = null; budgetOpen = false; favorOpen = false; disastersOpen = false; courierOpen = false; advisorOpen = false; focusIndex = -1;
    camera.setViewport(canvas.width, canvas.height);
    camera.panTo(0, camera.bounds.maxY * 0.62);
    camera.clampToBounds();
    relayoutBars();
    refreshAmbientSites();
    message = null;
    markDirty();
  }

  function currentAdvice() { return advise(sim); }
  function currentAdvisorLayout() {
    return buildAdvisorWindow(canvas.width, canvas.height, { scale: getChromeScale(), lines: currentAdvice().lines });
  }

  function currentBudgetLayout() {
    return buildBudgetWindow(canvas.width, canvas.height);
  }

  // The Help window's live Sound line: what the music system is actually doing right now, so the
  // reference never lies (a bare single-file open with no assets/music/ says so plainly).
  function musicStatusLine() {
    if (!music.hasTrack()) return 'Music: no tracks found in assets/music. The town stays quiet.';
    if (music.isMuted()) return 'Music: off. The speaker button in the top bar turns it back on.';
    return `Music: on, bed volume ${music.volumeIndex() + 1} of ${music.volumeLevels()}.`;
  }
  function currentHelpLayout() {
    return buildHelpWindow(canvas.width, canvas.height, { musicLine: musicStatusLine() });
  }
  function currentQuickstartLayout() {
    return buildQuickstartWindow(canvas.width, canvas.height);
  }

  // The Ledger's action dispatcher, shared by the mouse click path and the keyboard focus path so
  // both run the exact same code (M7 keyboard chrome).
  function dispatchBudget(action) {
    if (action.type === 'close') { budgetOpen = false; focusIndex = -1; }
    else if (action.type === 'tax') sim.setTax(action.cls, sim.taxRates[action.cls] + action.dir * 0.01);
    else if (action.type === 'ordinance') sim.toggleOrdinance(action.key);
  }

  // The minimap docks bottom-right, above the status strip and the reserved herald row.
  function currentMinimap() {
    const scale = getChromeScale();
    const bottomInset = Math.round(22 * scale) + Math.round(20 * scale) + 6;
    return buildMinimap(canvas.width, canvas.height, cols, rows, { bottomInset, scale });
  }

  // The Courier ticker sits under the top bar; the full paper is a centred window.
  function currentTicker() {
    return buildCourierTicker(canvas.width, topbar.panel.h, { scale: getChromeScale() });
  }
  function currentCourier() {
    return buildCourierWindow(canvas.width, canvas.height, { scale: getChromeScale() });
  }
  // The onboarding banner sits just under the Courier ticker.
  function currentOnboarding() {
    const th = topbar.panel.h + currentTicker().frame.h;
    return buildOnboarding(canvas.width, th, { scale: getChromeScale() });
  }

  // The demand indicator docks bottom-left, above the status strip.
  function currentDemand() {
    const scale = getChromeScale();
    const bottomInset = Math.round(22 * scale) + 6;
    return buildDemand(canvas.width, canvas.height, { bottomInset, scale });
  }

  // The four screen-corner tiles of the camera's visible region, for the minimap viewport outline.
  function viewportCornerTiles() {
    const vw = camera.viewportW;
    const vh = camera.viewportH;
    return [[0, 0], [vw, 0], [vw, vh], [0, vh]].map(([sx, sy]) => {
      const w = camera.screenToWorld(sx, sy);
      const t = worldToTile(w.x, w.y);
      return { col: t.col, row: t.row };
    });
  }

  function currentQueryLayout() {
    if (!query) return null;
    const desc = describeTile(map, query.col, query.row);
    // The query answers WHY (M7): merge the sim's plain-English diagnosis of a zoned lot (stalled
    // for want of a road, dark for want of power, or why its residents are who they are).
    const why = explainLot(sim, query.col, query.row);
    if (why.length) desc.lines = desc.lines.concat(why);
    // The water readout (M-a): what the main beneath is doing, or what service reaches this ground.
    const wet = explainWater(sim, query.col, query.row);
    if (wet.length) desc.lines = desc.lines.concat(wet);
    // The subsurface (M-b): what the ground holds, and what the survey party saw in it. Only when
    // the player is actually looking below, so the surface query is not buried in geology.
    if (view === VIEW.UNDERGROUND) {
      const below = explainDeep(sim, query.col, query.row);
      if (below.length) desc.lines = desc.lines.concat(below);
    }
    return { layout: buildQueryWindow(query.x, query.y, { lines: desc.lines, title: desc.title }), desc };
  }

  // --- pointer handling ---
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    const { x: sx, y: sy } = canvasXY(e);
    lastX = e.clientX;
    lastY = e.clientY;

    if (e.button === 2 || e.button === 1) { mode.pan = true; e.preventDefault(); return; }
    if (e.button !== 0) return;

    // The Quickstart sits on top of everything else (including the start picker, when opened
    // from there) -- its own close box takes priority for as long as it's open.
    if (quickstartOpen) {
      const hit = quickstartHit(currentQuickstartLayout(), sx, sy);
      if (hit) { quickstartOpen = false; markDirty(); return; }
      if (overQuickstart(currentQuickstartLayout(), sx, sy)) return;
    }

    // The start picker is modal: a click either begins the chosen scenario, opens the
    // Quickstart (M9.7, leaving the picker underneath), or is swallowed (M8).
    if (startOpen) {
      const hit = startMenuHit(buildStartMenu(canvas.width, canvas.height), sx, sy);
      if (hit && hit.type === 'pick') startNewGame(hit.key);
      else if (hit && hit.type === 'quickstart') { quickstartOpen = true; markDirty(); }
      return;
    }

    // The title is modal until the player starts or resumes a town.
    if (titleOpen) {
      const hit = titleScreenHit(buildTitleScreen(canvas.width, canvas.height, { canContinue: hasSavedTown() }), sx, sy);
      if (hit && hit.type === 'new') { titleOpen = false; startOpen = true; markDirty(); }
      else if (hit && hit.type === 'continue') { loadTown({ fromTitle: true }); markDirty(); }
      else if (hit && hit.type === 'quickstart') { quickstartOpen = true; markDirty(); }
      return;
    }

    // The loss plate is modal: the town is over. New Game opens the scenario picker.
    if (sim.ended) {
      const hit = endScreenHit(buildEndScreen(canvas.width, canvas.height, { scale: getChromeScale() }), sx, sy);
      if (hit && hit.type === 'new') { startOpen = true; markDirty(); }
      return;
    }

    // The onboarding banner (if one is showing) takes the first click to dismiss itself.
    if (sim.hints.length && overOnboarding(currentOnboarding(), sx, sy)) {
      sim.hints.shift();
      markDirty();
      return;
    }

    // The minimap: a click recenters the camera on that quarter of the town.
    const mini = currentMinimap();
    if (overMinimap(mini, sx, sy)) {
      const t = minimapToTile(mini, sx, sy);
      const w = tileToWorld(t.col, t.row);
      camera.panTo(w.x, w.y);
      markDirty();
      return;
    }
    // The demand indicator: a click opens the Town Ledger, where the economy lives.
    if (overDemand(currentDemand(), sx, sy)) { budgetOpen = true; markDirty(); return; }

    // The Ledger window, when open, takes clicks first.
    if (budgetOpen) {
      const layout = currentBudgetLayout();
      const hit = budgetHit(layout, sx, sy);
      if (hit) {
        dispatchBudget(hit);
        markDirty();
        return;
      }
      if (overBudget(layout, sx, sy)) return; // window body swallows the click
    }

    // The Favor of the Gods window (read-only but for its close box).
    if (favorOpen) {
      const layout = buildFavorWindow(canvas.width, canvas.height);
      const hit = favorHit(layout, sx, sy);
      if (hit) { favorOpen = false; markDirty(); return; }
      if (overFavor(layout, sx, sy)) return;
    }

    // The Summon a Wrath menu: a click looses that god upon the town.
    if (disastersOpen) {
      const layout = buildDisasterMenu(canvas.width, canvas.height);
      const hit = disasterHit(layout, sx, sy);
      if (hit) {
        if (hit.type === 'close') disastersOpen = false;
        else if (hit.type === 'summon') {
          sim.summonWrath(hit.god);
          message = sim.lastWrath ? sim.lastWrath.message : null;
          disastersOpen = false;
        }
        markDirty();
        return;
      }
      if (overDisaster(layout, sx, sy)) return;
    }

    // The Innsmouth Courier window (read-only but for its close box).
    if (courierOpen) {
      const layout = currentCourier();
      const hit = courierHit(layout, sx, sy);
      if (hit) { courierOpen = false; markDirty(); return; }
      if (overCourier(layout, sx, sy)) return;
    }

    // The Old Priest advisor (read-only but for its close box).
    if (advisorOpen) {
      const layout = currentAdvisorLayout();
      const hit = advisorHit(layout, sx, sy);
      if (hit) { advisorOpen = false; markDirty(); return; }
      if (overAdvisor(layout, sx, sy)) return;
    }

    // The Help and Legend window (read-only but for its close box).
    if (helpOpen) {
      const layout = currentHelpLayout();
      const hit = helpHit(layout, sx, sy);
      if (hit) { helpOpen = false; markDirty(); return; }
      if (overHelp(layout, sx, sy)) return;
    }

    // Top bar: window buttons, speed buttons, and the bar swallows other clicks.
    if (topbar.ledger && inRect(topbar.ledger, sx, sy)) { budgetOpen = !budgetOpen; markDirty(); return; }
    if (topbar.gods && inRect(topbar.gods, sx, sy)) { favorOpen = !favorOpen; markDirty(); return; }
    if (topbar.disasters && inRect(topbar.disasters, sx, sy)) { disastersOpen = !disastersOpen; markDirty(); return; }
    if (topbar.save && inRect(topbar.save, sx, sy)) { saveTown(); markDirty(); return; }
    if (topbar.mute && inRect(topbar.mute, sx, sy)) { music.toggleMute(); markDirty(); return; }
    if (topbar.vol && inRect(topbar.vol, sx, sy)) { music.cycleVolume(); markDirty(); return; }
    if (topbar.motion && inRect(topbar.motion, sx, sy)) { reducedMotion = !reducedMotion; markDirty(); return; }
    if (topbar.textscale && inRect(topbar.textscale, sx, sy)) {
      cycleChromeScale();
      relayoutBars();
      markDirty();
      return;
    }
    const sp = hitSpeed(topbar, sx, sy);
    if (sp) { sim.setSpeed(sp); markDirty(); return; }
    if (overTopBar(topbar, sx, sy)) return;

    // The Courier ticker (just under the top bar): a click opens the full paper.
    if (overCourierTicker(currentTicker(), sx, sy)) { courierOpen = !courierOpen; markDirty(); return; }

    // Query window has priority for its own chrome.
    const q = currentQueryLayout();
    if (q) {
      if (inRect(q.layout.close, sx, sy)) { query = null; markDirty(); return; }
      if (inRect(q.layout.titleBar, sx, sy)) { mode.winDrag = true; return; }
    }
    // Toolbar next. The view toggle is checked first: it sits on the panel but selects no tool.
    if (hitViewToggle(toolbar, sx, sy)) {
      setView(view === VIEW.UNDERGROUND ? VIEW.SURFACE : VIEW.UNDERGROUND);
      return;
    }
    const picked = hitToolbar(toolbar, sx, sy);
    if (picked) { selectTool(picked); message = null; markDirty(); return; }
    if (overToolbar(toolbar, sx, sy)) return; // panel background swallows the click

    // Map interaction with the selected tool.
    const t = tileUnder(sx, sy);
    if (selectedTool === TOOL.QUERY) {
      if (map.inBounds(t.col, t.row)) {
        const tickerBottom = currentTicker().frame.y + currentTicker().frame.h + 4;
        const x = Math.min(sx, camera.viewportW - 220);
        const y = Math.min(sy, camera.viewportH - 120);
        query = { col: t.col, row: t.row, x: Math.max(4, x), y: Math.max(tickerBottom, y) };
        markDirty();
      }
    } else {
      lastPaintKey = null;
      mode.paint = true;
      paintAt(t);
    }
  });

  window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const { x: sx, y: sy } = canvasXY(e);
    hover = tileUnder(sx, sy);
    hoveredTool = hitToolbar(toolbar, sx, sy); // for the toolbar hover tooltip
    hoveredViewToggle = hitViewToggle(toolbar, sx, sy); // the view toggle names itself too

    if (mode.pan) camera.panByScreen(-dx, -dy);
    else if (mode.winDrag && query) {
      const tickerBottom = currentTicker().frame.y + currentTicker().frame.h + 4;
      query.x = Math.max(4, Math.min(query.x + dx, camera.viewportW - 60));
      query.y = Math.max(tickerBottom, Math.min(query.y + dy, camera.viewportH - 40));
    } else if (mode.paint) paintAt(tileUnder(sx, sy));
    markDirty();
  });

  window.addEventListener('mouseup', () => {
    mode.pan = false;
    mode.paint = false;
    mode.winDrag = false;
    lastPaintKey = null;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) camera.zoomIn(); else camera.zoomOut();
    markDirty();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const step = 64;

    // Keyboard chrome (M7). Tab cycles the Ledger's controls; Enter activates the focused one, or
    // (no window open) places the selected tool at the hovered tile, or queries it.
    if (e.key === 'Tab' && budgetOpen) {
      const controls = budgetControls(currentBudgetLayout());
      const dir = e.shiftKey ? -1 : 1;
      focusIndex = (focusIndex + dir + controls.length) % controls.length;
      e.preventDefault(); markDirty(); return;
    }
    // The palette is focusable too: with no window open, Tab steps through its buttons (the tool
    // hover tooltip doubles as the focus tooltip, M10), Enter picks the focused tool.
    const noWindowOpen = !budgetOpen && !favorOpen && !disastersOpen && !courierOpen && !advisorOpen && !helpOpen && !quickstartOpen && !startOpen && !titleOpen && !sim.ended;
    if (e.key === 'Tab' && noWindowOpen) {
      const dir = e.shiftKey ? -1 : 1;
      const n = toolbar.buttons.length;
      toolbarFocusIndex = ((toolbarFocusIndex < 0 ? (dir > 0 ? -1 : 0) : toolbarFocusIndex) + dir + n) % n;
      e.preventDefault(); markDirty(); return;
    }
    if (e.key === 'Enter') {
      if (budgetOpen && focusIndex >= 0) {
        const controls = budgetControls(currentBudgetLayout());
        if (controls[focusIndex]) dispatchBudget(controls[focusIndex].action);
        e.preventDefault(); markDirty(); return;
      }
      if (noWindowOpen && toolbarFocusIndex >= 0) {
        const b = toolbar.buttons[toolbarFocusIndex];
        if (b) { selectedTool = b.tool; message = null; }
        e.preventDefault(); markDirty(); return;
      }
      if (noWindowOpen && hover && map.inBounds(hover.col, hover.row)) {
        if (selectedTool === TOOL.QUERY) {
          query = { col: hover.col, row: hover.row, x: 80, y: currentTicker().frame.y + currentTicker().frame.h + 8 };
        } else {
          lastPaintKey = null;
          paintAt(hover);
        }
        e.preventDefault(); markDirty(); return;
      }
    }
    // Window hotkeys: open or close a panel from the keyboard.
    if (e.key === 'h' || e.key === 'H' || e.key === '?') { helpOpen = !helpOpen; markDirty(); return; }
    if (e.key === 'q' || e.key === 'Q') { quickstartOpen = !quickstartOpen; markDirty(); return; }
    const openKey = { b: 'budget', g: 'gods', k: 'disasters', n: 'courier', p: 'advisor' }[e.key];
    if (openKey) {
      if (openKey === 'budget') { budgetOpen = !budgetOpen; focusIndex = -1; }
      else if (openKey === 'gods') favorOpen = !favorOpen;
      else if (openKey === 'disasters') disastersOpen = !disastersOpen;
      else if (openKey === 'courier') courierOpen = !courierOpen;
      else if (openKey === 'advisor') advisorOpen = !advisorOpen;
      markDirty(); return;
    }

    // Save (S) and load (L), with a plain-English acknowledgement in the status strip (M8). The
    // town is kept in the browser's local store; a loaded town swaps in wholesale.
    if (e.key === 'S' || e.key === 's') { saveTown(); markDirty(); return; }
    if (e.key === 'L' || e.key === 'l') { loadTown(); markDirty(); return; }
    // M stills or wakes the living world (ambient motion), the reduced-motion / low-power toggle.
    if (e.key === 'm' || e.key === 'M') { reducedMotion = !reducedMotion; markDirty(); return; }
    // U goes below the street and back (M-a): the underground utility view.
    if (e.key === 'u' || e.key === 'U') {
      setView(view === VIEW.UNDERGROUND ? VIEW.SURFACE : VIEW.UNDERGROUND);
      return;
    }

    if (sim.ended) {
      if (e.key === 'Enter') { startOpen = true; markDirty(); }
      return;
    }

    // Number keys 1-9 select the current plane's palette. Below the street that is the water
    // tools, so a digit never picks a surface tool and yanks the view up.
    const pickedKey = toolForNumberKey(parseInt(e.key, 10), view);
    if (pickedKey) { selectTool(pickedKey); markDirty(); return; }
    if (e.key === 'ArrowLeft') camera.panByScreen(-step, 0);
    else if (e.key === 'ArrowRight') camera.panByScreen(step, 0);
    else if (e.key === 'ArrowUp') camera.panByScreen(0, -step);
    else if (e.key === 'ArrowDown') camera.panByScreen(0, step);
    else if (e.key === '+' || e.key === '=') camera.zoomIn();
    else if (e.key === '-' || e.key === '_') camera.zoomOut();
    else if (e.key === 'Escape') { query = null; budgetOpen = false; favorOpen = false; disastersOpen = false; courierOpen = false; advisorOpen = false; helpOpen = false; quickstartOpen = false; toolbarFocusIndex = -1; }
    else return;
    markDirty();
  });

  // --- draw loop: advance the sim on its clock; repaint when something changed ---
  let lastSpeed = SPEED.MEDIUM;
  function frame(now) {
    if (sim.ended && sim.speed !== SPEED.PAUSED) { sim.setSpeed(SPEED.PAUSED); dirty = true; }
    // The effective interval holds the sim back to no faster than SLOW while a wrath is loose
    // (M9 auto-slow); the player's chosen speed is untouched and resumes when it clears.
    const interval = effectiveTickMs(sim.speed, !!sim.disaster, sim.autoSlow);
    if (sim.speed !== SPEED.PAUSED && Number.isFinite(interval)) {
      if (now - lastTick >= interval) {
        sim.step();
        lastTick = now;
        if (sim.tick - lastAutoSaveTick >= AUTO_SAVE_TICKS) {
          saveTown();
          lastAutoSaveTick = sim.tick;
        }
        dirty = true;
      }
    } else {
      lastTick = now;
    }
    if (sim.speed !== SPEED.PAUSED) lastSpeed = sim.speed;

    // Music (M9.6): bands the game's state into a mood and crossfades between that band's tracks.
    // Runs every frame (not gated on `dirty`) so its fades stay smooth regardless of the sim clock.
    music.update({
      screen: startOpen || titleOpen ? 'title' : 'play',
      dread: sim.dread,
      scenario: activeScenario,
      doom: !!(sim.ended && sim.ended.kind === 'doom'),
    });

    // Ambient (M9): rescan its sites seldom, and force a throttled repaint so the living world moves
    // even when the sim is paused (it is atmosphere, not simulation). Stilled by reduced motion.
    if (now - lastSiteScan >= SITE_RESCAN_MS) { refreshAmbientSites(); lastSiteScan = now; }
    if (!reducedMotion && now - lastAmbientDraw >= AMBIENT_INTERVAL) { dirty = true; lastAmbientDraw = now; }

    if (dirty) {
      if (titleOpen) {
        // Title screen package: a real generated town as the backdrop, with ambient life and a
        // faint phosphor shimmer over the plate.
        drawMap(ctx, titleMap, titleCamera, sprites, titleSim.power, null);
        const tvr = titleCamera.visibleWorldRect();
        const titleBounds = { minX: tvr.left - 120, maxX: tvr.right + 120, minY: tvr.top - 120, maxY: tvr.bottom + 120 };
        drawAmbient(ctx, computeAmbient(titleAmbientSites, titleBounds, now, { reducedMotion }), titleCamera);
        drawTitleScreen(ctx, buildTitleScreen(canvas.width, canvas.height, { canContinue: hasSavedTown() }), { now, reducedMotion });
        drawTitleShimmer(ctx, now, reducedMotion);
      } else {
        const below = view === VIEW.UNDERGROUND;
        drawMap(ctx, map, camera, sprites, sim.power, sim.disaster, {
          view, water: sim.water,
          // M-b: the ground itself, and the deep's signs in it. `now` drives the few things down
          // there that move; reduced motion stills them, like everything else in the living world.
          aquifer: sim.aquifer, deep: sim.deep, now: reducedMotion ? 0 : now,
          // The blue-hour atmosphere reads the dread meter: the fog wash thickens and the vignette
          // closes in as the town goes wrong, so the plate itself darkens over a campaign.
          dread: sim.dread,
        });
        // The living world rides over the map, under the chrome. Gulls and fog populate the VISIBLE
        // rectangle (so a flock is always present at any zoom or pan), while sea shadows, carts, and
        // processions stay anchored to their world sites. None of it belongs below the street.
        if (!below) {
          const vr = camera.visibleWorldRect();
          const viewBounds = { minX: vr.left - 120, maxX: vr.right + 120, minY: vr.top - 120, maxY: vr.bottom + 120 };
          drawAmbient(ctx, computeAmbient(ambientSites, viewBounds, now, { reducedMotion }), camera);
        }
        drawHoverCursor(ctx, camera, hover, map, selectedTool);
        drawToolbar(ctx, toolbar, selectedTool);
        drawTopBar(ctx, topbar, sim, sim.speed, music.isMuted(), reducedMotion, music.volumeIndex(), music.volumeLevels());
        // The Courier ticker rides under the top bar with the latest headline.
        drawCourierTicker(ctx, currentTicker(), sim.events[sim.events.length - 1] || null);
        // Query sits above the ticker so a readout dragged high never paints under the headline.
        const q = currentQueryLayout();
        if (q) drawQueryWindow(ctx, q.layout, q.desc);
        // The ambient onboarding hint rides just under the ticker; draw it BEFORE the modal windows so
        // a window the player opened always sits on top of it (else a tall panel's title bar hides
        // under the banner at large chrome scales).
        if (sim.hints.length) drawOnboarding(ctx, currentOnboarding(), sim.hints[0]);
        if (courierOpen) drawCourierWindow(ctx, currentCourier(), sim.events);
        if (budgetOpen) {
          const bl = currentBudgetLayout();
          drawBudgetWindow(ctx, bl, sim);
          if (focusIndex >= 0) {
            const controls = budgetControls(bl);
            if (controls[focusIndex]) drawFocusRing(ctx, controls[focusIndex].rect);
          }
        }
        if (favorOpen) drawFavorWindow(ctx, buildFavorWindow(canvas.width, canvas.height), sim);
        if (disastersOpen) drawDisasterMenu(ctx, buildDisasterMenu(canvas.width, canvas.height));
        if (advisorOpen) drawAdvisorWindow(ctx, currentAdvisorLayout(), currentAdvice());
        if (helpOpen) drawHelpWindow(ctx, currentHelpLayout());
        // Two separate slots (M7): the herald band carries the world's own voice (an active wrath's
        // cry, or the omen of a god sinking toward wrath), while the status strip carries the tool
        // readout and the last blocked-action refusal. A wrath must never swallow a refusal again.
        const forecast = wrathForecast(sim);
        const heraldText = sim.disaster && sim.lastWrath ? sim.lastWrath.message : forecast.omenLine;
        const heraldTone = sim.disaster ? 'wrath' : 'omen';
        const uiScale = getChromeScale();
        drawMinimap(ctx, currentMinimap(), map, viewportCornerTiles());
        drawDemand(ctx, currentDemand(), sim);
        if (heraldText) drawHeraldLine(ctx, camera, heraldText, heraldTone, uiScale);
        drawStatusStrip(ctx, camera, hover, map, selectedTool, message, uiScale);
        // The palette's hover/focus tooltip (M10): names the button under the mouse, or (with no
        // window open) the one holding keyboard focus, styled like every other popup. Suppressed
        // whenever a window covers the toolbar, or the mouse position is stale from before one opened.
        const paletteChromeFree = !courierOpen && !budgetOpen && !favorOpen && !disastersOpen
          && !advisorOpen && !helpOpen && !quickstartOpen && !startOpen && !titleOpen && !sim.ended;
        if (paletteChromeFree) {
          if (toolbarFocusIndex >= 0 && toolbar.buttons[toolbarFocusIndex]) {
            drawFocusRing(ctx, toolbar.buttons[toolbarFocusIndex].rect);
          }
          const activeButton = hoveredTool
            ? toolbar.buttons.find((b) => b.tool === hoveredTool)
            : (toolbarFocusIndex >= 0 ? toolbar.buttons[toolbarFocusIndex] : null);
          const ticker = currentTicker();
          const tooltipMinY = ticker.frame.y + ticker.frame.h + 2;
          if (activeButton) {
            const ttLines = toolbarTooltipLines(activeButton.tool, view);
            if (ttLines) {
              const tt = buildToolbarTooltip(activeButton.rect, ttLines, canvas.width, canvas.height, { minY: tooltipMinY });
              drawToolbarTooltip(ctx, tt, ttLines);
            }
          } else if (hoveredViewToggle && toolbar.viewToggle) {
            const vtLines = viewToggleTooltipLines(view);
            const tt = buildToolbarTooltip(toolbar.viewToggle.rect, vtLines, canvas.width, canvas.height, { minY: tooltipMinY });
            drawToolbarTooltip(ctx, tt, vtLines);
          }
        }
        // The end screen (M8 doom clock): once the dreamer wakes, the map dims under the final plate.
        if (sim.ended) drawEndScreen(ctx, buildEndScreen(canvas.width, canvas.height, { scale: uiScale }), sim.ended, sim.foundedYear);
        // The start picker sits over the opening map after New Game.
        if (startOpen) drawStartMenu(ctx, buildStartMenu(canvas.width, canvas.height));
      }
      // The Quickstart draws last of all: on top of the title plate when opened from there,
      // or on top of the ordinary game view when opened in-game via Q.
      if (quickstartOpen) drawQuickstartWindow(ctx, currentQuickstartLayout());
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  // Spacebar toggles pause and resume.
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      sim.setSpeed(sim.speed === SPEED.PAUSED ? lastSpeed : SPEED.PAUSED);
      markDirty();
      e.preventDefault();
    }
  });

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return { map, camera, redraw: markDirty };
}

// A pale diamond outline on the tile under the cursor, so the player sees where a tool lands.
function drawHoverCursor(ctx, camera, hover, map, tool) {
  if (!hover || !map.inBounds(hover.col, hover.row)) return;
  const tile = map.tileAt(hover.col, hover.row);
  const f = tileScreenFaces(hover.col, hover.row, tile.elevation, camera);
  const blocked = tool !== TOOL.QUERY && tool !== TOOL.BULLDOZE && isWaterTerrain(tile.terrain);
  ctx.strokeStyle = blocked ? '#c05a4a' : '#e8e4d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(f.top.x, f.top.y);
  ctx.lineTo(f.right.x, f.right.y);
  ctx.lineTo(f.bottom.x, f.bottom.y);
  ctx.lineTo(f.left.x, f.left.y);
  ctx.closePath();
  ctx.stroke();
}

// Find a buildable clearing and lay a small town: a road, a power spine from a gasworks feeding a
// lit residential-and-commercial block, an unpowered industrial row (which shows the no-power
// mark), and the four M5 services (chapel, shrine, constabulary, asylum) plus a second works, so
// proof captures show the power grid and civic structures working. Returns the centre tile.
function layDemoScene(map) {
  const R = 8;
  let anchor = null;
  outer:
  for (let row = 4; row < map.rows - R - 4 && !anchor; row++) {
    for (let col = 4; col < map.cols - R - 4; col++) {
      let allLand = true;
      for (let dr = 0; dr <= R && allLand; dr++) {
        for (let dc = 0; dc <= R; dc++) {
          if (isWaterTerrain(map.tileAt(col + dc, row + dr).terrain)) { allLand = false; break; }
        }
      }
      if (allLand) { anchor = { col, row }; break outer; }
    }
  }
  if (!anchor) return null;
  const { col: c0, row: r0 } = anchor;

  // The road (access for the block above and the works below).
  for (let d = 0; d <= R; d++) applyTool(map, TOOL.ROAD, c0 + d, r0 + 3);

  // Power: a gasworks at the west end feeding a spine along row r0+1.
  applyTool(map, TOOL.GASWORKS, c0, r0 + 1);
  for (let d = 1; d <= 7; d++) applyTool(map, TOOL.POWERLINE, c0 + d, r0 + 1);

  // Residential and commercial on the powered row, so they light up and climb.
  for (const c of [1, 2, 3]) applyTool(map, TOOL.ZONE_R, c0 + c, r0 + 2);
  for (const c of [5, 6, 7]) applyTool(map, TOOL.ZONE_C, c0 + c, r0 + 2);

  // Industrial down the far side of the road, off the grid: it caps low and shows the no-power mark.
  for (const c of [1, 2]) applyTool(map, TOOL.ZONE_I, c0 + c, r0 + 5);

  // The civic structures. A shrine over the homes (its pull) and a chapel opposite (the Old Faith).
  applyTool(map, TOOL.SHRINE, c0 + 2, r0);
  applyTool(map, TOOL.CHAPEL, c0 + 6, r0);
  applyTool(map, TOOL.CONSTABULARY, c0 + 4, r0 + 5);
  applyTool(map, TOOL.ASYLUM, c0 + 7, r0 + 5);
  applyTool(map, TOOL.WHALEOIL, c0, r0 + 5);

  return { col: c0 + 4, row: r0 + 2 };
}

// A denser coastal town for the M6 gods proofs: a grid of powered, built-up blocks near the water
// (so the flood tide reaches it), with the full service set, a university, and two shrines. Built
// directly (no long grow pre-run) so a summoned wrath has real streets to devour. Returns the
// centre tile. Pure map mutation; deterministic.
function layGodsProofTown(map) {
  const W = 12;
  const H = 8;
  const water = (c, r) => { const t = map.tileAt(c, r); return !t || isWaterTerrain(t.terrain); };
  const waterNear = (c, r, rad) => {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const t = map.tileAt(c + dc, r + dr); if (t && isWaterTerrain(t.terrain)) return true;
    }
    return false;
  };
  let anchor = null;
  let fallback = null;
  for (let row = 3; row < map.rows - H - 3 && !anchor; row++) {
    for (let col = 3; col < map.cols - W - 3; col++) {
      let land = true;
      for (let dr = 0; dr < H && land; dr++) for (let dc = 0; dc < W; dc++) {
        if (water(col + dc, row + dr)) { land = false; break; }
      }
      if (!land) continue;
      if (!fallback) fallback = { col, row };
      // The seaward edge of the block must touch water, so the town has a real waterfront for the
      // flood tide to take and Deep Ones to rise into.
      if (waterNear(col + W - 1, row + H - 1, 2)) { anchor = { col, row }; break; }
    }
  }
  anchor = anchor || fallback;
  if (!anchor) return null;
  const { col: c0, row: r0 } = anchor;

  // Row 0: three generators and a power-line spine (ample capacity, so the whole grid stays lit
  // and the proof is not littered with brownout marks).
  applyTool(map, TOOL.WHALEOIL, c0, r0);
  applyTool(map, TOOL.WHALEOIL, c0 + 1, r0);
  applyTool(map, TOOL.GASWORKS, c0 + 2, r0);
  for (let dc = 3; dc < W; dc++) applyTool(map, TOOL.POWERLINE, c0 + dc, r0);

  // Rows 1..H-2: a road every third row; every other lot built up, contiguous with the spine so
  // it draws power. A mixed residential / commercial / industrial skyline.
  for (let dr = 1; dr < H - 1; dr++) {
    const isRoadRow = dr % 3 === 0;
    for (let dc = 0; dc < W; dc++) {
      const col = c0 + dc; const row = r0 + dr;
      if (isRoadRow) { applyTool(map, TOOL.ROAD, col, row); continue; }
      const t = map.tileAt(col, row);
      const pick = (dc + dr) % 5;
      t.zone = pick < 3 ? 'residential' : pick === 3 ? 'commercial' : 'industrial';
      t.building = { level: 2 + ((dc + dr) % 2), cls: 'unwary' };
    }
  }

  // The bottom row: the civic set and a university (the Yog containment), two shrines flanking.
  const rs = r0 + H - 1;
  applyTool(map, TOOL.UNIVERSITY, c0 + 1, rs);
  applyTool(map, TOOL.SHRINE, c0 + 3, rs);
  applyTool(map, TOOL.CHAPEL, c0 + 5, rs);
  applyTool(map, TOOL.CONSTABULARY, c0 + 7, rs);
  applyTool(map, TOOL.ASYLUM, c0 + 9, rs);
  applyTool(map, TOOL.SHRINE, c0 + 11, rs);

  return { col: c0 + Math.floor(W / 2), row: r0 + Math.floor(H / 2) };
}

// Lay the whole underground over a proof town (M-b): a trunk main under the streets, a pump house
// sunk in the WORST ground the coast has, a well house inland in sweet ground for the contrast, a
// reservoir, a filter house on its own branch, and a valve shut on a third. Some years of ordinary
// simulation then does the rest, so a capture of this shows the system working rather than a picture
// of it. Pure map mutation, deterministic, and exported so a test can hold what it produces.
//
// The two things that took a wasted capture round to learn, both now handled here:
//   - the pump must be sunk in ground the aquifer actually reads as BRACKISH or FISSURED. An earlier
//     cut looked for "water within two tiles" with a box scan, but the aquifer measures distance the
//     way water travels (4-neighbour steps, so Manhattan), and a tile two tiles away diagonally is
//     four steps away. It picked sweet ground every time and the proof showed nothing at all.
//   - the pump must be POWERED, or the network reads Low pressure for want of a grid and the capture
//     is about power rather than about the water. It gets its own engine house beside it.
export function layUndergroundProof(map, centre, aquiferOpts) {
  const { col: cc, row: cr } = centre;
  const lay = (c, r) => applyTool(map, TOOL.PIPE, c, r);
  const free = (c, r) => {
    const t = map.tileAt(c, r);
    return !!t && !isWaterTerrain(t.terrain) && !t.structure && !t.object && !t.building && !t.zone;
  };

  // The nearest clear ground the sea has been in. Asked of the aquifer itself, which is the only
  // thing that knows.
  let sunk = null;
  for (let d = 1; d <= 14 && !sunk; d++) {
    for (let dr = -d; dr <= d && !sunk; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue; // walk the ring, nearest first
        const c = cc + dc; const r = cr + dr;
        if (!free(c, r)) continue;
        const ground = substrateAt(map, c, r, aquiferOpts);
        if (ground !== SUBSTRATE.BRACKISH && ground !== SUBSTRATE.FISSURE) continue;
        sunk = { col: c, row: r };
        break;
      }
    }
  }

  // A trunk main across the town, with a spur each way.
  for (let dc = -6; dc <= 6; dc++) lay(cc + dc, cr);
  for (let dr = -3; dr <= 3; dr++) lay(cc, cr + dr);
  for (let dr = 0; dr <= 3; dr++) lay(cc + 5, cr + dr);

  // The pump, in the worst ground going, with a branch back to the trunk and its own engine house.
  const pump = sunk || { col: cc, row: cr + 4 };
  const stepR = Math.sign(pump.row - cr) || 1;
  for (let r = cr; r !== pump.row + stepR; r += stepR) lay(cc, r);
  const stepC = Math.sign(pump.col - cc) || 1;
  for (let c = cc; c !== pump.col + stepC; c += stepC) lay(c, pump.row);
  applyTool(map, TOOL.PUMPHOUSE, pump.col, pump.row);
  // Power conducts through adjacent structures, so an engine house beside the pump is enough to turn
  // it. Tried on each side, because the shore may be to any hand.
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (free(pump.col + dc, pump.row + dr)) {
      applyTool(map, TOOL.GASWORKS, pump.col + dc, pump.row + dr);
      break;
    }
  }

  // The contrast: a well house inland in sweet ground, and a reservoir beside it.
  applyTool(map, TOOL.WELLHOUSE, cc - 7, cr);
  applyTool(map, TOOL.RESERVOIR, cc - 6, cr - 1);
  // A filter house on its own short branch, so the proof shows both its mark and its surface art.
  lay(cc + 6, cr + 1);
  applyTool(map, TOOL.FILTERHOUSE, cc + 6, cr + 2);
  // A valve shut on the eastern spur, so the proof carries an isolated branch too.
  applyTool(map, TOOL.VALVE, cc + 5, cr + 2);
  return { pump, ground: sunk ? substrateAt(map, pump.col, pump.row, aquiferOpts) : null };
}

// A slow phosphor scanline shimmer over the title plate. Stilled by reduced motion.
function drawTitleShimmer(ctx, now, reducedMotion) {
  if (reducedMotion) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const alpha = 0.015 + 0.012 * Math.sin(now / 900);
  ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(4)})`;
  const gap = 4;
  const offset = (now / 80) % gap;
  for (let y = offset; y < h; y += gap) {
    ctx.fillRect(0, Math.floor(y), w, 1);
  }
}

// Build a dense decayed seaside town for the title backdrop. Reuses the same tool and zone logic the
// player sees, so the backdrop is a real Innsmouth town, not a mock-up.
function layTitleTown(map) {
  return layGodsProofTown(map);
}
