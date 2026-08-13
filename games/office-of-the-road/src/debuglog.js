// debuglog.js — LOUD FAILURES (CLAUDE.md hard rule #4; Ashen-Liturgy LoA pattern).
//
// Every runtime error surfaces visibly in-game AND lands in an exportable log.
// "Nothing happens" is a banned failure mode. This module is the log core:
//   - a bounded ring buffer of timestamped, tick-stamped entries
//   - levels: info / warn / error
//   - an onError subscriber so the UI can flash/surface the moment an error lands
//   - a plain-text export for the "exportable debug log" requirement
//
// DOM-free so it runs under node --test. main.js wires the visible surfacing
// (overlay + error banner) and installs the global browser handlers.

const LEVELS = { info: 0, warn: 1, error: 2 };

export class DebugLog {
  constructor({ capacity = 500 } = {}) {
    this.capacity = capacity;
    this.entries = [];
    this.seq = 0;
    this.errorCount = 0;
    this._onError = null;
    this._onAny = null;
    this._tick = 0;
  }

  // setTick: stamp subsequent entries with the engine tick (called by the loop).
  setTick(t) {
    this._tick = t | 0;
  }

  // onError / onAny: UI subscribers. onError fires only for level 'error'.
  onError(fn) {
    this._onError = fn;
  }
  onAny(fn) {
    this._onAny = fn;
  }

  _push(level, msg, data) {
    const entry = {
      seq: this.seq++,
      level,
      tick: this._tick,
      msg: String(msg),
      data: data === undefined ? null : data,
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    if (level === 'error') this.errorCount++;
    if (this._onAny) { try { this._onAny(entry); } catch { /* never let logging throw */ } }
    if (level === 'error' && this._onError) { try { this._onError(entry); } catch { /* ditto */ } }
    return entry;
  }

  info(msg, data) { return this._push('info', msg, data); }
  warn(msg, data) { return this._push('warn', msg, data); }
  error(msg, data) { return this._push('error', msg, data); }

  // guard: run fn; any throw is logged LOUDLY as an error (never swallowed) and
  // re-surfaced. Returns fn's result, or undefined if it threw. Use to wrap
  // per-tick / per-frame work so one bad frame becomes a visible logged error,
  // not a silent freeze.
  guard(label, fn) {
    try {
      return fn();
    } catch (e) {
      this.error(`${label}: ${e && e.message ? e.message : e}`, {
        stack: e && e.stack ? String(e.stack) : null,
      });
      return undefined;
    }
  }

  // recent: the last n entries (for the on-screen overlay).
  recent(n = 8) {
    return this.entries.slice(-n);
  }

  // exportText: the full log as a plain-text blob (the exportable debug log).
  exportText() {
    const head = `OFFICE OF THE ROAD — debug log (${this.entries.length} entries, ${this.errorCount} errors)`;
    const lines = this.entries.map((e) => {
      const lv = e.level.toUpperCase().padEnd(5);
      const d = e.data ? ' ' + safeJson(e.data) : '';
      return `[t${String(e.tick).padStart(6)}] ${lv} #${e.seq} ${e.msg}${d}`;
    });
    return [head, ...lines].join('\n');
  }

  compareLevel(a, b) {
    return LEVELS[a] - LEVELS[b];
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

// installGlobalHandlers: catch uncaught browser errors so they land in the log
// AND surface (loudness law). No-op under node (no window). Guarded so a missing
// global never throws.
export function installGlobalHandlers(log, win) {
  if (!win || typeof win.addEventListener !== 'function') return;
  win.addEventListener('error', (ev) => {
    log.error(`uncaught: ${ev.message || 'error'}`, {
      src: ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : null,
    });
  });
  win.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    log.error(`unhandled rejection: ${r && r.message ? r.message : r}`, {
      stack: r && r.stack ? String(r.stack) : null,
    });
  });
}
