// SHOELEATHER — debug log (the loud-failure spine).
//
// CLAUDE.md rule 9: FAILURES MUST BE LOUD. Runtime errors surface visibly in-game
// AND land in the exportable debug log. "Nothing happens" is a banned failure mode.
//
// This is the pure, node-testable core. The browser layer attaches a visible sink
// (an on-screen error banner) and a global error/rejection handler; both route here
// so the same record drives the in-game surface and the exported text.

export const LEVELS = Object.freeze({ trace: 0, info: 1, warn: 2, error: 3 });

export class DebugLog {
  // clock: injectable time source (ms). Defaults to a monotonic counter so the core
  // stays deterministic and testable without wall-clock.
  constructor({ capacity = 1000, clock = null } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`DebugLog capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this._tick = 0;
    this.clock = clock || (() => this._tick++);
    this.entries = [];
    this._seq = 0;
    this._sinks = new Set();
    this._errorCount = 0;
  }

  log(level, tag, message, data) {
    if (!(level in LEVELS)) throw new RangeError(`unknown log level: ${level}`);
    const entry = Object.freeze({
      seq: this._seq++,
      t: this.clock(),
      level,
      tag: String(tag),
      message: String(message),
      data: data === undefined ? undefined : data,
    });
    if (level === 'error') this._errorCount++;
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      const dropped = this.entries.shift();
      if (dropped.level === 'error') this._errorCount--;
    }
    // Sinks must never break logging (least of all the error path).
    for (const sink of this._sinks) {
      try { sink(entry); } catch (_) { /* a broken sink cannot silence the log */ }
    }
    return entry;
  }

  trace(tag, message, data) { return this.log('trace', tag, message, data); }
  info(tag, message, data) { return this.log('info', tag, message, data); }
  warn(tag, message, data) { return this.log('warn', tag, message, data); }
  error(tag, message, data) { return this.log('error', tag, message, data); }

  // Capture a thrown value (Error or otherwise) as a loud error entry.
  capture(tag, err, data) {
    const message = err && err.message ? err.message : String(err);
    const payload = { ...(data || {}) };
    if (err && err.stack) payload.stack = err.stack;
    return this.log('error', tag, message, Object.keys(payload).length ? payload : undefined);
  }

  addSink(fn) {
    if (typeof fn !== 'function') throw new TypeError('sink must be a function');
    this._sinks.add(fn);
    return () => this._sinks.delete(fn);
  }

  hasErrors() { return this._errorCount > 0; }
  errorCount() { return this._errorCount; }

  filter(level) {
    const min = LEVELS[level];
    if (min === undefined) throw new RangeError(`unknown log level: ${level}`);
    return this.entries.filter((e) => LEVELS[e.level] >= min);
  }

  // Exportable plain text — the operator-facing artifact of the loud-failure law.
  export() {
    return this.entries.map(formatEntry).join('\n');
  }

  clear() {
    this.entries = [];
    this._errorCount = 0;
  }
}

export function formatEntry(e) {
  const ts = String(e.t).padStart(8, ' ');
  const base = `[${ts}] ${e.level.toUpperCase().padEnd(5)} ${e.tag}: ${e.message}`;
  if (e.data === undefined) return base;
  let dataStr;
  try { dataStr = JSON.stringify(e.data); } catch (_) { dataStr = '[unserializable]'; }
  return `${base} ${dataStr}`;
}
