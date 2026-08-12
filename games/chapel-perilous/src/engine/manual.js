// manual.js — Structure Arc slice 1 (STRUCTURE-ARC-LOCKS-2026-08-05.md).
//
// The recovered operations manual IS the questline (LOCK 1): a fixed, numbered
// sequence of Operations, identical in every generated world (data/operations.json).
// What varies per world is WHICH procedurally-placed dungeon site each operation
// points at — assigned here, deterministically, never randomly, and without
// touching the placement algorithm itself (LOCK 2's placement fork: positions
// stay procedural as shipped; only the MEANING laid over them is authored).
//
// Assignment rule: sort a world's dungeon sites nearest-to-farthest from spawn;
// Operation N's `dungeonSlot` indexes that list. The manual's data currently
// carries dungeonSlot 0..4 for Operations 1..5 (one per worldgen.js's
// DUNGEON_SITE_COUNT=5), so Operation 5 is always the farthest dungeon — LOCK 3's
// "the Chapel" (see isChapelSite below, the single source of truth for which site
// that is; it replaces the old id/name regex in main.js that only matched when a
// site's randomly-templated name happened to read "Chapel").
//
// Status (locked/active/complete) IS the quest gate (LOCK 1): operation N's
// dungeon may only be entered once operation N-1 is complete (the active op is
// the frontier; completed ops remain re-enterable). Cities and any site with no
// assigned operation stay open. Both overworld passability and direct entry
// consult this status, so the world cannot bypass the manual. Completion reads
// the EXISTING session.clearedSites() signal (session.clearSite(site.id) already
// fires the moment any dungeon fight is won there — src/main.js combat-return).

const cheby = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Sort a world's dungeon-kind sites nearest -> farthest from `start` (stable, id-tiebroken). */
export function orderDungeonSites(sites, start) {
  return (sites || [])
    .filter((s) => s && s.kind === 'dungeon')
    .map((s) => ({ site: s, d: cheby(s.x, s.y, start.x, start.y) }))
    .sort((a, b) => a.d - b.d || String(a.site.id).localeCompare(String(b.site.id)))
    .map((o) => o.site);
}

/**
 * Build the manual for one world. `data` is data/operations.json's shape
 * ({ introBeats, operations }); `world`/`session`/`start` are the live game's
 * pieces (world.listSites(), session.clearedSites(), the party's start coord).
 */
export function createManual(data, { world, session, start } = {}) {
  if (!data || !Array.isArray(data.operations)) throw new Error('createManual: data.operations required');
  if (!world || !session || !start) throw new Error('createManual: world, session, start required');

  const operations = data.operations.slice().sort((a, b) => a.number - b.number);
  const introBeats = Array.isArray(data.introBeats) ? data.introBeats.slice() : [];
  const ordered = orderDungeonSites(world.listSites(), start);

  function siteFor(op) {
    return op && op.dungeonSlot != null ? (ordered[op.dungeonSlot] || null) : null;
  }

  function isComplete(op) {
    const site = siteFor(op);
    return !!site && session.clearedSites().includes(site.id);
  }

  /**
   * Every operation with its live per-world state: { ...op, site, status }.
   * status is 'complete' for every finished operation, 'active' for the first
   * unfinished one, 'locked' for everything after it. Locked ops refuse entry
   * via canEnter / passable (see module note above).
   */
  function list() {
    let activeAssigned = false;
    return operations.map((op) => {
      const site = siteFor(op);
      const complete = isComplete(op);
      let status;
      if (complete) status = 'complete';
      else if (!activeAssigned) { status = 'active'; activeAssigned = true; }
      else status = 'locked';
      return { ...op, site, status };
    });
  }

  /**
   * May the party enter this site? Cities and unassigned sites: yes. An
   * operation dungeon: only when its status is active or complete (op N needs
   * op N-1 cleared; the Chapel/final op therefore needs every prior op done).
   * Alias: passable(site) — the audit/wiring name for the same gate.
   */
  function canEnter(site) {
    if (!site) return false;
    if (site.kind === 'city') return true;
    const row = list().find((r) => r.site && r.site.id === site.id);
    if (!row) return true; // no operation assignment → open (legacy/hand sites)
    return row.status === 'active' || row.status === 'complete';
  }
  const passable = canEnter;

  /** Why entry is refused, or null when canEnter. For the shell's owNote. */
  function denyReason(site) {
    if (canEnter(site)) return null;
    const row = list().find((r) => r.site && r.site.id === site.id);
    if (!row || row.status !== 'locked') return '[SEED] that threshold is not yet yours';
    const prior = list().find((r) => r.status === 'active');
    const need = prior ? prior.title : 'the prior operation';
    return `[SEED] the manual bars this threshold — complete ${need} first`;
  }

  function active() {
    return list().find((o) => o.status === 'active') || null;
  }

  /** The last operation in sequence — LOCK 3's Chapel, by construction. */
  function finalOperation() {
    return operations.length ? operations[operations.length - 1] : null;
  }

  function chapelSite() {
    const op = operations.find((o) => o.final) || finalOperation();
    return op ? siteFor(op) : null;
  }

  /** Is `site` the world's Chapel (the final operation's assigned dungeon)? */
  function isChapelSite(site) {
    const cs = chapelSite();
    return !!(cs && site && cs.id === site.id);
  }

  /** Which operation (raw config, no `site`/`status`) a site is assigned to, if any. */
  function operationForSite(site) {
    if (!site) return null;
    return operations.find((o) => { const s = siteFor(o); return s && s.id === site.id; }) || null;
  }

  /** The authoredLayout key for a site's operation, or null (procedural interior). */
  function authoredLayoutFor(site) {
    const op = operationForSite(site);
    return (op && op.authoredLayout) || null;
  }

  function summary() {
    const rows = list();
    const completed = rows.filter((r) => r.status === 'complete').length;
    const activeRow = rows.find((r) => r.status === 'active') || null;
    return { completed, total: rows.length, activeTitle: activeRow ? activeRow.title : null };
  }

  return {
    list,
    active,
    finalOperation,
    chapelSite,
    isChapelSite,
    operationForSite,
    authoredLayoutFor,
    canEnter,
    passable,
    denyReason,
    summary,
    introBeats,
    orderedDungeonSites: () => ordered.slice(),
  };
}
