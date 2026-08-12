// M12 Part B — the diagnosability event log (Ray-requested). A ring buffer of the
// game's side effects so a weird report can be replayed deterministically instead of
// described. One logEvent(kind, data) call sits at each existing side-effect site
// (combat resolve, rest, enter-building, overworld contact, encounter roll, death).
//
// An entry records: tick (the game clock), mode (where it happened), seed (the seed
// that drove the roll, when one applies), kind (a short tag), and a resolved outcome
// string (the human/in-register line). Seeds + tick are diagnostic detail — they ride
// in the JSON dump (B3) and never on the in-register [record] overlay (B2).
//
// Pure + headless; holds only the ring. Deterministic given the same calls.

export const EVENTLOG_CAP = 200;

export function createEventLog({ cap = EVENTLOG_CAP } = {}) {
  const CAP = Math.max(1, cap | 0);
  let ring = [];

  // Append one event. Missing fields default so a caller can log tersely; every entry
  // ends up shaped { tick, mode, seed, kind, outcome }. Returns the stored entry.
  function log(kind, data = {}) {
    const entry = {
      tick: data.tick | 0,
      mode: data.mode || '',
      seed: data.seed == null ? null : (data.seed >>> 0),
      kind: String(kind || 'event'),
      outcome: data.outcome == null ? '' : String(data.outcome),
    };
    ring.push(entry);
    if (ring.length > CAP) ring.splice(0, ring.length - CAP); // keep the last CAP
    return entry;
  }

  // The whole buffer, oldest first (a copy).
  function entries() { return ring.map((e) => ({ ...e })); }
  // The most recent n entries, oldest-of-those first (for the overlay).
  function recent(n = 20) { return ring.slice(Math.max(0, ring.length - n)).map((e) => ({ ...e })); }

  function serialize() { return { cap: CAP, ring: entries() }; }
  function restore(snap) {
    if (!snap || !Array.isArray(snap.ring)) return;
    ring = snap.ring.slice(Math.max(0, snap.ring.length - CAP)).map((e) => ({
      tick: e.tick | 0, mode: e.mode || '', seed: e.seed == null ? null : (e.seed >>> 0),
      kind: String(e.kind || 'event'), outcome: e.outcome == null ? '' : String(e.outcome),
    }));
  }
  function clear() { ring = []; }

  // Plain-text export for the record overlay's copy-to-clipboard affordance.
  function toText(opts = {}) {
    const lines = [];
    for (const e of ring) {
      const tickStr = opts.tick !== false ? `tick ${e.tick} · ` : '';
      lines.push(`${tickStr}${e.kind}: ${e.outcome}`);
    }
    return lines.join('\n');
  }

  return { log, entries, recent, serialize, restore, clear, toText, get size() { return ring.length; }, get cap() { return CAP; } };
}
