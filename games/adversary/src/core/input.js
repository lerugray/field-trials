// input.js — device-agnostic input abstraction (DESIGN-SEED "STACK": keyboard+gamepad, remap
// scaffold). Raw devices resolve to SEMANTIC ACTIONS; the sim only ever sees actions, never keys.
// Mapping and per-tick state are pure and headless-testable; a thin browser adapter (src/render or
// main) feeds raw device state in. Leniency windows (double-tap, charge) come from the feel table.

import { FEEL } from '../config/feel.js';

/** Semantic actions the sim understands. Every kit verb + menu verb has one. */
export const ACTIONS = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  JUMP: 'jump',
  ATTACK: 'attack',
  SUBWEAPON: 'subweapon',
  DODGE: 'dodge',
  MENU: 'menu',       // opens action menu (pauses)
  PAUSE: 'pause',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
});

export const ACTION_LIST = Object.freeze(Object.values(ACTIONS));

// Default bindings. Keys are KeyboardEvent.code values. Pad buttons are standard-gamepad indices;
// pad axes map the left stick to the d-pad with a deadzone. All of this is remappable at runtime.
export const DEFAULT_BINDINGS = Object.freeze({
  [ACTIONS.LEFT]:      { keys: ['ArrowLeft', 'KeyA'],  buttons: [14] },
  [ACTIONS.RIGHT]:     { keys: ['ArrowRight', 'KeyD'], buttons: [15] },
  [ACTIONS.UP]:        { keys: ['ArrowUp', 'KeyW'],    buttons: [12] },
  [ACTIONS.DOWN]:      { keys: ['ArrowDown', 'KeyS'],  buttons: [13] },
  [ACTIONS.JUMP]:      { keys: ['KeyK', 'Space'],      buttons: [0] },  // A
  [ACTIONS.ATTACK]:    { keys: ['KeyJ'],               buttons: [2] },  // X
  [ACTIONS.SUBWEAPON]: { keys: ['KeyL'],               buttons: [3] },  // Y
  [ACTIONS.DODGE]:     { keys: ['KeyH', 'ShiftLeft'],  buttons: [1] },  // B (single-button dodge alt)
  [ACTIONS.MENU]:      { keys: ['Enter'],              buttons: [9] },  // Start
  [ACTIONS.PAUSE]:     { keys: ['Escape'],             buttons: [8] },  // Select
  [ACTIONS.CONFIRM]:   { keys: ['KeyK', 'Enter'],      buttons: [0] },
  [ACTIONS.CANCEL]:    { keys: ['KeyH', 'Escape'],     buttons: [1] },
});

const AXIS_DEADZONE = 0.5;

/** Deep-clone the default bindings into a mutable bindings object. */
export function cloneBindings(src = DEFAULT_BINDINGS) {
  const out = {};
  for (const action of ACTION_LIST) {
    const b = src[action] || { keys: [], buttons: [] };
    out[action] = { keys: [...b.keys], buttons: [...b.buttons] };
  }
  return out;
}

/** Rebind an action's keyboard keys (remap). Returns the bindings for chaining. */
export function setKeyBinding(bindings, action, keys) {
  if (bindings[action]) bindings[action].keys = [...keys];
  return bindings;
}

/** Rebind an action's gamepad buttons (remap). */
export function setPadBinding(bindings, action, buttons) {
  if (bindings[action]) bindings[action].buttons = [...buttons];
  return bindings;
}

/** Serialize bindings to a plain JSON-safe object for persistence. */
export function serializeBindings(bindings) {
  const out = {};
  for (const action of ACTION_LIST) {
    const b = bindings[action] || { keys: [], buttons: [] };
    out[action] = { keys: [...b.keys], buttons: [...b.buttons] };
  }
  return out;
}

/** Load bindings from a serialized object, filling any missing/invalid action from the defaults. */
export function loadBindings(obj) {
  const out = cloneBindings(DEFAULT_BINDINGS);
  if (obj && typeof obj === 'object') {
    for (const action of ACTION_LIST) {
      const b = obj[action];
      if (b && Array.isArray(b.keys) && Array.isArray(b.buttons)) {
        out[action] = { keys: [...b.keys], buttons: [...b.buttons] };
      }
    }
  }
  return out;
}

/**
 * Resolve raw device state into the set of currently-active actions.
 * @param {object} raw
 * @param {Set<string>|string[]} [raw.keys] - KeyboardEvent.code values currently held.
 * @param {{buttons?:boolean[], axes?:number[]}} [raw.pad] - a standard gamepad snapshot.
 * @param {object} [bindings=DEFAULT_BINDINGS]
 * @returns {Set<string>} active ACTIONS values.
 */
export function resolveActions(raw = {}, bindings = DEFAULT_BINDINGS) {
  const keys = raw.keys instanceof Set ? raw.keys : new Set(raw.keys || []);
  const pad = raw.pad || null;
  const active = new Set();

  for (const action of ACTION_LIST) {
    const b = bindings[action];
    if (!b) continue;
    let on = false;
    for (const k of b.keys) {
      if (keys.has(k)) { on = true; break; }
    }
    if (!on && pad && pad.buttons) {
      for (const idx of b.buttons) {
        if (pad.buttons[idx]) { on = true; break; }
      }
    }
    if (on) active.add(action);
  }

  // Left analog stick → d-pad, with a deadzone. Additive to button/key input above.
  if (pad && pad.axes) {
    const [ax = 0, ay = 0] = pad.axes;
    if (ax <= -AXIS_DEADZONE) active.add(ACTIONS.LEFT);
    if (ax >= AXIS_DEADZONE) active.add(ACTIONS.RIGHT);
    if (ay <= -AXIS_DEADZONE) active.add(ACTIONS.UP);
    if (ay >= AXIS_DEADZONE) active.add(ACTIONS.DOWN);
  }
  return active;
}

/**
 * Per-action input state with edge detection and leniency windows. Fed one active-action set per
 * sim tick; queried by the sim in the same tick.
 */
export function createInputState() {
  const state = {};
  for (const action of ACTION_LIST) {
    state[action] = {
      down: false,
      pressTick: -1,
      releaseTick: -1,
      heldTicks: 0,
      releaseHeldTicks: 0,
      lastPressTick: -Infinity,
      doubleTapTick: -1,
    };
  }
  let currentTick = -1;

  return {
    /** Advance state for one tick given the active-action set. */
    update(active, tick) {
      currentTick = tick;
      const set = active instanceof Set ? active : new Set(active || []);
      for (const action of ACTION_LIST) {
        const s = state[action];
        const isDown = set.has(action);
        if (isDown && !s.down) {
          // press edge
          if (tick - s.lastPressTick <= FEEL.DOUBLE_TAP_TICKS) s.doubleTapTick = tick;
          s.lastPressTick = tick;
          s.pressTick = tick;
          s.heldTicks = 1;
        } else if (isDown && s.down) {
          s.heldTicks++;
        } else if (!isDown && s.down) {
          // release edge
          s.releaseTick = tick;
          s.releaseHeldTicks = s.heldTicks;
          s.heldTicks = 0;
        }
        s.down = isDown;
      }
    },
    isDown: (a) => state[a].down,
    /** True only on the tick the action was pressed. */
    pressed: (a) => state[a].pressTick === currentTick,
    /** True only on the tick the action was released. */
    released: (a) => state[a].releaseTick === currentTick,
    /** Consecutive ticks currently held (0 if up). */
    heldTicks: (a) => (state[a].down ? state[a].heldTicks : 0),
    /** True only on the tick a qualifying double-tap completed. */
    doubleTapped: (a) => state[a].doubleTapTick === currentTick,
    /**
     * Charge amount 0..1 while held, clamped between CHARGE_MIN and CHARGE_FULL. 0 below the min
     * threshold (a quick press is a normal strike, not a charge).
     */
    chargeRatio(a) {
      const held = state[a].down ? state[a].heldTicks : 0;
      if (held < FEEL.CHARGE_MIN_TICKS) return 0;
      return Math.min(1, held / FEEL.CHARGE_FULL_TICKS);
    },
    /** Held-tick count captured at the moment of release (for release-timed charges). */
    releaseHeldTicks: (a) => state[a].releaseHeldTicks,
    /** Raw state access for tests/debug. */
    _peek: (a) => ({ ...state[a] }),
  };
}
