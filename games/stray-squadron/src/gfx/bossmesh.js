// The boss mesh — M8's run-climax menace. A heavy hostile dreadnought, code-drawn
// like everything else, and deliberately a DIFFERENT read from the small crimson
// darts: where a fighter is a compact swept dart, the boss is broad, blocky, and
// armored, with an exposed hot CORE at front-center (the weak-point read) flanked by
// two forward cannon pods with dark muzzle slits (where its bolts come from). Nose
// points local +Z (toward the player, like the enemies — it sits ahead facing back).
//
// Read is silhouette + the socketed hot core, never colour alone (accessibility law):
// a wide iron hull with a glowing eye and jutting guns says "the big one" at a glance.
// Built around ~unit half-extents; the runtime scales it by the boss radius.

import { createMesh } from './mesh.js';

// ART MIGRATION 2026-08-10 — the capital's value ramp.
// The old greys topped out at 0.40, which is DARKER than the sector sky. Against the
// approved horizon glow the whole dreadnought silhouetted into one black clump: you
// could see its outline and nothing of its form, and a capital whose form you cannot
// read is just a big rock. The approved set-piece frame has it the other way round — a
// pale grey hull whose facet planes step visibly against a coloured sky, which is what
// makes the mass legible. This is the PoC's capital ramp, spanning 0.14 -> 0.79, so the
// hull has four separable planes instead of two nearly-identical dark ones.
const HULL = [0.42, 0.45, 0.51];     // gunmetal body
const HULL_LIT = [0.70, 0.73, 0.79]; // its lit planes — the brightest large surface
const PLATE = [0.14, 0.16, 0.21];    // darker armor plates
const PLATE_LIT = [0.275, 0.310, 0.376];
const CORE = [0.96, 0.52, 0.16];     // hot exposed core (the weak-point read)
const CORE_LIT = [1.0, 0.74, 0.34];
const MUZZLE = [0.05, 0.06, 0.08];   // dark gun slits
const TRIM = [0.66, 0.26, 0.18];     // hostile warm edge trim
const PROW = [0.26, 0.20, 0.20];     // warm-tinted prow armor

export function createBossMesh() {
  const mesh = createMesh();

  // --- central hull: a broad, slightly tapered iron block ----------------------
  mesh.box([0, 0, -0.05], [1.5, 0.72, 1.15], {
    px: HULL_LIT, nx: HULL_LIT, py: HULL, ny: PLATE, pz: HULL_LIT, nz: PLATE,
  });

  // upper spine ridge — a raised armored crest along the top
  mesh.box([0, 0.5, -0.15], [0.7, 0.28, 0.9], {
    px: PLATE_LIT, nx: PLATE_LIT, py: HULL_LIT, ny: PLATE, pz: PLATE_LIT, nz: PLATE,
  });

  // --- the exposed hot core at front-center: the weak point --------------------
  // a recessed socket (dark rim) cradling a faceted core (bright), so it reads as a
  // target even in silhouette.
  mesh.box([0, 0, 0.5], [0.62, 0.62, 0.24], {
    px: MUZZLE, nx: MUZZLE, py: MUZZLE, ny: MUZZLE, pz: MUZZLE, nz: MUZZLE,
  });
  // faceted core: an octahedron-ish gem jutting from the socket
  const cf = 0.72;
  const cz = 0.68;
  const tip = [0, 0, cz + 0.22];
  const rim = [
    [cf * 0.32, cf * 0.32, cz], [-cf * 0.32, cf * 0.32, cz],
    [-cf * 0.32, -cf * 0.32, cz], [cf * 0.32, -cf * 0.32, cz],
  ];
  for (let i = 0; i < 4; i++) {
    const a = rim[i], b = rim[(i + 1) % 4];
    mesh.tri(tip, a, b, i % 2 ? CORE : CORE_LIT);
  }
  // core base ring back to the socket face
  for (let i = 0; i < 4; i++) {
    const a = rim[i], b = rim[(i + 1) % 4];
    mesh.tri([0, 0, 0.62], b, a, CORE);
  }

  // --- angular prow wedges below the core (a jagged iron beak) ------------------
  for (const sgn of [1, -1]) {
    const apex = [sgn * 0.2, -0.45, 0.95];
    const base0 = [sgn * 0.1, -0.1, 0.5];
    const base1 = [sgn * 0.55, -0.1, 0.4];
    const base2 = [sgn * 0.5, -0.55, 0.35];
    mesh.tri(apex, base0, base1, PROW);
    mesh.tri(apex, base1, base2, PROW);
    mesh.tri(apex, base2, base0, PLATE);
  }

  // --- shoulder armor plates: big angled blocks flanking the hull ---------------
  for (const sgn of [1, -1]) {
    mesh.box([sgn * 1.35, 0.12, -0.2], [0.5, 0.9, 1.3], {
      px: sgn > 0 ? PLATE_LIT : PLATE, nx: sgn > 0 ? PLATE : PLATE_LIT,
      py: PLATE_LIT, ny: PLATE, pz: PLATE_LIT, nz: PLATE,
    });
    // a warm trim strip along the shoulder's leading top edge
    mesh.box([sgn * 1.35, 0.58, 0.2], [0.52, 0.1, 0.5], TRIM);
  }

  // --- forward cannon pods: jutting barrels with dark muzzles -------------------
  for (const sgn of [1, -1]) {
    mesh.box([sgn * 1.05, -0.1, 0.55], [0.34, 0.36, 0.8], {
      px: HULL_LIT, nx: HULL, py: HULL_LIT, ny: PLATE, pz: MUZZLE, nz: PLATE,
    });
    // muzzle bore (a small dark box on the front face)
    mesh.box([sgn * 1.05, -0.1, 0.96], [0.16, 0.16, 0.12], MUZZLE);
  }

  // --- heavy back-swept wings from the rear shoulders ---------------------------
  // ART MIGRATION 2026-08-10 — these were the same zero-thickness double-sided blades
  // the fighter fins were (refuter residual #2), and at capital scale the shard read is
  // worse, not better: a wing the size of the hull collapsing to a lit sliver reads as
  // debris hanging off the ship. Solid slabs now.
  // They also reach wider than they did. Breadth is half of the "long, broad and low"
  // proportion the mass read needs, and the wings are swept AFT of the core, so a wider
  // span adds silhouette without putting anything nearer the aim point.
  const WING_TH = 0.07;
  for (const sgn of [1, -1]) {
    const prof = [
      [sgn * 1.4, 0.0, -0.7],
      [sgn * 2.78, -0.18, -1.40],
      [sgn * 1.4, -0.4, -0.5],
    ];
    const up = [0, WING_TH, 0];
    const hi = prof.map((p) => [p[0], p[1] + up[1], p[2]]);
    const lo = prof.map((p) => [p[0], p[1] - up[1], p[2]]);
    mesh.tri(hi[0], hi[1], hi[2], PLATE_LIT);
    mesh.tri(lo[2], lo[1], lo[0], PLATE);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      mesh.quad(hi[i], hi[j], lo[j], lo[i], PLATE);
    }
    // wingtip warm tip-light
    mesh.box([sgn * 2.64, -0.15, -1.30], [0.16, 0.14, 0.24], TRIM);
  }

  // --- rear engine block with warm exhaust vents --------------------------------
  mesh.box([0, 0, -0.85], [1.0, 0.5, 0.4], {
    px: PLATE, nx: PLATE, py: PLATE, ny: PLATE, pz: PLATE, nz: CORE,
  });

  // --- CAPITAL MASS (art migration 2026-08-10) ----------------------------------
  // The approved set-piece frame reads its capital as mass, and mass is not size — the
  // old hull was 1.5 x 0.72 x 1.15, which is essentially a cube, and a scaled-up cube
  // reads as a big fighter. Three things carry mass in the approved frame, and all three
  // are proportion and occlusion rather than scale:
  //
  //   1. LENGTH. A long low body, so the hull runs out of the frame and the eye has to
  //      travel it. The spine below triples the ship's depth without raising it.
  //   2. BROKEN PLANES. Big flat faces are read as small unless something gives them a
  //      scale reference, so the flanks carry panel slabs and dark bays — the same trick
  //      the frame uses with its rows of hull ports.
  //   3. A VENTRAL SHELF that occludes what is behind it, which is what actually sells
  //      "this thing is between you and the horizon".
  //
  // None of this touches the boss's collision radius or its weak-point read: the hot
  // core, cannon pods and prow above are untouched and still the brightest thing on it.

  // 1. The long dorsal spine, running well aft — the ship's length.
  // The aft direction is FREE to grow: main.js orients the mesh with local +Z pointing
  // back at the player, so lengthening the tail pushes hull further AWAY down the rail
  // and can never reach closer to the ship than the nose already does.
  mesh.box([0, 0.30, -3.6], [1.05, 0.46, 5.8], {
    px: HULL, nx: HULL, py: HULL_LIT, ny: PLATE, pz: PLATE_LIT, nz: PLATE,
  });
  mesh.box([0, 0.62, -4.4], [0.6, 0.34, 3.2], {
    px: PLATE_LIT, nx: PLATE_LIT, py: HULL_LIT, ny: PLATE, pz: PLATE_LIT, nz: PLATE,
  });
  // A conning tower, so the top plane is not one unbroken slab.
  mesh.box([0.18, 0.92, -1.55], [0.34, 0.44, 0.5], {
    px: HULL_LIT, nx: PLATE, py: HULL_LIT, ny: PLATE, pz: PLATE_LIT, nz: PLATE,
  });
  mesh.box([0.18, 1.20, -1.55], [0.10, 0.30, 0.10], TRIM); // mast

  // 2. Flank panel slabs + dark bays. The rhythm is the scale reference.
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const z = 0.1 - i * 0.85;
      mesh.box([sgn * 0.79, 0.02, z], [0.12, 0.30, 0.48], {
        all: PLATE, px: sgn > 0 ? PLATE_LIT : PLATE, nx: sgn > 0 ? PLATE : PLATE_LIT,
      });
      mesh.box([sgn * 0.84, -0.16, z], [0.10, 0.13, 0.28], MUZZLE); // bay mouth
    }
  }

  // 3. The ventral shelf — a broad flat underside that crops the horizon behind it.
  mesh.box([0, -0.52, -2.4], [2.05, 0.26, 5.5], {
    px: PLATE, nx: PLATE, py: PLATE, ny: MUZZLE, pz: PLATE_LIT, nz: PLATE,
  });
  // Two keel fins under the shelf, giving the silhouette a lower edge to read against.
  for (const sgn of [1, -1]) {
    mesh.box([sgn * 0.7, -0.78, -2.7], [0.18, 0.34, 4.2], {
      all: MUZZLE, px: PLATE, nx: PLATE,
    });
  }

  // Rear quarter: a second engine bank, so the aft end has weight rather than tapering
  // into nothing the moment the hull leaves frame. Its depth is what carries the
  // "long, broad and low" proportion the mass read depends on — test/art-residuals.js
  // holds the hull to depth > 1.5x width, which the first draft missed at 4.4 vs 4.3.
  mesh.box([0, 0.05, -7.2], [1.5, 0.72, 1.2], {
    px: PLATE, nx: PLATE, py: PLATE_LIT, ny: MUZZLE, pz: PLATE, nz: PLATE,
  });
  for (const sgn of [1, -1]) {
    mesh.box([sgn * 0.46, 0.05, -8.0], [0.42, 0.42, 0.40], {
      all: PLATE, nz: CORE_LIT,
    });
  }

  return mesh.build();
}
