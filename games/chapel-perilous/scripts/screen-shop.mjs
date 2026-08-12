// one-off shop-interior proof for LANE-REPORT-SHOPS-2026-08-04
// Run: node scripts/screen-shop.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeFrame, frameDisplay } from '../src/engine/frame.js';
import { CANVAS_H, CANVAS_W, stripSeed } from '../src/engine/layout.js';
import { buildPanel, buildKeybar } from '../src/engine/chrome.js';
import { assembleCity } from '../src/engine/city.js';
import { createCityLife } from '../src/engine/citylife.js';
import { createSession } from '../src/engine/session.js';
import { createChargen } from '../src/engine/chargen.js';
import { createShop } from '../src/engine/shop.js';
import shopRegister from '../data/register/shop.json' with { type: 'json' };
import { buildShopDrawList } from '../src/engine/panels.js';
import { createProse } from '../src/engine/prose.js';
import { createBusts, bustArtId } from '../src/engine/bustart.js';
import { createTileArt } from '../src/engine/tileart.js';
import { drawTile } from '../src/engine/tiledraw.js';
import { createServices } from '../src/engine/services.js';
import { createNames } from '../src/engine/names.js';

import palettesData from '../data/palettes.json' with { type: 'json' };
import { createPalettes } from '../src/engine/palette.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import cityRegister from '../data/register/city.json' with { type: 'json' };
import pools from '../data/register/pools.json' with { type: 'json' };
import phonemes from '../data/register/phonemes.json' with { type: 'json' };
import { SHADE_LEVELS } from '../src/engine/tiles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'screenshots');
const VP_W = 1440, VP_H = 900;
const DATE = '2026-08-04';

const FRAME = computeFrame(VP_W, VP_H);
const SCENE = FRAME.scene, PANEL = FRAME.panel, CON = FRAME.console;

const PAL = createPalettes(palettesData);
const SCHEME = PAL.defaultId;
const shade = (s) => PAL.shadeToColor(SCHEME, s);
const accent = (t = 1) => PAL.accentColor(SCHEME, t);
const names = createNames(phonemes);
const prose = createProse(pools);
const services = createServices(cityRegister, { prose, names });

function svgCtx() {
  const els = [];
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace', textAlign: 'left' };
  const stack = [];
  let tx = 0, ty = 0;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const op = (a = st.globalAlpha) => (a < 1 ? ` opacity="${a}"` : '');
  const fontPx = () => { const m = /(\d+(?:\.\d+)?)px/.exec(st.font); return m ? parseFloat(m[1]) : 14; };
  let pend = null;
  const flush = () => {
    if (!pend) return;
    els.push(`<rect x="${r(pend.x)}" y="${r(pend.y)}" width="${r(pend.w)}" height="${r(pend.h)}" fill="${pend.fill}"${op(pend.a)}/>`);
    pend = null;
  };
  const ctx = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    save() { stack.push({ ...st, tx, ty }); },
    restore() { const s = stack.pop(); if (s) { Object.assign(st, s); tx = s.tx; ty = s.ty; } },
    translate(x, y) { tx += x; ty += y; },
    clip() {},
    fillRect(x, y, w, h) {
      const fill = typeof st.fillStyle === 'string' ? st.fillStyle : '#000';
      const a = st.globalAlpha, X = x + tx, Y = y + ty;
      if (pend && pend.fill === fill && pend.a === a && Math.abs(pend.y - Y) < 0.5 && Math.abs(pend.h - h) < 0.5 && Math.abs(pend.x + pend.w - X) < 1e-6) { pend.w += w; return; }
      flush(); pend = { x: X, y: Y, w, h, fill, a };
    },
    strokeRect(x, y, w, h) { flush(); els.push(`<rect x="${r(x + tx)}" y="${r(y + ty)}" width="${r(w)}" height="${r(h)}" fill="none" stroke="${st.strokeStyle}" stroke-width="${st.lineWidth}"${op()}/>`); },
    beginPath() { flush(); path = []; },
    moveTo(x, y) { path.push(`M${r(x + tx)} ${r(y + ty)}`); },
    lineTo(x, y) { path.push(`L${r(x + tx)} ${r(y + ty)}`); },
    closePath() { path.push('Z'); },
    fill() { flush(); if (path.length) els.push(`<path d="${path.join(' ')}" fill="${typeof st.fillStyle === 'string' ? st.fillStyle : '#000'}"${op()}/>`); },
    stroke() { flush(); if (path.length) els.push(`<path d="${path.join(' ')}" fill="none" stroke="${st.strokeStyle}" stroke-width="${st.lineWidth}"${op()}/>`); },
    fillText(t, x, y) { flush(); els.push(`<text x="${r(x + tx)}" y="${r(y + ty)}" font-family="monospace" font-size="${fontPx()}" fill="${typeof st.fillStyle === 'string' ? st.fillStyle : '#000'}" text-anchor="${st.textAlign === 'center' ? 'middle' : 'start'}"${op()}>${esc(t)}</text>`); },
    measureText(t) { return { width: String(t).length * fontPx() * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  function r(n) { return Math.round(n * 100) / 100; }
  return { ctx, els, flush };
}

function paintRows(ctx, rows) {
  const map = { hue: shade(6), dim: shade(3), faint: shade(2), accent: accent() };
  for (const r of rows) {
    ctx.fillStyle = map[r.color] || r.color || '#fff';
    ctx.font = `${r.size}px monospace`;
    ctx.fillText(r.text, r.x, r.y);
  }
}

function centered(ctx, fn) {
  const ox = SCENE.x + Math.max(0, Math.round((SCENE.w - CANVAS_W) / 2));
  const oy = SCENE.y + Math.max(0, Math.round((SCENE.h - CANVAS_H) / 2));
  ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore();
}

function drawBust(ctx, busts, id, px, py, size) {
  const art = createTileArt();
  const grid = busts.get(bustArtId(id)) || busts.get('HERO');
  if (!grid) return;
  ctx.fillStyle = shade(0); ctx.fillRect(px - 3, py - 3, size + 6, size + 6);
  let h = 0x9e37; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 131) + id.charCodeAt(i)) >>> 0;
  const d = { wx: 0, wy: 0, seed: h, amp: 0.7, levels: SHADE_LEVELS, sub: 2 };
  drawTile(ctx, grid, px, py, size, shade, d);
  ctx.strokeStyle = shade(5); ctx.lineWidth = 2; ctx.strokeRect(px - 3, py - 3, size + 6, size + 6);
}

function paintPanel(ctx, { cue, place }) {
  ctx.save();
  ctx.globalAlpha = 0.92; ctx.fillStyle = shade(0); ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  ctx.globalAlpha = 1; ctx.strokeStyle = shade(2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PANEL.x + 0.5, PANEL.y); ctx.lineTo(PANEL.x + 0.5, PANEL.y + PANEL.h); ctx.stroke();
  ctx.restore();
  const groups = [
    { heading: 'the stranger', color: 'hue', lines: ['The Stranger', '♥ 10/10 vital', 'you walk alone'] },
    { heading: 'where', color: 'dim', lines: place },
    { heading: 'the record', color: 'faint', lines: ['deaths 0', 'cleared 0'] },
  ];
  const rows = buildPanel({ cue, groups, width: PANEL.w, height: PANEL.h });
  ctx.save(); ctx.translate(PANEL.x, PANEL.y); paintRows(ctx, rows); ctx.restore();
}

function paintConsole(ctx, { mode, statusLine }) {
  ctx.save();
  ctx.globalAlpha = 0.92; ctx.fillStyle = shade(0); ctx.fillRect(CON.x, CON.y, CON.w, CON.h);
  ctx.globalAlpha = 1; ctx.strokeStyle = shade(2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CON.x, CON.y + 0.5); ctx.lineTo(CON.x + CON.w, CON.y + 0.5); ctx.stroke();
  ctx.restore();
  const kb = buildKeybar({ mode, width: CON.w });
  ctx.save(); ctx.translate(CON.x, CON.y); paintRows(ctx, kb); ctx.restore();
  ctx.save(); ctx.fillStyle = shade(5); ctx.font = '13px monospace';
  ctx.fillText(stripSeed(statusLine).slice(0, 120), CON.x + 14, CON.y + 24); ctx.restore();
}

function screenShop() {
  const { ctx, els, flush } = svgCtx();
  const c = assembleCity({ seed: 20260804, archetype: 'market' });
  const life = createCityLife(c, { seed: c.seed, names, prose, cityRegister });
  const b = c.buildings.find((x) => x.service === 'shop') || c.buildings[0];
  const ident = life.identity(b);
  const svc = cityRegister.services[b.service] || {};

  const chargen = createChargen(chargenData);
  const session = createSession({ chargen, seed: 20260804 });
  session.setMoney(5);
  session.addItem({ name: '[SEED] a ration of grey bread', tags: ['food'] });
  session.addItem({ name: '[SEED] a corroded key' });

  const shop = createShop(shopRegister);
  const epoch = Math.floor(0 / 1200);
  const stock = shop.stockFor(b.id, c.seed, epoch, c.archetype, session);
  const sellOffer = shop.makeSellOffer(session.inventory, b.id, c.seed, epoch);

  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  centered(ctx, () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const rows = buildShopDrawList({
      name: `${stripSeed(svc.name || b.service)} — kept by ${ident.proprietor}`,
      greeting: ident.line,
      stock,
      sellOffer,
      money: session.money,
      moneyLabel: shopRegister.currency.single,
      selectedIndex: -1,
      message: '',
    });
    paintRows(ctx, rows);
    const busts = createBusts();
    const box = { x: CANVAS_W - 128, y: 44, size: 108 };
    drawBust(ctx, busts, 'HERO', box.x, box.y, box.size);
  });
  paintPanel(ctx, { cue: 'TRADE', place: [stripSeed(c.name || 'a walled town'), stripSeed(svc.name || b.service)] });
  paintConsole(ctx, { mode: 'building', statusLine: `${stripSeed(svc.name || b.service)} · ${b.service} — number keys buy · [S] offers · [Esc] street` });
  flush();
  return els;
}

function frame(title, els) {
  const { cssW, cssH, fillW, fillH } = frameDisplay(VP_W, VP_H);
  const sx = cssW / FRAME.W, sy = cssH / FRAME.H;
  const cx = Math.round((VP_W - cssW) / 2), cy = Math.round((VP_H - cssH) / 2);
  const pct = `${(fillW * 100).toFixed(1)}%×${(fillH * 100).toFixed(1)}%`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${VP_W}" height="${VP_H}" viewBox="0 0 ${VP_W} ${VP_H}">
  <rect width="${VP_W}" height="${VP_H}" fill="#000"/>
  <text x="16" y="28" font-family="monospace" font-size="16" fill="#888">${title} — viewport ${VP_W}×${VP_H}, composed surface fills ${pct} of the window</text>
  <g transform="translate(${cx} ${cy}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">
    <rect x="0" y="0" width="${FRAME.W}" height="${FRAME.H}" fill="#000"/>
    ${els.join('\n    ')}
    <rect x="0" y="0" width="${FRAME.W}" height="${FRAME.H}" fill="none" stroke="#333" stroke-width="1"/>
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
const file = join(OUT, `${DATE}-shop-interior-1440x900.svg`);
writeFileSync(file, frame(`${DATE} shop interior — seeded stock + sell offers`, screenShop()));
console.log(`wrote ${file}`);
