// SHOELEATHER — dialogue engine (M2 people).
//
// Dialogue is a STRUCTURED graph, not free text: nodes with guarded options and typed
// effects, so (a) it persists visit state and (b) the SOLVER can walk it — "full
// reachability walk from every real prior-state combo; no orphan nodes, no dead ends"
// (SOLVER LAW). Guards and effects are DATA, never arbitrary closures, so the walk is
// decidable.
//
// Guards (all must hold — AND):
//   { type:'factKnown',   fact:<id> }     the notebook holds this fact
//   { type:'nodeSeen',    node:<id> }     this dialogue node has been visited
//   { type:'visitAtLeast', n:<int> }      the suspect has been visited >= n times
//   { type:'notHardened' }                the suspect is not yet hardened
// Effects (applied when an option is chosen):
//   { type:'revealStatement', statement:<id> }   log the suspect's statement verbatim

export const GUARD_TYPES = Object.freeze(['factKnown', 'nodeSeen', 'visitAtLeast', 'notHardened', 'afterthought']);
export const EFFECT_TYPES = Object.freeze(['revealStatement']);

export function evalGuard(guard, ctx) {
  switch (guard.type) {
    case 'factKnown': return ctx.notebook.has(guard.fact);
    case 'nodeSeen': return ctx.state.isSeen(guard.node);
    case 'visitAtLeast': return ctx.state.visitCount >= guard.n;
    case 'notHardened': return !ctx.state.hardened;
    case 'afterthought': return !!ctx.state.afterthoughtArmed;
    default: throw new RangeError(`unknown guard type "${guard.type}"`);
  }
}

export function guardsPass(guards, ctx) {
  return (guards || []).every((g) => evalGuard(g, ctx));
}

export class DialogueNode {
  constructor({ id, speaker, text, options = [] }) {
    if (!id) throw new TypeError('dialogue node needs an id');
    this.id = String(id);
    this.speaker = speaker ? String(speaker) : null;
    this.text = String(text || '');
    this.options = options.map((o) => ({
      id: String(o.id),
      text: String(o.text),
      to: o.to === null || o.to === undefined ? null : String(o.to),
      guards: o.guards || [],
      effects: o.effects || [],
    }));
  }
}

export class DialogueTree {
  constructor({ id, root, nodes }) {
    this.id = String(id);
    this._nodes = new Map();
    for (const n of nodes || []) this.add(n instanceof DialogueNode ? n : new DialogueNode(n));
    this.root = String(root);
    if (!this._nodes.has(this.root)) throw new Error(`dialogue "${id}" root "${root}" is not a node`);
  }

  add(node) {
    const n = node instanceof DialogueNode ? node : new DialogueNode(node);
    if (this._nodes.has(n.id)) throw new Error(`duplicate dialogue node "${n.id}"`);
    this._nodes.set(n.id, n);
    return n;
  }

  node(id) { return this._nodes.get(String(id)) || null; }
  has(id) { return this._nodes.has(String(id)); }
  nodes() { return [...this._nodes.values()]; }

  // Nodes reachable from the root by walking option targets (BFS). Optimistic: a
  // guarded edge is assumed traversable under SOME state, since every fact is
  // eventually acquirable and visits/seen-nodes accumulate — the SOLVER walks "every
  // real prior-state combo", and the reachable envelope is the union over all of them.
  reachableFromRoot() {
    const seen = new Set([this.root]);
    const queue = [this.root];
    while (queue.length) {
      const n = this.node(queue.shift());
      if (!n) continue;
      for (const o of n.options) {
        if (o.to !== null && this._nodes.has(o.to) && !seen.has(o.to)) { seen.add(o.to); queue.push(o.to); }
      }
    }
    return seen;
  }

  // Static + reachability integrity (the SOLVER LAW's dialogue check):
  //  - every option target exists (or is null = end); guard/effect types are known
  //  - NO DEAD ENDS: every node offers at least one option (the player can always act)
  //  - NO ORPHANS: every node is reachable from the root
  validate() {
    const problems = [];
    for (const n of this.nodes()) {
      if (n.options.length === 0) problems.push(`dead-end dialogue node "${n.id}" (no options; player is stuck)`);
      for (const o of n.options) {
        if (o.to !== null && !this._nodes.has(o.to)) problems.push(`node ${n.id} option ${o.id} -> missing node "${o.to}"`);
        for (const g of o.guards) if (!GUARD_TYPES.includes(g.type)) problems.push(`node ${n.id} option ${o.id}: unknown guard "${g.type}"`);
        for (const e of o.effects) if (!EFFECT_TYPES.includes(e.type)) problems.push(`node ${n.id} option ${o.id}: unknown effect "${e.type}"`);
      }
    }
    const reachable = this.reachableFromRoot();
    for (const n of this.nodes()) {
      if (!reachable.has(n.id)) problems.push(`orphan dialogue node "${n.id}" (unreachable from root)`);
    }
    return problems;
  }
}

// Drives one interrogation session over a DialogueTree, with a suspect's persistent
// state and the shared notebook. No timers (the no-real-time-pressure law).
export class DialogueRunner {
  constructor(tree, state, { notebook, caseData = null, onEvent = null } = {}) {
    if (!notebook) throw new TypeError('dialogue runner needs a notebook');
    this.tree = tree;
    this.state = state;
    this.notebook = notebook;
    this.caseData = caseData;
    this.onEvent = onEvent || (() => {});
    this.currentId = null;
  }

  _ctx() { return { state: this.state, notebook: this.notebook, caseData: this.caseData }; }

  // Begin a visit at the root (counts a visit; marks the node seen).
  enter() {
    this.state.beginVisit();
    return this._goto(this.tree.root);
  }

  _goto(nodeId) {
    if (nodeId === null) { this.currentId = null; return null; }
    const node = this.tree.node(nodeId);
    if (!node) throw new Error(`dialogue "${this.tree.id}" has no node "${nodeId}"`);
    this.currentId = node.id;
    this.state.markSeen(node.id);
    this.onEvent({ type: 'node', node });
    return node;
  }

  current() { return this.currentId ? this.tree.node(this.currentId) : null; }

  // Options whose guards currently pass (what the player may say now).
  options() {
    const node = this.current();
    if (!node) return [];
    return node.options.filter((o) => guardsPass(o.guards, this._ctx()));
  }

  // Choose an available option: apply its effects, then transition. Returns the new
  // node (or null at a conversation end). Rejects options whose guards do not pass.
  choose(optionId) {
    const node = this.current();
    if (!node) throw new Error('no current dialogue node');
    const opt = node.options.find((o) => o.id === String(optionId));
    if (!opt) throw new Error(`node ${node.id} has no option "${optionId}"`);
    if (!guardsPass(opt.guards, this._ctx())) throw new Error(`option "${optionId}" is not available`);
    for (const e of opt.effects) this._applyEffect(e);
    return this._goto(opt.to);
  }

  _applyEffect(effect) {
    if (effect.type === 'revealStatement') {
      if (!this.caseData) return;
      const st = this.caseData.statement(effect.statement);
      if (st) { this.notebook.logStatement(st, { scene: 'interview' }); this.onEvent({ type: 'statement', statement: st }); }
      return;
    }
    throw new RangeError(`unknown effect type "${effect.type}"`);
  }
}
