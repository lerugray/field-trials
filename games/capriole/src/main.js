// main.js — the browser entry point. Marries the deterministic sim to the
// first-person renderer, HUD, and input. The sim never imports three; this is the
// only file that touches both. LOUD failures (hard rule 4): boot chip, on-screen
// debug banner, global error traps.
//
// Input floor (seed): fully playable KEYBOARD-ONLY. WASD = move, Arrow keys =
// look/turn (period-authentic), Space = jump, Esc = pause. Mouse-look is an
// enhancement via pointer lock. Menus are keyboard-traversable with visible focus.

import * as THREE from 'three';
import { createWorldView } from './render/worldview.js';
import { createHud } from './render/hud.js';
import { paletteForSphere, actForSphere, SPHERE_COUNT } from './render/palettes.js';
import { createWorld, FixedStepper, stepOnce, resolveDraft, advanceSphere, applyDamage } from './sim/world.js';
import { createLook, applyLook } from './sim/look.js';
import { createCameraRig, updateAutoPitch } from './sim/camera.js';
import { serializeWorld, tryDeserialize } from './sim/save.js';
import { tuning } from './sim/tuning.js';
import { CAPRICES, CAPRICE_BY_ID } from './sim/caprices.js';
import { sanitizeMeta, runPool, bankTickets, unlockCaprice, canUnlock, unlockCost } from './sim/meta.js';
import { debugLog } from './engine/debuglog.js';
import { createSfx } from './engine/sfx.js';
import { createScore } from './engine/score.js';

const SAVE_KEY = 'capriole.save.v1';
const SETTINGS_KEY = 'capriole.settings.v1';
const PRESET_KEY = 'capriole.preset.v1';
const META_KEY = 'capriole.meta.v1';
const RUN_SEED = 1;

function loadMeta() {
  try { return sanitizeMeta(JSON.parse(localStorage.getItem(META_KEY))); } catch { return sanitizeMeta(null); }
}
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch {} }

function mountBanner() {
  const el = document.createElement('div');
  el.id = 'capriole-debug';
  el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;font:12px/1.4 monospace;color:#fff;padding:6px 10px;background:rgba(120,0,0,0.85);display:none;white-space:pre-wrap;max-height:40vh;overflow:auto;pointer-events:none';
  document.body.appendChild(el);
  debugLog.subscribe((e) => { if (e.level >= 2) { el.style.display = 'block'; el.textContent = debugLog.export().split('\n').slice(-12).join('\n'); } });
}
function mountBootChip() {
  const chip = document.createElement('div');
  chip.id = 'capriole-boot';
  // Sits above the sphere arrival card's plate so the two never overprint.
  chip.style.cssText = 'position:fixed;left:8px;bottom:96px;z-index:40;font:11px/1.3 monospace;color:#fff8;pointer-events:none';
  chip.textContent = 'CAPRIOLE — booting…';
  document.body.appendChild(chip);
  return chip;
}

function loadSettings() {
  const d = { tiltIntensity: tuning.camera.tiltIntensityDefault, fov: tuning.camera.fovDefault, sensitivity: tuning.camera.sensitivity, invertY: tuning.camera.invertY, screenShake: true, flashReduce: false, aimIndicator: true, volume: 0.7 };
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); return s ? { ...d, ...s } : d; } catch { return d; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

function boot() {
  const params = new URLSearchParams(location.search);
  const isProbe = params.has('probe');
  const isDemo = params.has('demo');
  const startSphere = Math.max(0, parseInt(params.get('sphere') || '0', 10) || 0); // proof: start on an enemy sphere
  const demoFire = params.has('fire'); // proof: demo also fires the firework secondary
  const stagedAimYaw = isProbe && params.has('aimYaw') ? Number(params.get('aimYaw')) : null;
  const bootChip = mountBootChip();
  mountBanner();
  window.addEventListener('error', (e) => debugLog.error('window', e.message || 'error', { stack: e.error && e.error.stack }));
  window.addEventListener('unhandledrejection', (e) => debugLog.error('promise', String(e.reason)));

  // NATIVE-RES BUFFER DISCIPLINE (ratified art direction). The world renders into a
  // small buffer and the browser upscales it with no smoothing, so every dither dot
  // and every strata band edge is a real, hard pixel. Antialiasing is OFF on purpose:
  // it is the exact opposite of the register. The HUD is a DOM overlay and stays
  // crisp at full resolution (contrast/legibility floor, seed M6).
  const NATIVE_H = 300;
  function nativeSize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    return { nw: Math.max(2, Math.round(NATIVE_H * (w / h))), nh: NATIVE_H };
  }

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: isProbe });
  renderer.setPixelRatio(1);
  {
    const { nw, nh } = nativeSize();
    renderer.setSize(nw, nh, false); // drawing buffer only — CSS below does the upscale
  }
  const canvasEl = renderer.domElement;
  canvasEl.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;image-rendering:crisp-edges';
  document.body.appendChild(canvasEl);

  const settings = loadSettings();
  let meta = loadMeta();                    // banked tickets + trunk + curated loadout (M4)
  const screenStage = params.get('screen'); // proof staging: draft | scorecard | victory | meta

  // Restore an autosaved run, or start fresh (loud fallback on corrupt save). Fresh runs draft
  // from the curated meta loadout pool (progression = curation).
  let world = null;
  if (!isProbe) { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) world = tryDeserialize(raw, debugLog); } catch {} }
  if (!world) world = createWorld(RUN_SEED, startSphere, [], runPool(meta));

  // Proof staging for the M4 screens (demo only): force the run into a draft / scorecard /
  // victory / meta state so the probe can capture that overlay.
  if (isDemo && screenStage) {
    if (screenStage === 'draft') advanceSphere(world); // clears sphere 0 → opens the draft
    else if (screenStage === 'scorecard') { world.spheresCleared = 4; world.sphereIndex = 4; applyDamage(world, 99, { x: 0, z: 1 }, true, 'swooper'); }
    else if (screenStage === 'victory') { world.spheresCleared = tuning.run.spheres - 1; world.sphereIndex = tuning.run.spheres - 1; advanceSphere(world); }
  }

  // Proof staging (demo on an enemy sphere): stand the player beside a grounded enemy and
  // face it, so the apex tip-down capture frames a bestiary billboard up close. Never runs
  // in normal play (isDemo only).
  let proofYaw = Number.isFinite(stagedAimYaw) ? stagedAimYaw : 0;
  if (isDemo && startSphere > 0 && world.enemies.length) {
    const target = world.enemies.find((e) => e.type === 'turret' || e.type === 'hopper') || world.enemies.find((e) => !e.boss) || world.enemies[0];
    if (target) {
      const isl = world.islands[target.island];
      const inward = Math.atan2(-isl.cz, -isl.cx); // toward origin, staying on the island
      const px = target.home.x + Math.cos(inward) * (isl.radius * 0.55);
      const pz = target.home.z + Math.sin(inward) * (isl.radius * 0.55);
      world.player.pos.x = px; world.player.pos.z = pz; world.player.pos.y = isl.topY;
      world.player.grounded = true;
      const dx = target.home.x - px, dz = target.home.z - pz;
      const n = Math.hypot(dx, dz) || 1;
      if (!Number.isFinite(stagedAimYaw)) proofYaw = Math.atan2(-dx / n, -dz / n); // forward basis (-sin,-cos) points at the enemy
    }
  }

  // Build the view at the current native buffer size so the sky plate and the
  // compositing plates are painted 1:1 with the pixels they land on.
  let view = createWorldView(world, undefined, nativeSize().nw, nativeSize().nh);
  view.setAspect(window.innerWidth / window.innerHeight);
  view.setFov(settings.fov);
  let lastSphereIndex = world.sphereIndex;

  // Rebuild the first-person view when the sim advances to a new sphere (fresh archipelago,
  // pods, and enemy roster) — disposes the old GPU resources (GPU-hygiene fold).
  function syncSphere() {
    if (world.sphereIndex === lastSphereIndex) return;
    lastSphereIndex = world.sphereIndex;
    const old = view;
    const { nw, nh } = nativeSize();
    view = createWorldView(world, undefined, nw, nh);
    view.setAspect(window.innerWidth / window.innerHeight);
    view.setFov(settings.fov);
    old.dispose();
    announceSphere();
  }

  // The sphere's identity card — its committed palette name, its act, and what kind
  // of sphere it is. Shown on arrival, then it gets out of the way.
  function announceSphere() {
    const i = world.sphereIndex | 0;
    const pal = paletteForSphere(i);
    const act = actForSphere(i);
    const kind = i === 0 ? 'TEACHING SPHERE' : (world.hasBoss ? 'BOSS GATE' : 'BESTIARY SPHERE');
    hud.setSphere({
      index: i, count: SPHERE_COUNT, name: pal.name,
      subtitle: `${kind} · ACT ${['I', 'II', 'III'][act] || 'I'}`,
      palette: pal,
    });
  }

  const look = createLook(0, 0);
  const camRig = createCameraRig();
  const stepper = new FixedStepper();

  // One gesture-unlocked AudioContext, two House Band buses: music and SFX. Keeping the
  // buses separate means a scene crossfade cannot fade an action cue, while the existing
  // Sound volume slider still controls both. Before a gesture both are silent/pending.
  const score = createScore({ seed: RUN_SEED });
  score.setVolume(settings.volume);
  score.setScene('title');
  let sfx = null;

  function unlockAudio() {
    if (isProbe) return false;
    score.enable(); score.resume();
    if (!sfx) {
      sfx = createSfx({ seed: RUN_SEED, ctx: score.context });
      sfx.setVolume(settings.volume);
      sfx.enable();
    } else sfx.resume();
    return score.enabled || !!(sfx && sfx.enabled);
  }

  let paused = false;
  let frozen = false; // probe-only: hold the sim still so a capture is reproducible
  const hud = createHud(settings, {
    onResume: () => setPaused(false),
    onSettings: () => {
      view.setFov(settings.fov);
      score.setVolume(settings.volume);
      if (sfx) sfx.setVolume(settings.volume);
      saveSettings(settings);
    },
    onRestart: () => startNewRun(),
  });

  function syncScoreForWorld() {
    if (world.phase === 'dead' || world.phase === 'victory') {
      score.setScene('scorecard');
      return;
    }
    const act = actForSphere(world.sphereIndex);
    const intensity = Math.min(1, act * 0.30 + (world.par ? world.par.hazardLevel * 0.42 : 0));
    score.setScene('play', { act, boss: !!world.hasBoss, intensity });
  }

  // Rebuild the view for a wholly new world (new run from the meta screen). Built at the
  // current native buffer size so the sky and the compositing plates land 1:1 on the pixels
  // they cover, and re-announces the sphere so the identity card fires on the new run.
  function rebuildView(w) {
    const old = view;
    const { nw, nh } = nativeSize();
    view = createWorldView(w, undefined, nw, nh);
    view.setAspect(window.innerWidth / window.innerHeight);
    view.setFov(settings.fov);
    old.dispose();
    lastSphereIndex = w.sphereIndex;
    announceSphere();
  }

  // Start a fresh ascent from the curated meta loadout (called from the meta screen after a
  // run ends). Deletes the old run save; the new run drafts from meta.runPool.
  function startNewRun() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    meta = loadMeta(); // pick up any unlocks bought on the meta screen
    world = createWorld(RUN_SEED, 0, [], runPool(meta));
    rebuildView(world);
    look.yaw = 0; look.pitch = 0;
    hud.hideScreen();
    lastPhase = 'play'; runBanked = false;
    syncScoreForWorld();
  }

  // ---- M4 phase orchestration: the sim owns the run phase ('play'|'draft'|'dead'|'victory');
  //      the browser reacts to each transition by opening the right carnival screen.
  let lastPhase = 'play', runBanked = false;
  const offerObjects = (ids) => ids.map((id) => {
    const c = CAPRICE_BY_ID[id];
    return { id, name: c.name, desc: c.desc, tier: c.tier };
  });

  function openDraftUI() {
    autosave(); // persist the draft so a mid-draft reload resumes on this offer
    score.setScene('title'); // gentler music-box interlude between climbing spheres
    hud.showDraft(offerObjects(world.draft.offer), {
      onPick: (i) => { resolveDraft(world, i); afterDraft(); },
      onSkip: () => { resolveDraft(world, -1); afterDraft(); },
    });
  }
  function afterDraft() {
    hud.hideScreen();
    syncSphere();       // the draft loaded the next sphere — rebuild the view
    lastPhase = 'play';
    syncScoreForWorld();
    autosave();
  }
  function openScorecardUI() {
    if (!runBanked) {
      meta = bankTickets(meta, world.scorecard); // tickets bank on death/victory
      saveMeta(meta);
      try { localStorage.removeItem(SAVE_KEY); } catch {} // run over — delete the run save (no scum)
      runBanked = true;
    }
    score.setScene('scorecard');
    hud.showScorecard(world.scorecard, { onContinue: openMetaUI });
  }
  function openMetaUI() {
    score.setScene('scorecard');
    const items = CAPRICES.map((c) => ({
      id: c.id, name: c.name, desc: c.desc, tier: c.tier,
      owned: meta.trunk.includes(c.id), cost: unlockCost(c.id), affordable: canUnlock(meta, c.id),
    }));
    hud.showMeta({ tickets: meta.tickets, items }, {
      onUnlock: (id) => { meta = unlockCaprice(meta, id); saveMeta(meta); openMetaUI(); },
      onStart: () => startNewRun(),
    });
  }
  function syncPhaseUI() {
    if (world.phase === lastPhase) return;
    lastPhase = world.phase;
    if (world.phase === 'draft') openDraftUI();
    else if (world.phase === 'dead' || world.phase === 'victory') { runBanked = false; openScorecardUI(); }
    else if (world.phase === 'play') { hud.hideScreen(); syncScoreForWorld(); }
  }

  // Proof staging for the meta screen (demo only): bank a few tickets and open the trunk.
  if (isDemo && screenStage === 'meta') { meta = { ...meta, tickets: 40 }; openMetaUI(); }

  function setPaused(v) { paused = v; hud.showPause(v); if (!v && !isProbe && document.pointerLockElement !== renderer.domElement) { /* stay unlocked until click */ } }

  // ---- Input.
  const keys = new Set();
  const DOWN = (e) => {
    if (!isProbe) unlockAudio(); // first gesture unlocks both House Band buses
    if (titlePending || presetPending) return; // menus own input; never leak movement through
    if (e.code === 'Escape') { setPaused(!paused); e.preventDefault(); return; }
    keys.add(e.code);
    if ([ 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space' ].includes(e.code)) e.preventDefault();
  };
  const UP = (e) => keys.delete(e.code);
  window.addEventListener('keydown', DOWN);
  window.addEventListener('keyup', UP);

  // Mouse-look via pointer lock (enhancement).
  renderer.domElement.addEventListener('click', () => { if (!isProbe) unlockAudio(); if (!paused && !titlePending && !presetPending && !isProbe) renderer.domElement.requestPointerLock(); });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === renderer.domElement && !paused) {
      applyLook(look, e.movementX, e.movementY, { sensitivity: settings.sensitivity, invertY: settings.invertY });
    }
  });
  document.addEventListener('pointerlockchange', () => { /* losing lock does not force-pause; Esc handles pause */ });

  // Required flow: title → first-boot-only comfort choice → play. Proof/demo modes bypass
  // boot UI unless explicitly staging `screen=title`.
  let titlePending = false;
  let presetPending = false;
  function beginAfterTitle() {
    unlockAudio();
    titlePending = false;
    hud.hideTitle();
    if (!isProbe && !localStorage.getItem(PRESET_KEY)) {
      presetPending = true;
      score.setScene('title');
      hud.showPresetChoice((choice) => {
      const p = tuning.presets[choice] || tuning.presets.standard;
      settings.tiltIntensity = p.tiltIntensity; settings.sensitivity = p.sensitivity; settings.screenShake = p.screenShake;
      saveSettings(settings); localStorage.setItem(PRESET_KEY, choice);
      presetPending = false; hud.hideMenu();
        syncScoreForWorld();
      });
    } else {
      syncScoreForWorld();
    }
  }

  const stageTitle = screenStage === 'title';
  if ((!isProbe && !isDemo) || stageTitle) {
    titlePending = true;
    score.setScene('title');
    hud.showTitle(paletteForSphere(SPHERE_COUNT - 1), beginAfterTitle);
  } else {
    // A staged meta proof is an overlay on a still-`play` world, so its gentler
    // scorecard take must win over the world's ascent scene.
    if (hud.screenVisible && hud.screenKind === 'meta') score.setScene('scorecard');
    else syncScoreForWorld();
  }

  function autosave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serializeWorld(world))); } catch {} }
  window.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });

  // Keyboard look + movement intent from the current key set.
  function readInput(dt) {
    // Look (arrow keys) — applied to `look`.
    const lx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const ly = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    if (lx || ly) applyLook(look, lx, ly, { rate: tuning.camera.keyLookRate * dt, sensitivity: 1, invertY: settings.invertY });
    // Move (WASD) — camera-relative in the sim via yaw.
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const jump = keys.has('Space');
    // Firework secondary: F (keyboard floor) or E. aimPitch tilts the shot with the look
    // pitch so you can pop an overhead swooper. The auto-pitch offset is camera-only; the
    // shot follows the player's own look pitch.
    const fire = keys.has('KeyF') || keys.has('KeyE');
    return { f, s, jump, fire, aimPitch: look.pitch, yaw: look.yaw };
  }

  // Scripted demo (deterministic LOOK proof): hop forward and triple-jump so a
  // capture shows the apex tip-down over the landing. No mouse synthesis needed.
  let demoHeld = false;
  function demoInput() {
    // Triple-jump roughly in place over the course with a gentle forward drift, so
    // the apex tip-down looks DOWN at a real island (blob shadow + landing ring
    // visible) instead of flying off into the void. Jump from the ground, then
    // again on each descent until the chain maxes (chainAtApex pattern).
    const p = world.player;
    let want = false;
    if (p.grounded) want = true;
    else if (p.jumpChain > 0 && p.jumpChain < tuning.jump.count && p.vel.y <= 0) want = true;
    const jump = want && !demoHeld;
    demoHeld = want;
    // Optionally pulse the firework so a proof shows a projectile + burst (fire on the rise).
    const fire = demoFire && (world.tick % 48 < 3) && p.vel.y > 0;
    // On an enemy-sphere proof, hop in place facing the staged enemy; else drift forward.
    const fwd = proofYaw ? 0 : 0.35;
    return { f: fwd, s: 0, jump, fire, aimPitch: 0, yaw: proofYaw };
  }

  const status = { booted: true, frames: 0, errors: () => debugLog.errorCount, exportLog: () => debugLog.export(),
    state: () => ({ tick: world.tick, y: world.player.pos.y, chain: world.player.jumpChain, tilt: camRig.tilt,
      enemiesOnScreen: view.enemiesOnScreen, islandsOnScreen: view.islandsOnScreen,
      hp: world.hp, dead: world.dead,
      phase: world.phase, tickets: meta.tickets, caprices: world.caprices.length,
      screen: hud.titleVisible ? 'title' : (hud.screenVisible ? hud.screenKind : null),
      music: score.track,
      player: { x: world.player.pos.x, y: world.player.pos.y, z: world.player.pos.z, yaw: world.player.yaw },
      aimDistance: world.tune.firework.indicatorDistance,
      eyeHeight: world.tune.camera.eyeHeight,
      aimIndicator: view.aimIndicator ? { ...view.aimIndicator } : null }) };
  // Probe-only sim FREEZE. Without it a capture is not actually pinned to a tick:
  // waiting for tick N and then screenshotting lets the sim run on for the whole
  // duration of the screenshot, so two runs capture two different moments (this is
  // how a transient damage-rim flash landed in one art proof and not its pair).
  // Rendering continues while frozen, so the frame is still live — just still.
  status.freeze = (v = true) => { if (isProbe) frozen = !!v; return frozen; };
  window.__capriole = status;

  let last = performance.now();
  let sinceSave = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    debugLog.guard('frame', () => {
      syncPhaseUI(); // open/close the draft / scorecard / meta screen on a phase transition
      // `!frozen` is the art probe's reproducibility hold (probe-only; see status.freeze).
      const active = !paused && !titlePending && !presetPending && world.phase === 'play' && !hud.screenVisible && !frozen;
      if (active) {
        const input = isDemo ? demoInput() : readInput(dt);
        if (isDemo) look.yaw = input.yaw;
        stepper.advance(world, dt, input);
        if (sfx) sfx.fromWorld(world); // audible action-legibility hooks (reads event flags)
        score.setIntensity(Math.min(1, actForSphere(world.sphereIndex) * 0.30 + world.par.hazardLevel * 0.42));
        syncSphere(); // rebuild the view if the sim advanced to a new sphere
        debugLog.setTick(world.tick);
        // Auto-pitch offset (downward degrees) → radians; compose onto look pitch.
        const tiltDeg = updateAutoPitch(camRig, world.player, dt, settings.tiltIntensity);
        const composedPitch = look.pitch - tiltDeg * Math.PI / 180;
        view.update({ yaw: look.yaw, pitch: composedPitch, aimPitch: look.pitch, showAimIndicator: settings.aimIndicator }, world.time);
        // HUD — pods + par + HP/economy now all live from the sim (M2 loop + M3 combat).
        const parUsed = Math.min(1, world.par.elapsed / world.par.base);
        hud.update({
          hp: world.hp, maxHp: world.hpMax,
          pods: world.podsCollected, maxPods: tuning.pods.perSphere,
          parFrac: parUsed, parWarn: world.par.warn,
          jumpChain: world.player.jumpChain, jumpMax: tuning.jump.count,
          landing: view.landingScreen,
          podArrow: view.podScreen,
          ammo: world.firework.ammo, ammoMax: tuning.firework.ammoMax,
          chain: world.stompChain,
          boss: view.bossInfo,
          damaged: world.damagedThisTick, hitDir: world.hitDir,
          flashReduce: settings.flashReduce,
          dead: world.dead,
          caprices: world.caprices.map((id) => (CAPRICE_BY_ID[id] ? CAPRICE_BY_ID[id].name : id)),
          // Per-sphere elapsed SIM seconds — drives the sphere card's hold/fade off the
          // fixed-timestep clock, so a proof capture at tick N always sees the same thing.
          sphereElapsed: world.par.elapsed,
          dt,
        });
        sinceSave += dt; if (sinceSave > 1 && !world.dead) { sinceSave = 0; autosave(); }
      }
      view.render(renderer); // lit world + the compositing plates, never half-applied
    });
    status.frames++;
    if (status.frames === 1) bootChip.textContent = 'CAPRIOLE — M5 minimal  ·  title + House Band score  ·  Esc options';
    requestAnimationFrame(frame);
  }

  // Resize: the cheap parts (buffer size, aspect) apply immediately; repainting the sky
  // and the compositing plates is debounced, because each repaint is a per-pixel fbm pass
  // and a drag-resize fires this continuously.
  let repaintTimer = 0;
  window.addEventListener('resize', () => {
    const { nw, nh } = nativeSize();
    renderer.setSize(nw, nh, false);
    view.setAspect(window.innerWidth / window.innerHeight);
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => { const s = nativeSize(); view.setBufferSize(s.nw, s.nh); }, 140);
  });
  announceSphere();
  requestAnimationFrame(frame);
  if (!world.validSphere) debugLog.error('gen', `sphere ${world.sphereIndex} served without a proven-reachable layout — investigate generator bands`);
  debugLog.info('boot', 'CAPRIOLE M5-minimal booted');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

export { boot };
