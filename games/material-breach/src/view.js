// view.js — the presentation controller. It holds the UI/view state and dispatches the operator's
// actions. It NEVER advances the sim on a clock: commitCycle runs only from confirmSignOver(),
// which is reached by a real confirm event. All sim mutation goes through surface() so a resolver
// failure is recorded and shown, never swallowed.
import { createFacility, facilityDefense, activeStaff, CONFIG } from './model.js';
import { commitCycle } from './cycle.js';
import {
  queueFortify,
  cancelOrder,
  lastQueuedOrder,
  queueExcavate,
  designate,
  queueRepair,
  queueFabricate,
  answerNotice,
} from './actions.js';
import { ROOM } from './model.js';
import { save, load, clear } from './persistence.js';
import { surface } from './debuglog.js';
import { intelMemo } from './raid.js';

// The in-voice orientation packet (DIRECTIONS fold 5): teaching by a memo from the previous
// manager, never a popup tutorial. Shown on cycle 1, dismissible.
export const ORIENTATION = [
  'From the outgoing facility manager, to the incoming.',
  '',
  'The premises are yours as of this cycle.',
  'The standing crew of four is already posted.',
  'The treasury is at 400g against a charter capacity of 500g.',
  'The founding stipend of 12g is paid each cycle while it lasts.',
  '',
  'Nothing on these premises happens until you sign the cycle over.',
  'Take the administration phase at whatever length you require.',
  'When you sign, the cycle resolves and you read what occurred.',
  '',
  'A party was sighted on the access road.',
  'The first incident is survivable.',
  'Later ones depend on what you have fortified by then.',
  'This notice is retained for your records.',
];

// The grid-click tools: carve rock, designate a department, or clear a designation. Each carries a
// short label for the tool button.
// Labels are short because the tool button also carries its own prefix and its key hint, and the
// action bar divides its width evenly between however many buttons stand. A label that overruns
// its button is a control the player cannot read.
export const TOOLS = [
  { id: 'excavate', label: 'Excavate' },
  { id: ROOM.TREASURY, label: 'Treasury' },
  { id: ROOM.RECORDS, label: 'Records' },
  { id: ROOM.FABRICATION, label: 'Fabrication' },
  { id: ROOM.HOLDING, label: 'Holding' },
  { id: ROOM.QUARTERS, label: 'Quarters' },
  { id: ROOM.COMMISSARY, label: 'Commissary' },
  { id: 'clear', label: 'Clear' },
];

export function createView({ seed = 'material-breach', log, storage = null } = {}) {
  const view = {
    facility: createFacility({ seed }),
    log,
    storage,
    // M8: the game opens on a TITLE, not straight into the orientation packet. A shell that drops
    // a player into a running facility with a memo over it gives them nothing to come back to, no
    // place to read the credits, and nowhere to turn the sound off before it starts.
    overlay: 'title', // title | options | provenance | orientation | null | checklist | pause | error | closed
    resumable: false, // a saved tenure was found at boot, so the title offers to resume it
    muted: false,
    errorMessage: null,
    lastActionNote: null, // a short in-register note echoing the operator's last action
    // The SOUND OUTBOX. A presentation-only slot: an action writes the name of the effect its
    // outcome deserves, and the draw loop drains it. This is the same shape as lastActionNote (an
    // outbox the renderer reads), and it is what keeps audio.js out of view.js and input.js
    // entirely: nothing here knows whether there is an audio context, or a speaker, at all.
    sfx: null,
    pendingStructural: false, // a breach whose sound belongs at the end of the replay, not before it
    frame: 0, // presentation-only animation counter (RAF may advance this; it is not game state)
    orientation: ORIENTATION, // the memo the orientation overlay renders
    checklist: null, // the pre-commit summary, computed when the checklist opens
    hasShell: false, // true when a host shell exists (contract item 4)
    pan: { x: 0, y: 0 }, // presentation pan of the cutaway view (Arrows/WASD), not game state
    hoverCell: null, // the grid cell under the pointer, for the excavation highlight
    toolIndex: 0, // which of TOOLS a grid click applies
    tool: TOOLS[0].id,
    toolLabel: TOOLS[0].label,
    reportScroll: 0, // vertical scroll offset for the after-action report (Release fix round B3)
    reportMaxScroll: 0,
    overlayReturnTo: null, // the overlay to return to when leaving provenance/options (B4)
    saveNotice: null, // loud in-register notice when a save is unreadable (B5)
  };

  if (log) log.info(`facility founded`, `seed=${seed}`);
  return view;
}

// Corrupt-save notice (B1/Q1): a single in-register line suitable for player-facing
// presentation. Boot maps ANY corrupt-save reason (including raw parser output) onto this.
export const CORRUPT_SAVE_NOTICE = 'Saved tenure was unreadable. Filing version 1 was rejected.';
export function corruptSaveNoticeFor(_reason) {
  return CORRUPT_SAVE_NOTICE;
}

// ---- operator actions (ADMIN phase) --------------------------------------------------------

export function actQueueFortify(view) {
  const res = queueFortify(view.facility);
  view.lastActionNote = res.ok
    ? `Fortification works order raised. ${CONFIG.orders.fortify.cost}g committed.`
    : `Fortification not raised: ${res.reason}.`;
  view.sfx = res.ok ? 'pen' : 'refused';
  if (view.log) view.log.info('action: queue fortify', view.lastActionNote);
  return res;
}

// cycleTool(view): advance the grid-click tool and update its label.
export function cycleTool(view) {
  view.toolIndex = (view.toolIndex + 1) % TOOLS.length;
  view.tool = TOOLS[view.toolIndex].id;
  view.toolLabel = TOOLS[view.toolIndex].label;
}

// applyTool(view, x, y): apply the current tool to a grid cell (a click during ADMIN).
export function applyTool(view, x, y) {
  if (view.tool === 'excavate') return actExcavate(view, x, y);
  if (view.tool === 'clear') return actDesignate(view, x, y, null);
  return actDesignate(view, x, y, view.tool);
}

export function actDesignate(view, x, y, type) {
  const res = designate(view.facility, x, y, type);
  const what = type === null ? 'cleared' : `designated ${type}`;
  view.lastActionNote = res.ok ? `Cell ${x},${y} ${what}.` : `Not ${type === null ? 'cleared' : 'designated'}: ${res.reason}.`;
  view.sfx = res.ok ? 'pen' : 'refused';
  if (view.log) view.log.info('action: designate', view.lastActionNote);
  return res;
}

// KEEP #6: put a door or a trap into production. Available only while a workshop stands.
export function actFabricate(view) {
  const res = queueFabricate(view.facility);
  view.lastActionNote = res.ok
    ? `Fabrication works order raised. ${CONFIG.orders.fabricate.cost}g committed, ${CONFIG.orders.fabricate.lead} cycles to manufacture.`
    : `Fabrication not raised: ${res.reason}.`;
  view.sfx = res.ok ? 'pen' : 'refused';
  if (view.log) view.log.info('action: queue fabricate', view.lastActionNote);
  return res;
}

export function actRepair(view) {
  const res = queueRepair(view.facility);
  view.lastActionNote = res.ok
    ? `Cornerstone repair works order raised. ${CONFIG.orders.repair.cost}g committed.`
    : `Repair not raised: ${res.reason}.`;
  view.sfx = res.ok ? 'pen' : 'refused';
  if (view.log) view.log.info('action: repair', view.lastActionNote);
  return res;
}

export function actAnswerNotice(view) {
  const notice = view.facility.notices.find((n) => n.status === 'served');
  if (!notice) {
    view.lastActionNote = 'No instrument is currently open to answer.';
    view.sfx = 'refused';
    return { ok: false, reason: 'no open notice' };
  }
  const res = answerNotice(view.facility, notice.id);
  view.lastActionNote = res.ok
    ? `The ${res.instrument} was answered administratively. ${res.cost}g committed.`
    : `Instrument not answered: ${res.reason}.`;
  view.sfx = res.ok ? 'stamp' : 'refused';
  if (view.log) view.log.info('action: answer notice', view.lastActionNote);
  return res;
}

export function actExcavate(view, x, y) {
  const res = queueExcavate(view.facility, x, y);
  view.lastActionNote = res.ok
    ? `Excavation works order raised for cell ${x},${y}. ${CONFIG.orders.excavate.cost}g committed.`
    : `Excavation not raised: ${res.reason}.`;
  view.sfx = res.ok ? 'pen' : 'refused';
  if (view.log) view.log.info('action: queue excavate', view.lastActionNote);
  return res;
}

export function actCancelOrder(view, orderId) {
  const order = view.facility.orders.find((o) => o.id === orderId);
  const kind = order ? order.kind : null;
  const spec = kind && CONFIG.orders[kind];
  const res = cancelOrder(view.facility, orderId);
  const label = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Works';
  view.lastActionNote = res.ok
    ? `${label} order withdrawn. ${spec && typeof spec.cost === 'number' ? `${spec.cost}g returned.` : 'Cost returned.'}`
    : `Not withdrawn: ${res.reason}.`;
  view.sfx = res.ok ? 'pen' : 'refused';
  if (view.log) view.log.info('action: cancel order', view.lastActionNote);
  return res;
}

// actWithdrawLast(view): the action bar's Withdraw control. There is no per-order picklist (the
// player queues orders one at a time from this same bar, so "the one I just raised" is always
// unambiguous); this withdraws the most recently raised order still in 'queued' status and returns
// its cost, per cancelOrder's contract above.
export function actWithdrawLast(view) {
  const order = lastQueuedOrder(view.facility);
  if (!order) {
    view.lastActionNote = 'No works order stands to be withdrawn.';
    view.sfx = 'refused';
    return { ok: false, reason: 'no queued order' };
  }
  return actCancelOrder(view, order.id);
}

// The pre-commit checklist (DIRECTIONS fold 6): opening it is the first of two confirms.
export function openSignOver(view) {
  if (view.facility.status !== 'active') return;
  view.checklist = checklistSummary(view);
  view.overlay = 'checklist';
  view.sfx = 'drawer';
}

// A non-interactive summary the checklist renders. Reuses existing state, kills blind commits.
export function checklistSummary(view) {
  const f = view.facility;
  const openOrders = f.orders.filter((o) => o.status === 'queued' || o.status === 'in-progress');
  const cyclesToPayday =
    CONFIG.payday.everyNCycles - (f.cycle.number % CONFIG.payday.everyNCycles || CONFIG.payday.everyNCycles);
  const owed = activeStaff(f).reduce((sum, s) => sum + s.wage, 0);
  return {
    cycle: f.cycle.number,
    openOrders: openOrders.length,
    openOrdersDetail: openOrders.map((o) => `${o.id}: ${o.kind}, ${o.cyclesRemaining} cycle(s) remaining`),
    unansweredNotices: f.notices.filter((n) => n.status === 'served').length, // 0 until M5
    treasury: f.treasury.gold,
    capacity: f.treasury.capacity,
    defense: facilityDefense(f),
    cornerstone: f.lossObject.condition,
    payrollDue: cyclesToPayday === 0 ? 'this cycle' : `in ${cyclesToPayday} cycle(s)`,
    payrollOwed: owed,
    // The pre-commit intel memo previews the coming raid, vaguely (fold 2).
    intel: intelMemo(f).line,
  };
}

// The second confirm: the sim actually advances here, and only here.
export function confirmSignOver(view) {
  const f = view.facility;
  if (f.status !== 'active') return;
  const conditionBefore = f.lossObject.condition;
  try {
    view.facility = surface(view.log, 'sign the cycle over', () => commitCycle(f));
    // The cycle is signed over, so it is stamped: the sound of the game's one irreversible act.
    view.sfx = 'stamp';
    // A breach makes a noise, but not YET. The structural failure belongs at the END of the
    // incident replay, when the player is shown the damage. Firing it here would bring the wall
    // down before the party had walked in.
    view.pendingStructural = view.facility.lossObject.condition < conditionBefore;
    view.reportScroll = 0;
    view.reportMaxScroll = 0;
    // The raid resolves without input, but it is WATCHABLE: enter the replay of the step-log on the
    // cutaway (fold 4). It is presentation only; the sim already resolved.
    const raid = view.facility.lastRaid;
    if (raid && raid.steps && raid.steps.length > 1) {
      view.replay = { steps: raid.steps, startFrame: view.frame, cursor: 0, done: false, doneFrame: 0 };
      view.overlay = 'raid';
    } else {
      view.overlay = view.facility.status === 'active' ? null : 'closed';
    }
    autosave(view);
  } catch (err) {
    view.errorMessage = err && err.message ? err.message : String(err);
    view.overlay = 'error';
  }
}

// advanceReplay(view): step the raid replay cursor from the presentation frame counter (RAF drives
// this; it advances only the replay, never the sim). Dwells briefly at the end, then dismisses.
const REPLAY_FRAMES_PER_STEP = 5;
const REPLAY_END_DWELL = 45;
export function advanceReplay(view) {
  const r = view.replay;
  if (!r || view.overlay !== 'raid') return;
  const last = r.steps.length - 1;
  const step = Math.floor((view.frame - r.startFrame) / REPLAY_FRAMES_PER_STEP);
  if (step >= last) {
    r.cursor = last;
    if (!r.done) {
      r.done = true;
      r.doneFrame = view.frame;
    } else if (view.frame - r.doneFrame > REPLAY_END_DWELL) {
      endReplay(view);
    }
  } else {
    r.cursor = step;
  }
}

// endReplay(view): leave the replay for the next ADMIN, or the closing report if the raid closed
// the tenure. The player can trigger this early (skip).
export function endReplay(view) {
  view.replay = null;
  view.overlay = view.facility.status === 'active' ? null : 'closed';
  // The damage is on the sheet now, so the building is allowed to be heard failing. Skipping the
  // replay still fires it: the player skipped the watching, not the incident.
  if (view.pendingStructural) {
    view.sfx = 'structural';
    view.pendingStructural = false;
  }
}

export function dismissOverlay(view) {
  if (view.overlay === 'orientation' || view.overlay === 'checklist') {
    view.overlay = null;
    view.sfx = 'drawer';
  }
}

// ---- the ship shell (M8) -----------------------------------------------------------------------

// Leave the title for the game. A resumed tenure goes straight to the desk; a new one is met by the
// orientation packet, which is the in-voice teaching surface and not a tutorial popup (fold 5).
export function enterPremises(view) {
  view.overlay = view.resumable ? null : 'orientation';
  view.sfx = 'drawer';
}

export function showOverlay(view, name) {
  view.overlayReturnTo = view.overlay;
  view.overlay = name;
  view.sfx = 'drawer';
}

// Back to the title from options or provenance, or to the overlay that opened them (e.g. pause).
export function backToTitle(view) {
  const returnTo = view.overlayReturnTo;
  view.overlayReturnTo = null;
  view.overlay = returnTo || 'title';
  view.sfx = 'drawer';
}

export function togglePause(view) {
  if (view.overlay === 'pause') view.overlay = null;
  else if (view.overlay === null || view.overlay === 'orientation') view.overlay = 'pause';
  else return;
  view.sfx = 'drawer';
}

export function setMuted(view, muted) {
  view.muted = !!muted;
}

// ---- persistence glue ----------------------------------------------------------------------

export function autosave(view) {
  const res = save(view.facility, view.storage);
  if (!res.ok && view.log) view.log.warn('autosave skipped', res.reason);
  return res;
}

export function tryResume(view) {
  const res = load(view.storage);
  if (res.ok) {
    view.facility = res.facility;
    const cycleNumber = res.facility?.cycle?.number;
    if (view.log) view.log.info('resumed saved tenure', `cycle=${cycleNumber ?? 'unknown'}`);
    return { ok: true };
  }
  if (res.reason && res.reason !== 'no save present') {
    return { ok: false, reason: res.reason };
  }
  return { ok: false };
}

export function abandonTenure(view, seed) {
  clear(view.storage);
  view.facility = createFacility({ seed: seed ?? view.facility.seed });
  view.overlay = 'orientation';
  view.errorMessage = null;
}
