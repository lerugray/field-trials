// caprices.js — the run-scoped DRAFT modifiers (design spine: "draft one CAPRICE of
// three between spheres"). A caprice bends the run; the draft is the build agency.
//
// LAW (studio fold): caprices only ever ADD — never reduce mobility — so every
// base-validated sphere stays valid under ANY build (a mobility-reducing caprice is
// banned by rule). The pool is 16 at v1; drafted caprices leave the pool (no
// duplicates); tiers are act-gated (tier 0 from act 1, tier 1 from act 2, tier 2 from
// act 3). Effects are PURE DATA (a `mods` patch), folded by computeMods() and baked
// into an effective tuning by deriveTuning() — so the sim reads world.tune and stays
// deterministic (the id list fully determines the numbers).

import { tuning } from './tuning.js';

// The v1 pool. Each caprice: id, name, one-line legible desc, tier (min act: 0/1/2),
// and a `mods` patch keyed to the fields computeMods folds. Every entry is a pure
// benefit or a non-mobility trade — never a mobility reduction (fold law).
export const CAPRICES = [
  // ---- Tier 0 (available from the first draft, act 1) ------------------------------
  { id: 'spring-heels', name: 'Spring Heels', tier: 0, desc: 'Every leap springs higher.', mods: { jumpHeightMul: 1.12 } },
  { id: 'feather-fall', name: 'Feather Fall', tier: 0, desc: 'Steer farther through the air.', mods: { airControlMul: 1.35 } },
  { id: 'wide-boots', name: 'Wide Boots', tier: 0, desc: 'A broader stomp reach.', mods: { stompRadiusMul: 1.4 } },
  { id: 'spare-pip', name: 'Spare Pip', tier: 0, desc: '+1 maximum heart.', mods: { hpMaxAdd: 1 } },
  { id: 'long-coyote', name: 'Long Coyote', tier: 0, desc: 'More forgiving ledge grace.', mods: { coyoteMul: 1.6 } },
  { id: 'bright-eyes', name: 'Bright Eyes', tier: 0, desc: 'Pods glow through the islands.', mods: { podsThroughTerrain: true } },
  { id: 'spark-magnet', name: 'Spark Magnet', tier: 0, desc: 'Pull sparks from farther off.', mods: { sparkRadiusMul: 1.8 } },

  // ---- Tier 1 (act 2+) -------------------------------------------------------------
  { id: 'double-clutch', name: 'Double Clutch', tier: 1, desc: 'A fourth midair jump.', mods: { extraJumps: 1 } },
  { id: 'high-bounce', name: 'High Bounce', tier: 1, desc: 'Bounce higher off every stomp.', mods: { stompBounceMul: 1.5 } },
  { id: 'fleet', name: 'Fleet', tier: 1, desc: 'Move noticeably faster.', mods: { moveSpeedMul: 1.2 } },
  { id: 'powder-keg', name: 'Powder Keg', tier: 1, desc: '+3 firework charges.', mods: { fireworkAmmoAdd: 3 } },
  { id: 'quick-mend', name: 'Quick Mend', tier: 1, desc: 'Pips need one less fragment.', mods: { fragmentsPerPipSub: 1 } },

  // ---- Tier 2 (act 3) --------------------------------------------------------------
  { id: 'sky-legs', name: 'Sky Legs', tier: 2, desc: 'Leaps carry far higher.', mods: { jumpHeightMul: 1.3 } },
  { id: 'featherweight', name: 'Featherweight', tier: 2, desc: 'The updraft net costs no heart.', mods: { netTollHpSub: 1 } },
  { id: 'twin-spark', name: 'Twin Spark', tier: 2, desc: 'Enemies drop double sparks.', mods: { sparkPerKillMul: 2 } },
  { id: 'iron-goat', name: 'Iron Goat', tier: 2, desc: '+2 maximum hearts.', mods: { hpMaxAdd: 2 } },
];

export const CAPRICE_BY_ID = Object.fromEntries(CAPRICES.map((c) => [c.id, c]));

// The identity mods object — every field at its no-op value. computeMods folds each
// drafted caprice's patch onto a fresh copy of this.
export function identityMods() {
  return {
    extraJumps: 0,
    jumpHeightMul: 1,
    airControlMul: 1,
    stompRadiusMul: 1,
    stompBounceMul: 1,
    coyoteMul: 1,
    moveSpeedMul: 1,
    sparkRadiusMul: 1,
    sparkPerKillMul: 1,
    hpMaxAdd: 0,
    fireworkAmmoAdd: 0,
    fragmentsPerPipSub: 0,
    netTollHpSub: 0,
    podsThroughTerrain: false,
  };
}

// Fold a list of caprice ids into a single mods object. Multipliers multiply, adds add,
// booleans OR. Unknown ids are ignored (defensive against a stale save). PURE.
export function computeMods(ids = []) {
  const m = identityMods();
  for (const id of ids) {
    const cap = CAPRICE_BY_ID[id];
    if (!cap) continue;
    const p = cap.mods;
    if (p.extraJumps) m.extraJumps += p.extraJumps;
    if (p.jumpHeightMul) m.jumpHeightMul *= p.jumpHeightMul;
    if (p.airControlMul) m.airControlMul *= p.airControlMul;
    if (p.stompRadiusMul) m.stompRadiusMul *= p.stompRadiusMul;
    if (p.stompBounceMul) m.stompBounceMul *= p.stompBounceMul;
    if (p.coyoteMul) m.coyoteMul *= p.coyoteMul;
    if (p.moveSpeedMul) m.moveSpeedMul *= p.moveSpeedMul;
    if (p.sparkRadiusMul) m.sparkRadiusMul *= p.sparkRadiusMul;
    if (p.sparkPerKillMul) m.sparkPerKillMul *= p.sparkPerKillMul;
    if (p.hpMaxAdd) m.hpMaxAdd += p.hpMaxAdd;
    if (p.fireworkAmmoAdd) m.fireworkAmmoAdd += p.fireworkAmmoAdd;
    if (p.fragmentsPerPipSub) m.fragmentsPerPipSub += p.fragmentsPerPipSub;
    if (p.netTollHpSub) m.netTollHpSub += p.netTollHpSub;
    if (p.podsThroughTerrain) m.podsThroughTerrain = true;
  }
  return m;
}

// Build the effective tuning for a run given its drafted caprice ids. Starts from a
// DEEP CLONE of the base tuning and mutates ONLY where a mod is non-identity, so the
// empty-caprice case returns numbers byte-identical to base tuning (determinism +
// save-round-trip + the golden feel tape all stay green). Returns the cloned tuning
// (never mutates the imported base) plus a `podsThroughTerrain` render flag lives on
// the mods object, not here.
export function deriveTuning(ids = [], base = tuning) {
  const m = computeMods(ids);
  const t = structuredClone(base);

  // ---- Jump: extra midair jumps extend the chain (each +0.9·H cumulative apex step),
  //      and jumpHeightMul scales the base apex (geometric escalation preserved).
  if (m.extraJumps > 0) {
    const hm = t.jump.heightMul.slice();
    let last = hm[hm.length - 1];
    for (let i = 0; i < m.extraJumps; i++) { last += 0.9; hm.push(last); }
    t.jump.heightMul = hm;
    t.jump.count += m.extraJumps;
  }
  if (m.jumpHeightMul !== 1) t.jump.baseHeight *= m.jumpHeightMul;
  if (m.coyoteMul !== 1) t.jump.coyoteMs *= m.coyoteMul;

  // ---- Movement: air control + overall speed caps.
  if (m.airControlMul !== 1) t.move.airAccelFrac *= m.airControlMul;
  if (m.moveSpeedMul !== 1) {
    t.move.maxGroundSpeed *= m.moveSpeedMul;
    t.move.maxAirSpeed *= m.moveSpeedMul;
  }

  // ---- Stomp reach + bounce (contactRadius is the player↔enemy reach used for stomps).
  if (m.stompRadiusMul !== 1) t.enemies.contactRadius *= m.stompRadiusMul;
  if (m.stompBounceMul !== 1) t.stomp.bounceVel *= m.stompBounceMul;

  // ---- HP economy: extra max hearts + easier pip fragments.
  if (m.hpMaxAdd !== 0) t.hp.pips += m.hpMaxAdd;
  if (m.fragmentsPerPipSub !== 0) t.hp.fragmentsPerPip = Math.max(1, t.hp.fragmentsPerPip - m.fragmentsPerPipSub);

  // ---- Sparks + firework + net toll.
  if (m.sparkRadiusMul !== 1) t.spark.collectRadius *= m.sparkRadiusMul;
  if (m.sparkPerKillMul !== 1) t.spark.perKill = Math.round(t.spark.perKill * m.sparkPerKillMul);
  if (m.fireworkAmmoAdd !== 0) t.firework.ammoMax += m.fireworkAmmoAdd;
  if (m.netTollHpSub !== 0) t.fall.netTollHp = Math.max(0, t.fall.netTollHp - m.netTollHpSub);

  return t;
}

// The highest caprice tier a player on `sphereIndex` may draft: act 1 (spheres 0-2) →
// tier 0, act 2 (3-5) → tier 1, act 3 (6-8) → tier 2. (3 acts of 3.)
export function maxTierForSphere(sphereIndex) {
  return Math.min(2, Math.floor(sphereIndex / 3));
}
