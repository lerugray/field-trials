// Keyboard input — the full keyboard fallback required from the first playable
// build. Tracks held keys and exposes a steering-axes read matching the gamepad
// stick, so downstream flight code is input-source-agnostic. Browser-only.

const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

export function createKeyboard(target) {
  const win = target || window;
  const down = new Set();

  const onDown = (e) => {
    down.add(e.code);
    if (SCROLL_KEYS.has(e.code)) e.preventDefault(); // don't scroll the page
  };
  const onUp = (e) => down.delete(e.code);
  const onBlur = () => down.clear(); // never leave a key stuck on focus loss

  win.addEventListener('keydown', onDown);
  win.addEventListener('keyup', onUp);
  win.addEventListener('blur', onBlur);

  return {
    isDown: (code) => down.has(code),
    held: () => [...down],
    // Steering axes: x = left/right, y = up/down (screen sense; +y is down,
    // matching a stick's raw Y — flight code applies invert-Y as a preference).
    axes() {
      let x = 0, y = 0;
      if (down.has('ArrowLeft') || down.has('KeyA')) x -= 1;
      if (down.has('ArrowRight') || down.has('KeyD')) x += 1;
      if (down.has('ArrowUp') || down.has('KeyW')) y -= 1;
      if (down.has('ArrowDown') || down.has('KeyS')) y += 1;
      return [x, y];
    },
    dispose() {
      win.removeEventListener('keydown', onDown);
      win.removeEventListener('keyup', onUp);
      win.removeEventListener('blur', onBlur);
    },
  };
}
