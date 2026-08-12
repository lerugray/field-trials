// Enemy fighter mesh — a compact hostile dart, nose pointing local +Z (toward the
// player, since enemies sit ahead facing back). Warm crimson/orange palette so it
// reads as a threat, but the real signal is the aggressive swept silhouette and
// its position bearing down the corridor, not color alone (accessibility law).
// Deliberately NOT a bare cube (hard rule 6): a nose pyramid, a chunky core, a
// dark cockpit slit, and two back-swept delta fins. One unit-ish mesh; main scales
// it per kind (drone smaller, gunner bigger).
//
// Distinct from the player craft (cool slate, swept-FORWARD wings, warm engine) —
// here everything rakes BACK and runs hot, the classic read of an oncoming hostile.

import { createMesh } from './mesh.js';

// The palette runs hotter than it did (2026-08-07). Measured in headless captures of
// the built game, an enemy at the range where it is allowed to open fire sat at a WCAG
// contrast of 1.5 against the haze it hung in — about half the 3:1 owed to a thing you
// have to see — and the operator duly reported "still hard to tell". The register is
// unchanged: crimson body, hotter orange fins, ember nose, dark cockpit slit, all
// still distinct from the player craft's cool slate. The values simply stopped being
// polite about it, and the fins and nose carry more green, which is where luminance
// actually lives.
export const ENEMY_PALETTE = {
  HULL: [0.62, 0.20, 0.17],      // crimson body
  HULL_LIT: [0.86, 0.34, 0.22],  // its lit faces
  FIN: [0.98, 0.56, 0.20],       // hot orange fins
  COCKPIT: [0.08, 0.10, 0.14],   // dark slit — the silhouette's contrast anchor
  NOSE: [1.00, 0.62, 0.30],      // ember nose, the brightest read on the ship
};

// Enemies resist the sector haze more than scenery does: same fog near, but the FAR is
// pushed out by this multiplier. Colour alone could not close the gap — at the gunner's
// own firing range the haze has already erased two thirds of the ship, so no palette
// that stays in register survives it (checked: even a pure white face only just reaches
// 3:1). Letting gameplay-critical craft hold up better than rock does is the standard
// answer and the honest one.
//
// This does NOT reopen what M14c closed. GUNNER_FIRE.rangeS and LOCK.rangeS are
// untouched, so enemies still cannot act from outside visibility; they are now simply
// legible at the ranges where they were already allowed to shoot, and a distant contact
// reads as a faint shape arriving instead of as nothing at all.
export const ENEMY_HAZE = { farMul: 1.9 };

const { HULL, HULL_LIT, FIN, COCKPIT, NOSE } = ENEMY_PALETTE;

// S13: three distinct silhouettes the STUDY calls for, so a wave is not one repeated
// dart. All share the crimson hull + nose read; they differ in the parts that carry
// the silhouette:
//   'drone'  — a sleek canopy-LESS interceptor with back-swept fins (the light chaser)
//   'turret' — a no-wing gunner with a forward BARREL (reads as the shooter)
//   'elite'  — a radial four-fin cross, heavier and symmetric (the standout)
//   'heavy'  — a slab-sided brick with outboard pods and a dorsal boom (art migration)
// main maps the sim's two kinds (drone / gunner) onto these four PURELY VISUALLY, by a
// deterministic function of the enemy's own id — so a wave shows four silhouettes while
// the simulation still knows about exactly two kinds and no balance number moves.
// Which of the four silhouettes an enemy WEARS, from the two kinds the simulation
// actually has. Deterministic in the enemy's own id, so it draws the same every frame
// and the same on every machine, and it consumes no RNG draw — the level's seeded
// streams are untouched. This is a pure look-up: nothing downstream of it reads the
// result except the renderer.
//
// The mix is deliberately lopsided. A wave is mostly its base silhouette with an
// occasional standout, which is how a formation reads as a formation; an even split
// across four shapes would make every wave look like a scrapyard, which is the exact
// failure the operator flagged on the key art.
export function enemyVisualVariant(kind, id) {
  const n = Math.abs(Math.round(Number(id) || 0));
  if (kind === 'gunner') return n % 4 === 3 ? 'heavy' : 'turret';
  return n % 5 === 2 ? 'elite' : 'drone';
}

export function createEnemyMesh(variant = 'drone') {
  const mesh = createMesh();

  // Core body: a short box, wider at the tail than a cube to feel dart-like.
  mesh.box([0, 0, -0.1], [0.7, 0.42, 0.9], {
    px: HULL_LIT, nx: HULL_LIT, py: HULL, ny: HULL, pz: HULL, nz: HULL,
  });

  // Nose pyramid at +Z: apex forward, base on the front box face.
  const apex = [0, 0, 0.95];
  const n = [
    [0.35, 0.21, 0.35],
    [-0.35, 0.21, 0.35],
    [-0.35, -0.21, 0.35],
    [0.35, -0.21, 0.35],
  ];
  for (let i = 0; i < 4; i++) {
    mesh.tri(apex, n[i], n[(i + 1) % 4], NOSE);
  }

  // ART MIGRATION 2026-08-10 — refuter residual #2, "edge-on shard read".
  // Both fin helpers used to emit the SAME triangle twice with opposite winding: a
  // zero-thickness blade. Edge-on it vanishes; near edge-on it is a lit sliver that
  // reads as an explosion shard rather than as part of a ship — exactly the residual the
  // approved frames were flagged for. They are solid slabs now, two faces plus a rim, so
  // a fin has area from every angle and its sides take different light. FIN_TH is small
  // on purpose: this fixes a degenerate case, it does not redesign the silhouette.
  const FIN_TH = 0.035;

  // A solid thin slab through three profile points, extruded along `axis`.
  const slab = (p0, p1, p2, axis, colA, colB) => {
    const off = [axis[0] * FIN_TH, axis[1] * FIN_TH, axis[2] * FIN_TH];
    const plus = [p0, p1, p2].map((p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
    const minus = [p0, p1, p2].map((p) => [p[0] - off[0], p[1] - off[1], p[2] - off[2]]);
    mesh.tri(plus[0], plus[1], plus[2], colA);
    mesh.tri(minus[2], minus[1], minus[0], colB);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      mesh.quad(plus[i], plus[j], minus[j], minus[i], colB);
    }
  };

  // A back-swept delta fin from the tail on side `sgn`, raking outward and behind.
  const sweptFin = (sgn) => {
    slab(
      [sgn * 0.32, 0, -0.15], [sgn * 1.0, 0.02, -0.7], [sgn * 0.32, 0, -0.55],
      [0, 1, 0], FIN, HULL,
    );
  };
  // A radial fin standing off a face, given a unit direction (dx,dy) in the frame plane.
  const radialFin = (dx, dy) => {
    // Extruded perpendicular to its own plane, so the cross keeps four readable blades.
    slab(
      [dx * 0.3, dy * 0.3, -0.15], [dx * 0.85, dy * 0.85, -0.62], [dx * 0.3, dy * 0.3, -0.5],
      [-dy, dx, 0], FIN, HULL,
    );
  };

  if (variant === 'turret') {
    // No swept wings; a dark cockpit plus a forward gun barrel — the shooter's read.
    mesh.box([0, 0.2, 0.2], [0.26, 0.12, 0.34], COCKPIT);
    mesh.box([0, -0.06, 0.5], [0.12, 0.12, 0.7], COCKPIT); // stubby barrel out the nose
  } else if (variant === 'elite') {
    // A radial four-fin cross — symmetric and heavier, the standout silhouette.
    mesh.box([0, 0.2, 0.2], [0.26, 0.12, 0.34], COCKPIT);
    radialFin(1, 0); radialFin(-1, 0); radialFin(0, 1); radialFin(0, -1);
  } else if (variant === 'heavy') {
    // The fourth silhouette (art migration): a broad slab-sided bruiser with outboard
    // pods and a long dorsal boom. Where the drone is a dart and the elite is a cross,
    // this one reads as a BRICK — the widest, squarest hostile in the set, and the one
    // whose outline stays legible when it is small on screen. That was the point of the
    // approved frames carrying four distinct enemy reads rather than one repeated dart.
    mesh.box([0, 0.16, 0.1], [0.30, 0.14, 0.40], COCKPIT);         // wide dark visor
    mesh.box([0, -0.02, -0.2], [1.15, 0.30, 0.62], {               // slab midsection
      px: HULL_LIT, nx: HULL_LIT, py: HULL_LIT, ny: HULL, pz: HULL, nz: HULL,
    });
    for (const sgn of [1, -1]) {                                    // outboard pods
      mesh.box([sgn * 0.62, 0.02, 0.18], [0.26, 0.26, 0.5], {
        px: FIN, nx: FIN, py: HULL_LIT, ny: HULL, pz: NOSE, nz: HULL,
      });
    }
    mesh.box([0, 0.30, -0.45], [0.14, 0.14, 1.1], HULL_LIT);        // dorsal boom
    sweptFin(1); sweptFin(-1);
  } else {
    // 'drone' — canopy-LESS sleek interceptor with two back-swept fins.
    sweptFin(1); sweptFin(-1);
  }

  return mesh.build();
}
