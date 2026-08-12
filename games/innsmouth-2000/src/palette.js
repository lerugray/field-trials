// The one fixed palette for INNSMOUTH 2000 (the aesthetic lock, STUDY section 2.2).
//
// Sea-rotted: brine greens, weathered clapboard browns, fog greys, cold slate roofs, gold
// lamplit windows. Every material is a 4-step ramp [shadow, base, light, highlight] so the
// dimetric wall bands and ordered dithers share one light model. Authored here as hex; never
// sampled from any reference image. No smooth gradients, ever: shading is ramp steps and
// ordered dither between them.

// The damp 1920s pass (M7) muted, cooled and darkened the M1 ramps a step. The blue-hour pass
// (art migration, 2026-08-10) takes them the rest of the way to the operator-approved art
// direction: the town is lit from its own windows and street lamps against a dark sea-rotted
// ground, so every material drops another step and the LIGHT that reads is added back as light
// (glow, lamp pools, lit windows) rather than baked into the pigment. Still 4 steps, still one
// light model, still no gradient anywhere: shading is ramp steps and ordered dither between them.
//
// The BASE..LIGHT pair is what a terrain tile actually shows (the baked sprite dithers between
// them), so those two steps carry the material's read; SHADOW seats it and HIGHLIGHT catches the
// lit rim. The gold lamplit window is the one warm accent and it got brighter, not dimmer: it is
// the glow of life in the fog, and after this pass it is nearly the only bright thing on screen.
export const RAMP = {
  deep: ['#08171b', '#102a30', '#183d42', '#285354'], // deep brine, near black offshore
  shallow: ['#183d42', '#285354', '#3d6a66', '#5a8880'], // shallow sea / river, tidal teal
  beach: ['#38352c', '#534d3c', '#6f6650', '#8d8268'], // wet sand, damp and grey
  grass: ['#1c2823', '#26352c', '#35483a', '#506253'], // marsh grass, desaturated
  dirt: ['#211b17', '#392d24', '#504133', '#675645'], // bare earth
  road: ['#292927', '#3c3b37', '#53504a', '#6d685f'], // the street: cold grey, not brown
  rock: ['#1a1f28', '#31373f', '#4a5058', '#666d76'], // hill rock, cold
  clapboard: ['#2b211b', '#44342a', '#5d493a', '#79614d'], // building wall, weathered
  brick: ['#261b18', '#402b27', '#593a31', '#754d3e'], // industrial brick, rust-dark
  slate: ['#151a20', '#242d34', '#35424b', '#4b5962'], // roof, cold
  soil: ['#17130f', '#271e18', '#382a21', '#4c3a2d'], // packed earth, the underground plane
  gold: ['#6e5019', '#a87b2a', '#d2aa55', '#ffe080'], // lamplit window (kept warm, made brighter)
};

// The blue hour behind the town: the sky/void the map sits in, darkest overhead and hazier toward
// the horizon, dithered like everything else. The underground's void is the same idea in soil.
export const SKY = ['#0e1620', '#17242d', '#263844', '#47545b'];
export const SKY_UNDER = ['#070605', '#0d0a08', '#14100c', '#1c1610'];
// The one warm light in the sky: a low sun already gone, or the moon coming up through the haze.
export const SKY_GLOW = '#c8a45a';

// Ramp step indices, named for readability.
export const SHADOW = 0;
export const BASE = 1;
export const LIGHT = 2;
export const HIGHLIGHT = 3;

// OS-window chrome greys (STUDY 2.2), a separate ramp for UI surfaces. Retuned with the blue-hour
// pass: the panel face goes warmer (aged paper rather than office grey), the title bars go to the
// dark green-black the approved direction uses, and the ink goes to near-black so an outline still
// separates a building from the darkened ground beneath it (the legibility floor asserts this).
export const CHROME = {
  windowFace: '#c4bea9',
  bevelLight: '#e1dbc7',
  bevelShadow: '#6f6a5c',
  deepFrame: '#2b3634',
  titleBar: '#1c2829',
  titleText: '#e8e4d6',
  ink: '#0a0d0d',
};

// Parse '#rrggbb' to { r, g, b } (0..255).
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Map a terrain kind (from mapgen TERRAIN) to its palette ramp key.
export function terrainRamp(terrain) {
  // Terrain kinds are named to match ramp keys directly.
  return RAMP[terrain] ? terrain : 'grass';
}

// Zone marker colours (STUDY 3 chrome register). Chosen bright enough to read against the
// grass ramp: residential pops as a lighter green, commercial slate-blue, industrial gold.
export const ZONE_TINT = {
  residential: '#9ecf66',
  commercial: '#5aa0d0',
  industrial: '#d8b038',
};

// Overhead wire / pole colours for power lines.
export const WIRE = '#241f1a';
export const POLE = '#3a2f24';

// The underground utility view (M-a). A period municipal water map: packed earth, the surface
// town reduced to brown-grey silhouettes above, and the mains reading their pressure by colour
// (cold blue pressurized, dull blue-grey low, near-black dry). Ramp steps only, no gradients, and
// nothing down here is brighter than the lamplit gold reserved for the surface.
export const UNDERGROUND = {
  earth: '#271e18', // packed soil the whole plane sits in (the `soil` ramp's BASE)
  earthLight: '#382a21', // the lit face of a soil bank
  // The surface, seen from below. Pulled back hard in the blue-hour pass: with the soil now carrying
  // real dithered material, footprints at the old strength tiled the whole plane in pale squares and
  // the mains stopped being the brightest thing down here, which is the one rule this view has.
  ghost: 'rgba(102, 81, 62, 0.15)', // a surface footprint seen from below, in the soil's own colour
  ghostRoad: 'rgba(102, 81, 62, 0.22)', // a road bed traced overhead
  trench: '#100c09', // the cut a main is laid in
  pipeGood: '#5f9fc4', // pressurized: cold blue
  pipeGoodLit: '#a1d1cc',
  pipeLow: '#5c6a72', // low pressure: dull grey-blue
  pipeLowLit: '#8b979d',
  pipeDry: '#332b23', // dry: dark, no life in it
  pipeDryLit: '#463b30',
  joint: '#9b7b3c', // brass, where a main turns or branches: the period map's own punctuation
  jointCore: '#0a0d0d',
  washGood: 'rgba(95, 159, 196, 0.20)', // coverage wash under a pressurized main
  washLow: 'rgba(120, 134, 142, 0.16)', // coverage wash under a low-pressure main
  source: '#c8ddc4', // a pump or well head, the brightest thing down here
  sourceDim: '#6d8a78',

  // --- water quality and the ground it comes out of (M-b) ---------------------------------
  // The spec's own overlay language, held to the aesthetic law: these are ramp steps out of the
  // same sea-rotted palette, not neon. Pressure is still read by the PIPE's colour; quality is
  // mottled over it, so the player reads both at once instead of one hiding the other.
  taintSuspect: '#7d8a4e', // yellow-green flecks: an odd taste, odd reports
  taintSuspectLit: '#9aa864',
  taintTainted: '#4f7a3e', // sick green
  taintTaintedLit: '#6b9a54',
  taintInfested: '#26402c', // black-green, with things moving in it
  taintInfestedLit: '#3d6b45',
  washSuspect: 'rgba(125, 138, 78, 0.16)', // coverage wash on suspect water
  washTainted: 'rgba(79, 122, 62, 0.22)',
  washInfested: 'rgba(38, 64, 44, 0.28)',

  // The aquifer itself, faint under everything: pale cyan where the ground runs sweet, muddy teal
  // where the sea has been in it, and a black-blue void where the rock is open to the deep.
  aquiferFresh: 'rgba(122, 168, 178, 0.08)',
  // Lightened with the blue-hour pass: the packed soil under it is now real dithered material
  // rather than a flat fill, and a heavy wash was burying the very texture that makes the plane
  // read as dug earth. The brine still tints unmistakably; it just no longer paints over.
  aquiferBrackish: 'rgba(74, 106, 100, 0.13)',
  aquiferVoid: 'rgba(16, 26, 40, 0.55)',
  voidEdge: '#3a5a6e', // the moving highlight around a sea-connected void
  sealCap: '#6b6257', // the iron cap of a sealing works
  sealCapLit: '#8a8073',

  // The signs, and the rare glimpse. Chalky and pale: they must read as marks on the utility map,
  // never as a creature sprite (anti-goal 7, and the ratified "implied" depiction).
  mark: '#8ba08a',
  glimpse: '#9fb6a8',
  valveOpen: '#a89464', // brass, standing open
  valveShut: '#a2503c', // shut: the one warm mark in a cold plane, so it cannot be missed
  damp: 'rgba(78, 120, 96, 0.30)', // seeped ground, seen from the SURFACE view
};
