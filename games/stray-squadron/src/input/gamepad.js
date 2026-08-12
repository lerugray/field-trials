// Gamepad probe — the live input source and the data behind the M1 input-debug
// overlay. Target pad is the Logitech F310 in DirectInput (D) mode: left stick
// axes 0/1, right stick axes 2/3 (the "axes 2/3 on Mac" note in DESIGN-SEED).
// We read raw axes/buttons straight from the Gamepad API and apply our own
// radial deadzone (deadzone.js) rather than trusting per-driver behavior.
// Browser-only.

import { applyDeadzone, DEFAULT_DEADZONE } from './deadzone.js';

export function createGamepad() {
  // S5: reuse scratch arrays + button objects across polls so a 60fps read does not
  // allocate a fresh axes array plus one object per button every frame. The poll result
  // is a per-frame snapshot (callers read it within the frame, never hold it), so
  // reusing the backing storage is safe.
  const axesRaw = [];
  const buttons = [];
  const snap = {
    id: '', index: 0, mapping: '', axesRaw, buttons,
    left: [0, 0], right: [0, 0], deadzone: DEFAULT_DEADZONE,
  };

  return {
    // Snapshot of the first connected pad, or null if none. `deadzone` is the
    // exposed constant/option (M1 requirement); a full remap UI waits for M9.
    poll(deadzone = DEFAULT_DEADZONE) {
      const pads =
        typeof navigator !== 'undefined' && navigator.getGamepads
          ? navigator.getGamepads()
          : [];
      let gp = null;
      for (const p of pads) {
        if (p) { gp = p; break; }
      }
      if (!gp) return null;

      axesRaw.length = gp.axes.length;
      for (let i = 0; i < gp.axes.length; i++) axesRaw[i] = gp.axes[i];
      buttons.length = gp.buttons.length;
      for (let i = 0; i < gp.buttons.length; i++) {
        const b = gp.buttons[i];
        if (!buttons[i]) buttons[i] = { pressed: false, value: 0 };
        buttons[i].pressed = b.pressed;
        buttons[i].value = b.value;
      }
      const [lx, ly] = applyDeadzone(axesRaw[0] || 0, axesRaw[1] || 0, deadzone);
      const [rx, ry] = applyDeadzone(axesRaw[2] || 0, axesRaw[3] || 0, deadzone);

      snap.id = gp.id;
      snap.index = gp.index;
      snap.mapping = gp.mapping || '(unmapped / DirectInput)';
      snap.left[0] = lx; snap.left[1] = ly;
      snap.right[0] = rx; snap.right[1] = ry;
      snap.deadzone = deadzone;
      return snap;
    },
  };
}
