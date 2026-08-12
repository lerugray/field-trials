// debuglog.js: bounded, failure-safe diagnostics for operator field play.

const DEBUG_LOG_CAPACITY = 2000;
const DEBUG_MIRROR_LIMIT = 300;
const DEBUG_MIRROR_EVERY = 20;
const DEBUG_MIRROR_KEY = 'loa-debug-mirror-v1';

function defaultNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
}

function errorDetails(error) {
  try {
    if (error instanceof Error) {
      return { message: error.message || String(error), stack: error.stack || null };
    }
    if (error && typeof error === 'object') {
      return {
        message: typeof error.message === 'string' ? error.message : String(error),
        stack: typeof error.stack === 'string' ? error.stack : null
      };
    }
    return { message: String(error ?? 'Unknown error'), stack: null };
  } catch {
    return { message: 'Unreadable error', stack: null };
  }
}

function createDebugLog(options = {}) {
  const capacity = Math.max(1, options.capacity ?? DEBUG_LOG_CAPACITY);
  const mirrorLimit = Math.max(1, options.mirrorLimit ?? DEBUG_MIRROR_LIMIT);
  const mirrorEvery = Math.max(1, options.mirrorEvery ?? DEBUG_MIRROR_EVERY);
  const mirrorKey = options.mirrorKey || DEBUG_MIRROR_KEY;
  const storage = options.storage || null;
  const now = options.now || defaultNow;
  const wallNow = options.wallNow || Date.now;
  const version = options.version || 'unknown';
  const buildStamp = options.buildStamp || 'unknown';
  const userAgent = options.userAgent || '';
  const storageMode = options.storageMode || 'memory';
  const started = now();
  const sessionTimestamp = new Date(wallNow()).toISOString();
  const ring = new Array(capacity);
  let head = 0;
  let size = 0;
  let sequence = 0;
  let previousSession = null;
  let removeErrorCapture = null;

  try {
    if (storage) {
      const raw = storage.getItem(mirrorKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.entries)) previousSession = parsed;
    }
  } catch {
    previousSession = null;
  }

  function entries() {
    try {
      const result = [];
      for (let i = 0; i < size; i += 1) {
        result.push(ring[(head + i) % capacity]);
      }
      return result;
    } catch {
      return [];
    }
  }

  function mirror() {
    try {
      if (!storage) return false;
      const recent = entries().slice(-mirrorLimit);
      storage.setItem(mirrorKey, JSON.stringify({
        header: {
          version,
          buildStamp,
          timestamp: sessionTimestamp,
          userAgent,
          storageMode,
          entryCount: recent.length
        },
        entries: recent
      }));
      return true;
    } catch {
      return false;
    }
  }

  function record(type, data = {}) {
    try {
      sequence += 1;
      const entry = {
        seq: sequence,
        t: Math.max(0, Math.round(now() - started)),
        type: String(type),
        data
      };
      if (size < capacity) {
        ring[(head + size) % capacity] = entry;
        size += 1;
      } else {
        ring[head] = entry;
        head = (head + 1) % capacity;
      }
      if (sequence % mirrorEvery === 0) mirror();
      return entry;
    } catch {
      return null;
    }
  }

  function recordError(error, context = {}) {
    try {
      return record('error', { ...context, ...errorDetails(error) });
    } catch {
      return null;
    }
  }

  function guard(seam, data, work) {
    try {
      return work();
    } catch (error) {
      recordError(error, { seam, ...(data || {}) });
      throw error;
    }
  }

  function exportData() {
    try {
      const currentEntries = entries();
      return {
        header: {
          version,
          buildStamp,
          timestamp: new Date(wallNow()).toISOString(),
          userAgent,
          storageMode,
          entryCount: currentEntries.length
        },
        entries: currentEntries,
        previousSession
      };
    } catch {
      return {
        header: { version, buildStamp, timestamp: '', userAgent, storageMode, entryCount: 0 },
        entries: [],
        previousSession: null
      };
    }
  }

  function exportJson() {
    try {
      return JSON.stringify(exportData(), null, 2);
    } catch {
      return '{"header":{"entryCount":0},"entries":[],"previousSession":null}';
    }
  }

  function captureErrors(scope) {
    try {
      if (!scope || typeof scope.addEventListener !== 'function') return () => {};
      const onError = (event) => {
        const details = errorDetails(event?.error || event?.message || 'Window error');
        record('error', {
          source: 'window.onerror',
          message: details.message,
          stack: details.stack,
          file: event?.filename || null,
          line: event?.lineno || null,
          column: event?.colno || null
        });
      };
      const onRejection = (event) => {
        const details = errorDetails(event?.reason);
        record('error', {
          source: 'unhandledrejection',
          message: details.message,
          stack: details.stack
        });
      };
      scope.addEventListener('error', onError);
      scope.addEventListener('unhandledrejection', onRejection);
      return () => {
        try {
          scope.removeEventListener('error', onError);
          scope.removeEventListener('unhandledrejection', onRejection);
        } catch {
          // Diagnostics teardown must remain inert.
        }
      };
    } catch {
      return () => {};
    }
  }

  function installErrorCapture(scope) {
    try {
      if (removeErrorCapture) removeErrorCapture();
      removeErrorCapture = captureErrors(scope);
    } catch {
      // Diagnostics setup must remain inert.
    }
  }

  function destroy() {
    try {
      if (removeErrorCapture) removeErrorCapture();
      removeErrorCapture = null;
    } catch {
      // Diagnostics teardown must remain inert.
    }
  }

  if (options.scope) installErrorCapture(options.scope);

  return {
    record,
    recordError,
    guard,
    entries,
    mirror,
    exportData,
    exportJson,
    installErrorCapture,
    destroy
  };
}

async function copyOrDownloadDebugLog(log, scope = globalThis) {
  try {
    const json = log.exportJson();
    const clipboard = scope?.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      try {
        await clipboard.writeText(json);
        return 'copied';
      } catch {
        // A local file may not receive clipboard permission; download below.
      }
    }
    const doc = scope?.document;
    const Url = scope?.URL;
    const BlobType = scope?.Blob;
    if (!doc || !Url || typeof Url.createObjectURL !== 'function' || !BlobType) return 'unavailable';
    const blob = new BlobType([json], { type: 'application/json' });
    const url = Url.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = `loa-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    scope.setTimeout(() => Url.revokeObjectURL(url), 0);
    return 'downloaded';
  } catch {
    return 'unavailable';
  }
}

export {
  DEBUG_LOG_CAPACITY,
  DEBUG_MIRROR_LIMIT,
  DEBUG_MIRROR_EVERY,
  DEBUG_MIRROR_KEY,
  errorDetails,
  createDebugLog,
  copyOrDownloadDebugLog
};
