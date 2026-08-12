// Player-path soak gate (WARGAME-KIT-CONVENTIONS section 12): drives the SHIPPED
// dist through TURNS full turns vs Engine North via the real UI, error traps armed.
// Any pageerror, console error, or stall = gate fail. Born from the rc.1
// exponential-history freeze, which passed every unit suite and died at turn 2.
// Usage: node scripts/soak-endurance.mjs dist/index.html [turns]
import { chromium } from '/Users/rayweiss/Desktop/Dev Work/flattop-digital/node_modules/playwright/index.mjs';
const RC = process.argv[2];
const TURNS = Number(process.argv[3] ?? 5);
const ENGINE_SIDE = process.argv[4] === 'South' ? 'South' : 'North';
const HUMAN = ENGINE_SIDE === 'North' ? 'South' : 'North';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(`file://${RC}`);
await page.waitForSelector('.board-svg');
await page.waitForTimeout(400);
for (const label of ['Skip', 'Skip tour', 'Close', 'Got it', 'Dismiss']) {
  const b = page.locator(`button:has-text("${label}")`).first();
  if (await b.count() && await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(200); break; }
}
await page.locator('select[aria-label="Opponent"]').selectOption(ENGINE_SIDE);
const turnsSeen = [];
for (let t = 1; t <= TURNS; t++) {
  // Wait until it's South's move on turn t (engine North already replied).
  const ok = await page.waitForFunction(({ tt, hh }) => {
    const m = document.body.textContent.match(/Turn(\d+) · (North|South)/);
    return m && Number(m[1]) === tt && m[2] === hh;
  }, { tt: t, hh: HUMAN }, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ok) { turnsSeen.push(`STUCK waiting for human turn ${t}`); break; }
  turnsSeen.push(`T${t} ${HUMAN} reached`);
  // 5 scripted South moves
  const pieceEls = page.locator('.board-svg [data-id]');
  const n = await pieceEls.count();
  for (let i = 0; i < n; i++) {
    const movesLeft = await page.evaluate(() => { const m = document.body.textContent.match(/Moves left(\d)/); return m ? Number(m[1]) : 0; });
    if (movesLeft === 0) break;
    await pieceEls.nth(i).click({ force: true });
    await page.waitForTimeout(60);
    const dot = page.locator('.legal-dot').first();
    if (await dot.count()) { await dot.click({ force: true }); await page.waitForTimeout(80); }
    else await page.keyboard.press('Escape');
  }
  await page.locator('button:has-text("End Turn")').click();
}
// Final: wait for the engine to answer the last human turn.
await page.waitForTimeout(5000);
const finalTurn = await page.evaluate(() => (document.body.textContent.match(/Turn\d+ · \w+/) || [''])[0]);
console.log(JSON.stringify({ turnsSeen, finalTurn, errors: errors.slice(0, 6), errorCount: errors.length }, null, 1));
await browser.close();
