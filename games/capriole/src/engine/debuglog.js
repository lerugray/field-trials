// debuglog.js — the LoA ("Loud on Anomaly") debug log. CLAUDE.md hard rule 4:
// FAILURES ARE LOUD. Every runtime error surfaces visibly in-game AND lands in an
// exportable log. "Nothing happens" is a banned failure mode.
//
// This module is renderer-agnostic: it collects entries and notifies subscribers.
// The renderer subscribes to paint an on-screen banner; a test can subscribe to
// assert an error was raised. Nothing here touches the DOM directly, so it runs
// under `node --test` with zero WebGL.

export const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export class DebugLog {
  constructor({ capacity = 500 } = {}) {
    this.capacity = capacity;
    this.entries = [];       // ring buffer of { seq, level, tag, msg, data, tick }
    this.subscribers = new Set();
    this.seq = 0;
    this.tick = 0;           // sim tick stamp, set by the sim each step
    this.errorCount = 0;
  }

  setTick(t) { this.tick = t | 0; }

  _emit(level, tag, msg, data) {
    const entry = { seq: this.seq++, level, tag, msg, data, tick: this.tick };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    if (level >= LEVELS.error) this.errorCount++;
    for (const fn of this.subscribers) {
      try { fn(entry); } catch { /* a broken subscriber must never mask the log */ }
    }
    return entry;
  }

  debug(tag, msg, data) { return this._emit(LEVELS.debug, tag, msg, data); }
  info(tag, msg, data)  { return this._emit(LEVELS.info, tag, msg, data); }
  warn(tag, msg, data)  { return this._emit(LEVELS.warn, tag, msg, data); }
  error(tag, msg, data) { return this._emit(LEVELS.error, tag, msg, data); }

  // Wrap a throwing region so a runtime error is LOUD (logged) and re-thrown or
  // swallowed-with-record per `rethrow`. Never silently eaten.
  guard(tag, fn, { rethrow = false } = {}) {
    try {
      return fn();
    } catch (e) {
      this.error(tag, e && e.message ? e.message : String(e), { stack: e && e.stack });
      if (rethrow) throw e;
      return undefined;
    }
  }

  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }

  hasErrors() { return this.errorCount > 0; }

  // Exportable dump — a blob for the in-game "export debug log" button.
  export() {
    return this.entries
      .map((e) => {
        const lvl = Object.keys(LEVELS).find((k) => LEVELS[k] === e.level) || '?';
        const d = e.data ? ' ' + safeJson(e.data) : '';
        return `[${e.tick}] ${lvl.toUpperCase()} ${e.tag}: ${e.msg}${d}`;
      })
      .join('\n');
  }
}

function safeJson(o) {
  try { return JSON.stringify(o); } catch { return '<unserializable>'; }
}

// A default shared instance for convenience; systems may also own their own.
export const debugLog = new DebugLog();

export default DebugLog;
