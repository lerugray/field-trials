// STRAY SQUADRON — M5 run flow. A whole run now plays over the branching route
// map: Commander Cuckoo's briefing, then fly a level, debrief at the map with a
// medal + a gated branch choice, on to the final sector — or an early end if the
// ship goes down, then a medal/score summary. The rail-flight + combat loop (M2-M4)
// is unchanged underneath; M5 wraps it in the run-flow state machine (runflow.js)
// and drives which screen shows. Still the pass/fail WebGL2 substrate (hard rule 3).

import * as mat4 from './math/mat4.js';
import { add, scale, negate } from './math/vec3.js';
import { createRenderer } from './gfx/renderer.js';
import { createCraftMesh } from './gfx/craft.js';
import { createRailField } from './gfx/railfield.js';
import { railFrame } from './flight/rail.js';
import { createFlightState, updateFlight } from './flight/flight.js';
import { CAM } from './flight/camera.js';
import { createObstacleMesh } from './gfx/obstaclemesh.js';
import { buildLevel } from './world/level.js';
import { CHUNK } from './world/grammar.js';
import { createPickupMesh } from './gfx/pickupmesh.js';
import { activePickupsInto, collectPickups } from './combat/pickups.js';
import { createProjectiles, stepProjectiles, spawnProjectile, PROJECTILE } from './combat/projectiles.js';
import { createWeapon, updateWeapon, lockEngaged, WEAPON } from './combat/weapons.js';
import { acquireLock } from './combat/lockon.js';
import { createRollState, triggerRoll, updateRoll, rollAngle, isDeflecting } from './combat/barrelroll.js';
import { createBoltMesh, BOLT_PLAYER, BOLT_ENEMY } from './gfx/boltmesh.js';
import { updateEnemies, activeEnemiesInto, updateEnemyFire, ENEMY_KINDS } from './combat/enemies.js';
import { createEnemyMesh, ENEMY_HAZE, enemyVisualVariant } from './gfx/enemymesh.js';
import { LIGHT_DIR, AMBIENT } from './gfx/shading.js';
import { createTerrainMesh, createReliefMesh, createStructureMesh } from './gfx/terrain.js';
import { projectedBounds, hotPixelPct, evaluateFrame } from './gfx/instrument.js';
import {
  BOSS, createBoss, updateBoss, resolveBossHits, telegraphProgress, takePhaseChange, bossPattern,
} from './combat/boss.js';
import { createBossMesh } from './gfx/bossmesh.js';
import {
  createPlayerState, updatePlayer, PLAYER,
  resolveEnemyBolts, resolveObstacle, resolveEnemyContact,
} from './combat/player.js';
import { createExplosions, stepExplosions, explosionFlash, strongestFlash, spawnExplosion, SHARD_DIRS, EXPLOSION }
  from './combat/explosions.js';
import { createRunState, resolvePlayerHits } from './combat/combat.js';
import { createShardMesh } from './gfx/shardmesh.js';
import { createKeyboard } from './input/keyboard.js';
import { createGamepad } from './input/gamepad.js';
import { createOverlay } from './ui/overlay.js';
import { createHud } from './ui/hud.js';
import { createMenu } from './ui/menu.js';
import { createSettings } from './core/settings.js';
import { createAudioBus } from './audio/bus.js';
import { createBindings, inputLabel } from './input/bindings.js';
import { createMusicPlayer } from './audio/music.js';
import { maybeInvertY } from './input/deadzone.js';
import { mouseSteer } from './input/mouse.js';
import { createHoldAxis } from './input/holdaxis.js';
import { HURT_FLASH_MAX } from './ui/legibility.js';
import { createRun } from './run/runflow.js';
import { levelPotential, medalPace } from './run/medals.js';
import { cuckooBriefing, cuckooDebrief, cuckooSignoff, cuckooBossHail } from './run/briefing.js';
import { createScreens } from './ui/screens.js';
import { createTitle } from './ui/title.js';
import { hasSavedProgress } from './ui/titlemenu.js';
import { createTitleSfx } from './audio/titlesfx.js';
import { createRouteMap } from './ui/routemap.js';
import { createLedger } from './economy/ledger.js';
import { upgradeEffects, buyUpgrade, contractedNames } from './economy/upgrades.js';
import { createHub } from './ui/hub.js';
import { planDistress, rescuePod } from './run/distress.js';
import { drawChoices, applyLoadout, instantOf } from './run/loadout.js';
import { rosterSupport, survivors } from './run/wingmates.js';
import { wingLine } from './run/wingvoice.js';

function fail(msg) {
  document.body.style.cssText =
    'margin:0;background:#0b0f16;color:#e6b0a0;font:15px/1.6 ui-monospace,monospace';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:640px;margin:12vh auto;padding:24px';
  box.innerHTML =
    '<h1 style="color:#f0a24a">STRAY SQUADRON cannot start</h1>' +
    '<p>' + msg + '</p>' +
    '<p style="opacity:.6">The substrate needs a WebGL2 context. This build does ' +
    'not fall back to a 2D renderer by design (the flat-shaded low-poly look is a ' +
    'GPU depth-buffer job).</p>';
  document.body.appendChild(box);
}

// Camera rig constants live in flight/camera.js (the visibility floor reads them too).
const LEVEL_END = 1400;      // a level is flown when the ship reaches this station
const AMBIENT_DRIFT = 2.2;   // M10 living world: gentle backdrop parallax on the menus
const DEATH_LINGER = 1.6;    // seconds the ship-down card holds before the results
const BOSS_LINGER = 2.4;     // seconds the boss-down burst holds before victory
const BOSS_ARENA_S = LEVEL_END - 40;             // where the boss holds (the climax)
const BOSS_APPROACH_END = BOSS_ARENA_S - BOSS.standoffS - 60; // approach content ends clear of the arena

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function boot() {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed') || 'stray-m1';
  const still = params.has('still');
  const forceInvertY = params.has('inverty');
  const forceMenu = params.has('menu'); // proof: open the assist menu
  const clean = params.has('clean');    // legacy proof flag: overlay is now hidden by default
  const debug = params.has('debug');    // M13 B1: opt IN to the dev overlay (else hidden)
  const instrument = params.has('instrument'); // art migration: scene-legibility gates
  const stillRoll = params.has('roll');  // proof: barrel-roll deflect showcase
  const bossProof = params.has('boss');  // proof: freeze on the run-climax boss fight
  const proofScreen = params.get('screen'); // proof: 'briefing'|'map'|'loadout'|'results'|'hub'
  // proof: park ONE enemy dead ahead at an exact engagement range (rail units ahead of
  // the ship) on an emptied lane, so its on-screen contrast against the sector haze can
  // be sampled at a known pixel instead of hunted for in live play. `&kind=gunner`
  // picks the heavier turret silhouette.
  const targetRange = params.has('target') ? Number(params.get('target')) : null;
  const targetProof = Number.isFinite(targetRange);
  const frozen = still || bossProof || targetProof; // a proof freeze: the sim does not advance

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);

  // antialias:false since the art migration (2026-08-10): the world is rendered into a
  // native-resolution offscreen target and presented with a whole-number NEAREST
  // upscale, so multisampling the default framebuffer would only soften the very facet
  // edges the register is built on. See gfx/renderer.js.
  const gl = canvas.getContext('webgl2', { antialias: false, depth: true });
  if (!gl) {
    fail('getContext("webgl2") returned null — no WebGL2 support here.');
    return;
  }

  // --- the run flow: a branching route walked from Cuckoo's briefing to the end --
  // M6: a run is now one flight out of the hangar. `run`/`route` are rebuilt per launch
  // (installRun) so each trip out gets a fresh seeded route; the hub is home base.
  let run, route;
  const levelNames = {};
  let runCounter = 0;      // per-session run index -> a fresh seed each launch
  let runRecorded = false; // ledger commit guard for the current run

  function installRun(runSeed, contracts = []) {
    run = createRun(runSeed, { contracts });
    route = run.route;
    for (const k of Object.keys(levelNames)) delete levelNames[k];
    for (const id of Object.keys(route.nodes)) levelNames[id] = route.nodes[id].sectorName;
  }
  installRun(seed);

  // --- one-time GPU + UI setup (level-independent) ------------------------------
  const renderer = createRenderer(gl);
  const craft = createCraftMesh();
  const boltPlayer = createBoltMesh(BOLT_PLAYER.core, BOLT_PLAYER.tail);
  const boltEnemy = createBoltMesh(BOLT_ENEMY.core, BOLT_ENEMY.tail);
  renderer.upload('craft', craft);
  renderer.upload('bolt_player', boltPlayer);
  renderer.upload('bolt_enemy', boltEnemy);
  // S13: distinct enemy silhouettes — the drone is a canopy-less interceptor, the
  // gunner a no-wing turret with a barrel (so the shooter reads as a shooter).
  // Art migration 2026-08-10: all four now upload, and enemyVisualVariant picks which
  // one an enemy wears from its id. Purely visual — the sim still has two kinds.
  renderer.upload('enemy_drone', createEnemyMesh('drone'));
  renderer.upload('enemy_gunner', createEnemyMesh('turret'));
  renderer.upload('enemy_elite', createEnemyMesh('elite'));
  renderer.upload('enemy_heavy', createEnemyMesh('heavy'));
  const ENEMY_MESH_KEY = {
    drone: 'enemy_drone', turret: 'enemy_gunner', elite: 'enemy_elite', heavy: 'enemy_heavy',
  };
  renderer.upload('boss', createBossMesh());
  renderer.upload('shard', createShardMesh());

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const glRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'WebGL2';

  const keyboard = createKeyboard(window);
  const gamepad = createGamepad();
  const overlay = createOverlay();      // hidden by default (M13 B1)
  if (debug) overlay.setVisible(true);  // ?debug opts the dev overlay back in
  const hud = createHud();
  const settings = createSettings();
  const bindings = createBindings();

  // S11: first-sortie teaching — one-time flags (persisted directly; these are onboarding
  // state, not accessibility settings). Each of the three teaching aids shows once, ever.
  const teach = {
    seen: (k) => { try { return localStorage.getItem('ss-taught-' + k) === '1'; } catch (e) { return false; } },
    mark: (k) => { try { localStorage.setItem('ss-taught-' + k, '1'); } catch (e) { /* storage blocked */ } },
  };
  // In-memory mirror of the two in-flight teaching flags so the render loop never reads
  // storage per frame. Both aids show through the FIRST flown level, then retire.
  let taughtEsc = teach.seen('esc');
  let taughtPace = teach.seen('pace');

  // The one-time "how to fly" card, built from the player's REAL bound keys so it never
  // lies about the controls. Shown before the first New Run; dismiss with any key/click.
  function showHowToFly(done) {
    const binds = (action, classes = ['keyboard', 'mouse', 'controller']) => {
      const tags = { keyboard: 'Key', mouse: 'Mouse', controller: 'Pad' };
      const shown = [];
      for (const inputClass of classes) {
        const value = bindings.primary(action, inputClass);
        if (value !== null) shown.push(tags[inputClass] + ' ' + inputLabel(inputClass, value));
      }
      return shown.join(' · ') || 'Unbound';
    };
    const card = document.createElement('div');
    card.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:36', 'display:flex',
      'align-items:center', 'justify-content:center', 'background:rgba(6,10,16,0.92)',
      'font:15px/1.6 ui-monospace,Menlo,Consolas,monospace', 'color:#cfe6e2',
    ].join(';');
    const row = (k, v) =>
      `<div style="display:flex;justify-content:space-between;gap:28px;margin:7px 0">` +
      `<span style="color:#9fb4bb">${k}</span><span style="color:#ffd24a;font-weight:700">${v}</span></div>`;
    card.innerHTML =
      '<div style="max-width:460px;width:calc(100% - 48px);background:rgba(12,18,26,0.97);' +
      'border:1px solid #24405a;border-radius:12px;padding:26px 30px;box-shadow:0 10px 48px rgba(0,0,0,0.6)">' +
      '<div style="color:#ffd24a;letter-spacing:2px;font-weight:700;text-align:center;margin-bottom:14px">HOW TO FLY</div>' +
      row('Steer', binds('steerUp', ['keyboard']) + ' plus stick or mouse aim') +
      row('Fire', binds('fire') + '  (tap or hold)') +
      row('Barrel roll', binds('rollLeft') + ' / ' + binds('rollRight')) +
      row('Boost / Brake', binds('boost') + ' / ' + binds('brake')) +
      row('Options and assists', 'Esc') +
      '<div style="text-align:center;margin-top:18px;padding:10px;border-radius:8px;' +
      'background:rgba(255,210,74,0.14);border:1px solid #ffd24a;color:#ffd24a;font-weight:700;' +
      'letter-spacing:2px;cursor:pointer">GOT IT  ▸</div>' +
      '<div style="text-align:center;margin-top:8px;color:#6f8a92;font-size:12px">Any key or click to begin</div>' +
      '</div>';
    document.body.appendChild(card);
    const dismiss = () => {
      window.removeEventListener('keydown', onKey, true);
      card.remove();
      if (done) done();
    };
    const onKey = (e) => { e.preventDefault(); e.stopPropagation(); dismiss(); };
    // Capture-phase key handler so it swallows the very next press (does not leak into flight).
    window.addEventListener('keydown', onKey, true);
    card.addEventListener('mousedown', (e) => { e.preventDefault(); dismiss(); });
  }

  const audio = createAudioBus();
  audio.setMuted(settings.get('muted'));
  // The music bed (M9): the three Abel Aeolian tracks are embedded by the single-file
  // build. Gesture-gated (browsers block autoplay); no-ops if a source is absent.
  const music = createMusicPlayer({
    makeAudio: () => (typeof Audio !== 'undefined' ? new Audio() : null),
    getVolume: () => settings.get('musicVolume'),
    isMuted: () => settings.get('muted'),
  });
  const menu = createMenu(settings, bindings, (id) => {
    if (id === 'muted') { audio.setMuted(settings.get('muted')); music.refresh(); }
    if (id === 'musicVolume') music.refresh();
    audio.blip(id === 'fov' ? 600 : 520);
  });
  // Music can only begin after a user gesture; start it on the first key/pointer.
  let musicStarted = false;
  const kickMusic = () => { if (!musicStarted) { musicStarted = true; music.start(); } };
  window.addEventListener('pointerdown', kickMusic);
  window.addEventListener('keydown', kickMusic);

  const screens = createScreens();
  const title = createTitle();
  // M12 title-screen SFX socket — SILENT this milestone (no sample player wired). The
  // operator records MS-20 move/confirm samples next session; until then these no-op.
  const titleSfx = createTitleSfx();
  const routemap = createRouteMap();
  // M6 economy: the persistent ledger (one currency + flight-log archive) and the
  // hangar hub. `loadout` is the gameplay effect of everything currently owned,
  // recomputed at each launch out of the hangar.
  const ledger = createLedger();
  const hub = createHub(ledger, settings);
  let loadout = upgradeEffects(ledger);   // hangar base effects, captured at launch
  let boons = applyLoadout([]);           // mid-run loadout picks aggregate (per run)
  if (forceMenu) {
    menu.open();
    if (params.get('menu') === 'controls') menu.gotoControls(); // proof: remapping page
  }

  // --- per-level session state (rebuilt by startLevel) --------------------------
  let theme, course, enemies, pickups, fog, field;
  let levelPot = 0;                    // this level's potential score (for medals)
  let flight = createFlightState();
  // Keyboard steer holds where you left it instead of sliding the ship home when the
  // keys come up (see input/holdaxis.js). Stick + pointer are unwrapped: an analog
  // stick genuinely does return to neutral, and the pointer is already absolute.
  const kbHoldX = createHoldAxis();
  const kbHoldY = createHoldAxis();
  let projectiles = createProjectiles();
  let weapon = createWeapon();
  let explosions = createExplosions();
  let rollState = createRollState();
  let levelStats = createRunState();   // per-LEVEL score/kills (banked at level end)
  const player = createPlayerState();  // persists across a run (hull carries over)
  const banked = { score: 0, kills: 0 }; // completed-level totals, for the HUD read
  let deathBurst = false;
  let levelFinished = false;
  let deathAt = -1;                    // simT (B4) when the ship went down (linger timer)
  let pickupCue = null;                // { text, repair, at } — brief grab confirmation
  let wingSup = rosterSupport([]);     // this level's live wingmate support (alive squad)
  let distressPlan = null;             // this level's distress event (or null)
  let distressPod = null;              // the injected rescue pod (same obj collectPickups sees)
  let distressWing = null;             // the wingmate in distress (for its callouts)
  let wingCue = null;                  // { speaker, line, kind, at } — transient bark caption
  let launchFired = false, spotFired = false, distressFired = false, lostFired = false;
  // M8: the run climax. `boss` is non-null only on the final node's level.
  let boss = null;
  let bossDownAt = -1;                 // simT (B4) when the boss fell (victory linger)
  let bossCue = null;                  // { text, at } — a transient boss-beat caption

  const totalTrisRef = { v: 0 };

  // Build + install one node's level (geometry, theme, and reset per-level state).
  // The final node is the run CLIMAX: its approach content stops clear of the arena
  // and a boss holds at BOSS_ARENA_S — the level completes only when the boss falls.
  function startLevel(node) {
    const isBoss = route && node.id === route.finalId;
    const approachEnd = isBoss ? BOSS_APPROACH_END : LEVEL_END;
    // S6: pass the node's route threat (1..3) so harder branches actually fly harder
    // (more enemies/gunners, denser field) — the map has promised this since M5.
    const built = buildLevel(node.levelSeed, CHUNK.startS, approachEnd, node.sectorId, node.threat);
    theme = built.theme;
    course = built.obstacles;
    enemies = built.enemies;
    pickups = built.pickups;
    levelPot = levelPotential(built);

    // M8: spin up the boss on the final node (deterministic from the run seed + node);
    // its score folds into the level potential so a clean climax grades toward gold.
    boss = null; bossDownAt = -1; bossCue = null;
    if (isBoss) {
      boss = createBoss(node.levelSeed, { arenaS: BOSS_ARENA_S, threat: node.threat });
      levelPot += boss.score;
    }

    field = createRailField(node.levelSeed, 1400, theme.debris, theme.density);
    renderer.upload('field', field);
    renderer.upload('obstacles', createObstacleMesh(course, theme.rock));

    // The landscape (art migration 2026-08-10). Baked once per level in world space
    // along the rail, drawn in three calls. Visual only — no hitboxes, nothing here is
    // read by the simulation, and the canyon floor sits GROUND_DROP below the rail so
    // the flyable tunnel is untouched by construction.
    const terrainEnd = approachEnd + 260;   // run the ground out past the level's end
    renderer.upload('terrain', createTerrainMesh(0, terrainEnd, theme.ground));
    renderer.upload('relief', createReliefMesh(node.levelSeed, 0, terrainEnd, theme.ground));
    renderer.upload('structures', createStructureMesh(node.levelSeed, 0, terrainEnd));
    renderer.upload('pickup_repair', createPickupMesh('repair', theme.pickup));
    renderer.upload('pickup_score', createPickupMesh('score', theme.pickup));
    renderer.upload('pickup_rescue', createPickupMesh('rescue', theme.pickup));
    totalTrisRef.v = craft.triCount + field.triCount;

    fog = { color: theme.fog.color.slice(), near: theme.fog.near, far: theme.fog.far };
    // the boss looms large in the arena — pull the draw distance out so it reads clear
    // through the sector haze (keeps the sector's colour + near, only extends the far).
    if (isBoss) fog.far = Math.max(fog.far, 130);

    flight = createFlightState();
    kbHoldX.reset(); kbHoldY.reset();  // a new level/retry always starts centered
    projectiles = createProjectiles();
    weapon = createWeapon();
    explosions = createExplosions();
    rollState = createRollState();
    levelStats = createRunState();
    player.alive = true; player.invuln = 0; player.shake = 0; player.lastHitBy = null;
    deathBurst = false; levelFinished = false; deathAt = -1; pickupCue = null;

    // --- M7: wingmate support + the distress/rescue beat -----------------------
    // The living squad's passive support (recomputed per level; the alive set only
    // changes at level end). Then plan this level's distress and, if any, inject the
    // rescue pod into the pickups so collectPickups grabs it with the same disk test.
    wingSup = rosterSupport(survivors(run.roster()));
    distressPlan = null; distressPod = null; distressWing = null;
    wingCue = null; launchFired = false; spotFired = false; distressFired = false; lostFired = false;
    if (!still && !isBoss) {   // the climax stands alone — no distress beat on the boss level
      distressPlan = planDistress(run.state.seed, node, run.living(), LEVEL_END, built.chunks);
      if (distressPlan) {
        distressWing = run.roster().find((w) => w.id === distressPlan.wingId) || null;
        distressPod = rescuePod(distressPlan, 900000);
        pickups.push(distressPod);
        // S10: the rescue pod carries score (rescueScore) but is injected AFTER the
        // potential was computed from the built level, so fold it in now — else medal
        // pacing + thresholds read too generously on every distress level.
        levelPot += distressPod.score || 0;
      }
    }
  }

  // Fire a transient wingmate callout (caption near the bottom). `w` is the speaker.
  function fireWing(kind, w, at) {
    if (!w) return;
    const l = wingLine(w, kind);
    wingCue = { speaker: l.speaker, line: l.line, kind, at };
  }

  // Apply a taken boon's effect: instants (heal to full) resolve now; persistent mods
  // are folded into `boons` and the ship's max hull (new plating is filled so it is
  // not dead weight). Called at the branch-point pick.
  function applyBoonEffect(id) {
    if (!id) return;
    const oldMax = PLAYER.maxHull + loadout.bonusHull + boons.bonusHull;
    boons = applyLoadout(run.taken());
    const newMax = PLAYER.maxHull + loadout.bonusHull + boons.bonusHull;
    player.maxHull = newMax;
    if (newMax > oldMax) player.hull = Math.min(newMax, player.hull + (newMax - oldMax));
    if (instantOf(id) === 'healFull') player.hull = player.maxHull;
  }

  // Present whatever screen the current run phase calls for.
  function presentPhase() {
    if (run.phase === 'briefing') {
      routemap.hide();
      screens.showBriefing(cuckooBriefing(route), () => {
        screens.hide();
        run.launch();
        startLevel(run.currentNode());
        presentPhase();
      });
    } else if (run.phase === 'level') {
      screens.hide(); routemap.hide();
    } else if (run.phase === 'debrief') {
      screens.hide();
      // The mid-run loadout choice first (pick one boon for the run), then the heading
      // choice on the route map. Both happen at the branch point.
      const tiers = {
        hull: ledger.upgradeTier('hull'),
        blaster: ledger.upgradeTier('blaster'),
        boost: ledger.upgradeTier('boost'),
      };
      const choices = drawChoices(run.state.seed, run.currentNode(), tiers, run.taken());
      screens.showLoadout(choices, (id) => {
        if (id) { run.takeBoon(id); applyBoonEffect(id); }
        showBranchMap();
      });
    } else if (run.phase === 'results') {
      routemap.hide();
      const summary = run.summary();
      // Commit the run's Salvage to the ledger exactly once (idempotent per run
      // token: an abnormal re-show never double-counts). Contracts pay a dividend.
      if (!runRecorded) {
        runRecorded = true;
        // Total salvage multiplier: hangar contracts (loadout.salvageMul is already
        // 1 + their dividend) + the run's Scavenger boon + the surviving wingmates'
        // cut (a wingmate lost mid-run brought nothing home, so only survivors count).
        const wingSalvage = rosterSupport(survivors(run.roster())).salvageMul;
        const bonusMul = loadout.salvageMul + boons.salvageAdd + wingSalvage;
        ledger.recordRun(summary, summary.seed + ':' + summary.path.join('>'), bonusMul);
      }
      screens.showResults(summary, cuckooSignoff(summary), levelNames,
        () => { screens.hide(); beginRun(); },        // S8 primary: fly a fresh sortie now
        () => { screens.hide(); openHub(summary); }); // secondary: to the hangar
    }
  }

  // The heading choice on the route map (the second half of a debrief, after the
  // loadout pick). Extracted so the loadout picker can chain into it.
  function showBranchMap() {
    const flown = {};
    for (const lv of run.state.levels) flown[lv.id] = lv.medal;
    routemap.show({
      route, currentId: run.state.currentId, flown,
      choices: run.choices(),
      title: 'CHOOSE YOUR HEADING',
      subtitle: cuckooDebrief(run.lastMedal).line,
      onChoose: (id) => {
        routemap.hide();
        run.chooseBranch(id);
        startLevel(run.currentNode());
        presentPhase();
      },
    });
  }

  // M12: the title screen — the game's first surface, laid over the live 3D scene.
  // New Run flies a fresh sortie (straight to the briefing); Continue returns to the
  // hangar (home base), enabled only when there is saved progress to return to; Options
  // opens the existing options menu over the title. The SFX hooks are the silent M12
  // sockets (titleSfx). Music follows the 'title' phase (also a silent socket for now).
  function openTitle() {
    screens.hide(); routemap.hide(); hub.hide();
    const lt = ledger.lifetime();
    const progress = hasSavedProgress({
      runs: lt.runs, balance: lt.balance,
      upgrades: {
        hull: ledger.upgradeTier('hull'),
        blaster: ledger.upgradeTier('blaster'),
        boost: ledger.upgradeTier('boost'),
      },
      contracts: ledger.contracts(),
    });
    title.show({
      hasProgress: progress,
      onNew: () => {
        title.hide();
        // S11: the how-to-fly card, once ever, before the first sortie.
        if (!teach.seen('help')) { teach.mark('help'); showHowToFly(beginRun); }
        else beginRun();
      },
      onContinue: () => { title.hide(); openHub(null); },
      onOptions: () => { menu.open({ heading: 'OPTIONS', resumeLabel: 'Back' }); },
      onMove: () => titleSfx.move(),
      onConfirm: () => titleSfx.confirm(),
    });
  }

  // Open the hangar hub. `lastRun` (or null) keys Cuckoo's greeting; launching from
  // the hub begins a fresh run out of the hangar.
  function openHub(lastRun) {
    screens.hide(); routemap.hide();
    hub.show(
      { lastRun: lastRun || null, lifetimeRuns: ledger.lifetime().runs },
      () => { hub.hide(); beginRun(); },
    );
  }

  // Begin a fresh run out of the hangar: a new seeded route, the current loadout
  // applied to the ship (hull carries from full), and Cuckoo's briefing.
  function beginRun() {
    installRun(seed + '-r' + (runCounter++), contractedNames(ledger));
    loadout = upgradeEffects(ledger);
    boons = applyLoadout([]);           // no mid-run picks yet this run
    runRecorded = false;
    banked.score = 0; banked.kills = 0;
    player.maxHull = PLAYER.maxHull + loadout.bonusHull;
    player.hull = player.maxHull;
    startLevel(route.nodes[route.startId]); // live backdrop behind the briefing
    presentPhase();
  }

  // End the flown level: bank its score/kills and advance the run flow. The distress
  // outcome (rescued if the pod was taken, else the wingmate is lost for the run) is
  // resolved here and fed into the run flow.
  function endLevel(died) {
    if (levelFinished) return;
    levelFinished = true;
    // S11: the first flown level retires the two in-flight teaching aids (Esc hint +
    // pace explainer) — they have done their teaching by now.
    if (!taughtEsc) { taughtEsc = true; teach.mark('esc'); }
    if (!taughtPace) { taughtPace = true; teach.mark('pace'); }
    banked.score += levelStats.score;
    banked.kills += levelStats.kills;
    // completeLevel is the single authority on the roster consequence (it applies and
    // records the loss); we just hand it the outcome the pod produced.
    const distress = distressPlan
      ? { wingId: distressPlan.wingId, rescued: !!(distressPod && distressPod.taken) }
      : null;
    run.completeLevel({ score: levelStats.score, kills: levelStats.kills, potential: levelPot, died, distress });
    presentPhase();
  }

  // A live 3D backdrop behind the briefing/results: build the start sector now.
  startLevel(route.nodes[route.startId]);

  // The assist menu owns pause; Esc opens it during a level. Gamepad Start too.
  window.addEventListener('keydown', (e) => {
    // screen-specific keys first
    // M12 title: the game's first surface. When the options menu is open over it, keys
    // drive the menu (same nav as in-level); otherwise they drive the title's own menu.
    if (title.isOpen()) {
      if (menu.isOpen()) {
        if (menu.isCapturing()) {
          if (e.code === 'Escape') menu.back();
          else if (menu.captureClass() === 'keyboard') menu.captureKey(e.code);
          audio.blip(e.code === 'Escape' ? 300 : 560);
          e.preventDefault();
          return;
        }
        if (e.code === 'Escape') { const r = menu.back(); audio.blip(r === 'closed' ? 300 : 500); e.preventDefault(); return; }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { menu.move(-1); e.preventDefault(); }
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') { menu.move(1); e.preventDefault(); }
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { menu.adjust(-1); e.preventDefault(); }
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') { menu.adjust(1); e.preventDefault(); }
        else if (e.code === 'Enter' || e.code === 'Space') { menu.activate(); e.preventDefault(); }
        return;
      }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { title.move(-1); e.preventDefault(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { title.move(1); e.preventDefault(); }
      else if (e.code === 'Enter' || e.code === 'Space') { title.confirm(); e.preventDefault(); }
      return;
    }
    if (hub.isOpen()) {
      if (e.code === 'Enter') { hub.fireLaunch(); e.preventDefault(); }
      return;
    }
    if (screens.briefingOpen()) {
      if (e.code === 'Enter' || e.code === 'Space') { screens.fireBriefing(); e.preventDefault(); }
      return;
    }
    if (screens.resultsOpen()) {
      if (e.code === 'Enter' || e.code === 'KeyR') { screens.fireRetry(); e.preventDefault(); }
      else if (e.code === 'KeyH') { screens.fireHangar(); e.preventDefault(); }  // S8 secondary
      return;
    }
    // S8: the ship-down card is up (dead, mid-level, results not shown yet). Give it an
    // immediate action instead of only waiting out the linger: R/Enter ends the level
    // now, which banks the run and brings up the results (one more R flies again).
    if (!frozen && !menu.isOpen() && run.phase === 'level' && !player.alive && deathBurst && !levelFinished) {
      if (e.code === 'Enter' || e.code === 'KeyR') { endLevel(true); e.preventDefault(); return; }
    }
    if (screens.loadoutOpen()) {
      if (screens.handleLoadoutKey(e.code)) e.preventDefault();
      return;
    }
    if (routemap.isOpen()) {
      if (routemap.handleKey(e.code)) e.preventDefault();
      return;
    }
    if (run.phase !== 'level') return;
    // A pending key-rebind swallows the very next key press (Esc cancels it).
    if (menu.isOpen() && menu.isCapturing()) {
      if (e.code === 'Escape') menu.back();
      else if (menu.captureClass() === 'keyboard') menu.captureKey(e.code);
      audio.blip(e.code === 'Escape' ? 300 : 560);
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape') {
      if (menu.isOpen()) {
        const r = menu.back();          // cancel capture / step back a page / close
        audio.blip(r === 'closed' ? 300 : 500);
      } else {
        menu.open();
        audio.blip(620);
      }
      e.preventDefault();
      return;
    }
    if (!menu.isOpen()) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { menu.move(-1); e.preventDefault(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { menu.move(1); e.preventDefault(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { menu.adjust(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { menu.adjust(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'Space') { menu.activate(); e.preventDefault(); }
  });

  // Project a world point to screen pixels; visible only if in front of camera.
  function projectToScreen(vp, p) {
    const x = p[0], y = p[1], z = p[2];
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 1e-4) return { visible: false, x: 0, y: 0 };
    return {
      visible: true,
      x: (cx / cw * 0.5 + 0.5) * vw,
      y: (1 - (cy / cw * 0.5 + 0.5)) * vh,
    };
  }

  // Where on screen an explosion is, for the kill flash to bloom from. Null when there
  // is nothing to bloom from, or when it sits behind/outside the frame — and null means
  // NO bloom (a wash with no visible source reads as the screen flashing for no reason).
  function flashPoint(vp, e) {
    if (!e) return null;
    const f = railFrame(e.s);
    const p = projectToScreen(vp, [
      f.pos[0] + f.right[0] * e.lat + f.up[0] * e.vert,
      f.pos[1] + f.right[1] * e.lat + f.up[1] * e.vert,
      f.pos[2] + f.right[2] * e.lat + f.up[2] * e.vert,
    ]);
    if (!p.visible) return null;
    if (p.x < 0 || p.x > vw || p.y < 0 || p.y > vh) return null;
    return { x: p.x, y: p.y };
  }

  const mouseButtons = new Set();
  // Capture-phase routing sees a pending mouse bind before the clicked menu row does.
  // The click that OPENS capture has already passed this listener, so only the next
  // physical button is bound.
  window.addEventListener('mousedown', (e) => {
    if (menu.isOpen() && menu.captureClass() === 'mouse') {
      menu.captureButton('mouse', e.button);
      audio.blip(560);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    mouseButtons.add(e.button);
  }, true);
  window.addEventListener('mouseup', (e) => { mouseButtons.delete(e.button); });
  window.addEventListener('contextmenu', (e) => {
    if (bindings.actionFor(2, 'mouse')) e.preventDefault();
  });
  window.addEventListener('blur', () => { mouseButtons.clear(); });

  // M11 pointer aim: track the mouse position (CSS px, viewport-relative — the full-
  // screen canvas sits at inset:0, so clientX/Y map straight onto vw/vh). Starts null so
  // the pointer has no effect until the mouse actually moves; a centered pointer reads
  // neutral, so it never fights the stick. Read in the flight loop only when Mouse aim
  // is enabled (see settings). Purely additive — keyboard/pad stay fully capable.
  let pointer = null;
  window.addEventListener('mousemove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });

  // Model matrix for a rail-relative point (station s + frame offset lat/vert).
  const _rrPos = [0, 0, 0];   // S5: reused scratch for railRelModel's world position
  function railRelModel(s, lat, vert, sx, sy, sz) {
    const f = railFrame(s);
    _rrPos[0] = f.pos[0] + f.right[0] * lat + f.up[0] * vert;
    _rrPos[1] = f.pos[1] + f.right[1] * lat + f.up[1] * vert;
    _rrPos[2] = f.pos[2] + f.right[2] * lat + f.up[2] * vert;
    return mat4.chain(
      mat4.translation(_rrPos[0], _rrPos[1], _rrPos[2]),
      mat4.basis(f.right, f.up, negate(f.forward)),
      mat4.scaling(sx, sy, sz),
    );
  }

  // --- proof / boot presentation ------------------------------------------------
  if (still) {
    // Deterministic banked-mid-course pose for the in-level proof screenshots.
    run.launch();
    startLevel(run.currentNode());
    flight.s = 60; flight.offX = 1.3; flight.offY = 0.15;
    flight.roll = -0.34; flight.pitch = 0.05; flight.meter = 0.65; flight.mode = 'boost';
    const mz = flight.s + CAM.shipLead;
    if (stillRoll) {
      triggerRoll(rollState, 1);
      updateRoll(rollState, 0.12);
      spawnProjectile(projectiles, { team: 'enemy', s: mz + 2.5, lat: flight.offX + 0.3, vert: flight.offY + 0.2 });
      levelStats.score = 5200; levelStats.kills = 9;
      player.hull = 5;
    } else {
      spawnProjectile(projectiles, { team: 'player', s: mz + 12, lat: 0.9, vert: 0.05 });
      spawnProjectile(projectiles, { team: 'player', s: mz + 12, lat: -0.5, vert: 0.05 });
      spawnProjectile(projectiles, { team: 'player', s: mz + 26, lat: 0.35, vert: 0.02 });
      spawnProjectile(projectiles, { team: 'player', s: mz + 26, lat: -0.15, vert: 0.02 });
      const burst = spawnExplosion(explosions, { s: flight.s + 34, lat: -1.3, vert: 0.6, scale: 1.9 });
      burst.t = 0.28;
      levelStats.score = 4200; levelStats.kills = 7;
      player.hull = 4; player.lastHitBy = 'ASTEROID';
      pickups.push(
        { id: 9001, s: flight.s + 15, lat: -2.5, vert: 1.05, kind: 'repair',
          hull: 1, score: 0, radius: 1.1, taken: false, spin: 0.5 },
        { id: 9002, s: flight.s + 20, lat: 2.4, vert: -0.7, kind: 'score',
          hull: 0, score: 300, radius: 1.1, taken: false, spin: 1.2 },
        // a distress beacon (M7) — a downed wing to reach, distinct silhouette
        { id: 9003, s: flight.s + 30, lat: 1.7, vert: 0.5, kind: 'rescue',
          wingId: run.roster()[0].id, hull: 0, score: 250, radius: 1.3, taken: false, spin: 0 },
      );
      pickupCue = { text: '+HULL', repair: true, at: 0 };
      // Show the squad readout with a downed wing + a wingmate callout in the proof.
      if (run.roster()[1]) { run.roster()[1].alive = false; run.roster()[1].lostAt = 'x'; }
      const spk = run.roster()[0];
      wingCue = { speaker: spk.name, line: wingLine(spk, 'spot').line, kind: 'spot', at: 0 };
    }
  } else if (targetProof) {
    // One enemy, dead centre, at an exact range — the visibility measurement rig.
    run.launch();
    startLevel(run.currentNode());
    flight.s = 200; flight.offX = 0; flight.offY = 0;
    flight.roll = 0; flight.pitch = 0; flight.meter = 1;
    course.length = 0; pickups.length = 0;   // clear the lane so nothing occludes it
    renderer.upload('obstacles', createObstacleMesh(course, theme.rock));
    const kind = params.get('kind') === 'gunner' ? 'gunner' : 'drone';
    const k = ENEMY_KINDS[kind];
    enemies.length = 0;
    enemies.push({
      id: 1, waveId: 0, kind,
      s: flight.s + CAM.shipLead + targetRange, lat: 0, vert: 0,
      lat0: 0, vert0: 0, ampL: 0, ampV: 0, freq: 0, phaseL: 0, phaseV: 0, t: 0,
      hp: k.hp, maxHp: k.hp, radius: k.radius, score: k.score, alive: true,
      spin: 0, fireCd: 999,
    });
  } else if (bossProof) {
    // Freeze on the run climax: fast-forward the run to the final node so startLevel
    // builds the boss, then pose the ship at the arena mid-fight for the proof.
    run.launch(); startLevel(run.currentNode());
    let guard = 0;
    while (run.currentNode().id !== route.finalId && guard++ < 24) {
      if (run.phase === 'level') {
        run.completeLevel({ score: Math.round(levelPot * 0.7), kills: 4, potential: levelPot, died: false });
      }
      if (run.phase === 'debrief') {
        const open = run.choices().find((c) => !c.locked) || run.choices()[0];
        run.chooseBranch(open.node.id);
      }
      if (run.phase === 'level') startLevel(run.currentNode());
    }
    const holdS = BOSS_ARENA_S - BOSS.standoffS - CAM.shipLead;
    flight.s = holdS; flight.offX = -1.15; flight.offY = 0.35;
    flight.roll = 0.34; flight.pitch = -0.05; flight.meter = 0.72; flight.mode = 'boost';
    const shipS = flight.s + CAM.shipLead;
    // boss at phase 2, a fan attack mid-telegraph (~57% wound up), taking fire
    boss.hp = Math.round(boss.maxHp * 0.52); boss.phase = 2;
    boss.mode = 'telegraph'; boss.attackKind = 'fan';
    boss.pending = bossPattern('fan', { lat: -1.15, vert: 0.35 }, boss.rng); // S7: ghost lanes in the proof
    boss.telegraphDur = 1.15; boss.timer = 0.5; boss.hitFlash = 0.6;
    // a few bolts in the air (leftover enemy fire + the player's return volley)
    for (const off of [-2.2, -0.9, 1.4, 2.4]) {
      spawnProjectile(projectiles, { team: 'enemy', s: boss.s - 24, lat: off, vert: 0.5 });
    }
    spawnProjectile(projectiles, { team: 'player', s: shipS + 16, lat: 0.5, vert: 0.05 });
    spawnProjectile(projectiles, { team: 'player', s: shipS + 16, lat: -0.35, vert: 0.05 });
    spawnProjectile(projectiles, { team: 'player', s: shipS + 34, lat: 0.12, vert: 0.02 });
    const spark = spawnExplosion(explosions, { s: boss.s + boss.radius * 0.5, lat: 0, vert: 0, scale: 0.95 });
    spark.t = 0.32;
    levelStats.score = Math.round(levelPot * 0.66); levelStats.kills = 12;
    player.hull = 4;
    bossCue = { text: cuckooBossHail('phase').line, speaker: 'Commander Cuckoo', at: 0 };
  } else if (proofScreen === 'map') {
    // Fast-forward one strong level clear, then hold the branch map (past the loadout
    // pick, which the debrief now opens first).
    run.launch(); startLevel(run.currentNode());
    levelStats.score = Math.round(levelPot * 0.72); levelStats.kills = 6;
    endLevel(false);
    screens.hide();     // dismiss the loadout picker the debrief opened
    showBranchMap();    // hold the route map for the proof
  } else if (proofScreen === 'loadout') {
    // Fast-forward one clear into a debrief; the mid-run loadout picker holds open.
    run.launch(); startLevel(run.currentNode());
    levelStats.score = Math.round(levelPot * 0.7); levelStats.kills = 5;
    endLevel(false);
  } else if (proofScreen === 'results') {
    // Play a full route with solid scores, then hold the summary.
    run.launch(); startLevel(run.currentNode());
    let guard = 0;
    while (!run.isOver() && guard++ < 16) {
      if (run.phase === 'level') {
        levelStats.score = Math.round(levelPot * 0.7); levelStats.kills = 5;
        banked.score += levelStats.score; banked.kills += levelStats.kills;
        run.completeLevel({ score: levelStats.score, kills: levelStats.kills, potential: levelPot, died: false });
      } else if (run.phase === 'debrief') {
        const open = run.choices().find((c) => !c.locked);
        run.chooseBranch(open.node.id); startLevel(run.currentNode());
      }
    }
    presentPhase();
  } else if (proofScreen === 'hub') {
    // Populated hangar for the proof: a demo ledger (in-memory, never persisted) with
    // some Salvage, a couple of upgrades, and two logged runs so the flight-log reads.
    const demo = createLedger(null);
    demo.earn(1300);
    demo.recordRun({ seed: 'demo-1', totalKills: 8, totalScore: 640, levelsFlown: 3, routeLevels: 4, runMedal: 'silver', victory: false, died: true }, 'd1');
    demo.recordRun({ seed: 'demo-2', totalKills: 12, totalScore: 980, levelsFlown: 4, routeLevels: 4, runMedal: 'gold', victory: true }, 'd2');
    buyUpgrade(demo, 'hull'); buyUpgrade(demo, 'hull'); buyUpgrade(demo, 'blaster');
    createHub(demo).show({ lastRun: { victory: true }, lifetimeRuns: demo.lifetime().runs }, () => {});
  } else if (proofScreen === 'howto') {
    // S11: hold the one-time how-to-fly card over the live start-sector backdrop.
    showHowToFly(() => {});
  } else if (proofScreen === 'briefing') {
    // Cuckoo's mission briefing, held for the proof (M13 B2: the real beagle portrait).
    // The default boot now opens the title (M12), so the briefing needs its own flag.
    presentPhase();
  } else if (proofScreen === 'title') {
    // Hold the M12 title over the live start-sector backdrop (the ship banks live).
    openTitle();
  } else if (proofScreen === 'title-continue') {
    // Same, but with saved progress so Continue reads enabled (proof of both states).
    ledger.earn(400);
    openTitle();
  } else {
    // Normal boot (M12): the title screen. New Run flies; Continue returns to the hangar.
    openTitle();
  }

  let dpr = 1, vw = 0, vh = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = Math.floor(window.innerWidth);
    vh = Math.floor(window.innerHeight);
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    renderer.resize(canvas.width, canvas.height);
    hud.resize(vw, vh, dpr);
    routemap.resize(vw, vh, dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // The light + ambient floor now live in gfx/shading.js beside the pure JS mirror of
  // the shader math, so the visibility tests audit the SAME numbers the GPU is given.
  const lightDir = LIGHT_DIR;

  let last = 0, fps = 0, frame = 0;
  let contextLost = false;             // B3: WebGL context-loss gate for the render loop
  // B4: a SIM clock — advances by dt ONLY while a level is actively playing (not menu-
  // paused, not a proof freeze). Linger + cue timers read this instead of wall-clock, so
  // a pause or a tab-away (which makes `now` leap forward) can never expire a boss-down /
  // death linger or a caption behind the menu. dt is already clamped, so no single frame
  // can jump the sim clock.
  let simT = 0;
  let pausePrev = false;               // B4: pause-edge detector for clearing weapon state
  const liveScratch = [];              // S5: reused active-enemy window (no per-frame array)
  const livePickupScratch = [];        // S5: reused active-pickup window
  let fovKick = 0;
  let startPrev = false;
  let padNavPrev = false;
  let padConfirmPrev = false;
  let padCancelPrev = false;           // S9: button 1 (B) = cancel/secondary edge
  let padCaptureArmed = false;
  let rollPrev = false;
  let steerTapDir = 0, steerTapAt = -1, steerDiscPrev = 0;

  function gp_btn(gp, i) {
    return gp && gp.buttons[i] && gp.buttons[i].pressed;
  }

  function render(now) {
    // B3: while the WebGL context is lost, do not draw and do not reschedule — the
    // restore handler re-arms the loop. Reset `last` so the first restored frame
    // takes a fresh dt instead of the wall-clock gap spent on the lost-context card.
    if (contextLost) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

    const gp = gamepad.poll(settings.get('deadzone'));
    const nowSec = now / 1000;   // wall-clock: cosmetic oscillations only (title weave, sway, spin); gameplay timers use simT (B4)
    const inLevel = run.phase === 'level';
    // Controller rebinding waits for every button to be released before listening.
    // This prevents the A press used to select a verb from immediately binding A.
    let controllerCaptureHandled = false;
    if (menu.captureClass() === 'controller' && gp) {
      const pressed = [];
      for (let i = 0; i < gp.buttons.length; i++) if (gp_btn(gp, i)) pressed.push(i);
      if (!padCaptureArmed) {
        if (!pressed.length) padCaptureArmed = true;
      } else if (pressed.length) {
        menu.captureButton('controller', pressed[0]);
        audio.blip(560);
        padCaptureArmed = false;
        controllerCaptureHandled = true;
      }
    } else {
      padCaptureArmed = false;
    }

    // Music bed follows the run phase (switches only on a real track change). The M12
    // title takes precedence (its own silent socket track) while it is up.
    music.setPhase(
      title.isOpen() ? 'title' : hub.isOpen() ? 'hub' : run.phase,
      { victory: run.phase === 'results' ? !!run.summary().victory : false },
    );

    // Gamepad drives the run-flow screens (best-effort standard mapping).
    const confirmNow = gp_btn(gp, 0) || gp_btn(gp, 9);
    if (confirmNow && !padConfirmPrev) {
      if (title.isOpen() && !menu.isOpen()) title.confirm();
      else if (hub.isOpen()) hub.fireLaunch();
      else if (screens.briefingOpen()) screens.fireBriefing();
      else if (screens.resultsOpen()) screens.fireRetry();
      else if (screens.loadoutOpen()) screens.fireLoadout();
      else if (routemap.isOpen()) routemap.handleKey('Enter');
    }
    padConfirmPrev = confirmNow;
    // S9: button 1 (B) is CANCEL/secondary everywhere. On the results screen it takes
    // the quiet path to the hangar (the keyboard's H); harmless elsewhere.
    const cancelNow = gp_btn(gp, 1);
    if (cancelNow && !padCancelPrev) {
      if (screens.resultsOpen()) screens.fireHangar();
    }
    padCancelPrev = cancelNow;
    if ((routemap.isOpen() || screens.loadoutOpen()) && gp) {
      const up = gp_btn(gp, 12), down = gp_btn(gp, 13);
      const navNow = up || down;
      if (navNow && !padNavPrev) {
        if (screens.loadoutOpen()) screens.moveLoadout(up ? -1 : 1);
        else routemap.handleKey(up ? 'ArrowUp' : 'ArrowDown');
      }
      padNavPrev = navNow;
    }
    // M12 title: D-pad up/down walks the title menu (only when Options is not over it —
    // then the menu block below owns the pad). F310-first: A confirms via the chain above.
    if (title.isOpen() && !menu.isOpen() && gp) {
      const up = gp_btn(gp, 12), down = gp_btn(gp, 13);
      const navNow = up || down;
      if (navNow && !padNavPrev) title.move(up ? -1 : 1);
      padNavPrev = navNow;
    }

    // Gamepad Start toggles the assist menu, only during a level.
    const startNow = gp_btn(gp, 9) || gp_btn(gp, 8);
    if (inLevel && startNow && !startPrev) { const o = menu.toggleOpen(); audio.blip(o ? 620 : 300); }
    startPrev = startNow;

    if (menu.isOpen() && gp && menu.captureClass() !== 'controller' && !controllerCaptureHandled) {
      const up = gp_btn(gp, 12), down = gp_btn(gp, 13);
      const left = gp_btn(gp, 14), right = gp_btn(gp, 15);
      // S9: button 0 (A) confirms, button 1 (B) cancels/steps back — consistent with
      // every other surface (was using button 1 as confirm here).
      const confirm = gp_btn(gp, 0);
      const cancel = gp_btn(gp, 1);
      const navNow = up || down || left || right || confirm || cancel;
      if (navNow && !padNavPrev) {
        if (up) menu.move(-1); else if (down) menu.move(1);
        else if (left) menu.adjust(-1); else if (right) menu.adjust(1);
        else if (confirm) menu.activate();
        else if (cancel) menu.back();
      }
      padNavPrev = navNow;
    }

    const paused = menu.isOpen() || !inLevel;
    // B4: advance the sim clock only while a level is genuinely playing. This is the
    // clock every linger/cue timer below reads.
    const simActive = inLevel && !menu.isOpen() && !frozen;
    if (simActive) simT += dt;
    // B4: on the pause EDGE, clear the weapon's held/charge state so a trigger release
    // that happens while the menu is open cannot mint a charged bolt on resume.
    if (paused && !pausePrev) { weapon.held = false; weapon.charge = 0; weapon.heldTime = 0; }
    pausePrev = paused;
    const reducedMotion = settings.get('reducedMotion');
    const invertY = settings.get('invertY') || forceInvertY;
    hud.setReducedMotion(reducedMotion);

    // All digital inputs route through the same remappable action table. Pointer aim
    // and the controller stick remain axes; their buttons can still bind any action.
    const kd = (c) => keyboard.isDown(c);
    const md = (button) => mouseButtons.has(button);
    const gd = (button) => gp_btn(gp, button);
    const actionDown = (action) =>
      bindings.isDown(action, kd, 'keyboard') ||
      bindings.isDown(action, md, 'mouse') ||
      bindings.isDown(action, gd, 'controller');
    let kbx = 0, kby = 0;
    if (actionDown('steerLeft')) kbx -= 1;
    if (actionDown('steerRight')) kbx += 1;
    if (actionDown('steerUp')) kby -= 1;
    if (actionDown('steerDown')) kby += 1;
    // The double-tap barrel roll reads the RAW key edges below; it needs to see a
    // release, and the held axis (by design) never reports one.
    const kbxRaw = kbx, kbyRaw = kby;
    // Releasing the keys stops the ship, it does not fly it back to the middle
    // (input/holdaxis.js). Skipped while paused so arrow-key menu navigation cannot
    // drive the hold state behind the options screen.
    if (!paused) { kbx = kbHoldX.read(kbx, dt); kby = kbHoldY.read(kby, dt); }
    // M11 pointer aim: fold the mouse steer into the SAME steer sum as the stick/keys
    // (one movement model). Additive and opt-in — zero unless Mouse aim is enabled, and
    // a centered pointer contributes (0,0). Y goes in raw so invert-Y applies uniformly.
    const mouseOn = settings.get('mouseAim');
    let mx = 0, my = 0;
    if (mouseOn && !paused && pointer) {
      const ms = mouseSteer(pointer, { w: vw, h: vh }, settings.get('mouseSensitivity'));
      mx = ms.x; my = ms.y;
    }
    const steerX = paused ? 0 : clamp((gp ? gp.left[0] : 0) + kbx + mx, -1, 1);
    const steerYraw = (gp ? gp.left[1] : 0) + kby + my;
    const steerY = paused ? 0 : clamp(maybeInvertY(steerYraw, invertY), -1, 1);
    const boost = !paused && actionDown('boost');
    const brake = !paused && actionDown('brake');
    // Mouse-button actions are independent of Mouse aim. Turning pointer steering off
    // must never turn off a deliberately bound trigger.
    const fire = !paused && actionDown('fire');

    // Barrel-roll trigger: dedicated buttons (bound keys, pad LB/RB) OR a double-tap steer.
    let rollDir = 0;
    const rollLeftNow = actionDown('rollLeft');
    const rollRightNow = actionDown('rollRight');
    const rollBtnNow = !paused && (rollLeftNow || rollRightNow);
    if (rollBtnNow && !rollPrev) rollDir = rollRightNow ? 1 : -1;
    rollPrev = rollBtnNow;
    // Read the RAW steer (pre-hold) for the double-tap: the roll fires on a press-edge
    // after a release, and the held axis deliberately never reports a release.
    const steerXraw = clamp((gp ? gp.left[0] : 0) + kbxRaw + mx, -1, 1);
    const disc = paused ? 0 : (steerXraw > 0.6 ? 1 : steerXraw < -0.6 ? -1 : 0);
    if (disc !== 0 && steerDiscPrev === 0) {
      if (disc === steerTapDir && simT - steerTapAt < 0.3) {
        rollDir = disc; steerTapAt = -1; steerTapDir = 0;
      } else { steerTapDir = disc; steerTapAt = simT; }
    }
    steerDiscPrev = disc;

    const running = !frozen && inLevel && !menu.isOpen() && player.alive;
    if (running) updateFlight(flight, { steerX, steerY, boost, brake, regenMul: loadout.boostRegenMul + boons.regenAdd }, dt);
    // M10 living world: on the between-level screens the camera drifts slowly down the
    // rail so the sky behind the briefing/results/hub is never dead still. Cosmetic
    // only (startLevel rebuilds flight state, so it never leaks into a run) and killed
    // by reduced motion.
    else if (!inLevel && !frozen && !reducedMotion) flight.s += AMBIENT_DRIFT * dt;

    // M12 title: a live-engine scene — the ship banks gently through the starfield behind
    // the wordmark (the camera already drifts down the rail above). Cosmetic and fully
    // reduced-motion-gated (a still, centered ship then); startLevel rebuilds flight state
    // when the title dismisses, so none of this leaks into a run.
    if (title.isOpen() && !frozen) {
      if (reducedMotion) { flight.offX = 0; flight.offY = 0; flight.roll = 0; flight.pitch = 0; }
      else {
        const tw = 0.35;                          // slow lateral weave
        flight.offX = Math.sin(nowSec * tw) * 1.35;
        flight.roll = Math.cos(nowSec * tw) * 0.5; // bank INTO the turn (roll ~ lateral vel)
        // Bias the ship UP so it banks through the starfield around the wordmark (passing
        // behind the letters reads as depth) and leaves the menu column below it clear.
        flight.offY = 1.05 + Math.sin(nowSec * 0.5) * 0.35;
        flight.pitch = Math.sin(nowSec * 0.5) * 0.04;
      }
    }

    // M8: the rail-boss "gate" — while the boss lives, the ship holds at the arena
    // edge (a standoff ahead of it) instead of flying past. Steering still works, so
    // you dodge in the frame; only forward progress is pinned until the boss falls.
    if (boss && !boss.defeated) {
      const holdS = BOSS_ARENA_S - BOSS.standoffS - CAM.shipLead;
      if (flight.s > holdS) flight.s = holdS;
    }

    const ship = {
      s: flight.s + CAM.shipLead, lat: flight.offX, vert: flight.offY, radius: PLAYER.radius,
    };
    if (running) {
      stepProjectiles(projectiles, dt);
      updateEnemies(enemies, flight.s, dt);
    }
    const live = activeEnemiesInto(liveScratch, enemies, flight.s);
    const lockTarget = acquireLock(live, ship, PROJECTILE.convergeDist);
    if (running) {
      if (rollDir !== 0) triggerRoll(rollState, rollDir);
      updateRoll(rollState, dt);
      const deflecting = isDeflecting(rollState);
      updateEnemyFire(live, ship, projectiles, dt);
      levelStats.shotsFired += updateWeapon(weapon, { fire }, ship, projectiles, dt, lockTarget, loadout.boostChargeMul + boons.chargeAdd);
      // Wingmate callouts + the loadout's per-kill score edge (spotter support + Gun
      // Sights). killScore is banked per kill this call.
      const killed = resolvePlayerHits(projectiles, live, explosions, levelStats, loadout.blasterDamageBonus + boons.damageBonus);
      const killScore = wingSup.killScore + boons.killScore;
      if (killed > 0 && killScore > 0) levelStats.score += killed * killScore;
      resolveEnemyBolts(projectiles, ship, player, simT, deflecting);
      resolveObstacle(course, ship, player, simT);
      resolveEnemyContact(live, ship, player, simT);

      // --- M8: the boss (final node only) — telegraphed attacks + take its hull down
      if (boss && !boss.defeated) {
        const bout = updateBoss(boss, ship, dt);
        if (bout.justActivated) {
          bossCue = { text: cuckooBossHail("approach").line, speaker: "Commander Cuckoo", at: simT };
          audio.blip(240);
        }
        for (const b of bout.bolts) spawnProjectile(projectiles, { team: 'enemy', s: b.s, lat: b.lat, vert: b.vert });
        if (bout.fired) audio.blip(200);
        const br = resolveBossHits(projectiles, boss, loadout.blasterDamageBonus + boons.damageBonus);
        if (br.hits > 0) {
          // a small hit spark at the exposed core (front-center), seed-free (no RNG)
          spawnExplosion(explosions, { s: boss.s + boss.radius * 0.5, lat: 0, vert: 0, scale: 0.7 });
          audio.blip(360);
        }
        if (takePhaseChange(boss)) {
          bossCue = { text: cuckooBossHail('phase').line, speaker: 'Commander Cuckoo', at: simT };
          audio.blip(520);
        }
        if (br.killed) {
          levelStats.score += boss.score;
          levelStats.kills += 1;
          spawnExplosion(explosions, { s: boss.s, lat: 0, vert: 0, scale: 4.4 });
          bossDownAt = simT;
          bossCue = { text: cuckooBossHail('down').line, speaker: 'Commander Cuckoo', at: simT };
          audio.blip(760);
        }
      }

      const grabbed = collectPickups(pickups, ship.s, ship.lat, ship.vert, player, levelStats);
      if (grabbed.length) {
        const g = grabbed[grabbed.length - 1];
        const rescued = grabbed.some((p) => p.kind === 'rescue');
        pickupCue = { text: rescued ? 'RESCUED' : (g.hull > 0 ? '+HULL' : '+' + g.score), repair: g.hull > 0 || rescued, at: simT };
        audio.blip(rescued ? 660 : (g.hull > 0 ? 720 : 880));
        if (rescued) fireWing('rescued', distressWing, simT);
      }
      if (!player.alive && !deathBurst) {
        spawnExplosion(explosions, { s: ship.s, lat: ship.lat, vert: ship.vert, scale: 2.4 });
        deathBurst = true; deathAt = simT;
      }

      // --- wingmate callouts (M7): launch, first-contact spot, distress, lost ------
      if (!launchFired) { fireWing('launch', run.living()[0], simT); launchFired = true; }
      if (!spotFired && live.length) { fireWing('spot', run.living()[0], simT); spotFired = true; }
      if (distressPod && !distressPod.taken) {
        if (!distressFired && distressPod.s > ship.s && distressPod.s - ship.s < 130) {
          fireWing('distress', distressWing, simT); distressFired = true;
        }
        if (!lostFired && ship.s - distressPod.s > 3) {
          fireWing('lost', distressWing, simT); lostFired = true;
        }
      }
    }
    if (!frozen && inLevel && !menu.isOpen()) {
      stepExplosions(explosions, dt);
      updatePlayer(player, dt);
    }

    // Level completion. A normal level ends by flying to the end station; the boss
    // level ends only when the boss falls (after its down-burst lingers) — that is the
    // run climax's victory. A death on either ends the level after the ship-down card.
    if (inLevel && !levelFinished) {
      const bossVictory = boss && boss.defeated && bossDownAt >= 0 && simT - bossDownAt > BOSS_LINGER;
      const flewToEnd = !boss && flight.s >= LEVEL_END - CAM.shipLead;
      if (player.alive && (bossVictory || flewToEnd)) endLevel(false);
      else if (!player.alive && deathAt >= 0 && simT - deathAt > DEATH_LINGER) endLevel(true);
    }

    const lockShown = still ? (stillRoll ? null : lockTarget) : (lockEngaged(weapon) ? lockTarget : null);
    const chargeShown = still ? (stillRoll ? 0 : 0.7) : weapon.charge;

    // --- camera from the rail -------------------------------------------------
    const camF = railFrame(flight.s);
    let eye = add(add(camF.pos, scale(camF.up, CAM.up)), scale(camF.forward, -CAM.back));
    let lookTarget = railFrame(flight.s + CAM.lookLead).pos;
    const aspect = canvas.width / Math.max(1, canvas.height);

    if (!reducedMotion && player.shake > 0) {
      const t = now * 0.05, m = player.shake;
      const sx = Math.sin(t * 1.7) * 0.34 * m;
      const sy = Math.cos(t * 2.3) * 0.27 * m;
      eye = add(add(eye, scale(camF.right, sx)), scale(camF.up, sy));
      lookTarget = add(add(lookTarget, scale(camF.right, sx)), scale(camF.up, sy));
    }

    const fovBase = settings.get('fov') * Math.PI / 180;
    const kickTarget = (flight.mode === 'boost' && !settings.get('fovLock') && !reducedMotion) ? 0.13 : 0;
    fovKick += (kickTarget - fovKick) * (1 - Math.exp(-6 * dt));
    const proj = mat4.perspective(fovBase + fovKick, aspect, 0.1, 200);

    const bank = reducedMotion ? 0 : flight.roll * 0.32;
    const cb = Math.cos(bank), sb = Math.sin(bank);
    const upVec = [sb * camF.right[0], cb + sb * camF.right[1], sb * camF.right[2]];
    const view = mat4.lookAt(eye, lookTarget, upVec);

    // The banded sky goes down first, into the native-resolution target, replacing the
    // old flat clear-to-fog-colour. The approved frames read their far silhouettes
    // against a graded sky and a warm horizon lip; a flat fill cannot give them that.
    renderer.beginSky({
      view,
      sky: theme.sky,
      tanHalf: Math.tan((fovBase + fovKick) / 2),
      reducedStars: reducedMotion,
    });

    renderer.beginFrame({ proj, view, lightDir, ambient: AMBIENT, fog });

    // Landscape first, on its own long ramp. vistaFar lets the ground reach a real
    // horizon without touching one combat number: fog.near/far still govern everything
    // that can shoot you or be shot (see world/sectors.js).
    const vistaFog = { near: fog.near, far: theme.vistaFar || fog.far };
    renderer.draw('terrain', mat4.identity(), vistaFog, { tag: 'terrain' });
    renderer.draw('relief', mat4.identity(), vistaFog, { tag: 'relief' });
    renderer.draw('structures', mat4.identity(), vistaFog, { tag: 'structure' });

    renderer.draw('field', mat4.identity(), null, { tag: 'scenery' });
    renderer.draw('obstacles', mat4.identity(), null, { tag: 'scenery' });

    // Enemies hold up against the sector haze better than the scenery does, so a
    // contact is actually legible at the ranges where it is allowed to shoot at you
    // (ENEMY_HAZE — see gfx/enemymesh.js for why colour alone could not do it).
    const enemyFog = { near: fog.near, far: fog.far * ENEMY_HAZE.farMul };
    for (const e of live) {
      renderer.draw(ENEMY_MESH_KEY[enemyVisualVariant(e.kind, e.id)] || 'enemy_drone',
        railRelModel(e.s, e.lat, e.vert, e.radius, e.radius, e.radius), enemyFog,
        { tag: 'enemy' });
    }

    // M8: the boss looms ahead once it exists (final node). A slow menacing yaw sway
    // (killed under reduced motion) sells the heavy hull without moving its hitbox.
    if (boss && boss.s > flight.s - 20 && boss.s < flight.s + 480) {
      const ds = 3.6;                        // visual scale (it looms; collision radius is generous)
      const sway = reducedMotion ? 0 : Math.sin(nowSec * 0.5) * 0.08;
      const bf = railFrame(boss.s);
      renderer.draw('boss', mat4.chain(
        mat4.translation(bf.pos[0], bf.pos[1], bf.pos[2]),
        mat4.basis(bf.right, bf.up, negate(bf.forward)),
        mat4.rotationY(sway),
        mat4.scaling(ds, ds, ds),
      ), null, { tag: 'boss' });
    }

    // S7: ghost the committed attack lanes during the telegraph — a marker at each
    // incoming bolt's lane, drawn at the SHIP's own depth so you can read exactly where
    // to NOT be. Grows as the attack locks in (the timing cue the INCOMING bar also
    // gives); under reduced motion it holds a steady size (the lanes still show — a
    // non-flash readability aid, not vestibular motion).
    if (boss && boss.mode === 'telegraph' && boss.pending && boss.pending.length) {
      const tp = telegraphProgress(boss);
      const gz = flight.s + CAM.shipLead;      // the ship's forward plane
      const gf = railFrame(gz);
      const gs = reducedMotion ? 1.1 : 0.5 + 0.95 * tp;
      for (const o of boss.pending) {
        const gpos = [
          gf.pos[0] + gf.right[0] * o.lat + gf.up[0] * o.vert,
          gf.pos[1] + gf.right[1] * o.lat + gf.up[1] * o.vert,
          gf.pos[2] + gf.right[2] * o.lat + gf.up[2] * o.vert,
        ];
        renderer.draw('bolt_enemy', mat4.chain(
          mat4.translation(gpos[0], gpos[1], gpos[2]),
          mat4.basis(gf.right, gf.up, negate(gf.forward)),
          mat4.scaling(gs, gs, gs),
        ), null, { tag: 'enemy', emissive: true });
      }
    }

    const livePickups = activePickupsInto(livePickupScratch, pickups, flight.s);
    for (const p of livePickups) {
      const pf = railFrame(p.s);
      const pp = [
        pf.pos[0] + pf.right[0] * p.lat + pf.up[0] * p.vert,
        pf.pos[1] + pf.right[1] * p.lat + pf.up[1] * p.vert,
        pf.pos[2] + pf.right[2] * p.lat + pf.up[2] * p.vert,
      ];
      const spin = p.spin + nowSec * 1.6;
      const meshKey = p.kind === 'repair' ? 'pickup_repair' : p.kind === 'rescue' ? 'pickup_rescue' : 'pickup_score';
      const pscale = p.kind === 'rescue' ? 1.05 : 0.85; // the beacon reads a touch bigger
      renderer.draw(meshKey, mat4.chain(
        mat4.translation(pp[0], pp[1], pp[2]),
        mat4.basis(pf.right, pf.up, negate(pf.forward)),
        mat4.rotationY(spin),
        mat4.scaling(pscale, pscale, pscale),
      ), null, { tag: 'craft' });
    }

    const shipF = railFrame(flight.s + CAM.shipLead);
    const shipPos = add(
      add(shipF.pos, scale(shipF.right, flight.offX)),
      scale(shipF.up, flight.offY),
    );
    const orient = mat4.basis(shipF.right, shipF.up, negate(shipF.forward));
    const spin = rollAngle(rollState, reducedMotion ? 0.12 : 1);
    // hide the ship in the death burst (it just blew up) so it isn't floating there
    if (player.alive || !deathBurst) {
      const craftModel = mat4.chain(
        mat4.translation(shipPos[0], shipPos[1], shipPos[2]),
        orient,
        mat4.rotationZ(flight.roll + spin),
        mat4.rotationX(flight.pitch),
      );
      renderer.draw('craft', craftModel, null, { tag: 'craft' });
    }

    for (const p of projectiles.list) {
      const key = p.team === 'player' ? 'bolt_player' : 'bolt_enemy';
      const g = p.charged ? 1.9 : 1;
      renderer.draw(key, railRelModel(p.s, p.lat, p.vert, g, g, g), null,
        { tag: p.team === 'player' ? 'craft' : 'enemy', emissive: true });
    }

    for (const ex of explosions.list) {
      const ease = 1 - (1 - ex.t) * (1 - ex.t);
      const dist = EXPLOSION.expand * ex.scale * ease;
      const size = Math.max(0, ex.scale * 0.5 * (1 - ex.t));
      if (size <= 0) continue;
      for (const d of SHARD_DIRS) {
        renderer.draw('shard', railRelModel(
          ex.s + d[2] * dist, ex.lat + d[0] * dist, ex.vert + d[1] * dist,
          size, size, size), null, { tag: 'enemy', emissive: true });
      }
    }

    // Scale the native buffer up to the screen. Everything above painted into the
    // offscreen target; nothing reaches the canvas until this call.
    renderer.endFrame();

    // --- HUD (only meaningful during a level; screens cover it otherwise) ------
    const vp = mat4.multiply(proj, view);
    const aimPoint = add(shipPos, scale(shipF.forward, 30));
    const aim = projectToScreen(vp, aimPoint);
    const sinceHit = simT - player.hitAt;
    const hurt = reducedMotion ? 0 : Math.max(0, 1 - sinceHit / 0.3) * HURT_FLASH_MAX;
    let lockScreen = null;
    if (lockShown) {
      const lf = railFrame(lockShown.s);
      const lp = [
        lf.pos[0] + lf.right[0] * lockShown.lat + lf.up[0] * lockShown.vert,
        lf.pos[1] + lf.right[1] * lockShown.lat + lf.up[1] * lockShown.vert,
        lf.pos[2] + lf.right[2] * lockShown.lat + lf.up[2] * lockShown.vert,
      ];
      lockScreen = projectToScreen(vp, lp);
    }
    let pcue = null;
    if (pickupCue) {
      const age = still ? 0.2 : simT - pickupCue.at;
      if (age >= 0 && age < 1.1) {
        pcue = { text: pickupCue.text, repair: pickupCue.repair, alpha: 1 - age / 1.1, rise: age * 22 };
      } else if (!still) {
        pickupCue = null;
      }
    }

    // In-level medal pace: projected medal from this level's score so far.
    const progress = clamp(flight.s / LEVEL_END, 0, 1);
    const pace = (inLevel || still) ? medalPace(levelStats.score, still ? 0.4 : progress, levelPot) : null;
    if (pace) pace.explain = !taughtPace || still;   // S11: explainer on the first sortie (and in the proof)
    const showHud = inLevel || still;

    // The squad readout + a fading wingmate callout (M7).
    const squad = showHud
      ? run.roster().map((w) => ({ name: w.name, tint: w.tint, alive: w.alive, traitName: w.traitName }))
      : null;
    let wcue = null;
    if (wingCue) {
      const age = still ? 0.4 : simT - wingCue.at;
      if (wingCue.at != null && age >= 0 && age < 2.8) {
        wcue = { speaker: wingCue.speaker, line: wingCue.line, kind: wingCue.kind, alpha: age < 2.2 ? 1 : 1 - (age - 2.2) / 0.6 };
      } else if (!still && wingCue.at != null) {
        wingCue = null;
      }
    }

    // M8: the boss HUD — a hull bar with phase pips and a telegraph warning. The
    // boss's own captions (Cuckoo's climax hails) ride the wingmate-callout channel.
    let bossHud = null;
    if (showHud && boss) {
      const tp = telegraphProgress(boss);
      bossHud = {
        hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase, phaseCount: boss.phaseCount,
        active: boss.mode !== 'dormant', defeated: boss.defeated,
        telegraph: (boss.mode === 'telegraph') ? tp : 0,
        attackKind: boss.attackKind,   // S7: label FAN/PILLARS/AIMED on the telegraph
        hitFlash: boss.hitFlash,
      };
    }
    if (bossCue && !wcue) {
      const age = still ? 0.4 : simT - bossCue.at;
      if (bossCue.at != null && age >= 0 && age < 3.4) {
        wcue = { speaker: bossCue.speaker, line: bossCue.text, kind: 'boss', alpha: age < 2.8 ? 1 : 1 - (age - 2.8) / 0.6 };
      } else if (!still && bossCue.at != null) {
        bossCue = null;
      }
    }

    hud.draw({
      hidden: title.isOpen(),   // M12: HUD fully off behind the translucent title overlay
      reticle: showHud ? aim : { visible: false }, meter: flight.meter, mode: flight.mode,
      score: banked.score + levelStats.score, kills: banked.kills + levelStats.kills,
      sector: showHud ? theme.name : null, pickupCue: pcue,
      pace: showHud ? pace : null,
      escHint: showHud && (!taughtEsc || still),   // S11: first-sortie Esc reminder (and in the proof)
      squad, wingCallout: wcue,
      // The kill flash blooms from the thing that died, so it reads as a kill rather
      // than as the screen changing colour. Off-screen or behind us -> no point, and
      // drawFlash draws nothing (no sourceless washes).
      flash: explosionFlash(explosions, reducedMotion),
      flashAt: flashPoint(vp, strongestFlash(explosions, reducedMotion)),
      hull: showHud ? player.hull : 0, maxHull: showHud ? player.maxHull : 0, invuln: player.invuln,
      alive: player.alive, cause: player.lastHitBy,
      hitBy: still ? player.lastHitBy : (sinceHit < 2 ? player.lastHitBy : null),
      hurt: still ? 0 : hurt,
      charge: chargeShown, chargeFull: chargeShown >= WEAPON.chargeThreshold,
      lock: lockScreen,
      deflect: isDeflecting(rollState) ? projectToScreen(vp, shipPos) : null,
      boss: bossHud,
    });

    overlay.update({
      fps, width: vw, height: vh, dpr, seed,
      triangles: totalTrisRef.v, glRenderer,
      flight: { speed: flight.speed, s: flight.s, meter: flight.meter, mode: flight.mode,
        offX: flight.offX, offY: flight.offY },
      gamepad: gp, deadzone: settings.get('deadzone'), keys: keyboard.held(),
    });

    frame++;
    window.__strayFrame = frame;
    window.__strayReady = true;
    // Read-only proof socket for shipped-artifact input verification. It is populated
    // only under ?debug, alongside the existing developer overlay.
    if (debug) window.__strayProof = {
      shotsFired: levelStats.shotsFired,
      fireHeld: fire,
      phase: run.phase,
    };

    // --- scene-legibility instrumentation (art migration 2026-08-10) ---------------
    // The art PoC measured every frame and threw when a gate slipped; the same rig is
    // wired here as a read-only socket so scripts/instrument.mjs can hold the SHIPPED
    // artifact to those gates (gfx/instrument.js states them). Opt-in via ?instrument
    // because the pixel readback is a stall — never on in a played frame.
    if (instrument) {
      const railBounds = (s, lat, vert, r) => {
        const f = railFrame(s);
        const c = [
          f.pos[0] + f.right[0] * lat + f.up[0] * vert,
          f.pos[1] + f.right[1] * lat + f.up[1] * vert,
          f.pos[2] + f.right[2] * lat + f.up[2] * vert,
        ];
        const pts = [];
        for (const dx of [-r, r]) for (const dy of [-r, r]) for (const dz of [-r, r]) {
          pts.push(projectToScreen(vp, [
            c[0] + f.right[0] * dx + f.up[0] * dy + f.forward[0] * dz,
            c[1] + f.right[1] * dx + f.up[1] * dy + f.forward[1] * dz,
            c[2] + f.right[2] * dx + f.up[2] * dy + f.forward[2] * dz,
          ]));
        }
        return projectedBounds(pts, vw, vh);
      };

      const enemyBounds = live.map((e) => railBounds(e.s, e.lat, e.vert, e.radius));
      let bossBounds = null, bossAreaPct = null;
      if (boss && !boss.defeated) {
        // A bounding-box proxy for the PoC's rasterised silhouette share. It reads a
        // little high on a hull this angular, so the mass floor it feeds is a floor on
        // an over-estimate — the conservative direction for a "is it big enough" gate.
        bossBounds = railBounds(boss.s, 0, 0, boss.radius * 3.6);
        bossAreaPct = (bossBounds.nativeArea / Math.max(1, vw * vh)) * 100;
      }

      const shot = renderer.readNative();
      const sample = {
        enemies: enemyBounds,
        boss: bossBounds,
        bossAreaPct,
        hotPixPct: shot ? hotPixelPct(shot.pixels) : 0,
      };
      const verdict = evaluateFrame(sample);
      window.__strayInstrument = {
        frame,
        seed,
        sector: theme.id,
        native: renderer.nativeInfo(),
        enemiesOnScreen: enemyBounds.filter((b) => b.onScreen).length,
        ...verdict,
      };
    }
    requestAnimationFrame(render);
  }

  // B3: WebGL context loss/restore — public-web table stakes. A GPU reset, driver
  // hiccup, or the browser reclaiming the context must not crash the game or leave a
  // frozen canvas. We stop drawing, show a plain reassuring card, and on restore we
  // rebuild the program + every mesh and resume the loop right where it left off.
  const lostCard = (() => {
    const d = document.createElement('div');
    d.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:60', 'display:none',
      'align-items:center', 'justify-content:center', 'text-align:center',
      'background:rgba(6,10,16,0.94)', 'color:#cfe6e2',
      'font:15px/1.6 ui-monospace,Menlo,Consolas,monospace', 'padding:24px',
    ].join(';');
    d.innerHTML =
      '<div style="max-width:440px">' +
      '<div style="color:#ffd24a;letter-spacing:2px;font-weight:700;margin-bottom:12px">GRAPHICS PAUSED</div>' +
      '<div>The graphics context was lost, usually a GPU or driver hiccup.</div>' +
      '<div style="margin-top:8px;color:#9fb4c8" id="ss-lost-detail">Trying to restore it now. If this stays up, reload the page.</div>' +
      '</div>';
    document.body.appendChild(d);
    return d;
  })();
  const lostDetail = lostCard.querySelector('#ss-lost-detail');

  // S9: a small controller connect/disconnect toast so the player knows the pad was
  // seen (or dropped mid-run). A/B mapping and every menu note assume button 0 confirms.
  const toast = (() => {
    const d = document.createElement('div');
    d.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:34px', 'transform:translateX(-50%)',
      'z-index:40', 'display:none', 'padding:8px 16px', 'border-radius:8px',
      'background:rgba(12,18,26,0.94)', 'border:1px solid #24405a', 'color:#cfe6e2',
      'font:13px/1.4 ui-monospace,Menlo,Consolas,monospace', 'letter-spacing:1px',
      'box-shadow:0 4px 18px rgba(0,0,0,0.5)', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(d);
    let hideFrame = 0;
    return (msg) => {
      d.textContent = msg;
      d.style.display = 'block';
      clearTimeout(hideFrame);
      hideFrame = setTimeout(() => { d.style.display = 'none'; }, 2600);
    };
  })();
  window.addEventListener('gamepadconnected', (e) => {
    const id = e.gamepad && e.gamepad.id ? e.gamepad.id.split('(')[0].trim() : 'Controller';
    toast('Controller connected: ' + (id || 'ready to fly'));
  });
  window.addEventListener('gamepaddisconnected', () => {
    toast('Controller disconnected. Keyboard still flies.');
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    // preventDefault is REQUIRED for the browser to fire webglcontextrestored.
    e.preventDefault();
    contextLost = true;
    lostDetail.textContent = 'Trying to restore it now. If this stays up, reload the page.';
    lostCard.style.display = 'flex';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // The old GL objects died with the context; rebuild the program + all meshes.
    renderer.rebuild();
    resize();               // re-set viewport + re-derive the current framebuffer size
    contextLost = false;
    lostCard.style.display = 'none';
    requestAnimationFrame(render);
  });

  requestAnimationFrame(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
