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
import { makeEnemies, initCombat, stepCombat, applyCard, evaluateCard } from './combat.js';
import { JOBS, JOB_IDS, DEFAULT_PARTY } from './jobs.js';
import { createDeck, drawUp, playFromHand, discardHand, addCard, removeCard, getCard, STARTING_DECK, CARD_IDS } from './deck.js';
import { BATTLER, battlerForJob, battlerForEnemy, TAROT_FRAME, ICON, ICON_FRAME, ICONSET_KEY, TILE_FRAME, OVERWORLD_KEY, TERRAIN_TILE, TOWN_KEY, TOWN_TILE } from './art.js';
import { PALETTE } from './palette.js';
import { simulateCVD } from './legibility.js';
import { createBand } from './band.js';
import { registerScore, trackForScreen } from './score.js';
import { installSoak } from './soak.js';
import { pixelText, pixelTextWidth } from './pixel-font.js';
import { wrapLinesNoEllipsis, wrapLines, truncateText } from './text-wrap.js';
import { PLAYER_CREDITS } from './credits.js';
import { CONTROL_BAND_Y, CONTENT_TEXT_MAX_Y, contentTextY, TEXT_LEADING, CORE_TEXT_HEIGHT, computeDisplayFit, pointerToNative } from './layout.js';
import { TITLE_NAME, TITLE_TAG, TITLE_SUB, TITLE_BATTLERS, TITLE_TAROT, HOWTO_PAGES, titleMenuRects, howtoMenuRects } from './title-layout.js';

const VW = 320, VH = 200;
const COMBAT_STATUS_W = 140; // owned left column — party roster begins x=156
const CAMP_PANEL_Y = 40 + TEXT_LEADING * 4 + 6; // intro 2 + detail 2 at max leading
const ROUTE_CARD_Y = 40 + TEXT_LEADING * 3 + 6; // intro 2 + supplies 1 + gap
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

function drawBattler(ctx, key, x, y, size, flip) {
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
  const ctx = canvas.getContext('2d', { alpha: false });
  const banner = document.getElementById('boot-error');
  if (!ctx) {
    if (banner) { banner.style.display = 'block'; banner.textContent = 'No 2D canvas context available.'; }
    log.error('boot: no 2D context'); return;
  }
  canvas.width = VW; canvas.height = VH; ctx.imageSmoothingEnabled = false;
  initArt(log);

  log.onError((entry) => {
    if (!banner) return;
    banner.style.display = 'block';
    banner.textContent = 'THE OFFICE OF THE ROAD. A fault was recorded:\n\n' +
      `[tick ${entry.tick}] ${entry.msg}\n\n(press E to export the full debug log)`;
  });

  function fit() {
    // Largest integer multiple of the native buffer that fits the window,
    // centered with letterboxing (CLAUDE.md #9 — crispness beats fractional fill).
    const f = computeDisplayFit(window.innerWidth || VW, window.innerHeight || VH, VW, VH);
    canvas.style.width = f.cssW + 'px';
    canvas.style.height = f.cssH + 'px';
    canvas.style.left = f.offX + 'px';
    canvas.style.top = f.offY + 'px';
    canvas.style.imageRendering = 'pixelated';
    canvas.dataset.scale = String(f.scale);
    canvas.dataset.offx = String(f.offX);
    canvas.dataset.offy = String(f.offY);
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
      ui.focus = 0;
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
    ui.ticker.push(`routed · ${b.label} · enc ×${b.encounterMult} · pay ×${b.goldMult}${b.supplyToll ? ` · toll −${b.supplyToll}` : ''}`);
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
      if (r.ok) { ui.shop.pick = null; ui.saved = { tick: march.tick, reason: `issued ${getItem(pick).name} to frame ${frameIndex}`, ok: true, at: nowMs() }; doSave('issue'); log.info('equipped ' + pick + ' -> frame ' + frameIndex); }
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
    ctrls.push({ id: 'back', label: 'BACK TO CAMP', rect: { x: 16, y: 180, w: 96, h: 14 }, activate: () => { ui.screen = 'camp'; ui.focus = 1; } });
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
        ui.ticker.push(`enc #${ev.n} · ${TERRAIN_LABEL[ev.terrain] || ev.terrain} · ${TIER_LABEL[KIND_TIER[ev.kind]] || ev.kind}`);
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
  const controls = [];
  TUNING.speedSteps.forEach((mult, i) => {
    controls.push({ id: 'spd' + i, label: mult + 'x', rect: { x: 44 + i * 30, y: CONTROL_BAND_Y, w: 30, h: 14 }, activate: () => setSpeed(i), isActive: () => config.speedIndex === i });
  });
  controls.push({ id: 'pause', label: () => (ui.paused ? 'RESUME' : 'PAUSE'), rect: { x: 180, y: CONTROL_BAND_Y, w: 48, h: 14 }, activate: () => { ui.paused = !ui.paused; }, isActive: () => ui.paused });
  controls.push({ id: 'hold', label: 'HOLD', rect: { x: 230, y: CONTROL_BAND_Y, w: 32, h: 14 }, activate: () => {}, isActive: () => ui.holdPause, hold: true });
  controls.push({ id: 'credits', label: 'CREDITS', rect: { x: 264, y: CONTROL_BAND_Y, w: 52, h: 14 }, activate: () => openCredits(ui.screen) });

  const docketControls = [
    { id: 'resume', label: 'RESUME', rect: { x: 32, y: 150, w: 76, h: 18 }, activate: () => resumeSaved() },
    { id: 'discard', label: 'FILE ANEW', rect: { x: 122, y: 150, w: 76, h: 18 }, activate: () => discardSaved() },
    { id: 'credits', label: 'CREDITS', rect: { x: 212, y: 150, w: 76, h: 18 }, activate: () => openCredits('docket') },
  ];
  const defeatControls = [
    { id: 'again', label: 'FILE A NEW EXPEDITION', rect: { x: 90, y: 180, w: 140, h: 15 }, activate: () => discardSaved() },
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
    { id: 'begin', label: 'FILE THE INTAKE: BEGIN THE EXPEDITION', rect: { x: 16, y: 176, w: 216, h: 16 }, activate: () => beginIntake() },
    { id: 'credits', label: 'CREDITS', rect: { x: 238, y: 176, w: 66, h: 16 }, activate: () => openCredits('intake') },
  ];
  const titleControls = titleMenuRects().map((c) => ({
    id: c.id,
    label: c.label,
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
    { id: 'prev', label: 'PREV', rect: { x: 12, y: 178, w: 48, h: 14 }, activate: () => { ui.creditsPage = Math.max(0, (ui.creditsPage | 0) - 1); } },
    { id: 'next', label: 'NEXT', rect: { x: 66, y: 178, w: 48, h: 14 }, activate: () => { ui.creditsPage = (ui.creditsPage | 0) + 1; } },
    { id: 'license', label: 'OPEN CC BY', rect: { x: 120, y: 178, w: 88, h: 14 }, activate: () => openCreditLicense() },
    { id: 'back', label: 'BACK', rect: { x: 214, y: 178, w: 94, h: 14 }, activate: () => closeCredits() },
  ];
  // Camp controls are built per-visit: the QUARTERMASTER verb appears only at a
  // town. Frame rows (job cycle) then the action row (rest/deck/[quartermaster]/march).
  function buildCampControls() {
    const arr = [];
    for (let i = 0; i < party.frames.length; i++) {
      arr.push({ id: 'f' + i, frameIndex: i, cycle: true, rect: { x: 16, y: CAMP_PANEL_Y + i * 18, w: 288, h: 18 }, activate: () => cycleFrameJob(i, 1) });
    }
    const actionY = CAMP_PANEL_Y + party.frames.length * 18 + 6;
    arr.push({ id: 'rest', label: () => 'REST', rect: { x: 16, y: actionY, w: 58, h: 16 }, activate: () => doRest() });
    arr.push({ id: 'deck', label: 'REVIEW DECK', rect: { x: 80, y: actionY, w: 86, h: 16 }, activate: () => openDeck() });
    if (ui.camp && ui.camp.isTown) arr.push({ id: 'shop', label: 'QUARTERMASTER', rect: { x: 172, y: actionY, w: 132, h: 16 }, activate: () => openShop() });
    const marchY = actionY + 22;
    arr.push({ id: 'march', label: 'MARCH ON: ROUTE THE NEXT LEG', rect: { x: 16, y: marchY, w: 190, h: 14 }, activate: () => openRoute() });
    arr.push({ id: 'return', label: 'EARLY RETURN', warn: ui.noProgress, rect: { x: 212, y: marchY, w: 92, h: 14 }, activate: () => fileEarlyReturn() });
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
    shop.lines.forEach((l, i) => {
      arr.push({ id: 'buy' + i, kind: 'buy', line: i, rect: { x: 10, y: 42 + i * 15, w: 150, h: 14 }, activate: () => shopBuy(i) });
    });
    // Always-open resupply sink
    arr.push({ id: 'resupply', kind: 'resupply', rect: { x: 10, y: 42 + shop.lines.length * 15 + 4, w: 150, h: 13 }, activate: () => shopResupply() });
    // Per-frame slot chips (right column): two per frame (arm, guard)
    party.frames.forEach((f, i) => {
      SLOTS.forEach((slot, si) => {
        arr.push({ id: 'slot' + i + slot, kind: 'slot', frameIndex: i, slot, rect: { x: 236 + si * 38, y: 44 + i * 18, w: 36, h: 15 }, activate: () => shopSlot(i, slot) });
      });
    });
    // Loose inventory (pick to equip or sell) — a horizontal chip grid, wraps.
    (party.inventory || []).forEach((id, i) => {
      arr.push({ id: 'inv' + i, kind: 'inv', itemId: id, rect: { x: 10 + (i % 6) * 50, y: 130 + Math.floor(i / 6) * 13, w: 48, h: 11 }, activate: () => shopPick(id) });
    });
    // Sell the picked item; back to camp
    arr.push({ id: 'sell', kind: 'sell', rect: { x: 10, y: 168, w: 80, h: 14 }, activate: () => shopSellPicked() });
    arr.push({ id: 'back', label: 'BACK TO CAMP', rect: { x: 220, y: 168, w: 94, h: 14 }, activate: () => closeShop() });
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
        const outOfBounds = texts.filter((t) => t.x < 0 || t.y < 0 || t.x + t.w > VW || t.y + t.h > VH);
        return { screen: ui.screen, texts: texts.length, textBoxes: texts, controls: controlsNow.length, collisions, textCollisions, outOfBounds };
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

function masthead(ctx, sub) {
  ctx.fillStyle = C.paper; ctx.font = '10px ui-monospace, monospace';
  pixelText(ctx, 'THE OFFICE OF THE ROAD', 12, 9);
  ctx.strokeStyle = C.rule; line(ctx, 12, 23, VW - 12, 23);
  if (sub) { ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.faint; pixelText(ctx, sub, 12, 26); }
}

// Composed title: pack terrain floor + party battlers + tarot fan + register name + menu.
function renderTitle(ctx, s) {
  const { ui, titleControls } = s;
  tileFill(ctx, 'toll-wood', 0, 0, VW, VH, 'saturate(18%) brightness(28%) sepia(22%)');
  ctx.fillStyle = 'rgba(13,11,10,0.55)'; ctx.fillRect(0, 0, VW, 48);
  ctx.fillStyle = 'rgba(13,11,10,0.78)'; ctx.fillRect(0, 138, VW, VH - 138);

  ctx.fillStyle = C.paper; ctx.font = '10px ui-monospace, monospace';
  const tw = pixelTextWidth(ctx, TITLE_NAME);
  pixelText(ctx, TITLE_NAME, Math.max(12, (VW - tw) >> 1), 8);
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.focus;
  const tagW = pixelTextWidth(ctx, TITLE_TAG);
  pixelText(ctx, TITLE_TAG, Math.max(12, (VW - tagW) >> 1), 24);
  ctx.fillStyle = C.dim; ctx.font = '6px ui-monospace, monospace';
  drawTextLines(ctx, TITLE_SUB, 24, 36, VW - 48, 1, TEXT_LEADING);

  // Party line — shipped battlers only
  const bs = 36;
  TITLE_BATTLERS.forEach((key, i) => {
    drawBattler(ctx, key, 28 + i * 50, 50, bs, false);
  });
  // Tarot fan — Pixel Tarot faces (clears the menu band below)
  const cw = 28, ch = 36;
  TITLE_TAROT.forEach((key, i) => {
    drawCard(ctx, key, 44 + i * 38, 96, cw, ch);
  });

  drawControls(ctx, titleControls || [], ui, true);
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
  masthead(ctx);
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  pixelText(ctx, `LEG ${march.leg} · pace ${String(march.paces).padStart(3)}/${TUNING.legLengthPaces} · enc ${march.encounterCount} · ¤${party.gold}${ui.escLevel ? ` · esc L${ui.escLevel}` : ''}`, 12, 27);

  drawMandateStrip(ctx, mandate, march, 34);
  drawRoute(ctx, march, 66);
  drawParty(ctx, party, 184, 94, 68);
  drawTicker(ctx, ui, 12, 94, 164, 68);

  // Road omen — the last tarot the road showed (an omen, resolving nothing).
  if (ui.omen) {
    const ox = VW - 30, oy = 26;
    drawCard(ctx, ui.omen.arcana, ox, oy, 18, 25);
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
    pixelText(ctx, 'OMEN', ox - 22, oy + 2); pixelText(ctx, ui.omen.name.slice(0, 9), ox - 40, oy + 10);
  }

  ctx.font = '7px ui-monospace, monospace';
  ctx.fillStyle = paused ? C.stamp : C.ok;
  pixelText(ctx, paused ? (ui.holdPause ? '[ HELD ]' : '[ PAUSED ]') : '[ MARCHING ]', 12, 166);
  drawSaveIndicator(ctx, ui);
  if (log.errorCount > 0) { ctx.fillStyle = C.stamp; pixelText(ctx, `faults ${log.errorCount} (E)`, 262, 166); }
  // Score indicator (M7): the current band track + the mute toggle (M).
  ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = ui.muted ? C.faint : C.dim;
  ctx.textAlign = 'right';
  pixelText(ctx, ui.muted ? 'score muted (M)' : 'score: ' + trackForScreen('march') + ' (M)', VW - 12, CONTENT_TEXT_MAX_Y);
  ctx.textAlign = 'left';
  drawControls(ctx, controls, ui);
}

function renderCombat(ctx, s) {
  const { ui, controls, paused } = s;
  const cb = ui.combat; if (!cb) return;
  masthead(ctx, 'FIELD RESOLUTION');
  // The zero-card law, surfaced: routine is winnable without cards; a fight that
  // has LEFT routine says so (intervention is wanted).
  ctx.font = '6px ui-monospace, monospace';
  ctx.fillStyle = cb.left ? C.stamp : C.ok; ctx.textAlign = 'right';
  pixelText(ctx, cb.left ? '[left routine · intervene]' : '[routine · no cards required]', VW - 12, 27);
  ctx.textAlign = 'left';

  const bs = 34;
  cb.st.enemyW.forEach((w, i) => drawCombatantW(ctx, w, 16 + i * 44, 34, bs, true, cb, battlerForEnemy(i)));
  cb.st.partyW.forEach((w, i) => drawCombatantW(ctx, w, 156 + i * 40, 40, bs, false, cb, battlerForJob(w.e.jobId)));

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
    drawTextLines(ctx, paused ? '[ PAUSED: play a card; Space runs ]' : '[ RESOLVING ]', 118, 126, VW - 130, 2, 8);
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
  ctx.font = '6px ui-monospace, monospace';
  const name = dead ? '(reduced)' : w.e.name;
  const nameW = pixelTextWidth(ctx, name);
  let nameX = bx;
  if (nameX + nameW > VW - 12) nameX = Math.max(0, VW - 12 - nameW);
  const hpY = by + 4;
  const nameY = hpY + CORE_TEXT_HEIGHT * (1 + (w.idx | 0));
  if (!dead) {
    ctx.fillStyle = C.faint;
    pixelText(ctx, `${w.e.hp}/${w.e.max.hp}`, bx, hpY);
  }
  ctx.fillStyle = dead ? C.stamp : C.dim;
  pixelText(ctx, name, nameX, nameY);
  const floats = cb.floats.filter((f) => f.side === w.side && f.idx === w.idx);
  const visibleFloats = 4;
  for (let i = 0; i < floats.length && i < visibleFloats; i++) {
    const f = floats[i];
    const floatX = x + size / 2 - 4;
    const floatY = by - 12 - i * 8;
    if (floatY < 0) break;
    ctx.fillStyle = f.color; ctx.font = '7px ui-monospace, monospace';
    pixelText(ctx, f.text, floatX, floatY);
  }
}

const WINDOW_LABEL = { decisive: 'DEC', playable: 'ok', wasted: '-' };
const WINDOW_COLOR = { decisive: C.focus, playable: C.dim, wasted: C.faint };
function drawHand(ctx, cb, hand) {
  const cw = 30, ch = 35, y = 133, gap = 4;
  cb.handRects = [];
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.faint;
  for (let i = 0; i < hand.length; i++) {
    const x = 12 + i * (cw + gap);
    const state = cb.st.done ? 'wasted' : evaluateCard(cb.st, hand[i]);
    const card = getCard(hand[i]);
    drawCard(ctx, card.arcana, x, y, cw, ch);
    // Window-state outline (non-colour channel: also a word label below). The
    // 30px tarot columns deliberately stay narrow; use both owned label rows so
    // the input number and full state remain readable without ellipsis.
    ctx.strokeStyle = WINDOW_COLOR[state] || C.dim; ctx.lineWidth = state === 'decisive' ? 2 : 1;
    ctx.strokeRect(x - 1, y - 1, cw + 2, ch + 2);
    ctx.fillStyle = WINDOW_COLOR[state] || C.dim; ctx.font = '6px ui-monospace, monospace';
    pixelText(ctx, String(i + 1), x, y + 2);
    drawTextLines(ctx, WINDOW_LABEL[state] || state, x, y + ch - 7, cw, 1, TEXT_LEADING);
    cb.handRects.push({ x, y, w: cw, h: ch });
  }
  // input hint
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
  pixelText(ctx, 'press 1–3 or click a card', 118, 136);
}

function drawDraft(ctx, cb, ui) {
  const foc = cb.draft.options[cb.draft.focus];
  if (foc) {
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
    drawTextFit(ctx, getCard(foc).text, 12, 118, VW - 24);
  }
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.faint;
  drawTextLines(ctx, 'OFFERED FOR THE FILE: take one, or decline', 12, 125, VW - 24, 2, TEXT_LEADING);
  const cw = 32, ch = 32, y = 142, gap = 10;
  cb.draftRects = [];
  cb.draft.options.forEach((id, i) => {
    const x = 16 + i * (cw + gap);
    const card = getCard(id);
    drawCard(ctx, card.arcana, x, y, cw, ch);
    if (cb.draft.focus === i) { ctx.strokeStyle = C.focus; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, cw + 4, ch + 4); }
    ctx.fillStyle = C.dim; ctx.font = '6px ui-monospace, monospace';
    drawTextFit(ctx, card.name.replace(/^The /, ''), x, y + ch - 7, cw);
    cb.draftRects.push({ x, y, w: cw, h: ch });
  });
  // decline button
  const dx = 16 + 3 * (cw + gap), dy = y + 14;
  ctx.fillStyle = C.panel; ctx.fillRect(dx, dy, 60, 18); ctx.strokeStyle = cb.draft.focus >= cb.draft.options.length ? C.focus : C.edge; ctx.lineWidth = cb.draft.focus >= cb.draft.options.length ? 2 : 1; ctx.strokeRect(dx, dy, 60, 18);
  ctx.fillStyle = C.paper; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, 'DECLINE', dx + 8, dy + 6);
  cb.draftRects.push({ x: dx, y: dy, w: 60, h: 18 });
}

function drawCard(ctx, artKey, x, y, w, h) {
  const img = ART_IMAGES[artKey];
  if (!img || !img.complete || img.naturalWidth === 0) {
    ctx.strokeStyle = C.stamp; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = C.stamp; ctx.font = '6px monospace'; pixelText(ctx, 'card?', x + 2, y + 2); return;
  }
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TAROT_FRAME.w, TAROT_FRAME.h, x, y, w, h);
  ctx.restore();
}

function drawParty(ctx, party, x, y, h = 78) {
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.faint; pixelText(ctx, 'THE PARTY', x, y - 9);
  ctx.strokeStyle = C.rule; ctx.strokeRect(x, y, VW - x - 12, h);
  party.frames.forEach((f, i) => {
    const fy = y + 4 + i * 15;
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
    pixelText(ctx, `${f.hp}/${f.max.hp}`, bx + bw - 22, fy);
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
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  pixelText(ctx, 'An expedition remains open on file. It may be resumed', 12, 40);
  pixelText(ctx, 'exactly where it was left, or filed anew.', 12, 49);
  const m = previewSave && previewSave.march, pty = previewSave && previewSave.party;
  // ON FILE (left column) — the open expedition.
  ctx.strokeStyle = C.rule; ctx.strokeRect(12, 66, 168, 74);
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'ON FILE', 18, 70);
  ctx.fillStyle = C.dim;
  if (m) {
    pixelText(ctx, `world seed ${previewSave.config.seed}`, 20, 82);
    pixelText(ctx, `leg ${m.leg} · pace ${m.paces}/${TUNING.legLengthPaces}`, 20, 92);
    pixelText(ctx, `encounters ${m.encounterCount} · tick ${previewSave.savedAtTick}`, 20, 102);
    if (pty) pixelText(ctx, `${pty.frames.map((f) => JOBS[f.jobId] ? JOBS[f.jobId].name.slice(0, 3) : '?').join('/')} · sup ${pty.supplies} · ¤${pty.gold | 0}`, 20, 112);
  } else { ctx.fillStyle = C.stamp; pixelText(ctx, '(the file could not be read)', 20, 92); }
  // RECORD (right column) — the certification ledger's rolling run-history (M8).
  ctx.strokeStyle = C.rule; ctx.strokeRect(188, 66, VW - 12 - 188, 74);
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'EXPEDITIONS FILED', 194, 70);
  const hist = (meta && meta.history) || [];
  if (!hist.length) { ctx.fillStyle = C.faint; drawTextLines(ctx, '(no expeditions on record)', 194, 84, VW - 200, 2, 7); }
  ctx.fillStyle = C.dim;
  hist.slice(0, 5).forEach((hh, i) => {
    drawTextLines(ctx, `#${hh.run} L${hh.leg} ${hh.cause === 'abandoned' ? 'return' : 'reduced'} ¤${hh.gold}`, 194, 82 + i * 9, VW - 200, 1, 7);
  });
  if (meta) { ctx.fillStyle = C.faint; pixelText(ctx, `${meta.runs | 0} filed · deepest leg ${meta.deepestLeg | 0}`, 194, 132); }
  drawControls(ctx, docketControls, ui, true);
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
  const perPage = 15, pages = [];
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
  pixelText(ctx, `CREDITS · page ${ui.creditsPage + 1}/${pages.length}`, 12, 34);
  let y = 44;
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
  masthead(ctx, (town ? 'TOWN: LEG ' : 'CAMP: LEG ') + (ui.camp ? ui.camp.leg : '?'));
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  const introLines = drawTextLines(ctx, town ? 'A town is reached. A quartermaster is in attendance; reassignment is permitted.'
                    : 'Camp is made. Reassignment is permitted; rest is billed to the file.', 12, 40, VW - 24, 2, TEXT_LEADING);
  const detailY = 40 + introLines * TEXT_LEADING + 2;
  if (ui.noProgress) {
    ctx.fillStyle = C.stamp; drawTextLines(ctx, '⚠ NO PROGRESS ON FILE: two legs without gain. Early return is available (below).', 12, detailY, VW - 24, 2, TEXT_LEADING);
  } else {
    ctx.fillStyle = C.faint;
    drawTextLines(ctx, 'supplies ' + party.supplies + '  ·  ¤ ' + party.gold + '  ·  rest: −' + TUNING.campRecoverSupplyCost + ' supplies restores half of missing HP', 12, detailY, VW - 24, 2, TEXT_LEADING);
  }

  for (let i = 0; i < campControls.length; i++) {
    const c = campControls[i], r = c.rect, focused = ui.focus === i;
    ctx.fillStyle = C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h); // interactive edge >=3:1
    if (c.cycle) {
      const f = party.frames[c.frameIndex];
      const dead = !f.alive || f.hp <= 0;
      drawBattler(ctx, battlerForJob(f.jobId), r.x + 2, r.y + 1, 14, false);
      ctx.font = '8px ui-monospace, monospace'; ctx.fillStyle = C.dim; pixelText(ctx, '◄', r.x + 20, r.y + 4);
      pixelText(ctx, '►', r.x + r.w - 12, r.y + 4);
      ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = dead ? C.stamp : C.paper;
      drawTextLines(ctx, f.name, r.x + 32, r.y + 5, 70, 1, 7);
      const jb = JOBS[f.jobId];
      ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
      const jobTextW = r.w - 126; // reserve both job-cycle arrows and the right inset
      drawTextFit(ctx, `hp ${f.hp}/${f.max.hp}  atk ${f.max.atk} def ${f.max.def} mag ${f.max.mag} spd ${f.max.spd}`, r.x + 108, r.y + 11, jobTextW);
    } else {
      // The early-return valve draws the eye (stamp border + label) when stalled.
      if (c.warn) { ctx.strokeStyle = C.stamp; ctx.strokeRect(r.x, r.y, r.w, r.h); }
      ctx.fillStyle = c.warn ? C.stamp : C.paper; ctx.font = '7px ui-monospace, monospace';
      drawTextLines(ctx, typeof c.label === 'function' ? c.label() : c.label, r.x + 6, r.y + 5, r.w - 12, 2, 7);
    }
    if (focused) { ctx.strokeStyle = C.focus; ctx.lineWidth = 1; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); }
  }
}

// The route board (M4). One card per branch: a deadpan road-name + safety word
// (the non-numeric channel) over exact instruments — encounter ×, pay ×, and the
// supply toll. Safety-vs-resource, legible at a glance.
function renderRoute(ctx, s) {
  const { party, march, mandate, ui, routeControls } = s;
  const r = ui.route; if (!r) return;
  masthead(ctx, 'ROUTE THE NEXT LEG: LEG ' + r.legIndex);
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  const introLines = drawTextLines(ctx, 'The next stretch is routed. The tradeoff is on file; choose the road.', 12, 40, VW - 24, 2, TEXT_LEADING);
  const routeDetailY = 40 + introLines * TEXT_LEADING + 2;
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
  pixelText(ctx, `supplies ${party.supplies}  ·  ¤ ${party.gold}  ·  terminus leg ${mandate ? mandate.destinationLeg : '?'}`, 12, routeDetailY);

  const arr = routeControls || [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], rect = c.rect, b = r.branches[c.branch], focused = ui.focus === i;
    ctx.fillStyle = C.panel; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = C.edge; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    // road-name + safety word (non-colour channel)
    ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.paper;
    drawTextLines(ctx, b.label, rect.x + 5, rect.y + 6, rect.w - 10, 2, 8);
    const safeCol = b.safety === 'guarded' ? C.ok : b.safety === 'exposed' ? C.stamp : C.dim;
    ctx.fillStyle = safeCol; ctx.font = '6px ui-monospace, monospace';
    pixelText(ctx, '[' + b.safety + ']', rect.x + 5, rect.y + 26);
    // exact instruments
    ctx.fillStyle = C.dim; ctx.font = '6px ui-monospace, monospace';
    pixelText(ctx, `enc ×${b.encounterMult}`, rect.x + 5, rect.y + 40);
    pixelText(ctx, `pay ×${b.goldMult}`, rect.x + 5, rect.y + 50);
    ctx.fillStyle = b.supplyToll > 0 ? C.stamp : C.faint;
    pixelText(ctx, b.supplyToll > 0 ? `toll −${b.supplyToll} supp.` : 'no toll', rect.x + 5, rect.y + 60);
    // note
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
    drawTextLines(ctx, b.note, rect.x + 5, rect.y + 72, rect.w - 10, 2, 8);
    ctx.fillStyle = C.filed; ctx.font = '6px ui-monospace, monospace';
    drawTextLines(ctx, '▸ TAKE ROAD', rect.x + 5, rect.y + rect.h - 8, rect.w - 10, 2, TEXT_LEADING);
    if (focused) { ctx.strokeStyle = C.focus; ctx.lineWidth = 1; ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4); }
  }
  ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace';
  drawTextLines(ctx, 'Tab / ← → compare · Enter take road · Esc back', 12, 176, VW - 24, 2, 7);
}

// The quartermaster board (M4). Buy lines + always-open resupply (left), party
// frames with slot chips (right), loose stores + sell/back (bottom). Every line
// ships its exact figure (register law 6). Pick an item, then a matching slot.
function renderShop(ctx, s) {
  const { party, ui, shopControls } = s;
  const shop = ui.shop; if (!shop) return;
  masthead(ctx, 'QUARTERMASTER: LEG ' + shop.legIndex);
  ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.dim; ctx.textAlign = 'right';
  pixelText(ctx, `ledger ¤${party.gold} · supplies ${party.supplies} · sell ${Math.round(TUNING.shopSellFraction * 100)}%`, VW - 12, 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
  pixelText(ctx, 'ISSUE (requisition)', 10, 35);
  pixelText(ctx, 'THE PARTY · ITEM THEN SLOT', 166, 35);

  const arr = shopControls || [];
  const pick = shop.pick;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], r = c.rect, focused = ui.focus === i;
    if (c.kind === 'buy') {
      const l = shop.lines[c.line], it = getItem(l.id);
      ctx.fillStyle = l.sold ? C.ink : C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = l.sold ? C.faint : C.paper;
      pixelText(ctx, it.name.slice(0, 16), r.x + 3, r.y);
      ctx.fillStyle = l.sold ? C.faint : C.dim; pixelText(ctx, modsLine(l.id), r.x + 3, r.y + 7);
      ctx.textAlign = 'right'; ctx.fillStyle = l.sold ? C.faint : C.filed;
      pixelText(ctx, l.sold ? 'REQUISITIONED' : l.price + '¤', r.x + r.w - 3, r.y + 4); ctx.textAlign = 'left';
    } else if (c.kind === 'resupply') {
      ctx.fillStyle = C.panel2; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = C.paper;
      pixelText(ctx, `RESUPPLY  +${TUNING.resupplyBlock} supplies`, r.x + 3, r.y + 4);
      ctx.textAlign = 'right'; ctx.fillStyle = C.filed; pixelText(ctx, TUNING.resupplyCost + '¤', r.x + r.w - 3, r.y + 4); ctx.textAlign = 'left';
    } else if (c.kind === 'slot') {
      const f = party.frames[c.frameIndex]; const id = f.equip[c.slot];
      const canEquip = pick && getItem(pick).slot === c.slot;
      ctx.fillStyle = canEquip ? C.panel2 : C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = canEquip ? C.filed : C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h);
      drawIcon(ctx, c.slot, r.x + 1, r.y + 1, 10); // sword/shield icon (pack art)
      ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = id ? C.paper : C.faint;
      pixelText(ctx, id ? getItem(id).name.split(' ').pop().slice(0, 5) : '-', r.x + 2, r.y + 5);
    } else if (c.kind === 'inv') {
      const picked = pick === c.itemId;
      ctx.fillStyle = picked ? C.filed : C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = picked ? C.paper : C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = picked ? C.ink : C.dim;
      pixelText(ctx, getItem(c.itemId).name.split(' ').pop().slice(0, 6), r.x + 2, r.y + 3);
    } else {
      // sell / back
      ctx.fillStyle = C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = C.paper;
      const lbl = c.kind === 'sell' ? (pick ? `SELL (+${sellValue(pick)}¤)` : 'SELL') : (typeof c.label === 'function' ? c.label() : c.label);
      pixelText(ctx, lbl, r.x + 4, r.y + 4);
    }
    if (focused) { ctx.strokeStyle = C.focus; ctx.lineWidth = 1; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); }
  }

  // Party frame labels + stats to the left of each frame's slot chips.
  party.frames.forEach((f, i) => {
    const y = 44 + i * 18;
    ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = (!f.alive || f.hp <= 0) ? C.stamp : C.paper;
    drawTextLines(ctx, f.name, 166, y + 1, 68, 1, TEXT_LEADING);
    ctx.fillStyle = C.faint; pixelText(ctx, `a${f.max.atk} d${f.max.def} m${f.max.mag}`, 166, y + 8);
  });
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'STORES', 10, 122);
  if (!(party.inventory || []).length) { ctx.fillStyle = C.faint; pixelText(ctx, '(stores empty; requisition above)', 62, 122); }
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
  pixelText(ctx, 'Tab · Enter act · a filled slot un-issues · Esc back', 12, 160);
  // A cobblestone street floors the quartermaster (M6 — town tiles): the office
  // stands somewhere. Native 16px Willibab town tiles, tiled + clipped.
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
      const card = getCard(c.cardId);
      drawCard(ctx, card.arcana, r.x, r.y, r.w, r.h - 10);
      ctx.fillStyle = C.dim; ctx.font = '6px ui-monospace, monospace';
      drawTextFit(ctx, card.name.replace(/^The /, ''), r.x, r.y + r.h - 14, r.w);
    } else {
      ctx.fillStyle = C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = C.paper; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, c.label, r.x + 5, r.y + 4);
    }
    if (focused) { ctx.strokeStyle = C.focus; ctx.lineWidth = c.cardId != null ? 2 : 1; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); }
  }
  const foc = arr[ui.focus];
  if (foc && foc.cardId != null) { ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; wrapText(ctx, getCard(foc.cardId).text + '  (Enter strikes it)', 120, 168, 190, 7, 3); }
  else { ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace'; drawTextLines(ctx, 'Tab / ← →  select · Enter strike · Esc back', 120, 184, 190, 2, 7); }
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
  pixelText(ctx, 'The desk may make each intervention. File to proceed.', 12, 50);
  let y = 66;
  for (const [name, desc] of INTAKE_BOXES) {
    ctx.fillStyle = C.filed; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, '[x]', 16, y);
    ctx.fillStyle = C.paper; pixelText(ctx, name, 36, y);
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; drawTextLines(ctx, desc, 116, y + 1, VW - 128, 2, TEXT_LEADING);
    y += 14;
  }
  const arr = intakeControls || [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], r = c.rect;
    ctx.fillStyle = C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = ui.focus === i ? C.focus : C.edge; ctx.lineWidth = ui.focus === i ? 2 : 1; ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = C.paper; ctx.font = '7px ui-monospace, monospace';
    drawTextLines(ctx, c.label, r.x + 8, r.y + 5, r.w - 16, 2, 7);
  }
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
  ctx.fillStyle = C.faint; pixelText(ctx, 'PLAYER-PATH MINIMUM:', 12, y); y += 9;
  for (const [k, lab] of Object.entries(labels)) {
    ctx.fillStyle = S.verbs[k] ? C.ok : C.stamp;
    pixelText(ctx, (S.verbs[k] ? '[✓] ' : '[✗] ') + lab, 18, y); y += 8;
  }
  // Watch/act metrics
  const m = S.metrics;
  ctx.fillStyle = C.faint; pixelText(ctx, 'WATCH / ACT METRICS:', 168, 48);
  ctx.fillStyle = C.dim;
  pixelText(ctx, `interventions: ${m.interventions}`, 174, 57);
  pixelText(ctx, `interventions/min: ${(m.interventionsPerMin || 0).toFixed(1)}`, 174, 66);
  pixelText(ctx, `longest passive: ${(m.maxPassiveSec || 0).toFixed(1)}s (floor 25s)`, 174, 75);
  pixelText(ctx, `soak steps: ${S.steps} · expeditions: ${(S.expeditions | 0) + 1}`, 174, 84);
  ctx.fillStyle = C.faint; pixelText(ctx, '(every verb via real input events)', 174, 95);
  // Findings
  ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace'; pixelText(ctx, 'FINDINGS:', 12, 118);
  y = 128;
  if (!S.findings.length) { ctx.fillStyle = C.ok; pixelText(ctx, '(none; clean run)', 18, y); }
  for (const f of S.findings.slice(0, 8)) {
    ctx.fillStyle = f.sev === 'BLOCKER' ? C.stamp : f.sev === 'DEFECT' ? C.hplow : C.dim;
    wrapText(ctx, `[${f.sev}] ${f.text}`, 18, y, VW - 30, 8); y += (wrapCount(ctx, `[${f.sev}] ${f.text}`, VW - 30)) * 8 + 2;
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
  pixelText(ctx, 'INCIDENT LEDGER: the chain that closed the file:', 12, 34);
  let y = 44;
  const lines = rep && rep.filed ? rep.filed.lines : [];
  for (const ln of lines) {
    ctx.fillStyle = ln.tone === 'credit' ? C.ok : ln.tone === 'suffer' ? C.stamp : C.paper;
    ctx.font = '7px ui-monospace, monospace';
    const rows = wrapCount(ctx, ln.text, VW - 28);
    wrapText(ctx, ln.text, 16, y, VW - 28, 8);
    y += rows * 8 + 3;
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
    return g.leveled ? `${nm}→Lv${g.after} (+${g.xp})` : `${nm} +${g.xp}`;
  }) : ['(no mastery earned this expedition)'];
  ctx.fillStyle = C.dim; wrapText(ctx, parts.join('  ·  '), 16, y + 9, VW - 28, 8);
  // New clearances (M5): what banking this run bought on the certification wall.
  const cleared = rep && rep.cleared ? rep.cleared : [];
  let cy = y + 19;
  for (const c of cleared) {
    ctx.fillStyle = C.ok; ctx.font = '6px ui-monospace, monospace';
    cy += drawTextLines(ctx, `NEW CLEARANCE. ${c.name}: ${c.desc}`, 16, cy, VW - 28, 2, 8) * 8 + 1;
  }
  if (rep) {
    ctx.fillStyle = C.faint; ctx.font = '6px ui-monospace, monospace';
    drawTextLines(ctx, `expeditions filed: ${rep.runs} · deepest leg: ${rep.deepestLeg} · escalation L${rep.escLevel}`, 16, cy, VW - 28, 2, 8);
  }

  drawControls(ctx, defeatControls, ui, true);
}

// The mandate strip: the Office's standing order. Prose title (deadpan) with an
// exact numeric neighbour (instruments never lie — register law 6): terminus,
// legs remaining, disbursement on discharge.
function drawMandateStrip(ctx, mandate, march, y) {
  const x0 = 12, x1 = VW - 12;
  ctx.strokeStyle = C.rule; ctx.strokeRect(x0, y, x1 - x0, 18);
  if (!mandate) { ctx.fillStyle = C.faint; ctx.font = '7px ui-monospace, monospace'; pixelText(ctx, 'NO MANDATE ON FILE', x0 + 4, y + 4); return; }
  const rem = legsRemaining(mandate, march.leg);
  drawIcon(ctx, 'mandate', x0 + 3, y + 2, 11); // the rolled instrument (pack art)
  ctx.font = '7px ui-monospace, monospace';
  ctx.fillStyle = C.focus; pixelText(ctx, 'MANDATE ' + mandate.ref, x0 + 16, y + 3);
  ctx.fillStyle = C.paper; drawTextLines(ctx, mandate.title, x0 + 110, y + 3, x1 - (x0 + 110) - 4, 2, 7);
  ctx.font = '6px ui-monospace, monospace'; ctx.fillStyle = C.dim;
  const remTxt = rem === 0 ? 'at terminus' : rem + ' leg' + (rem > 1 ? 's' : '') + ' to go';
  drawTextLines(ctx, `terminus leg ${mandate.destinationLeg} · ${remTxt} · discharge ≥ ${mandate.reward}¤`, x0 + 16, y + 10, x1 - (x0 + 16) - 4, 2, TEXT_LEADING);
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
  ctx.strokeStyle = C.rule; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = C.dim; ctx.font = '6px ui-monospace, monospace';
  const rows = ui.ticker.slice(-Math.floor((h - 6) / 9));
  rows.forEach((t, i) => pixelText(ctx, t.slice(0, 30), x + 3, y + 4 + i * 9));
  if (rows.length === 0) pixelText(ctx, '(nothing yet to record)', x + 3, y + 4);
}

function drawSaveIndicator(ctx, ui) {
  if (!ui.saved) return;
  ctx.font = '7px ui-monospace, monospace';
  if (nowMs() - ui.saved.at < 1600) { ctx.fillStyle = ui.saved.ok ? C.filed : C.stamp; pixelText(ctx, `FILED ✓ ${ui.saved.reason} @${ui.saved.tick}`, 96, 166); }
  else { ctx.fillStyle = C.faint; pixelText(ctx, `last filed @${ui.saved.tick}`, 96, 166); }
}

function drawControls(ctx, arr, ui, big) {
  ctx.font = '7px ui-monospace, monospace';
  if (arr.length && arr[0].id && arr[0].id.startsWith('spd')) { ctx.fillStyle = C.faint; pixelText(ctx, 'SPEED', 8, 185); }
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i], r = c.rect;
    const active = c.isActive && c.isActive(), focused = ui.focus === i, hover = ui.hover === i;
    ctx.fillStyle = active ? C.rule : C.panel; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? C.paper : C.edge; ctx.strokeRect(r.x, r.y, r.w, r.h); // interactive edge >=3:1
    ctx.fillStyle = active || hover ? C.paper : C.dim;
    const label = typeof c.label === 'function' ? c.label() : c.label;
    drawTextLines(ctx, label, r.x + 4, r.y + (big ? 6 : 4), r.w - 8, 2);
    if (focused) { ctx.strokeStyle = C.focus; ctx.lineWidth = 1; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); }
  }
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
  for (let i = 0; i < lines.length; i++) pixelText(ctx, lines[i], x, y + i * lineHeight);
  return lines.length;
}

// wrapCount: how many rows wrapText will render for `text` at width maxW.
function wrapCount(ctx, text, maxW, maxLines = Infinity) {
  return wrapLines(ctx, text, maxW, maxLines).length;
}

function wrapText(ctx, text, x, y, maxW, lh, maxLines = Infinity) {
  const lines = wrapLines(ctx, text, maxW, maxLines);
  for (let i = 0; i < lines.length; i++) pixelText(ctx, lines[i], x, y + i * lh);
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
