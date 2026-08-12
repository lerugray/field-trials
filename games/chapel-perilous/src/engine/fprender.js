// First-person dungeon renderer (M5), extracted so BOTH the game shell and the
// dev gallery draw crawl views through the identical path. Pure w.r.t. the DOM:
// it only touches the ctx handed in and takes `shadeColor(shade)` so it renders
// in any palette. Casts straight ahead from the crawler, drawing nested wall
// frames far→near, dressed in the dungeon's VISUAL REGISTER (shade palette,
// wall pattern, edge weight, floor lines) so different dungeons read distinct.

import { VEC, LEFT, RIGHT } from './dungeon.js';
import { styleFor, wallShadeAt } from './dungeonregister.js';
import { hash2 } from './prng.js';

// Fill a quad [p0..p3] then dress it with the register's wall pattern (clipped
// to the quad) and, for wireframe registers, stroke its outline.
export function drawWall(ctx, pts, fillShade, reg, shadeColor) {
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); };
  ctx.fillStyle = shadeColor(fillShade);
  path(); ctx.fill();

  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
  const step = Math.max(6, (b - t) / 5);
  if (reg.pattern !== 'none') {
    ctx.save(); path(); ctx.clip();
    ctx.strokeStyle = shadeColor(reg.accent); ctx.lineWidth = 1;
    ctx.fillStyle = shadeColor(reg.accent);
    if (reg.pattern === 'grid') {
      for (let y = t; y <= b; y += step) { ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke(); }
      for (let x = l; x <= r; x += step) { ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, b); ctx.stroke(); }
    }
    if (reg.pattern === 'brick') {
      // Approved-PoC coursed ashlar: fine deterministic stone tooth under tight
      // six-pixel beds, 22px running-bond head joints, lit block tops and shaded
      // bases. The old live uplift used five enormous courses per face, which read
      // as a schematic grid instead of masonry.
      for (let y = Math.floor(t); y <= b; y += 2) {
        for (let x = Math.floor(l); x <= r; x += 2) {
          const tooth = hash2(x >> 1, y >> 1, (fillShade * 0x9e37) ^ 0x4350);
          const delta = tooth < 0.22 ? -1 : tooth > 0.82 ? 1 : 0;
          ctx.fillStyle = shadeColor(Math.max(0, Math.min(6, fillShade + delta)));
          ctx.fillRect(x, y, 2, 2);
        }
      }
      const course = 6, block = 22;
      for (let y = Math.floor(t / course) * course; y <= b; y += course) {
        const row = Math.floor(y / course);
        ctx.strokeStyle = shadeColor(Math.max(0, fillShade - 3)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke();
        ctx.strokeStyle = shadeColor(Math.min(6, fillShade + 1));
        ctx.beginPath(); ctx.moveTo(l, y + 1); ctx.lineTo(r, y + 1); ctx.stroke();
        ctx.strokeStyle = shadeColor(Math.max(0, fillShade - 1));
        ctx.beginPath(); ctx.moveTo(l, y + course - 2); ctx.lineTo(r, y + course - 2); ctx.stroke();
        ctx.strokeStyle = shadeColor(Math.max(0, fillShade - 3));
        const off = (row & 1) ? block / 2 : 0;
        for (let x = Math.floor(l / block) * block + off; x <= r; x += block) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + course); ctx.stroke();
        }
      }
    }
    if (reg.pattern === 'hatch') {
      for (let x = l - (b - t); x <= r; x += step) { ctx.beginPath(); ctx.moveTo(x, b); ctx.lineTo(x + (b - t), t); ctx.stroke(); }
    }
    if (reg.pattern === 'stipple') {
      for (let y = t + step / 2; y <= b; y += step) for (let x = l + step / 2; x <= r; x += step) ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }
  if (reg.edge) { ctx.strokeStyle = shadeColor(reg.edgeShade); ctx.lineWidth = reg.edgeWidth; path(); ctx.stroke(); }
}

export function renderFP(ctx, W, H, run, shadeColor) {
  const { dungeon, crawl } = run;
  const reg = run.register || styleFor(dungeon.seed);
  const fv = VEC[crawl.facing];
  const lv = VEC[LEFT[crawl.facing]];
  const rv = VEC[RIGHT[crawl.facing]];
  const cx = W / 2;
  const cy = H / 2;
  const MAX = 6;
  const proj = (z) => { const s = 1 / (z + 1); return { l: cx - W * 0.5 * s, r: cx + W * 0.5 * s, t: cy - H * 0.5 * s, b: cy + H * 0.5 * s }; };

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // How far floor runs straight ahead (bounded by MAX).
  let depth = 0;
  for (; depth < MAX; depth++) {
    const tx = crawl.x + fv.dx * (depth + 1);
    const ty = crawl.y + fv.dy * (depth + 1);
    if (!dungeon.floorAt(tx, ty)) break;
  }

  // Draw each depth slice from far to near so nearer geometry overpaints.
  for (let z = depth; z >= 0; z--) {
    const o = proj(z);       // near edge of this slice
    const i = proj(z + 1);   // far edge of this slice
    const tx = crawl.x + fv.dx * z;
    const ty = crawl.y + fv.dy * z;
    ctx.fillStyle = shadeColor(reg.ceil);
    ctx.beginPath(); ctx.moveTo(o.l, o.t); ctx.lineTo(i.l, i.t); ctx.lineTo(i.r, i.t); ctx.lineTo(o.r, o.t); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shadeColor(reg.floor);
    ctx.beginPath(); ctx.moveTo(o.l, o.b); ctx.lineTo(i.l, i.b); ctx.lineTo(i.r, i.b); ctx.lineTo(o.r, o.b); ctx.closePath(); ctx.fill();
    const wallShade = wallShadeAt(reg, z, depth);
    const openL = dungeon.floorAt(tx + lv.dx, ty + lv.dy);
    const openR = dungeon.floorAt(tx + rv.dx, ty + rv.dy);
    if (!openL) drawWall(ctx, [[o.l, o.t], [i.l, i.t], [i.l, i.b], [o.l, o.b]], wallShade, reg, shadeColor);
    if (!openR) drawWall(ctx, [[o.r, o.t], [i.r, i.t], [i.r, i.b], [o.r, o.b]], wallShade, reg, shadeColor);
  }
  if (reg.floorLines) {
    ctx.strokeStyle = shadeColor(reg.edgeShade); ctx.lineWidth = 1;
    for (let z = 1; z <= depth + 1; z++) { const p = proj(z); ctx.beginPath(); ctx.moveTo(p.l, p.b); ctx.lineTo(p.r, p.b); ctx.stroke(); }
    const n = proj(0), f = proj(depth + 1);
    ctx.beginPath(); ctx.moveTo(n.l, n.b); ctx.lineTo(f.l, f.b); ctx.moveTo(n.r, n.b); ctx.lineTo(f.r, f.b); ctx.stroke();
  }
  // The terminal wall stands at the FAR edge of the last traversable slice.
  // Using proj(depth) placed it at the slice's near edge; at depth 0 that made
  // the wall a full-viewport rectangle which overpainted the ceiling, floor and
  // side faces and read like a crashed hatch screen. One projection step ahead
  // leaves those surrounding faces visible and gives even an immediate wall the
  // same perspective depth + register texture as the rest of the corridor.
  const e = proj(depth + 1);
  drawWall(ctx, [[e.l, e.t], [e.r, e.t], [e.r, e.b], [e.l, e.b]], wallShadeAt(reg, depth, depth), reg, shadeColor);
}
