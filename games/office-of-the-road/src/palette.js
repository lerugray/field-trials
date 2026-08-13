// palette.js — THE PALETTE (single source of truth for colour). Tuned to pass
// the M2 legibility gate: every colour used as small body text clears WCAG 4.5:1
// on its background, and every interactive UI edge clears 3:1 (measured by
// src/legibility.js; asserted in test/legibility.test.js). Pure data.
//
// The register's look: warm paper on near-black ink (a filing office rendered on
// an NES). Non-colour channels (glyphs, position, outline, numerals) carry every
// state distinction as well as colour — see legibility.js NONCOLOR_CHANNELS.

export const PALETTE = {
  ink: '#0d0b0a', // the page
  panel: '#151210', // inset panels
  panel2: '#1b1714', // alternating panel band
  paper: '#e8dfce', // primary body text / headers
  dim: '#8a8172', // body text on dark (instrument lines, values)
  faint: '#857c6b', // small section labels + hints (still >=4.5 on ink/panel)
  rule: '#3a352d', // DECORATIVE container borders + separators (non-interactive)
  edge: '#6b6456', // INTERACTIVE control borders (>=3:1)
  stamp: '#cf6a4a', // error / alert / damage text (>=4.5)
  ok: '#7f8a5a', // affirmative status / heal (>=4.5)
  focus: '#d9c98a', // focus ring + ward marker
  party: '#d9c98a', // the party caret
  filed: '#c9b98a', // save-confirmed flash
  enemy: '#b07050', // enemy accent
  hp: '#7f8a5a', // health bar fill (>=3 on its track)
  hplow: '#cf6a4a', // low-health bar fill
  hpback: '#241f1a', // health bar track
  townGround: '#2b2420', // warm base beneath transparent town-tile mortar
  townWash: 'rgba(43,36,32,0.82)', // pulls bright cobble into the warm-ink register
};
