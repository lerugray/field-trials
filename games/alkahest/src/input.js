/* ALKAHEST -- input: keyboard state with edge detection.
 *
 * A thin, testable layer: down-state plus per-frame "just pressed" edges. The
 * loop calls beginFrame() once per tick after reading edges. Physical keys map
 * to semantic ACTIONS (swap/raise/cast/pause/...) through a rebindable table --
 * key rebinding is an M6 line item, so the indirection lives here from the
 * start. The DOM listeners attach only when a window is present; the state
 * machine itself is pure and unit-tested.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  function Input() {
    this.down = Object.create(null);
    this.pressed = Object.create(null); // edges since last beginFrame
    // default semantic bindings (physical code -> action), rebindable in M6
    this.bindings = {
      "ArrowLeft": "left", "ArrowRight": "right", "ArrowUp": "up", "ArrowDown": "down",
      "KeyA": "left", "KeyD": "right", "KeyW": "up", "KeyS": "down",
      "Space": "swap", "KeyJ": "swap",
      "ShiftLeft": "raise", "ShiftRight": "raise", "KeyK": "raise",
      "Enter": "confirm", "Escape": "pause",
      // option / active-cast keys: 1-4 select a draft/workshop card AND cast the
      // player's bound active brews in a bout (STUDY-run §4)
      "Digit1": "opt1", "Digit2": "opt2", "Digit3": "opt3", "Digit4": "opt4",
      "KeyU": "upgrade", "KeyX": "remove",
      "KeyL": "exportlog"
    };
  }

  Input.prototype.onDown = function (code) {
    if (!this.down[code]) this.pressed[code] = true; // rising edge only
    this.down[code] = true;
  };
  Input.prototype.onUp = function (code) { this.down[code] = false; };

  /* physical key queries */
  Input.prototype.isDown = function (code) { return !!this.down[code]; };
  Input.prototype.justPressed = function (code) { return !!this.pressed[code]; };

  /* semantic action queries (through the binding table) */
  Input.prototype.actionDown = function (action) {
    for (var code in this.bindings) if (this.bindings[code] === action && this.down[code]) return true;
    return false;
  };
  Input.prototype.actionPressed = function (action) {
    for (var code in this.bindings) if (this.bindings[code] === action && this.pressed[code]) return true;
    return false;
  };

  /* call once per frame AFTER reading edges */
  Input.prototype.beginFrame = function () { this.pressed = Object.create(null); };

  /* browser: attach listeners; preventDefault on game keys so the page stays put */
  Input.prototype.attach = function (win) {
    var self = this;
    var swallow = { "ArrowLeft": 1, "ArrowRight": 1, "ArrowUp": 1, "ArrowDown": 1, "Space": 1 };
    win.addEventListener("keydown", function (e) {
      if (e.repeat) { return; }
      self.onDown(e.code);
      if (swallow[e.code]) e.preventDefault();
    });
    win.addEventListener("keyup", function (e) { self.onUp(e.code); });
    // drop all held keys if focus is lost, so nothing sticks
    win.addEventListener("blur", function () { self.down = Object.create(null); });
    return self;
  };

  AL.Input = Input;
});
