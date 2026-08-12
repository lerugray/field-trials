// The title screen (M12) — the game boots here, before the hangar. It is a thin DOM
// overlay laid over the LIVE 3D scene (main.js keeps the real renderer drawing the ship
// banking through the starfield behind it): a code-drawn STRAY SQUADRON wordmark and the
// New Run / Continue / Options menu. All selection logic is the headless-tested
// ui/titlemenu.js; this file only draws it and routes the callbacks. Browser-only glue,
// proof-booted like screens.js / hub.js.
//
// Memorial restraint (DIRECTIONS-M12): no memorial names, no dedication, no flavor text
// of any kind here — the memorial register lives in the hangar where it already lives.
// The wordmark is code-drawn and palette-locked (hard rules 1, 2, 6); the scrim is a
// soft gradient, never a solid, so the live scene reads through it.

import { createTitleMenu } from './titlemenu.js';

const MONO = 'ui-monospace,Menlo,Consolas,monospace';

// Palette lock — the same warm gold / teal / ink the rest of the game uses.
const GOLD = '#ffd24a';
const GOLD_DEEP = '#8a5a12';   // the extruded block face behind the bright letters
const INK = '#0b0f16';
const TEAL = '#4fd0c0';
const TEAL_SOFT = '#bfe9e2';
const MUTE = '#6f8a92';

// A code-drawn, blocky-but-charming STRAY SQUADRON wordmark. Two words stacked, drawn
// in a heavy weight with a solid extruded copy behind the bright face (the "block") and
// a thin ink outline for crispness. No font file, no image — pure canvas, palette-lock
// true. `w` is the logical CSS width; the canvas draws at devicePixelRatio for sharpness.
function wordmark(w) {
  const h = Math.round(w * 0.34);
  const c = document.createElement('canvas');
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.cssText = `width:${w}px;height:${h}px;display:block;max-width:100%`;
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.textAlign = 'center';
  x.textBaseline = 'middle';

  const cx = w / 2;
  // Two lines: STRAY over SQUADRON. SQUADRON (8 chars) sets the width; size to fit.
  const line1 = 'STRAY', line2 = 'SQUADRON';
  const px = Math.floor(w * 0.148);   // cap height; tuned so SQUADRON fits with tracking
  const track = Math.floor(px * 0.14); // letter tracking (blocky spacing)
  const y1 = h * 0.30, y2 = h * 0.72;
  const ext = Math.max(3, Math.round(px * 0.09)); // extrusion depth

  function drawWord(word, cy) {
    x.font = `900 ${px}px ${MONO}`;
    // Manual tracking: measure the tracked width, then lay glyphs left-to-right.
    const widths = [...word].map((ch) => x.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (word.length - 1);
    let gx = cx - total / 2;
    const centers = [];
    for (let i = 0; i < word.length; i++) { centers.push(gx + widths[i] / 2); gx += widths[i] + track; }
    // 1) the extruded block: a stack of deep-gold copies offset down-right.
    x.fillStyle = GOLD_DEEP;
    for (let d = ext; d >= 1; d--) {
      for (let i = 0; i < word.length; i++) x.fillText(word[i], centers[i] + d, cy + d);
    }
    // 2) a thin ink outline on the bright face for crisp letter edges.
    x.lineJoin = 'round';
    x.lineWidth = Math.max(2, px * 0.05);
    x.strokeStyle = INK;
    for (let i = 0; i < word.length; i++) x.strokeText(word[i], centers[i], cy);
    // 3) the bright gold face.
    x.fillStyle = GOLD;
    for (let i = 0; i < word.length; i++) x.fillText(word[i], centers[i], cy);
    return { left: centers[0] - widths[0] / 2, right: centers[centers.length - 1] + widths[widths.length - 1] / 2 };
  }

  drawWord(line1, y1);
  const span = drawWord(line2, y2);
  // A thin teal underline rule spanning the lower word — the same command-chevron accent
  // family as the briefing emblem, quietly tying the wordmark to the run framing.
  x.strokeStyle = TEAL;
  x.lineWidth = 3;
  const ry = y2 + px * 0.62;
  x.beginPath(); x.moveTo(span.left, ry); x.lineTo(span.right, ry); x.stroke();
  return c;
}

function el(tag, css, html) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (html != null) e.innerHTML = html;
  return e;
}

export function createTitle() {
  const scrim = el('div',
    // z-index 10: BELOW the options menu (z 20) so Options opens over the title. A soft
    // top-transparent gradient darkening downward keeps the menu legible without hiding
    // the live scene behind it.
    'position:fixed;inset:0;z-index:10;display:none;flex-direction:column;' +
    'align-items:center;justify-content:space-between;padding:6vh 24px 5vh;' +
    'background:linear-gradient(180deg,rgba(6,10,16,0.05) 0%,rgba(6,10,16,0.28) 42%,' +
    'rgba(6,10,16,0.72) 100%);pointer-events:none;' +
    `font:15px/1.5 ${MONO};color:${TEAL_SOFT}`);
  document.body.appendChild(scrim);

  let menu = null;
  let cbs = {};          // { onNew, onContinue, onOptions, onMove, onConfirm }
  let rowEls = [];

  function dispatch(id) {
    if (id === 'new') return cbs.onNew && cbs.onNew();
    if (id === 'continue') return cbs.onContinue && cbs.onContinue();
    if (id === 'options') return cbs.onOptions && cbs.onOptions();
  }

  function renderRows() {
    rowEls.forEach(({ row, it }) => {
      const m = menu.items().find((i) => i.id === it.id);
      const active = m.selected;
      const disabled = !m.enabled;
      // Shape + text cue (never colour alone): the selected row carries a ▸ marker AND a
      // highlight; a disabled row is dimmed AND spells out its reason.
      const marker = active ? '▸ ' : '  ';
      // A disabled row spells out its reason on a quiet sub-line (plain English, no
      // dashes — hard rule 14), never colour alone (accessibility law).
      const reason = (disabled && m.reason)
        ? `<div style="color:${MUTE};font-weight:400;font-size:12px;letter-spacing:1px;margin-top:2px">${m.reason}</div>`
        : '';
      row.innerHTML =
        `<div style="color:${disabled ? MUTE : (active ? GOLD : TEAL_SOFT)};` +
        `font-weight:${active ? 700 : 400};letter-spacing:2px">${marker}${m.label}</div>${reason}`;
      row.style.background = active ? 'rgba(79,208,192,0.14)' : 'transparent';
      row.style.outline = active ? `1px solid ${TEAL}` : '1px solid transparent';
      row.style.opacity = disabled ? '0.55' : '1';
      row.style.cursor = disabled ? 'default' : 'pointer';
    });
  }

  function build() {
    scrim.innerHTML = '';
    rowEls = [];

    // top: the wordmark
    const top = el('div', 'pointer-events:none;text-align:center;margin-top:2vh');
    // Scale with the viewport (min-clamped so a narrow window still reads), capped so a
    // big screen gets more wordmark presence without the letters going gigantic.
    const w = Math.min(900, Math.max(420, Math.floor((window.innerWidth || 1280) * 0.55)));
    top.appendChild(wordmark(w));
    scrim.appendChild(top);

    // middle: the menu (pointer-events re-enabled just on the interactive column)
    const col = el('div', 'pointer-events:auto;display:flex;flex-direction:column;gap:8px;' +
      'width:min(360px,86vw);margin:0 auto');
    menu.items().forEach((m) => {
      const row = el('div',
        'padding:11px 16px;border-radius:9px;transition:background 0.12s;text-align:left');
      row.addEventListener('mouseenter', () => {
        if (menu.select(m.id)) { renderRows(); if (cbs.onMove) cbs.onMove(); }
      });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!menu.isEnabled(m.id)) return;      // disabled Continue does nothing
        menu.select(m.id); renderRows();
        confirm();
      });
      col.appendChild(row);
      rowEls.push({ row, it: m });
    });
    scrim.appendChild(col);

    // bottom: a quiet control hint (no flavor text — operator voice / memorial restraint)
    const hint = el('div',
      `pointer-events:none;color:${MUTE};font-size:12px;letter-spacing:1px;text-align:center`,
      'D-pad or arrows to choose · A / Enter to confirm');
    scrim.appendChild(hint);

    renderRows();
  }

  // A confirm on the current item: fire the SFX socket, then dispatch its action.
  function confirm() {
    const id = menu.activate();
    if (!id) return;
    if (cbs.onConfirm) cbs.onConfirm();
    dispatch(id);
  }

  // S14: the wordmark width is composed from innerWidth inside build(), so it goes
  // stale after a resize or a device rotate. Rebuild while the title is open (build()
  // re-reads the live menu, so the current selection is preserved), and the scrim's
  // innerHTML reset inside build() disposes the old wordmark canvas — no accumulation.
  const onResize = () => { if (menu && scrim.style.display !== 'none') build(); };
  window.addEventListener('resize', onResize);

  return {
    // ctx: { hasProgress, onNew, onContinue, onOptions, onMove, onConfirm }
    show(ctx) {
      cbs = ctx || {};
      menu = createTitleMenu({ hasProgress: !!(ctx && ctx.hasProgress) });
      build();
      scrim.style.display = 'flex';
    },
    hide() { scrim.style.display = 'none'; },
    isOpen: () => scrim.style.display !== 'none',
    move(dir) {
      if (!menu) return;
      menu.move(dir);
      if (cbs.onMove) cbs.onMove();
      renderRows();
    },
    confirm,
    current: () => (menu ? menu.current() : null),
    dispose() {
      window.removeEventListener('resize', onResize);
      scrim.remove();
    },
  };
}
