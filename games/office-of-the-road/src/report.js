// report.js — THE FILED REPORT (DESIGN-SEED M5). Death files a report, and the
// report is CAUSAL, not a stat dump: an incident ledger that traces the chain
// leg-chosen → matter-fielded → coverage-gap → unplayed-decisive-window →
// deduction, each line tied to the decision that produced it, plus ONE line
// crediting what the desk did that worked.
//
// The engine/UI records raw incidents as they happen (recordRoute, recordMatter,
// recordMissedWindow, recordReduction, recordCredit); `composeReport` selects and
// phrases the causal spine at death. Register laws 4 & 5 are enforced here:
// PASSIVE voice for suffering ("the frame was reduced"), ACTIVE voice for the
// desk's own acts ("the desk mended the line"); nothing is narrated as triumph.
//
// Pure data + pure phrasing. No DOM. node-testable.

// createLedger: a fresh incident ledger for one expedition.
export function createLedger() {
  return { incidents: [], routeByLeg: {}, matterByLeg: {}, credit: null };
}

// recordRoute: the leg-routing decision (the head of every causal chain).
export function recordRoute(L, leg, branch) {
  L.routeByLeg[leg] = { id: branch.id, label: branch.label, safety: branch.safety, enc: branch.encounterMult };
  L.incidents.push({ leg, kind: 'route', label: branch.label, safety: branch.safety, enc: branch.encounterMult });
}

// recordMatter: an encounter fielded on a leg (tallied to its routing).
export function recordMatter(L, leg, tier) {
  L.matterByLeg[leg] = (L.matterByLeg[leg] | 0) + 1;
  L.incidents.push({ leg, kind: 'matter', tier });
}

// recordMissedWindow: a decisive intervention sat unplayed in the hand as a frame
// was reduced — the coverage gap, traced to the unplayed card.
export function recordMissedWindow(L, leg, tier, card, frame) {
  L.incidents.push({ leg, kind: 'window', tier, card, frame });
}

// recordReduction: a frame was reduced (passive-voice suffering).
export function recordReduction(L, leg, tier, frame) {
  L.incidents.push({ leg, kind: 'reduction', tier, frame });
}

// recordCredit: the desk did something that worked; keep the single weightiest one
// (active-voice bureaucracy). `weight` ranks competing credits.
export function recordCredit(L, text, weight) {
  if (!L.credit || weight > L.credit.weight) L.credit = { text, weight };
}

// composeReport: the causal incident ledger at death. `ctx` = { leg, cause, tier,
// supplies, gold }. Returns { lines: [{ text, tone }], hasCause }. `tone`:
// 'cause' (a decision), 'suffer' (passive deduction), 'credit' (the desk's win).
export function composeReport(L, ctx) {
  const lines = [];
  const fatalLeg = ctx.leg | 0;

  // 1) The decision at the head of the fatal chain: how the fatal leg was routed.
  const route = L.routeByLeg[fatalLeg];
  const matters = L.matterByLeg[fatalLeg] | 0;
  if (route) {
    lines.push({ tone: 'cause', text: `Leg ${fatalLeg} was routed via ${route.label} [${route.safety}]. Matters ×${route.enc}; ${matters} fielded.` });
  } else {
    lines.push({ tone: 'cause', text: `Leg ${fatalLeg} was marched unrouted; ${matters} matters fielded.` });
  }

  // 2) The coverage gaps: decisive windows that went unplayed as frames fell.
  const windows = L.incidents.filter((e) => e.kind === 'window').slice(-3);
  for (const w of windows) {
    lines.push({ tone: 'suffer', text: `A decisive ${w.card} went unplayed; ${w.frame} was reduced on a ${w.tier} matter.` });
  }

  // 3) The close itself. A reduction is a deduction the chain produced (passive);
  // an abandonment is a filing the desk chose (active) — the register splits them.
  if (ctx.cause === 'abandoned') {
    lines.push({ tone: 'cause', text: `The desk filed for early return. Supplies stood at ${ctx.supplies | 0}; the ledger stood at ${ctx.gold | 0} in coin.` });
  } else {
    const lastRed = [...L.incidents].reverse().find((e) => e.kind === 'reduction');
    const tier = ctx.tier || (lastRed && lastRed.tier) || 'routine';
    lines.push({ tone: 'suffer', text: `The unit was reduced in full on a ${tier} matter. Supplies stood at ${ctx.supplies | 0}; the ledger stood at ${ctx.gold | 0} in coin.` });
  }

  // 4) One credit line — what the desk did that worked (active voice).
  if (L.credit) lines.push({ tone: 'credit', text: `To the desk's credit: ${L.credit.text}` });
  else lines.push({ tone: 'credit', text: `To the desk's credit: the expedition was routed to leg ${fatalLeg} before the file closed.` });

  return { lines, hasCause: !!route || windows.length > 0 };
}
