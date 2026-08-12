// Game HUD — code-drawn on a 2D canvas over the WebGL view (no images, all
// generated). M2 ships the reticle (at the shot-convergence point) and the
// brake/boost meter. Accessibility law from M2: every state is shape/icon +
// color, never color alone; high contrast via a drawn shadow so it reads over
// any sector palette. This is shipped game UI at the best art bar, not a debug
// overlay. Browser-only.

// The HUD ink palette — the SINGLE source of truth for every stateful readout's color.
// Exported so the legibility floor (src/ui/legibility.js + test) checks the REAL colors
// the HUD draws, not a hand-copied mirror (M13 S12 — de-circularized: change a color
// here and the contrast test re-audits it).
export const HUD_PALETTE = {
  INK: '#bfe9e2',       // primary reticle/HUD ink (cool)
  INK_DIM: '#6f8a92',
  BOOST: '#ffb64a',     // warm — boost
  BRAKE: '#7fb2ff',     // cool blue — brake
  WARN: '#ff6b5c',      // low-meter / hit warning
  HULL: '#7fe0a8',      // healthy hull (cool green)
  BOSS_INK: '#ff8a5c',  // the run-climax boss gauge
  PACE_BRONZE: '#d3894a',
  PACE_SILVER: '#cfd6dd',
  PACE_GOLD: '#ffd24a',
};
// The HUD's two centered bars, exported so the no-clipped-text check reads the real
// layout (S12). meter = fixed width; boss bar = min(cap, share of the viewport).
export const HUD_LAYOUT = { METER_W: 240, BOSS_BAR_CAP: 560, BOSS_BAR_VW_FRAC: 0.52 };

// The two full-view washes. Kept OUT of HUD_PALETTE because they are not readouts and
// the text-contrast floor should not audit them as glyph inks — but still exported, so
// the legibility floor can hold them to the rule that actually applies to a wash: at
// the flash cap, over the real sector fogs, the result must read as LIGHT, not as a
// colour (src/ui/legibility.js + test). See drawFlash for what went wrong before.
export const HUD_WASHES = {
  FLASH: '#fff6e6', // kill flash — warm white
  HURT: '#ff3a2e',  // player-hit vignette — red
};
// The draw calls need "r,g,b" to splice an alpha onto, and the floor audits the hex.
// Derived, not re-typed, so the audited colour is provably the painted one (the same
// de-circularisation HUD_PALETTE got at M13 S12).
const rgbOf = (hex) =>
  `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
const FLASH_RGB = rgbOf(HUD_WASHES.FLASH);
const HURT_RGB = rgbOf(HUD_WASHES.HURT);

// Kill-bloom radius as a fraction of the screen diagonal. LOCAL by law: the bloom
// marks the kill point; it is not a screen event. At 0.42 (the M14d value) most of
// the frame lit on every kill — one kill every ~3.5s of combat made a luminance
// strobe the operator reported the same day the colour fix landed. Held ≤ 0.2 by
// test/legibility.test.js.
export const KILL_BLOOM_FRAC = 0.14;

const { INK, INK_DIM, BOOST, BRAKE, WARN, HULL } = HUD_PALETTE;
const SHADOW = 'rgba(0,0,0,0.55)';
const MONO = 'ui-monospace,Menlo,Consolas,monospace';

// Gap between an INLINE-LEFT bar label and its segment run (art migration 2026-08-10).
// The approved HUD frame puts every bottom-row label beside its bar rather than above
// it; the two bottom readouts share this constant so they stay on one visual baseline.
export const LABEL_GAP = 10;

export function createHud() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:5';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let vw = 0, vh = 0, dpr = 1;
  let reducedMotion = false;

  function resize(w, h, ratio) {
    vw = w; vh = h; dpr = ratio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }

  // Four L-brackets forming a convergence box of half-size r.
  function brackets(r, len) {
    const p = [[-r, -r, 1, 1], [r, -r, -1, 1], [r, r, -1, -1], [-r, r, 1, -1]];
    for (const [cx, cy, sx, sy] of p) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * len);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * len, cy);
      ctx.stroke();
    }
  }

  function drawReticle(x, y) {
    ctx.save();
    ctx.translate(x, y);
    const r = 17, len = 8;
    // shadow pass (offset), then ink pass — legibility over bright skies
    ctx.lineWidth = 3.5; ctx.strokeStyle = SHADOW;
    ctx.save(); ctx.translate(0.8, 0.8); brackets(r, len); ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = INK;
    brackets(r, len);
    // center pip (plus)
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(0, -4); ctx.lineTo(0, 4);
    ctx.stroke();
    // convergence ticks: two short inward lines from below, suggesting the
    // wing-shots crossing here (STUDY.md §3.2)
    ctx.strokeStyle = INK_DIM;
    ctx.beginPath();
    ctx.moveTo(-r - 6, r + 12); ctx.lineTo(-3, 3);
    ctx.moveTo(r + 6, r + 12); ctx.lineTo(3, 3);
    ctx.stroke();
    ctx.restore();
  }

  // Charge ring around the reticle — the arc grows with charge (shape), warm when
  // full with four ready-ticks. Shape carries the state; color is the accent.
  function drawCharge(x, y, charge, full) {
    if (!(charge > 0)) return;
    const r = 26;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = full ? BOOST : INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2); ctx.stroke();
    if (full) {
      ctx.strokeStyle = BOOST; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
        ctx.beginPath(); ctx.moveTo(c * (r + 3), s * (r + 3)); ctx.lineTo(c * (r + 8), s * (r + 8)); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Lock-on brackets around the target's screen position. Four corner brackets
  // (the shape cue the accessibility law requires for lock states) + a label;
  // tighter and warning-colored once the charge is fully ready to fire.
  function drawLock(pt, full) {
    if (!pt || !pt.visible) return;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    const r = full ? 15 : 22, len = 8;
    ctx.strokeStyle = full ? WARN : INK; ctx.lineWidth = 2.5;
    const corners = [[-r, -r, 1, 1], [r, -r, -1, 1], [r, r, -1, -1], [-r, r, 1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * len); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * len, cy); ctx.stroke();
    }
    ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const lab = full ? 'LOCK' : 'LOCKING';
    ctx.fillStyle = SHADOW; ctx.fillText(lab, 0.6, -r - 6 + 0.6);
    ctx.fillStyle = full ? WARN : INK; ctx.fillText(lab, 0, -r - 6);
    ctx.restore();
  }

  // Deflect shield — a bright ring + label around the ship while a barrel roll is
  // knocking bolts away. This is the NON-MOTION cue the accessibility law requires:
  // it plays identically whether or not the ship's visible spin is damped.
  function drawDeflect(pt) {
    if (!pt || !pt.visible) return;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.strokeStyle = BRAKE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
    // eight spokes (shape) to read as a shield, not just a circle
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(c * 30, s * 30); ctx.lineTo(c * 35, s * 35); ctx.stroke();
    }
    ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = SHADOW; ctx.fillText('DEFLECT', 0.6, -38 + 0.6);
    ctx.fillStyle = BRAKE; ctx.fillText('DEFLECT', 0, -38);
    ctx.restore();
  }

  function drawMeter(value, mode) {
    const bw = HUD_LAYOUT.METER_W, bh = 12;
    const x = (vw - bw) / 2, y = vh - 44;
    const segs = 12, gap = 2;
    const sw = (bw - gap * (segs - 1)) / segs;
    const active = mode === 'boost' ? BOOST : mode === 'brake' ? BRAKE : INK;
    const low = value < 0.25;

    // Label INLINE-LEFT of the bar, vertically centred on it (art migration
    // 2026-08-10 — the approved HUD frame's treatment). It used to sit ABOVE the bar,
    // which is the layout that clips: the bar is already 44px off the bottom edge, so
    // the label's ascender was the first thing to go at a short viewport, and it also
    // collided with the wingmate caption that lives at vh-80. Beside the bar, the row
    // occupies one line and cannot clip against anything.
    ctx.font = `600 12px ${MONO}`;
    ctx.textBaseline = 'middle';
    const label = mode === 'boost' ? 'BOOST' : mode === 'brake' ? 'BRAKE' : 'THRUST';
    ctx.textAlign = 'right';
    const lx = x - LABEL_GAP, ly = y + bh / 2;
    ctx.fillStyle = SHADOW; ctx.fillText(label, lx + 0.8, ly + 0.8);
    ctx.fillStyle = low ? WARN : active; ctx.fillText(label, lx, ly);

    // icon: up-chevron (boost) / down-chevron (brake), left of the inline label
    if (mode !== 'cruise') {
      const ix = lx - ctx.measureText(label).width - 10, iy = ly, up = mode === 'boost';
      ctx.strokeStyle = low ? WARN : active; ctx.lineWidth = 2;
      ctx.beginPath();
      if (up) { ctx.moveTo(ix - 5, iy + 3); ctx.lineTo(ix, iy - 3); ctx.lineTo(ix + 5, iy + 3); }
      else { ctx.moveTo(ix - 5, iy - 3); ctx.lineTo(ix, iy + 3); ctx.lineTo(ix + 5, iy - 3); }
      ctx.stroke();
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // segmented fill
    const filled = value * segs;
    for (let i = 0; i < segs; i++) {
      const sx = x + i * (sw + gap);
      ctx.fillStyle = SHADOW; ctx.fillRect(sx + 0.8, y + 0.8, sw, bh);
      // frame
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, y + 0.5, sw - 1, bh - 1);
      const f = Math.max(0, Math.min(1, filled - i));
      if (f > 0) {
        ctx.fillStyle = low ? WARN : active;
        ctx.fillRect(sx, y + bh - bh * f, sw, bh * f);
      }
    }
    // low-meter warning: a hollow triangle (shape) + color, right of the bar
    if (low) {
      const tx = x + bw + 14, ty = y + bh / 2;
      ctx.strokeStyle = WARN; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 8); ctx.lineTo(tx + 7, ty + 6); ctx.lineTo(tx - 7, ty + 6); ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = WARN; ctx.fillRect(tx - 0.8, ty - 3, 1.6, 5); ctx.fillRect(tx - 0.8, ty + 4, 1.6, 1.6);
    }
  }

  // Score + kills, top-right. Code-drawn, high-contrast via a shadow pass so it
  // reads over any sector palette. Right-aligned so a long score never clips.
  function drawScore(score, kills) {
    const x = vw - 20, y = 30;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 22px ui-monospace,Menlo,Consolas,monospace';
    const s = String(score).padStart(6, '0');
    ctx.fillStyle = SHADOW; ctx.fillText(s, x + 0.8, y + 0.8);
    ctx.fillStyle = INK; ctx.fillText(s, x, y);
    ctx.font = '600 11px ui-monospace,Menlo,Consolas,monospace';
    const k = kills === 1 ? '1 DOWN' : `${kills} DOWN`;
    ctx.fillStyle = SHADOW; ctx.fillText(k, x + 0.6, y + 15.6);
    ctx.fillStyle = INK_DIM; ctx.fillText(k, x, y + 15);
  }

  // In-level medal-pace indicator (M5) — the projected medal at your current rate,
  // under the score. The WORD is the read (accessibility law); the color is accent
  // and a filled dot count (1-3) gives a non-color shape cue for bronze/silver/gold.
  const PACE_COL = { none: INK_DIM, bronze: HUD_PALETTE.PACE_BRONZE, silver: HUD_PALETTE.PACE_SILVER, gold: HUD_PALETTE.PACE_GOLD };
  const PACE_PIPS = { none: 0, bronze: 1, silver: 2, gold: 3 };
  function drawMedalPace(pace) {
    if (!pace) return;
    const medal = pace.medal || 'none';
    const x = vw - 20, y = 62;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 11px ${MONO}`;
    const label = medal === 'none' ? 'PACE: —' : 'PACE: ' + medal.toUpperCase();
    ctx.fillStyle = SHADOW; ctx.fillText(label, x + 0.6, y + 0.6);
    ctx.fillStyle = PACE_COL[medal] || INK_DIM; ctx.fillText(label, x, y);
    // pip shape cue (1..3), left of the label
    const pips = PACE_PIPS[medal] || 0;
    const lw = ctx.measureText(label).width;
    for (let i = 0; i < 3; i++) {
      const px = x - lw - 8 - (2 - i) * 8;
      ctx.fillStyle = i < pips ? (PACE_COL[medal] || INK_DIM) : 'rgba(255,255,255,0.14)';
      ctx.fillRect(px, y - 7, 5, 6);
    }
    // S11: a one-line explainer under PACE, the FIRST time it renders — so the medal
    // read is not a mystery abbreviation on your first sortie.
    if (pace.explain) {
      ctx.font = `600 11px ${MONO}`;
      const ex = 'the medal you are on pace for';
      ctx.fillStyle = SHADOW; ctx.fillText(ex, x + 0.6, y + 15.6);
      ctx.fillStyle = INK_DIM; ctx.fillText(ex, x, y + 15);
    }
  }

  // Capped, reduced-motion-suppressed kill flash (alpha decided upstream in
  // explosions.js so the cap is one authority). `at` is the exploding thing's screen
  // point, or null when it is off-screen/behind — and null draws NOTHING: a wash with
  // no visible source is exactly the "flashing randomly and im not sure why" report.
  //
  // History, because this surface has now been wrong twice in one day (2026-08-07):
  //   * It began as a flat rgba(255,196,120) full-view fill. At the 0.34 cap over the
  //     sector fogs that composites to RGB(104,80,56) — brown. Fixed in M14d: warm
  //     WHITE ink (saturation under 0.15 on every sector, held by test).
  //   * M14d kept the EXTENT: a bloom radius of 0.42 x the diagonal — most of the
  //     frame lit on every kill, one kill every ~3.5s of measured combat. Same-day
  //     operator report: "there is still a flash... super distracting". The genre
  //     reference (Star Fox) marks kills with local explosion glow, never a screen
  //     wash, and hard rule 8 already guarantees every kill a non-flash confirmation
  //     — so the bloom is LOCAL (KILL_BLOOM_FRAC, held ≤ 0.2 by test). The screen
  //     does not strobe; the kill point still pops.
  function drawFlash(alpha, at) {
    if (!(alpha > 0) || !at) return;
    const r = Math.hypot(vw, vh) * KILL_BLOOM_FRAC;
    const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
    g.addColorStop(0, `rgba(${FLASH_RGB},${alpha})`);
    g.addColorStop(0.35, `rgba(${FLASH_RGB},${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${FLASH_RGB},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
  }

  // Player-hurt flash — a red wash when the ship is damaged. Alpha (capped +
  // reduced-motion-suppressed) is decided upstream, same as the kill flash. This one
  // stays a full-screen wash on purpose: it is about YOU, not about a point in the
  // world, and red-over-everything is the read.
  function drawHurt(alpha) {
    if (!(alpha > 0)) return;
    ctx.fillStyle = `rgba(${HURT_RGB},${alpha})`;
    ctx.fillRect(0, 0, vw, vh);
  }

  // Hull as a row of segments, bottom-left. The COUNT (shape) is the primary read;
  // color is the accent (a11y — never color alone). Blinks while invulnerable so
  // the i-frame window is visible. Turns warning-red at two segments or fewer.
  function drawHull(hull, maxHull, invuln) {
    const segW = 15, segH = 12, gap = 3;
    // The label now sits INLINE-LEFT of the segments (art migration 2026-08-10 — the
    // approved HUD frame), so the readout is one row that cannot clip at the bottom
    // edge. The segments shift right by the label's width to make room.
    const labelX = 20, y = vh - 44;
    const low = hull <= 2;
    ctx.textBaseline = 'middle';
    ctx.font = `600 12px ${MONO}`;
    ctx.textAlign = 'left';
    const ly = y + segH / 2;
    ctx.fillStyle = SHADOW; ctx.fillText('HULL', labelX + 0.8, ly + 0.8);
    ctx.fillStyle = low ? WARN : HULL; ctx.fillText('HULL', labelX, ly);
    const x = labelX + ctx.measureText('HULL').width + LABEL_GAP;
    ctx.textBaseline = 'alphabetic';
    const blink = invuln > 0 ? 0.5 + 0.45 * Math.abs(Math.sin(invuln * 26)) : 1;
    for (let i = 0; i < maxHull; i++) {
      const sx = x + i * (segW + gap);
      ctx.fillStyle = SHADOW; ctx.fillRect(sx + 0.8, y + 0.8, segW, segH);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, y + 0.5, segW - 1, segH - 1);
      if (i < hull) {
        ctx.globalAlpha = blink;
        ctx.fillStyle = low ? WARN : HULL;
        ctx.fillRect(sx, y, segW, segH);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Damage-source attribution ("what hit me"), top-center, brief. A fairness law
  // (hard rule / DESIGN-SEED), not polish: you always know what got you. Warning
  // triangle + text (shape + color, never color alone).
  function drawCallout(hitBy) {
    if (!hitBy) return;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `700 15px ${MONO}`;
    const txt = 'HIT: ' + hitBy;
    const tw = ctx.measureText(txt).width;
    const tri = 16, gap = 8;
    const total = tri + gap + tw;
    const x0 = (vw - total) / 2, y = 66;
    // hollow warning triangle
    ctx.strokeStyle = WARN; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + tri / 2, y - 8); ctx.lineTo(x0 + tri, y + 7); ctx.lineTo(x0, y + 7); ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = WARN;
    ctx.fillRect(x0 + tri / 2 - 0.8, y - 3, 1.6, 6); ctx.fillRect(x0 + tri / 2 - 0.8, y + 5, 1.6, 1.6);
    // text
    const tx = x0 + tri + gap;
    ctx.fillStyle = SHADOW; ctx.fillText(txt, tx + 0.8, y + 0.8);
    ctx.fillStyle = WARN; ctx.fillText(txt, tx, y);
  }

  // The boss bar (M8) — top-center hull gauge for the run climax. The COUNT reads
  // carry it (a phase word + pip count, a hull fill with phase-boundary ticks), never
  // color alone (accessibility law). The telegraph is a filling warning band + an
  // "INCOMING" word so you can time the dodge without relying on a flash; the pulse is
  // suppressed under reduced motion, the warning itself is not.
  const BOSS_INK = HUD_PALETTE.BOSS_INK;
  function drawBoss(b) {
    if (!b || !b.active) return;   // it looms silently before the fight; bar appears on engage
    const barW = Math.min(HUD_LAYOUT.BOSS_BAR_CAP, vw * HUD_LAYOUT.BOSS_BAR_VW_FRAC);
    const x0 = (vw - barW) / 2;
    const y = 30, bh = 13;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 13px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText('BOSS', x0 + 0.8, y - 5 + 0.8);
    ctx.fillStyle = BOSS_INK; ctx.fillText('BOSS', x0, y - 5);

    // phase read: word + pip count (shape cue), top-right of the bar
    const phaseTxt = 'PHASE ' + b.phase + '/' + b.phaseCount;
    ctx.textAlign = 'right'; ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText(phaseTxt, x0 + barW + 0.6, y - 5 + 0.6);
    ctx.fillStyle = INK_DIM; ctx.fillText(phaseTxt, x0 + barW, y - 5);
    const pipW = 6, pipGap = 3;
    for (let i = 0; i < b.phaseCount; i++) {
      const px = x0 + barW - ctx.measureText(phaseTxt).width - 10 - (b.phaseCount - i) * (pipW + pipGap);
      ctx.fillStyle = i < b.phase ? BOSS_INK : 'rgba(255,255,255,0.14)';
      ctx.fillRect(px, y - 13, pipW, 7);
    }

    // hull bar
    ctx.fillStyle = SHADOW; ctx.fillRect(x0 + 0.8, y + 0.8, barW, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y + 0.5, barW - 1, bh - 1);
    const frac = Math.max(0, Math.min(1, b.maxHp > 0 ? b.hp / b.maxHp : 0));
    ctx.fillStyle = b.hitFlash > 0 ? '#ffd0a0' : (frac <= 0.34 ? WARN : BOSS_INK);
    ctx.fillRect(x0, y, barW * frac, bh);
    // phase-boundary ticks at the hull thirds (shape landmark, not color)
    for (let k = 1; k < b.phaseCount; k++) {
      const tx = x0 + barW * (1 - k / b.phaseCount);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(tx, y, 1.5, bh);
    }

    // telegraph warning band + "INCOMING" word (timing cue you can read w/o a flash)
    if (b.telegraph > 0) {
      const wy = y + bh + 6, wh = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, wy + 0.5, barW - 1, wh - 1);
      ctx.fillStyle = WARN;
      ctx.fillRect(x0, wy, barW * Math.max(0, Math.min(1, b.telegraph)), wh);
      const pulse = reducedMotion ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(b.telegraph * 9));
      // S7: name the pattern so the word tells you HOW to dodge, not just THAT to. The
      // 3D ghost lanes (drawn by the renderer) show WHERE; this labels WHICH.
      const KIND = { fan: 'FAN', pillars: 'PILLARS', aimed: 'AIMED' };
      const label = 'INCOMING' + (KIND[b.attackKind] ? '  ·  ' + KIND[b.attackKind] : '');
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 12px ${MONO}`;
      ctx.fillStyle = SHADOW; ctx.fillText(label, vw / 2 + 0.8, wy + 20 + 0.8);
      ctx.globalAlpha = pulse; ctx.fillStyle = WARN;
      ctx.fillText(label, vw / 2, wy + 20);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // Sector name, top-left — the M4 "where am I" readout. Small caps, high contrast
  // via the shadow pass so it reads over any sector atmosphere.
  function drawSector(name) {
    if (!name) return;
    const x = 20, y = 30;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 13px ${MONO}`;
    const label = name.toUpperCase();
    ctx.fillStyle = SHADOW; ctx.fillText(label, x + 0.8, y + 0.8);
    ctx.fillStyle = INK; ctx.fillText(label, x, y);
  }

  // Wingmate squad readout, top-left under the sector. Each wing is a tinted badge +
  // name; a lost wing dims and gets a hollow ring with an X (a11y: alive/lost is a
  // SHAPE, never color-only). This is the "coverage" the squad provides, made visible.
  function drawSquad(squad) {
    if (!squad || !squad.length) return;
    const x = 20, y0 = 50;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText('WING', x + 0.6, y0 + 0.6);
    ctx.fillStyle = INK_DIM; ctx.fillText('WING', x, y0);
    squad.forEach((w, i) => {
      const y = y0 + 15 + i * 16;
      const bx = x + 5;
      if (w.alive) {
        ctx.fillStyle = w.tint || INK;
        ctx.beginPath(); ctx.arc(bx, y, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        // hollow ring + X — the lost shape
        ctx.strokeStyle = INK_DIM; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(bx, y, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 2.4, y - 2.4); ctx.lineTo(bx + 2.4, y + 2.4);
        ctx.moveTo(bx + 2.4, y - 2.4); ctx.lineTo(bx - 2.4, y + 2.4); ctx.stroke();
      }
      ctx.font = `600 11px ${MONO}`;
      const nm = w.alive ? w.name : w.name + '  (down)';
      ctx.fillStyle = SHADOW; ctx.fillText(nm, x + 14 + 0.6, y + 0.6);
      ctx.fillStyle = w.alive ? INK : INK_DIM; ctx.fillText(nm, x + 14, y);
    });
  }

  // Transient wingmate callout — a radio caption near the bottom (above the meter),
  // fading out. Speaker in the wing's tint/accent, line in ink; distress/lost read
  // warm-warning, a rescue reads green. Text carries the meaning; color is accent.
  const CUE_COL = { distress: WARN, lost: WARN, rescued: HULL, spot: INK, launch: INK, streak: BOOST };
  function drawWingCallout(cue) {
    if (!cue || !(cue.alpha > 0)) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, cue.alpha));
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const y = vh - 80;
    const accent = CUE_COL[cue.kind] || INK;
    ctx.font = `700 12px ${MONO}`;
    const who = cue.speaker + ':';
    ctx.font = `600 13px ${MONO}`;
    const line = cue.line;
    // draw speaker (accent) + line (ink) centered as one row
    ctx.font = `700 12px ${MONO}`;
    const ww = ctx.measureText(who).width;
    ctx.font = `600 13px ${MONO}`;
    const lw = ctx.measureText(line).width;
    const total = ww + 8 + lw;
    const x0 = (vw - total) / 2;
    ctx.textAlign = 'left';
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText(who, x0 + 0.7, y + 0.7);
    ctx.fillStyle = accent; ctx.fillText(who, x0, y);
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText(line, x0 + ww + 8 + 0.7, y + 0.7);
    ctx.fillStyle = INK; ctx.fillText(line, x0 + ww + 8, y);
    ctx.restore();
  }

  // Pickup-grab confirmation — a brief floating "+HULL" / "+300" when a rescue
  // reward is collected. The TEXT (shape) carries the meaning; color is the accent
  // (repair green vs score cyan), so it is never color-only.
  function drawPickup(cue) {
    if (!cue || !(cue.alpha > 0)) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, cue.alpha));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 18px ${MONO}`;
    const y = vh * 0.42 - cue.rise;
    ctx.fillStyle = SHADOW; ctx.fillText(cue.text, vw / 2 + 0.8, y + 0.8);
    ctx.fillStyle = cue.repair ? HULL : INK; ctx.fillText(cue.text, vw / 2, y);
    ctx.restore();
  }

  // Ship-down state. Full run flow (results, medals) is M5; this is the honest M3
  // seam: name the cause, offer a restart. Warm register, plain English.
  function drawDeath(cause) {
    ctx.fillStyle = 'rgba(8,6,10,0.62)'; ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 40px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText('SHIP DOWN', vw / 2 + 1.2, vh / 2 - 8 + 1.2);
    ctx.fillStyle = WARN; ctx.fillText('SHIP DOWN', vw / 2, vh / 2 - 8);
    ctx.font = `500 16px ${MONO}`;
    ctx.fillStyle = INK; ctx.fillText('cause: ' + (cause || 'unknown'), vw / 2, vh / 2 + 22);
    ctx.font = `500 13px ${MONO}`;
    ctx.fillStyle = INK_DIM; ctx.fillText('press R to fly again', vw / 2, vh / 2 + 48);
  }

  // S11: a quiet one-time reminder that Esc opens options + the accessibility assists,
  // shown only on the first sortie. Top-center, clear of the score/pace and (on a normal
  // level) the boss bar. Text-only, high-contrast via the shadow pass.
  function drawEscHint() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 11px ${MONO}`;
    const t = 'Esc  ·  options and assists';
    ctx.fillStyle = SHADOW; ctx.fillText(t, vw / 2 + 0.6, 20.6);
    ctx.fillStyle = INK_DIM; ctx.fillText(t, vw / 2, 20);
    ctx.textAlign = 'left';
  }

  return {
    resize,
    setReducedMotion(v) { reducedMotion = v; },
    draw(state) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      // M12: the title screen lays a translucent overlay over the live scene, so the HUD
      // must be fully off (the always-drawn meter/score would otherwise leak through it).
      if (state.hidden) return;
      drawFlash(state.flash || 0, state.flashAt || null);
      drawHurt(state.hurt || 0);
      const alive = state.alive !== false;
      if (alive && state.reticle && state.reticle.visible) {
        drawReticle(state.reticle.x, state.reticle.y);
        drawCharge(state.reticle.x, state.reticle.y, state.charge || 0, state.chargeFull);
      }
      if (alive) drawLock(state.lock, state.chargeFull);
      if (alive) drawDeflect(state.deflect);
      drawMeter(state.meter, state.mode);
      if (state.maxHull) drawHull(state.hull, state.maxHull, state.invuln || 0);
      drawScore(state.score || 0, state.kills || 0);
      if (alive && state.pace) drawMedalPace(state.pace);
      drawSector(state.sector);
      if (alive && state.boss) drawBoss(state.boss);
      if (state.squad) drawSquad(state.squad);
      if (alive) drawWingCallout(state.wingCallout);
      if (alive) drawPickup(state.pickupCue);
      if (alive) drawCallout(state.hitBy);
      else drawDeath(state.cause);
      if (alive && state.escHint && !state.boss) drawEscHint();
    },
  };
}
