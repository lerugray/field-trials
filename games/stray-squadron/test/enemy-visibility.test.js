import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyMesh, ENEMY_PALETTE, ENEMY_HAZE } from '../src/gfx/enemymesh.js';
import { shadeFace, viewDistForRange, fogFraction } from '../src/gfx/shading.js';
import { SECTORS } from '../src/world/sectors.js';
import { GUNNER_FIRE } from '../src/combat/enemies.js';
import { LOCK } from '../src/combat/lockon.js';
import { CAM } from '../src/flight/camera.js';
import { contrastRatio, MIN_CONTRAST_NONTEXT } from '../src/ui/legibility.js';

// If you have to see a thing to survive it, it owes you contrast. WCAG 2.1 puts
// "graphical objects required to understand the content" at 3:1 — not the 4.5:1 text
// bar, which would be the wrong import for a silhouette against a 3D backdrop — and an
// enemy you must spot to dodge or shoot is squarely that object. So MIN_CONTRAST_NONTEXT
// is the floor here, and it applies at the ranges where an enemy is ALLOWED TO ACT:
// GUNNER_FIRE.rangeS (it can shoot you) and LOCK.rangeS (you can lock it).
//
// Before this change the build measured 1.5:1 at the firing range in a headless capture
// — half the floor — and the operator reported enemies were still hard to make out.
// Everything below is computed from the REAL sources: the built mesh's own faces and
// colours, the real engagement constants, the real camera rig, the real sector fogs.

const rgb255 = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;

// Rail banking rolls the whole frame about the forward axis, so which face of the nose
// catches the light rotates with it. Sweep that freedom and keep the WORST case.
function rollFrame(n, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]];
}

// The brightest face of a real enemy mesh at `rangeS`, and its contrast against the
// haze it hangs in — at the least favourable bank angle.
function worstCaseRead(variant, sector, rangeS, farMul) {
  const mesh = createEnemyMesh(variant);
  const fog = sector.fog;
  const viewDist = viewDistForRange(rangeS, CAM.shipLead, CAM.back);
  const far = fog.far * farMul;
  const bg = rgb255(fog.color);
  let worst = Infinity, worstFace = null;
  for (let step = 0; step < 24; step++) {
    const a = (step / 24) * Math.PI * 2;
    let best = -Infinity, bestFace = null;
    for (let t = 0; t < mesh.triCount; t++) {
      const i = t * 9;
      const n = rollFrame([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]], a);
      const col = [mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2]];
      const shaded = shadeFace(col, n, fog.color, viewDist, fog.near, far);
      const c = contrastRatio(rgb255(shaded), bg);
      if (c > best) { best = c; bestFace = shaded; }
    }
    if (best < worst) { worst = best; worstFace = bestFace; }
  }
  return { contrast: worst, face: worstFace, viewDist, fogF: fogFraction(viewDist, fog.near, far) };
}

for (const variant of ['drone', 'turret']) {
  test(`a ${variant} clears the visibility floor everywhere it is allowed to shoot`, () => {
    for (const sector of SECTORS) {
      for (const [what, rangeS] of [['gunner fire', GUNNER_FIRE.rangeS], ['lock-on', LOCK.rangeS]]) {
        const r = worstCaseRead(variant, sector, rangeS, ENEMY_HAZE.farMul);
        assert.ok(r.contrast >= MIN_CONTRAST_NONTEXT,
          `${variant} in ${sector.id} at ${what} range ${rangeS} (${r.viewDist} units into the haze, ` +
          `${Math.round(r.fogF * 100)}% fogged): contrast ${r.contrast.toFixed(2)} < ${MIN_CONTRAST_NONTEXT}`);
      }
    }
  });
}

test('the shipped build would have FAILED this floor — the numbers, not a vibe', () => {
  // The palette and haze as they stood when the operator said "still hard to tell".
  const before = { HULL: [0.52, 0.16, 0.15], HULL_LIT: [0.68, 0.24, 0.18], FIN: [0.78, 0.36, 0.16], NOSE: [0.80, 0.30, 0.22] };
  const ashfall = SECTORS.find((s) => s.id === 'ashfall');
  const viewDist = viewDistForRange(GUNNER_FIRE.rangeS, CAM.shipLead, CAM.back);
  const bg = rgb255(ashfall.fog.color);
  // best possible case for the old build: its brightest colour, a perfectly lit face,
  // and no haze relief at all
  const lit = shadeFace(before.NOSE, [0, 1, 0], ashfall.fog.color, viewDist, ashfall.fog.near, ashfall.fog.far);
  const c = contrastRatio(rgb255(lit), bg);
  assert.ok(c < MIN_CONTRAST_NONTEXT,
    `the old build measured ${c.toFixed(2)}; if that now passes, this test is not testing anything`);
  assert.ok(c < 2.2, `expected roughly the captured 1.5:1, got ${c.toFixed(2)}`);
});

test('haze relief does not let enemies act from outside visibility (M14c stands)', () => {
  // The point of M14c: nothing shoots you from inside the fog. Enemies are now more
  // legible, but their ENGAGEMENT ranges are untouched and still sit inside every
  // sector's own draw distance.
  for (const sector of SECTORS) {
    const fireDist = viewDistForRange(GUNNER_FIRE.rangeS, CAM.shipLead, CAM.back);
    const lockDist = viewDistForRange(LOCK.rangeS, CAM.shipLead, CAM.back);
    assert.ok(fireDist < sector.fog.far,
      `${sector.id}: a gunner opens fire at ${fireDist} units, past its own ${sector.fog.far} draw limit`);
    assert.ok(lockDist < sector.fog.far * ENEMY_HAZE.farMul,
      `${sector.id}: lock range sits beyond even the relieved haze`);
  }
  assert.ok(GUNNER_FIRE.rangeS <= LOCK.rangeS, 'a lock should never start after the shooting does');
});

test('haze relief fades enemies out too, just later — no ships hanging in a fog wall', () => {
  const ashfall = SECTORS.find((s) => s.id === 'ashfall');
  const far = ashfall.fog.far * ENEMY_HAZE.farMul;
  // well past any engagement range, a contact is a faint shape, not a clear target
  const distant = worstCaseRead('drone', ashfall, 60, ENEMY_HAZE.farMul);
  assert.ok(distant.contrast < MIN_CONTRAST_NONTEXT,
    `a contact 60 units out reads at ${distant.contrast.toFixed(2)} — too solid for something that cannot act yet`);
  assert.ok(fogFraction(viewDistForRange(120, CAM.shipLead, CAM.back), ashfall.fog.near, far) >= 1,
    'enemies must still vanish completely at long range');
  assert.ok(ENEMY_HAZE.farMul > 1 && ENEMY_HAZE.farMul <= 2, 'haze relief stays modest');
});

test('the enemy palette keeps its register: warm, hot, and darkest at the cockpit', () => {
  const { HULL, HULL_LIT, FIN, NOSE, COCKPIT } = ENEMY_PALETTE;
  for (const [name, c] of Object.entries(ENEMY_PALETTE)) {
    assert.equal(c.length, 3, `${name} is not an rgb triple`);
    for (const v of c) assert.ok(v >= 0 && v <= 1, `${name} channel out of [0,1]`);
  }
  for (const [name, c] of [['HULL', HULL], ['HULL_LIT', HULL_LIT], ['FIN', FIN], ['NOSE', NOSE]]) {
    assert.ok(c[0] > c[1] && c[1] >= c[2], `${name} is no longer warm (r>g>=b)`);
  }
  assert.ok(HULL_LIT[0] > HULL[0], 'the lit hull faces should read brighter than the shadowed ones');
  assert.ok(Math.max(...COCKPIT) < 0.2, 'the cockpit slit is the dark anchor of the silhouette');
  assert.ok(Math.max(...NOSE) >= Math.max(...HULL), 'the nose should be the hottest point');
});
