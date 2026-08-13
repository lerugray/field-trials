// save.js — CONTINUOUS AUTOSAVE + resume (DESIGN-SEED M1: "the Office holds the
// file open"). The save envelope is plain JSON capturing the world seed, the
// player config, and exact mid-expedition engine state (RNG positions included),
// so a reload resumes byte-identically. Storage is abstracted so the core stays
// node-testable and file:// localStorage failures degrade LOUDLY, never silently.

import { createMarch, serializeMarch, restoreMarch, step } from './engine.js';
import { serializeParty, restoreParty } from './party.js';
import { serializeDeck, restoreDeck } from './deck.js';
import { serializeMandate, restoreMandate } from './mandate.js';
import { TUNING } from './tuning.js';

export const SAVE_KEY = 'office-of-the-road/save/v5';
export const LEGACY_SAVE_KEYS = ['office-of-the-road/save/v4'];
export const SAVE_VERSION = 5;
export const RUN_OPEN = 'OPEN';
export const RUN_CLOSED = 'CLOSED';
let runIdCounter = 0;

function jsonClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// A run id is created once when an expedition opens, then persisted in every
// snapshot. It is bookkeeping identity, not gameplay randomness.
export function createRunId(seed = 0) {
  const cryptoApi = typeof globalThis !== 'undefined' && globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const time = Date.now().toString(36);
  const nonce = (++runIdCounter).toString(36);
  return `run-${(seed >>> 0).toString(16)}-${time}-${nonce}`;
}

// Combat contains a reference graph: resolver wrappers point at the canonical
// party/enemy entities and the initiative order points at those wrappers. JSON
// alone would duplicate those objects and silently break attrition after reload,
// so the graph is flattened to indices and explicitly rewired on restore.
export function serializeCombat(combat) {
  if (!combat || !combat.st) return null;
  const out = {};
  for (const [key, value] of Object.entries(combat)) {
    if (key !== 'st' && key !== 'enemies' && key !== 'handRects' && key !== 'draftRects') out[key] = jsonClone(value);
  }
  const s = combat.st;
  const wrap = (w) => ({ temp: { ...(w.temp || {}) }, atkBuff: w.atkBuff | 0, defBuff: w.defBuff | 0, stunned: !!w.stunned });
  out.st = {
    enemies: jsonClone(s.enemies),
    partyW: s.partyW.map(wrap),
    enemyW: s.enemyW.map(wrap),
    order: s.order.map((w) => ({ side: w.side, idx: w.idx })),
    round: s.round | 0,
    ptr: s.ptr | 0,
    done: !!s.done,
    victory: !!s.victory,
    stalemate: !!s.stalemate,
    log: jsonClone(s.log || []),
  };
  return out;
}

export function restoreCombat(snap, party) {
  if (!snap || !snap.st || !party) return null;
  const enemies = jsonClone(snap.st.enemies || []);
  const rebuild = (side, entities, wraps) => entities.map((e, idx) => {
    const w = (wraps && wraps[idx]) || {};
    return { side, e, idx, temp: { ...(w.temp || { def: 0 }) }, atkBuff: w.atkBuff | 0, defBuff: w.defBuff | 0, stunned: !!w.stunned };
  });
  const partyW = rebuild('party', party.frames, snap.st.partyW);
  const enemyW = rebuild('enemy', enemies, snap.st.enemyW);
  const byRef = (ref) => (ref.side === 'party' ? partyW : enemyW)[ref.idx];
  const st = {
    party,
    enemies,
    partyW,
    enemyW,
    order: (snap.st.order || []).map(byRef).filter(Boolean),
    round: snap.st.round | 0,
    ptr: snap.st.ptr | 0,
    done: !!snap.st.done,
    victory: !!snap.st.victory,
    stalemate: !!snap.st.stalemate,
    log: jsonClone(snap.st.log || []),
  };
  const out = {};
  for (const [key, value] of Object.entries(snap)) if (key !== 'st') out[key] = jsonClone(value);
  out.st = st;
  out.enemies = enemies;
  return out;
}

export function serializeLiveUi(ui) {
  if (!ui) return null;
  const keys = ['screen', 'paused', 'focus', 'ticker', 'combat', 'camp', 'shop', 'route',
    'noProgress', 'omen', 'mandateNotice', 'report', 'muted', 'escLevel'];
  const out = {};
  for (const key of keys) {
    if (ui[key] === undefined) continue;
    out[key] = key === 'combat' ? serializeCombat(ui.combat) : jsonClone(ui[key]);
  }
  return out;
}

export function restoreLiveUi(snap, party) {
  if (!snap) return null;
  const out = jsonClone(snap);
  out.combat = restoreCombat(snap.combat, party);
  out.holdPause = false;
  out.hover = -1;
  return out;
}

// makeSave: the full save envelope from live config + march + party + deck +
// mandate (plain JSON). Party/deck/mandate are optional; the caller supplies
// defaults when a field is absent (forward/backward tolerant within a version).
export function makeSave(config, march, party, deck, mandate, runMastery, live = {}) {
  return {
    v: SAVE_VERSION,
    status: RUN_OPEN,
    runId: live.runId || `probe-${config.seed >>> 0}`,
    savedAtTick: march.tick,
    config: { seed: config.seed >>> 0, speedIndex: config.speedIndex | 0 },
    march: serializeMarch(march),
    party: party ? serializeParty(party) : null,
    deck: deck ? serializeDeck(deck) : null,
    mandate: mandate ? serializeMandate(mandate) : null,
    // unbanked job-mastery earned this run (M5) — kept so a mid-run quit/resume
    // doesn't lose certification progress before it's banked at run-end.
    runMastery: runMastery ? { ...runMastery } : null,
    ledger: live.ledger ? jsonClone(live.ledger) : null,
    progressTrk: live.progressTrk ? jsonClone(live.progressTrk) : null,
    ui: serializeLiveUi(live.ui),
  };
}

export function makeClosedSave(runId, cause, closedAtTick) {
  return { v: SAVE_VERSION, status: RUN_CLOSED, runId, cause, closedAtTick: closedAtTick | 0 };
}

export function parseSaveRecord(raw) {
  if (!raw) return null;
  let obj;
  try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!obj || obj.v !== SAVE_VERSION || typeof obj.runId !== 'string' || !obj.runId) return null;
  if (obj.status === RUN_CLOSED) return obj;
  if (obj.status !== RUN_OPEN || !obj.march || !obj.config) return null;
  if (typeof obj.march.seed !== 'number' || !obj.march.streams) return null;
  return obj;
}

// parseSave: validate + parse a raw save string. Returns the envelope or null
// (never throws) so a corrupt save can be reported loudly and discarded.
export function parseSave(raw) {
  const obj = parseSaveRecord(raw);
  return obj && obj.status === RUN_OPEN ? obj : null;
}

// applySave: reconstruct live { config, march, party } from a validated envelope.
// Party may be null on an early save; the caller supplies a default in that case.
export function applySave(save) {
  const party = save.party ? restoreParty(save.party) : null;
  return {
    runId: save.runId,
    config: { seed: save.config.seed >>> 0, speedIndex: save.config.speedIndex | 0 },
    march: restoreMarch(save.march),
    party,
    deck: save.deck ? restoreDeck(save.deck) : null,
    mandate: save.mandate ? restoreMandate(save.mandate) : null,
    runMastery: save.runMastery ? { ...save.runMastery } : null,
    ledger: save.ledger ? jsonClone(save.ledger) : null,
    progressTrk: save.progressTrk ? jsonClone(save.progressTrk) : null,
    ui: restoreLiveUi(save.ui, party),
  };
}

// Development v4 saves lack the live state needed for an honest exact resume.
// Remove only the explicitly-known old keys; unrelated storage is untouched.
export function invalidateLegacySaves(storage) {
  const invalidated = [];
  for (const key of LEGACY_SAVE_KEYS) {
    if (storage.read(key) != null) { storage.clear(key); invalidated.push(key); }
  }
  return invalidated;
}

// createStorage: a guarded localStorage wrapper. `available` is false (loudly)
// when the platform denies storage (some file:// contexts); callers fall back to
// in-memory so play never breaks — it just won't persist across reloads.
export function createStorage(win) {
  let backend = null;
  try {
    if (win && win.localStorage) {
      const probe = '__oor_probe__';
      win.localStorage.setItem(probe, '1');
      win.localStorage.removeItem(probe);
      backend = win.localStorage;
    }
  } catch {
    backend = null;
  }
  const mem = new Map();
  const available = backend != null;
  return {
    available,
    read(key) {
      try {
        return available ? backend.getItem(key) : (mem.has(key) ? mem.get(key) : null);
      } catch {
        return mem.has(key) ? mem.get(key) : null;
      }
    },
    write(key, val) {
      try {
        if (available) backend.setItem(key, val); else mem.set(key, val);
        return true;
      } catch {
        mem.set(key, val); // last-ditch in-memory so the write never throws
        return false;
      }
    },
    clear(key) {
      try { if (available) backend.removeItem(key); } catch { /* ignore */ }
      mem.delete(key);
    },
  };
}

// determinismProbe: the save-round-trip guarantee (DESIGN-SEED M1). March
// `primeTicks`, snapshot through the FULL save envelope (stringify+parse+apply),
// then run `probeTicks` on both the live and the reloaded state and compare every
// event. Returns { ok, primeTicks, probeTicks, firstDiff }. Pure — no storage.
export function determinismProbe(seed, primeTicks = 137, probeTicks = TUNING.determinismProbeTicks) {
  const march = createMarch(seed);
  for (let i = 0; i < primeTicks; i++) step(march);

  // Snapshot through the FULL save envelope: live state -> JSON string -> parse
  // -> apply. This exercises exactly what a real quit/reload does.
  const config = { seed, speedIndex: TUNING.defaultSpeedIndex };
  const envelope = parseSave(JSON.stringify(makeSave(config, march)));
  const reloaded = applySave(envelope).march;

  for (let i = 0; i < probeTicks; i++) {
    const a = step(march);
    const b = step(reloaded);
    if (JSON.stringify(a) !== JSON.stringify(b) ||
        march.tick !== reloaded.tick ||
        march.totalPaces !== reloaded.totalPaces) {
      return { ok: false, primeTicks, probeTicks, firstDiff: i };
    }
  }
  return { ok: true, primeTicks, probeTicks, firstDiff: -1 };
}
