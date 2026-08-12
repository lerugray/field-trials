// worldview.js — the M1 first-person RENDER of a sim world. Imports three; never
// imported by the sim. Builds flat-shaded island meshes FROM the sim colliders
// (what you see is what you land on), a gradient sky + decorative floaters, the
// blob shadow (law #2, scales with height, projects onto the surface below), and
// the landing-ring marker (law #2, over the void). All code-generated (hard rule 1).

import * as THREE from 'three';
import { islandSurfaceProfile } from './islandgeometry.js';
import { predictLanding } from '../sim/trajectory.js';
import { aimIndicatorState } from './aimindicator.js';
import { tuning } from '../sim/tuning.js';
import { paletteForSphere } from './palettes.js';
import {
  makeSkyTexture, makeCompositor, rampMaterial, toRampGeometry, makeSurfaceBuilder,
  lightForSphere, inkFor, mixRgb, noise2, REF_W, REF_H,
} from './pixelart.js';

// A soft radial blob texture (canvas-drawn) for the ground shadow — no image file.
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A soft radial glow texture for the additive light pass (code-drawn, no file).
// Lighting is compositing: every light source in the frame is one of these.
function glowTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// An additive glow billboard — the light AROUND a bright thing, never the thing itself.
function glowSprite(tex, hex, scale, opacity = 1) {
  const mat = new THREE.SpriteMaterial({
    map: tex, color: new THREE.Color(hex), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(scale, scale, 1);
  return sp;
}

// ---- Bestiary billboards (M3). Each archetype is a CODE-DRAWN canvas sprite with a
// DISTINCT SILHOUETTE (colorblind fold: enemy identity carries a silhouette channel, never
// colour alone) plus a bright outline so it reads flat-shaded-PSX against the open sky.
const ENEMY_LOOK = {
  drifter: { fill: '#7fe0ff', line: '#0a3a4a', sil: 'blob' },   // friendly puff
  turret:  { fill: '#ff7fd0', line: '#4a0a34', sil: 'flower' }, // rooted flower
  hopper:  { fill: '#ffd23f', line: '#4a3400', sil: 'teardrop' }, // springy hopper
  swooper: { fill: '#b98cff', line: '#2a0a4a', sil: 'chevron' }, // winged dart
  boss:    { fill: '#ff5a4a', line: '#3a0800', sil: 'spiky' },   // act-1 menace
};

function enemyTexture(type) {
  const look = ENEMY_LOOK[type] || ENEMY_LOOK.drifter;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = look.line; g.fillStyle = look.fill;
  const cx = S / 2, cy = S / 2, R = S * 0.36;
  g.lineWidth = S * 0.06;
  const path = () => {
    g.beginPath();
    if (look.sil === 'blob') {
      g.arc(cx, cy, R, 0, Math.PI * 2);
    } else if (look.sil === 'flower') {
      const petals = 6;
      for (let i = 0; i <= petals * 12; i++) {
        const a = (i / (petals * 12)) * Math.PI * 2;
        const rr = R * (0.62 + 0.38 * Math.abs(Math.cos(a * petals / 2)));
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    } else if (look.sil === 'teardrop') {
      g.moveTo(cx, cy - R * 1.15);
      g.quadraticCurveTo(cx + R, cy - R * 0.1, cx + R * 0.7, cy + R * 0.7);
      g.quadraticCurveTo(cx, cy + R * 1.2, cx - R * 0.7, cy + R * 0.7);
      g.quadraticCurveTo(cx - R, cy - R * 0.1, cx, cy - R * 1.15);
    } else if (look.sil === 'chevron') {
      g.moveTo(cx, cy - R * 0.5);
      g.lineTo(cx + R * 1.15, cy - R * 0.1);
      g.lineTo(cx + R * 0.35, cy + R * 0.1);
      g.lineTo(cx, cy + R * 0.9);
      g.lineTo(cx - R * 0.35, cy + R * 0.1);
      g.lineTo(cx - R * 1.15, cy - R * 0.1);
      g.closePath();
    } else { // spiky (boss)
      const spikes = 9;
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? R * 1.15 : R * 0.66;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    }
  };
  path(); g.fill(); g.stroke();
  // A pair of simple eyes so the friendly toybox register reads (except the boss: a glare).
  g.fillStyle = look.line;
  const er = S * (type === 'boss' ? 0.05 : 0.045), ey = cy - S * 0.02, ex = S * 0.11;
  g.beginPath(); g.arc(cx - ex, ey, er, 0, Math.PI * 2); g.arc(cx + ex, ey, er, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft radial dot texture for sparks / bursts (code-drawn, no file).
function dotTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,220,120,0.85)') {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  grad.addColorStop(0, inner); grad.addColorStop(0.4, mid); grad.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A tiny four-tick reticle in the same hard pixel register as the native-resolution
// world. The transparent centre leaves the target readable; palette tint is applied by
// the sprite material, so every sphere keeps its own colour discipline.
function aimTickTexture() {
  const S = 16, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(7, 1, 2, 4); g.fillRect(7, 11, 2, 4);
  g.fillRect(1, 7, 4, 2); g.fillRect(11, 7, 4, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function spriteFrom(tex, color = 0xffffff, opacity = 1) {
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color, opacity });
  return new THREE.Sprite(mat);
}

const _tmpDir = new THREE.Vector3(); // scratch for camera-relative FX placement

// A thin, bright vertical light-pillar beacon (code-drawn, no texture) rising from an
// island so pods + the exit read across the whole archipelago (wayfinding fold).
// A thin, solid, LIT pillar — the wayfinding beacon. Deliberately NOT additive: an
// additive column is unbounded, so whenever one passed near the camera it saturated
// to white and swallowed the frame (caught in the first migration captures). In the
// ratified direction the pillar is ordinary lit geometry and the LIGHT around it is
// a separate glow pass — which is also why it stays readable at any distance.
function beacon(hex, height, radius = 0.16, mat) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 6, 1, false);
  return new THREE.Mesh(toRampGeometry(geo, hex), mat);
}

// Build one island's surfaces matching a sim collider (cx,cz,topY,radius).
//
// The cap's TOP IS EXACTLY topY at every vertex — what you see is what you land on,
// so no geometry displacement is allowed here. Surface modelling therefore comes
// from perturbed FACE NORMALS (lighting varies, the collider does not) plus the
// material's own fbm tooth. The body is a deep tapering cone of hard strata bands,
// built non-indexed so band boundaries stay crisp instead of smearing into a
// gradient the way shared-vertex cylinder colouring does.
function islandSurfaces(isl, palette, ink) {
  const SEG = 24;
  const cap = makeSurfaceBuilder();
  const body = makeSurfaceBuilder();
  const { cx, cz, topY, radius: r } = isl;
  const profile = islandSurfaceProfile(isl);

  // ---- Cap: three concentric rings of quads, dead flat at topY.
  const rings = [0, 0.34, 0.68, 1];
  for (let q = 0; q < rings.length - 1; q++) {
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      const ra = rings[q] * r, rb = rings[q + 1] * r;
      const p = (ang, rad) => [cx + Math.cos(ang) * rad, topY, cz + Math.sin(ang) * rad];
      // Tilt the lighting normal a little with deterministic noise: the cap reads
      // as ground that catches light unevenly, while staying perfectly flat to land on.
      const mx = Math.cos((a0 + a1) / 2) * ((ra + rb) / 2), mz = Math.sin((a0 + a1) / 2) * ((ra + rb) / 2);
      const nx = (noise2((cx + mx) * 0.35, (cz + mz) * 0.35, 5) - 0.5) * 0.5;
      const nz = (noise2((cx + mx) * 0.35, (cz + mz) * 0.35, 9) - 0.5) * 0.5;
      const L = Math.hypot(nx, 1, nz);
      const n = [nx / L, 1 / L, nz / L];
      // At q === 0 the inner edge collapses to the centre; the resulting degenerate
      // triangle has zero area and rasterises nothing, so the fan needs no special case.
      cap.quad(p(a0, ra), p(a1, ra), p(a1, rb), p(a0, rb), palette.cap, n);
    }
  }

  // ---- Body: seven strata levels, tapering to 40%, deep enough to read as an
  //      uprooted chunk of world hanging in open sky.
  const LEVELS = 7;
  const depth = profile.depth;
  const bandA = palette.strataA;
  const bandB = mixRgb(palette.strataB, ink, 0.18);
  for (let j = 0; j < LEVELS; j++) {
    const t0 = j / LEVELS, t1 = (j + 1) / LEVELS;
    const r0 = r * (1 - t0 * 0.60), r1 = r * (1 - t1 * 0.60);
    const y0 = profile.bodyTopY - t0 * depth, y1 = profile.bodyTopY - t1 * depth;
    const col = j % 2 ? bandA : bandB;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      body.quad(
        [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0],
        [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0],
        [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1],
        [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1],
        col,
      );
    }
  }
  return { cap: cap.build(), body: body.build() };
}

// Decorative floaters — balloons and rings drifting in the open sky (seed idiom).
// Act 3 stacks its rings into the crown that marks the boss gate.
function makeFloaters(palette, propMat) {
  const group = new THREE.Group();
  const cols = [palette.floatA, palette.floatB, palette.floatC];
  const spots = [
    [-20, 14, -6], [22, 18, -24], [-14, 22, -40], [26, 10, -18],
    [4, 26, -52], [-34, 16, -30], [12, 20, -64],
  ];
  spots.forEach((p, i) => {
    let geo;
    if (i % 2 === 0) {
      geo = new THREE.SphereGeometry(1.7, 10, 7);
      geo.scale(1, 1.25, 1); // balloons hang, they are not beach balls
    } else {
      geo = new THREE.TorusGeometry(2.1, 0.5, 6, 14);
      geo.rotateX(Math.PI / 3);
    }
    const m = new THREE.Mesh(toRampGeometry(geo, cols[i % 3]), propMat);
    m.position.set(p[0], p[1], p[2]);
    group.add(m);
  });
  return group;
}

// Kept for back-compat (was the M1 inline palette); now the first committed table entry.
export const ACT1_PALETTE = paletteForSphere(0);

// Create the first-person view for a world. Returns { scene, camera, update, ... }.
// The palette defaults to the committed table entry for the world's current sphere
// (per-sphere palette law); callers may still pass an explicit palette override.
export function createWorldView(world, palette = paletteForSphere(world.sphereIndex || 0), bufferW = REF_W, bufferH = REF_H) {
  const scene = new THREE.Scene();
  const sphereIndex = world.sphereIndex || 0;
  const ink = inkFor(palette);
  let bufW = Math.max(2, bufferW | 0), bufH = Math.max(2, bufferH | 0);

  // The sky is a painted plate at native buffer resolution — a dithered ramp, a
  // cloud band, and a motivated sun — not a two-stop gradient stretched over the
  // frame. Regenerated whenever the buffer size changes so a dither dot stays 1px.
  scene.background = makeSkyTexture(palette, bufW, bufH, sphereIndex);

  // No scene lights: every surface computes its own flat lambert against this
  // direction and quantises onto its base colour's ramp (see pixelart.js). The
  // direction matches the sun the sky plate paints.
  const lightDir = lightForSphere(sphereIndex, palette.act | 0);
  const capMat = rampMaterial(0, lightDir);
  const strataMat = rampMaterial(1, lightDir);
  const propMat = rampMaterial(2, lightDir);

  const islandGroup = new THREE.Group();
  for (const isl of world.islands) {
    const s = islandSurfaces(isl, palette, ink);
    islandGroup.add(new THREE.Mesh(s.cap, capMat));
    islandGroup.add(new THREE.Mesh(s.body, strataMat));
  }
  scene.add(islandGroup);

  const floaters = makeFloaters(palette, propMat);
  scene.add(floaters);

  const glowTex = glowTexture();
  const compositor = makeCompositor(palette, bufW, bufH);

  // ---- Wayfinding (M2 fold): each pod is a bright bobbing gem atop a thin light-pillar
  //      beacon; the exit portal is a ring + a TALLER beacon that brightens when it opens.
  const wayfind = new THREE.Group();
  const POD_BEACON_H = 16, EXIT_BEACON_H = 26;
  // "Bright Eyes" caprice (M4): pods glow THROUGH the islands (findability, not traversal-
  // skip) — the gem draws depth-test-off on top so it's readable from anywhere in the sphere.
  const podsThroughTerrain = !!(world.mods && world.mods.podsThroughTerrain);
  // One shared gem material: the ramp-lit prop material normally, or a depth-test-off
  // clone of it under Bright Eyes. Cloning (rather than a flat MeshBasicMaterial) keeps
  // the gem on the same ramp/dither treatment as every other lit solid in the frame.
  const podGemMat = podsThroughTerrain
    ? Object.assign(propMat.clone(), { depthTest: false })
    : propMat;
  const podEntries = (world.pods || []).map((pod) => {
    const g = new THREE.Group();
    const top = pod.y - tuning.pods.heightAboveTop; // the island top the beacon rises from
    const b = beacon(palette.floatC, POD_BEACON_H, 0.16, propMat);
    b.position.set(pod.x, top + POD_BEACON_H / 2, pod.z);
    // The gem is a LIT solid on the same ramp as the world, wrapped in additive glow —
    // the light around it is a separate pass from the thing itself.
    const gem = new THREE.Mesh(toRampGeometry(new THREE.OctahedronGeometry(0.85), palette.floatB), podGemMat);
    if (podsThroughTerrain) gem.renderOrder = 999;
    gem.position.set(pod.x, pod.y, pod.z);
    const halo = glowSprite(glowTex, palette.floatB, 4.2, 0.85);
    halo.position.set(pod.x, pod.y, pod.z);
    const spark = glowSprite(glowTex, palette.skyBot, 1.5, 0.9);
    spark.position.set(pod.x, top + POD_BEACON_H, pod.z); // the beacon's lit tip
    g.add(b); g.add(gem); g.add(halo); g.add(spark);
    wayfind.add(g);
    return { pod, group: g, gem, halo, baseY: pod.y };
  });

  // Exit portal on the far island: a standing ring + a tall beacon. Dim until it opens.
  const exitGroup = new THREE.Group();
  const ex = world.exit || { x: 0, y: 0, z: 0 };
  const exitBeacon = beacon(palette.ring, EXIT_BEACON_H, 0.22, propMat);
  exitBeacon.position.set(ex.x, ex.y + EXIT_BEACON_H / 2, ex.z);
  const exitRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.28, 8, 24),
    new THREE.MeshBasicMaterial({ color: palette.ring, transparent: true, opacity: 0.4 }),
  );
  exitRing.position.set(ex.x, ex.y + 2.0, ex.z); // stands upright to read as a doorway
  const exitGlow = glowSprite(glowTex, palette.ring, 11, 0.55);
  exitGlow.position.set(ex.x, ex.y + 2.0, ex.z);
  exitGroup.add(exitBeacon); exitGroup.add(exitRing); exitGroup.add(exitGlow);

  // Act 3 crowns its gate: a stack of rings over the portal, the silhouette the
  // whole ascent has been climbing toward.
  const crownRings = [];
  if ((palette.act | 0) === 2) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(3.4 - i * 0.42, 0.22, 6, 20),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? palette.ring : palette.floatA,
          transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      m.position.set(ex.x, ex.y + 5.5 + i * 2.4, ex.z);
      exitGroup.add(m);
      crownRings.push(m);
    }
    const crownGlow = glowSprite(glowTex, palette.ring, 16, 0.4);
    crownGlow.position.set(ex.x, ex.y + 10, ex.z);
    exitGroup.add(crownGlow);
  }
  wayfind.add(exitGroup);
  scene.add(wayfind);

  // ---- Bestiary (M3): a billboard sprite per enemy (code-drawn silhouette), a spark mote
  //      pool, a firework-projectile pool, and a transient burst-FX pool for stomp / hit /
  //      kill / pickup legibility (action-legibility law: every mechanic shows the moment it
  //      fires). All sprites face the camera; textures are cached per archetype.
  const enemyTexCache = {};
  const texFor = (t) => (enemyTexCache[t] || (enemyTexCache[t] = enemyTexture(t)));
  const enemyGroup = new THREE.Group();
  const enemySprites = (world.enemies || []).map((en) => {
    const sp = spriteFrom(texFor(en.type));
    const s = en.r * 2.2;
    sp.scale.set(s, s, 1);
    enemyGroup.add(sp);
    return sp;
  });
  scene.add(enemyGroup);

  const sparkTex = dotTexture('rgba(255,255,255,1)', 'rgba(120,230,255,0.9)');
  const sparkPool = [];
  const sparkGroup = new THREE.Group(); scene.add(sparkGroup);
  const projTex = dotTexture('rgba(255,255,255,1)', 'rgba(255,180,90,0.95)');
  const projPool = [];
  const projGroup = new THREE.Group(); scene.add(projGroup);

  const burstTex = dotTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.6)');
  const bursts = []; // { sprite, t, dur, from, to, color }
  const burstGroup = new THREE.Group(); scene.add(burstGroup);

  // Firework aim: shots fly straight, so the minimal affordance is one small reticle a
  // fixed distance along the exact launch vector. It is visible only while a full charge
  // is armed; settings can suppress it entirely.
  const aimTex = aimTickTexture();
  const aimSprite = spriteFrom(aimTex, palette.floatB, 0.82);
  aimSprite.material.depthTest = false;
  aimSprite.renderOrder = 1001;
  aimSprite.scale.set(0.72, 0.72, 1);
  aimSprite.visible = false;
  scene.add(aimSprite);
  function spawnBurst(x, y, z, color, dur = 0.32, from = 0.4, to = 3.2) {
    const sp = spriteFrom(burstTex, color, 0.95);
    sp.position.set(x, y, z); sp.scale.set(from, from, 1);
    burstGroup.add(sp);
    bursts.push({ sprite: sp, t: 0, dur, from, to });
  }
  // Grow a pooled sprite array to at least n live sprites.
  function ensurePool(pool, group, tex, color, n) {
    while (pool.length < n) { const sp = spriteFrom(tex, color, 0.95); sp.visible = false; group.add(sp); pool.push(sp); }
  }

  // Blob shadow — a flat, camera-independent disc textured with a soft radial.
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Landing-ring marker — a bright torus on the predicted landing surface.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.16, 6, 20),
    new THREE.MeshBasicMaterial({ color: palette.ring, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const camera = new THREE.PerspectiveCamera(tuning.camera.fovDefault, 16 / 10, 0.1, 800);

  // Result: where the landing-ring points this frame (for the HUD edge-arrow).
  const view = {
    scene, camera, floaters, ring, blob, wayfind, podEntries, exitGroup, exitRing, exitBeacon, aimSprite,
    palette, sphereIndex, compositor,
    landingScreen: null, // {onScreen, x, y} filled each update for the landing HUD arrow
    podScreen: null,     // nearest uncollected pod projected to screen (HUD pod arrow)
    bossInfo: null,      // { hp, hpMax } when a live boss is present (HUD boss bar)
    enemiesOnScreen: 0,  // count of live enemies projecting on-screen this frame (proof gating)
    islandsOnScreen: 0,  // count of island tops in frame — an ART proof that captures a
                         // beautiful empty sky is not a proof (instrumentation law)
    aimIndicator: null,  // render-facing probe: { visible, x, y, z } at the true shot point

    // Update every frame. `cameraState` = { yaw, pitch, aimPitch, showAimIndicator };
    // pitch includes auto-tip while aimPitch is the raw projectile pitch.
    update(cameraState, timeSec) {
      const p = world.player;

      // First-person camera at eye height, oriented by yaw/pitch.
      camera.position.set(p.pos.x, p.pos.y + tuning.camera.eyeHeight, p.pos.z);
      camera.rotation.set(0, 0, 0);
      camera.rotateY(cameraState.yaw);
      camera.rotateX(cameraState.pitch);

      // Projectile aim deliberately uses the player's RAW look pitch. The camera's
      // automatic jump tip-down is presentation-only and must not bend a shot or its marker.
      const aim = aimIndicatorState(world, cameraState);
      aimSprite.visible = aim.visible;
      aimSprite.position.set(aim.x, aim.y, aim.z);
      this.aimIndicator = aim;

      // Blob shadow: project onto the surface directly below; scale with height.
      const below = world.ground.surfaceUnder(p.pos.x, p.pos.z, p.pos.y + 0.01);
      if (below) {
        const h = Math.max(0, p.pos.y - below.y);
        const t = Math.min(1, h / tuning.shadow.scaleHeightRef);
        const s = tuning.shadow.minScale + (tuning.shadow.maxScale - tuning.shadow.minScale) * t;
        blob.visible = true;
        blob.position.set(p.pos.x, below.y + 0.03, p.pos.z);
        blob.scale.set(s * 3, s * 3, 1);
        blob.material.opacity = 0.9 - 0.35 * t;
      } else {
        blob.visible = false;
      }

      // Landing-ring: when airborne, mark the predicted landing (law #2). Always
      // useful; essential when the blob has no surface right below (over void).
      this.landingScreen = null;
      if (!p.grounded) {
        const land = predictLanding(world.ground, p.pos, p.vel);
        if (land) {
          ring.visible = true;
          ring.position.set(land.x, land.y + 0.05, land.z);
          const pulse = 1 + Math.sin(timeSec * 6) * 0.06;
          ring.scale.set(pulse, pulse, 1);
          // Project to screen for the HUD edge-arrow.
          const v = new THREE.Vector3(land.x, land.y + 0.05, land.z).project(camera);
          const onScreen = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
          this.landingScreen = { onScreen, x: v.x, y: v.y, behind: v.z >= 1 };
        } else { ring.visible = false; }
      } else { ring.visible = false; }

      floaters.rotation.y = Math.sin(timeSec * 0.12) * 0.06;

      // How much WORLD is actually in frame. Gates art proofs: a frame that draws only
      // sky can look lovely and prove nothing.
      let islandsSeen = 0;
      for (const isl of world.islands) {
        const iv = _tmpDir.set(isl.cx, isl.topY, isl.cz).project(camera);
        if (iv.z < 1 && Math.abs(iv.x) <= 1.15 && Math.abs(iv.y) <= 1.15) islandsSeen++;
      }
      this.islandsOnScreen = islandsSeen;

      // ---- Wayfinding: hide collected pods, bob the rest; find the nearest uncollected
      //      pod and project it to screen for the HUD pod arrow. Light the exit when open.
      let nearest = null, nearestD = Infinity;
      for (const e of podEntries) {
        e.group.visible = !e.pod.collected;
        if (e.pod.collected) continue;
        e.gem.position.y = e.baseY + Math.sin(timeSec * 3 + e.pod.x) * 0.25;
        e.gem.rotation.y = timeSec * 1.5;
        const d = Math.hypot(p.pos.x - e.pod.x, p.pos.z - e.pod.z);
        if (d < nearestD) { nearestD = d; nearest = e.pod; }
      }
      this.podScreen = null;
      if (nearest) {
        const v = new THREE.Vector3(nearest.x, nearest.y, nearest.z).project(camera);
        const onScreen = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
        this.podScreen = { onScreen, x: v.x, y: v.y, behind: v.z >= 1 };
      }

      // Exit portal state: dim + slow when closed, bright + spinning + pulsing when open.
      const open = !!(world.exit && world.exit.open);
      // "Brightens when it opens" now rides the GLOW channel (below) and the ring —
      // the pillar itself is solid lit geometry on a shared material, so its
      // emphasis can't be an opacity tween any more.
      exitRing.material.opacity = open ? 0.95 : 0.4;
      exitRing.rotation.z = timeSec * (open ? 1.6 : 0.3);
      const pulse = open ? 1 + Math.sin(timeSec * 5) * 0.08 : 1;
      exitRing.scale.set(pulse, pulse, pulse);
      exitGlow.material.opacity = open ? 0.55 + Math.sin(timeSec * 5) * 0.12 : 0.22;
      for (let i = 0; i < crownRings.length; i++) {
        crownRings[i].rotation.z = timeSec * (0.35 + i * 0.11) * (i % 2 ? -1 : 1);
        crownRings[i].material.opacity = (open ? 0.85 : 0.55) + Math.sin(timeSec * 2 + i) * 0.08;
      }

      // ---- Bestiary billboards: follow the sim roster; hide the dead. A hit enemy (boss
      //      i-frames) gets an OUTLINE-PULSE (scale breath), never a flicker (photosensitivity
      //      policy). A diving attacker warms and stretches into a clear strike silhouette;
      //      contact then drives the existing hit burst + directional rim response.
      this.bossInfo = null;
      let onScreen = 0;
      for (let i = 0; i < enemySprites.length; i++) {
        const en = world.enemies[i], sp = enemySprites[i];
        if (!en || !en.alive) { if (sp) sp.visible = false; continue; }
        sp.visible = true;
        sp.position.set(en.pos.x, en.pos.y, en.pos.z);
        const breath = en.invuln > 0 ? 1 + Math.sin(timeSec * 22) * 0.12 : 1; // hit-pulse (bounded rate)
        const s = en.r * 2.2 * breath;
        sp.scale.set(s * (en.diving ? 0.82 : 1), s * (en.diving ? 1.34 : 1), 1);
        sp.material.color.setHex(en.diving ? 0xffb35c : 0xffffff);
        sp.material.opacity = en.invuln > 0 ? 0.75 : 1;
        if (en.boss) this.bossInfo = { hp: en.hp, hpMax: en.hpMax };
        const v = _tmpDir.set(en.pos.x, en.pos.y, en.pos.z).project(camera);
        if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) onScreen++;
      }
      this.enemiesOnScreen = onScreen;

      // ---- Sparks: bright drifting motes.
      const liveSparks = (world.sparks || []).filter((s) => s.alive);
      ensurePool(sparkPool, sparkGroup, sparkTex, 0x9fefff, liveSparks.length);
      for (let i = 0; i < sparkPool.length; i++) {
        const sp = sparkPool[i], s = liveSparks[i];
        if (!s) { sp.visible = false; continue; }
        sp.visible = true; sp.position.set(s.pos.x, s.pos.y, s.pos.z);
        const fade = Math.min(1, s.life / 1.5);
        const sc = 0.7 + Math.sin(timeSec * 8 + s.pos.x) * 0.12;
        sp.scale.set(sc, sc, 1); sp.material.opacity = 0.35 + 0.6 * fade;
      }

      // ---- Firework projectiles: bright streaks.
      const liveProj = (world.projectiles || []).filter((p) => p.alive);
      ensurePool(projPool, projGroup, projTex, 0xffd27a, liveProj.length);
      for (let i = 0; i < projPool.length; i++) {
        const sp = projPool[i], pr = liveProj[i];
        if (!pr) { sp.visible = false; continue; }
        sp.visible = true; sp.position.set(pr.pos.x, pr.pos.y, pr.pos.z); sp.scale.set(0.9, 0.9, 1);
      }

      // ---- Event-driven bursts (read the sim's per-tick legibility flags).
      if (world.stompedThisTick >= 0) { const e = world.enemies[world.stompedThisTick]; if (e) spawnBurst(e.pos.x, e.pos.y, e.pos.z, 0xffffff, 0.28, 0.5, 2.6); }
      if (world.killedThisTick >= 0) { const e = world.enemies[world.killedThisTick]; if (e) spawnBurst(e.pos.x, e.pos.y, e.pos.z, e.boss ? 0xffd23f : 0x9fefff, 0.42, 0.6, e.boss ? 6 : 3.6); }
      if (world.fireworkHitThisTick >= 0) { const e = world.enemies[world.fireworkHitThisTick]; if (e) spawnBurst(e.pos.x, e.pos.y, e.pos.z, 0xffb04a, 0.3, 0.5, 2.8); }
      if (world.damagedThisTick) { const c = camera.position; spawnBurst(c.x - camera.getWorldDirection(_tmpDir).x * 2, c.y, c.z - _tmpDir.z * 2, 0xff4a4a, 0.3, 0.6, 3.0); }
      if (world.diedThisTick) { const c = camera.position; spawnBurst(c.x, c.y, c.z, 0xff2a2a, 0.6, 0.8, 8); }
      if (world.pipGainedThisTick) { const p2 = world.player; spawnBurst(p2.pos.x, p2.pos.y + 1.4, p2.pos.z, 0x7fff9f, 0.4, 0.5, 3.0); }

      // Advance + expire bursts (grow + fade).
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.t += (timeSec - (this._lastT ?? timeSec));
        const k = Math.min(1, b.t / b.dur);
        const s = b.from + (b.to - b.from) * k;
        b.sprite.scale.set(s, s, 1);
        b.sprite.material.opacity = 0.95 * (1 - k);
        if (k >= 1) { burstGroup.remove(b.sprite); b.sprite.material.dispose(); bursts.splice(i, 1); }
      }
      this._lastT = timeSec;
    },

    setAspect(a) { camera.aspect = a; camera.updateProjectionMatrix(); },
    setFov(deg) { camera.fov = deg; camera.updateProjectionMatrix(); },

    // The sky plate and the compositing plates are painted at NATIVE BUFFER
    // resolution so one dither dot is exactly one screen pixel. When the buffer
    // changes size they are repainted — otherwise the dither would stretch and the
    // whole pixel register would soften into mush.
    setBufferSize(w, h) {
      const nw = Math.max(2, w | 0), nh = Math.max(2, h | 0);
      if (nw === bufW && nh === bufH) return;
      bufW = nw; bufH = nh;
      if (scene.background && scene.background.dispose) scene.background.dispose();
      scene.background = makeSkyTexture(palette, bufW, bufH, sphereIndex);
      compositor.resize(palette, bufW, bufH);
    },

    // One frame = the lit world, then the compositing plates over it. Callers use
    // this instead of renderer.render so the pass can never be half-applied.
    render(renderer) {
      renderer.render(scene, camera);
      const prev = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(compositor.scene, compositor.camera);
      renderer.autoClear = prev;
    },

    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      if (scene.background && scene.background.dispose) scene.background.dispose();
      glowTex.dispose();
      capMat.dispose(); strataMat.dispose(); propMat.dispose();
      compositor.dispose();
    },
  };
  return view;
}
