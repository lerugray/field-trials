// The title-screen menu — pure selection logic (M12). The DOM/wordmark surface lives
// in ui/title.js; this is the headless-testable core: three items (New Run / Continue
// / Options), a selection that skips disabled items, and the rule for when Continue is
// live. Controller-first navigation happens over THIS state (title.js only draws it),
// so the whole nav contract is covered by node --test.
//
// Continue "resumes hub/run state": the persistent thing in this game is the hangar —
// the ledger (Salvage, owned upgrades, the flight log) that survives across sessions.
// A player with any of that has somewhere to continue TO; a brand-new pilot does not,
// so Continue is disabled with a quiet reason rather than dropping them into an empty
// hangar. New Run is always live (it flies a fresh sortie); Options is always live.

export const TITLE_ITEMS = [
  { id: 'new', label: 'New Run' },
  { id: 'continue', label: 'Continue' },
  { id: 'options', label: 'Options' },
];

// The Continue-enable rule. Any persisted progress at all — a logged run, Salvage on
// hand, an owned upgrade, or a hired wingmate — means there is a hangar to return to.
// Pure: takes a plain snapshot (ledger.lifetime() + balance + upgrades), never the
// ledger object, so it is trivially testable.
export function hasSavedProgress(snap) {
  if (!snap || typeof snap !== 'object') return false;
  if ((snap.runs | 0) > 0) return true;
  if ((snap.balance | 0) > 0) return true;
  const up = snap.upgrades || {};
  for (const k of Object.keys(up)) if ((up[k] | 0) > 0) return true;
  if (Array.isArray(snap.contracts) && snap.contracts.length > 0) return true;
  return false;
}

// The quiet reason shown on a disabled Continue (never a color-only state — the words
// carry it, per the accessibility law).
export const NO_PROGRESS_REASON = 'No saved progress yet';

export function createTitleMenu(opts = {}) {
  const hasProgress = !!opts.hasProgress;

  function enabledOf(id) {
    if (id === 'continue') return hasProgress;
    return true; // new + options are always live
  }

  function reasonOf(id) {
    return id === 'continue' && !hasProgress ? NO_PROGRESS_REASON : null;
  }

  const order = TITLE_ITEMS.map((it) => it.id);
  // Start on the first enabled item (New Run is always enabled, so this is 'new').
  let sel = order.findIndex((id) => enabledOf(id));
  if (sel < 0) sel = 0;

  function items() {
    return TITLE_ITEMS.map((it, i) => ({
      id: it.id,
      label: it.label,
      enabled: enabledOf(it.id),
      reason: reasonOf(it.id),
      selected: i === sel,
    }));
  }

  // Step to the next enabled item in `dir` (+1 down / -1 up), wrapping. If nothing else
  // is enabled it stays put. Disabled items are simply skipped (never landed on).
  function move(dir) {
    const n = order.length;
    const step = dir >= 0 ? 1 : -1;
    for (let i = 1; i <= n; i++) {
      const cand = (sel + step * i + n * i) % n;
      if (enabledOf(order[cand])) { sel = cand; return order[sel]; }
    }
    return order[sel];
  }

  // Point the selection at a specific id (mouse hover / click), only if it is enabled.
  function select(id) {
    const i = order.indexOf(id);
    if (i >= 0 && enabledOf(order[i])) { sel = i; return true; }
    return false;
  }

  // The current item's id if it is enabled (a confirm resolves to this), else null.
  function activate() {
    const id = order[sel];
    return enabledOf(id) ? id : null;
  }

  return {
    items,
    move,
    select,
    activate,
    current: () => order[sel],
    isEnabled: (id) => enabledOf(id),
    reasonFor: (id) => reasonOf(id),
  };
}
