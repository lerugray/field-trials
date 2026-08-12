// Player blaster fire control — tap-fire, HOLD-to-autofire, and the SF64 charge-shot
// lock-on past a longer hold (the QoL layer DESIGN-SEED puts in scope). Pure +
// headless-testable; main.js feeds it the held fire input, the ship's rail-relative
// muzzle point, and the currently locked target (from lockon.js) each frame.
//
// Model (M14 operator ruling — hold=autofire, longer hold=charge, both preserved):
//   - A PRESS fires an immediate converging pair (responsive tap; mashing streams at
//     the tap cadence, which stays marginally the fastest way to fire).
//   - HOLDING past the press keeps streaming basic volleys at a slightly SLOWER
//     autofire cadence (so deliberate tapping remains marginally optimal), UNTIL the
//     hold has been uninterrupted past holdChargeDelay.
//   - Past that threshold the stream stops and the weapon transitions to CHARGING
//     (the existing ring/lock cue): charge builds, and RELEASING past chargeThreshold
//     launches one fat, high-damage bolt that curves onto the locked target (or
//     straight to center if nothing was locked). Releasing during the autofire phase
//     just stops — no charged bolt.

import { spawnProjectile } from './projectiles.js';

export const WEAPON = {
  fireInterval: 0.16,     // seconds between tap volleys (caps mash rate — the fastest cadence)
  autofireInterval: 0.22, // seconds between HELD autofire volleys (slower than tapping on purpose)
  holdChargeDelay: 0.5,   // uninterrupted hold past this transitions from autofire to charging
  muzzleLead: 6,          // rail units ahead of the ship station a bolt is born
  wingSpread: 0.55,       // lateral offset of each wing muzzle from ship center
  chargeRate: 0.85,       // charge per second once charging
  chargeMax: 1,
  lockStart: 0.32,        // charge above which the lock cue engages
  chargeThreshold: 0.55,  // charge at/above which release fires a charged bolt
};

export function createWeapon() {
  return { cooldown: 0, shotsFired: 0, held: false, charge: 0, heldTime: 0 };
}

const clampDt = (dt) => (dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt);

// Fire one converging wing-pair from the muzzle, arm the cooldown, and account it.
function fireVolley(state, muzzle, pool, interval) {
  const s = muzzle.s + WEAPON.muzzleLead;
  spawnProjectile(pool, { team: 'player', s, lat: muzzle.lat - WEAPON.wingSpread, vert: muzzle.vert });
  spawnProjectile(pool, { team: 'player', s, lat: muzzle.lat + WEAPON.wingSpread, vert: muzzle.vert });
  state.cooldown = interval;
  state.shotsFired += 2;
  return 2;
}

// Advance the weapon by dt. input.fire is the held state. muzzle = { s, lat, vert }.
// lock is the currently locked enemy (or null). chargeMul (M6 Boost Cells upgrade)
// speeds the charge-shot wind-up. Returns bolts fired this step.
export function updateWeapon(state, input, muzzle, pool, dt, lock, chargeMul = 1) {
  dt = clampDt(dt);
  state.cooldown -= dt;
  const wasHeld = state.held;
  state.held = !!input.fire;
  const pressed = state.held && !wasHeld;
  const released = !state.held && wasHeld;
  let fired = 0;

  if (pressed) state.heldTime = 0;

  // PRESS: immediate converging pair from the two wings (tap-fire, unchanged).
  if (pressed && state.cooldown <= 0) {
    fired += fireVolley(state, muzzle, pool, WEAPON.fireInterval);
  }

  if (state.held) {
    state.heldTime += dt;
    if (state.heldTime >= WEAPON.holdChargeDelay) {
      // CHARGE phase: the stream stops and charge builds (existing ring/lock cue).
      const cm = chargeMul > 0 ? chargeMul : 1;
      state.charge = Math.min(WEAPON.chargeMax, state.charge + WEAPON.chargeRate * cm * dt);
    } else if (!pressed && state.cooldown <= 0) {
      // AUTOFIRE phase: keep streaming basic volleys, but slower than perfect tapping.
      fired += fireVolley(state, muzzle, pool, WEAPON.autofireInterval);
    }
  }

  // RELEASE: a sufficiently charged hold launches the lock-on bolt.
  if (released) {
    if (state.charge >= WEAPON.chargeThreshold) {
      const s = muzzle.s + WEAPON.muzzleLead;
      spawnProjectile(pool, {
        team: 'player', s, lat: muzzle.lat, vert: muzzle.vert, charged: true,
        aimLat: lock ? lock.lat : 0,
        aimVert: lock ? lock.vert : 0,
      });
      state.shotsFired += 1;
      fired += 1;
    }
    state.charge = 0;
    state.heldTime = 0;
  }
  return fired;
}

// Is the lock cue currently live? (charge past lockStart while holding.)
export function lockEngaged(state) {
  return state.held && state.charge >= WEAPON.lockStart;
}
