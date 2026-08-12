// The hangar — M6's home base between runs. A warm DOM overlay in the charm register,
// code-drawn like everything else: the memorial cast (Cuckoo/Leon/Kirby portraits +
// barks), the one-currency shop (base upgrades + the wingmate-contract sink), and the
// permanent flight-log archive (lifetime aggregate + the recent-runs list). Purchases
// go through the shop -> ledger, and the whole panel re-renders. Browser-only glue;
// all the logic it drives (ledger, upgrades, hubvoice) is unit-tested elsewhere.
//
// Accessibility law (hard rule 8): every state is shape + text, never colour alone —
// tier pips are filled/empty squares, owned/locked/maxed carry a glyph and a word,
// and the medals in the log read by label, not hue.

import { CURRENCY } from '../economy/ledger.js';
import { shopState, buyUpgrade, buyContract, upgradeEffects } from '../economy/upgrades.js';
import { portraitCanvas, PORTRAITS } from '../gfx/portraits.js';
import { cuckooHangar, kirbyGreeting, kirbyReact, LEON_QUIPS } from '../run/hubvoice.js';
import { MEDAL_STYLE } from '../run/medals.js';
import { createChatter } from '../run/chatter.js';

// How often the ambient comms line rotates (living world, M10).
const CHATTER_MS = 7000;

const MONO = 'ui-monospace,Menlo,Consolas,monospace';

// A gentle idle "breathing" glow for the LAUNCH button — hub-screen idle animation
// (M10 living world), non-memorial and reduced-motion-gated. Injected once. The
// memorial-cast portraits are deliberately NOT animated here (hard rule 7): whether to
// give the cast an idle animation is an operator ratify call, not one to make solo.
let breathStyleInjected = false;
function ensureBreathStyle() {
  if (breathStyleInjected || typeof document === 'undefined') return;
  breathStyleInjected = true;
  const s = document.createElement('style');
  s.textContent =
    '@keyframes ssLaunchBreath{0%,100%{box-shadow:0 0 0 rgba(127,224,168,0)}' +
    '50%{box-shadow:0 0 22px rgba(127,224,168,0.34)}}' +
    '.ss-launch-breath{animation:ssLaunchBreath 3.4s ease-in-out infinite}';
  document.head.appendChild(s);
}

function el(tag, css, html) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (html != null) e.innerHTML = html;
  return e;
}

// A crew card: portrait + name/role + the current bark.
function crewCard(key, bark) {
  const card = el('div',
    'display:flex;gap:12px;align-items:flex-start;padding:10px;border-radius:10px;' +
    'background:rgba(10,16,24,0.6);border:1px solid #1d3346;margin-bottom:10px');
  const pf = PORTRAITS[key];
  const pw = el('div', 'flex:0 0 auto;border-radius:8px;overflow:hidden;background:#0d1620;border:1px solid #24405a');
  pw.appendChild(portraitCanvas(key, 72));
  card.appendChild(pw);
  const txt = el('div', 'min-width:0');
  txt.appendChild(el('div', 'color:#ffd24a;font-weight:700;font-size:14px', pf.name));
  txt.appendChild(el('div', 'color:#6f8a92;font-size:10px;letter-spacing:1px;text-transform:uppercase', pf.role));
  const barkEl = el('div', 'color:#dfeeea;font-size:12px;line-height:1.5;margin-top:5px;transition:opacity 0.5s', bark.line);
  txt.appendChild(barkEl);
  card.appendChild(txt);
  return { card, barkEl };
}

// Filled/empty square pips — the shape cue for an upgrade tier (not colour-only).
function pips(tier, max) {
  let s = '';
  for (let i = 0; i < max; i++) {
    const on = i < tier;
    s += '<span style="display:inline-block;width:11px;height:11px;margin-right:3px;border-radius:2px;' +
      (on ? 'background:#7fe0a8;border:1px solid #7fe0a8' : 'background:transparent;border:1px solid #3a5568') +
      '"></span>';
  }
  return s;
}

function shopRow(u, onBuy) {
  const row = el('div',
    'display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #16283a');
  const left = el('div', 'flex:1 1 auto;min-width:0');
  left.appendChild(el('div', 'color:#cfe6e2;font-weight:700;font-size:13px',
    u.name + '  <span style="color:#6f8a92;font-weight:400;font-size:11px">' + pips(u.tier, u.max) + '</span>'));
  left.appendChild(el('div', 'color:#8aa0a8;font-size:11px;margin-top:2px', u.blurb));
  row.appendChild(left);

  if (u.maxed) {
    row.appendChild(el('div',
      'flex:0 0 auto;padding:6px 12px;border-radius:7px;border:1px solid #3a5568;color:#7fe0a8;' +
      'font-size:11px;font-weight:700;letter-spacing:1px', '✓ MAX'));
  } else {
    const btn = el('div',
      'flex:0 0 auto;padding:7px 13px;border-radius:7px;font-size:12px;font-weight:700;' +
      'letter-spacing:1px;cursor:pointer;text-align:center;' +
      (u.affordable
        ? 'background:rgba(127,224,168,0.14);border:1px solid #7fe0a8;color:#7fe0a8'
        : 'background:rgba(120,140,150,0.06);border:1px solid #3a5568;color:#5f7680;cursor:not-allowed'),
      (u.affordable ? '' : '🔒 ') + u.price + ' ' + CURRENCY.short);
    if (u.affordable) btn.addEventListener('mousedown', (e) => { e.preventDefault(); onBuy(u.id); });
    row.appendChild(btn);
  }
  return row;
}

function contractRow(c, onBuy) {
  const row = el('div',
    'display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #16283a');
  const left = el('div', 'flex:1 1 auto;min-width:0');
  left.appendChild(el('div', 'color:#cfe6e2;font-weight:700;font-size:13px', c.name));
  left.appendChild(el('div', 'color:#8aa0a8;font-size:11px;margin-top:2px', c.blurb));
  row.appendChild(left);

  if (c.owned) {
    row.appendChild(el('div',
      'flex:0 0 auto;padding:6px 12px;border-radius:7px;border:1px solid #7fe0a8;color:#7fe0a8;' +
      'font-size:11px;font-weight:700;letter-spacing:1px', '✓ ON CREW'));
  } else if (c.locked) {
    row.appendChild(el('div',
      'flex:0 0 auto;padding:6px 12px;border-radius:7px;border:1px dashed #3a5568;color:#5f7680;' +
      'font-size:11px;letter-spacing:1px', '🔒 MAX THE SHIP'));
  } else {
    const btn = el('div',
      'flex:0 0 auto;padding:7px 13px;border-radius:7px;font-size:12px;font-weight:700;letter-spacing:1px;' +
      'text-align:center;cursor:' + (c.affordable ? 'pointer' : 'not-allowed') + ';' +
      (c.affordable
        ? 'background:rgba(255,210,74,0.14);border:1px solid #ffd24a;color:#ffd24a'
        : 'background:rgba(120,140,150,0.06);border:1px solid #3a5568;color:#5f7680'),
      'HIRE  ' + c.cost + ' ' + CURRENCY.short);
    if (c.affordable) btn.addEventListener('mousedown', (e) => { e.preventDefault(); onBuy(c.id); });
    row.appendChild(btn);
  }
  return row;
}

function medalChip(medal) {
  const m = MEDAL_STYLE[medal] || MEDAL_STYLE.none;
  return '<span style="color:' + m.color + ';font-weight:700">' + m.label + '</span>';
}

function flightLog(ledger) {
  const lt = ledger.lifetime();
  const wrap = el('div', 'margin-top:6px');
  wrap.appendChild(el('div',
    'color:#9fb4bb;letter-spacing:2px;font-size:12px;font-weight:700;margin-bottom:8px', 'FLIGHT LOG'));

  // lifetime aggregate (the permanent part)
  const agg = el('div', 'display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px');
  const stat = (v, label) =>
    '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#cfe6e2">' + v +
    '</div><div style="font-size:10px;color:#6f8a92;letter-spacing:1px">' + label + '</div></div>';
  agg.innerHTML =
    stat(lt.runs, 'RUNS') + stat(lt.victories, 'WINS') +
    '<div style="text-align:center"><div style="font-size:18px;font-weight:700">' + medalChip(lt.bestMedal) +
    '</div><div style="font-size:10px;color:#6f8a92;letter-spacing:1px">BEST</div></div>' +
    stat(lt.earned, 'LIFETIME ' + CURRENCY.short);
  wrap.appendChild(agg);

  // recent runs (the rolling detail)
  const log = ledger.log().slice().reverse();
  const list = el('div', 'max-height:150px;overflow:auto;border-top:1px solid #16283a;padding-top:6px');
  if (!log.length) {
    list.appendChild(el('div', 'color:#6f8a92;font-size:12px;font-style:italic;padding:6px 2px',
      'No flights logged yet. Your first run writes the first line.'));
  } else {
    log.forEach((r, i) => {
      const mark = r.victory ? '★' : (r.died ? '✕' : '·');
      const row = el('div',
        'display:flex;justify-content:space-between;font-size:12px;padding:3px 2px;color:#9fb4bb');
      row.innerHTML =
        '<span>' + mark + '  ' + r.sectors + '/' + (r.routeSectors || r.sectors) + ' sectors  ' + medalChip(r.medal) + '</span>' +
        '<span style="color:#8aa0a8">' + r.score + ' pts  ·  +' + r.salvage + ' ' + CURRENCY.short + '</span>';
      list.appendChild(row);
    });
  }
  wrap.appendChild(list);
  return wrap;
}

export function createHub(ledger, settings) {
  const scrim = el('div',
    'position:fixed;inset:0;z-index:34;display:none;align-items:center;justify-content:center;' +
    'background:rgba(6,10,16,0.985);overflow:auto;padding:24px 0');
  document.body.appendChild(scrim);

  let onLaunch = null;
  let context = {};
  let kirbyLine = kirbyGreeting();   // Kirby's current bark (reacts to purchases)
  const chatter = createChatter(LEON_QUIPS); // ambient comms rotation (M10)
  let leonBarkEl = null;             // live ref to Leon's bark line, for chatter swaps
  let chatterTimer = null;

  const reducedMotion = () => !!(settings && settings.get && settings.get('reducedMotion'));

  // Rotate the ambient comms line. A gentle fade unless reduced motion is on, in which
  // case the text swaps instantly (rotating text is not vestibular motion, but the
  // fade is, so the toggle governs the fade). Ambient only — never touches game state.
  function tickChatter() {
    if (!leonBarkEl) return;
    const next = chatter.advance();
    if (reducedMotion()) { leonBarkEl.textContent = next; return; }
    leonBarkEl.style.opacity = '0';
    setTimeout(() => { if (leonBarkEl) { leonBarkEl.textContent = next; leonBarkEl.style.opacity = '1'; } }, 260);
  }

  function buy(fn, id) {
    const before = ledger.balance();
    const res = fn(ledger, id);
    if (res.ok) {
      kirbyLine = kirbyReact(fn === buyContract ? 'boughtContract' : 'boughtUpgrade');
    } else if (res.reason === 'poor') kirbyLine = kirbyReact('poor');
    else if (res.reason === 'maxed') kirbyLine = kirbyReact('maxed');
    else if (res.reason === 'locked') kirbyLine = kirbyReact('locked');
    // (before/after balance is informational; the ledger is the source of truth)
    void before;
    render();
  }

  function render() {
    scrim.innerHTML = '';
    const panel = el('div',
      'max-width:1000px;width:calc(100% - 48px);background:rgba(12,18,26,0.98);' +
      'border:1px solid #24405a;border-radius:14px;padding:22px 26px;' +
      'box-shadow:0 12px 54px rgba(0,0,0,0.6);pointer-events:auto;' +
      'font:14px/1.55 ' + MONO + ';color:#cfe6e2;margin:auto');

    // header
    const head = el('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px');
    head.appendChild(el('div', 'letter-spacing:3px;font-weight:700;font-size:20px;color:#bfe9e2', 'THE HANGAR'));
    head.appendChild(el('div', 'text-align:right',
      '<div style="font-size:24px;font-weight:700;color:#ffd24a">' + ledger.balance() +
      ' <span style="font-size:13px;color:#c9a94a">' + CURRENCY.short + '</span></div>' +
      '<div style="font-size:10px;color:#6f8a92;letter-spacing:1px">' + CURRENCY.name.toUpperCase() + ' ON HAND</div>'));
    panel.appendChild(head);

    // body: crew column + shop/log column
    const body = el('div', 'display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap');

    const crew = el('div', 'flex:1 1 260px;min-width:240px');
    crew.appendChild(crewCard('cuckoo', cuckooHangar(context)).card);
    const leonCard = crewCard('leon', { line: chatter.current() });
    leonBarkEl = leonCard.barkEl;
    crew.appendChild(leonCard.card);
    crew.appendChild(crewCard('kirby', kirbyLine).card);
    body.appendChild(crew);

    const right = el('div', 'flex:2 1 420px;min-width:300px');
    const shop = shopState(ledger);
    right.appendChild(el('div',
      'color:#9fb4bb;letter-spacing:2px;font-size:12px;font-weight:700;margin-bottom:2px', 'SHIP UPGRADES'));
    shop.base.forEach((u) => right.appendChild(shopRow(u, (id) => buy(buyUpgrade, id))));
    right.appendChild(el('div',
      'color:#9fb4bb;letter-spacing:2px;font-size:12px;font-weight:700;margin:14px 0 2px', 'WINGMATE CONTRACTS'));
    if (!shop.contractsUnlocked) {
      right.appendChild(el('div', 'color:#6f8a92;font-size:11px;font-style:italic;padding:2px 2px 6px',
        'The sink past a maxed ship. Kit out the base upgrades first.'));
    }
    shop.contracts.forEach((c) => right.appendChild(contractRow(c, (id) => buy(buyContract, id))));
    right.appendChild(flightLog(ledger));
    body.appendChild(right);

    panel.appendChild(body);

    // footer: launch
    const foot = el('div', 'margin-top:18px;border-top:1px solid #22384a;padding-top:14px;text-align:center');
    const launch = el('div',
      'display:inline-block;padding:12px 40px;border-radius:9px;cursor:pointer;' +
      'background:rgba(127,224,168,0.16);border:1px solid #7fe0a8;color:#7fe0a8;' +
      'font-weight:700;letter-spacing:3px;font-size:15px', 'LAUNCH RUN  ▸');
    if (!reducedMotion()) { ensureBreathStyle(); launch.className = 'ss-launch-breath'; }
    launch.addEventListener('mousedown', (e) => { e.preventDefault(); if (onLaunch) onLaunch(); });
    foot.appendChild(launch);
    foot.appendChild(el('div', 'margin-top:9px;color:#6f8a92;font-size:11px', 'Enter to launch the run'));
    panel.appendChild(foot);

    scrim.appendChild(panel);
  }

  return {
    // ctx: { lastRun: summary|null, lifetimeRuns: number }
    show(ctx, launchCb) {
      context = ctx || {};
      onLaunch = launchCb;
      kirbyLine = kirbyGreeting();
      render();
      scrim.style.display = 'flex';
      if (chatterTimer == null && typeof setInterval !== 'undefined') {
        chatterTimer = setInterval(tickChatter, CHATTER_MS);
      }
    },
    hide() {
      scrim.style.display = 'none';
      if (chatterTimer != null) { clearInterval(chatterTimer); chatterTimer = null; }
    },
    isOpen: () => scrim.style.display !== 'none',
    fireLaunch() { if (onLaunch) onLaunch(); },
  };
}
