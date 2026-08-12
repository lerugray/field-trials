// hud.js — the HUD (DESIGN-SEED HUD field spec: HP, XP, gold, equipped weapon; NES-clean but
// complete). XP-at-risk / sub-weapon / charge fields arrive with their systems (M4/M5); the model
// carries placeholders so the layout is stable. hudModel() is pure and headless-testable; drawHud()
// is the browser renderer. UI text is monospace (permitted).

import { xpToNextLevel } from '../sim/stats.js';
import { xpAtRisk, markerHint } from '../sim/souls.js';
import { PALETTE, RAMPS } from './palette.js';
import { drawBoneNameplate, drawOpaqueScrimPanel, drawStonePanel } from './chrome.js';
import { drawIcon, weaponIconFor } from './assets.js';
import { drawPixelText, fitPixelText, textWidth } from './pixelfont.js';
import { materialRampKey } from './light.js';

export const BOTTOM_HUD_TEXT_KEY = 'j';
export const BOTTOM_HUD_SCRIM_KEY = '1';
export const BOTTOM_HUD_SCRIM_OPACITY = 1;
export const BOTTOM_HUD_CONTROL_TEXT = '←→/AD MOVE · K/SPACE JUMP · J ATTACK';
export const BOTTOM_HUD_UTILITY_TEXT = 'ENTER MENU · ESC OPTIONS · ↓ REST AT WAYPOINT';
export const BOTTOM_HUD_ASSIST_TEXT = 'STRUGGLING? ESC → ASSIST (HONEST HELP)';
export const MARKER_LABEL_TEXT = 'REST AT WAYPOINT';
export const MARKER_LABEL_TEXT_KEY = 'j';
export const MARKER_LABEL_SCRIM_KEY = '1';
export const MARKER_LABEL_SCRIM_OPACITY = 1;
export const WAYPOINT_FLOATER_KIND = 'waypoint';

/** The marker plate owns waypoint feedback while it is visible. Keep the floater alive off-screen
 * so leaving plate range before its normal expiry restores the exact existing animation state. */
export function floaterRenderModel(floaters, markerLabel) {
  if (!markerLabel) return floaters;
  return floaters.filter((floater) => floater.kind !== WAYPOINT_FLOATER_KIND);
}

/** Pure shipped view-model for the persistent bottom input hints. Keeping the state decision beside
 * the renderer lets gates drive the exact behavior used by boot.js instead of grepping a call site. */
export function bottomHudModel(mode, game) {
  if (mode !== 'play' || !game || game.cleared) return Object.freeze([]);
  const lines = [];
  if (!game.settings?.assist && game.deaths >= 3) lines.push(BOTTOM_HUD_ASSIST_TEXT);
  lines.push(BOTTOM_HUD_CONTROL_TEXT, BOTTOM_HUD_UTILITY_TEXT);
  return Object.freeze(lines);
}

/** Pure geometry for the bottom input-hint chrome, shared by render tests/proof tooling. */
export function bottomHudLayout(logicalW, logicalH, lineCount = 1) {
  const lines = Math.max(1, Math.floor(lineCount));
  const h = 12 + (lines - 1) * 8;
  return Object.freeze({ x: 4, y: logicalH - h - 2, w: logicalW - 8, h, textY: logicalH - h + 1 });
}

/** Carved bottom chrome with an opaque recessed channel: terrain luminance cannot enter the text
 * contrast calculation, including the brightest keep face. */
export function drawBottomHud(ctx, lines, logicalW, logicalH) {
  const content = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).map(String);
  const layout = bottomHudLayout(logicalW, logicalH, content.length);
  drawOpaqueScrimPanel(ctx, layout.x, layout.y, layout.w, layout.h, { fillKey: BOTTOM_HUD_SCRIM_KEY });
  for (let index = 0; index < content.length; index++) {
    const text = fitPixelText(content[index], layout.w - 12);
    const x = Math.round(logicalW / 2 - textWidth(text) / 2);
    drawPixelText(ctx, text, x, layout.textY + index * 8, PALETTE[BOTTOM_HUD_TEXT_KEY]);
  }
  return layout;
}

/** Contextual waypoint copy. This is display-only: markerHint supplies the same horizontal
 * distance query used by the death-marker HUD without changing checkpoint/rest mechanics. */
export function markerLabelModel(game) {
  if (!game?.player || !game?.camera || !game?.checkpoints?.length) return null;
  let nearest = null;
  for (const checkpoint of game.checkpoints) {
    const hint = markerHint(checkpoint, game.player.x);
    if (!nearest || hint.dist < nearest.hint.dist) nearest = { checkpoint, hint };
  }
  if (!nearest || nearest.hint.dist > 18 || Math.abs(nearest.checkpoint.y - game.player.y) > 32) return null;
  return Object.freeze({
    text: MARKER_LABEL_TEXT,
    anchorX: Math.round(nearest.checkpoint.x - game.camera.x),
    anchorY: Math.round(nearest.checkpoint.y - game.camera.y - 28),
  });
}

/** Pure collision-safe geometry for the compact world-marker plate. bottomHudY is the top edge of
 * the live one- or two-line persistent bar, so the two chrome surfaces can never overlap. */
export function markerLabelLayout(text, anchorX, anchorY, logicalW, bottomHudY) {
  const fitted = fitPixelText(String(text), logicalW - 20);
  const w = textWidth(fitted) + 12;
  const h = 12;
  const x = Math.max(4, Math.min(logicalW - w - 4, Math.round(anchorX - w / 2)));
  const y = Math.max(4, Math.min(bottomHudY - h - 2, Math.round(anchorY - h - 4)));
  return Object.freeze({ x, y, w, h, text: fitted, textY: y + 3 });
}

/** Opaque recessed marker-label channel in the same carved register as the bottom HUD. */
export function drawMarkerLabel(ctx, model, logicalW, bottomHudY) {
  const layout = markerLabelLayout(model.text, model.anchorX, model.anchorY, logicalW, bottomHudY);
  drawOpaqueScrimPanel(ctx, layout.x, layout.y, layout.w, layout.h, { fillKey: MARKER_LABEL_SCRIM_KEY });
  const textX = Math.round(layout.x + layout.w / 2 - textWidth(layout.text) / 2);
  drawPixelText(ctx, layout.text, textX, layout.textY, PALETTE[MARKER_LABEL_TEXT_KEY]);
  return layout;
}

function hudPixelGlow(ctx, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  for (let radius = 4; radius >= 1; radius--) {
    ctx.globalAlpha = 0.035 + (4 - radius) * 0.025;
    ctx.fillRect(x - radius, y - Math.floor(radius / 2), radius * 2 + 1, radius + 1);
  }
  ctx.restore();
}

/** Pure view-model of the HUD fields for a game state. */
export function hudModel(game) {
  const { progress, loadout } = game;
  const maxHP = progress.stats.maxHP;
  return {
    hp: progress.hp,
    maxHP,
    hpPct: Math.max(0, Math.min(1, progress.hp / maxHP)),
    level: progress.level,
    xp: progress.totalXp,
    xpToNext: xpToNextLevel(progress.totalXp),
    xpAtRisk: xpAtRisk(progress),
    gold: game.gold,
    weaponName: loadout.weapon.name,
    bare: !!loadout.weapon.bare,
    marker: game.marker ? { xp: game.marker.xp, ...markerHint(game.marker, game.player.x) } : null,
  };
}

/** Draw the HUD to the logical 2d context. */
export function drawHud(ctx, game, logicalW) {
  const m = hudModel(game);
  const reduce = !!game.settings?.reduceEffects;

  // Left stats panel: carved stone chrome behind the HP/XP/risk/marker fields. Its height grows with
  // the optional risk/marker lines so the border always wraps the content.
  const extra = (m.xpAtRisk > 0 ? 10 : 0) + (m.marker ? 10 : 0);
  drawStonePanel(ctx, 4, 4, 92, 40 + extra);

  // HP meter: recessed trough, ordered ramp fill, lit cap, specular head, and quantity ticks.
  const barX = 10, barY = 10, barW = 78, barH = 7;
  ctx.fillStyle = PALETTE['0'];
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = PALETTE['1'];
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = PALETTE['0']; ctx.globalAlpha = 0.82; ctx.fillRect(barX, barY, barW, 1); ctx.globalAlpha = 1;
  const fillW = Math.round(barW * m.hpPct);
  for (let y = 0; y < barH; y++) for (let x = 0; x < fillW; x++) {
    const amount = 0.28 + x / Math.max(1, barW - 1) * 0.64 - y / barH * 0.30;
    ctx.fillStyle = PALETTE[materialRampKey(RAMPS.blood, Math.max(0, Math.min(1, amount)), barX + x, barY + y)];
    ctx.fillRect(barX + x, barY + y, 1, 1);
  }
  if (fillW > 0) {
    ctx.fillStyle = PALETTE['o']; ctx.globalAlpha = 0.62; ctx.fillRect(barX, barY, fillW, 1); ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE['p']; ctx.fillRect(barX + fillW - 1, barY + 1, 1, barH - 1);
    if (!reduce) hudPixelGlow(ctx, barX + fillW - 1, barY + Math.floor(barH / 2), PALETTE['o']);
  }
  ctx.fillStyle = PALETTE['0']; ctx.globalAlpha = 0.38;
  for (let x = 8; x < barW; x += 8) ctx.fillRect(barX + x, barY + barH - 2, 1, 2);
  ctx.globalAlpha = 1;

  drawIcon(ctx, 'icon_heart', barX, barY + barH + 8 - 7);
  drawPixelText(ctx, fitPixelText(`HP ${m.hp}/${m.maxHP}`, 70), barX + 12, barY + barH + 2, PALETTE['5']);

  // Level + XP.
  const nextText = fitPixelText(m.xpToNext > 0 ? `NEXT ${m.xpToNext}` : 'MAX', 54);
  const nextX = 93 - textWidth(nextText); // align the changing digits to the panel's right inset
  drawPixelText(ctx, fitPixelText(`LV ${m.level}`, nextX - barX - 3), barX, barY + barH + 12, PALETTE['c']);
  drawPixelText(ctx, nextText, nextX, barY + barH + 12, PALETTE['4']);

  // XP-at-risk counter (what a death would drop) — legibility fold.
  let row = barY + barH + 28;
  if (m.xpAtRisk > 0) {
    drawPixelText(ctx, fitPixelText(`RISK ${m.xpAtRisk}`, 82), barX, row - 6, PALETTE['n']); row += 10;
  }

  // Death-marker indicator: arrow toward the marker + XP it holds.
  if (m.marker) {
    const arrow = m.marker.dir < 0 ? '<' : '>';
    drawPixelText(ctx, fitPixelText(`${arrow} MARK ${m.marker.xp}`, 82), barX, row - 6, PALETTE['u']);
  }

  // Right chrome: gold + equipped-weapon panel.
  drawStonePanel(ctx, logicalW - 90, 4, 86, 26);
  const rightX = logicalW - 86;
  drawIcon(ctx, 'icon_coin', rightX, 14 - 7);
  drawPixelText(ctx, fitPixelText(`GLD ${m.gold}`, 67), rightX + 12, 8, PALETTE['b']);
  drawBoneNameplate(ctx, rightX - 1, 18, 80, 9);
  // Equipped weapon — bare hands is flagged loudly (never a silent default).
  const weaponColor = m.bare ? PALETTE['o'] : PALETTE['9'];
  const weaponText = m.bare ? '! BARE HANDS' : m.weaponName.toUpperCase();
  const iconId = weaponIconFor(game.loadout.weapon.id);
  // Fixed-width pixel text is a touch wider than the old anti-aliased font. Keep long unique names
  // inside the panel by reserving the icon gutter only when both icon and label fit.
  if (!m.bare && textWidth(weaponText) <= 65 && drawIcon(ctx, iconId, rightX, 24 - 7)) {
    drawPixelText(ctx, weaponText, rightX + 14, 18, weaponColor);
  } else {
    drawPixelText(ctx, fitPixelText(weaponText, 79), rightX, 18, weaponColor);
  }
}
