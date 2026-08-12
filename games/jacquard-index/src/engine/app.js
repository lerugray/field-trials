// THE JACQUARD INDEX — the app: frame pipeline + scene manager.
//
// Holds the native framebuffer, input state, and debug log; steps the current scene and
// renders it, then paints the fault overlay on top so failures are always visible. The
// DOM shim owns the rAF clock and blitting; this owns the game loop's logic and is pure
// enough to step with an injected dt under `node --test`.
//
// A scene is { enter?(app), update?(app, dtMs, frame), render(app, fb) }.

import { Framebuffer } from '../gfx/framebuffer.js';
import { Input } from './input.js';
import { DebugLog } from './debuglog.js';
import { drawFaultOverlay } from '../gfx/overlay.js';

export class App {
  constructor(baseW, baseH) {
    this.fb = new Framebuffer(baseW, baseH);
    this.input = new Input();
    this.log = new DebugLog();
    this.scene = null;
    this.elapsed = 0; // ms since boot, advanced by step()
    this.frameCount = 0;
    // Shared progress: ids of cards whose pattern has been woven (the index state).
    this.progress = new Set();
  }

  setScene(scene) {
    this.scene = scene;
    if (scene && typeof scene.enter === 'function') {
      this._guard('scene.enter', () => scene.enter(this));
    }
    return this;
  }

  // Run one game step. dtMs is elapsed since the last step. Errors in scene code are
  // caught and logged (loud, not fatal) so one bad frame never white-screens the game.
  step(dtMs) {
    this.elapsed += dtMs;
    this.frameCount++;
    const frame = this.input.drainFrame();
    if (this.scene && typeof this.scene.update === 'function') {
      this._guard('scene.update', () => this.scene.update(this, dtMs, frame));
    }
    return frame;
  }

  // Render the current scene into the framebuffer, then the fault overlay.
  render() {
    if (this.scene && typeof this.scene.render === 'function') {
      this._guard('scene.render', () => this.scene.render(this, this.fb));
    }
    drawFaultOverlay(this.fb, this.log);
    return this.fb;
  }

  _guard(where, fn) {
    try {
      fn();
    } catch (err) {
      this.log.error(`${where}: ${err && err.message ? err.message : err}`, Math.round(this.elapsed));
    }
  }
}
