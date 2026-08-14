// main.js — BOOT + march + autosave/resume + auto-combat playback (DESIGN-SEED
// M1–M2). The only DOM-aware module; it drives the pure engine + resolver and
// renders. Combat is precomputed deterministically (combat.js) then PLAYED BACK
// beat-by-beat over licensed battler art — action-legibility law: every attack,
// heal, and death is visible the moment its mechanic resolves. Attrition persists
// (party HP mutates in the fight and carries onto the road).
//
// Input parity (milestone floor) holds on every surface: speed/pause reachable by
// keyboard (←→, Space, H) and mouse throughout; docket/defeat controls by Tab/
// Enter and click, with an OUTLINE focus ring.

import { TUNING, clampSpeedIndex, speedAt } from './tuning.js';
import { DebugLog, installGlobalHandlers } from './debuglog.js';
import { createMarch, step } from './engine.js';
import { makeSave, parseSave, parseSaveRecord, applySave, createStorage, createRunId, invalidateLegacySaves, makeClosedSave, SAVE_KEY, RUN_CLOSED } from './save.js';
import { createParty, isWiped, livingFrames, changeJob, campRest, earnGold, equipItem, unequipSlot } from './party.js';
import { createMandate, isTerminus, legsRemaining, dischargeReward } from './mandate.js';
import { META_KEY, parseMeta, masteryMultByJob, createRunMastery, earnMastery, masteryLevel, recordHistory, isRunClosed } from './meta.js';
import { closeExpedition } from './run.js';
import { createLedger, recordRoute, recordMatter, recordMissedWindow, recordReduction, recordCredit, composeReport } from './report.js';
import { startingBonuses, escalationLevel, escalationMult, totalMastery, newlyEarned, certificationState } from './certifications.js';
import { legIsStale, bumpStreak, noProgress } from './progress.js';
import { generateShop, buyLine, sellItem, resupply, isTownLeg } from './shop.js';
import { getItem, modsLine, sellValue, SLOTS } from './items.js';
import { generateBranches } from './route.js';
import { makeEnemies, initCombat, stepCombat, applyCard, evaluateCard, WINDOW_LABEL } from './combat.js';
import { JOBS, JOB_IDS, DEFAULT_PARTY } from './jobs.js';
import { createDeck, drawUp, playFromHand, discardHand, addCard, removeCard, getCard, cardPlateName, STARTING_DECK, CARD_IDS } from './deck.js';
import { BATTLER, battlerForJob, battlerForEnemy, TAROT_FRAME, ICON, ICON_FRAME, ICONSET_KEY, TILE_FRAME, OVERWORLD_KEY, TERRAIN_TILE, TOWN_KEY, TOWN_TILE } from './art.js';
import { PALETTE } from './palette.js';
import { simulateCVD } from './legibility.js';
import { createBand } from './band.js';
import { registerScore, trackForScreen } from './score.js';
import { installSoak } from './soak.js';
import { pixelText, pixelTextWidth, setType } from './pixel-font.js';
import { wrapLinesNoEllipsis, wrapLines, truncateText } from './text-wrap.js';
import { PLAYER_CREDITS } from './credits.js';
import { CONTROL_BAND_Y, CONTENT_TEXT_MAX_Y, contentTextY, TEXT_LEADING, CORE_TEXT_HEIGHT, MIN_INTERLINE_GAP, findTightInterlineGaps, computeDisplayFit, pointerToNative, presentBackingSize, DRAFT_TILE, draftTileX } from './layout.js';
import { TITLE_NAME, TITLE_TAG, TITLE_SUB, TITLE_BATTLERS, TITLE_TAROT, HOWTO_PAGES, titleMenuRects, howtoMenuRects, TITLE_BAND, titlePartyX, titleHandX } from './title-layout.js';
import { ROLE, drawChip, drawPanel, drawPointer, panelLabel, drawTopBar, shade, CHIP_H } from './ui.js';

const VW = 320, VH = 200;
const COMBAT_STATUS_W = 140; // owned left column — party roster begins x=156
const CAMP_ROW = 16; // name + stats share a row; pitch clears the leading floor
/**
 * First content row below the masthead. The masthead is now ONE 16px band
 * (bar + rule) rather than a name row, a rule and a subtitle row, so every
 * screen's content starts 14px higher — which is exactly where the real font's
 * taller line box (8 rows, leading 11) gets its room from.
 */
const AFTER_MASTHEAD_Y = 22;
const CONTENT_Y = AFTER_MASTHEAD_Y + TEXT_LEADING + 2; // below a screen's intro line
const CAMP_PANEL_Y = CONTENT_Y + TEXT_LEADING * 2 + 4; // intro ≤2 + detail 1
const ROUTE_CARD_Y = CONTENT_Y + TEXT_LEADING * 2 + 4; // intro 2 + supplies 1 + gap
const SHOP_FRAME_PITCH = TEXT_LEADING + CORE_TEXT_HEIGHT + MIN_INTERLINE_GAP; // name + stats stack
const SHOP_BUY_PITCH = TEXT_LEADING + MIN_INTERLINE_GAP; // one instrument line per buy row

/**
 * THE PARTY PANEL's stat line (Ray's ratified option B, 2026-08-14).
 *
 * History: the line first read `a19 d7 m4` — single letters welded to figures,
 * the founding violation of the legibility law. That was replaced by a ledger
 * (the labels spelled once as a column header, bare figures right-aligned
 * beneath), and Ray read THAT as uninterpretable numbers too: a header three
 * rows above a figure is not a label at the point of reading.
 *
 * So the column reports ONE labelled figure per frame, and reports the one that
 * is decision-relevant. At rest that is `hp 43/43` — the same fact for every
 * frame, and the only one that means anything before an item is under
 * consideration. The moment a purchasable item takes focus or hover, every
 * frame's line becomes the stat THAT item moves, with the figure it would
 * become: `mag 4 > 7`. The target is replacement-aware — swapping a better
 * item out shows the LOSS in the danger colour rather than hiding it.
 *
 * Only 68px separates the party names from the slot chips, which is why the
 * spelled three-stat line never fitted (`atk 99 def 99 mag 99` = 88px). One
 * labelled delta is 52px at its widest (`atk 199 > 199`), so it fits with room.
 */
const SHOP_STAT_KEYS = ['atk', 'def', 'mag'];
/** The x-span the party column owns: names start at 166, the slot chips at 236. */
const STAT_ZONE_X = 166;
const STAT_ZONE_W = 68;
/** Frames start directly under the panel label — option B has no header row. */
const SHOP_FRAME_Y0 = AFTER_MASTHEAD_Y + TEXT_LEADING;
/**
 * Where the detail band sits, and the first row the STORES block may occupy.
 * The renderer AND the control builder both read these, so the two can never
 * disagree about the bottom of the board: dropping the stat header lifted the
 * party column by a row, which is exactly the move that walks the stores row
 * up into the detail band if the two are computed in separate places.
 */
function shopDetailY(lineCount) {
  return AFTER_MASTHEAD_Y + TEXT_LEADING + lineCount * SHOP_BUY_PITCH + 4 + 13 + 4;
}
function shopStoresY(frameCount, lineCount) {
  return Math.max(
    SHOP_FRAME_Y0 + frameCount * SHOP_FRAME_PITCH,
    shopDetailY(lineCount) + TEXT_LEADING * 2, // the band's two lines, plus its gap
  );
}
const MANDATE_BOX_H = TEXT_LEADING * 2 + CORE_TEXT_HEIGHT + 4; // title≤2 + terminus + pad
const MANDATE_Y = AFTER_MASTHEAD_Y;
const MARCH_ROUTE_Y = MANDATE_Y + MANDATE_BOX_H + 12;
const C = PALETTE; // single source of truth (legibility gate asserts its contrast)
const TERRAIN_LABEL = {
  'chalk-flat': 'Chalk Flat', fen: 'The Fen', 'toll-wood': 'Toll Wood',
  'the-cutting': 'The Cutting', 'marker-stones': 'Marker Stones',
};
const KIND_TIER = { 1: 'routine', 2: 'elite', 3: 'boss' };
const TIER_LABEL = { routine: 'ROUTINE', elite: 'ELITE', boss: 'JURISDICTION' };
function matterLine(tier) {
  return `${TIER_LABEL[tier] || TIER_LABEL.routine} matter, filed on the road.`;
}
const ATTRIBUTION_CONTENT = typeof ATTRIBUTION_TEXT !== 'undefined' ? ATTRIBUTION_TEXT : [
  '# ATTRIBUTION: THE OFFICE OF THE ROAD',
  '',
  'Art by Willibab / Monsteretrope, used under CC BY.',
  'Creative Commons Attribution: https://creativecommons.org/licenses/by/4.0/',
  '',
  'Tarot art by GuttyKreum (itch.io), used under commercial licence.',
  '',
  'Music and sound are code-composed WebAudio; no third-party audio attribution is required.',
].join('\n');

function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; }

// ---- Art -------------------------------------------------------------------
const ART_IMAGES = {};
function initArt(log) {
  const data = (typeof ART_DATA !== 'undefined') ? ART_DATA : {};
  const keys = Object.keys(data);
  if (keys.length === 0) { log.warn('no inlined art (ART_DATA empty) — run scripts/build.js'); return; }
  for (const k of keys) {
    const img = new Image();
    img.onerror = () => log.error('art failed to load: ' + k);
    img.src = data[k];
    ART_IMAGES[k] = img;
  }
  log.info('art: ' + keys.length + ' battler sheets loading');
}
// drawIcon: slice a 32×32 Retro-Icons cell (pack art, native grid) and draw it at
// (x,y) scaled to `size`. A missing iconset is a loud marker, never a stand-in.
function drawIcon(ctx, name, x, y, size) {
  const img = ART_IMAGES[ICONSET_KEY], cell = ICON[name];
  if (!img || !img.complete || img.naturalWidth === 0 || !cell) {
    ctx.strokeStyle = C.stamp; ctx.strokeRect(x, y, size, size); return;
  }
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cell.col * ICON_FRAME, cell.row * ICON_FRAME, ICON_FRAME, ICON_FRAME, x, y, size, size);
  ctx.restore();
}

// tileFillCell: fill (x,y,w,h) by REPEATING a 16×16 tile from `sheetKey` at cell
// (col,row), native scale, clipped (pixel-grid correct — no stretch). Pack art
// only; a missing sheet falls back to a panel, never a code-drawn stand-in.
function tileFillCell(ctx, sheetKey, cell, x, y, w, h, filter = 'none') {
  const img = ART_IMAGES[sheetKey];
  if (!img || !img.complete || img.naturalWidth === 0 || !cell) { ctx.fillStyle = C.panel; ctx.fillRect(x, y, w, h); return; }
  const sx = cell.col * TILE_FRAME, sy = cell.row * TILE_FRAME;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.filter = filter;
  for (let ty = y; ty < y + h; ty += TILE_FRAME) for (let tx = x; tx < x + w; tx += TILE_FRAME) {
    ctx.drawImage(img, sx, sy, TILE_FRAME, TILE_FRAME, tx, ty, TILE_FRAME, TILE_FRAME);
  }
  ctx.restore();
}
// tileFill: the road's overworld terrain (the common case).
function tileFill(ctx, terrain, x, y, w, h, filter = 'none') {
  tileFillCell(ctx, OVERWORLD_KEY, TERRAIN_TILE[terrain] || TERRAIN_TILE['toll-wood'], x, y, w, h, filter);
}

/**
 * A ground-contact shadow under a battler. Without one the sprites float over
 * the tiles — the "assets look placed incorrectly" reading. Three stepped rows
 * of translucent ink, drawn on the pixel grid (no ellipse arc, no blur), so it
 * stays crisp at every integer scale. Not pack art and not a stand-in for it:
 * this is the lighting under the art, the way the tiles are the ground under it.
 */
function drawGroundShadow(ctx, x, y, size) {
  const cx = x + size / 2;
  const base = Math.round(y + size - 2);
  const w = Math.max(6, Math.round(size * 0.52));
  const rows = [
    { w, a: 0.34 },
    { w: Math.round(w * 0.72), a: 0.22 },
  ];
  rows.forEach((row, i) => {
    ctx.fillStyle = `rgba(6,5,4,${row.a})`;
    ctx.fillRect(Math.round(cx - row.w / 2), base + i, row.w, 1);
  });
}

function drawBattler(ctx, key, x, y, size, flip, ground = true) {
  if (ground) drawGroundShadow(ctx, x, y, size);
  const img = ART_IMAGES[key];
  if (!img || !img.complete || img.naturalWidth === 0) {
    // Loud missing-art marker (NOT a shipped stand-in — art law). Real builds load.
    ctx.strokeStyle = C.stamp; ctx.strokeRect(x, y, size, size);
    ctx.fillStyle = C.stamp; ctx.font = '6px monospace'; pixelText(ctx, 'art?', x + 2, y + 2);
    return;
  }
  const F = BATTLER.size, sx = BATTLER.col * F, sy = BATTLER.row * F;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(x + size, y); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, F, F, 0, 0, size, size); }
  else ctx.drawImage(img, sx, sy, F, F, x, y, size, size);
  ctx.restore();
}

function boot() {
  const log = new DebugLog({ capacity: 500 });
  installGlobalHandlers(log, typeof window !== 'undefined' ? window : null);
  log.info('boot: opening the file');

  const canvas = document.getElementById('stage');
  const present = canvas.getContext('2d', { alpha: false });
  const banner = document.getElementById('boot-error');
  if (!present) {
    if (banner) { banner.style.display = 'block'; banner.textContent = 'No 2D canvas context available.'; }
    log.error('boot: no 2D context'); return;
  }
  const native = document.createElement('canvas');
  native.width = VW; native.height = VH;
  const ctx = native.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  initArt(log);

  log.onError((entry) => {
    if (!banner) return;
    banner.style.display = 'block';
    banner.textContent = 'THE OFFICE OF THE ROAD. A fault was recorded:\n\n' +
      `[tick ${entry.tick}] ${entry.msg}\n\n(press E to export the full debug log)`;
  });

  function presentFrame() {
    present.imageSmoothingEnabled = false;
    present.drawImage(native, 0, 0, VW, VH, 0, 0, canvas.width, canvas.height);
  }
  function fit() {
    // Fractional-crisp best-fit (CLAUDE.md #9): one axis fills, the other
    // letterboxes. Native 320×200 stays the draw buffer; the stage is a
    // DPR-snapped present target blit with nearest-neighbour (no CSS blur).
    const f = computeDisplayFit(window.innerWidth || VW, window.innerHeight || VH, VW, VH);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const back = presentBackingSize(f.cssW, f.cssH, dpr);
    canvas.style.width = (back.bw / dpr) + 'px';
    canvas.style.height = (back.bh / dpr) + 'px';
    canvas.style.left = snap(f.offX) + 'px';
    canvas.style.top = snap(f.offY) + 'px';
    canvas.style.imageRendering = 'pixelated';
    if (canvas.width !== back.bw || canvas.height !== back.bh) {
      canvas.width = back.bw;
      canvas.height = back.bh;
    }
    present.imageSmoothingEnabled = false;
    canvas.dataset.scale = String(f.scale);
    canvas.dataset.offx = String(snap(f.offX));
    canvas.dataset.offy = String(snap(f.offY));
    presentFrame();
  }
  window.addEventListener('resize', fit); fit();

  // ---- Session ------------------------------------------------------------
  const storage = createStorage(typeof window !== 'undefined' ? window : null);
  if (!storage.available) log.warn('storage unavailable — progress will not persist across reloads (in-memory only)');
  const invalidated = invalidateLegacySaves(storage);
  if (invalidated.length) log.warn('an old-format run save was invalidated; exact live-state resume requires v5');
  const params = readParams();
  const savedRaw = params.fresh ? null : storage.read(SAVE_KEY);
  const savedRecord = parseSaveRecord(savedRaw);
  let loaded = parseSave(savedRaw);
  if (savedRaw && !savedRecord) log.warn('a saved file was found but could not be read; it will be left untouched');

  let config = {
    seed: params.seed !== undefined ? params.seed : 0x0ff1ce,
    speedIndex: params.speed !== undefined ? params.speed : TUNING.defaultSpeedIndex,
  };
  // The certification ledger (M5) — persistent, its own storage key, survives any
  // one expedition's death. Loads (or starts fresh) before the first party.
  let meta = parseMeta(params.fresh ? null : storage.read(META_KEY));
  // A meta receipt wins over a stale OPEN snapshot if closure was interrupted
  // between the two storage writes. It is never offered for resume or re-banked.
  if (loaded && isRunClosed(meta, loaded.runId)) {
    const receipt = meta.closedRuns[loaded.runId];
    storage.write(SAVE_KEY, JSON.stringify(makeClosedSave(loaded.runId, receipt.cause, loaded.savedAtTick)));
    log.warn('a stale open save belonged to an already-closed run; resume was suppressed');
    loaded = null;
  }
  if (savedRecord && savedRecord.status === RUN_CLOSED) log.info('the last expedition is closed; no resumable file remains', { runId: savedRecord.runId });
  let runId = createRunId(config.seed);
  let runMastery = createRunMastery(); // mastery this expedition has earned, unbanked
  let ledger = createLedger(); // the causal incident ledger (M5) — filed at death
  // No-progress detector (M5): tracks per-leg advancement to surface the valve.
  let progressTrk = { lastGold: 0, lastGear: 0, lastXp: 0, streak: 0 };
  function gearCount(p) { let n = (p.inventory || []).length; for (const f of p.frames) for (const s of SLOTS) if (f.equip[s]) n++; return n; }
  function sumXp(m) { let t = 0; for (const k in m) t += m[k] | 0; return t; }
  function resetProgress() { progressTrk = { lastGold: party.gold, lastGear: gearCount(party), lastXp: sumXp(runMastery), streak: 0 }; }
  function freshParty() { return createParty(DEFAULT_PARTY, masteryMultByJob(meta)); }
  // A fresh expedition departs under the certification wall (M5): earned clearances
  // add starting credit/supplies/deck slots, and the world escalates to the level
  // set by the deepest leg on record. (A RESUMED run restores its saved figures
  // instead — bonuses are applied once, at open.)
  function openExpeditionKit() {
    runId = createRunId(config.seed);
    const b = startingBonuses(meta);
    party = freshParty();
    party.gold += b.gold; party.supplies += b.supplies;
    deck = createDeck(STARTING_DECK.concat(b.deck), march.streams.shuffle);
    runMastery = createRunMastery(); ledger = createLedger();
    resetProgress();
    if (b.gold || b.supplies || b.deck.length) log.info('certification kit applied', b);
  }

  let march = createMarch(config.seed);
  let party = freshParty();
  let deck = createDeck(STARTING_DECK, march.streams.shuffle);
  openExpeditionKit();
  // The Office issues the opening mandate (M4). Generated on the mandate stream
  // so it never perturbs the road; the spine of the run is a chain of these.
  let mandate = createMandate(march.streams.mandate, 0, march.leg, march.encounterCount, party.supplies);
  const ui = {
    screen: 'march', paused: params.paused === true, holdPause: false,
    focus: -1, hover: -1, ticker: [], firstInput: false, saved: null, combat: null,
    howtoPage: 0,
    cvd: params.cvd || null, // colour-vision-deficiency proof filter (?cvd=)
    escLevel: escalationLevel(meta), // M5 world-escalation level (from the ledger)
  };
  let lastSaveTick = march.tick;
  let previewSave = null;

  // ---- Score (M7): the code-composed band, one track per state --------------
  // Audio needs a user gesture, so the band is created on the FIRST input. paint()
  // then crossfades the track to match the screen. M mutes. Proof/headless boots
  // never trigger first-input, so they stay silent (no interference).
  let band = null;
  function ensureAudio() {
    if (band || ui.muted) return;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) { log.warn('score: no AudioContext — silent'); return; }
    log.guard('audio', () => {
      const actx = new AC();
      band = createBand({ ctx: actx });
      registerScore(band);
      band.start();
      log.info('score: band started (code-composed, no assets)');
    });
  }
  function updateScore() {
    if (!band) return;
    log.guard('score', () => {
      if (ui.screen === 'combat' && ui.combat) {
        const units = [...ui.combat.st.partyW, ...ui.combat.st.enemyW];
        const hp = units.reduce((sum, w) => sum + Math.max(0, w.e.hp), 0);
        const max = units.reduce((sum, w) => sum + w.e.max.hp, 0) || 1;
        band.setParams({ intensity: Math.min(1, 0.35 + (1 - hp / max) * 0.45 + (ui.combat.left ? 0.2 : 0)) });
      }
      band.setTrack(ui.muted ? null : trackForScreen(ui.screen));
    });
  }

  // ---- Autosave -----------------------------------------------------------
  function doSave(reason) {
    if (ui.screen === 'docket' || ui.screen === 'defeat' || ui.screen === 'title' || ui.screen === 'howto' ||
        (ui.screen === 'credits' && (ui.creditsReturn === 'docket' || ui.creditsReturn === 'defeat' || ui.creditsReturn === 'title' || ui.creditsReturn === 'howto'))) return;
    let ok = false;
    log.guard('autosave', () => { ok = storage.write(SAVE_KEY, JSON.stringify(saveEnvelope())); });
    lastSaveTick = march.tick;
    ui.saved = { tick: march.tick, reason, ok, at: nowMs() };
    log.info(`autosave: ${reason} @tick ${march.tick}` + (ok ? '' : ' (in-memory only)'));
  }
  function saveEnvelope() {
    return makeSave(config, march, party, deck, mandate, runMastery, { runId, ledger, progressTrk, ui });
  }

  // ---- Combat (M3: live stepped resolver + tarot hand) --------------------
  function triggerCombat(ev) {
    const tier = KIND_TIER[ev.kind] || 'routine';
    party.supplies = Math.max(0, party.supplies - TUNING.supplyPerEncounter);
    const enemies = makeEnemies(tier, march.streams.combat, escalationMult(meta)); // M5: the world deepens
    const st = initCombat(party, enemies);
    discardHand(deck);
    drawUp(deck, TUNING.handSize, march.streams.shuffle); // draw the opening hand
    recordMatter(ledger, march.leg, tier); // M5 report: a matter fielded on this leg
    ui.combat = {
      tier, st, enemies, acc: 0, floats: [], round: 1, leg: march.leg,
      line: matterLine(tier),
      done: false, outMs: 0, draft: null, left: tier !== 'routine',
    };
    ui.screen = 'combat'; ui.focus = -1;
    ui.paused = true; // "pause on hand draw" defaults ON — the desk gets first look
    ui.ticker.push(`combat · ${TIER_LABEL[tier]} · ${enemies.length} foe(s)`);
    log.info(`combat begins (${tier}) — hand drawn, paused`, { enemies: enemies.length, hand: deck.hand.slice() });
    doSave('combat begins');
  }

  function mkFloat(side, idx, text, color) { return { side, idx, text, color, life: 750 }; }
  function spawnFloats(entry) {
    for (const t of entry.targets) {
      if (t.dmg != null) ui.combat.floats.push(mkFloat(t.side, t.idx, '-' + t.dmg, C.stamp));
      else if (t.heal != null && t.heal > 0) ui.combat.floats.push(mkFloat(t.side, t.idx, '+' + t.heal, C.ok));
      else if (t.ward != null || t.buff != null) ui.combat.floats.push(mkFloat(t.side, t.idx, t.ward != null ? 'ward' : 'rally', C.focus));
      else if (t.stay) ui.combat.floats.push(mkFloat(t.side, t.idx, 'stayed', C.dim));
    }
  }
  function phraseFor(entry) {
    if (entry.side === 'system') return 'STALEMATE recorded.';
    if (entry.side === 'card') {
      let p = `${entry.verb} played.`;
      if (entry.deaths.length) p += ` ${entry.deaths.join(', ')} reduced.`;
      return p;
    }
    let p = `${entry.actor}: ${entry.verb}`;
    const dmg = entry.targets.find((t) => t.dmg != null);
    if (dmg) p += ` → ${dmg.name} (−${dmg.dmg})`;
    if (entry.deaths.length) p += ` · ${entry.deaths.join(', ')} reduced`;
    return p;
  }

  // ---- M5 causal-report hooks (combat reduction + missed decisive windows) --
  // A protection card (heal/ward/stay) that reads DECISIVE while sitting unplayed
  // in the hand is the coverage gap the report will name if a frame then falls.
  function decisiveProtectionInHand() {
    const cb = ui.combat; if (!cb) return null;
    for (const id of deck.hand) {
      const c = getCard(id);
      if ((c.kind === 'mend' || c.kind === 'salve' || c.kind === 'ward' || c.kind === 'stay') && evaluateCard(cb.st, id) === 'decisive') return c.name;
    }
    return null;
  }
  function aliveFrameIds() { return new Set(party.frames.filter((f) => f.alive && f.hp > 0).map((f) => f.id)); }
  function noteReductions(beforeAlive, protection) {
    const cb = ui.combat; if (!cb) return;
    for (const f of party.frames) {
      if (beforeAlive.has(f.id) && (!f.alive || f.hp <= 0)) {
        recordReduction(ledger, cb.leg, cb.tier, f.name);
        if (protection) recordMissedWindow(ledger, cb.leg, cb.tier, protection, f.name);
      }
    }
  }

  // Play the hand card at index i (allowed while paused — pause is first-class).
  function playCard(i) {
    const cb = ui.combat; if (!cb || cb.done || cb.draft) return;
    if (i < 0 || i >= deck.hand.length) return;
    const cardId = deck.hand[i];
    const beforeAlive = aliveFrameIds();
    const entry = log.guard('card', () => applyCard(cb.st, cardId));
    playFromHand(deck, i);
    if (entry) {
      spawnFloats(entry); cb.line = phraseFor(entry); if (entry.draw) drawUp(deck, entry.draw, march.streams.shuffle);
      // Credit the desk (M5): a heal that restored the line, or a card that closed
      // out a hard matter, is what the report will name to the desk's credit.
      const healed = (entry.targets || []).reduce((s, t) => s + (t.heal > 0 ? t.heal : 0), 0);
      if (healed > 0) recordCredit(ledger, `mended the line at leg ${cb.leg} (+${healed}). A reduction averted`, healed + 10);
    }
    noteReductions(beforeAlive, decisiveProtectionInHand());
    log.info('card played: ' + cardId);
    if (cb.st.done) finishCombat();
  }

  function tickCombat(dt) {
    const cb = ui.combat;
    cb.floats = cb.floats.filter((f) => (f.life -= dt) > 0);
    if (cb.draft) return; // drafting: resolver is done, awaiting a pick
    if (cb.done) { cb.outMs += dt; if (cb.outMs > 900) offerDraftOrEnd(); return; }
    const beat = 440 / speedAt(config.speedIndex);
    cb.acc += dt;
    let guard = 0;
    while (cb.acc >= beat && !cb.done && guard++ < 50) {
      cb.acc -= beat;
      const beforeAlive = aliveFrameIds();
      const protection = decisiveProtectionInHand();
      const entry = log.guard('step', () => stepCombat(cb.st, march.streams.combat));
      noteReductions(beforeAlive, protection); // M5: trace any reduction to its gap
      if (!entry) { if (cb.st.done) { finishCombat(); break; } else continue; }
      spawnFloats(entry); cb.line = phraseFor(entry);
      if (entry.round > cb.round) { cb.round = entry.round; drawUp(deck, TUNING.handSize, march.streams.shuffle); } // replenish hand each round
      if (cb.st.done) finishCombat();
    }
  }

  function finishCombat() {
    const cb = ui.combat; if (!cb || cb.done) return;
    cb.done = true; cb.outMs = 0;
    if (cb.st.victory) {
      // Disbursement into the ledger (M4): the road's pay scale, per tier, scaled
      // by the routed leg's gold multiplier (an exposed verge pays more).
      const gm = march.legMods ? march.legMods.goldMult : 1;
      const pay = Math.round((TUNING.goldPerWin[cb.tier] || 0) * gm * escalationMult(meta)); // deeper pays more

      earnGold(party, pay);
      cb.pay = pay;
      // Certification credit (M5): every frame that fielded this won matter earns
      // mastery for the job it was running. Banked when the expedition ends.
      for (const f of livingFrames(party)) earnMastery(runMastery, f.jobId, cb.tier);
      if (cb.tier === 'boss') recordCredit(ledger, `carried a jurisdiction (boss) at leg ${cb.leg}`, 60);
      else if (cb.tier === 'elite') recordCredit(ledger, `closed a contested crossing at leg ${cb.leg}`, 18);
      cb.line = `Closed. Disbursement: ${pay}¤.`;
      ui.ticker.push(`disbursement · +${pay}¤ · ledger ${party.gold}¤`);
    } else {
      cb.line = 'Unit reduced. File forwarded.';
    }
    log.info('combat resolved', { victory: cb.st.victory, pay: cb.pay || 0, ledger: party.gold });
  }

  function offerDraftOrEnd() {
    const cb = ui.combat;
    if (cb.st.victory && !isWiped(party)) {
      // A 3-card draft at resolution (StS cadence), drawn from the loot stream.
      const pool = CARD_IDS.slice();
      const opts = [];
      while (opts.length < 3 && pool.length) { const k = march.streams.loot.int(pool.length); opts.push(pool.splice(k, 1)[0]); }
      cb.draft = { options: opts, focus: 0 };
      // The draft owns its own focus (cb.draft.focus, driven by the key handler
      // and drawn by drawDraft). ui.focus indexes the MARCH band, so setting it
      // to 0 here pointed the selection marker at the 0.5× speed chip while the
      // real selection was the first card — a control-band lie.
      ui.focus = -1;
      cb.line = 'Card offered. Take one, or decline.';
      log.info('draft offered', { options: opts });
      doSave('draft offered');
    } else {
      endCombat();
    }
  }
  function takeDraft(idx) {
    const cb = ui.combat; if (!cb || !cb.draft) return;
    if (idx >= 0 && idx < cb.draft.options.length) { addCard(deck, cb.draft.options[idx]); log.info('drafted ' + cb.draft.options[idx]); ui.ticker.push('drafted · ' + getCard(cb.draft.options[idx]).name); }
    else log.info('draft declined');
    endCombat();
  }
  function endCombat() {
    const tier = ui.combat ? ui.combat.tier : 'routine';
    const wiped = isWiped(party);
    discardHand(deck);
    ui.combat = null;
    if (wiped) { endExpedition('reduced', 1, tier); }
    else { ui.screen = 'march'; ui.paused = false; doSave('combat resolved'); log.info('combat over — marching'); }
  }

  // ---- Expedition end (M5): bank certifications to the permanent ledger ----
  // Death files a report; the Office processes the outcome; CERTIFICATIONS persist.
  // Banks the run's earned mastery (full credit on a reduction; the abandon valve
  // will bank a reduced share), records the gain report for the defeat surface.
  function endExpedition(cause, frac = 1, terminalTier = null) {
    const tier = terminalTier || (ui.combat ? ui.combat.tier : 'routine');
    const filed = composeReport(ledger, { leg: march.leg, cause, tier, supplies: party.supplies, gold: party.gold });
    const beforeXp = totalMastery(meta);
    const closure = closeExpedition({ storage, meta, runId, runMastery, deepestLeg: march.leg, closedAtTick: march.tick, frac, cause, gold: party.gold });
    const gains = closure.gains;
    const cleared = newlyEarned(beforeXp, totalMastery(meta)); // NEW clearances this run bought
    ui.report = { cause, gains, runs: meta.runs, deepestLeg: meta.deepestLeg, filed, cleared, escLevel: escalationLevel(meta) };
    ui.screen = 'defeat'; ui.focus = 0;
    log.info('expedition ends — report filed + certifications banked', { cause, runId, banked: closure.banked, gains, cleared: cleared.map((c) => c.id), runs: meta.runs });
  }

  // ---- Camp / town (the leg pause point) ----------------------------------
  // Every pause point is a camp (job change + rest + deck). Some are TOWNS: a
  // quartermaster is present (buy/sell/equip + the always-open resupply sink).
  function enterCamp(leg) {
    const town = isTownLeg(leg);
    ui.screen = 'camp'; ui.camp = { leg, isTown: town };
    if (town) { ui.shop = generateShop(config.seed, leg); ui.shop.pick = null; ui.shop.sel = 0; }
    // If the expedition has stalled, put the focus on the early-return valve.
    ui.focus = ui.noProgress ? buildCampControls().length - 1 : 0;
    log.info((town ? 'town' : 'camp') + ' at leg ' + leg, { town });
    doSave((town ? 'town' : 'camp') + ': leg ' + leg);
  }
  function cycleFrameJob(i, dir) {
    const cur = party.frames[i].jobId;
    const idx = JOB_IDS.indexOf(cur);
    const next = JOB_IDS[(idx + dir + JOB_IDS.length) % JOB_IDS.length];
    changeJob(party, i, next);
    log.info(`camp: frame ${i} reassigned ${cur} -> ${next}`);
    doSave('reassignment filed');
  }
  function doRest() {
    const r = campRest(party);
    if (r.rested) { ui.saved = { tick: march.tick, reason: `rest (−${r.cost} supplies, +${r.restored} hp)`, ok: true, at: nowMs() }; doSave('camp rest'); log.info(`camp rest +${r.restored} hp -${r.cost} supplies`); }
    else { log.warn('camp rest refused — supplies ' + party.supplies + ' < ' + TUNING.campRecoverSupplyCost); }
  }
  function strikeCamp() { ui.screen = 'march'; ui.focus = -1; log.info('camp struck — marching'); doSave('camp struck'); }

  // The abandon valve (M5): file for early return from any camp/town. Ends the
  // run and banks a REDUCED share of certification credit. Always available; the
  // no-progress detector surfaces it loudly when the expedition has stalled.
  function fileEarlyReturn() {
    log.info('filed for early return', { leg: march.leg, streak: progressTrk.streak });
    endExpedition('abandoned', TUNING.abandonCreditFrac);
  }

  // ---- Routing the next leg (branch choice — M4) --------------------------
  // Marching-on from a pause point routes the next leg: a branch with a legible
  // safety-vs-resource tradeoff. The chosen mods ride on the leg; a supply toll
  // (if any) is paid at selection. The march itself starts only once routed.
  function openRoute() { ui.screen = 'route'; ui.focus = 0; ui.route = generateBranches(config.seed, march.leg); log.info('routing leg ' + march.leg, { branches: ui.route.branches.map((b) => b.id) }); }
  function pickRoute(i) {
    const b = ui.route && ui.route.branches[i]; if (!b) return;
    if (b.supplyToll > 0) party.supplies = Math.max(0, party.supplies - b.supplyToll);
    march.legMods = { encounterMult: b.mods.encounterMult, goldMult: b.mods.goldMult };
    recordRoute(ledger, march.leg, b); // the head of the leg's causal chain (M5 report)
    if (b.id === 'posted') recordCredit(ledger, `husbanded the party on ${b.label} at leg ${march.leg}`, 5);
    // Two rows, not one: spelling `enc`→`encounters` pushed the single row past
    // what the day book can wrap without dropping its tail, and the day book is
    // a record — it does not get to lose the toll off the end of a line.
    ui.ticker.push(`routed · ${b.label}`);
    ui.ticker.push(`encounters ×${b.encounterMult} · pay ×${b.goldMult}${b.supplyToll ? ` · toll −${b.supplyToll} supplies` : ''}`);
    log.info('routed ' + b.id, { legMods: march.legMods, toll: b.supplyToll });
    ui.route = null; ui.screen = 'march'; ui.focus = -1;
    doSave('route chosen'); // autosave at the route choice (seed cadence)
  }

  // ---- The quartermaster (town shop — M4) ---------------------------------
  function openShop() { if (!ui.shop) return; ui.screen = 'shop'; ui.focus = 0; log.info('quartermaster opened', { leg: ui.camp.leg }); }
  function closeShop() { ui.screen = 'camp'; ui.focus = 5; if (ui.shop) ui.shop.pick = null; log.info('quartermaster closed'); }
  function shopBuy(li) {
    const r = buyLine(party, ui.shop, li);
    if (r.ok) { ui.saved = { tick: march.tick, reason: `requisitioned ${getItem(r.id).name} (−${r.spent}¤)`, ok: true, at: nowMs() }; doSave('requisition'); log.info('bought ' + r.id, { spent: r.spent, gold: party.gold }); }
    else log.warn('purchase refused — ' + r.reason);
  }
  function shopResupply() {
    const r = resupply(party);
    if (r.ok) { ui.saved = { tick: march.tick, reason: `resupply +${r.added} supplies (−${r.spent}¤)`, ok: true, at: nowMs() }; doSave('resupply'); log.info('resupply', { supplies: party.supplies, gold: party.gold }); }
    else log.warn('resupply refused — ' + r.reason);
  }
  function shopPick(id) { ui.shop.pick = (ui.shop.pick === id) ? null : id; log.info('picked ' + (ui.shop.pick || 'none')); }
  function shopSellPicked() {
    const inv = party.inventory || []; const idx = ui.shop.pick != null ? inv.indexOf(ui.shop.pick) : -1;
    if (idx < 0) { log.warn('nothing picked to sell'); return; }
    const r = sellItem(party, idx);
    if (r.ok) { ui.shop.pick = null; ui.saved = { tick: march.tick, reason: `sold ${getItem(r.id).name} (+${r.value}¤)`, ok: true, at: nowMs() }; doSave('sale'); log.info('sold ' + r.id, { value: r.value }); }
  }
  // A frame's slot chip: with an item PICKED that fits this slot, equip it (swap);
  // otherwise, if the slot is filled, unequip it back to stores.
  function shopSlot(frameIndex, slot) {
    const pick = ui.shop.pick;
    if (pick && getItem(pick).slot === slot) {
      const r = equipItem(party, frameIndex, pick);
      // Named, not indexed: the badge used to read "to frame 0", which is a
      // zero-based array position dressed as a fact about the party.
      if (r.ok) { ui.shop.pick = null; ui.saved = { tick: march.tick, reason: `issued ${getItem(pick).name} to ${party.frames[frameIndex].name}`, ok: true, at: nowMs() }; doSave('issue'); log.info('equipped ' + pick + ' -> frame ' + frameIndex); }
      else log.warn('equip refused — ' + r.reason);
    } else if (party.frames[frameIndex].equip[slot]) {
      const r = unequipSlot(party, frameIndex, slot);
      if (r.ok) { doSave('unissue'); log.info('unequipped ' + r.removed + ' from frame ' + frameIndex); }
    } else {
      log.info('empty slot — pick a matching item first');
    }
  }

  // ---- Mandates (the Office's quest-chain — M4) ---------------------------
  // Called when a leg completes: if it reached the mandate's terminus, discharge
  // it (pay the floor-guaranteed disbursement + any met side-clauses into the
  // ledger) and the Office issues the next. `completedLeg` = the leg just filed;
  // march.leg has already advanced to the next when this runs.
  function dischargeIfTerminus(completedLeg) {
    if (!mandate || mandate.discharged || !isTerminus(mandate, completedLeg)) return;
    const record = {
      encounters: march.encounterCount - mandate.issuedAtEncounters,
      supplies: party.supplies,
    };
    const r = dischargeReward(mandate, record);
    earnGold(party, r.gold);
    mandate.discharged = true;
    const metNote = r.met.length ? ` (+${r.met.length} clause${r.met.length > 1 ? 's' : ''})` : '';
    ui.mandateNotice = `MANDATE ${mandate.ref} DISCHARGED: ${r.gold}¤ disbursed${metNote}`;
    ui.ticker.push(`mandate ${mandate.ref} discharged · +${r.gold}¤${metNote}`);
    log.info('mandate discharged', { ref: mandate.ref, reward: r.gold, met: r.met, ledger: party.gold });
    // The Office issues the next, from where the party now stands.
    mandate = createMandate(march.streams.mandate, mandate.index + 1, march.leg, march.encounterCount, party.supplies);
    ui.ticker.push(`mandate ${mandate.ref} issued · ${mandate.title} · terminus leg ${mandate.destinationLeg}`);
    log.info('mandate issued', { ref: mandate.ref, title: mandate.title, terminus: mandate.destinationLeg });
  }

  // ---- Deck review (camp-only removal, at a supply cost — thin-deck) -------
  function buildDeckControls() {
    const perRow = 6, cw = 50, ch = 54, x0 = 14, y0 = 48, gx = 4, gy = 8;
    const ctrls = deck.list.map((id, i) => {
      const col = i % perRow, row = Math.floor(i / perRow);
      return { id: 'dc' + i, cardIndex: i, cardId: id, rect: { x: x0 + col * (cw + gx), y: y0 + row * (ch + gy), w: cw, h: ch }, activate: () => deckRemove(i) };
    });
    ctrls.push({ id: 'back', label: 'BACK TO CAMP', priority: 'primary', rect: { x: 16, y: 180, w: 112, h: CHIP_H }, activate: () => { ui.screen = 'camp'; ui.focus = 1; } });
    return ctrls;
  }
  function openDeck() { ui.screen = 'deck'; ui.focus = 0; log.info('deck review opened'); }
  function deckRemove(i) {
    const id = deck.list[i]; if (!id) return;
    if (deck.list.length <= 1) { log.warn('the deck cannot be emptied'); return; }
    if (party.supplies < TUNING.deckRemoveCost) { log.warn(`cannot strike a card — supplies ${party.supplies} < ${TUNING.deckRemoveCost}`); return; }
    party.supplies -= TUNING.deckRemoveCost;
    removeCard(deck, id);
    ui.saved = { tick: march.tick, reason: `struck ${getCard(id).name} (−${TUNING.deckRemoveCost})`, ok: true, at: nowMs() };
    doSave('deck edit'); log.info('struck card ' + id);
    if (ui.focus >= deck.list.length) ui.focus = Math.max(0, deck.list.length - 1);
  }

  // ---- Engine stepping ----------------------------------------------------
  function absorb(events) {
    for (const ev of events) {
      if (ev.type === 'encounter') {
        ui.ticker.push(`encounter #${ev.n} · ${TERRAIN_LABEL[ev.terrain] || ev.terrain} · ${TIER_LABEL[KIND_TIER[ev.kind]] || ev.kind}`);
        log.info(`encounter #${ev.n} on ${ev.terrain}`, { leg: ev.leg, pace: ev.pace, kind: ev.kind });
        triggerCombat(ev); // interrupts the march
      } else if (ev.type === 'leg-complete') {
        ui.ticker.push(`leg ${ev.leg} filed: ${ev.encounters} encounters`);
        log.info(`leg ${ev.leg} complete`, { encounters: ev.encounters });
        dischargeIfTerminus(ev.leg); // mandate terminus? discharge + issue the next
        // No-progress detector (M5): did this leg advance the expedition at all?
        const gearNow = gearCount(party), xpNow = sumXp(runMastery);
        const stale = legIsStale(party.gold - progressTrk.lastGold, gearNow > progressTrk.lastGear, xpNow > progressTrk.lastXp);
        progressTrk.streak = bumpStreak(progressTrk.streak, stale);
        progressTrk.lastGold = party.gold; progressTrk.lastGear = gearNow; progressTrk.lastXp = xpNow;
        ui.noProgress = noProgress(progressTrk.streak);
        if (ui.noProgress) { ui.ticker.push('⚠ NO PROGRESS: two legs without gain; the early-return valve is open'); log.warn('no-progress detector tripped', { streak: progressTrk.streak }); }
        enterCamp(ev.leg); // the pause point: camp (job change + rest)
      } else if (ev.type === 'leg-begin') {
        ui.ticker.push(`leg ${ev.leg} opened · ${TERRAIN_LABEL[ev.terrain] || ev.terrain}`);
        // Road omen (between fights): a tarot is read; the Office notes it and
        // proceeds. Deterministic from the loot stream. Resolves nothing.
        const oc = getCard(CARD_IDS[march.streams.loot.int(CARD_IDS.length)]);
        ui.omen = { arcana: oc.arcana, name: oc.name };
        ui.ticker.push(`omen · ${oc.name}: noted; the road proceeds`);
      } else if (ev.type === 'terrain') {
        log.info(`terrain -> ${ev.terrain}`, { pace: ev.pace });
      }
    }
    while (ui.ticker.length > 5) ui.ticker.shift();
  }
  function advanceTicks(n) {
    // Mutation-during-automation hard-block (M8): the march ONLY advances on the
    // march screen. Every edit surface (camp/town/shop/deck/route/combat/docket/
    // intake/defeat) is a pause point where the ticker is frozen — so a job swap,
    // equip, or deck edit can never race a live tick (no orphaned refs / double-
    // applied stats). Guarded at the top so even the debug handle respects it.
    if (ui.screen !== 'march') return 0;
    let ticked = 0;
    for (let i = 0; i < n; i++) {
      log.setTick(march.tick + 1);
      absorb(log.guard('step', () => step(march)) || []);
      ticked++;
      if (ui.screen !== 'march') break; // an encounter/leg-end opened a pause point
    }
    return ticked;
  }
  function paint() {
    const paused = ui.paused || ui.holdPause;
    log.guard('render', () => render(ctx, { march, config, party, deck, mandate, meta, ui, controls, docketControls, defeatControls, creditsControls, attributionText: PLAYER_CREDITS, campControls: ui.screen === 'camp' ? buildCampControls() : null, deckControls: ui.screen === 'deck' ? buildDeckControls() : null, shopControls: ui.screen === 'shop' ? buildShopControls() : null, routeControls: ui.screen === 'route' ? buildRouteControls() : null, intakeControls: ui.screen === 'intake' ? intakeControls : null, titleControls: ui.screen === 'title' ? titleControls : null, howtoControls: ui.screen === 'howto' ? buildHowtoControls() : null, log, paused, previewSave }));
    if (ui.cvd) log.guard('cvd', () => applyCVD(ctx, ui.cvd));
    updateScore(); // crossfade the band to match the screen
    if (typeof window !== 'undefined' && window.__soak) log.guard('soak', () => drawSoak(ctx, window.__soak));
    presentFrame();
  }
  function applyCVD(context, type) {
    const img = context.getImageData(0, 0, VW, VH), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = simulateCVD(type, d[i], d[i + 1], d[i + 2]);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    context.putImageData(img, 0, 0);
  }

  // ---- Controls -----------------------------------------------------------
  function setSpeed(i) { config.speedIndex = clampSpeedIndex(i); log.info('speed ' + speedAt(config.speedIndex) + 'x'); }
  // The march band: the speed set (secondary chips, the active one lifted), then
  // the one verb that matters here — PAUSE/RESUME — as the primary chip.
  const controls = [];
  TUNING.speedSteps.forEach((mult, i) => {
    controls.push({ id: 'spd' + i, label: mult + 'x', priority: 'secondary', rect: { x: 44 + i * 30, y: CONTROL_BAND_Y, w: 30, h: CHIP_H }, activate: () => setSpeed(i), isActive: () => config.speedIndex === i });
  });
  controls.push({ id: 'pause', label: () => (ui.paused ? 'RESUME' : 'PAUSE'), priority: 'primary', rect: { x: 180, y: CONTROL_BAND_Y, w: 48, h: CHIP_H }, activate: () => { ui.paused = !ui.paused; }, isActive: () => ui.paused });
  controls.push({ id: 'hold', label: 'HOLD', priority: 'secondary', rect: { x: 230, y: CONTROL_BAND_Y, w: 32, h: CHIP_H }, activate: () => {}, isActive: () => ui.holdPause, hold: true });
  controls.push({ id: 'credits', label: 'CREDITS', priority: 'secondary', rect: { x: 264, y: CONTROL_BAND_Y, w: 52, h: CHIP_H }, activate: () => openCredits(ui.screen) });

  // RESUME is the primary and is ~1.7× its neighbours; the two alternatives keep
  // the same height, so priority reads as width, not as a colour trick.
  const docketControls = [
    { id: 'resume', label: 'RESUME', priority: 'primary', rect: { x: 24, y: 150, w: 120, h: 16 }, activate: () => resumeSaved() },
    { id: 'discard', label: 'FILE ANEW', priority: 'secondary', rect: { x: 152, y: 150, w: 70, h: 16 }, activate: () => discardSaved() },
    { id: 'credits', label: 'CREDITS', priority: 'secondary', rect: { x: 230, y: 150, w: 70, h: 16 }, activate: () => openCredits('docket') },
  ];
  const defeatControls = [
    { id: 'again', label: 'FILE A NEW EXPEDITION', priority: 'primary', rect: { x: 90, y: CONTROL_BAND_Y, w: 140, h: CHIP_H }, activate: () => discardSaved() },
  ];
  // Orientation Mandate (M5): Expedition 0 may still open this intake form via
  // deep-link; START from the title is the ordinary door. Opening march is
  // always PAUSED so a stranger can read the desk before the road moves.
  function beginOpeningMarch(reason) {
    ui.screen = 'march';
    ui.paused = true;
    ui.focus = -1;
    ui.combat = null;
    ui.ticker = [
      'Expedition on file. Party waits',
      'Space begins the march.',
    ];
    doSave(reason || 'expedition opened');
    log.info((reason || 'opening') + ' — march paused for opening beat');
  }
  function beginFromTitle() {
    beginOpeningMarch('title start');
  }
  function openHowto() { ui.screen = 'howto'; ui.howtoPage = 0; ui.focus = 0; log.info('how to play opened'); }
  function closeHowto() { ui.screen = 'title'; ui.focus = 0; ui.howtoPage = 0; }
  function beginIntake() { beginOpeningMarch('orientation filed'); }
  const intakeControls = [
    { id: 'begin', label: 'FILE THE INTAKE: BEGIN THE EXPEDITION', priority: 'primary', rect: { x: 16, y: 176, w: 216, h: 16 }, activate: () => beginIntake() },
    { id: 'credits', label: 'CREDITS', priority: 'secondary', rect: { x: 238, y: 176, w: 66, h: 16 }, activate: () => openCredits('intake') },
  ];
  const titleControls = titleMenuRects().map((c) => ({
    id: c.id,
    label: c.label,
    priority: c.priority,
    rect: c.rect,
    activate: () => {
      if (c.id === 'start') beginFromTitle();
      else if (c.id === 'howto') openHowto();
      else if (c.id === 'credits') openCredits('title');
    },
  }));
  function buildHowtoControls() {
    return howtoMenuRects(ui.howtoPage | 0).map((c) => ({
      id: c.id,
      label: c.label,
      priority: c.priority,
      rect: c.rect,
      activate: () => {
        if (c.id === 'prev') ui.howtoPage = Math.max(0, (ui.howtoPage | 0) - 1);
        else if (c.id === 'next') ui.howtoPage = Math.min(HOWTO_PAGES.length - 1, (ui.howtoPage | 0) + 1);
        else if (c.id === 'back') closeHowto();
      },
    }));
  }
  function openCredits(returnScreen) {
    ui.creditsReturn = returnScreen || 'title'; ui.creditsPage = 0;
    ui.screen = 'credits'; ui.focus = 3;
    log.info('credits opened', { from: ui.creditsReturn });
  }
  function closeCredits() {
    const returnScreen = ui.creditsReturn || 'title';
    ui.screen = returnScreen;
    ui.focus = (returnScreen === 'docket' || returnScreen === 'intake' || returnScreen === 'title' || returnScreen === 'howto') ? 0 : -1;
    ui.creditsReturn = null;
  }
  function openCreditLicense() {
    const opened = window.open && window.open('https://creativecommons.org/licenses/by/4.0/', '_blank', 'noopener');
    if (!opened) log.warn('the CC BY 4.0 link could not be opened; its full address remains printed in credits');
  }
  const creditsControls = [
    { id: 'prev', label: 'PREV', priority: 'secondary', rect: { x: 12, y: 180, w: 48, h: CHIP_H }, activate: () => { ui.creditsPage = Math.max(0, (ui.creditsPage | 0) - 1); } },
    { id: 'next', label: 'NEXT', priority: 'secondary', rect: { x: 64, y: 180, w: 48, h: CHIP_H }, activate: () => { ui.creditsPage = (ui.creditsPage | 0) + 1; } },
    { id: 'license', label: 'OPEN CC BY', priority: 'secondary', rect: { x: 116, y: 180, w: 84, h: CHIP_H }, activate: () => openCreditLicense() },
    // 8px of air before BACK so its selection pointer has somewhere to sit.
    { id: 'back', label: 'BACK', priority: 'primary', rect: { x: 210, y: 180, w: 98, h: CHIP_H }, activate: () => closeCredits() },
  ];
  // Camp controls are built per-visit: the QUARTERMASTER verb appears only at a
  // town. Frame rows (job cycle) then the action row (rest/deck/[quartermaster]/march).
  function buildCampControls() {
    const arr = [];
    for (let i = 0; i < party.frames.length; i++) {
      arr.push({ id: 'f' + i, frameIndex: i, cycle: true, rect: { x: 16, y: CAMP_PANEL_Y + i * CAMP_ROW, w: 288, h: CAMP_ROW }, activate: () => cycleFrameJob(i, 1) });
    }
    // Camp's edit verbs are secondary; MARCH ON is the one primary — it is the
    // verb that advances the run, and at 190px it is ~1.7× the row beside it.
    // Both rows are anchored to the SAME bottom band every other screen uses,
    // so the action row never floats in the middle of an empty camp.
    const marchY = CONTROL_BAND_Y;
    const actionY = marchY - CHIP_H - 5;
    arr.push({ id: 'rest', label: () => 'REST', priority: 'secondary', rect: { x: 16, y: actionY, w: 58, h: CHIP_H }, activate: () => doRest() });
    arr.push({ id: 'deck', label: 'REVIEW DECK', priority: 'secondary', rect: { x: 80, y: actionY, w: 86, h: CHIP_H }, activate: () => openDeck() });
    if (ui.camp && ui.camp.isTown) arr.push({ id: 'shop', label: 'QUARTERMASTER', priority: 'secondary', rect: { x: 172, y: actionY, w: 132, h: CHIP_H }, activate: () => openShop() });
    arr.push({ id: 'march', label: 'MARCH ON: ROUTE THE NEXT LEG', priority: 'primary', rect: { x: 16, y: marchY, w: 190, h: CHIP_H }, activate: () => openRoute() });
    arr.push({ id: 'return', label: 'EARLY RETURN', priority: 'secondary', warn: ui.noProgress, rect: { x: 212, y: marchY, w: 92, h: CHIP_H }, activate: () => fileEarlyReturn() });
    return arr;
  }

  // Route screen: one focusable card per branch (safety-vs-resource tradeoff).
  function buildRouteControls() {
    const arr = [];
    const r = ui.route; if (!r) return arr;
    r.branches.forEach((b, i) => {
      arr.push({ id: 'br' + i, branch: i, rect: { x: 14 + i * 100, y: ROUTE_CARD_Y, w: 92, h: 100 }, activate: () => pickRoute(i) });
    });
    return arr;
  }

  // The quartermaster's board (M4). Buy lines (left), the always-open resupply
  // sink, loose inventory (pick to equip/sell), per-frame slot chips (right), a
  // sell-picked action, and back-to-camp. All keyboard- and mouse-reachable.
  function buildShopControls() {
    const arr = [];
    const shop = ui.shop; if (!shop) return arr;
    // Buy lines
    const buyH = SHOP_BUY_PITCH;
    const buyY0 = AFTER_MASTHEAD_Y + TEXT_LEADING;
    shop.lines.forEach((l, i) => {
      arr.push({ id: 'buy' + i, kind: 'buy', line: i, rect: { x: 10, y: buyY0 + i * buyH, w: 150, h: buyH - MIN_INTERLINE_GAP }, activate: () => shopBuy(i) });
    });
    // Always-open resupply sink
    const resupplyY = buyY0 + shop.lines.length * buyH + 4;
    arr.push({ id: 'resupply', kind: 'resupply', rect: { x: 10, y: resupplyY, w: 150, h: 13 }, activate: () => shopResupply() });
    // Per-frame slot chips (right column): two per frame (arm, guard)
    const frameY0 = SHOP_FRAME_Y0;
    party.frames.forEach((f, i) => {
      SLOTS.forEach((slot, si) => {
        arr.push({ id: 'slot' + i + slot, kind: 'slot', frameIndex: i, slot, rect: { x: 236 + si * 38, y: frameY0 + i * SHOP_FRAME_PITCH, w: 36, h: 15 }, activate: () => shopSlot(i, slot) });
      });
    });
    // Loose inventory below both the frame column and the resupply row. The
    // row length is DERIVED from the space available, not hardcoded to 5: a
    // sixth item used to be drawn straight off the right edge of the board.
    const invY = shopStoresY(party.frames.length, shop.lines.length) + TEXT_LEADING;
    const invX0 = 62, invW = 48, invGap = 3, invRowH = 12;
    const invPerRow = Math.max(1, Math.floor(((VW - 12 - invX0) + invGap) / (invW + invGap)));
    (party.inventory || []).forEach((id, i) => {
      const col = i % invPerRow, row = Math.floor(i / invPerRow);
      arr.push({
        id: 'inv' + i, kind: 'inv', itemId: id,
        rect: { x: invX0 + col * (invW + invGap), y: invY - TEXT_LEADING + row * invRowH, w: invW, h: 11 },
        activate: () => shopPick(id),
      });
    });
    // Sell the picked item; back to camp
    arr.push({ id: 'sell', kind: 'sell', priority: 'secondary', rect: { x: 10, y: 168, w: 80, h: CHIP_H }, activate: () => shopSellPicked() });
    arr.push({ id: 'back', label: 'BACK TO CAMP', priority: 'primary', rect: { x: 202, y: 168, w: 112, h: CHIP_H }, activate: () => closeShop() });
    return arr;
  }

  function activeControls() {
    if (ui.screen === 'docket') return docketControls;
    if (ui.screen === 'defeat') return defeatControls;
    if (ui.screen === 'camp') return buildCampControls();
    if (ui.screen === 'deck') return buildDeckControls();
    if (ui.screen === 'shop') return buildShopControls();
    if (ui.screen === 'route') return buildRouteControls();
    if (ui.screen === 'intake') return intakeControls;
    if (ui.screen === 'title') return titleControls;
    if (ui.screen === 'howto') return buildHowtoControls();
    if (ui.screen === 'credits') return creditsControls;
    return controls; // march + combat: speed/pause stay reachable
  }

  function resumeSaved() {
    if (!previewSave) return;
    const applied = log.guard('resume', () => applySave(previewSave));
    if (!applied) { log.error('resume failed — starting new'); return discardSaved(); }
    config = applied.config; march = applied.march; party = applied.party || freshParty(); runId = applied.runId;
    runMastery = applied.runMastery || createRunMastery(); // resume keeps unbanked mastery
    ledger = applied.ledger || createLedger();
    progressTrk = applied.progressTrk || { lastGold: party.gold, lastGear: gearCount(party), lastXp: sumXp(runMastery), streak: 0 };
    deck = applied.deck || createDeck(STARTING_DECK, march.streams.shuffle); lastSaveTick = march.tick;
    mandate = applied.mandate || createMandate(march.streams.mandate, 0, march.leg, march.encounterCount, party.supplies);
    if (applied.ui) Object.assign(ui, applied.ui);
    else { ui.screen = 'march'; ui.focus = -1; }
    previewSave = null;
    log.info('resumed expedition exactly where filed', { tick: march.tick, screen: ui.screen, runId });
  }
  function discardSaved() {
    storage.clear(SAVE_KEY);
    config = { seed: params.seed !== undefined ? params.seed : 0x0ff1ce, speedIndex: params.speed !== undefined ? params.speed : TUNING.defaultSpeedIndex };
    march = createMarch(config.seed); openExpeditionKit(); lastSaveTick = march.tick;
    mandate = createMandate(march.streams.mandate, 0, march.leg, march.encounterCount, party.supplies);
    ui.escLevel = escalationLevel(meta);
    ui.screen = 'title'; ui.focus = 0; ui.paused = true;
    previewSave = null; ui.ticker = []; ui.combat = null; ui.mandateNotice = null; ui.report = null; ui.howtoPage = 0;
    log.info('new expedition staged at title', { seed: config.seed });
  }

  // ---- Input --------------------------------------------------------------
  function markFirstInput() { if (!ui.firstInput) { ui.firstInput = true; log.info('first player input'); } ensureAudio(); }
  function moveFocus(d) { const arr = activeControls(); const n = arr.length; ui.focus = ((ui.focus < 0 ? (d > 0 ? -1 : 0) : ui.focus) + d + n) % n; }
  function activateFocused() { const arr = activeControls(); if (ui.focus >= 0 && ui.focus < arr.length) arr[ui.focus].activate(); }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'e' || k === 'E') { exportLog(log); return; }
    if (k === 'm' || k === 'M') { ui.muted = !ui.muted; log.info('score ' + (ui.muted ? 'muted' : 'unmuted')); markFirstInput(); updateScore(); return; }
    markFirstInput();
    if ((k === 'c' || k === 'C') && (ui.screen === 'march' || ui.screen === 'combat') && (ui.paused || ui.holdPause)) {
      openCredits(ui.screen); e.preventDefault(); return;
    }
    if (ui.screen === 'combat') {
      const cb = ui.combat;
      if (cb && cb.draft) {
        const n = cb.draft.options.length + 1; // + decline
        if (k === 'Tab' || k === 'ArrowRight') { cb.draft.focus = (cb.draft.focus + 1) % n; e.preventDefault(); }
        else if (k === 'ArrowLeft') { cb.draft.focus = (cb.draft.focus - 1 + n) % n; e.preventDefault(); }
        else if (k === 'Enter' || k === ' ' || k === 'Spacebar') { takeDraft(cb.draft.focus >= cb.draft.options.length ? -1 : cb.draft.focus); e.preventDefault(); }
        return;
      }
      if (k >= '1' && k <= '9') { playCard(parseInt(k, 10) - 1); e.preventDefault(); return; }
      if (k === ' ' || k === 'Spacebar') { ui.paused = !ui.paused; e.preventDefault(); return; }
      if (k === 'ArrowRight') { setSpeed(config.speedIndex + 1); e.preventDefault(); return; }
      if (k === 'ArrowLeft') { setSpeed(config.speedIndex - 1); e.preventDefault(); return; }
      if (k === 'h' || k === 'H') { if (!ui.holdPause) ui.holdPause = true; e.preventDefault(); return; }
      return;
    }
    if (k === 'Tab') { moveFocus(e.shiftKey ? -1 : 1); e.preventDefault(); return; }
    if (k === 'Enter') { activateFocused(); e.preventDefault(); return; }
    if (k === 'Escape') {
      if (ui.screen === 'deck') { ui.screen = 'camp'; ui.focus = 1; }
      else if (ui.screen === 'shop') { closeShop(); }
      else if (ui.screen === 'route') { ui.route = null; ui.screen = 'camp'; ui.focus = 0; }
      else if (ui.screen === 'credits') { closeCredits(); }
      else if (ui.screen === 'howto') { closeHowto(); }
      else ui.focus = -1;
      return;
    }
    if (ui.screen === 'docket' || ui.screen === 'defeat') {
      if (k === 'Tab' || k === 'ArrowRight') { moveFocus(1); e.preventDefault(); }
      else if (k === 'ArrowLeft') { moveFocus(-1); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') { activateFocused(); e.preventDefault(); }
      return;
    }
    if (ui.screen === 'title' || ui.screen === 'howto') {
      if (k === 'Tab' || k === 'ArrowRight' || k === 'ArrowDown') { moveFocus(1); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { moveFocus(-1); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') { activateFocused(); e.preventDefault(); }
      return;
    }
    if (ui.screen === 'camp') {
      const c = buildCampControls()[ui.focus];
      if (k === 'ArrowLeft') { if (c && c.cycle) cycleFrameJob(c.frameIndex, -1); else moveFocus(-1); e.preventDefault(); }
      else if (k === 'ArrowRight') { if (c && c.cycle) cycleFrameJob(c.frameIndex, 1); else moveFocus(1); e.preventDefault(); }
      return;
    }
    if (ui.screen === 'deck' || ui.screen === 'shop' || ui.screen === 'route' || ui.screen === 'intake' || ui.screen === 'credits') {
      if (k === 'ArrowLeft') { moveFocus(-1); e.preventDefault(); }
      else if (k === 'ArrowRight') { moveFocus(1); e.preventDefault(); }
      return;
    }
    if (k === 'ArrowRight') { setSpeed(config.speedIndex + 1); e.preventDefault(); }
    else if (k === 'ArrowLeft') { setSpeed(config.speedIndex - 1); e.preventDefault(); }
    else if (k === ' ' || k === 'Spacebar') { ui.paused = !ui.paused; e.preventDefault(); }
    else if (k === 'h' || k === 'H') { if (!ui.holdPause) ui.holdPause = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'h' || e.key === 'H') ui.holdPause = false; });

  function toVirtual(ev) {
    const r = canvas.getBoundingClientRect();
    const scale = parseFloat(canvas.dataset.scale || '1');
    return pointerToNative(ev.clientX, ev.clientY, r.left, r.top, scale);
  }
  function hitControl(p) {
    const arr = activeControls();
    for (let i = 0; i < arr.length; i++) { const r = arr[i].rect; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i; }
    return -1;
  }
  canvas.addEventListener('mousemove', (ev) => { ui.hover = hitControl(toVirtual(ev)); });
  canvas.addEventListener('mouseleave', () => { ui.hover = -1; });
  const inRect = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  canvas.addEventListener('mousedown', (ev) => {
    markFirstInput();
    const p = toVirtual(ev);
    if (ui.screen === 'combat' && ui.combat) {
      const cb = ui.combat;
      if (cb.draft && cb.draftRects) { for (let i = 0; i < cb.draftRects.length; i++) if (inRect(p, cb.draftRects[i])) { takeDraft(i === cb.draft.options.length ? -1 : i); return; } }
      else if (cb.handRects) { for (let i = 0; i < cb.handRects.length; i++) if (inRect(p, cb.handRects[i])) { playCard(i); return; } }
    }
    const i = hitControl(p); if (i < 0) return;
    ui.focus = i; const c = activeControls()[i];
    if (c.hold) { ui.holdPause = true; return; }
    if (c.cycle) {
      // Click left edge = previous job, right edge = next; middle just focuses.
      if (p.x <= c.rect.x + 22) cycleFrameJob(c.frameIndex, -1);
      else if (p.x >= c.rect.x + c.rect.w - 16) cycleFrameJob(c.frameIndex, 1);
      return;
    }
    c.activate();
  });
  window.addEventListener('mouseup', () => { ui.holdPause = false; });
  window.addEventListener('beforeunload', () => { if (ui.screen !== 'docket' && ui.screen !== 'defeat') doSave('quit'); });

  // ---- Loop ---------------------------------------------------------------
  let last = null, acc = 0;
  function frame(nowT) {
    if (last == null) last = nowT;
    let dt = nowT - last; last = nowT;
    if (dt > 250) dt = 250;
    const paused = ui.paused || ui.holdPause;
    if (!paused) {
      if (ui.screen === 'march') {
        acc += dt;
        const msPerTick = TUNING.tickMs / speedAt(config.speedIndex);
        let g = 0;
        while (acc >= msPerTick && g < 2000 && ui.screen === 'march') { advanceTicks(1); acc -= msPerTick; g++; }
        if (ui.screen === 'march' && march.tick - lastSaveTick >= TUNING.autosaveHeartbeatTicks) doSave('heartbeat');
      } else if (ui.screen === 'combat' && ui.combat) {
        log.guard('combat', () => tickCombat(dt));
      } else { acc = 0; }
    } else { acc = 0; }
    paint();
    window.requestAnimationFrame(frame);
  }

  if (typeof window !== 'undefined') {
    window.__office = {
      get march() { return march; }, get config() { return config; }, get party() { return party; }, get deck() { return deck; }, get ui() { return ui; }, get meta() { return meta; }, get ledger() { return ledger; }, get runId() { return runId; }, log, storage,
      // The native 320×200 draw buffer — the honest raster, before any display
      // scaling. Proof captures read THIS, never the presented stage.
      get buffer() { return native; },
      advance(n) { advanceTicks(n | 0); paint(); return march.tick; },
      save(r) { doSave(r || 'manual'); return ui.saved; }, setSpeed,
      togglePause() { ui.paused = !ui.paused; paint(); return ui.paused; },
      // Read-only observation helpers for the M9 soak (it drives via real DOM
      // events; these only let it SEE the focus so it can navigate deterministically).
      controlIds() { return activeControls().map((c) => c.id); },
      focusId() { const a = activeControls(); return ui.focus >= 0 && a[ui.focus] ? a[ui.focus].id : null; },
      savedOk() { const raw = storage.read(SAVE_KEY); const p = parseSave(raw); return !!(p && applySave(p).march); },
      stateSnapshot() { return JSON.stringify(saveEnvelope()); },
      textProbe() {
        const off = document.createElement('canvas'); off.width = 240; off.height = 18;
        const oc = off.getContext('2d', { alpha: false });
        oc.fillStyle = '#000'; oc.fillRect(0, 0, off.width, off.height);
        oc.fillStyle = '#fff'; oc.font = '6px monospace'; pixelText(oc, 'Office 0123 — filed ✓', 2, 2);
        const d = oc.getImageData(0, 0, off.width, off.height).data;
        let ink = 0, solid = 0, partial = 0;
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.max(d[i], d[i + 1], d[i + 2]);
          if (lum > 0) { ink++; if (lum === 255) solid++; else partial++; }
        }
        return { ink, solid, partial, solidShare: ink ? solid / ink : 0, antialiasedShare: ink ? partial / ink : 0 };
      },
      layoutProbe() {
        const texts = (ctx.__pixelTextEvents || []).map((e) => ({ ...e }));
        const controlsNow = activeControls().map((c) => ({ id: c.id, ...c.rect }));
        const collisions = [];
        for (const t of texts) for (const c of controlsNow) {
          const hit = t.x < c.x + c.w && t.x + t.w > c.x && t.y < c.y + c.h && t.y + t.h > c.y;
          const owned = t.x >= c.x && t.y >= c.y && t.x + t.w <= c.x + c.w && t.y + t.h <= c.y + c.h;
          if (hit && !owned) collisions.push({ text: t.text, textBox: t, control: c.id, controlBox: c });
        }
        const textCollisions = [];
        for (let i = 0; i < texts.length; i++) {
          for (let j = 0; j < i; j++) {
            const a = texts[i], b = texts[j];
            const hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
            if (hit) textCollisions.push({ a: a.text, b: b.text, aBox: a, bBox: b });
          }
        }
        const tightGaps = findTightInterlineGaps(texts, MIN_INTERLINE_GAP, TEXT_LEADING);
        const outOfBounds = texts.filter((t) => t.x < 0 || t.y < 0 || t.x + t.w > VW || t.y + t.h > VH);
        return { screen: ui.screen, texts: texts.length, textBoxes: texts, controls: controlsNow.length, collisions, textCollisions, tightGaps, outOfBounds };
      },
      // Fast-forward the AUTOMATED resolution of the live fight (not a player verb —
      // it's the beat-by-beat the player would watch). Card plays remain real events.
      advanceCombat() { const cb = ui.combat; if (!cb) return; if (!cb.done) { const r0 = cb.st.round; let g = 0; while (!cb.st.done && cb.st.round === r0 && g++ < 80) { log.guard('step', () => stepCombat(cb.st, march.streams.combat)); } if (cb.st.round > r0 && !cb.st.done) drawUp(deck, TUNING.handSize, march.streams.shuffle); if (cb.st.done) finishCombat(); } if (cb.done && !cb.draft) offerDraftOrEnd(); paint(); },
    };
  }

  if (params.ticks) { advanceTicks(params.ticks); log.info('boot: fast-forwarded ' + params.ticks + ' ticks'); }
  // Proof/deep-link: advance the live resolver by N steps (headless can't drive rAF).
  if (params.beats && ui.screen === 'combat' && ui.combat) {
    for (let i = 0; i < params.beats && !ui.combat.st.done; i++) {
      const entry = stepCombat(ui.combat.st, march.streams.combat);
      if (entry) { spawnFloats(entry); ui.combat.line = phraseFor(entry); }
    }
    if (ui.combat.st.done) { finishCombat(); offerDraftOrEnd(); } // proof: surface the draft
  }
  if (params.camp && ui.screen === 'march') enterCamp(march.leg); // proof/deep-link
  if (params.deck && ui.screen === 'march') { enterCamp(march.leg); openDeck(); } // proof/deep-link
  if (params.shop && ui.screen === 'march') { // proof/deep-link: force a town + seed some kit
    party.gold = 200; party.inventory = ['reinforced_tabard', 'sealed_seal', 'weighted_maul'];
    equipItem(party, 0, 'weighted_maul'); // pre-issue one, so a filled slot is visible
    const townLeg = isTownLeg(march.leg) ? march.leg : march.leg + 1;
    ui.screen = 'camp'; ui.focus = 0; ui.camp = { leg: townLeg, isTown: true };
    ui.shop = generateShop(config.seed, townLeg); ui.shop.pick = null; ui.shop.sel = 0;
    openShop();
    if (params.shopfocus) {
      const idx = buildShopControls().findIndex((c) => c.id === params.shopfocus);
      if (idx >= 0) ui.focus = idx;
      else log.warn('unknown shopfocus control: ' + params.shopfocus);
    }
  }
  if (params.route && ui.screen === 'march') openRoute(); // proof/deep-link
  if (params.dead && ui.screen === 'march') { // proof/deep-link: end + bank + file a report
    earnMastery(runMastery, 'bailiff', 'boss'); earnMastery(runMastery, 'bailiff', 'elite');
    earnMastery(runMastery, 'chirurgeon', 'elite'); earnMastery(runMastery, 'surveyor', 'routine');
    meta.mastery.bailiff = (meta.mastery.bailiff | 0) + TUNING.masteryXpPerLevel - 2; // poised to certify
    // seed an illustrative causal chain for the filed report
    march.leg = 4;
    recordRoute(ledger, 4, { id: 'verge', label: 'The Unassessed Verge', safety: 'exposed', encounterMult: 1.7 });
    recordMatter(ledger, 4, 'elite'); recordMatter(ledger, 4, 'boss');
    recordCredit(ledger, 'closed a contested crossing at leg 3', 18);
    recordMissedWindow(ledger, 4, 'boss', 'The Star', 'Chirurgeon');
    party.supplies = 2; party.gold = 37;
    for (const f of party.frames) { f.hp = 0; f.alive = false; }
    recordReduction(ledger, 4, 'boss', 'Bailiff');
    endExpedition('reduced');
    ui.report && (ui.report.filed = composeReport(ledger, { leg: 4, cause: 'reduced', tier: 'boss', supplies: 2, gold: 37 }));
  }
  if (params.opening && (ui.screen === 'march' || ui.screen === 'title')) {
    beginOpeningMarch('proof opening');
  }
  if (params.asdocket) {
    // proof/deep-link: seed a little run-history so the RECORD column has content
    if (!meta.history.length) { meta.runs = 3; meta.deepestLeg = 6; recordHistory(meta, { leg: 2, cause: 'reduced', gold: 41 }); recordHistory(meta, { leg: 6, cause: 'abandoned', gold: 120 }); recordHistory(meta, { leg: 4, cause: 'reduced', gold: 73 }); }
    previewSave = parseSave(JSON.stringify(saveEnvelope())); ui.screen = 'docket'; ui.focus = 0;
  }
  else if (loaded && ui.screen === 'march') { previewSave = loaded; ui.screen = 'docket'; ui.focus = 0; log.info('boot: returned docket'); }
  else if (ui.screen === 'march') {
    // Fresh boot: title is the door. Deep-links keep the march/combat/etc. surface.
    // Intake remains available via ?intake=1 (Orientation Mandate proof path).
    const anyDeepLink = params.ticks != null || params.beats != null || params.camp || params.deck || params.shop || params.route || params.dead || params.opening;
    if (params.howto) { ui.screen = 'howto'; ui.howtoPage = 0; ui.focus = 0; log.info('boot: how to play'); }
    else if (params.title || (!anyDeepLink && !params.intake)) { ui.screen = 'title'; ui.focus = 0; log.info('boot: title'); }
    else if (params.intake) { ui.screen = 'intake'; ui.focus = 0; log.info('boot: orientation intake'); }
    else { doSave('expedition opened'); }
  }

  if (params.soak && typeof window !== 'undefined') { log.info('M9 soak: driving the player path via real input events'); installSoak(window); }

  window.requestAnimationFrame(frame);
  log.info('boot: ' + ui.screen);
}

function readParams() {
  const out = {};
  if (typeof location === 'undefined' || !location.search) return out;
  const p = new URLSearchParams(location.search);
  if (p.has('seed')) out.seed = (parseInt(p.get('seed'), 10) || 0) >>> 0;
  if (p.has('speed')) out.speed = clampSpeedIndex(parseInt(p.get('speed'), 10) || 0);
  if (p.has('ticks')) out.ticks = Math.max(0, Math.min(100000, parseInt(p.get('ticks'), 10) || 0));
  if (p.has('beats')) out.beats = Math.max(0, Math.min(500, parseInt(p.get('beats'), 10) || 0));
  if (p.has('paused')) out.paused = p.get('paused') !== '0';
  if (p.has('fresh')) out.fresh = p.get('fresh') !== '0';
  if (p.has('asdocket')) out.asdocket = p.get('asdocket') !== '0';
  if (p.has('camp')) out.camp = p.get('camp') !== '0';
  if (p.has('deck')) out.deck = p.get('deck') !== '0';
  if (p.has('shop')) out.shop = p.get('shop') !== '0';
  if (p.has('route')) out.route = p.get('route') !== '0';
  if (p.has('dead')) out.dead = p.get('dead') !== '0';
  if (p.has('intake')) out.intake = p.get('intake') !== '0';
  if (p.has('title')) out.title = p.get('title') !== '0';
  if (p.has('howto')) out.howto = p.get('howto') !== '0';
  if (p.has('opening')) out.opening = p.get('opening') !== '0';
  if (p.has('soak')) out.soak = p.get('soak') !== '0';
  // Proof/deep-link: park the quartermaster's focus on a named control id
  // (buy0, resupply, slot0arm, inv0, sell, back…). The party column reports a
  // DIFFERENT set of strings once an item is focused, so the layout gate, the
  // legibility lint and the capture pass each need to reach that state without
  // synthesising keystrokes.
  if (p.has('shopfocus')) out.shopfocus = String(p.get('shopfocus') || '');
  if (p.has('cvd')) {
    const alias = { deuter: 'deuteranopia', protan: 'protanopia', tritan: 'tritanopia', deuteranopia: 'deuteranopia', protanopia: 'protanopia', tritanopia: 'tritanopia' };
    out.cvd = alias[p.get('cvd')] || null;
  }
  return out;
}

// ---- Rendering -------------------------------------------------------------
export function render(ctx, s) {
  ctx.__pixelTextEvents = [];
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, VW, VH); ctx.textBaseline = 'top';
  if (s.ui.screen === 'docket') return renderDocket(ctx, s);
  if (s.ui.screen === 'defeat') return renderDefeat(ctx, s);
  if (s.ui.screen === 'combat') return renderCombat(ctx, s);
  if (s.ui.screen === 'camp') return renderCamp(ctx, s);
  if (s.ui.screen === 'deck') return renderDeck(ctx, s);
  if (s.ui.screen === 'shop') return renderShop(ctx, s);
  if (s.ui.screen === 'route') return renderRoute(ctx, s);
  if (s.ui.screen === 'intake') return renderIntake(ctx, s);
  if (s.ui.screen === 'title') return renderTitle(ctx, s);
  if (s.ui.screen === 'howto') return renderHowto(ctx, s);
  if (s.ui.screen === 'credits') return renderCredits(ctx, s);
  renderMarch(ctx, s);
}

/**
 * THE MASTHEAD — one thin bar, exactly three zones, on every in-run screen:
 *
 *   LEFT    where you are / what this screen does   (title tier colour)
 *   CENTRE  the state of the run                    (body)
 *   RIGHT   the ledger, in the accent, behind the licensed gold icon
 *
 * It replaces the old two-row header (game name + rule + subtitle) plus the
 * separate LEG/pace/gold stats line that used to sit under it on the march.
 * No new facts: the same figures, consolidated into one place that never moves
 * between screens, so the player learns where to look exactly once.
 */
function masthead(ctx, sub, s) {
  const state = s || {};
  const left = sub || 'THE OFFICE OF THE ROAD';
  // THE UNIT, TAUGHT ONCE. The ledger figure carries its 'G' here and NOWHERE
  // else does the game introduce it: the licensed gold icon sits hard against
  // the number, so `71G` on a shop line downstream is read against a pairing
  // the player has already met on every in-run screen (the legibility law's
  // headline case — a suffix nobody ever defined).
  const goldTxt = state.gold == null ? null : `${state.gold | 0}G`;
  setType(ctx, 'body');
  const rightW = goldTxt == null ? 0 : pixelTextWidth(ctx, goldTxt) + 11;
  drawTopBar(ctx, {
    width: VW,
    left,
    center: state.centerParts
      ? fitCenter(ctx, state.centerParts, 8 + pixelTextWidth(ctx, left), VW - 8 - rightW)
      : (state.center || ''),
    drawRight: goldTxt == null ? null : (rx, ry) => {
      setType(ctx, 'body');
      ctx.fillStyle = ROLE.accent;
      ctx.textAlign = 'right';
      pixelText(ctx, goldTxt, rx, ry);
      const numW = pixelTextWidth(ctx, goldTxt);
      ctx.textAlign = 'left';
      drawIcon(ctx, 'gold', rx - numW - 11, ry - 1, 9);
    },
  });
}

/**
 * Join the masthead's centre facts with the widest separator that still clears
 * BOTH neighbouring zones. The centre is centred on the whole bar, so a long
 * run grows toward the screen name on one side and the gold icon on the other:
 * spelling `enc`→`encounters` and `esc L2`→`escalation 2` cost the wide
 * separator its room in the late game, and the law forbids buying it back by
 * re-abbreviating. So the separator gives way instead, never the words.
 */
const CENTER_PAD = 4;
function fitCenter(ctx, parts, leftEnd, rightStart) {
  const live = parts.filter(Boolean);
  const budget = Math.min(
    VW - 2 * (leftEnd + CENTER_PAD),
    2 * (rightStart - CENTER_PAD) - VW,
  );
  for (const sep of ['  ·  ', ' · ']) {
    const joined = live.join(sep);
    if (pixelTextWidth(ctx, joined) <= budget) return joined;
  }
  return live.join(' · ');
}

/** The run-state line for the masthead's centre zone. Existing facts only. */
function marchCenter(march, mandate) {
  const terrain = TERRAIN_LABEL[march.legProfile && march.legProfile.segs.length
    ? segTerrainAt(march) : null];
  const bits = [`LEG ${march.leg}`, `${march.paces}/${TUNING.legLengthPaces}`];
  if (mandate) bits.push(`TERMINUS ${mandate.destinationLeg}`);
  if (terrain) bits.push(terrain.toUpperCase());
  return bits.join('  ·  ');
}

/** Which terrain band the party is standing in right now. */
function segTerrainAt(march) {
  const segs = march.legProfile.segs;
  let cur = segs[0];
  for (const seg of segs) if (march.paces >= seg.from) cur = seg;
  return cur ? cur.terrain : null;
}

/**
 * THE TITLE — the live scene, read through. There is no scrim: the old build
 * laid a 78%-opaque plate over the bottom 31% of the canvas and then crammed
 * three narrow buttons into what was left, which is what made the menu look
 * squished and the art look like wallpaper behind a form.
 *
 * Now the terrain is darkened once at the tile filter, the party stands on a
 * ground line, the tarot overlaps into a held hand, and the menu is three
 * equal opaque chips laid ON the scene — the chips are their own backing
 * plane. Geometry is TITLE_BAND in title-layout.js, shared with the overlap
 * test so the two can never drift.
 */
function renderTitle(ctx, s) {
  const { ui, titleControls } = s;
  tileFill(ctx, 'toll-wood', 0, 0, VW, VH, 'saturate(14%) brightness(20%) sepia(24%)');
  // A soft floor gradient — many thin bands rather than one plate, so the scene
  // settles toward the menu instead of being cut off by a hard scrim edge.
  const floorTop = TITLE_BAND.partyY + TITLE_BAND.partySize;
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(13,11,10,${Math.min(0.7, 0.05 + i * 0.035)})`;
    ctx.fillRect(0, floorTop + i * 3, VW, 3);
  }

  const prev = ctx.__pixelTextStack;
  ctx.__pixelTextStack = 'title-brand';
  setType(ctx, 'title'); ctx.fillStyle = C.paper;
  const tw = pixelTextWidth(ctx, TITLE_NAME);
  pixelText(ctx, TITLE_NAME, Math.max(4, (VW - tw) >> 1), TITLE_BAND.brandY);
  setType(ctx, 'body'); ctx.fillStyle = ROLE.accent;
  const tagW = pixelTextWidth(ctx, TITLE_TAG);
  pixelText(ctx, TITLE_TAG, Math.max(12, (VW - tagW) >> 1), TITLE_BAND.tagY);
  setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
  const subW = pixelTextWidth(ctx, TITLE_SUB);
  pixelText(ctx, TITLE_SUB, Math.max(12, (VW - subW) >> 1), TITLE_BAND.subY);
  ctx.__pixelTextStack = prev;

  // The party, centred and standing on the floor band (shipped battlers only).
  const px = titlePartyX();
  TITLE_BATTLERS.forEach((key, i) => {
    drawBattler(ctx, key, px + i * TITLE_BAND.partyPitch, TITLE_BAND.partyY, TITLE_BAND.partySize, false);
  });
  // The tarot as a HELD HAND: cards overlap left-to-right, each framed so its
  // neighbour's edge reads as a card behind rather than as glare. Knocked back
  // a shade so the faces sit IN the scene instead of floating over it.
  const hx = titleHandX();
  TITLE_TAROT.forEach((key, i) => {
    drawCardFramed(ctx, key, hx + i * TITLE_BAND.cardPitch, TITLE_BAND.handY,
      TITLE_BAND.cardW, TITLE_BAND.cardH, false, 'brightness(88%) saturate(88%)');
  });

  drawControls(ctx, titleControls || [], ui);
}

function renderHowto(ctx, s) {
  const { ui, howtoControls } = s;
  const page = HOWTO_PAGES[ui.howtoPage | 0] || HOWTO_PAGES[0];
  masthead(ctx, page.masthead.replace(/^HOW TO PLAY: /, ''));
  ctx.font = '7px ui-monospace, monospace';
  let y = 40;
  for (const line of page.lines) {
    ctx.fillStyle = C.dim;
    const rows = drawTextLines(ctx, line, 12, y, VW - 24, 2, TEXT_LEADING);
    y += rows * TEXT_LEADING + 2;
  }
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
  pixelText(ctx, `page ${(ui.howtoPage | 0) + 1}/${HOWTO_PAGES.length}`, 12, 168);
  drawControls(ctx, howtoControls || [], ui);
}

function renderMarch(ctx, s) {
  const { march, party, mandate, ui, controls, log, paused } = s;
  // Left zone: the verb the player is in. Centre: the run's state. Right: the
  // ledger. Every figure here used to live on a separate stats row under a
  // two-row header; nothing new has been added.
  masthead(ctx, 'THE ROAD', {
    centerParts: [
      `LEG ${march.leg}`,
      `pace ${march.paces}/${TUNING.legLengthPaces}`,
      `encounters ${march.encounterCount}`,
      ui.escLevel ? `escalation ${ui.escLevel}` : '',
    ],
    gold: party.gold,
  });

  drawMandateStrip(ctx, mandate, march, MANDATE_Y);
  drawRoute(ctx, march, MARCH_ROUTE_Y);
  const panelsY = MARCH_ROUTE_Y + 24;
  drawParty(ctx, party, 184, panelsY, Math.min(68, CONTROL_BAND_Y - panelsY - 20));
  drawTicker(ctx, ui, 12, panelsY, 164, Math.min(68, CONTROL_BAND_Y - panelsY - 20));

  // Road omen — the last tarot the road showed (an omen, resolving nothing).
  if (ui.omen) {
    const ox = VW - 30, oy = 26;
    drawCard(ctx, ui.omen.arcana, ox, oy, 18, 25);
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
    pixelText(ctx, 'OMEN', ox - 22, oy + 2); pixelText(ctx, ui.omen.name.slice(0, 9), ox - 40, oy + 2 + TEXT_LEADING);
  }

  ctx.font = '7px ui-monospace, monospace';
  ctx.fillStyle = paused ? C.stamp : C.ok;
  pixelText(ctx, paused ? (ui.holdPause ? '[ HELD ]' : '[ PAUSED ]') : '[ MARCHING ]', 12, 166);
  drawSaveIndicator(ctx, ui);
  // The fault count is a plain count. It used to read `faults 3 (E)`, and the
  // parenthesised key was a sigil no first-session player could resolve — the
  // corner has 58px, which spells neither the key nor what it does, so the
  // count keeps the corner and the export stays a keystroke (E) rather than a
  // half-explained badge.
  if (log.errorCount > 0) { ctx.fillStyle = C.stamp; pixelText(ctx, `faults ${log.errorCount}`, 262, 166); }
  // Score indicator (M7): the current band track, and the key that mutes it
  // written as a sentence rather than a bare `(M)`.
  ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = ui.muted ? C.faint : C.dim;
  ctx.textAlign = 'right';
  pixelText(ctx, ui.muted ? 'score muted · M restores' : 'score: ' + trackForScreen('march') + ' · M mutes', VW - 12, CONTENT_TEXT_MAX_Y);
  ctx.textAlign = 'left';
  drawControls(ctx, controls, ui);
}

function renderCombat(ctx, s) {
  const { ui, controls, paused } = s;
  const cb = ui.combat; if (!cb) return;
  // The zero-card law is a STATE fact, so it rides the masthead's centre zone
  // rather than a floating banner at y=25 — which is the lane the damage
  // numerals rise through, and they collided with it.
  masthead(ctx, 'FIELD RESOLUTION', {
    center: cb.left ? '[left routine · intervene]' : '[routine · no cards required]',
  });

  const bs = 30;
  cb.st.enemyW.forEach((w, i) => drawCombatantW(ctx, w, 16 + i * 44, 34, bs, true, cb, battlerForEnemy(i)));
  cb.st.partyW.forEach((w, i) => drawCombatantW(ctx, w, 156 + i * 40, 38, bs, false, cb, battlerForJob(w.e.jobId)));

  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.paper;
  // Owned left-column resolver strip — roster column (x≥156) stays clear.
  if (!cb.draft) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(12, 108, COMBAT_STATUS_W, TEXT_LEADING * 2 + 2);
    ctx.fillStyle = C.paper;
    drawTextLines(ctx, cb.line || '', 12, 109, COMBAT_STATUS_W, 2, TEXT_LEADING);
  }

  if (cb.draft) { drawDraft(ctx, cb, ui); }
  else {
    drawHand(ctx, cb, s.deck.hand);
    // Resolving band below the hand; combatant rows end above y=108.
    ctx.fillStyle = C.ink; ctx.fillRect(114, 124, VW - 126, 8);
    ctx.fillStyle = paused ? C.stamp : C.ok; ctx.font = '7px ui-monospace, monospace';
    drawTextLines(ctx, paused ? '[ PAUSED: play a card; Space runs ]' : '[ RESOLVING ]', 118, 126, VW - 130, 2, TEXT_LEADING);
  }

  drawControls(ctx, controls, ui);
}

function drawCombatantW(ctx, w, x, y, size, flip, cb, battler) {
  const dead = !w.e.alive || w.e.hp <= 0;
  ctx.save(); if (dead) ctx.globalAlpha = 0.35;
  drawBattler(ctx, battler, x, y, size, flip);
  ctx.restore();
  const bw = size, bx = x, by = y + size + 2;
  ctx.fillStyle = C.hpback; ctx.fillRect(bx, by, bw, 3);
  const frac = Math.max(0, w.e.hp / w.e.max.hp);
  ctx.fillStyle = frac < 0.34 ? C.hplow : C.hp; ctx.fillRect(bx, by, Math.round(bw * frac), 3);
  setType(ctx, 'caption');
  const name = dead ? '(reduced)' : w.e.name;
  const nameW = pixelTextWidth(ctx, name);
  let nameX = bx;
  if (nameX + nameW > VW - 12) nameX = Math.max(0, VW - 12 - nameW);
  const hpY = by + 4;
  // The longest roster name (Chirurgeon, 45px) is wider than one 40px column,
  // so names ALTERNATE between two rows instead of cascading down four. The
  // old one-row-per-index stagger walked the last name into the resolver band
  // and read as a diagonal spill rather than a roster.
  const nameY = hpY + TEXT_LEADING * (1 + ((w.idx | 0) % 2));
  if (!dead) {
    ctx.fillStyle = ROLE.accent;
    // Tagged `hp-figure` — the lint clears an unworded X/Y only when the bar it
    // annotates is drawn against it, which here is the 3px bar directly above.
    const prevHp = ctx.__pixelTextStack; ctx.__pixelTextStack = 'hp-figure';
    pixelText(ctx, `${w.e.hp}/${w.e.max.hp}`, bx, hpY);
    ctx.__pixelTextStack = prevHp;
  }
  ctx.fillStyle = dead ? ROLE.danger : ROLE.body;
  pixelText(ctx, name, nameX, nameY);
  const floats = cb.floats.filter((f) => f.side === w.side && f.idx === w.idx);
  const visibleFloats = 4;
  for (let i = 0; i < floats.length && i < visibleFloats; i++) {
    const f = floats[i];
    const floatX = x + size / 2 - 4;
    const floatY = by - 12 - i * TEXT_LEADING;
    if (floatY < AFTER_MASTHEAD_Y) break;
    ctx.fillStyle = f.color; ctx.font = '7px ui-monospace, monospace';
    pixelText(ctx, f.text, floatX, floatY);
  }
}

// The window words live in combat.js beside the states they name, so the text
// gate measures exactly what the plate draws.
const WINDOW_COLOR = { decisive: C.focus, playable: C.dim, wasted: C.faint };
function drawHand(ctx, cb, hand) {
  const cw = 30, ch = 32, y = 130, gap = 4;
  cb.handRects = [];
  for (let i = 0; i < hand.length; i++) {
    const x = 12 + i * (cw + gap);
    const state = cb.st.done ? 'wasted' : evaluateCard(cb.st, hand[i]);
    const card = getCard(hand[i]);
    const stateCol = WINDOW_COLOR[state] || C.dim;
    // Frame the face, then hang the input number + window state on their OWN
    // strip under it. Both used to be printed over the card art, where a bright
    // tarot face swallowed them and neither the key nor the state was readable.
    ctx.fillStyle = C.shadow; ctx.fillRect(x, y + 1, cw + 1, ch + 1);
    ctx.fillStyle = stateCol;
    ctx.fillRect(x - 1, y - 1, cw + 2, ch + 2);
    if (state === 'decisive') ctx.fillRect(x - 2, y - 2, cw + 4, ch + 4);
    drawCard(ctx, card.arcana, x, y, cw, ch);
    ctx.fillStyle = state === 'decisive' ? stateCol : C.control2;
    ctx.fillRect(x - 1, y + ch + 1, cw + 2, 11);
    setType(ctx, 'caption');
    ctx.fillStyle = state === 'decisive' ? C.ink : stateCol;
    pixelText(ctx, `${i + 1} ${WINDOW_LABEL[state] || state}`, x + 2, y + ch + 3);
    cb.handRects.push({ x, y, w: cw, h: ch });
  }
  // input hint
  setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
  pixelText(ctx, 'press 1–3 or click a card', 118, 136);
}

function drawDraft(ctx, cb, ui) {
  const foc = cb.draft.options[cb.draft.focus];
  const introY = 112;
  if (foc) {
    setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
    drawTextFit(ctx, getCard(foc).text, 12, introY, VW - 24);
  }
  setType(ctx, 'body'); ctx.fillStyle = C.paper;
  drawTextLines(ctx, 'OFFERED FOR THE FILE: take one, or decline', 12, introY + TEXT_LEADING, VW - 24, 1, TEXT_LEADING);
  // Geometry is DRAFT_TILE in layout.js, shared with the no-truncation test so
  // the plate and the law cannot drift. The tile is wider than the art it holds
  // because a name plate is sized to the CATALOG: the widest card name measures
  // 48px, the old 32px zone ellipsized five of the twelve, and a name is one
  // unbreakable token that no amount of line-wrapping will fit into 32px.
  const T = DRAFT_TILE;
  cb.draftRects = [];
  cb.draft.options.forEach((id, i) => {
    const tx = draftTileX(i);
    const ax = tx + ((T.w - T.artW) >> 1); // the art rides centred on its tile
    const focused = cb.draft.focus === i;
    // Name on its OWN plate under the art, exactly as in deck review — printed
    // over a bright tarot face it was unreadable.
    drawCardFramed(ctx, getCard(id).arcana, ax, T.artY, T.artW, T.artH, focused);
    ctx.fillStyle = focused ? ROLE.accent : C.control2;
    ctx.fillRect(tx, T.plateY, T.w, T.plateH);
    setType(ctx, 'caption'); ctx.fillStyle = focused ? C.ink : C.paper;
    const name = cardPlateName(id);
    const nameW = pixelTextWidth(ctx, name);
    const prev = ctx.__pixelTextStack;
    ctx.__pixelTextStack = `draft-name:${i}`;
    drawTextFit(ctx, name, tx + Math.max(1, (T.w - nameW) >> 1), T.nameY, T.nameW);
    ctx.__pixelTextStack = prev;
    if (focused) drawPointer(ctx, tx - 8, T.artY + ((T.artH - 7) >> 1));
    // The whole tile takes the click, name plate included — the name is part of
    // the offer, not a caption beside it.
    cb.draftRects.push({ x: tx, y: T.artY - 1, w: T.w, h: T.plateY + T.plateH - T.artY + 1 });
  });
  // decline button
  const declineFocused = cb.draft.focus >= cb.draft.options.length;
  const rect = { x: T.declineX, y: T.declineY, w: T.declineW, h: T.declineH };
  const skin = drawChip(ctx, rect, { priority: 'secondary', focused: declineFocused });
  drawChipLabel(ctx, rect, 'DECLINE', skin.label);
  cb.draftRects.push(rect);
}

function drawCard(ctx, artKey, x, y, w, h, filter = 'none') {
  const img = ART_IMAGES[artKey];
  if (!img || !img.complete || img.naturalWidth === 0) {
    ctx.strokeStyle = C.stamp; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = C.stamp; setType(ctx, 'caption'); pixelText(ctx, 'card?', x + 2, y + 2); return;
  }
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.filter = filter;
  ctx.drawImage(img, 0, 0, TAROT_FRAME.w, TAROT_FRAME.h, x, y, w, h);
  ctx.restore();
}

/**
 * A tarot face as an OBJECT on the page: 1px drop shadow, a keyline in the
 * card's own dark register, and the accent keyline when it is selected. The
 * faces are bright parchment; without a frame they read as glare on the dark
 * board rather than as cards laid on a desk.
 */
function drawCardFramed(ctx, artKey, x, y, w, h, focused, filter = 'none') {
  ctx.fillStyle = C.shadow;
  ctx.fillRect(x, y + 1, w + 1, h + 1);
  ctx.fillStyle = focused ? ROLE.accent : C.control2;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  drawCard(ctx, artKey, x, y, w, h, filter);
}

function drawParty(ctx, party, x, y, h = 78) {
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.faint; pixelText(ctx, 'THE PARTY', x, y - 9);
  drawPanel(ctx, x, y, VW - x - 12, h);
  party.frames.forEach((f, i) => {
    const fy = y + 4 + i * TEXT_LEADING + i * MIN_INTERLINE_GAP;
    const dead = !f.alive || f.hp <= 0;
    // battler thumbnail
    drawBattler(ctx, battlerForJob(f.jobId), x + 3, fy, 13, false);
    ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = dead ? C.stamp : C.dim;
    pixelText(ctx, f.name.slice(0, 10), x + 19, fy);
    // hp bar
    const bx = x + 19, by = fy + 8, bw = VW - x - 12 - 19 - 6;
    ctx.fillStyle = C.hpback; ctx.fillRect(bx, by, bw, 3);
    const frac = Math.max(0, f.hp / f.max.hp);
    ctx.fillStyle = frac < 0.34 ? C.hplow : C.hp; ctx.fillRect(bx, by, Math.round(bw * frac), 3);
    ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = C.faint;
    // Tagged `hp-figure`: the one X/Y the legibility lint clears without a word
    // beside it, because the bar it annotates is drawn directly beneath it.
    const prevHp = ctx.__pixelTextStack; ctx.__pixelTextStack = 'hp-figure';
    pixelText(ctx, `${f.hp}/${f.max.hp}`, bx + bw - 22, fy);
    ctx.__pixelTextStack = prevHp;
  });
  // Instruments with pack iconography (M6): a provision bag + the gold orb.
  const ly = y + h - 11;
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  drawIcon(ctx, 'supplies', x + 3, ly, 9); pixelText(ctx, '' + party.supplies, x + 14, ly + 2);
  drawIcon(ctx, 'gold', x + 44, ly, 9); pixelText(ctx, '' + party.gold, x + 55, ly + 2);
}

function renderDocket(ctx, s) {
  const { previewSave, meta, ui, docketControls } = s;
  masthead(ctx, 'RETURNED DOCKET');
  setType(ctx, 'body'); ctx.fillStyle = ROLE.body;
  pixelText(ctx, 'An expedition remains open on file. It may be resumed', 12, AFTER_MASTHEAD_Y);
  pixelText(ctx, 'exactly where it was left, or filed anew.', 12, AFTER_MASTHEAD_Y + TEXT_LEADING);
  const m = previewSave && previewSave.march, pty = previewSave && previewSave.party;
  // ON FILE (left column) — the open expedition.
  const fileTop = AFTER_MASTHEAD_Y + TEXT_LEADING * 2 + MIN_INTERLINE_GAP + 4;
  // Tall enough for the label, five history rows AND the summary row beneath
  // them — at 74 the summary printed straight across the panel's bottom edge.
  const filePanelH = 16 + TEXT_LEADING * 6 + 6;
  const DOCKET_FILE_W = 168 - (20 - 12) - 4; // the ON FILE panel's inner text column
  drawPanel(ctx, 12, fileTop, 168, filePanelH);
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'ON FILE', 18, fileTop + 4);
  ctx.fillStyle = C.dim;
  if (m) {
    pixelText(ctx, `world seed ${previewSave.config.seed}`, 20, fileTop + 16);
    pixelText(ctx, `leg ${m.leg} · pace ${m.paces}/${TUNING.legLengthPaces}`, 20, fileTop + 16 + TEXT_LEADING);
    pixelText(ctx, `encounters ${m.encounterCount} · tick ${previewSave.savedAtTick}`, 20, fileTop + 16 + TEXT_LEADING * 2);
    if (pty) {
      // The trades were abbreviated to three letters and joined with slashes —
      // `Bai/Chi/Sur/Sum`, which names nothing. They are spelled and wrapped
      // instead, and the stores line moves under them with `sup` spelled too.
      // This panel carries the gold icon of its own: the docket is reachable
      // from the title without ever passing an in-run masthead, so the unit
      // must be taught here as well as there.
      const rosterY = fileTop + 16 + TEXT_LEADING * 3;
      const rosterRows = drawTextLines(ctx, pty.frames.map((f) => (JOBS[f.jobId] ? JOBS[f.jobId].name : 'unassigned')).join(' · '), 20, rosterY, DOCKET_FILE_W, 2, TEXT_LEADING);
      const storesY = rosterY + Math.max(1, rosterRows) * TEXT_LEADING;
      const supText = `supplies ${pty.supplies}  ·`;
      pixelText(ctx, supText, 20, storesY);
      const goldX = 20 + pixelTextWidth(ctx, supText) + 4;
      drawIcon(ctx, 'gold', goldX, storesY - 2, 9);
      pixelText(ctx, `${pty.gold | 0}G`, goldX + 11, storesY);
    }
  } else { ctx.fillStyle = C.stamp; pixelText(ctx, '(the file could not be read)', 20, fileTop + 16 + TEXT_LEADING); }
  // RECORD (right column) — the certification ledger's rolling run-history (M8).
  drawPanel(ctx, 188, fileTop, VW - 12 - 188, filePanelH);
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'EXPEDITIONS FILED', 194, fileTop + 4);
  const hist = (meta && meta.history) || [];
  if (!hist.length) { ctx.fillStyle = C.faint; drawTextLines(ctx, '(no expeditions on record)', 194, fileTop + 18, VW - 200, 1, TEXT_LEADING); }
  ctx.fillStyle = C.dim;
  hist.slice(0, 5).forEach((hh, i) => {
    drawTextLines(ctx, `#${hh.run} leg ${hh.leg} ${hh.cause === 'abandoned' ? 'return' : 'reduced'} ${hh.gold}¤`, 194, fileTop + 16 + i * TEXT_LEADING, VW - 200, 1, TEXT_LEADING);
  });
  if (meta) { ctx.fillStyle = C.faint; pixelText(ctx, `${meta.runs | 0} filed · deepest leg ${meta.deepestLeg | 0}`, 194, fileTop + 16 + 5 * TEXT_LEADING); }
  drawControls(ctx, docketControls, ui);
  ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, 'Tab / ← →  choose   ·   Enter  file', 12, 176);
}

function cleanAttributionLine(lineStr) {
  return String(lineStr)
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*-\s+/, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function attributionPages(ctx, raw) {
  const lines = [];
  for (const sourceLine of String(raw || '').split(/\r?\n/)) {
    const cleaned = cleanAttributionLine(sourceLine);
    if (/^---+$/.test(cleaned.trim())) continue;
    if (!cleaned.trim()) { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); continue; }
    lines.push(...wrapLines(ctx, cleaned, VW - 24));
  }
  const perPage = 12, pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages.length ? pages : [['(No attribution notice was embedded.)']];
}

function renderCredits(ctx, s) {
  const { ui, creditsControls } = s;
  masthead(ctx, 'CREDITS & LICENSING: SHIPPED WITH THE FILE');
  ctx.font = '6px ui-monospace, monospace';
  const pages = attributionPages(ctx, s.attributionText || ATTRIBUTION_CONTENT);
  ui.creditsPage = Math.max(0, Math.min(ui.creditsPage | 0, pages.length - 1));
  ctx.fillStyle = C.faint;
  pixelText(ctx, `CREDITS · page ${ui.creditsPage + 1}/${pages.length}`, 12, AFTER_MASTHEAD_Y);
  let y = AFTER_MASTHEAD_Y + TEXT_LEADING;
  for (const lineStr of pages[ui.creditsPage]) {
    ctx.fillStyle = /^ATTRIBUTION|^Visual art$|^Score$|^Willibab|^GuttyKreum|^RonnyG/.test(lineStr) ? C.paper : C.dim;
    if (lineStr) drawTextLines(ctx, lineStr, 12, y, VW - 24, 1, TEXT_LEADING);
    y += TEXT_LEADING;
  }
  drawControls(ctx, creditsControls || [], ui);
}

function renderCamp(ctx, s) {
  const { party, ui, campControls } = s;
  const town = ui.camp && ui.camp.isTown;
  masthead(ctx, town ? 'TOWN' : 'CAMP', {
    centerParts: [`LEG ${ui.camp ? ui.camp.leg : '?'}`, `supplies ${party.supplies}`],
    gold: party.gold,
  });
  setType(ctx, 'body'); ctx.fillStyle = ROLE.body;
  const introLines = drawTextLines(ctx, town ? 'A town is reached. A quartermaster is in attendance; reassignment is permitted.'
                    : 'Camp is made. Reassignment is permitted; rest is billed to the file.', 12, AFTER_MASTHEAD_Y, VW - 24, 2, TEXT_LEADING);
  const detailY = AFTER_MASTHEAD_Y + introLines * TEXT_LEADING + MIN_INTERLINE_GAP;
  setType(ctx, 'caption');
  if (ui.noProgress) {
    ctx.fillStyle = ROLE.danger;
    drawTextLines(ctx, '⚠ NO PROGRESS ON FILE: two legs without gain. Early return is available (below).', 12, detailY, VW - 24, 1, TEXT_LEADING);
  } else {
    // supplies + ledger now live in the masthead; this row carries only the
    // cost of the verb on this screen.
    ctx.fillStyle = ROLE.caption;
    drawTextLines(ctx, 'rest: −' + TUNING.campRecoverSupplyCost + ' supplies restores half of missing HP', 12, detailY, VW - 24, 1, TEXT_LEADING);
  }

  for (let i = 0; i < campControls.length; i++) {
    const c = campControls[i], r = c.rect, focused = ui.focus === i;
    if (c.cycle) {
      // A frame row IS a control (it cycles the trade), so it speaks the chip
      // language too — a wide secondary chip carrying its own columns.
      const f = party.frames[c.frameIndex];
      const dead = !f.alive || f.hp <= 0;
      drawChip(ctx, r, { priority: 'secondary', focused, hover: ui.hover === i });
      drawBattler(ctx, battlerForJob(f.jobId), r.x + 3, r.y + 1, 14, false, false);
      setType(ctx, 'body'); ctx.fillStyle = ROLE.caption;
      pixelText(ctx, '◄', r.x + 21, r.y + 4);
      pixelText(ctx, '►', r.x + r.w - 12, r.y + 4);
      ctx.fillStyle = dead ? ROLE.danger : C.paper;
      drawTextLines(ctx, f.name, r.x + 32, r.y + 4, 70, 1, TEXT_LEADING);
      setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
      const jobTextW = r.w - 126; // reserve both job-cycle arrows and the right inset
      drawTextFit(ctx, `hp ${f.hp}/${f.max.hp}  atk ${f.max.atk} def ${f.max.def} mag ${f.max.mag} spd ${f.max.spd}`, r.x + 108, r.y + 4, jobTextW);
    } else {
      const skin = drawChip(ctx, r, { priority: c.priority || 'secondary', focused, hover: ui.hover === i });
      drawChipLabel(ctx, r, typeof c.label === 'function' ? c.label() : c.label, c.warn ? C.stamp : skin.label);
    }
  }
}

// The route board (M4). One card per branch: a deadpan road-name + safety word
// (the non-numeric channel) over exact instruments — encounter ×, pay ×, and the
// supply toll. Safety-vs-resource, legible at a glance.
function renderRoute(ctx, s) {
  const { party, march, mandate, ui, routeControls } = s;
  const r = ui.route; if (!r) return;
  masthead(ctx, 'ROUTE', {
    centerParts: [
      `LEG ${r.legIndex}`,
      `supplies ${party.supplies}`,
      `terminus leg ${mandate ? mandate.destinationLeg : '?'}`,
    ],
    gold: party.gold,
  });
  setType(ctx, 'body'); ctx.fillStyle = ROLE.body;
  drawTextLines(ctx, 'The next stretch is routed. The tradeoff is on file; choose the road.', 12, AFTER_MASTHEAD_Y, VW - 24, 2, TEXT_LEADING);

  const arr = routeControls || [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], rect = c.rect, b = r.branches[c.branch], focused = ui.focus === i;
    // One decision per card: the road, its safety word, its three instruments,
    // its note, and the verb. The card is a chip — the whole card is the button.
    drawChip(ctx, rect, { priority: focused ? 'primary' : 'secondary', focused, hover: ui.hover === i });
    // On the parchment chip every ink is a DARKENED member of its own role, at
    // a factor measured to clear 4.5:1 on that fill (see legibility.js).
    const ON_CHIP = 0.42;
    const ink = focused ? C.ink : C.paper;
    const soft = focused ? shade(C.dim, ON_CHIP) : ROLE.caption;
    setType(ctx, 'body'); ctx.fillStyle = ink;
    const labelRows = drawTextLines(ctx, b.label, rect.x + 5, rect.y + 5, rect.w - 10, 2, TEXT_LEADING);
    const safeY = rect.y + 5 + labelRows * TEXT_LEADING + MIN_INTERLINE_GAP;
    const safeBase = b.safety === 'guarded' ? C.ok : b.safety === 'exposed' ? C.stamp : C.dim;
    setType(ctx, 'caption'); ctx.fillStyle = focused ? shade(safeBase, ON_CHIP) : safeBase;
    pixelText(ctx, '[' + b.safety + ']', rect.x + 5, safeY);
    // exact instruments — figures in the accent role where the chip allows it
    ctx.fillStyle = focused ? shade(C.control, 0.32) : ROLE.accent;
    pixelText(ctx, `encounters ×${b.encounterMult}`, rect.x + 5, safeY + TEXT_LEADING);
    pixelText(ctx, `pay ×${b.goldMult}`, rect.x + 5, safeY + TEXT_LEADING * 2);
    ctx.fillStyle = b.supplyToll > 0 ? (focused ? shade(C.stamp, ON_CHIP) : C.stamp) : soft;
    pixelText(ctx, b.supplyToll > 0 ? `toll −${b.supplyToll} supplies` : 'no toll', rect.x + 5, safeY + TEXT_LEADING * 3);
    ctx.fillStyle = soft;
    const noteY = safeY + TEXT_LEADING * 4 + MIN_INTERLINE_GAP;
    drawTextLines(ctx, b.note, rect.x + 5, noteY, rect.w - 10, 1, TEXT_LEADING);
    ctx.fillStyle = focused ? C.ink : ROLE.accent;
    drawTextLines(ctx, focused ? '▸ TAKE ROAD' : 'TAKE ROAD', rect.x + 5, rect.y + rect.h - 11, rect.w - 10, 1, TEXT_LEADING);
  }
  setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
  drawTextLines(ctx, 'Tab / ← → compare · Enter take road · Esc back', 12, CONTENT_TEXT_MAX_Y, VW - 24, 1, TEXT_LEADING);
}

/**
 * Which item the quartermaster board is currently reporting on. Mouse hover wins
 * when the pointer is over a control, else the keyboard focus — both drive the
 * detail band, so either input reveals the same particulars.
 */
function shopDetailItem(s) {
  const arr = s.shopControls || [];
  const c = arr[s.ui.hover >= 0 ? s.ui.hover : s.ui.focus];
  if (!c) return null;
  if (c.kind === 'buy') { const l = s.ui.shop.lines[c.line]; return l ? l.id : null; }
  if (c.kind === 'inv') return c.itemId;
  if (c.kind === 'slot') return s.party.frames[c.frameIndex].equip[c.slot] || null;
  if (c.kind === 'sell') return s.ui.shop.pick || null;
  return null;
}

/**
 * THE DETAIL BAND — selection reveals the particulars (KotPP). The chips on the
 * board carry a name and a figure and nothing else, so no player-facing string
 * has to be ellipsized to make room; the full effects are reported here instead,
 * directly beneath the ISSUE list. Two lines, 150px, clear of the party column.
 */
function shopDetail(ctx, s) {
  const shop = s.ui.shop;
  const y = shopDetailY(shop.lines ? shop.lines.length : 0);
  const W = 150;
  const prev = ctx.__pixelTextStack; ctx.__pixelTextStack = 'shop-detail';
  setType(ctx, 'caption');
  const id = shopDetailItem(s);
  if (!id) {
    ctx.fillStyle = ROLE.caption;
    drawTextLines(ctx, 'Pick an item, then a slot.', 10, y, W, 1, TEXT_LEADING);
    ctx.__pixelTextStack = prev; return;
  }
  const it = getItem(id);
  ctx.fillStyle = C.paper; pixelText(ctx, it.name, 10, y);
  ctx.fillStyle = ROLE.accent; pixelText(ctx, modsLine(id), 10 + pixelTextWidth(ctx, it.name + '  '), y);
  ctx.fillStyle = ROLE.caption;
  drawTextLines(ctx, `${it.slot} slot · sells at ${sellValue(id)}¤`, 10, y + TEXT_LEADING, W, 1, TEXT_LEADING);
  ctx.__pixelTextStack = prev;
}

/**
 * The item the PARTY COLUMN is reporting against. Narrower than the detail
 * band's: a slot chip is a destination, not a purchase, so it reports the
 * item already picked (that is the whole "item then slot" gesture) rather than
 * whatever is currently bolted into the slot.
 */
function shopStatItem(s) {
  const arr = s.shopControls || [];
  const c = arr[s.ui.hover >= 0 ? s.ui.hover : s.ui.focus];
  const pick = s.ui.shop.pick || null;
  if (!c) return pick;
  if (c.kind === 'buy') { const l = s.ui.shop.lines[c.line]; return l && !l.sold ? l.id : null; }
  if (c.kind === 'inv') return c.itemId;
  return pick; // slot / sell / back — carry the pick through the slot choice
}

/** The stat an item is chiefly about: the ledger's three first, then anything. */
function primaryModKey(it) {
  return SHOP_STAT_KEYS.find((k) => it.mods[k] != null) || Object.keys(it.mods)[0] || null;
}

/**
 * THE PARTY COLUMN (option B). At rest, one labelled figure per frame. Under
 * focus or hover of a purchasable item, the SAME line becomes that item's
 * effect on that frame, current and target, replacement included.
 */
function drawPartyStats(ctx, s) {
  const { party } = s;
  const id = shopStatItem(s);
  const it = id ? getItem(id) : null;
  const key = it ? primaryModKey(it) : null;
  setType(ctx, 'caption');
  party.frames.forEach((f, i) => {
    const y = SHOP_FRAME_Y0 + i * SHOP_FRAME_PITCH;
    const prev = ctx.__pixelTextStack;
    ctx.__pixelTextStack = `shop-frame:${i}`;
    ctx.fillStyle = (!f.alive || f.hp <= 0) ? C.stamp : C.paper;
    drawTextLines(ctx, f.name, STAT_ZONE_X, y + 1, STAT_ZONE_W, 1, TEXT_LEADING);
    const statY = y + 1 + TEXT_LEADING;
    let x = STAT_ZONE_X;
    if (!key) {
      // At rest: the one figure that means the same thing on every frame.
      ctx.fillStyle = ROLE.caption;
      x += pixelText(ctx, 'hp', x, statY) + 3;
      ctx.fillStyle = ROLE.accent;
      pixelText(ctx, `${f.hp}/${f.max.hp}`, x, statY);
    } else {
      const cur = f.max[key] | 0;
      const displaced = f.equip[it.slot];
      const oldMod = displaced ? (getItem(displaced).mods[key] | 0) : 0;
      const target = cur - oldMod + (it.mods[key] | 0);
      ctx.fillStyle = ROLE.caption;
      x += pixelText(ctx, key, x, statY) + 3;
      ctx.fillStyle = ROLE.accent;
      x += pixelText(ctx, String(cur), x, statY) + 3;
      ctx.fillStyle = ROLE.caption;
      x += pixelText(ctx, '>', x, statY) + 3;
      ctx.fillStyle = target > cur ? ROLE.confirm : target < cur ? ROLE.danger : ROLE.caption;
      pixelText(ctx, String(target), x, statY);
    }
    ctx.__pixelTextStack = prev;
  });
}

// The quartermaster board (M4). Buy lines + always-open resupply (left), party
// frames with slot chips (right), loose stores + sell/back (bottom). Every line
// ships its exact figure (register law 6). Pick an item, then a matching slot.
function renderShop(ctx, s) {
  const { party, ui, shopControls } = s;
  const shop = ui.shop; if (!shop) return;
  masthead(ctx, 'QUARTERMASTER', {
    centerParts: [
      `LEG ${shop.legIndex}`,
      `supplies ${party.supplies}`,
      `sell ${Math.round(TUNING.shopSellFraction * 100)}%`,
    ],
    gold: party.gold,
  });
  // Two columns, two labels — the ledger line that used to sit here moved into
  // the masthead's right zone, which is where every screen now reports it.
  panelLabel(ctx, 'ISSUE (requisition)', 10, AFTER_MASTHEAD_Y);
  panelLabel(ctx, 'THE PARTY · ITEM THEN SLOT', 166, AFTER_MASTHEAD_Y);

  const arr = shopControls || [];
  const pick = shop.pick;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], r = c.rect, focused = ui.focus === i;
    if (c.kind === 'buy') {
      const l = shop.lines[c.line], it = getItem(l.id);
      // A taken line desaturates IN PLACE — same rect, same label position.
      drawChip(ctx, r, { priority: 'secondary', state: l.sold ? 'disabled' : 'normal', focused, hover: ui.hover === i });
      setType(ctx, 'caption'); ctx.fillStyle = l.sold ? C.controlOffInk : C.paper;
      const prev = ctx.__pixelTextStack;
      ctx.__pixelTextStack = `shop-buy:${c.line}`;
      // THE FULL NAME, never a slice. The line used to concatenate the name with
      // its effects and ellipsize the pair ("Regulation J +2 def +..."), which
      // mangled both. The effects now live in the detail band below the list, so
      // the chip needs only the name (longest: 85px) and the price reserve (26px).
      drawTextFit(ctx, it.name, r.x + 4, r.y + 2, r.w - 34);
      ctx.__pixelTextStack = prev;
      ctx.textAlign = 'right'; ctx.fillStyle = l.sold ? C.controlOffInk : ROLE.accent;
      pixelText(ctx, l.sold ? 'TAKEN' : l.price + '¤', r.x + r.w - 4, r.y + 2); ctx.textAlign = 'left';
    } else if (c.kind === 'resupply') {
      drawChip(ctx, r, { priority: 'secondary', focused, hover: ui.hover === i });
      setType(ctx, 'caption'); ctx.fillStyle = C.paper;
      pixelText(ctx, `RESUPPLY  +${TUNING.resupplyBlock} supplies`, r.x + 4, r.y + 3);
      ctx.textAlign = 'right'; ctx.fillStyle = ROLE.accent;
      pixelText(ctx, TUNING.resupplyCost + '¤', r.x + r.w - 4, r.y + 3); ctx.textAlign = 'left';
    } else if (c.kind === 'slot') {
      // Icon LEFT, name RIGHT — they used to be drawn on top of each other.
      const f = party.frames[c.frameIndex]; const id = f.equip[c.slot];
      const canEquip = pick && getItem(pick).slot === c.slot;
      drawChip(ctx, r, { priority: canEquip ? 'primary' : 'secondary', focused, hover: ui.hover === i });
      drawIcon(ctx, c.slot, r.x + 2, r.y + 3, 9); // sword/shield icon (pack art)
      setType(ctx, 'caption');
      ctx.fillStyle = canEquip ? C.ink : id ? C.paper : ROLE.caption;
      // An empty slot said `-`, which labels nothing — the same bare hyphen the
      // combat hand strip used for its empty window. `none` fits the 20px the
      // chip leaves beside its icon, and matches the word the hand now uses.
      drawTextFit(ctx, id ? getItem(id).name.split(' ').pop() : 'none', r.x + 13, r.y + 4, r.w - 16);
    } else if (c.kind === 'inv') {
      const picked = pick === c.itemId;
      drawChip(ctx, r, { priority: picked ? 'primary' : 'secondary', focused, hover: ui.hover === i });
      setType(ctx, 'caption'); ctx.fillStyle = picked ? C.ink : ROLE.body;
      drawTextFit(ctx, getItem(c.itemId).name.split(' ').pop(), r.x + 3, r.y + 2, r.w - 6);
    } else {
      // sell / back
      const skin = drawChip(ctx, r, { priority: c.priority || 'secondary', focused, hover: ui.hover === i });
      const lbl = c.kind === 'sell' ? (pick ? `SELL (+${sellValue(pick)}¤)` : 'SELL') : (typeof c.label === 'function' ? c.label() : c.label);
      drawChipLabel(ctx, r, lbl, skin.label);
    }
  }

  // The party's names and the one figure that matters right now (option B).
  drawPartyStats(ctx, s);
  shopDetail(ctx, s);
  const storesY = shopStoresY(party.frames.length, shop.lines ? shop.lines.length : 0);
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'STORES', 10, storesY);
  if (!(party.inventory || []).length) { ctx.fillStyle = C.faint; pixelText(ctx, '(stores empty; requisition above)', 62, storesY); }
  // hint dropped: sell/back own the bottom band; Esc remains wired
  ctx.fillStyle = C.townGround; ctx.fillRect(0, 184, VW, 16);
  tileFillCell(ctx, TOWN_KEY, TOWN_TILE.cobble, 0, 184, VW, 16, 'saturate(30%) brightness(48%) sepia(20%)');
  ctx.fillStyle = C.townWash; ctx.fillRect(0, 184, VW, 16);
}

function renderDeck(ctx, s) {
  const { party, deck, ui, deckControls } = s;
  masthead(ctx, 'THE FILE: DECK REVIEW');
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  pixelText(ctx, `${deck.list.length} cards on file · supplies ${party.supplies} · strike a card: −${TUNING.deckRemoveCost}`, 12, 40);
  const arr = deckControls || [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], r = c.rect, focused = ui.focus === i;
    if (c.cardId != null) {
      // The name gets its own plate BELOW the art. It used to be drawn over the
      // card's bottom edge, where light card faces swallowed it whole.
      const artH = r.h - 12;
      drawCardFramed(ctx, getCard(c.cardId).arcana, r.x, r.y, r.w, artH, focused);
      ctx.fillStyle = focused ? ROLE.accent : C.control2;
      ctx.fillRect(r.x, r.y + artH + 1, r.w, 11);
      setType(ctx, 'caption'); ctx.fillStyle = focused ? C.ink : C.paper;
      const name = cardPlateName(c.cardId);
      const nw = pixelTextWidth(ctx, name);
      drawTextFit(ctx, name, r.x + Math.max(1, (r.w - nw) >> 1), r.y + artH + 3, r.w - 2);
      if (focused) drawPointer(ctx, r.x - 7, r.y + ((artH - 7) >> 1));
    } else {
      const skin = drawChip(ctx, r, { priority: c.priority || 'secondary', focused, hover: ui.hover === i });
      drawChipLabel(ctx, r, c.label, skin.label);
    }
  }
  // The description column starts right of the BACK chip, never over it.
  const foc = arr[ui.focus];
  const noteX = 136, noteW = VW - noteX - 8;
  setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
  if (foc && foc.cardId != null) wrapText(ctx, getCard(foc.cardId).text + '  (Enter strikes it)', noteX, 166, noteW, TEXT_LEADING, 2);
  else drawTextLines(ctx, 'Tab / ← →  select · Enter strike · Esc back', noteX, 166, noteW, 2, TEXT_LEADING);
}

// The Orientation Mandate (M5): Expedition 0's intake form. Each intervention
// verb is a REQUIRED, pre-acknowledged box — the desk is empowered to make each.
// Diegetic (a form), no tutorial voice, no exposition dump.
const INTAKE_BOXES = [
  ['ADVANCE', 'Pace the march from 0.5× to 4×.'],
  ['SUSPENSION', 'Suspend proceedings at will.'],
  ['INTERVENTION', 'Play tarot into a live matter.'],
  ['REASSIGNMENT', "Reassign a frame's trade at camp."],
  ['REQUISITION', 'Issue quartermaster kit in towns.'],
  ['ROUTING', 'Choose each leg by exact tradeoff.'],
  ['EARLY RETURN', 'File an early return at camp or town.'],
];
function renderIntake(ctx, s) {
  const { ui, intakeControls } = s;
  masthead(ctx, 'INTAKE FORM: THE ORIENTATION MANDATE');
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  pixelText(ctx, 'Expedition 0. Every box below is required.', 12, 40);
  pixelText(ctx, 'The desk may make each intervention. File to proceed.', 12, 40 + TEXT_LEADING);
  let y = 40 + TEXT_LEADING * 2 + MIN_INTERLINE_GAP;
  for (const [name, desc] of INTAKE_BOXES) {
    ctx.fillStyle = C.filed; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, '[x]', 16, y);
    ctx.fillStyle = C.paper; pixelText(ctx, name, 36, y);
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; drawTextLines(ctx, desc, 116, y, VW - 128, 1, TEXT_LEADING);
    y += TEXT_LEADING + MIN_INTERLINE_GAP;
  }
  drawControls(ctx, intakeControls || [], ui);
}

// drawSoak (M9): a live soak indicator while running, and the full ACCEPTANCE
// DOSSIER when done — the player-path verbs, watch/act metrics, and every
// BLOCKER / DEFECT / FRICTION finding. Drawn over the game after render.
function drawSoak(ctx, S) {
  if (!S.done) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 120, 12);
    ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = C.focus;
    const b = Object.values(S.verbs).filter(Boolean).length;
    pixelText(ctx, `SOAK · verbs ${b}/6 · step ${S.steps}`, 3, 3);
    return;
  }
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, VW, VH);
  masthead(ctx, 'ACCEPTANCE DOSSIER: PLAYER-PATH SOAK');
  ctx.font = '8px ui-monospace, monospace';
  ctx.fillStyle = S.pass ? C.ok : C.stamp;
  pixelText(ctx, S.pass ? 'VERDICT: PASS' : 'VERDICT: ATTENTION (blocker present)', 12, 34);
  // Player-path verbs
  ctx.font = '6px ui-monospace, monospace';
  const labels = { cardPlay: 'live card play', jobChange: 'camp job change', shopTxn: 'shop transaction', routeBranch: 'route branch', saveRoundTrip: 'save round-trip', deathCycle: 'death→report→cert' };
  let y = 48;
  ctx.fillStyle = C.faint; pixelText(ctx, 'PLAYER-PATH MINIMUM:', 12, y); y += TEXT_LEADING;
  for (const [k, lab] of Object.entries(labels)) {
    ctx.fillStyle = S.verbs[k] ? C.ok : C.stamp;
    pixelText(ctx, (S.verbs[k] ? '[✓] ' : '[✗] ') + lab, 18, y); y += TEXT_LEADING;
  }
  // Watch/act metrics
  const m = S.metrics;
  ctx.fillStyle = C.faint; pixelText(ctx, 'WATCH / ACT METRICS:', 168, 48);
  ctx.fillStyle = C.dim;
  pixelText(ctx, `interventions: ${m.interventions}`, 174, 48 + TEXT_LEADING);
  pixelText(ctx, `interventions/min: ${(m.interventionsPerMin || 0).toFixed(1)}`, 174, 48 + TEXT_LEADING * 2);
  pixelText(ctx, `longest passive: ${(m.maxPassiveSec || 0).toFixed(1)}s (floor 25s)`, 174, 48 + TEXT_LEADING * 3);
  pixelText(ctx, `soak steps: ${S.steps} · expeditions: ${(S.expeditions | 0) + 1}`, 174, 48 + TEXT_LEADING * 4);
  ctx.fillStyle = C.faint; pixelText(ctx, '(every verb via real input events)', 174, 48 + TEXT_LEADING * 5);
  // Findings
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'FINDINGS:', 12, 118);
  y = 128;
  if (!S.findings.length) { ctx.fillStyle = C.ok; pixelText(ctx, '(none; clean run)', 18, y); }
  for (const f of S.findings.slice(0, 8)) {
    ctx.fillStyle = f.sev === 'BLOCKER' ? C.stamp : f.sev === 'DEFECT' ? C.hplow : C.dim;
    wrapText(ctx, `[${f.sev}] ${f.text}`, 18, y, VW - 30, TEXT_LEADING); y += (wrapCount(ctx, `[${f.sev}] ${f.text}`, VW - 30)) * TEXT_LEADING + MIN_INTERLINE_GAP;
  }
}

function renderDefeat(ctx, s) {
  const { ui, defeatControls } = s;
  const rep = ui.report;
  masthead(ctx, 'THE FILED REPORT: ' + (rep && rep.cause === 'abandoned' ? 'EARLY RETURN' : 'NOTICE OF REDUCTION'));

  // The causal incident ledger (M5): cause → deduction, each line traced to the
  // decision that produced it. Tone colours: a decision, a suffered deduction,
  // the desk's one credit. (Passive voice for suffering; active for the desk.)
  ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = C.faint;
  pixelText(ctx, 'INCIDENT LEDGER: the chain that closed the file:', 12, AFTER_MASTHEAD_Y);
  let y = AFTER_MASTHEAD_Y + TEXT_LEADING;
  const lines = rep && rep.filed ? rep.filed.lines : [];
  const maxLedgerY = 118;
  for (const ln of lines) {
    if (y + CORE_TEXT_HEIGHT > maxLedgerY) break;
    ctx.fillStyle = ln.tone === 'credit' ? C.ok : ln.tone === 'suffer' ? C.stamp : C.paper;
    ctx.font = '7px ui-monospace, monospace';
    const rows = wrapCount(ctx, ln.text, VW - 28);
    if (y + rows * TEXT_LEADING > maxLedgerY) break;
    wrapText(ctx, ln.text, 16, y, VW - 28, TEXT_LEADING);
    y += rows * TEXT_LEADING + MIN_INTERLINE_GAP;
  }

  // Certifications persist — a compact banked summary (flat, numeric, never proud).
  y = Math.max(y, 120) + 2;
  ctx.strokeStyle = C.rule; line(ctx, 12, y - 3, VW - 12, y - 3);
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
  pixelText(ctx, 'CERTIFICATIONS BANKED TO THE PERMANENT RECORD:', 12, y);
  const gains = rep ? rep.gains : {};
  const jids = Object.keys(gains);
  ctx.font = '6px ui-monospace, monospace';
  const parts = jids.length ? jids.map((jid) => {
    const g = gains[jid], nm = (JOBS[jid] ? JOBS[jid].name : jid);
    // `+3` alone never said WHAT was gained, and `→Lv4` fused a letter pair to a
    // figure the same way `L4` did. Both are spelled.
    return g.leveled ? `${nm} to level ${g.after} (+${g.xp} xp)` : `${nm} +${g.xp} xp`;
  }) : ['(no mastery earned this expedition)'];
  ctx.fillStyle = C.dim; wrapText(ctx, parts.join('  ·  '), 16, y + TEXT_LEADING, VW - 28, TEXT_LEADING);
  // New clearances (M5): what banking this run bought on the certification wall.
  const cleared = rep && rep.cleared ? rep.cleared : [];
  let cy = y + TEXT_LEADING * 2 + MIN_INTERLINE_GAP;
  for (const c of cleared) {
    if (cy + TEXT_LEADING > CONTROL_BAND_Y - 4) break;
    ctx.fillStyle = C.ok; ctx.font = '6px ui-monospace, monospace';
    cy += drawTextLines(ctx, `NEW CLEARANCE. ${c.name}: ${c.desc}`, 16, cy, VW - 28, 1, TEXT_LEADING) * TEXT_LEADING + MIN_INTERLINE_GAP;
  }
  if (rep && cy + CORE_TEXT_HEIGHT <= CONTROL_BAND_Y - 4) {
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
    drawTextLines(ctx, `expeditions filed: ${rep.runs} · deepest leg: ${rep.deepestLeg} · escalation ${rep.escLevel}`, 16, cy, VW - 28, 1, TEXT_LEADING);
  }

  drawControls(ctx, defeatControls, ui);
}

// The mandate strip: the Office's standing order. Prose title (deadpan) with an
// exact numeric neighbour (instruments never lie — register law 6): terminus,
// legs remaining, disbursement on discharge.
function drawMandateStrip(ctx, mandate, march, y) {
  const x0 = 12, x1 = VW - 12;
  drawPanel(ctx, x0, y, x1 - x0, MANDATE_BOX_H);
  if (!mandate) { ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, 'NO MANDATE ON FILE', x0 + 4, y + 4); return; }
  const rem = legsRemaining(mandate, march.leg);
  const prev = ctx.__pixelTextStack;
  ctx.__pixelTextStack = 'mandate-strip';
  drawIcon(ctx, 'mandate', x0 + 3, y + 2, 11); // the rolled instrument (pack art)
  ctx.font = '7px ui-monospace, monospace';
  ctx.fillStyle = C.focus; pixelText(ctx, 'MANDATE ' + mandate.ref, x0 + 16, y + 3);
  ctx.fillStyle = C.paper;
  const titleRows = drawTextLines(ctx, mandate.title, x0 + 110, y + 3, x1 - (x0 + 110) - 4, 2, TEXT_LEADING);
  ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  const remTxt = rem === 0 ? 'at terminus' : rem + ' leg' + (rem > 1 ? 's' : '') + ' to go';
  drawTextLines(ctx, `terminus leg ${mandate.destinationLeg} · ${remTxt} · discharge ≥ ${mandate.reward}¤`, x0 + 16, y + 3 + Math.max(1, titleRows) * TEXT_LEADING, x1 - (x0 + 16) - 4, 1, TEXT_LEADING);
  ctx.__pixelTextStack = prev;
}

function drawRoute(ctx, march, y) {
  const x0 = 12, x1 = VW - 12, w = x1 - x0;
  const prof = march.legProfile;
  ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, 'ROUTE TABLE: LEG ' + march.leg, x0, y - 9);
  for (let i = 0; i < prof.segs.length; i++) {
    const seg = prof.segs[i], next = prof.segs[i + 1];
    const from = seg.from / TUNING.legLengthPaces, to = (next ? next.from : TUNING.legLengthPaces) / TUNING.legLengthPaces;
    const bx = Math.round(x0 + w * from), bw = Math.round(w * (to - from));
    // The segment is floored with its actual Willibab terrain tile (M6).
    tileFill(ctx, seg.terrain, bx, y, bw, 16, 'saturate(22%) brightness(42%) sepia(18%)');
    ctx.strokeStyle = C.rule; ctx.strokeRect(bx, y, bw, 16);
    // A legible label chip over the tiles (register: the instrument names the ground).
    const label = (TERRAIN_LABEL[seg.terrain] || seg.terrain).slice(0, Math.max(1, Math.floor(bw / 4)));
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx + 1, y + 1, Math.min(bw - 2, pixelTextWidth(ctx, label) + 3), 8);
    ctx.fillStyle = C.paper; pixelText(ctx, label, bx + 2, y + 2);
  }
  ctx.strokeStyle = C.rule; line(ctx, x0, y + 20, x1, y + 20);
  const px = x0 + w * (march.paces / TUNING.legLengthPaces);
  ctx.fillStyle = C.party; ctx.beginPath(); ctx.moveTo(px, y + 15); ctx.lineTo(px - 3, y + 20); ctx.lineTo(px + 3, y + 20); ctx.closePath(); ctx.fill();
}

function drawTicker(ctx, ui, x, y, w, h = 78) {
  ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, 'DAY BOOK', x, y - 9);
  drawPanel(ctx, x, y, w, h);
  ctx.fillStyle = C.dim; ctx.font = '6px ui-monospace, monospace';
  // THE DAY BOOK WRAPS. It used to cut every entry at a blind 30 characters,
  // mid-word — the same truncation the text gate forbids everywhere else, and
  // the thing that swallowed the very figures these entries exist to record.
  const budget = Math.floor((h - 6) / TEXT_LEADING);
  const wrapped = [];
  for (const entry of ui.ticker.slice(-budget)) wrapped.push(...wrapLinesNoEllipsis(ctx, entry, w - 6, 2));
  const rows = wrapped.slice(-budget); // oldest lines scroll off the top, whole
  const prev = ctx.__pixelTextStack;
  ctx.__pixelTextStack = 'day-book';
  rows.forEach((t, i) => pixelText(ctx, t, x + 3, y + 4 + i * TEXT_LEADING));
  if (rows.length === 0) pixelText(ctx, '(nothing yet to record)', x + 3, y + 4);
  ctx.__pixelTextStack = prev;
}

/**
 * The save badge. `@1234` was a sigil against a figure nobody had been told the
 * unit of; the resting line now spells `at tick N` in full. The live line drops
 * the figure rather than carrying it — while the reason is on screen the badge
 * is already saying what was filed, and appending the tick to the longest
 * reason ("requisitioned Distraint Warhammer (−96¤)") ran the row off the
 * right edge of the canvas, which the old `@N` form was already close to doing.
 */
function drawSaveIndicator(ctx, ui) {
  if (!ui.saved) return;
  ctx.font = '7px ui-monospace, monospace';
  if (nowMs() - ui.saved.at < 1600) { ctx.fillStyle = ui.saved.ok ? C.filed : C.stamp; pixelText(ctx, `FILED ✓ ${ui.saved.reason}`, 96, 166); }
  else { ctx.fillStyle = C.faint; pixelText(ctx, `last filed at tick ${ui.saved.tick}`, 96, 166); }
}

/**
 * Every button in the game comes through here. A control declares its own
 * `priority` ('primary' | 'secondary'); the chip language in ui.js does the
 * rest — own-family border, top bevel, bottom shade, drop shadow, and the
 * selection pointer OUTSIDE the rect so the label never moves.
 *
 * The old version drew one identical stroked rectangle for every control on
 * every screen, which is why nothing on screen said "press me first".
 */
function drawControls(ctx, arr, ui) {
  if (arr.length && arr[0].id && arr[0].id.startsWith('spd')) {
    setType(ctx, 'caption'); ctx.fillStyle = ROLE.caption;
    pixelText(ctx, 'SPEED', 8, CONTROL_BAND_Y + 4);
  }
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], r = c.rect;
    const active = !!(c.isActive && c.isActive());
    const disabled = !!(c.isDisabled && c.isDisabled());
    const label = typeof c.label === 'function' ? c.label() : c.label;
    const skin = drawChip(ctx, r, {
      priority: c.priority || 'secondary',
      state: disabled ? 'disabled' : active ? 'active' : 'normal',
      focused: ui.focus === i,
      hover: ui.hover === i,
    });
    drawChipLabel(ctx, r, label, c.warn && !disabled ? C.stamp : skin.label);
  }
}

/**
 * Centre a chip's label inside its own rect — one line where it fits, two
 * centred lines where it does not. Labels are always centred now; the old code
 * inset each one by a hand-picked 4–6px, so no two screens lined up.
 */
function drawChipLabel(ctx, r, label, color) {
  setType(ctx, 'body');
  ctx.fillStyle = color;
  const inner = r.w - 8;
  const lines = pixelTextWidth(ctx, label) <= inner ? [label] : wrapLinesNoEllipsis(ctx, label, inner, 2);
  // Two-line labels keep the full leading floor; a chip that needs two lines
  // must be tall enough for them, and the layout gate says so if it is not.
  const block = lines.length * CORE_TEXT_HEIGHT + (lines.length - 1) * (TEXT_LEADING - CORE_TEXT_HEIGHT);
  let y = r.y + Math.max(1, (r.h - block) >> 1);
  const prev = ctx.__pixelTextStack;
  ctx.__pixelTextStack = `chip:${Math.round(r.x)}:${Math.round(r.y)}`;
  for (const lineText of lines) {
    const w = pixelTextWidth(ctx, lineText);
    pixelText(ctx, lineText, r.x + Math.max(2, (r.w - w) >> 1), y);
    y += TEXT_LEADING;
  }
  ctx.__pixelTextStack = prev;
}

// Text layout is always measured against an owned region. This keeps prose,
// dynamic labels, and fixed banners from borrowing pixels from their neighbours.
function drawTextFit(ctx, text, x, y, maxW) {
  const fitted = truncateText(ctx, text, maxW);
  if (fitted) pixelText(ctx, fitted, x, y);
  return fitted;
}

function drawTextLines(ctx, text, x, y, maxW, maxLines = Infinity, lineHeight = TEXT_LEADING) {
  const lines = wrapLinesNoEllipsis(ctx, text, maxW, maxLines);
  const prev = ctx.__pixelTextStack;
  if (!prev) ctx.__pixelTextStack = `wrap:${Math.round(x)}:${Math.round(y)}:${Math.round(maxW)}`;
  for (let i = 0; i < lines.length; i++) pixelText(ctx, lines[i], x, y + i * lineHeight);
  ctx.__pixelTextStack = prev;
  return lines.length;
}

// wrapCount: how many rows wrapText will render for `text` at width maxW.
function wrapCount(ctx, text, maxW, maxLines = Infinity) {
  return wrapLines(ctx, text, maxW, maxLines).length;
}

function wrapText(ctx, text, x, y, maxW, lh, maxLines = Infinity) {
  const lines = wrapLines(ctx, text, maxW, maxLines);
  const prev = ctx.__pixelTextStack;
  if (!prev) ctx.__pixelTextStack = `wrap:${Math.round(x)}:${Math.round(y)}:${Math.round(maxW)}`;
  for (let i = 0; i < lines.length; i++) pixelText(ctx, lines[i], x, y + i * lh);
  ctx.__pixelTextStack = prev;
  return lines.length;
}

function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

function exportLog(log) {
  try {
    const blob = new Blob([log.exportText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'office-of-the-road-debug.txt';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    log.info('debug log exported');
  } catch (e) { log.error('export failed: ' + (e && e.message ? e.message : e)); }
}

if (typeof document !== 'undefined') { boot(); }
