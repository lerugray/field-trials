// saves.js — atomic run+world persistence (DESIGN-SEED §The loop, death discipline:
// single run slot; the save is stamped DEAD the tick HP hits zero, BEFORE the
// scorecard renders — killing the process shows the scorecard on next boot, never a
// retry; quit-anywhere resume; resume can never re-roll anything).
//
// Storage-interface based (getItem/setItem/removeItem) so the round-trip is unit-
// testable with a fake store. A state = { seed, dead, world, run } — the World's
// plain-JSON serialize() PLUS the Run meta, saved together (atomic).

const SAVE_KEY = 'popinjay:save:v4';
export const SAVE_WRAPPER_V = 4;
export const WORLD_SAVE_V = 3;

export function saveState(storage, state) {
  if (!storage) return false;
  try { storage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_WRAPPER_V, ...state })); return true; }
  catch (_) { return false; }
}

// Inspect raw storage without swallowing faults — the boot path needs LOUD notice
// (DESIGN-SEED verification bar: corrupt/truncated/version-skew → graceful new run).
export function inspectSave(storage) {
  if (!storage) return { state: null, fault: null };
  let raw;
  try { raw = storage.getItem(SAVE_KEY); } catch (_) { return { state: null, fault: 'corrupt' }; }
  if (raw == null) return { state: null, fault: null };
  if (!String(raw).trim()) return { state: null, fault: 'truncated' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return { state: null, fault: 'corrupt' }; }
  if (!parsed || typeof parsed !== 'object') return { state: null, fault: 'corrupt' };
  if (parsed.v != null && parsed.v !== SAVE_WRAPPER_V) return { state: null, fault: 'version' };
  if (typeof parsed.seed !== 'number' || typeof parsed.dead !== 'boolean') return { state: null, fault: 'corrupt' };
  if (parsed.world && parsed.world.v != null && parsed.world.v !== WORLD_SAVE_V) return { state: null, fault: 'version' };
  return { state: parsed, fault: null };
}

export function loadState(storage) {
  return inspectSave(storage).state;
}

export function clearSave(storage) {
  if (!storage) return;
  try { storage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
}

const RESUMABLE_MODES = new Set(['playing', 'tourmap', 'draft', 'rehearsal']);

export function classifySave(s) {
  if (!s) return null;
  if (s.dead) return 'dead';
  // A mid-stage or just-cleared world is resumable (the cleared-ribbon state is
  // explicitly supported by the release-fix save lifecycle).
  if (s.world && !s.dead) return 'alive';
  // Between-beat states carry no World but are still resumable at the same beat.
  if (s.mode && RESUMABLE_MODES.has(s.mode)) return 'alive';
  return null;
}

// What can be resumed for the single run slot:
//   'dead'  — a death-stamped save → boot straight to the scorecard,
//   'alive' — a mid-stage save → offer resume,
//   null    — nothing (absent, wrong seed when filtered, or a finished stage).
// When `requestedSeed` is omitted the save's own seed governs (boot/resume across
// relaunch). When provided, it must match — a player starting a different seed must
// not inherit another run.
export function resumableKind(storage, requestedSeed) {
  const s = loadState(storage);
  if (!s) return null;
  if (requestedSeed !== undefined && (s.seed >>> 0) !== (requestedSeed >>> 0)) return null;
  return classifySave(s);
}

export function saveNoticeFor(fault) {
  if (fault === 'version') return 'SAVE VERSION MISMATCH. NEW RUN STARTED';
  if (fault === 'truncated') return 'SAVE TRUNCATED. NEW RUN STARTED';
  if (fault === 'corrupt') return 'SAVE UNREADABLE. NEW RUN STARTED';
  return null;
}

// -- Local best-score table (DESIGN-SEED: title top-10, seed shown) -----------
const SCORES_KEY = 'popinjay:scores:v1';

export function loadScores(storage) {
  if (!storage) return [];
  try { const s = storage.getItem(SCORES_KEY); const a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; }
  catch (_) { return []; }
}

// Record a finished run's score; keep the sorted top 10. Returns the new table.
export function recordScore(storage, entry) {
  const list = loadScores(storage);
  list.push({ score: entry.score | 0, seed: entry.seed >>> 0, victory: !!entry.victory });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  if (storage) { try { storage.setItem(SCORES_KEY, JSON.stringify(top)); } catch (_) { /* ignore */ } }
  return top;
}

// -- Run history (DESIGN-SEED M6: run history + best-score table) --------------
// A chronological log of recent runs (newest first), distinct from the top-score
// table — it records HOW each run ended (causal), for the "recent runs" readout.
const RUNS_KEY = 'popinjay:runs:v1';
const RUNS_CAP = 12;
export function loadRuns(storage) {
  if (!storage) return [];
  try { const s = storage.getItem(RUNS_KEY); const a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; }
  catch (_) { return []; }
}
export function recordRun(storage, entry) {
  const list = loadRuns(storage);
  list.unshift({ // newest first
    score: entry.score | 0, seed: entry.seed >>> 0, victory: !!entry.victory,
    locale: entry.locale | 0, stage: entry.stage | 0, culpritCls: entry.culpritCls || null,
  });
  const kept = list.slice(0, RUNS_CAP);
  if (storage) { try { storage.setItem(RUNS_KEY, JSON.stringify(kept)); } catch (_) { /* ignore */ } }
  return kept;
}

// -- Persistent unlock flags (Endless Panic, …) -------------------------------
const FLAGS_KEY = 'popinjay:flags:v1';
export function loadFlags(storage) {
  if (!storage) return {};
  try { const s = storage.getItem(FLAGS_KEY); const o = s ? JSON.parse(s) : {}; return (o && typeof o === 'object') ? o : {}; }
  catch (_) { return {}; }
}
export function setFlag(storage, key, value) {
  const f = loadFlags(storage); f[key] = value;
  if (storage) { try { storage.setItem(FLAGS_KEY, JSON.stringify(f)); } catch (_) { /* ignore */ } }
  return f;
}

// -- The TRUNK (curated meta; DESIGN-SEED §The loop) ---------------------------
// The player starts owning 12 souvenirs; a persistent TICKET BANK (fed by run
// payouts) unlocks the rest. The draft pool is gated to OWNED souvenirs, so
// progression is curation, never pool dilution.
const TRUNK_KEY = 'popinjay:trunk:v1';
export const STARTER_SOUVENIRS = [
  'secondBarrel', 'skyAnchor', 'quickSpool', 'gallerySidearm', 'longFuse',
  'plumeHat', 'shieldCharm', 'ribbonChain', 'confettiBonus', 'seasonPass', 'punctual', 'operaGlasses',
];
export const UNLOCK_COST = 12; // prize tickets per new souvenir

function loadTrunk(storage) {
  if (!storage) return { owned: STARTER_SOUVENIRS.slice(), bank: 0 };
  try {
    const s = storage.getItem(TRUNK_KEY); const t = s ? JSON.parse(s) : null;
    if (t && Array.isArray(t.owned)) return { owned: t.owned, bank: t.bank | 0 };
  } catch (_) { /* fall through */ }
  return { owned: STARTER_SOUVENIRS.slice(), bank: 0 };
}
function saveTrunk(storage, t) { if (storage) { try { storage.setItem(TRUNK_KEY, JSON.stringify(t)); } catch (_) { /* ignore */ } } return t; }

export function ownedSouvenirs(storage) { return loadTrunk(storage).owned; }
export function ticketBank(storage) { return loadTrunk(storage).bank; }
export function bankTickets(storage, n) { const t = loadTrunk(storage); t.bank += n | 0; return saveTrunk(storage, t).bank; }
// Unlock a souvenir from the bank (returns true on success).
export function unlockSouvenir(storage, id) {
  const t = loadTrunk(storage);
  if (t.owned.includes(id) || t.bank < UNLOCK_COST) return false;
  t.bank -= UNLOCK_COST; t.owned.push(id); saveTrunk(storage, t);
  return true;
}

// -- SETTINGS (options + the accessibility floor; DESIGN-SEED §Accessibility) ---
// Persisted so a chosen comfort preset survives a reload. All are additive comfort
// controls — none disables tickets, unlocks, or victory (parity law).
const SETTINGS_KEY = 'popinjay:settings:v1';
export const DEFAULT_SETTINGS = {
  volume: 0.8,        // master audio 0..1
  muted: false,       // master mute
  sfx: 1.0,           // sfx level relative to the music (0..1) — the split control
  flashReduce: false, // damp pop flashes/confetti to the calmest safe form
  reduceMotion: false,// honor a reduced-motion preference (no confetti, gentler effects)
  gameSpeed: 1.0,     // global speed scale (0.8 / 0.9 / 1.0) — an assist, never a gate
  composure: 3,       // starting/max composure hearts (3 default; 4 / 5 as an assist)
  parOff: false,      // turn the closing-bell drip pressure OFF (comfort)
};

export function loadSettings(storage) {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const s = storage.getItem(SETTINGS_KEY); const o = s ? JSON.parse(s) : {};
    return { ...DEFAULT_SETTINGS, ...(o && typeof o === 'object' ? o : {}) };
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}
export function setSetting(storage, key, value) {
  const s = loadSettings(storage);
  if (!(key in DEFAULT_SETTINGS)) return s; // never persist an unknown key
  s[key] = value;
  if (storage) { try { storage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ } }
  return s;
}

export { SAVE_KEY, SCORES_KEY, FLAGS_KEY, TRUNK_KEY, SETTINGS_KEY, RUNS_KEY };
