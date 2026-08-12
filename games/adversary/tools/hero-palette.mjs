// hero-palette.mjs — the palette spine the hero is painted into.
//
// SPINE: the Legacy Vania pack's 19 colours, measured off its three usable PNGs (Assets.png,
// Mob.png, Entrance_2.png). The art-pack catalog §6.2 proposes these as the environment
// spine because 19 colours is closer to a true NES-adjacent palette than the game's current
// 27 and satisfies AESTHETIC LAW 1 better than what currently ships. Painting the hero into
// the same 19 means one palette decision serves hero, tiles and HUD instead of reconciling
// three afterwards.
//
// Read as ramps, those 19 are unusually well organised — five hue families of 3-4 steps:
//
//   ink     #050505  #3c3c3c  #a0a0a0  #feffff   (the pack's own outline colour is #050505)
//   teal    #00262d  #105c68  #56b3c0  #b5dfe4
//   earth   #321300  #6f3f00  #c8913e
//   olive   #1f2000  #515200  #a6a725
//   wine    #400426  #84235c  #e070b2
//
// HERO EXTENSIONS: two tones, both filling a genuine gap rather than adding a new hue.
// The earth ramp jumps from luma 69 to 151 with nothing between, which leaves a 3-tone
// cloth material with no readable mid step at 30px; and the same gap makes skin impossible.
// Everything else the hero needs already exists in the spine. Total hero palette per variant
// stays in the low teens, in keeping with "8-bit-plus" rather than a 16-bit reimagining.

/** The Legacy Vania 19, measured (tools/hero-palette.mjs is the only place they are named). */
export const VANIA_19 = Object.freeze({
  black: '#000000',
  ink: '#050505',
  plum: '#400426',
  bark: '#321300',
  moss: '#1f2000',
  abyss: '#00262d',
  wine: '#84235c',
  slate: '#3c3c3c',
  earth: '#6f3f00',
  olive: '#515200',
  teal: '#105c68',
  rose: '#e070b2',
  tan: '#c8913e',
  brass: '#a6a725',
  ash: '#a0a0a0',
  cyan: '#56b3c0',
  blush: '#f1c7c2',
  mist: '#b5dfe4',
  white: '#feffff',
});

/** Hero-only extensions. Two tones, both mid steps in the earth family. */
export const HERO_EXT = Object.freeze({
  hide: '#9a6524', // earth mid — cloth/leather reads at 30px without it
  flesh: '#d9a06a', // skin mid, sitting between tan and blush
});

export const PALETTE = Object.freeze({ ...VANIA_19, ...HERO_EXT });

/** Named ramps, dark -> light. Materials index into these. */
export const RAMPS = Object.freeze({
  ink: [PALETTE.ink, PALETTE.slate, PALETTE.ash, PALETTE.white],
  teal: [PALETTE.abyss, PALETTE.teal, PALETTE.cyan, PALETTE.mist],
  earth: [PALETTE.bark, PALETTE.earth, PALETTE.hide, PALETTE.tan],
  olive: [PALETTE.moss, PALETTE.olive, PALETTE.brass],
  wine: [PALETTE.plum, PALETTE.wine, PALETTE.rose],
  skin: [PALETTE.earth, PALETTE.hide, PALETTE.flesh, PALETTE.blush],
  steel: [PALETTE.slate, PALETTE.ash, PALETTE.mist, PALETTE.white],
});

export const OUTLINE = PALETTE.ink;

/**
 * Sample a ramp at a normalised position, with an optional shift in whole steps.
 * `depth` shifts far-side limbs one step darker — the near/far read the rig's own layer
 * stack gives us for free.
 */
export function rampAt(ramp, t, shift = 0) {
  const n = ramp.length;
  let i = Math.round(Math.min(1, Math.max(0, t)) * (n - 1)) + shift;
  if (i < 0) i = 0;
  if (i > n - 1) i = n - 1;
  return ramp[i];
}

export function paletteReport() {
  return {
    spine: Object.keys(VANIA_19).length,
    extensions: Object.keys(HERO_EXT).length,
    ramps: Object.fromEntries(Object.entries(RAMPS).map(([k, v]) => [k, v.length])),
  };
}
