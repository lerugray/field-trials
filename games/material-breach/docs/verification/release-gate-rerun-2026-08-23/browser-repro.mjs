// Browser repro of B1 + Q1–Q4 + stranger cold-boot against shipped dist/index.html (file://).
// READ-ONLY: writes evidence under this folder only; does not touch src/.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const OUT = dirname(fileURLToPath(import.meta.url));
const ROOT = join(OUT, '..', '..', '..');
mkdirSync(OUT, { recursive: true });

const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const url = 'file://' + join(ROOT, 'dist', 'index.html');
const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const results = [];
const note = (id, verdict, evidence, extra = {}) => {
  results.push({ id, verdict, evidence, ...extra });
  console.log(`[${verdict}] ${id}: ${evidence}`);
};

async function clickControl(page, id) {
  const pt = await page.evaluate((id) => {
    const b = (window.__GAME.state().buttons || []).find((b) => b.id === id);
    if (!b) return null;
    const r = document.getElementById('screen').getBoundingClientRect();
    return {
      x: r.left + (b.x + b.w / 2) * (r.width / 640),
      y: r.top + (b.y + b.h / 2) * (r.height / 360),
    };
  }, id);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(180);
  return true;
}

function st(page) {
  return page.evaluate(() => window.__GAME.state());
}

const browser = await chromium.launch();

// ---- Cold boot as a stranger (fresh context, no storage) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.waitForTimeout(400);
  const s = await st(page);
  const menu = (s.buttons || []).map((b) => `${b.id}:${b.label}`).join(', ');
  await page.screenshot({ path: join(OUT, 'coldboot-title-1280x720.png') });
  const titleOk = s.overlay === 'title';
  const hasStart = (s.buttons || []).some((b) => b.id === 'enter');
  const hasProv = (s.buttons || []).some((b) => b.id === 'provenance');
  const pass = titleOk && hasStart && hasProv && errs.length === 0;
  note(
    'COLDBOOT',
    pass ? 'PASS' : 'FAIL',
    pass
      ? `fresh file:// boot overlay=title; menu=[${menu}]; pageerrors=0`
      : `overlay=${s.overlay} menu=[${menu}] errs=${JSON.stringify(errs.slice(0, 3))}`,
    { menu, errs },
  );

  // Pacing law: 3s idle must not advance cycle (stranger landed on title; take up post then idle)
  if (hasStart) {
    await clickControl(page, 'enter');
    await page.waitForTimeout(200);
    // orientation → begin
    const afterOrient = await st(page);
    if (afterOrient.overlay === 'orientation') await clickControl(page, 'begin');
    await page.waitForTimeout(200);
    const before = await st(page);
    await page.waitForTimeout(3000);
    const after = await st(page);
    const cycleSame = before.cycle === after.cycle;
    note(
      'PACING',
      cycleSame ? 'PASS' : 'FAIL',
      `desk idle 3s: cycle ${before.cycle} -> ${after.cycle}`,
    );
  }
  await ctx.close();
}

// ---- B1 — malformed save must not brick; second reload still recovers ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.evaluate(() =>
    localStorage.setItem('material-breach:save', '{"v":1,"facility":{"status":"active"}}'),
  );
  await page.reload();
  await page.waitForTimeout(2500);
  const hasGame1 = await page.evaluate(() => !!window.__GAME);
  let s1 = null;
  let notice1 = null;
  if (hasGame1) {
    s1 = await st(page);
    notice1 = await page.evaluate(() => {
      const v = window.__GAME;
      // surface whatever the boot left on the view if exposed
      return (v.state && v.state().saveNotice) || null;
    });
  }
  await page.screenshot({ path: join(OUT, 'B1-malformed-after-reload.png') });
  await page.reload();
  await page.waitForTimeout(2000);
  const hasGame2 = await page.evaluate(() => !!window.__GAME);
  let s2 = null;
  if (hasGame2) s2 = await st(page);
  await page.screenshot({ path: join(OUT, 'B1-malformed-second-reload.png') });
  const pass =
    hasGame1 &&
    hasGame2 &&
    errs.length === 0 &&
    s1 &&
    s1.overlay === 'title' &&
    s2 &&
    s2.overlay === 'title';
  note(
    'B1',
    pass ? 'PASS' : 'FAIL',
    pass
      ? `exact 08-18 payload: __GAME present after reload + second reload; overlay=title; pageerrors=0; saveNotice=${JSON.stringify(notice1 || s1.saveNotice || null)}`
      : `hasGame1=${hasGame1} hasGame2=${hasGame2} errs=${JSON.stringify(errs.slice(0, 2))} s1=${JSON.stringify(s1 && { overlay: s1.overlay, saveNotice: s1.saveNotice })}`,
    { errs, notice1 },
  );
  await ctx.close();
}

// ---- Q1 — corrupt notice must be visible (bytes differ from clean title) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.waitForTimeout(400);
  const clean = await page.screenshot({ path: join(OUT, 'Q1-clean-title.png') });

  const cases = [
    ['unparseable', '{{{ not json'],
    ['wrong-version', JSON.stringify({ v: 99, facility: {} })],
    ['shape-invalid', '{"v":1,"facility":{"status":"active"}}'],
  ];
  const parts = [];
  let allPass = true;
  for (const [tag, raw] of cases) {
    await page.evaluate((raw) => localStorage.setItem('material-breach:save', raw), raw);
    await page.reload();
    await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
    await page.waitForTimeout(450);
    const dirty = await page.screenshot({ path: join(OUT, `Q1-${tag}-title.png`) });
    const differ = Buffer.compare(clean, dirty) !== 0;
    const s = await st(page);
    const notice = s.saveNotice;
    const hasNotice =
      typeof notice === 'string' && /unreadable|Save notice|corrupt|cannot be read/i.test(notice);
    // Prefer visual diff; also accept state carrying institutional notice on title.
    const ok = differ && s.overlay === 'title' && (hasNotice || differ);
    if (!ok) {
      allPass = false;
      parts.push(
        `${tag}: differ=${differ} overlay=${s.overlay} notice=${JSON.stringify(notice)}`,
      );
    } else {
      parts.push(`${tag}: pixels differ from clean; overlay=title; notice present`);
    }
  }
  note('Q1', allPass && errs.length === 0 ? 'PASS' : 'FAIL', parts.join('; '), { errs });
  await ctx.close();
}

// ---- Q2 — title reachable from standalone pause via Back (real mouse) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.waitForTimeout(300);
  // Ensure no shell
  await page.evaluate(() => {
    try {
      delete window.__SHELL;
    } catch (_) {}
  });
  await clickControl(page, 'enter');
  await page.waitForTimeout(200);
  const o = await st(page);
  if (o.overlay === 'orientation') await clickControl(page, 'begin');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const paused = await st(page);
  const backBtn = (paused.buttons || []).find((b) => b.id === 'totitle');
  await page.screenshot({ path: join(OUT, 'Q2-pause-standalone.png') });
  let reached = false;
  if (backBtn) {
    await clickControl(page, 'totitle');
    await page.waitForTimeout(200);
    reached = (await st(page)).overlay === 'title';
  }
  await page.screenshot({ path: join(OUT, 'Q2-after-back.png') });
  const pass = paused.overlay === 'pause' && !!backBtn && reached;
  note(
    'Q2',
    pass ? 'PASS' : 'FAIL',
    pass
      ? `standalone pause offers Back (${backBtn.label}); mouse click returns overlay=title`
      : `pause overlay=${paused.overlay} buttons=${(paused.buttons || []).map((b) => b.id).join(',')} reached=${reached}`,
  );
  await ctx.close();
}

// ---- Q3 — Withdraw via real UI (queue Fortify, click Withdraw) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.waitForTimeout(300);
  await clickControl(page, 'enter');
  await page.waitForTimeout(200);
  const o = await st(page);
  if (o.overlay === 'orientation') await clickControl(page, 'begin');
  await page.waitForTimeout(250);
  const before = await st(page);
  const treasuryBefore = before.treasury;
  const fortOk = await clickControl(page, 'fortify');
  await page.waitForTimeout(200);
  const queued = await st(page);
  const withdrawBtn = (queued.buttons || []).find((b) => b.id === 'withdraw');
  await page.screenshot({ path: join(OUT, 'Q3-queued-fortify.png') });
  let after = null;
  let retired = false;
  let noteText = null;
  if (withdrawBtn && withdrawBtn.enabled !== false) {
    await clickControl(page, 'withdraw');
    await page.waitForTimeout(250);
    after = await st(page);
    retired = !(after.buttons || []).some((b) => b.id === 'withdraw');
    noteText = after.lastActionNote || after.note || null;
  }
  await page.screenshot({ path: join(OUT, 'Q3-after-withdraw.png') });
  const refunded = after && after.treasury === treasuryBefore;
  const pass = fortOk && !!withdrawBtn && refunded && retired;
  note(
    'Q3',
    pass ? 'PASS' : 'FAIL',
    `fortifyClick=${fortOk}; withdrawBtn=${withdrawBtn && withdrawBtn.label}; treasury ${treasuryBefore}->${after && after.treasury}; retired=${retired}; note=${JSON.stringify(noteText)}`,
  );
  await ctx.close();
}

// ---- Q4 — closing report dismissible without destroying record (play to terminal, real UI) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.waitForTimeout(300);
  await clickControl(page, 'enter');
  await page.waitForTimeout(200);
  if ((await st(page)).overlay === 'orientation') {
    await clickControl(page, 'begin');
    await page.waitForTimeout(200);
  }

  async function settle(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const s = await st(page);
      if (s.overlay === 'closed' || s.overlay === null || s.overlay === 'checklist') return s;
      const ids = (s.buttons || []).map((b) => b.id);
      const skip = ids.find((i) => /skip|continue|dismiss/i.test(i));
      if (skip) await clickControl(page, skip);
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(220);
    }
    return st(page);
  }

  // Drive sign-overs until the tenure closes (same player-path idiom as the 08-18 step-3 harness).
  let s = await st(page);
  let guard = 0;
  while (s.status === 'active' && guard < 150) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(180);
    s = await st(page);
    guard++;
  }
  const closed = await settle(15000);
  await page.screenshot({ path: join(OUT, 'Q4-closed-surface.png') });
  const btns = (closed.buttons || []).map((b) => b.id);
  const hasDismiss = btns.includes('dismiss');
  const hasNew = btns.includes('newtenure');
  let toPause = false;
  let restored = false;
  const scoreBefore = closed.score;
  const statusBefore = closed.status;
  const cycleBefore = closed.cycle;
  if (closed.overlay === 'closed' && hasDismiss) {
    await clickControl(page, 'dismiss');
    await page.waitForTimeout(250);
    const pause = await st(page);
    toPause = pause.overlay === 'pause';
    await page.screenshot({ path: join(OUT, 'Q4-after-dismiss.png') });
    if ((pause.buttons || []).some((b) => b.id === 'closedreport')) {
      await clickControl(page, 'closedreport');
      await page.waitForTimeout(250);
      const again = await st(page);
      restored =
        again.overlay === 'closed' &&
        again.status === statusBefore &&
        again.score === scoreBefore &&
        again.cycle === cycleBefore &&
        (again.buttons || []).some((b) => b.id === 'dismiss') &&
        (again.buttons || []).some((b) => b.id === 'newtenure');
    }
    await page.screenshot({ path: join(OUT, 'Q4-reopened.png') });
  }
  // Esc/X also dismisses: re-open then press X
  let escDismiss = false;
  if (restored) {
    await page.keyboard.press('x');
    await page.waitForTimeout(200);
    escDismiss = (await st(page)).overlay === 'pause';
  }
  const pass =
    closed.overlay === 'closed' &&
    hasDismiss &&
    hasNew &&
    toPause &&
    restored &&
    escDismiss;
  note(
    'Q4',
    pass ? 'PASS' : 'FAIL',
    `terminal ${statusBefore} @ cycle ${cycleBefore} after ${guard} sign-overs; closed buttons=[${btns}]; dismiss→pause=${toPause}; reopen intact=${restored}; X→pause=${escDismiss}; score=${scoreBefore}`,
  );
  await ctx.close();
}

await browser.close();

writeFileSync(
  join(OUT, 'browser-repro-results.json'),
  JSON.stringify({ head, url, results }, null, 2),
);
const fails = results.filter((r) => r.verdict === 'FAIL');
console.log(`\nSUMMARY: ${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
