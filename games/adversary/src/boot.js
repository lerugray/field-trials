// boot.js — M3 playable: the Stage 1 vertical slice. Scrolling stage (tiles, enemies, boss, drops),
// player core, the action menu (pauses play), HUD, and floaters. Code-drawn art; placeholder names;
// monospace UI text. This is what the operator double-clicks (dist/index.html).

import { createFixedStepper } from './core/loop.js';
import { resolveActions, createInputState, ACTIONS, loadBindings, serializeBindings } from './core/input.js';
import { createRenderer, LOGICAL_W, LOGICAL_H } from './render/canvas.js';
import { PALETTE } from './render/palette.js';
import { createStage, stepStage, deriveIntent } from './sim/stage.js';
import { toggleMenu, closeMenu, moveTab, moveCursor, confirm } from './sim/menu.js';
import {
  animationContactSnapshot, drawAnimationProofStrip, drawStage, groundContactSnapshot,
  setProofPresentationFreeze, setProofPresentationTick,
} from './render/stagerender.js';
import { drawMenu } from './render/menurender.js';
import {
  WAYPOINT_FLOATER_KIND, bottomHudLayout, bottomHudModel, drawBottomHud, drawHud, drawMarkerLabel,
  floaterRenderModel, markerLabelModel,
} from './render/hud.js';
import { drawOpaqueScrimPanel } from './render/chrome.js';
import { loadAssets } from './render/assets.js';
import { KIT_MOVES } from './sim/kit.js';
import { uniqueDef } from './sim/uniques.js';
import { createMemoryStorage, serializeSave, writeSave, readSave, applySave } from './sim/save.js';
import { CAMPAIGN_NODES } from './content/campaign.js';
import {
  createCampaign, isBranch, branchOptions, chooseBranch, currentStageDef, currentNode,
  advanceCampaign, isCampaignComplete, carryOver,
} from './sim/campaign.js';
import { createSettings, setAssist } from './sim/settings.js';
import { assembleSideStage } from './sim/sidemode.js';
import { createAudio } from './audio/sfx.js';
import { PIXEL_GLYPH_HEIGHT, drawPixelText, textWidth, wrapPixelText } from './render/pixelfont.js';
import { lightStatsSnapshot } from './render/light.js';

const SAVE_KEY = 'adversary.run';

function drawCenteredPixelText(ctx, text, centerX, baselineY, color, scale = 1) {
  const width = textWidth(text, scale);
  const centeredX = Math.round(centerX - width / 2);
  const x = Math.max(2, Math.min(LOGICAL_W - 2 - width, centeredX));
  const y = Math.round(baselineY - PIXEL_GLYPH_HEIGHT * scale);
  drawPixelText(ctx, text, x, y, color, scale);
}

export function boot(displayCanvas) {
  const renderer = createRenderer(displayCanvas);
  const { ctx } = renderer;
  const stepper = createFixedStepper();
  const input = createInputState();

  // Persistent storage: localStorage in the browser, in-memory otherwise.
  const storage = (typeof localStorage !== 'undefined') ? localStorage : createMemoryStorage();
  const campaign = createCampaign(CAMPAIGN_NODES);
  const settings = createSettings();
  const audio = createAudio();
  // Kick off loading of curated art assets (base64 data URIs). First frames may fall back to
  // code-drawn sprites until images complete; tests run headless and Image is absent, so this is a
  // no-op there.
  loadAssets();
  // Load persisted key/gamepad bindings (remap survives reloads).
  let bindings;
  try { bindings = loadBindings(JSON.parse(storage.getItem('adversary.binds'))); } catch { bindings = loadBindings(null); }
  let mode = 'play'; // 'play' | 'fork' | 'campaign-clear' | 'pause'
  let forkCursor = 0;
  let pauseCursor = 0;
  let sideActive = false;   // running a sandboxed side-mode stage
  let sideSeed = 1;
  let proofFreeze = false;

  function makeStage(def) { return createStage(def, { seed: 'run', vw: LOGICAL_W, vh: LOGICAL_H, settings }); }
  function autosave() {
    if (sideActive) return; // side runs are sandboxed — never touch the campaign save
    try {
      writeSave(storage, SAVE_KEY, { ...serializeSave(stage), campaignIndex: campaign.index, taken: [...campaign.taken], choice: campaign.choice, assist: settings.assist });
    } catch { /* storage full/blocked */ }
  }
  function loadRun() {
    const { save } = readSave(storage, SAVE_KEY);
    if (save && typeof save.campaignIndex === 'number') {
      campaign.index = save.campaignIndex;
      campaign.taken = save.taken || [];
      campaign.choice = save.choice || null;
      if (save.assist) setAssist(settings, true);
    }
    if (isBranch(campaign) && !campaign.choice) { mode = 'fork'; return makeStage(CAMPAIGN_NODES[0].stage); }
    const def = currentStageDef(campaign) || CAMPAIGN_NODES[0].stage;
    const st = makeStage(def);
    if (save) applySave(st, save);
    return st;
  }
  // Advance to the next stage, carrying the run; open the fork if the next node branches.
  function toNextStage() {
    const prev = stage;
    advanceCampaign(campaign);
    if (isCampaignComplete(campaign)) { mode = 'campaign-clear'; return; }
    if (isBranch(campaign)) { mode = 'fork'; forkCursor = 0; lastPersistent = prev; autosave(); return; }
    stage = makeStage(currentStageDef(campaign));
    carryOver(prev, stage);
    mode = 'play'; autosave();
  }
  function restartRun() {
    campaign.index = 0;
    campaign.taken = [];
    campaign.choice = null;
    sideActive = false;
    // TRUE new run: supersede the autosave before loadRun can resurrect the finished run.
    // This matches the death/rest save discipline — the persistent slot is the source of truth,
    // so clearing it forces a fresh Stage 1.
    try {
      storage.removeItem(SAVE_KEY);
      storage.removeItem(SAVE_KEY + '.bak');
    } catch { /* storage blocked */ }
    stage = loadRun();
    mode = 'play';
    audio.musicCue('stage');
  }
  function chooseFork(side) {
    chooseBranch(campaign, side);
    const next = makeStage(currentStageDef(campaign));
    if (lastPersistent) carryOver(lastPersistent, next);
    stage = next; mode = 'play'; autosave();
  }
  // Side mode: swap to a sandboxed procedural run (nothing saved); exit restores the campaign.
  function launchSide() {
    sideSeed++;
    sideActive = true;
    stage = createStage(assembleSideStage(sideSeed), { seed: `side${sideSeed}`, vw: LOGICAL_W, vh: LOGICAL_H, settings });
    mode = 'play'; audio.musicCue('sidemode');
  }
  function exitSide() { sideActive = false; stage = loadRun(); mode = 'play'; audio.musicCue('stage'); }
  const pauseActions = [
    () => { setAssist(settings, !settings.assist); autosave(); },
    () => { settings.reduceEffects = !settings.reduceEffects; },
    () => { settings.muted = !settings.muted; audio.setMuted(settings.muted); },
    () => { sideActive ? exitSide() : launchSide(); },
    () => { mode = 'play'; },
  ];
  function pauseOptions() {
    return [
      `Assist: ${settings.assist ? 'ON' : 'OFF'}`,
      `Reduce effects: ${settings.reduceEffects ? 'ON' : 'OFF'}`,
      `Sound: ${settings.muted ? 'OFF' : 'ON'}`,
      sideActive ? 'Exit side run' : 'Start side run',
      'Resume',
    ];
  }

  let lastPersistent = null;
  let stage = loadRun();
  audio.musicCue('stage');
  const floaters = [];
  let movePrompt = null; // { text, ticks } — move-discovery first-use prompt banner

  const keysDown = new Set();
  window.addEventListener('keydown', (e) => {
    keysDown.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keysDown.delete(e.code));
  function readGamepad() {
    if (!navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p) return { buttons: p.buttons.map((b) => b.pressed), axes: p.axes };
    return null;
  }
  const fit = () => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', fit);
  fit();

  function pushFloater(x, y, txt, col, life = 44, kind = null) {
    const floater = { x, y, txt, col, life };
    if (kind) floater.kind = kind;
    floaters.push(floater);
  }

  function simTick(_dt, tick) {
    const acts = resolveActions({ keys: keysDown, pad: readGamepad() }, bindings);
    input.update(acts, tick);

    // Fork screen: choose the left/right path (explicit on-screen choice).
    if (mode === 'fork') {
      if (input.pressed(ACTIONS.LEFT)) forkCursor = 0;
      if (input.pressed(ACTIONS.RIGHT)) forkCursor = 1;
      if (input.pressed(ACTIONS.CONFIRM) || input.pressed(ACTIONS.JUMP) || input.pressed(ACTIONS.ATTACK)) {
        chooseFork(forkCursor === 0 ? 'left' : 'right');
      }
      return;
    }
    if (mode === 'campaign-clear') {
      if (input.pressed(ACTIONS.JUMP) || input.pressed(ACTIONS.CONFIRM) || input.pressed(ACTIONS.ATTACK)) {
        restartRun();
      }
      return;
    }

    // Pause overlay (assist toggle + side-run launch) — surfaced via the PAUSE button.
    if (mode === 'pause') {
      const n = pauseActions.length;
      if (input.pressed(ACTIONS.UP)) pauseCursor = (pauseCursor + n - 1) % n;
      if (input.pressed(ACTIONS.DOWN)) pauseCursor = (pauseCursor + 1) % n;
      if (input.pressed(ACTIONS.CONFIRM) || input.pressed(ACTIONS.JUMP) || input.pressed(ACTIONS.ATTACK)) {
        pauseActions[pauseCursor]();
      }
      if (input.pressed(ACTIONS.PAUSE) || input.pressed(ACTIONS.CANCEL)) mode = 'play';
      return;
    }
    if (input.pressed(ACTIONS.PAUSE)) { mode = 'pause'; pauseCursor = 0; return; }

    const m = stage.menu;

    // Menu toggles + navigation (pauses play while open).
    if (input.pressed(ACTIONS.MENU)) { toggleMenu(m); return; }
    if (m.open) {
      if (input.pressed(ACTIONS.CANCEL)) { closeMenu(m); return; }
      if (input.pressed(ACTIONS.UP)) moveCursor(m, -1, stage);
      if (input.pressed(ACTIONS.DOWN)) moveCursor(m, 1, stage);
      if (input.pressed(ACTIONS.LEFT)) moveTab(m, -1);
      if (input.pressed(ACTIONS.RIGHT)) moveTab(m, 1);
      if (input.pressed(ACTIONS.ATTACK) || input.pressed(ACTIONS.CONFIRM)) {
        const ev = confirm(m, stage);
        if (ev && ev.type === 'use-item' && ev.healed) pushFloater(stage.player.x, stage.player.y - 28, `+${ev.healed}`, 'e', 40);
      }
      return; // paused
    }

    // Cleared a stage → exit a side run, or advance the campaign (fork or next stage).
    if (stage.cleared && input.pressed(ACTIONS.JUMP)) { sideActive ? exitSide() : toNextStage(); return; }

    const intent = deriveIntent(input);
    const wasGround = stage.player.onGround;
    const events = stepStage(stage, intent);
    if (intent.jumpPressed && wasGround) audio.play('jump');
    for (const e of events) {
      audio.playEvent(e.type, e.move);
      if (e.type === 'clear') audio.musicCue('clear');
      if (e.type === 'hit') pushFloater(stage.player.x + stage.player.facing * 14, stage.player.y - 20, `-${e.dmg}`, '5', 30);
      else if (e.type === 'hurt') pushFloater(stage.player.x, stage.player.y - 30, `-${e.dmg}`, 'g', 34);
      else if (e.type === 'kill') pushFloater(stage.player.x, stage.player.y - 30, `+${e.xp}xp`, 'c', 40);
      else if (e.type === 'boss-defeat') pushFloater(stage.player.x, stage.player.y - 34, `+${e.xp}xp`, 'c', 60);
      else if (e.type === 'levelup') pushFloater(stage.player.x, stage.player.y - 40, `LEVEL ${e.to}!`, 'e', 70);
      else if (e.type === 'pickup') pushFloater(stage.player.x, stage.player.y - 28, 'ITEM', 'b', 36);
      else if (e.type === 'checkpoint') {
        pushFloater(stage.player.x, stage.player.y - 34, 'WAYPOINT', 'c', 50, WAYPOINT_FLOATER_KIND);
        autosave();
      }
      else if (e.type === 'rest') { pushFloater(stage.player.x, stage.player.y - 34, 'RESTED', 'e', 50); autosave(); }
      else if (e.type === 'respawn') autosave();
      else if (e.type === 'recover') pushFloater(stage.player.x, stage.player.y - 34, `+${e.xp}xp RECOVERED`, 'e', 60);
      else if (e.type === 'forfeit') pushFloater(stage.player.x, stage.player.y - 40, `${e.xp}xp LOST`, 'g', 60);
      else if (e.type === 'unlock') {
        const mv = KIT_MOVES.find((k) => k.id === e.move);
        pushFloater(stage.player.x, stage.player.y - 40, `NEW MOVE!`, 'c', 80);
        movePrompt = { text: mv ? `${mv.name.toUpperCase()} — ${mv.input}` : 'NEW MOVE', ticks: 300 };
        autosave();
      }
      else if (e.type === 'unique-drop') {
        // M11: an acquisition the player can't miss — a UNIQUE! floater + a banner naming the weapon
        // and its rule bend (same register as the NEW MOVE! discovery prompt). It's now in the
        // WEAPONS tab of the action menu, where the equip-comparison delta already surfaces.
        const u = uniqueDef(e.id);
        pushFloater(stage.player.x, stage.player.y - 44, 'UNIQUE!', 'e', 90);
        movePrompt = { text: u ? `${u.name.toUpperCase()} — ${u.rule}` : 'UNIQUE WEAPON', ticks: 360 };
        autosave();
      }
      else if (e.type === 'clear') autosave();
    }
    if (movePrompt && --movePrompt.ticks <= 0) movePrompt = null;
    for (const f of floaters) { f.y -= 0.3; f.life--; }
    for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
  }

  // A simple progress map: node dots left→right, current lit, the taken path filled.
  function drawProgressMap(cx, cy) {
    const labels = CAMPAIGN_NODES.map((n) => n.id.toUpperCase());
    const gap = 26; const x0 = cx - (labels.length - 1) * gap / 2;
    for (let i = 0; i < labels.length; i++) {
      const done = i < campaign.index;
      const cur = i === campaign.index;
      ctx.fillStyle = cur ? PALETTE['c'] : done ? PALETTE['e'] : PALETTE['7'];
      ctx.fillRect(x0 + i * gap - 3, cy - 3, 6, 6);
      if (i < labels.length - 1) { ctx.fillStyle = PALETTE['8']; ctx.fillRect(x0 + i * gap + 3, cy - 1, gap - 6, 2); }
      drawCenteredPixelText(ctx, labels[i], x0 + i * gap, cy + 14, cur ? PALETTE['c'] : PALETTE['j']);
    }
  }

  function drawFork() {
    ctx.fillStyle = 'rgba(8,8,20,0.85)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // Opaque carved scrim so the body text (and the confirm-key hint) clears the legibility floor.
    drawOpaqueScrimPanel(ctx, 20, 36, LOGICAL_W - 40, 182, { dither: true });
    const opts = branchOptions(campaign) || [];
    drawCenteredPixelText(ctx, 'CHOOSE YOUR PATH', LOGICAL_W / 2, 60, PALETTE['5'], 2);
    for (let i = 0; i < opts.length; i++) {
      const sel = i === forkCursor;
      const bx = i === 0 ? LOGICAL_W * 0.28 : LOGICAL_W * 0.72;
      ctx.fillStyle = sel ? PALETTE['c'] : PALETTE['8'];
      ctx.fillRect(bx - 44, 90, 88, 40);
      drawCenteredPixelText(ctx, i === 0 ? '< LEFT' : 'RIGHT >', bx, 108, sel ? PALETTE['0'] : PALETTE['j']);
      drawCenteredPixelText(ctx, opts[i].label, bx, 122, PALETTE['j']);
    }
    drawCenteredPixelText(ctx, '←/→ choose   K confirm', LOGICAL_W / 2, 160, PALETTE['j']);
    drawProgressMap(LOGICAL_W / 2, 196);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(8,8,20,0.85)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // Taller panel keeps the art-credit lines inside the slab instead of floating below it.
    drawOpaqueScrimPanel(ctx, 36, 28, LOGICAL_W - 72, 190, { dither: true });
    const pauseTitle = sideActive ? 'SIDE RUN — PAUSED' : 'PAUSED';
    const titleScale = textWidth(pauseTitle, 2) <= LOGICAL_W - 96 ? 2 : 1;
    drawCenteredPixelText(ctx, pauseTitle, LOGICAL_W / 2, 50, PALETTE['5'], titleScale);
    const opts = pauseOptions();
    for (let i = 0; i < opts.length; i++) {
      const sel = i === pauseCursor;
      drawCenteredPixelText(ctx, (sel ? '> ' : '  ') + opts[i], LOGICAL_W / 2, 74 + i * 16, sel ? PALETTE['c'] : PALETTE['j']);
    }
    drawCenteredPixelText(ctx, 'ASSIST: XP NEVER DROPS', LOGICAL_W / 2, 158, PALETTE['j']);
    drawCenteredPixelText(ctx, 'LONGER I-FRAMES · SAME DROPS', LOGICAL_W / 2, 168, PALETTE['j']);
    drawCenteredPixelText(ctx, '↑↓ select   K confirm   Esc resume', LOGICAL_W / 2, 184, PALETTE['j']);
    drawCenteredPixelText(ctx, 'Art: Willibab / Monsteretrope', LOGICAL_W / 2, 200, PALETTE['5']);
    drawCenteredPixelText(ctx, 'Anokolisa / Admurin · see manifest', LOGICAL_W / 2, 212, PALETTE['5']);
  }

  function drawCampaignClear() {
    ctx.fillStyle = 'rgba(8,8,20,0.85)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // Extend the panel down so the progress map sits on the same carved slab as the clear text.
    drawOpaqueScrimPanel(ctx, 36, 60, LOGICAL_W - 72, 140, { dither: true });
    drawCenteredPixelText(ctx, 'CAMPAIGN CLEAR', LOGICAL_W / 2, 92, PALETTE['c'], 2);
    drawCenteredPixelText(ctx, 'THANKS FOR PLAYING', LOGICAL_W / 2, 112, PALETTE['j']);
    drawCenteredPixelText(ctx, 'PRESS K TO START A NEW RUN', LOGICAL_W / 2, 132, PALETTE['j']);
    drawProgressMap(LOGICAL_W / 2, 180);
  }

  function render() {
    if (mode === 'fork') { drawFork(); return; }
    if (mode === 'pause') { drawStage(ctx, stage, LOGICAL_W, LOGICAL_H); drawHud(ctx, stage, LOGICAL_W); drawPause(); return; }

    drawStage(ctx, stage, LOGICAL_W, LOGICAL_H);

    // Campaign completion gets its own readable overlay; no gameplay HUD on top.
    if (mode === 'campaign-clear') { drawCampaignClear(); return; }

    // Reserve the exact persistent-bar footprint before drawing the contextual waypoint plate.
    // This keeps the world-adjacent label compact while guaranteeing the two chrome surfaces do
    // not collide, including the taller repeated-death assistance state.
    const bottomHints = bottomHudModel(mode, stage);
    const markerLabel = mode === 'play' && !stage.cleared ? markerLabelModel(stage) : null;

    // Floaters (camera-relative).
    for (const f of floaterRenderModel(floaters, markerLabel)) {
      drawCenteredPixelText(ctx, f.txt, Math.round(f.x - stage.camera.x), Math.round(f.y - stage.camera.y), PALETTE[f.col]);
    }

    // The plate owns waypoint feedback while visible; other transient feedback keeps its existing
    // draw order beneath the plate.
    if (markerLabel) {
      const bottomHudY = bottomHudLayout(LOGICAL_W, LOGICAL_H, bottomHints.length).y;
      drawMarkerLabel(ctx, markerLabel, LOGICAL_W, bottomHudY);
    }

    drawHud(ctx, stage, LOGICAL_W);

    // Objective / prompts.
    if (stage.cleared) {
      const label = sideActive ? 'SIDE RUN' : currentNode(campaign).label;
      drawCenteredPixelText(ctx, `${label} CLEAR — press K to continue`, LOGICAL_W / 2, LOGICAL_H / 2, PALETTE['e']);
    } else {
      drawBottomHud(ctx, bottomHints, LOGICAL_W, LOGICAL_H);
    }
    // Indicators (top-left of play area, under the HUD).
    if (settings.assist) drawPixelText(ctx, 'ASSIST', 6, 58, PALETTE['e']);
    if (sideActive) drawPixelText(ctx, 'SIDE RUN', 6, 66, PALETTE['b']);

    // Move-discovery first-use prompt banner.
    if (movePrompt) {
      const lines = wrapPixelText(movePrompt.text, LOGICAL_W - 12);
      const contentH = lines.length * PIXEL_GLYPH_HEIGHT + (lines.length - 1) * 2;
      const bannerY = 60;
      ctx.fillStyle = 'rgba(20,20,40,0.8)';
      ctx.fillRect(0, bannerY, LOGICAL_W, contentH + 6);
      for (let i = 0; i < lines.length; i++) {
        drawCenteredPixelText(ctx, lines[i], LOGICAL_W / 2, bannerY + 3 + PIXEL_GLYPH_HEIGHT + i * 8, PALETTE['c']);
      }
    }

    if (stage.menu.open) drawMenu(ctx, stage.menu, stage, LOGICAL_W, LOGICAL_H);
  }

  let last = performance.now();
  function frame(now) {
    const elapsed = (now - last) / 1000;
    last = now;
    if (!proofFreeze) stepper.advance(elapsed, simTick);
    render();
    renderer.present();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (typeof window !== 'undefined') {
    window.__stage = () => stage;          // debug/smoke handle
    window.__campaign = campaign;
    window.__toNext = toNextStage;
    window.__mode = () => mode;
    window.__floaters = () => floaters.map((f) => ({ ...f })); // proof/read-only render state
    window.__groundContacts = groundContactSnapshot; // proof/read-only opaque-bottom measurements
    window.__drawAnimationStrip = drawAnimationProofStrip; // proof-only operator certification surface
    window.__animationContacts = animationContactSnapshot;
    // Debug/proof: jump straight to any campaign stage def so captures can show each theme without
    // playing through. Accepts a stage def (e.g. CAMPAIGN_NODES[i].stage or a branch stage).
    window.__loadStageDef = (def) => { stage = makeStage(def); mode = 'play'; sideActive = false; return stage; };
    window.__render = render; // proof-only: draw the current stage once without stepping
    window.__proofFreeze = (on = true) => {
      proofFreeze = !!on;
      setProofPresentationFreeze(proofFreeze);
    }; // proof-only: stable matched simulation + presentation frames
    window.__proofRenderTick = setProofPresentationTick; // proof-only: deterministic authored frame
    window.__presentationView = (s) => STAGE_PRESENTATION.get(s);
    window.__lightStats = lightStatsSnapshot; // proof/read-only compositor timing + readback count
    window.__logicalBuffer = renderer.buffer; // proof/read-only native frame for exact pixel audits
    window.__nodes = CAMPAIGN_NODES;
    window.__pause = () => { mode = 'pause'; pauseCursor = 0; };
    window.__restartRun = restartRun;
  }
  return { get stage() { return stage; }, stepper, input };
}

if (typeof document !== 'undefined') {
  const start = () => { const c = document.getElementById('screen'); if (c) boot(c); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
