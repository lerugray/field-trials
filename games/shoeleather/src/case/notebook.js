// SHOELEATHER — the Notebook (the core instrument, DESIGN-SEED 3).
//
// Facts OBSERVED auto-log (never conclusions). Suspect statements log VERBATIM. The
// player pins, groups, cross-references, and searches/filters by person, scene, and
// type. A case ends around 200+ facts and must stay navigable, so search/filter is
// day-one IA, not a later nicety. Nothing here marks what MATTERS — no solution leak.
//
// Pure and node-testable. The browser renders it on the crisp text layer; the engine
// calls logFact/logStatement when the player observes evidence or hears a statement.

import { Fact, Statement } from './fact.js';

class Entry {
  constructor(kind, ref, scene) {
    this.kind = kind;         // 'fact' | 'statement'
    this.ref = ref;           // Fact | Statement
    this.id = ref.id;
    this.scene = scene || null;
    this.pinned = false;
    this.groups = new Set();
  }

  person() { return this.kind === 'fact' ? this.ref.claim.subject : this.ref.speaker; }
  type() { return this.kind === 'fact' ? this.ref.claim.claimType : 'statement'; }
  text() { return this.kind === 'fact' ? (this.ref.prose || '') : this.ref.text; }

  // Lowercased haystack for search: prose/text, person, type, value, id.
  haystack() {
    const parts = [this.text(), this.person(), this.type(), this.id];
    if (this.kind === 'fact') parts.push(String(this.ref.claim.value));
    return parts.join('  ').toLowerCase();
  }
}

export class Notebook {
  constructor() {
    this._entries = new Map();   // id -> Entry, in observation order
    this._crossrefs = new Map(); // id -> Set of linked ids
    this._groups = new Map();    // name -> Set of ids
  }

  // --- logging (auto, on observation) -------------------------------------
  logFact(fact, meta = {}) {
    if (!(fact instanceof Fact)) throw new TypeError('logFact needs a Fact');
    if (this._entries.has(fact.id)) return this._entries.get(fact.id); // idempotent
    const e = new Entry('fact', fact, meta.scene);
    this._entries.set(fact.id, e);
    return e;
  }

  logStatement(statement, meta = {}) {
    if (!(statement instanceof Statement)) throw new TypeError('logStatement needs a Statement');
    if (this._entries.has(statement.id)) return this._entries.get(statement.id);
    const e = new Entry('statement', statement, meta.scene);
    this._entries.set(statement.id, e);
    return e;
  }

  has(id) { return this._entries.has(String(id)); }
  get(id) { return this._entries.get(String(id)) || null; }
  get size() { return this._entries.size; }
  entries() { return [...this._entries.values()]; }

  // --- pinning ------------------------------------------------------------
  pin(id) { const e = this.get(id); if (e) e.pinned = true; return !!e; }
  unpin(id) { const e = this.get(id); if (e) e.pinned = false; return !!e; }
  isPinned(id) { const e = this.get(id); return !!e && e.pinned; }
  pinned() { return this.entries().filter((e) => e.pinned); }

  // --- grouping (user-defined folders) ------------------------------------
  addToGroup(name, id) {
    if (!this.has(id)) return false;
    const g = String(name);
    if (!this._groups.has(g)) this._groups.set(g, new Set());
    this._groups.get(g).add(String(id));
    this.get(id).groups.add(g);
    return true;
  }
  removeFromGroup(name, id) {
    const set = this._groups.get(String(name));
    if (set) set.delete(String(id));
    const e = this.get(id); if (e) e.groups.delete(String(name));
  }
  groups() { return [...this._groups.keys()].sort(); }
  entriesInGroup(name) {
    const set = this._groups.get(String(name));
    return set ? [...set].map((id) => this.get(id)).filter(Boolean) : [];
  }

  // --- cross-reference (mutual links) -------------------------------------
  crossRef(a, b) {
    if (!this.has(a) || !this.has(b) || String(a) === String(b)) return false;
    this._link(a, b); this._link(b, a);
    return true;
  }
  _link(a, b) {
    const k = String(a);
    if (!this._crossrefs.has(k)) this._crossrefs.set(k, new Set());
    this._crossrefs.get(k).add(String(b));
  }
  crossRefsOf(id) {
    const set = this._crossrefs.get(String(id));
    return set ? [...set].map((x) => this.get(x)).filter(Boolean) : [];
  }

  // --- search / filter (the navigability IA) ------------------------------
  search(query) {
    const q = String(query).trim().toLowerCase();
    if (!q) return this.entries();
    const terms = q.split(/\s+/);
    return this.entries().filter((e) => { const h = e.haystack(); return terms.every((t) => h.includes(t)); });
  }

  filter({ person = null, scene = null, type = null, kind = null, pinned = null } = {}) {
    return this.entries().filter((e) => {
      if (person !== null && e.person() !== person) return false;
      if (scene !== null && e.scene !== scene) return false;
      if (type !== null && e.type() !== type) return false;
      if (kind !== null && e.kind !== kind) return false;
      if (pinned !== null && e.pinned !== pinned) return false;
      return true;
    });
  }

  // Distinct facet values, for building filter menus.
  facets() {
    const people = new Set(), scenes = new Set(), types = new Set();
    for (const e of this.entries()) {
      people.add(e.person());
      if (e.scene) scenes.add(e.scene);
      types.add(e.type());
    }
    return { people: [...people].sort(), scenes: [...scenes].sort(), types: [...types].sort() };
  }

  // Case-review restates KNOWN FACTS ONLY (never statements-as-facts, never
  // conclusions). Returns logged fact entries in observation order.
  reviewKnownFacts() { return this.entries().filter((e) => e.kind === 'fact'); }

  // --- persistence --------------------------------------------------------
  toJSON() {
    return {
      logged: this.entries().map((e) => ({ id: e.id, kind: e.kind, scene: e.scene, pinned: e.pinned, groups: [...e.groups] })),
      crossrefs: [...this._crossrefs.entries()].map(([a, set]) => [a, [...set]]),
    };
  }

  // Rehydrate against a case (looks facts/statements up by id).
  static fromJSON(json, caseObj) {
    const nb = new Notebook();
    if (!json) return nb;
    for (const rec of json.logged || []) {
      const ref = rec.kind === 'fact' ? caseObj.fact(rec.id) : caseObj.statement(rec.id);
      if (!ref) continue; // stale save entry; skip rather than crash
      const e = rec.kind === 'fact' ? nb.logFact(ref, { scene: rec.scene }) : nb.logStatement(ref, { scene: rec.scene });
      e.pinned = !!rec.pinned;
      for (const g of rec.groups || []) nb.addToGroup(g, rec.id);
    }
    for (const [a, list] of json.crossrefs || []) for (const b of list) nb.crossRef(a, b);
    return nb;
  }
}
