// palette.js — THE CURATED PALETTE, in named ramps, dark to light (DESIGN-SEED §4.5 item 4).
//
// Everything in the game draws from this file, so the whole screen reads as one picture: an
// architectural section drawn in cold worked stone, sitting on a desk beside a sheet of aged
// manila with ink on it. Two saturated accents only, and both of them are instruments: brass for
// worked value, stamp-red for a served notice. Nothing else is allowed to shout.
//
// A ramp is an ordered array of hex strings, index 0 darkest. Renderers select a STEP rather than
// a colour: material picks the ramp, light picks the index (§4.5 item 2). That is why the ramps
// are even in perceived spacing and never change hue family mid-ramp.
//
// This module is pure data plus two lookups. No clock, no randomness, no state.

// ---- the ramps ------------------------------------------------------------------------------

export const RAMPS = Object.freeze({
  // Unexcavated rock: cold, dead, and nearly out of the picture. The section drawing's negative.
  rock: ['#08090b', '#0f1116', '#161920', '#1e222a', '#272c36', '#313742'],

  // Worked stone: everything the facility has carved and holds. The body of the drawing.
  stone: ['#15161a', '#202228', '#2d3038', '#3b3f49', '#4b505c', '#5d6371', '#707788'],

  // Plaster: claimed, finished, institutional surface. Warmer than stone, and duller, on purpose.
  plaster: ['#26261f', '#34342b', '#434339', '#545448', '#666658', '#7a7a6a', '#8e8e7d'],

  // Aged manila: the ledger, the notices, the forms. The lit half of the desk.
  paper: ['#5f5747', '#786e5a', '#8f846c', '#a5987d', '#bbac90', '#cfbfa2', '#e0d0b4'],

  // Ink: what is written on the paper, and the section lines drawn on the stone.
  ink: ['#100f0c', '#1d1b15', '#2b2820', '#3b372c', '#4d4738', '#615945', '#776d55'],

  // Brass: worked value. Gold seams, treasury fittings, the receipt figures.
  brass: ['#33270f', '#4d3a17', '#6d5220', '#8e6c2b', '#b08838', '#cca44a', '#e2c069'],

  // Rust: structural loss. Damage annotations, dilapidation, the condemned edge.
  rust: ['#26100d', '#3c1914', '#56261e', '#71362a', '#8e4837', '#a95f48', '#c07c5f'],

  // Verdigris: the Cornerstone, and the cold institutional accent that belongs to it alone.
  verdigris: ['#0b1c1b', '#122d2b', '#1b423e', '#275b55', '#37766d', '#4f9287', '#72b0a4'],

  // Stamp: the red ink of a served instrument. Used nowhere that an instrument is not standing.
  stamp: ['#320a0a', '#4c1111', '#671a18', '#87261f', '#a53a2e', '#c25443'],

  // Bone: light text and rules on the dark half of the desk.
  bone: ['#6e6a5e', '#847f70', '#9a9484', '#b1aa97', '#c6bfa9', '#dad2bb', '#ece4cc'],
});

// ---- named colours, all of them a step of a ramp ---------------------------------------------
//
// Every colour the game draws is named here, and every one of them is `RAMPS.<ramp>[<step>]`.
// A colour that is not in this table does not get drawn (the register lint for art).

export const C = Object.freeze({
  // The desk itself: the surface the two panels sit on.
  desk: RAMPS.ink[0],
  deskEdge: RAMPS.ink[2],

  // The cutaway (dark half).
  sectionVoid: RAMPS.rock[0],
  sectionRule: RAMPS.stone[2],
  sectionLabel: RAMPS.bone[3],
  sectionText: RAMPS.bone[5],

  // The ledger (lit half).
  paperBase: RAMPS.paper[4],
  paperHigh: RAMPS.paper[6],
  paperShade: RAMPS.paper[2],
  paperEdge: RAMPS.ink[3],
  inkBody: RAMPS.ink[0],
  // RUNNING COPY on an overlay sheet: the charter's paragraphs, the credits, the key list. It used
  // to be set in inkSecondary (ink[2]) along with every other subordinate mark, and Ray's verdict on
  // the opening was that the body was "tough to read with the CRT dither". Prose is not a caption:
  // it is the thing a player has to READ, at length, on a ground that has fibre and a dither in it.
  // So it gets its own rank, one step darker than a secondary label and one step lighter than a
  // heading — the hierarchy survives (headings stay ink[0], labels and captions stay ink[2]) and the
  // paragraphs stop fighting their own paper.
  inkCopy: RAMPS.ink[1],
  inkSecondary: RAMPS.ink[2],
  inkRule: RAMPS.ink[4],

  // Instruments and accents.
  brassMark: RAMPS.brass[1],
  brassBright: RAMPS.brass[5],
  stampInk: RAMPS.stamp[1],
  stampBright: RAMPS.stamp[4],
  cornerstone: RAMPS.verdigris[5],
  cornerstoneDim: RAMPS.verdigris[3],
  rustMark: RAMPS.rust[1],
  rustBright: RAMPS.rust[6], // step 6, not 5: step 5 measures 4.19:1 on the void, below Gate 5

  // Buttons live on the desk, below both panels.
  buttonFace: RAMPS.stone[1],
  buttonFaceOff: RAMPS.stone[0],
  buttonEdge: RAMPS.stone[3],
  buttonEdgeOff: RAMPS.stone[1],
  buttonText: RAMPS.bone[6],
  buttonTextOff: RAMPS.bone[1],
});

// The department ramps. A department is a material, not a hue swatch: it picks the ramp its
// surfaces select their light step from, so a big well-lit department and a small dark one are the
// same department drawn at different steps (fold 7: quality reads as ramp-step density).
export const DEPT_RAMP = Object.freeze({
  treasury: 'brass',
  records: 'paper',
  fabrication: 'rust',
  holding: 'stone',
  quarters: 'plaster',
  commissary: 'plaster',
  excavation: 'stone',
});

// The cast ramps. Staff are drawn from the facility's own materials, so they belong to the
// building; raiders and officers are drawn from ramps the facility does not use for its fabric,
// so they read as arriving from outside it.
export const CAST_RAMP = Object.freeze({
  drudge: 'plaster',
  clerk: 'paper',
  artificer: 'rust',
  warden: 'stone',
  raider: 'bone',
  officer: 'stamp',
});

// ---- lookups ---------------------------------------------------------------------------------

// step(rampName, i) -> hex. The index is clamped, so a lighting calculation can overshoot without
// a bounds check at every call site and without ever selecting a colour outside the palette.
export function step(rampName, i) {
  const ramp = RAMPS[rampName];
  if (!ramp) throw new Error(`palette: unknown ramp '${rampName}'`);
  const n = ramp.length;
  const k = i < 0 ? 0 : i > n - 1 ? n - 1 : Math.round(i);
  return ramp[k];
}

// rgb(hex) -> [r,g,b]. The software renderer writes bytes, not strings, so it resolves each ramp
// to bytes once at module load rather than parsing hex per pixel.
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// RAMP_BYTES.<ramp> = Uint8Array of r,g,b triples, for the per-pixel renderer.
export const RAMP_BYTES = Object.freeze(
  Object.fromEntries(
    Object.entries(RAMPS).map(([name, ramp]) => {
      const bytes = new Uint8Array(ramp.length * 3);
      ramp.forEach((hex, i) => {
        const [r, g, b] = rgb(hex);
        bytes[i * 3] = r;
        bytes[i * 3 + 1] = g;
        bytes[i * 3 + 2] = b;
      });
      return [name, bytes];
    }),
  ),
);

// The foreground/background pairs the renderer actually draws text in. Gate 5 measures contrast
// over THIS list, so the floor is asserted against real pairings rather than a guessed matrix.
//
// M7b: the desk stopped being a flat fill and became a composed material, which moved the ground
// under every caption drawn on it. A pairing list that still named `C.desk` would have been
// measuring a colour the renderer no longer draws behind text. The composed desk was measured
// (it reaches ink[2] over the frame, and is clamped to ink[1] under the header band precisely
// because the incident-replay label fell to 4.41:1 against ink[2]), and the pairings below name
// the LIGHTEST step each caption can actually land on, which is the worst case for light-on-dark.
export const TEXT_PAIRS = Object.freeze([
  { name: 'section label on the cutaway', fg: C.sectionLabel, bg: C.sectionVoid },
  { name: 'section text on the cutaway', fg: C.sectionText, bg: C.sectionVoid },
  { name: 'ledger body ink on paper', fg: C.inkBody, bg: C.paperBase },
  { name: 'overlay running copy on paper', fg: C.inkCopy, bg: C.paperBase },
  { name: 'overlay running copy on the paper highlight', fg: C.inkCopy, bg: C.paperHigh },
  { name: 'overlay running copy on the paper shade', fg: C.inkCopy, bg: C.paperShade },
  { name: 'ledger secondary ink on paper', fg: C.inkSecondary, bg: C.paperBase },
  { name: 'ledger body ink on the paper highlight', fg: C.inkBody, bg: C.paperHigh },
  { name: 'ledger secondary ink on the paper highlight', fg: C.inkSecondary, bg: C.paperHigh },
  { name: 'ledger body ink on the paper shade', fg: C.inkBody, bg: C.paperShade },
  { name: 'stamp ink on paper', fg: C.stampInk, bg: C.paperBase },
  { name: 'stamp ink on the paper highlight', fg: C.stampInk, bg: C.paperHigh },
  { name: 'brass figures on paper', fg: RAMPS.brass[0], bg: C.paperBase },
  { name: 'button text on the button face', fg: C.buttonText, bg: C.buttonFace },
  // The composed button's bevel light is confined to its edges, so the field under the label stays
  // on the step the palette names. Measured: the enabled face reaches stone[1] in the label area
  // and no further, which is why this pairing is still the true one after the controls were
  // composed rather than filled.
  { name: 'button text on the lightest step of the composed button field', fg: C.buttonText, bg: RAMPS.stone[1] },
  { name: 'cornerstone label on the cutaway', fg: C.cornerstone, bg: C.sectionVoid },
  { name: 'damage label on the cutaway', fg: C.rustBright, bg: C.sectionVoid },
  { name: 'overlay text on the desk', fg: C.sectionText, bg: C.desk },
  // The composed desk, at the lightest step each caption can sit on.
  { name: 'section title on the composed desk header', fg: C.sectionLabel, bg: RAMPS.ink[1] },
  { name: 'incident-replay label on the composed desk header', fg: C.rustBright, bg: RAMPS.ink[1] },
  { name: 'light text on the lightest step of the composed desk', fg: C.sectionText, bg: RAMPS.ink[2] },
]);
