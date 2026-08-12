// SHOELEATHER — engine constants.
//
// Fixed logical resolution for the WORLD raster (DESIGN-SEED stack law). 16:9 at a
// low native res; the browser integer-upscales to fit. The crisp text layer renders
// at device resolution above this, so UI text is never bound to these pixels.

export const LOGICAL_W = 384;
export const LOGICAL_H = 216;

// Preferred integer upscale factors the browser will choose among to fit the window.
export const UPSCALE_STEPS = Object.freeze([2, 3, 4, 5, 6]);

// The SWAPPABLE title layer (DIRECTIONS 2026-08-10 item 3): the game name lives in ONE
// place so a rename costs one increment. No scene bakes the name into art; the title
// screen and the document title both read these constants.
export const GAME_TITLE = 'SHOELEATHER';
export const GAME_SUBTITLE = 'an inverted mystery';

// The selectable cases shown on the title screen (id -> query flag + display).
export const CASES = Object.freeze([
  { param: 'case=1', title: 'A Segment, Taped Early', blurb: 'A television kitchen. A partner with the books.' },
  { param: 'case=2', title: 'The Hour Put Back', blurb: 'A crossing at night. An auditor who counted too well.' },
]);
