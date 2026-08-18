// input.js — device-agnostic input (fleet gamepad standard: ADVERSARY shape).
// Raw devices resolve to SEMANTIC ACTIONS; the sim only ever sees actions, never
// keys or HID indices. Mapping, F310 D-input normalization, rebinding persistence,
// and per-tick edge detection are pure and headless-testable. The browser adapter
// (app.js) feeds raw device state in.

/** Semantic actions the sim and menus understand. */
export const ACTIONS = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  FIRE: 'fire',
  SIDEARM: 'sidearm',
  TUBA: 'tuba',
  PAUSE: 'pause',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  OPTIONS: 'options',
  QUIT: 'quit',
});

export const ACTION_LIST = Object.freeze(Object.values(ACTIONS));

// W3C Standard Gamepad indices. Bindings persist against these logical positions,
// never a vendor's raw HID ordering, so a remap still means the same physical
// control after the player swaps pads.
export const PAD_BUTTONS = Object.freeze({
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  HOME: 16,
});

export const PAD_BUTTON_LABELS = Object.freeze([
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3',
  'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME',
]);

export const GAMEPAD_DEADZONE = 0.35;

export const BINDS_KEY = 'popinjay:binds:v1';

export const REBIND_ROWS = Object.freeze([
  [ACTIONS.LEFT, 'Walk left'],
  [ACTIONS.RIGHT, 'Walk right'],
  [ACTIONS.UP, 'Climb up'],
  [ACTIONS.DOWN, 'Climb down'],
  [ACTIONS.FIRE, 'Fire wire'],
  [ACTIONS.SIDEARM, 'Sidearm'],
  [ACTIONS.TUBA, 'Tuba blast'],
  [ACTIONS.PAUSE, 'Pause'],
  [ACTIONS.OPTIONS, 'Options'],
  [ACTIONS.QUIT, 'Quit to title'],
]);

export const DEFAULT_BINDINGS = Object.freeze({
  [ACTIONS.LEFT]:      { keys: ['ArrowLeft'],  buttons: [PAD_BUTTONS.DPAD_LEFT] },
  [ACTIONS.RIGHT]:     { keys: ['ArrowRight'], buttons: [PAD_BUTTONS.DPAD_RIGHT] },
  [ACTIONS.UP]:        { keys: ['ArrowUp'],    buttons: [PAD_BUTTONS.DPAD_UP] },
  [ACTIONS.DOWN]:      { keys: ['ArrowDown'],  buttons: [PAD_BUTTONS.DPAD_DOWN] },
  [ACTIONS.FIRE]:      { keys: ['KeyZ', 'Space'], buttons: [PAD_BUTTONS.A] },
  [ACTIONS.SIDEARM]:   { keys: ['KeyX'],       buttons: [PAD_BUTTONS.X] },
  [ACTIONS.TUBA]:      { keys: ['KeyT'],       buttons: [PAD_BUTTONS.Y] },
  [ACTIONS.PAUSE]:     { keys: ['Escape', 'KeyP'], buttons: [PAD_BUTTONS.START] },
  [ACTIONS.CONFIRM]:   { keys: ['Enter', 'Space'], buttons: [PAD_BUTTONS.A] },
  [ACTIONS.CANCEL]:    { keys: ['Escape'],     buttons: [PAD_BUTTONS.B] },
  [ACTIONS.OPTIONS]:   { keys: ['KeyO'],       buttons: [PAD_BUTTONS.BACK] },
  [ACTIONS.QUIT]:      { keys: ['KeyQ'],       buttons: [PAD_BUTTONS.LB] },
});

// Menu recovery: these KeyboardEvent.code values always work, even if the player
// rebound the matching action off them. A pad can never lock the player out of menus.
export const RESERVED_MENU_CODES = Object.freeze({
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  confirm: 'Enter',
  cancel: 'Escape',
});

export function padButtonLabel(index) {
  return PAD_BUTTON_LABELS[index] || `B${index}`;
}

export function isRebindCancelCode(code) {
  return code === RESERVED_MENU_CODES.cancel;
}

/**
 * Menu-only recovery: union reserved keyboard codes into an action set, even when
 * the matching actions were rebound off those keys. Does not change resolveActions,
 * so gameplay still honours the rebind; menus cannot be locked out by a pad or a
 * poisoned bind profile. Mutates and returns `active`.
 */
export function applyReservedMenuCodes(active, keys) {
  const held = keys instanceof Set ? keys : new Set(keys || []);
  const out = active instanceof Set ? active : new Set(active || []);
  for (const [action, code] of Object.entries(RESERVED_MENU_CODES)) {
    if (held.has(code)) out.add(action);
  }
  return out;
}

const KEY_NAMES = Object.freeze({
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  Space: 'SPC', Escape: 'ESC', Enter: 'ENTER',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
});

export function keyBindingLabel(bindings, action) {
  const b = bindings[action];
  if (!b || !b.keys.length) return '-';
  return b.keys.map(keyCodeLabel).join('/');
}

export function keyCodeLabel(code) {
  return KEY_NAMES[code] || String(code).replace(/^Key/, '').replace(/^Digit/, '');
}

// A single control cannot mean both directions of one movement axis: resolveActions
// would raise both in the same menu/sim pass and the opposing intents net to zero.
// Other duplicates remain legal (notably the shipped Fire/Confirm and Pause/Cancel).
export const EXCLUSIVE_ACTION_PAIRS = Object.freeze([
  Object.freeze([ACTIONS.LEFT, ACTIONS.RIGHT]),
  Object.freeze([ACTIONS.UP, ACTIONS.DOWN]),
]);

function exclusiveConflict(bindings, action, field, value) {
  const pair = EXCLUSIVE_ACTION_PAIRS.find((actions) => actions.includes(action));
  if (!pair) return null;
  return pair.find((other) => other !== action && bindings[other]?.[field].includes(value)) || null;
}

export function keyBindingConflict(bindings, action, code) {
  return exclusiveConflict(bindings, action, 'keys', code);
}

// The pad half of the same guard. A d-pad button offered to both climb verbs is the
// same zero-intent trap as a shared key, and the Controller pane can reach it too.
export function padBindingConflict(bindings, action, button) {
  return exclusiveConflict(bindings, action, 'buttons', button);
}

export function padBindingLabel(bindings, action) {
  const b = bindings[action];
  if (!b || !b.buttons.length) return '-';
  return b.buttons.map(padButtonLabel).join('/');
}

export function pauseControlLines(bindings) {
  const short = ['L', 'R', 'UP', 'DN', 'FIRE', 'ARM', 'TUBA', 'PAUSE'];
  return REBIND_ROWS.slice(0, 8).map(([action], i) => (
    `${short[i]}:${keyBindingLabel(bindings, action)}>${padBindingLabel(bindings, action)}`
  ));
}

function buttonIsPressed(button) {
  if (typeof button === 'boolean') return button;
  if (typeof button === 'number') return button >= 0.5;
  return !!(button && (button.pressed || button.value >= 0.5));
}

/** Logitech F310 D-input identity as exposed by macOS browsers (USB product c216). */
export function isLogitechF310DInput(gamepad) {
  const id = String(gamepad?.id || '');
  return /logitech/i.test(id) && /(f310|c216|rumblepad\s*2)/i.test(id);
}

function applyHatDpad(buttons, direction) {
  // macOS exposes the D-input POV hat as axis 9. Match Chromium's canonical mapper: -1 is up,
  // values increase clockwise, and 0 is treated as neutral because some devices report it before
  // their first HID update.
  if (!Number.isFinite(direction) || direction === 0) return;
  buttons[PAD_BUTTONS.DPAD_UP] = (direction >= -1 && direction < -0.7)
    || (direction >= 0.95 && direction <= 1);
  buttons[PAD_BUTTONS.DPAD_RIGHT] = direction >= -0.75 && direction < -0.1;
  buttons[PAD_BUTTONS.DPAD_DOWN] = direction >= -0.2 && direction < 0.45;
  buttons[PAD_BUTTONS.DPAD_LEFT] = direction >= 0.4 && direction <= 1;
}

/**
 * Snapshot a browser Gamepad into W3C Standard Gamepad positions.
 *
 * Browsers normally do this and expose `mapping === "standard"`. The explicit F310 path covers
 * its macOS D-input/raw-HID ordering when a browser leaves `mapping` empty: raw X/A/B/Y buttons
 * 0/1/2/3 become standard X/A/B/Y 2/0/1/3, while the POV hat on axis 9 becomes d-pad buttons.
 * Unknown raw layouts are rejected instead of silently assigning the wrong actions.
 */
export function normalizeGamepad(gamepad) {
  if (!gamepad || gamepad.connected === false) return null;
  const rawButtons = Array.from(gamepad.buttons || [], buttonIsPressed);
  const rawAxes = Array.from(gamepad.axes || [], (v) => Number.isFinite(v) ? v : 0);
  const standard = gamepad.mapping === 'standard';
  const f310DInput = !standard && isLogitechF310DInput(gamepad);
  if (!standard && !f310DInput) return null;

  if (standard) {
    return {
      id: String(gamepad.id || ''),
      index: Number.isInteger(gamepad.index) ? gamepad.index : 0,
      mapping: 'standard',
      profile: 'standard',
      buttons: rawButtons,
      axes: rawAxes,
    };
  }

  const buttons = Array(PAD_BUTTON_LABELS.length).fill(false);
  const rawToStandard = [
    PAD_BUTTONS.X, PAD_BUTTONS.A, PAD_BUTTONS.B, PAD_BUTTONS.Y,
    PAD_BUTTONS.LB, PAD_BUTTONS.RB, PAD_BUTTONS.LT, PAD_BUTTONS.RT,
    PAD_BUTTONS.BACK, PAD_BUTTONS.START, PAD_BUTTONS.L3, PAD_BUTTONS.R3,
  ];
  for (let raw = 0; raw < rawToStandard.length; raw++) {
    buttons[rawToStandard[raw]] = !!rawButtons[raw];
  }
  applyHatDpad(buttons, rawAxes[9]);
  return {
    id: String(gamepad.id || ''),
    index: Number.isInteger(gamepad.index) ? gamepad.index : 0,
    mapping: 'standard',
    profile: 'logitech-f310-dinput',
    buttons,
    axes: [rawAxes[0] || 0, rawAxes[1] || 0, rawAxes[2] || 0, rawAxes[5] || 0],
  };
}

export function cloneBindings(src = DEFAULT_BINDINGS) {
  const out = {};
  for (const action of ACTION_LIST) {
    const b = src[action] || { keys: [], buttons: [] };
    out[action] = { keys: [...b.keys], buttons: [...b.buttons] };
  }
  return out;
}

// The rebind seam REFUSES a colliding control (see keyBindingConflict /
// padBindingConflict — app.js rejects the press and tells the player). These
// setters therefore stay dumb: they write exactly what they are given. What the
// refusal cannot reach is a profile that is ALREADY poisoned — a save written by
// a build from before the guard, or hand-edited storage — so loadBindings heals
// one on the way in, and resolveActions keeps a runtime belt underneath both.
function sanitizeExclusiveBindings(bindings) {
  for (const [earlier, later] of EXCLUSIVE_ACTION_PAIRS) {
    if (!bindings[earlier] || !bindings[later]) continue;
    for (const field of ['keys', 'buttons']) {
      const taken = new Set(bindings[later][field]);
      bindings[earlier][field] = bindings[earlier][field].filter((v) => !taken.has(v));
      if (!bindings[earlier][field].length) {
        const restored = (DEFAULT_BINDINGS[earlier][field] || []).filter((v) => !taken.has(v));
        if (restored.length) bindings[earlier][field] = [...restored];
      }
    }
  }
  return bindings;
}

export function setKeyBinding(bindings, action, keys) {
  if (bindings[action]) bindings[action].keys = [...keys];
  return bindings;
}

export function setPadBinding(bindings, action, buttons) {
  if (bindings[action]) bindings[action].buttons = [...buttons];
  return bindings;
}

export function serializeBindings(bindings) {
  const out = {};
  for (const action of ACTION_LIST) {
    const b = bindings[action] || { keys: [], buttons: [] };
    out[action] = { keys: [...b.keys], buttons: [...b.buttons] };
  }
  return out;
}

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
  sanitizeExclusiveBindings(out);
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
        if (buttonIsPressed(pad.buttons[idx])) { on = true; break; }
      }
    }
    if (on) active.add(action);
  }

  // One physical key/button must not light both sides of an exclusive pair.
  // Last-listed action (RIGHT / DOWN) wins; analog stick (below) can still add
  // the other side because that is a second device, not a duplicate binding.
  for (const [earlier, later] of EXCLUSIVE_ACTION_PAIRS) {
    if (!active.has(earlier) || !active.has(later)) continue;
    const bE = bindings[earlier] || { keys: [], buttons: [] };
    const bL = bindings[later] || { keys: [], buttons: [] };
    const sharedKey = bE.keys.some((k) => keys.has(k) && bL.keys.includes(k));
    const sharedPad = !!(pad && pad.buttons && bE.buttons.some((i) => bL.buttons.includes(i) && buttonIsPressed(pad.buttons[i])));
    if (sharedKey || sharedPad) active.delete(earlier);
  }

  // Left analog stick → d-pad, with a deadzone. Additive to button/key input above.
  // Stick direction is an always-available movement/menu fallback (not rebindable).
  if (pad && pad.axes) {
    const [ax = 0, ay = 0] = pad.axes;
    if (ax <= -GAMEPAD_DEADZONE) active.add(ACTIONS.LEFT);
    if (ax >= GAMEPAD_DEADZONE) active.add(ACTIONS.RIGHT);
    if (ay <= -GAMEPAD_DEADZONE) active.add(ACTIONS.UP);
    if (ay >= GAMEPAD_DEADZONE) active.add(ACTIONS.DOWN);
  }
  return active;
}

export function simIntent(active) {
  const set = active instanceof Set ? active : new Set(active || []);
  return {
    left: set.has(ACTIONS.LEFT),
    right: set.has(ACTIONS.RIGHT),
    up: set.has(ACTIONS.UP),
    down: set.has(ACTIONS.DOWN),
    fire: set.has(ACTIONS.FIRE),
    sidearm: set.has(ACTIONS.SIDEARM),
    tuba: set.has(ACTIONS.TUBA),
  };
}

/**
 * Per-action input state with edge detection. Fed one active-action set per
 * animation frame / sim tick; queried in the same tick.
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
    };
  }
  let currentTick = -1;

  return {
    update(active, tick) {
      currentTick = tick;
      const set = active instanceof Set ? active : new Set(active || []);
      for (const action of ACTION_LIST) {
        const s = state[action];
        const isDown = set.has(action);
        if (isDown && !s.down) {
          s.pressTick = tick;
          s.heldTicks = 1;
        } else if (isDown && s.down) {
          s.heldTicks++;
        } else if (!isDown && s.down) {
          s.releaseTick = tick;
          s.releaseHeldTicks = s.heldTicks;
          s.heldTicks = 0;
        }
        s.down = isDown;
      }
    },
    isDown: (a) => state[a].down,
    pressed: (a) => state[a].pressTick === currentTick,
    released: (a) => state[a].releaseTick === currentTick,
    heldTicks: (a) => (state[a].down ? state[a].heldTicks : 0),
    releaseHeldTicks: (a) => state[a].releaseHeldTicks,
    reset() {
      currentTick = Number.MIN_SAFE_INTEGER;
      for (const action of ACTION_LIST) {
        Object.assign(state[action], {
          down: false,
          pressTick: -1,
          releaseTick: -1,
          heldTicks: 0,
          releaseHeldTicks: 0,
        });
      }
    },
    _peek: (a) => ({ ...state[a] }),
  };
}

const UNMAPPED_NOTICE = Object.freeze({
  headline: 'CONTROLLER NOT MAPPED',
  detail: 'USE A STANDARD-MAPPED PAD',
  ticks: 240,
});

export function createPadSession() {
  let activePad = null;
  let previousPadButtons = [];
  let capturedPadButton = -1;
  let controllerNotice = null;
  const disconnectedPadIndices = new Set();

  function connectGamepad(gamepad, announce = true) {
    const pad = normalizeGamepad(gamepad);
    if (!pad) {
      controllerNotice = { ...UNMAPPED_NOTICE };
      return null;
    }
    disconnectedPadIndices.delete(pad.index);
    const changed = !activePad || activePad.index !== pad.index;
    activePad = { index: pad.index, id: pad.id, profile: pad.profile };
    previousPadButtons = [...pad.buttons];
    if (announce && changed) {
      controllerNotice = {
        headline: 'CONTROLLER CONNECTED',
        detail: pad.profile === 'logitech-f310-dinput' ? 'F310 D-INPUT STANDARDIZED' : 'STANDARD GAMEPAD READY',
        ticks: 180,
      };
    }
    return pad;
  }

  function disconnectGamepad(gamepad, { inPlay } = {}) {
    const index = Number.isInteger(gamepad?.index) ? gamepad.index : activePad?.index;
    if (Number.isInteger(index)) disconnectedPadIndices.add(index);
    const affected = !activePad || !Number.isInteger(index) || activePad.index === index;
    if (!affected) return { interruptedPlay: false };
    activePad = null;
    previousPadButtons = [];
    capturedPadButton = -1;
    controllerNotice = {
      headline: 'CONTROLLER DISCONNECTED',
      detail: inPlay ? 'GAME PAUSED · RECONNECT OR USE KEYS' : 'RECONNECT OR USE KEYBOARD',
      ticks: Infinity,
    };
    return { interruptedPlay: !!inPlay };
  }

  function readGamepad(pads) {
    const list = Array.from(pads || []);
    let native = activePad ? list[activePad.index] : null;
    if (!native || disconnectedPadIndices.has(activePad?.index)) {
      native = list.find((p) => p && p.connected !== false && !disconnectedPadIndices.has(p.index));
    }
    if (!native) return null;
    const pad = normalizeGamepad(native);
    if (!pad) return null;
    if (!activePad || activePad.index !== pad.index) return connectGamepad(native);
    return pad;
  }

  return {
    connect: connectGamepad,
    disconnect: disconnectGamepad,
    read: readGamepad,
    edgeButton(pad) {
      const pressedPadButton = pad
        ? pad.buttons.findIndex((down, i) => !!down && !previousPadButtons[i])
        : -1;
      previousPadButtons = pad ? [...pad.buttons] : [];
      return pressedPadButton;
    },
    suppressCaptured(pad) {
      if (capturedPadButton < 0) return pad;
      if (!pad || !pad.buttons[capturedPadButton]) { capturedPadButton = -1; return pad; }
      const actionPad = { ...pad, buttons: [...pad.buttons] };
      actionPad.buttons[capturedPadButton] = false;
      return actionPad;
    },
    capture(idx) { capturedPadButton = idx; },
    tickNotice() {
      if (controllerNotice && Number.isFinite(controllerNotice.ticks) && --controllerNotice.ticks <= 0) {
        controllerNotice = null;
      }
    },
    getNotice: () => controllerNotice,
    isConnected: () => !!activePad,
    getActive: () => activePad,
  };
}
