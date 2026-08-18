// Pixel-bounds rerun of the verdict round's REHEARSAL + controller-notice probe.
// Run from the repository root:
//   node docs/verification/followups-2026-08-17/probe-two-overlay-collision.mjs

import { Painter, NATIVE } from '../../../src/render/px.js';
import { drawControllerNotice, drawRehearsal } from '../../../src/render/overlays.js';

function boundsOf(draw) {
  const p = new Painter(NATIVE.w, NATIVE.h);
  p.clear('#3399cc');
  const before = p.snapshot();
  draw(p);
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1, pixels = 0;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4;
    if (p.d[i] === before[i] && p.d[i + 1] === before[i + 1] && p.d[i + 2] === before[i + 2]) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y); pixels++;
  }
  return { x0, y0, x1, y1, pixels };
}

const rehearsal = boundsOf((p) => drawRehearsal(p, 9));
const controller = boundsOf((p) => drawControllerNotice(p, {
  headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY',
}));
const sharedY = Math.max(0, Math.min(rehearsal.y1, controller.y1) - Math.max(rehearsal.y0, controller.y0) + 1);
const report = {
  date: '2026-08-17',
  probe: 'two-overlay-collision',
  native: { width: NATIVE.w, height: NATIVE.h },
  rehearsal,
  controller,
  sharedY,
  pass: sharedY === 0,
};
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
