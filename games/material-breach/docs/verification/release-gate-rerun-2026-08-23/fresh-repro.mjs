// Fresh reproduction of release-gate 2026-08-18 findings B1 + Q1–Q4 at HEAD.
// Logic / dispatcher / render path. Browser cold-boot is a separate harness.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVE_KEY, load } from '../../../src/persistence.js';
import {
  createView,
  tryResume,
  corruptSaveNoticeFor,
  CORRUPT_SAVE_NOTICE,
  actQueueFortify,
} from '../../../src/view.js';
import { dispatch } from '../../../src/input.js';
import { computeButtons } from '../../../src/layout.js';
import { render } from '../../../src/render.js';

const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });

function memStorage(seed) {
  const m = new Map(seed ? Object.entries(seed) : []);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

function recordingCtx() {
  const calls = [];
  const t = { font: '11px serif' };
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get(_target, p) {
          if (p === 'measureText') return (str) => ({ width: String(str).length * 3 });
          if (p === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          if (p === 'fillText') return (text, x, y) => calls.push({ text: String(text), x, y });
          if (p === 'font') return t.font;
          return () => {};
        },
        set(_target, p, v) {
          if (p === 'font') t.font = v;
          return true;
        },
      },
    ),
  };
}

const results = [];

function record(id, verdict, evidence) {
  results.push({ id, verdict, evidence });
  console.log(`[${verdict}] ${id}: ${evidence}`);
}

// ---- B1 — malformed save must NOT brick; original 08-18 payload ----
{
  const payload = '{"v":1,"facility":{"status":"active"}}';
  const store = memStorage({ [SAVE_KEY]: payload });
  let threw = null;
  let loadRes;
  let resumeRes;
  try {
    loadRes = load(store);
    const view = createView({ seed: 'b1-repro', storage: store });
    resumeRes = tryResume(view);
    // Boot mirrors: on reason, set saveNotice and stay on title.
    if (!resumeRes.ok && resumeRes.reason) {
      view.saveNotice = corruptSaveNoticeFor(resumeRes.reason);
    }
    view.overlay = 'title';
    // Second "reload": same storage still present; must still not throw.
    const again = tryResume(createView({ seed: 'b1-reload', storage: store }));
    const notice = corruptSaveNoticeFor(resumeRes.reason);
    const pass =
      loadRes.ok === false &&
      resumeRes.ok === false &&
      !!resumeRes.reason &&
      again.ok === false &&
      notice === CORRUPT_SAVE_NOTICE &&
      !threw;
    record(
      'B1',
      pass ? 'PASS' : 'FAIL',
      pass
        ? `exact 08-18 payload rejected by load (reason=${JSON.stringify(loadRes.reason)}); tryResume ok=false; second reload still recovers; notice institutional`
        : `loadRes=${JSON.stringify(loadRes)} resumeRes=${JSON.stringify(resumeRes)} threw=${threw}`,
    );
  } catch (err) {
    threw = err && err.message ? err.message : String(err);
    record('B1', 'FAIL', `threw on B1 payload: ${threw}`);
  }
}

// ---- Q1 — corrupt notice must render (unparseable + wrong-version + B1 shape) ----
{
  const cases = [
    ['unparseable', '{{{ not json'],
    ['wrong-version', JSON.stringify({ v: 99, facility: {} })],
    ['shape-invalid', '{"v":1,"facility":{"status":"active"}}'],
  ];
  const parts = [];
  let allPass = true;
  for (const [tag, raw] of cases) {
    const store = memStorage({ [SAVE_KEY]: raw });
    const view = createView({ seed: `q1-${tag}`, storage: store });
    const res = tryResume(view);
    if (res.ok || !res.reason) {
      allPass = false;
      parts.push(`${tag}: tryResume did not surface a reason`);
      continue;
    }
    view.saveNotice = corruptSaveNoticeFor(res.reason);
    view.overlay = 'title';
    if (view.saveNotice !== CORRUPT_SAVE_NOTICE) {
      allPass = false;
      parts.push(`${tag}: notice leaked raw (${view.saveNotice})`);
      continue;
    }
    const r = recordingCtx();
    render(r.ctx, view);
    const text = r.calls.map((c) => c.text).join(' ');
    if (!/Save notice/.test(text) || !/unreadable/.test(text)) {
      allPass = false;
      parts.push(`${tag}: render dropped notice (text sample: ${text.slice(0, 120)})`);
      continue;
    }
    parts.push(`${tag}: notice drawn`);
  }
  record('Q1', allPass ? 'PASS' : 'FAIL', parts.join('; '));
}

// ---- Q2 — title reachable from standalone pause via Back ----
{
  const view = createView({ seed: 'q2-repro' });
  view.hasShell = false;
  view.facility.status = 'active';
  view.overlay = null;
  // Take up the post path: orientation then desk, then pause.
  view.overlay = 'orientation';
  dispatch(view, 'begin');
  view.overlay = 'pause';
  const buttons = computeButtons(view);
  const hasBack = buttons.some((b) => b.id === 'totitle' && b.label === 'Back');
  if (!hasBack) {
    record('Q2', 'FAIL', `standalone pause buttons: ${buttons.map((b) => b.id).join(',')}`);
  } else {
    dispatch(view, 'totitle');
    const back = view.overlay === 'title';
    record(
      'Q2',
      back ? 'PASS' : 'FAIL',
      back
        ? 'standalone pause offers Back [X]; dispatch(totitle) returns overlay=title'
        : `after totitle overlay=${view.overlay}`,
    );
  }
}

// ---- Q3 — Withdraw via real dispatcher + computeButtons (player path) ----
{
  const view = createView({ seed: 'q3-repro' });
  view.overlay = null;
  view.facility.status = 'active';
  const before = view.facility.treasury.gold;
  const queued = actQueueFortify(view);
  const btn = computeButtons(view).find((b) => b.id === 'withdraw');
  if (!queued.ok || !btn || !btn.enabled) {
    record('Q3', 'FAIL', `queue ok=${queued.ok} withdrawBtn=${btn && btn.id}`);
  } else {
    dispatch(view, 'withdraw');
    const after = view.facility.treasury.gold;
    const retired = !computeButtons(view).some((b) => b.id === 'withdraw');
    const refunded = after === before;
    const pass = refunded && retired && /[Ww]ithdrawn/.test(view.lastActionNote || '');
    record(
      'Q3',
      pass ? 'PASS' : 'FAIL',
      `treasury ${before}->${after}; retired=${retired}; note=${JSON.stringify(view.lastActionNote)}`,
    );
  }
}

// ---- Q4 — closing report dismissible without destroying record; Esc/X path ----
{
  const view = createView({ seed: 'q4-repro' });
  view.facility.status = 'condemned';
  view.facility.lastReport = { filed: true, cycles: 8 };
  view.overlay = 'closed';
  const before = view.facility.lastReport;
  const closedBtns = computeButtons(view).map((b) => b.id);
  const hasDismiss = closedBtns.includes('dismiss');
  const hasNew = closedBtns.includes('newtenure');
  dispatch(view, 'dismiss');
  const toPause = view.overlay === 'pause' && view.facility.lastReport === before;
  dispatch(view, 'closedreport');
  const restored = view.overlay === 'closed' && view.facility.lastReport === before;
  const pass = hasDismiss && hasNew && toPause && restored;
  record(
    'Q4',
    pass ? 'PASS' : 'FAIL',
    `closed buttons=[${closedBtns}]; dismiss->pause=${toPause}; reopen=${restored}; record intact=${view.facility.lastReport === before}`,
  );
}

writeFileSync(join(OUT, 'fresh-repro-results.json'), JSON.stringify({ head: 'runtime', results }, null, 2));
const fails = results.filter((r) => r.verdict === 'FAIL');
console.log(`\nSUMMARY: ${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
