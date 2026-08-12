// The M9 visual register — "Sun-Disk Chrome", classic PSX RPG system chrome.
// Locked by the operator (docs/DIRECTIONS-20260806-M9-chrome.md,
// docs/mockups/sundisk-v3-raise-screen-2026-08-06.html). This module is the
// single source of truth for every chrome colour so the CSS, the canvas UI and
// the tests all read the same table.
//
// READABILITY HARD RULE (directive item 4): readable body text may only appear
// in ONE OF THREE text/panel pairs. Accents (item 3) are foreground punctuation
// only — small coloured glyphs/numbers on an already-legal panel — never a body
// pair of their own. test/palette.test.js walks PAIRS and asserts every declared
// pair is one of LEGAL_PAIRS.

// Normalise a hex colour to lowercase #rrggbb (drops alpha; rgba() kept as-is
// lowercased) so equality checks don't trip on casing.
export function normColor(c) {
  return String(c).trim().toLowerCase();
}

export const PALETTE = {
  // --- backdrop: deep navy quantized vertical banding, hard stops ---
  bgBandLo: '#101A3C',
  bgBandHi: '#1C2A5E',

  // --- primary panels: translucent deep navy + warm-white text ---
  navyPanel: 'rgba(24,36,88,0.82)',
  navyText: '#F4F0E2',
  navyBevelLight: '#2C3E78',
  navyBevelDark: '#0A1240',
  navyBorder: '#1E2A4A',

  // --- secondary chrome: opaque warm-white / beige + dark-navy text ---
  beigeLight: '#F2EFE6',
  beigeDark: '#E4DCC8',
  beigeText: '#1E2A4A',
  beigeBevelLight: '#F8F4E8',
  beigeBevelDark: '#6A748E',

  // --- header bands: solid mid-navy + white type ---
  headerBand: '#24387A',
  headerText: '#FFFFFF',
  headerBevelLight: '#3A50A0',
  headerBevelDark: '#101A3C',

  // --- accents: PUNCTUATION ONLY (deltas, money, warnings, selection) ---
  accentOrange: '#E88C3A', // stat deltas, active / selected
  accentGold: '#F0C060', // money / rewards
  accentRed: '#C04040', // warnings / at-cap

  // --- meters: empty cell vs filled cell vs at-cap cell ---
  meterEmpty: '#0A1240',
  meterEmptyEdge: '#1E2A4A',
  meterFill: '#F0C060',
  meterFillEdge: '#8A6018',
  meterCap: '#C04040',
  meterCapEdge: '#601010',

  // hard offset shadow under every window
  shadow: '#000000',

  // the warm interior tint allowed INSIDE the creature window so the pet stays
  // cozy (directive item 3, the single sanctioned exception)
  creatureFloor: '#2A3A18',
};

// The declared body text/panel pairs the UI actually paints. Each `{ text, panel }`
// must be one of LEGAL_PAIRS. Add a row here whenever a surface renders readable
// text so the test keeps the whole UI honest.
export const PAIRS = [
  { name: 'primary-navy', text: PALETTE.navyText, panel: PALETTE.navyPanel },
  { name: 'secondary-beige-light', text: PALETTE.beigeText, panel: PALETTE.beigeLight },
  { name: 'secondary-beige-dark', text: PALETTE.beigeText, panel: PALETTE.beigeDark },
  { name: 'header-band', text: PALETTE.headerText, panel: PALETTE.headerBand },
];

// The three canonical pairs (directive item 1). Pair 2 permits either beige shade
// as its panel; header white is treated as the warm-white text family.
export const LEGAL_PAIRS = [
  { text: [PALETTE.navyText], panels: [PALETTE.navyPanel] },
  { text: [PALETTE.beigeText], panels: [PALETTE.beigeLight, PALETTE.beigeDark] },
  { text: [PALETTE.headerText, PALETTE.navyText], panels: [PALETTE.headerBand] },
];

// The accents that are allowed as foreground punctuation on any legal panel.
export const ACCENTS = [PALETTE.accentOrange, PALETTE.accentGold, PALETTE.accentRed];

// True iff `{ text, panel }` is one of the three legal pairs.
export function isLegalPair(text, panel) {
  const t = normColor(text);
  const p = normColor(panel);
  return LEGAL_PAIRS.some(
    (lp) => lp.text.map(normColor).includes(t) && lp.panels.map(normColor).includes(p),
  );
}
