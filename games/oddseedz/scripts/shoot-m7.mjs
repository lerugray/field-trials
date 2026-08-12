// shoot-m7 — proves the M7 70-species archetype pass. Bundles the real render +
// roster modules (same strip-and-concat the single-file build uses), draws the
// WHOLE roster as a labelled 10x7 grid in a real browser, and captures it at a
// fixed viewport. A second scene poses three different-archetype creatures mid
// clash (attack/hit + affinity VFX) to show the rigs read apart in battle.
// Dev tooling only — no assets shipped; node_modules gitignored.

import { chromium } from 'playwright';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/screenshots');
const DATE = process.argv[2] || 'undated';

const IMPORT_RE = /^\s*import\s+[^;]*?from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
function strip(src) {
  return src
    .replace(IMPORT_RE, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^(\s*)export\s+(?=(async\s+)?(function|const|let|var|class)\b)/gm, '$1');
}

async function bundle() {
  // dependency order: rng first (creature depends on it), roster is standalone.
  const files = ['src/engine/rng.js', 'src/data/roster.js', 'src/render/creature.js'];
  const parts = [];
  for (const f of files) parts.push(`// ===== ${f} =====\n` + strip(await readFile(resolve(ROOT, f), 'utf8')).trim());
  return parts.join('\n\n');
}

const PAGE = (bundled) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#171226;color:#efeaff;font:14px system-ui,sans-serif}
  canvas{display:block}
</style></head><body>
<script type="module">
${bundled}

const RARITY_FRAME = { common:'#6b6480', uncommon:'#4fae6a', rare:'#4f8fd6', epic:'#b06fd6', legendary:'#e0b24a' };

function cell(ctx, s, x, y, w, h, t) {
  const creature = { name:s.name, species:{ id:s.id, name:s.name, archetype:s.archetype, hue:s.hue, traits:s.traits }, rarity:s.rarity, stats:{pow:30,def:30,spd:30,sta:30,foc:30}, variant:(s.hue*2654435761)>>>0, seed: s.id.length };
  // rarity frame card
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.strokeStyle = RARITY_FRAME[s.rarity] || '#666';
  ctx.lineWidth = 2;
  roundRect(ctx, x+4, y+4, w-8, h-8, 12); ctx.fill(); ctx.stroke();
  drawCreature(ctx, creature, t, { cx: x + w/2, cy: y + h*0.44, scale: 0.5 });
  ctx.fillStyle = '#efeaff'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign='center';
  ctx.fillText(s.name, x + w/2, y + h - 12);
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

const cols = 10, rows = 7, cw = 128, ch = 150, pad = 16;
const W = cols*cw + pad*2, H = rows*ch + pad*2 + 40;
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
const ctx = cv.getContext('2d');
ctx.fillStyle = '#171226'; ctx.fillRect(0,0,W,H);
ctx.fillStyle = '#efeaff'; ctx.font = 'bold 20px system-ui'; ctx.textAlign='left';
ctx.fillText('The 70 Buddies — archetype rigs x palettes x species traits', pad, 28);
const t = 900;
SPECIES.forEach((s, i) => {
  const c = i % cols, r = Math.floor(i / cols);
  cell(ctx, s, pad + c*cw, 44 + r*ch, cw, ch, t + i*130);
});
window.__ready = true;
</script>
</body></html>`;

// A battle scene: three cross-archetype clashes, attacker lunging + defender
// recoiling, with the attacker's affinity VFX bursting between them. Proves the
// poses/VFX and that 3+ archetypes read apart in the ring.
const BATTLE_PAGE = (bundled) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#12101f;color:#efeaff;font:14px system-ui,sans-serif}
  canvas{display:block}
</style></head><body>
<script type="module">
${bundled}
function creatureOf(id){ const s = SPECIES.find(x=>x.id===id); return { name:s.name, species:{id:s.id,name:s.name,archetype:s.archetype,hue:s.hue,traits:s.traits}, rarity:s.rarity, stats:{pow:40,def:40,spd:40,sta:40,foc:40}, variant:(s.hue*2654435761)>>>0, seed:s.id.length }; }
const ROWS = [ ['dragon','octopus'], ['robot','phoenix'], ['tree','beholder'] ];
const W=1000,H=780; const cv=document.createElement('canvas'); cv.width=W; cv.height=H; document.body.appendChild(cv);
const ctx=cv.getContext('2d'); const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#241c3a'); g.addColorStop(1,'#12101f'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
ctx.fillStyle='#efeaff'; ctx.font='bold 20px system-ui'; ctx.textAlign='left';
ctx.fillText('Battle poses + affinity VFX — three cross-archetype clashes', 24, 30);
ROWS.forEach((row,i)=>{
  const cy = 150 + i*220; const ax=300, dx=700;
  const A=creatureOf(row[0]), D=creatureOf(row[1]);
  drawCreature(ctx, A, 1000+i*200, { cx:ax, cy, scale:1.05, pose:'attack', poseT:0.55, facing:1 });
  drawCreature(ctx, D, 1200+i*200, { cx:dx, cy, scale:1.05, pose:'hit', poseT:0.4, facing:-1 });
  const v = vfxForCreature(A);
  drawVfx(ctx, v.family, (ax+dx)/2+40, cy-10, 0.55, { scale:1.4, hue:v.hue });
  ctx.fillStyle='#cfc8e8'; ctx.font='13px system-ui'; ctx.textAlign='center';
  ctx.fillText(A.name+' ('+A.species.archetype+')  vs  '+D.name+' ('+D.species.archetype+')  —  '+v.family, (ax+dx)/2, cy+120);
});
window.__ready=true;
</script></body></html>`;

async function shoot(browser, html, name, vw, vh) {
  const tmp = resolve(ROOT, `dist/_${name}.html`);
  await writeFile(tmp, html, 'utf8');
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForFunction('window.__ready === true', { timeout: 8000 });
  await page.waitForTimeout(200);
  const cv = await page.$('canvas');
  await cv.screenshot({ path: resolve(OUT, `${DATE}-${name}.png`) });
  await page.close();
  await rm(tmp, { force: true });
  return errors;
}

async function run() {
  await mkdir(OUT, { recursive: true });
  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  const bundled = await bundle();
  const browser = await chromium.launch();
  const e1 = await shoot(browser, PAGE(bundled), 'm7-roster-grid', 1300, 1120);
  const e2 = await shoot(browser, BATTLE_PAGE(bundled), 'm7-battle-poses', 1000, 780);
  await browser.close();
  const errors = [...e1, ...e2];
  console.log('shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 5));
}
run().catch((e) => { console.error(e); process.exit(1); });
