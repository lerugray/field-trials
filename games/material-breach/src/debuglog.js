// debuglog.js — loud failures (DESIGN-SEED §5, hard rule: silent catch blocks are a defect).
// The game keeps an in-memory, exportable log and NEVER swallows an error: an error is recorded
// and then re-surfaced. The in-game error surface (presentation) reads this log; the export button
// serialises it.
//
// Entries carry a monotonic sequence number, not a wall-clock timestamp: the pacing/determinism
// laws ban Date.now from game logic, and this file is scanned by those gates.

const LEVELS = Object.freeze(['info', 'warn', 'error']);

export function createDebugLog(capacity = 500) {
  const entries = [];
  let seq = 0;

  function record(level, message, detail = null) {
    if (!LEVELS.includes(level)) level = 'info';
    seq += 1;
    entries.push({ seq, level, message: String(message), detail: detail == null ? null : String(detail) });
    // Ring buffer: drop the oldest when over capacity so a long tenure cannot grow without bound.
    if (entries.length > capacity) entries.shift();
    return entries[entries.length - 1];
  }

  return {
    info: (m, d) => record('info', m, d),
    warn: (m, d) => record('warn', m, d),
    error: (m, d) => record('error', m, d),
    record,
    entries: () => entries.slice(),
    size: () => entries.length,
    // The exportable debug log: a plain-text dump the operator can save out.
    exportText() {
      const header = `MATERIAL BREACH debug log: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
      const body = entries.map((e) => {
        const detail = e.detail ? ` | ${e.detail}` : '';
        return `#${e.seq} [${e.level.toUpperCase()}] ${e.message}${detail}`;
      });
      return [header, ...body].join('\n');
    },
    clear() {
      entries.length = 0;
    },
  };
}

// surface(log, label, fn) -> runs fn; on throw it RECORDS the error and RE-THROWS it. This is the
// one sanctioned catch shape: log, then surface. It never returns normally on failure, so a caller
// cannot accidentally treat a failed operation as having succeeded.
export function surface(log, label, fn) {
  try {
    return fn();
  } catch (err) {
    log.error(`${label} failed: ${err && err.message ? err.message : err}`, err && err.stack);
    throw err;
  }
}
