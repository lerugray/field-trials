// THE JACQUARD INDEX — debug log (the loud-failure law, hard-rule 7).
//
// "Nothing happens" is banned. Every runtime error surfaces visibly in-game AND lands
// here, in an exportable ring buffer. This module is the buffer + formatter; the boot
// shim wires window error handlers into it and renders the error overlay. Pure and
// testable: no DOM, no time source injected here (the shim stamps entries).

export const LEVELS = { info: 'INFO', warn: 'WARN', error: 'ERROR' };

export class DebugLog {
  constructor(capacity = 200) {
    this.capacity = capacity;
    this.entries = [];
    this.errorCount = 0;
  }

  push(level, message, stamp = 0) {
    const text = message == null ? '' : String(message);
    const entry = { level, message: text, stamp };
    this.entries.push(entry);
    if (level === LEVELS.error) this.errorCount++;
    if (this.entries.length > this.capacity) this.entries.shift();
    return entry;
  }

  info(m, stamp) { return this.push(LEVELS.info, m, stamp); }
  warn(m, stamp) { return this.push(LEVELS.warn, m, stamp); }
  error(m, stamp) { return this.push(LEVELS.error, m, stamp); }

  hasErrors() { return this.errorCount > 0; }

  // Most-recent-first slice, for the on-screen overlay.
  recent(n) {
    return this.entries.slice(Math.max(0, this.entries.length - n)).reverse();
  }

  // Exportable plain text (copied/downloaded from the shim). One line per entry.
  toText() {
    return this.entries
      .map((e) => `[${String(e.stamp).padStart(8, '0')}] ${e.level}  ${e.message}`)
      .join('\n');
  }

  clear() {
    this.entries = [];
    this.errorCount = 0;
  }
}
