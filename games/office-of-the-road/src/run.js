// run.js — terminal expedition transaction. A close is identified by the open
// run's stable id, banked into the permanent ledger at most once, and replaced by
// a non-resumable CLOSED record. The meta receipt is written first: if execution
// is interrupted before the CLOSED marker write, boot rejects the stale OPEN save
// by consulting that same receipt.

import { META_KEY, bankRunOnce, recordHistory, serializeMeta } from './meta.js';
import { SAVE_KEY, makeClosedSave } from './save.js';

export function closeExpedition({ storage, meta, runId, runMastery, deepestLeg = 0, closedAtTick = 0, frac = 1, cause = 'closed', gold = 0 }) {
  const result = bankRunOnce(meta, runId, runMastery || {}, deepestLeg, frac, cause);
  if (result.banked) recordHistory(meta, { leg: deepestLeg, cause, gold });

  // localStorage has no cross-key transaction. Persisting the idempotency receipt
  // first gives the only crash-safe ordering: a stale open save is non-resumable,
  // and retrying closure observes the receipt rather than banking again.
  const metaOk = storage.write(META_KEY, JSON.stringify(serializeMeta(meta)));
  const closed = makeClosedSave(runId, cause, closedAtTick);
  const saveOk = storage.write(SAVE_KEY, JSON.stringify(closed));
  return { ...result, metaOk, saveOk, closed };
}
