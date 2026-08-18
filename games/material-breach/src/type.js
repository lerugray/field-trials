// type.js — THE TYPE SYSTEM. Two faces, argued from the register, and one scale.
//
// MATERIAL BREACH is a game made of documents, and the document it is made of is a PRE-PRINTED
// INSTITUTIONAL FORM: the headings were printed before anything happened, and the entries were
// filled in afterwards by whoever was on shift. So the type is a pair, not a single face:
//
//   DISPLAY — Not Jam Slab Serif 11. A heavy letterpress slab. This is the part of the sheet that
//             was printed at the stationer's: LEDGER, INTEL, DEPARTMENTS, AFTER-ACTION REPORT, the
//             drawing's title block. It never carries a number.
//   BODY    — Not Jam Serif 11. A book serif. This is everything entered onto the form: the rows,
//             the figures, the prose, the notices. It carries every number the game states.
//
// Both are from the Not Jam Font Pack (CC0), both are designed at 11px, and the native buffer is
// integer-scaled, so every glyph lands on whole pixels at every window size. Nothing is drawn at a
// size the faces were not cut for; there is no 9px or 10px anywhere, because a pixel face rendered
// off its design size is a blurred face.
//
// The old renderer drew at 8, 9, 10 and 11px in the platform monospace. Ray's M7a verdict was
// "a little crowded/small" and "better fonts could be used"; this file is the answer to both, and
// it raises the Gate 5 minimum from 8px to 11px rather than lowering it.

// The family names the build's @font-face rules define. The fallbacks matter: the boot smoke test
// runs in a stubbed DOM with no font loading at all, and a browser that somehow failed to load the
// embedded face still has to draw a readable ledger.
export const FACE = Object.freeze({
  display: '"MB Slab", Georgia, serif',
  body: '"MB Serif", Georgia, serif',
});

// The scale. Every size is an INTEGER MULTIPLE of the 11px design size, and that multiple-of-11
// rule is the whole of the law: a pixel face set at 9, 10 or 17px has its pixel edges land between
// device pixels and blurs, while the same face at 22 or 33px lands every edge on a whole pixel and
// stays exactly as crisp as it was cut. Measured on the shipped faces before the masthead was
// drawn: "MATERIAL BREACH" advances 131.53 / 263.05 / 394.58px at 11 / 22 / 33px, an exact 1x / 2x
// / 3x with square stems at all three, while the same string at 17px visibly degrades. So what the
// law forbids is OFF-SIZES, not large type, and the masthead rank below sits inside it.
export const SIZE = Object.freeze({
  masthead: 33, // 3x. The game's name on the charter, and nothing else: this is letterhead type.
  title: 11, // panel titles and section headings, in DISPLAY
  body: 11, // every ledger row, every figure, every notice, in BODY
  note: 11, // annotations on the drawing, in BODY
});

// Leading, as whole pixels. A ledger's rows are ruled and evenly spaced; these are the spacings the
// renderer uses so the sheet has a rhythm instead of a variable dribble of lines.
export const LEAD = Object.freeze({
  row: 14, // a label/value row
  tight: 13, // a wrapped continuation line
  section: 20, // the gap above a new section heading
  rule: 6, // the gap between a heading and the rule under it
});

// font(size, face) -> a canvas font string.
export function font(size, face = FACE.body) {
  return `${size}px ${face}`;
}

// The minimum type size the renderer will draw, asserted by Gate 5.
export const MIN_TEXT_PX = 11;
