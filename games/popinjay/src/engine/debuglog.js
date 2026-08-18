// debuglog.js — LOUD failure surfacing (CLAUDE.md hard rule 4).
//
// "Nothing happens" is a banned failure mode. Every runtime error must (a) land in
// this ring buffer, (b) be exportable as text, and (c) surface VISIBLY in-game (the
// app wires `onError` to draw a red banner). This module is headless-safe: it
// touches no `window` at load and the sim can import it under `node --test`.

const MAX = 500; // ring-buffer cap — a runaway error loop can't exhaust memory

const buffer = [];
let seq = 0;
const listeners = new Set();

function push(level, msg, detail) {
  const entry = {
    seq: seq++,
    tick: currentTick,
    level,
    msg: String(msg),
    detail: detail === undefined ? null : detail,
  };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  for (const fn of listeners) { try { fn(entry); } catch (_) { /* a bad listener never breaks logging */ } }
  return entry;
}

// The sim stamps its current tick so a logged error is causally locatable. The
// renderer/app updates this each sim step.
let currentTick = 0;
export function setTick(t) { currentTick = t | 0; }

export const debuglog = {
  info(msg, detail) { return push('info', msg, detail); },
  warn(msg, detail) { return push('warn', msg, detail); },
  // error() is the LOUD path: logs, notifies listeners (the red banner), and — in a
  // browser — also mirrors to console.error so it's never swallowed.
  error(msg, detail) {
    const e = push('error', msg, detail);
    if (typeof console !== 'undefined' && console.error) {
      try { console.error('[POPINJAY]', msg, detail ?? ''); } catch (_) { /* ignore */ }
    }
    return e;
  },

  // Subscribe to entries (returns an unsubscribe fn). The app subscribes to paint
  // the on-screen banner the moment an error is logged.
  onEntry(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  entries() { return buffer.slice(); },
  errors() { return buffer.filter((e) => e.level === 'error'); },

  // Exportable text dump (DESIGN-SEED: failures land in the exportable debug log).
  export() {
    return buffer
      .map((e) => `[${String(e.seq).padStart(4, '0')}] t${e.tick} ${e.level.toUpperCase()} ${e.msg}` +
        (e.detail != null ? ` :: ${safeJson(e.detail)}` : ''))
      .join('\n');
  },

  clear() { buffer.length = 0; },
};

function safeJson(v) {
  try { return typeof v === 'string' ? v : JSON.stringify(v); }
  catch (_) { return String(v); }
}
