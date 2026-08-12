// THE JACQUARD INDEX — input state (mouse + keyboard, native-res coords).
//
// Seed law: mouse + keyboard first-class, full keyboard-only play for every verb. The
// DOM shim feeds raw events in; this holds the frame-coherent state the game reads. The
// pure core here is: pointer position (already mapped to native coords by the shim via
// viewport.screenToNative), button state, a held-keys set, and edge queues (pressed /
// released this frame) that the app drains once per update.

export class Input {
  constructor() {
    this.pointer = { x: -1, y: -1, inside: false };
    this.buttons = new Set();      // held mouse buttons (0 left, 2 right)
    this.keys = new Set();         // held key codes
    this._pressedKeys = [];        // key-downs since last drain
    this._releasedKeys = [];
    this._pressedButtons = [];
    this._releasedButtons = [];
  }

  movePointer(x, y, inside) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = !!inside;
  }

  pressButton(b) {
    if (!this.buttons.has(b)) this._pressedButtons.push(b);
    this.buttons.add(b);
  }

  releaseButton(b) {
    if (this.buttons.has(b)) this._releasedButtons.push(b);
    this.buttons.delete(b);
  }

  pressKey(code) {
    if (!this.keys.has(code)) this._pressedKeys.push(code);
    this.keys.add(code);
  }

  releaseKey(code) {
    if (this.keys.has(code)) this._releasedKeys.push(code);
    this.keys.delete(code);
  }

  isDown(code) { return this.keys.has(code); }
  isButtonDown(b) { return this.buttons.has(b); }

  // Called once per frame by the app to snapshot edge events, then clears them so each
  // press is consumed exactly once (no key repeat smear).
  drainFrame() {
    const frame = {
      pressedKeys: this._pressedKeys,
      releasedKeys: this._releasedKeys,
      pressedButtons: this._pressedButtons,
      releasedButtons: this._releasedButtons,
    };
    this._pressedKeys = [];
    this._releasedKeys = [];
    this._pressedButtons = [];
    this._releasedButtons = [];
    return frame;
  }

  // Focus loss / window blur must not leave phantom-held keys (a classic bug source).
  releaseAll() {
    this.buttons.clear();
    this.keys.clear();
  }
}
