// M14 posting-hardening — in-page flight recorder.
//
// A small ring buffer of recent console-level messages, uncaught errors with
// stacks, and tagged game events so a field-trial player can report a failure
// without opening the console. The log is always in memory; export is one click
// (copy or download) from the Settings panel.
//
// Pure + headless: the factory holds only the ring. Global error capture is
// opt-in and guarded for browsers.

export const DEBUGLOG_CAP = 200;

const LEVELS = new Set(['log', 'warn', 'error', 'event']);

function nowIso() {
  try { return new Date().toISOString(); }
  catch { return ''; }
}

function stackOf(err) {
  if (!err) return '';
  if (typeof err.stack === 'string') return err.stack;
  return String(err);
}

export function createDebugLog({ cap = DEBUGLOG_CAP, version = '0.1.0' } = {}) {
  const CAP = Math.max(1, cap | 0);
  let ring = [];
  let errorCount = 0;
  let onError = null;
  let captured = false;

  function push(level, message, meta = {}) {
    if (!LEVELS.has(level)) level = 'log';
    const entry = {
      t: nowIso(),
      level,
      message: message == null ? '' : String(message),
      meta: meta && typeof meta === 'object' ? meta : {},
    };
    if (level === 'error') errorCount += 1;
    ring.push(entry);
    if (ring.length > CAP) ring.splice(0, ring.length - CAP);
    if (level === 'error' && typeof onError === 'function') {
      try { onError(errorCount, entry); } catch { /* never let callback throw */ }
    }
    return entry;
  }

  const log = (message, meta) => push('log', message, meta);
  const warn = (message, meta) => push('warn', message, meta);
  const error = (message, meta) => push('error', message, meta);
  const event = (kind, data = {}) => push('event', kind, data && typeof data === 'object' ? data : { value: data });

  function entries() { return ring.map((e) => ({ ...e, meta: { ...e.meta } })); }
  function recent(n = 20) { return ring.slice(Math.max(0, ring.length - n)).map((e) => ({ ...e, meta: { ...e.meta } })); }
  function clear() { ring = []; errorCount = 0; }

  function toText() {
    const lines = [];
    for (const e of ring) {
      const meta = Object.keys(e.meta).length ? ' ' + JSON.stringify(e.meta) : '';
      lines.push(`[${e.t}] ${e.level.toUpperCase()}: ${e.message}${meta}`);
    }
    return lines.join('\n');
  }

  function toJson() {
    return JSON.stringify({
      version,
      exportedAt: nowIso(),
      url: (typeof location !== 'undefined' ? location.href : ''),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      errorCount,
      cap: CAP,
      entries: entries(),
    }, null, 2);
  }

  function download(filename = 'oddseedz-debug.log.json') {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
    try {
      const blob = new Blob([toJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch {
      return false;
    }
  }

  async function copy() {
    const text = toText();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through */ }
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
    return false;
  }

  function captureGlobalErrors(opts = {}) {
    if (captured) return;
    if (typeof window === 'undefined') return;
    captured = true;
    onError = opts.onError || null;

    window.addEventListener('error', (e) => {
      error('uncaught error', {
        message: e.message || String(e.error),
        filename: e.filename || '',
        lineno: e.lineno || 0,
        colno: e.colno || 0,
        stack: stackOf(e.error),
      });
      if (typeof e.preventDefault === 'function') e.preventDefault();
    });

    window.addEventListener('unhandledrejection', (e) => {
      const reason = e && e.reason;
      error('unhandled rejection', {
        message: reason && reason.message ? reason.message : String(reason),
        stack: stackOf(reason),
      });
      if (typeof e.preventDefault === 'function') e.preventDefault();
    });
  }

  return {
    log, warn, error, event,
    entries, recent, clear,
    toText, toJson,
    download, copy,
    captureGlobalErrors,
    get size() { return ring.length; },
    get cap() { return CAP; },
    get errorCount() { return errorCount; },
  };
}
