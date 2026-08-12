// Game-action remapping for keyboard, mouse buttons, and controller buttons.
// Pure logic with an INJECTABLE storage (localStorage in the browser, a plain object
// in tests), same shape as settings.js, so the remap/steal/reset/persist rules are
// headless-testable. The browser input read (keyboard.axes / isDown) routes through
// this so a rebind actually changes what the keys do.
//
// Model: a fixed, ordered list of game ACTIONS. Every input class has two bind slots
// per action. Keyboard values are KeyboardEvent.code strings; mouse/controller values
// are button indices. Within one class, an input can own only one action. Rebinding an
// occupied input STEALS it from the old slot, matching the original M9 keyboard rule.

// Ordered so the options menu lists them in a sensible reading order.
export const REMAP_ACTIONS = [
  { id: 'steerUp', label: 'Steer up', defaults: ['KeyW', 'ArrowUp'] },
  { id: 'steerDown', label: 'Steer down', defaults: ['KeyS', 'ArrowDown'] },
  { id: 'steerLeft', label: 'Steer left', defaults: ['KeyA', 'ArrowLeft'] },
  { id: 'steerRight', label: 'Steer right', defaults: ['KeyD', 'ArrowRight'] },
  { id: 'fire', label: 'Fire blaster', defaults: ['KeyJ', 'KeyF'], mouse: [0, null], controller: [2, 3] },
  { id: 'boost', label: 'Boost', defaults: ['Space', 'ShiftLeft'], controller: [0, 7] },
  { id: 'brake', label: 'Brake', defaults: ['ShiftRight', 'ControlLeft'], controller: [1, 6] },
  { id: 'rollLeft', label: 'Barrel roll left', defaults: ['KeyQ', null], controller: [4, null] },
  { id: 'rollRight', label: 'Barrel roll right', defaults: ['KeyE', null], controller: [5, null] },
];
// Pause / assist menu is deliberately NOT remappable: Esc always opens it, so a
// bad rebind can never strand a player away from the accessibility surface.

export const INPUT_CLASSES = ['keyboard', 'mouse', 'controller'];
export const BINDINGS_VERSION = 2;
const KEY = 'stray.bindings';
const ACTION_IDS = REMAP_ACTIONS.map((a) => a.id);
const SLOTS = 2;

function defaults() {
  const b = { keyboard: {}, mouse: {}, controller: {} };
  for (const a of REMAP_ACTIONS) {
    b.keyboard[a.id] = [a.defaults[0] ?? null, a.defaults[1] ?? null];
    b.mouse[a.id] = [a.mouse?.[0] ?? null, a.mouse?.[1] ?? null];
    b.controller[a.id] = [a.controller?.[0] ?? null, a.controller?.[1] ?? null];
  }
  return b;
}

function validValue(inputClass, value) {
  if (value === null) return true;
  return inputClass === 'keyboard'
    ? typeof value === 'string'
    : Number.isInteger(value) && value >= 0;
}

// Coerce arbitrary stored data back to a valid two-slot-per-action shape, and enforce
// uniqueness even if hand-edited storage contains duplicates.
function sanitizeClass(raw, inputClass, fallback) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const id of ACTION_IDS) {
      const v = raw[id];
      if (Array.isArray(v)) {
        out[id] = [
          validValue(inputClass, v[0]) ? v[0] : null,
          validValue(inputClass, v[1]) ? v[1] : null,
        ];
      }
    }
  }
  const used = new Set();
  for (const id of ACTION_IDS) {
    if (!out[id]) out[id] = [...fallback[id]];
    for (let slot = 0; slot < SLOTS; slot++) {
      const value = out[id][slot];
      if (value === null) continue;
      const token = typeof value + ':' + value;
      if (used.has(token)) out[id][slot] = null;
      else used.add(token);
    }
  }
  return out;
}

function sanitize(raw) {
  const d = defaults();
  // M9 payloads were an unversioned keyboard action map. Treat that exact shape as
  // keyboard intent and add the new mouse/controller defaults.
  const legacy = raw && typeof raw === 'object' && !raw.keyboard;
  return {
    keyboard: sanitizeClass(legacy ? raw : raw?.keyboard, 'keyboard', d.keyboard),
    mouse: sanitizeClass(legacy ? null : raw?.mouse, 'mouse', d.mouse),
    controller: sanitizeClass(legacy ? null : raw?.controller, 'controller', d.controller),
  };
}

// Human labels for the common codes the game binds, for the remap UI.
export function keyLabel(code) {
  if (!code) return '—';
  const map = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Space: 'Space', Escape: 'Esc', Enter: 'Enter',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', Backspace: 'Bksp',
  };
  if (map[code]) return map[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num' + code.slice(6);
  return code;
}

export function inputLabel(inputClass, value) {
  if (value === null || value === undefined) return '—';
  if (inputClass === 'keyboard') return keyLabel(value);
  if (inputClass === 'mouse') return ['Left', 'Middle', 'Right'][value] || ('Button ' + (value + 1));
  const pad = [
    'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
    'Back', 'Start', 'L3', 'R3', 'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right',
  ];
  return pad[value] || ('Button ' + value);
}

export function createBindings(storage) {
  const store =
    storage || (typeof localStorage !== 'undefined' ? localStorage : null);

  let b = defaults();
  if (store) {
    try {
      const raw = store.getItem(KEY);
      if (raw) b = sanitize(JSON.parse(raw));
    } catch (e) {
      /* corrupt/unavailable -> defaults, never throw */
    }
  }

  function persist() {
    if (!store) return;
    try {
      store.setItem(KEY, JSON.stringify({ v: BINDINGS_VERSION, ...b }));
    } catch (e) {
      /* storage full/blocked -> keep in-memory */
    }
  }

  // Reverse lookup: which (action, slot) currently owns this key, or null.
  function ownerOf(value, inputClass) {
    if (value === null || value === undefined) return null;
    for (const id of ACTION_IDS) {
      for (let s = 0; s < SLOTS; s++) {
        if (b[inputClass][id][s] === value) return { action: id, slot: s, inputClass };
      }
    }
    return null;
  }

  return {
    all: () => JSON.parse(JSON.stringify(b)),
    slots: (action, inputClass = 'keyboard') =>
      (b[inputClass]?.[action] ? [...b[inputClass][action]] : [null, null]),
    primary: (action, inputClass = 'keyboard') =>
      (b[inputClass]?.[action] ? b[inputClass][action][0] : null),
    actionFor(value, inputClass = 'keyboard') {
      if (!INPUT_CLASSES.includes(inputClass)) return null;
      const o = ownerOf(value, inputClass);
      return o ? o.action : null;
    },

    // Is `action` currently active, given a `isKeyDown(code)` predicate (the keyboard
    // module's isDown). True if ANY bound slot's key is held.
    isDown(action, isInputDown, inputClass = 'keyboard') {
      const values = b[inputClass]?.[action];
      if (!values) return false;
      return (values[0] !== null && isInputDown(values[0])) ||
        (values[1] !== null && isInputDown(values[1])) || false;
    },

    // Rebind (action, slot) to `code`. Passing null clears the slot. If `code` is
    // already bound to a DIFFERENT (action, slot), that slot is cleared first (steal),
    // so no key ever triggers two actions. Returns { ok, stole } where `stole` names
    // the slot the key was taken from, or null. Rebinding a key to the slot it already
    // occupies is a harmless no-op.
    rebind(action, slot, value, inputClass = 'keyboard') {
      if (!ACTION_IDS.includes(action) || !INPUT_CLASSES.includes(inputClass) ||
          slot < 0 || slot >= SLOTS || !validValue(inputClass, value))
        return { ok: false, stole: null };
      if (value === null) {
        b[inputClass][action][slot] = null;
        persist();
        return { ok: true, stole: null };
      }
      const prev = ownerOf(value, inputClass);
      let stole = null;
      if (prev && !(prev.action === action && prev.slot === slot)) {
        b[inputClass][prev.action][prev.slot] = null;
        stole = prev;
      }
      b[inputClass][action][slot] = value;
      persist();
      return { ok: true, stole };
    },

    // Back to the shipped defaults.
    reset() {
      b = defaults();
      persist();
    },
  };
}
