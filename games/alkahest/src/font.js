/* ALKAHEST -- font: a code-drawn 5x7 bitmap font (no image assets).
 *
 * Uppercase, digits, and the punctuation the UI needs. Every glyph is drawn by
 * code into the FrameBuffer, at integer scale, with optional engraved mode
 * (dark inset + light bevel) for brass chrome. Reused by title, HUD, folio.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  /* Each glyph: 7 rows of 5 columns. "1" = ink. */
  var G = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    ":": ["00000", "01100", "01100", "00000", "00000", "01100", "01100"],
    "'": ["01100", "00100", "01000", "00000", "00000", "00000", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"]
  };

  AL.FONT = { glyphs: G, cw: 5, ch: 7 };

  /* Width in native px of a string at the given scale + letter spacing. */
  AL.textWidth = function (str, scale, spacing) {
    scale = scale || 1;
    spacing = spacing === undefined ? 1 : spacing;
    if (str.length === 0) return 0;
    return str.length * (5 * scale + spacing * scale) - spacing * scale;
  };

  /* Draw one glyph at (x,y) native px, `scale` integer, color [r,g,b], alpha. */
  function drawGlyph(fb, ch, x, y, scale, color, alpha) {
    var rows = G[ch] || G[" "];
    for (var ry = 0; ry < 7; ry++) {
      var row = rows[ry];
      for (var rx = 0; rx < 5; rx++) {
        if (row.charCodeAt(rx) === 49 /* '1' */) {
          fb.rect(x + rx * scale, y + ry * scale, scale, scale, color[0], color[1], color[2], alpha);
        }
      }
    }
  }

  /* Draw a string. opts: {scale, spacing, alpha, color}. Returns end x. */
  AL.drawText = function (fb, str, x, y, color, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var spacing = opts.spacing === undefined ? 1 : opts.spacing;
    var alpha = opts.alpha === undefined ? 1 : opts.alpha;
    str = String(str).toUpperCase();
    var cx = x;
    for (var i = 0; i < str.length; i++) {
      drawGlyph(fb, str[i], cx, y, scale, color, alpha);
      cx += 5 * scale + spacing * scale;
    }
    return cx - spacing * scale;
  };

  /* Centered draw within [0,fb.w). Returns start x used. */
  AL.drawTextCentered = function (fb, str, y, color, opts) {
    opts = opts || {};
    var w = AL.textWidth(String(str), opts.scale || 1, opts.spacing === undefined ? 1 : opts.spacing);
    var x = Math.round((fb.w - w) / 2);
    AL.drawText(fb, str, x, y, color, opts);
    return x;
  };

  /* Engraved text: a dark inset shadow (down-right) under a light face, for
   * brass plaques and chrome. shadow/face are [r,g,b]. */
  AL.drawTextEngraved = function (fb, str, x, y, face, shadow, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    AL.drawText(fb, str, x + scale, y + scale, shadow, opts);
    AL.drawText(fb, str, x, y, face, opts);
  };

  AL.drawTextEngravedCentered = function (fb, str, y, face, shadow, opts) {
    opts = opts || {};
    var w = AL.textWidth(String(str), opts.scale || 1, opts.spacing === undefined ? 1 : opts.spacing);
    var x = Math.round((fb.w - w) / 2);
    AL.drawTextEngraved(fb, str, x, y, face, shadow, opts);
    return x;
  };
});
