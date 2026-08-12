// menurender.js — draws the action menu overlay (Items/Weapons/Equipment/Strength). Reads the menu
// state machine (menu.js) and the stage as ctx. Surfaces the equip-comparison delta on the
// weapons/equipment tabs. Monospace UI text. The menu PAUSES play (enforced by the loop).

import { PALETTE } from './palette.js';
import { drawOpaqueScrimPanel } from './chrome.js';
import { TABS, TAB_LABEL, currentTab, entries, compareAt } from '../sim/menu.js';
import { drawIcon, weaponIconFor } from './assets.js';
import { drawPixelText, fitPixelText, textWidth } from './pixelfont.js';

function deltaStr(n) { return n > 0 ? `+${n}` : `${n}`; }

export function drawMenu(ctx, m, s, vw, vh) {
  // dim the world
  ctx.fillStyle = 'rgba(8,8,20,0.72)';
  ctx.fillRect(0, 0, vw, vh);

  // Carved-stone frame in the register (chunky beveled border).
  const px = 20, py = 20, pw = vw - 40, ph = vh - 40;
  drawOpaqueScrimPanel(ctx, px, py, pw, ph);

  // Tab headers — active tab sits on a torch-lit sunk plate.
  let tx = px + 8;
  for (let i = 0; i < TABS.length; i++) {
    const active = i === m.tab;
    if (active) {
      const tw = textWidth(TAB_LABEL[TABS[i]]) + 6;
      ctx.fillStyle = PALETTE['0']; ctx.fillRect(tx - 3, py + 5, tw, 12);
      ctx.fillStyle = PALETTE['0']; ctx.fillRect(tx - 2, py + 6, tw - 2, 10);
    }
    drawPixelText(ctx, TAB_LABEL[TABS[i]], tx, py + 9, active ? PALETTE['c'] : PALETTE['j']);
    tx += textWidth(TAB_LABEL[TABS[i]]) + 8;
  }
  // Divider rule under the tabs.
  ctx.fillStyle = PALETTE['0']; ctx.fillRect(px + 4, py + 20, pw - 8, 1);
  ctx.fillStyle = PALETTE['4']; ctx.fillRect(px + 4, py + 21, pw - 8, 1);

  // Entries.
  const rows = entries(m, s);
  const tab = currentTab(m);
  let ey = py + 34;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sel = i === m.cursor;
    let textColor = sel ? PALETTE['c'] : PALETTE['j'];
    if (sel) drawPixelText(ctx, '>', px + 8, ey - 6, textColor);
    let label = row.name;
    if (tab === 'items') label += `  x${row.count}`;
    if ((tab === 'weapons' || tab === 'equipment') && row.equipped) label = `[E] ${label}`;
    if (tab === 'strength') label = `${row.name}`.padEnd(11) + `  ${row.value}`;
    if (tab === 'moves') {
      textColor = sel ? PALETTE['c'] : (row.unlocked ? PALETTE['j'] : PALETTE['4']);
      label = `${row.name}`.padEnd(16) + `  ${row.value}`;
    }
    let labelX = px + 18;
    // Curated weapon icon for the weapons tab (falls back to text-only in headless tests).
    if (tab === 'weapons') {
      const iconId = weaponIconFor(row.id);
      if (drawIcon(ctx, iconId, px + 18, ey - 7)) labelX = px + 34;
    }
    const labelRight = (tab === 'weapons' || tab === 'equipment') ? px + pw - 98 : px + pw - 4;
    drawPixelText(ctx, fitPixelText(label, labelRight - labelX), labelX, ey - 6, textColor);
    ey += 12;
  }

  // Equip-comparison delta for the highlighted weapon/equipment row.
  const cmp = compareAt(m, s);
  if (cmp) {
    const bx = px + pw - 92, by = py + 34;
    drawPixelText(ctx, 'vs equipped', bx, by - 6, PALETTE['j']);
    const dmgColor = cmp.dmgDelta > 0 ? PALETTE['c'] : cmp.dmgDelta < 0 ? PALETTE['o'] : PALETTE['j'];
    drawPixelText(ctx, `DMG ${deltaStr(cmp.dmgDelta)}`, bx, by + 6, dmgColor);
    const defColor = cmp.defDelta > 0 ? PALETTE['c'] : cmp.defDelta < 0 ? PALETTE['o'] : PALETTE['j'];
    drawPixelText(ctx, `DEF ${deltaStr(cmp.defDelta)}`, bx, by + 18, defColor);
    if (cmp.kindChange) drawPixelText(ctx, '(kind change)', bx, by + 30, PALETTE['b']);
  }

  // Footer hint.
  const footer = '↑↓ select  ←→ tab  J confirm  Enter close';
  drawPixelText(ctx, footer, Math.round((vw - textWidth(footer)) / 2), py + ph - 14, PALETTE['j']);
}
