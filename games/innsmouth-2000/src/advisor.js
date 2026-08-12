// The Old Priest advisor for INNSMOUTH 2000 (M8, STUDY 3.7 / DESIGN-SEED register).
//
// A portrait-plus-text advisory popup. The Old Priest counsels appeasement in even tones: he reads
// the town's state and names, without alarm, the one thing most worth tending — the angriest god
// and its path, an empty treasury, the stirring dreamer, or a plain reassurance when all is well.
// `advise` is pure over sim (node --test covers it); the window is canvas-injected chrome guarded by
// the text-overflow detector. Player-facing wording is plain, period, no em-dashes (hard rule 10).

import { wrathForecast, GOD_INFO, FAVOR_STAGE, DOOM_AWAKENINGS } from './gods.js';
import { deepAdvice } from './deep.js';
import { CHROME, RAMP, BASE, SHADOW, LIGHT } from './palette.js';
import { drawBevel, inRect, wrapMono, fitMono, PANEL_PAD } from './ui.js';

// The Old Priest's counsel: a short list of even-toned lines, most-urgent first, always closing on
// the same steady refrain. Pure over sim state.
export function advise(sim) {
  const title = 'The Old Priest';
  if (sim.ended) {
    return { title, lines: [
      'It is done. The dreamer has waked, and the sea has taken the town.',
      'There is no counsel left, only the long dark. We knew it would come.',
    ] };
  }
  const lines = [];
  const fc = wrathForecast(sim);
  const worst = fc.gods.find((g) => g.stage === FAVOR_STAGE.DIRE)
    || fc.gods.find((g) => g.stage === FAVOR_STAGE.OMEN);
  if (worst) {
    const info = GOD_INFO[worst.god];
    const lead = worst.stage === FAVOR_STAGE.DIRE ? 'is nearly upon us' : 'grows restless';
    lines.push(`${info.label} ${lead}. ${info.appease}`);
  }
  if (sim.treasury < 0 || sim.servicesCut) {
    lines.push('The coffers are empty and the watch goes unpaid. Set the ledger right before all else.');
  }
  if (sim.awakenings > 0) {
    const left = DOOM_AWAKENINGS - sim.awakenings;
    lines.push(left > 0
      ? `The great dreamer has stirred ${sim.awakenings} times. Slow him with asylums, shrines, and the university; we cannot stop him.`
      : 'The dreaming is ended, and so are we.');
  }
  if (!worst && sim.dread >= 45) {
    lines.push('Dread runs high in the lanes. Raise a chapel, or hold the Masked Processions, and let it settle.');
  }
  // The water (M-b). The Old Priest counsels on the mains in the same even tone he uses for the gods,
  // because to him they are the same subject. Capped at two lines so the counsel stays a counsel and
  // the window never becomes a water report; deep.js orders them most urgent first.
  for (const line of deepAdvice(sim).slice(0, 2)) lines.push(line);
  if (lines.length === 0) {
    lines.push('The town keeps well enough for now. The gods are quiet, and the streets are calm.');
  }
  lines.push('Appease them all, each in its turn. That is the whole of it.');
  return { title, lines };
}

// The advisor window: a portrait well on the left, the counsel wrapped to the column on the right.
// Sized to its text so nothing clips (M8). Pure geometry.
const PORTRAIT = 96; // the portrait well's base size (scaled)

export function buildAdvisorWindow(viewportW, viewportH, opts = {}) {
  const scale = opts.scale ?? 1;
  const s = (px) => Math.round(px * scale);
  const titleH = s(20);
  const pad = s(PANEL_PAD); // the one shared padding standard (M10 sweep), scaled by this window's own s()
  const portrait = s(PORTRAIT);
  const w = Math.min(viewportW - 40, s(440));
  const textX = pad + portrait + pad;
  const textW = w - textX - pad;
  const lines = Array.isArray(opts.lines) ? opts.lines : [];
  // Wrap every counsel line to the text column; the taller of the text block or the portrait sets
  // the body height.
  const wrapped = lines.flatMap((l) => wrapMono(l, textW, s(13), 4));
  const textH = wrapped.length * s(18) + s(6);
  const bodyH = Math.max(textH, portrait) + pad * 2;
  const h = titleH + bodyH;
  const x = Math.round((viewportW - w) / 2);
  const y = Math.max(34, Math.round((viewportH - h) / 2));
  return {
    frame: { x, y, w, h },
    titleBar: { x, y, w, h: titleH },
    close: { x: x + w - titleH + s(3), y: y + s(3), w: titleH - s(6), h: titleH - s(6) },
    portraitWell: { x: x + pad, y: y + titleH + pad, w: portrait, h: portrait },
    textX: x + textX, textY: y + titleH + pad, textW,
    wrapped, scale, s, pad,
  };
}

export function advisorHit(layout, px, py) {
  if (inRect(layout.close, px, py)) return { type: 'close' };
  return null;
}
export function overAdvisor(layout, px, py) { return inRect(layout.frame, px, py); }

// A code-drawn portrait of the Old Priest: a hooded, robed figure with an ashen, lined face, set in
// a recessed well. No bitmap assets (clean-room, hard rule 1); all primitives.
export function drawPriestPortrait(ctx, well) {
  const { x, y, w, h } = well;
  drawBevel(ctx, x, y, w, h, true); // a recessed well
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  // A cold, damp backdrop.
  ctx.fillStyle = RAMP.slate[SHADOW];
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  const cx = x + w / 2;
  const u = w / 100; // a unit so the portrait scales with the well
  // The robe: a broad dark trapezoid rising to the shoulders.
  ctx.fillStyle = RAMP.clapboard[SHADOW];
  ctx.beginPath();
  ctx.moveTo(cx - 42 * u, y + h - 2);
  ctx.lineTo(cx - 26 * u, y + 46 * u);
  ctx.lineTo(cx + 26 * u, y + 46 * u);
  ctx.lineTo(cx + 42 * u, y + h - 2);
  ctx.closePath();
  ctx.fill();
  // The hood: a darker cowl framing the face.
  ctx.fillStyle = RAMP.slate[BASE];
  ctx.beginPath();
  ctx.moveTo(cx - 30 * u, y + 52 * u);
  ctx.quadraticCurveTo(cx - 30 * u, y + 10 * u, cx, y + 8 * u);
  ctx.quadraticCurveTo(cx + 30 * u, y + 10 * u, cx + 30 * u, y + 52 * u);
  ctx.quadraticCurveTo(cx, y + 40 * u, cx - 30 * u, y + 52 * u);
  ctx.closePath();
  ctx.fill();
  // The face: an ashen oval, sunken.
  ctx.fillStyle = '#b9b3a2';
  ctx.beginPath();
  ctx.ellipse(cx, y + 34 * u, 17 * u, 22 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shadowed brow and gaunt cheeks.
  ctx.fillStyle = 'rgba(40,44,40,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, y + 23 * u, 17 * u, 7 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40,44,40,0.16)'; // hollow cheeks
  ctx.beginPath(); ctx.ellipse(cx - 11 * u, y + 38 * u, 4 * u, 7 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 11 * u, y + 38 * u, 4 * u, 7 * u, 0, 0, Math.PI * 2); ctx.fill();
  // Heavy brows over deep-set eyes.
  ctx.strokeStyle = '#6f6a5e'; ctx.lineWidth = Math.max(1, 1.6 * u);
  ctx.beginPath(); ctx.moveTo(cx - 11 * u, y + 27 * u); ctx.lineTo(cx - 3 * u, y + 28 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 3 * u, y + 28 * u); ctx.lineTo(cx + 11 * u, y + 27 * u); ctx.stroke();
  // Eyes: two dark, downcast pits.
  ctx.fillStyle = '#2a2622';
  ctx.beginPath(); ctx.ellipse(cx - 7 * u, y + 32 * u, 2.4 * u, 3 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7 * u, y + 32 * u, 2.4 * u, 3 * u, 0, 0, Math.PI * 2); ctx.fill();
  // A long nose and a grave, downturned mouth.
  ctx.strokeStyle = '#7a7466'; ctx.lineWidth = Math.max(1, 1.4 * u);
  ctx.beginPath(); ctx.moveTo(cx, y + 34 * u); ctx.lineTo(cx - 1.5 * u, y + 41 * u); ctx.stroke();
  ctx.strokeStyle = '#5a544a';
  ctx.beginPath(); ctx.moveTo(cx - 6 * u, y + 46 * u); ctx.quadraticCurveTo(cx, y + 43 * u, cx + 6 * u, y + 46 * u); ctx.stroke();
  // A long grey beard framing the jaw and falling to a point over the robe.
  ctx.fillStyle = '#9a9689';
  ctx.beginPath();
  ctx.moveTo(cx - 17 * u, y + 40 * u);
  ctx.quadraticCurveTo(cx - 16 * u, y + 66 * u, cx, y + 78 * u);
  ctx.quadraticCurveTo(cx + 16 * u, y + 66 * u, cx + 17 * u, y + 40 * u);
  ctx.quadraticCurveTo(cx, y + 56 * u, cx - 17 * u, y + 40 * u);
  ctx.closePath();
  ctx.fill();
  // A few strands of shadow in the beard.
  ctx.strokeStyle = 'rgba(60,58,50,0.5)'; ctx.lineWidth = Math.max(1, 1 * u);
  ctx.beginPath(); ctx.moveTo(cx - 6 * u, y + 50 * u); ctx.lineTo(cx - 4 * u, y + 70 * u); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6 * u, y + 50 * u); ctx.lineTo(cx + 4 * u, y + 70 * u); ctx.stroke();
  // A thin staff at his side.
  ctx.strokeStyle = RAMP.dirt[LIGHT];
  ctx.lineWidth = Math.max(1, 2 * u);
  ctx.beginPath();
  ctx.moveTo(x + w - 12 * u, y + 12 * u);
  ctx.lineTo(x + w - 18 * u, y + h - 4);
  ctx.stroke();
  ctx.restore();
}

export function drawAdvisorWindow(ctx, layout, advice) {
  const { frame, titleBar, close, portraitWell, s } = layout;
  // Frame + title bar + close (same chrome as the other windows).
  ctx.fillStyle = CHROME.deepFrame;
  ctx.fillRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);
  drawBevel(ctx, frame.x, frame.y, frame.w, frame.h, false);
  ctx.fillStyle = CHROME.titleBar;
  ctx.fillRect(titleBar.x + 2, titleBar.y + 2, titleBar.w - 4, titleBar.h - 2);
  ctx.fillStyle = CHROME.titleText;
  ctx.font = `${s(13)}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(fitMono(advice.title, titleBar.w - close.w - s(PANEL_PAD), s(13)), titleBar.x + s(PANEL_PAD), titleBar.y + titleBar.h / 2 + 1);
  drawBevel(ctx, close.x, close.y, close.w, close.h, false);
  ctx.strokeStyle = CHROME.ink; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(close.x + 3, close.y + 3); ctx.lineTo(close.x + close.w - 3, close.y + close.h - 3);
  ctx.moveTo(close.x + close.w - 3, close.y + 3); ctx.lineTo(close.x + 3, close.y + close.h - 3);
  ctx.stroke();
  // The portrait.
  drawPriestPortrait(ctx, portraitWell);
  // The counsel, pre-wrapped to the text column.
  ctx.fillStyle = CHROME.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${s(13)}px monospace`;
  let yy = layout.textY + s(14);
  for (const ln of layout.wrapped) {
    ctx.fillText(ln, layout.textX, yy);
    yy += s(18);
  }
  ctx.textBaseline = 'middle';
}
