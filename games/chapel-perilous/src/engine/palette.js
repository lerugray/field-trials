// Palette schemes (M4 VIBE). The look is ONE hue at a time: each scheme is a
// single base colour the 0..6 luminance ramp is tinted into. The approved art PoC
// blooms the hottest luminances toward a near-white phosphor tint; this module is
// the live equivalent of that PoC LUT, so palette swaps are still pure re-tints.
import { SHADE_LEVELS } from './tiles.js';

// Brightness floor so shade 0 isn't pure black (keeps dark tiles readable on a
// CRT). Shades ramp t = FLOOR..1 across the levels.
const FLOOR = 0.14;

export function createPalettes(data) {
  const schemes = (data && data.schemes) || [];
  if (schemes.length < 4) throw new Error('createPalettes: need >=4 single-hue schemes');

  const byId = new Map();
  const order = [];
  for (const s of schemes) {
    validateScheme(s);
    if (byId.has(s.id)) throw new Error(`createPalettes: duplicate scheme '${s.id}'`);
    byId.set(s.id, s);
    order.push(s.id);
  }
  const defaultId = data.default && byId.has(data.default) ? data.default : order[0];

  function get(id) {
    const s = byId.get(id);
    if (!s) throw new Error(`palette.get: unknown scheme '${id}'`);
    return s;
  }

  // The brightness factor for a shade index (0..levels-1): FLOOR..1.
  function factor(shade, levels = SHADE_LEVELS) {
    const s = Math.max(0, Math.min(levels - 1, shade | 0));
    return FLOOR + (1 - FLOOR) * (s / (levels - 1));
  }

  // Remap grayscale luminance through the approved PoC tint LUT. Its 0.92 gamma
  // opens the dark/mid ramp; only the top 28% blooms quadratically toward HOT.
  function luminanceToColor(id, luminance) {
    const s = get(id);
    const L = Math.max(0, Math.min(255, Number(luminance) || 0));
    const t = Math.pow(L / 255, 0.92);
    let bloom = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
    bloom *= bloom;
    const hot = glow(id);
    const ambient = 6;
    const channels = s.rgb.map((base, i) => {
      let value = base * t;
      value += (hot[i] - value) * bloom;
      value += (base / 255) * ambient;
      return Math.round(Math.max(0, Math.min(255, value)));
    });
    return `rgb(${channels[0]},${channels[1]},${channels[2]})`;
  }

  // Shade indices first become the exact grayscale intensities used by the PoC,
  // then pass through its presentation LUT.
  function shadeToColor(id, shade, levels = SHADE_LEVELS) {
    return luminanceToColor(id, 255 * factor(shade, levels));
  }

  // The full 0..levels-1 ramp for a scheme (handy for a swatch / the gallery).
  function ramp(id, levels = SHADE_LEVELS) {
    return Array.from({ length: levels }, (_, i) => shadeToColor(id, i, levels));
  }

  // The scheme's restrained accent hue (M6 review addendum item 3 — the
  // Cyclopean-2 move). `t` scales its brightness (0..1) for dim accent uses;
  // schemes without an explicit accent fall back to the brightest base shade so
  // callers always get a colour and the look degrades to pure single-hue.
  function accentColor(id, t = 1) {
    const s = get(id);
    const clamp = Math.max(0, Math.min(1, t));
    if (Array.isArray(s.accent)) {
      const [r, g, b] = s.accent;
      return `rgb(${Math.round(r * clamp)},${Math.round(g * clamp)},${Math.round(b * clamp)})`;
    }
    return shadeToColor(id, SHADE_LEVELS - 1);
  }

  // Whether a scheme carries a genuine second-hue accent (vs. the fallback).
  function hasAccent(id) { return Array.isArray(get(id).accent); }

  // The scheme's HOT phosphor tint — the near-white end additive light blooms
  // toward (the art-uplift's "light as compositing": in a monochrome scheme,
  // additive light IS phosphor glow, and it climbs toward this hot tint). This
  // never enters the base ramp (that stays strictly single-hue by the design
  // law); it is used only by the additive glow layer. Schemes may declare an
  // explicit `glow`; absent, the base is pushed 55% toward white so every scheme
  // still blooms.
  function glow(id) {
    const s = get(id);
    if (Array.isArray(s.glow)) return s.glow.slice();
    const [r, g, b] = s.rgb;
    return [r + (255 - r) * 0.55, g + (255 - g) * 0.55, b + (255 - b) * 0.55].map((c) => Math.round(c));
  }

  // The hot tint as an `rgb(...)` string, `t` scaling its brightness (0..1).
  function glowColor(id, t = 1) {
    const clamp = Math.max(0, Math.min(1, t));
    const [r, g, b] = glow(id);
    return `rgb(${Math.round(r * clamp)},${Math.round(g * clamp)},${Math.round(b * clamp)})`;
  }

  // Cycle to the next scheme id (wraps) — the options-screen selector.
  function next(id) {
    const i = order.indexOf(id);
    return order[(i < 0 ? 0 : i + 1) % order.length];
  }
  function prev(id) {
    const i = order.indexOf(id);
    return order[(i <= 0 ? order.length : i) - 1];
  }

  return {
    get,
    ids: () => order.slice(),
    list: () => order.map((id) => byId.get(id)),
    get count() { return order.length; },
    defaultId,
    factor,
    luminanceToColor,
    shadeToColor,
    ramp,
    accentColor,
    hasAccent,
    glow,
    glowColor,
    next,
    prev,
  };
}

function validateScheme(s) {
  if (!s || !s.id) throw new Error('palette: scheme missing id');
  const rgb = s.rgb;
  if (!Array.isArray(rgb) || rgb.length !== 3) throw new Error(`palette: scheme '${s.id}' needs an rgb triple`);
  for (const c of rgb) if (!(c >= 0 && c <= 255)) throw new Error(`palette: scheme '${s.id}' rgb out of range`);
  if (s.accent !== undefined) {
    if (!Array.isArray(s.accent) || s.accent.length !== 3) throw new Error(`palette: scheme '${s.id}' accent must be an rgb triple`);
    for (const c of s.accent) if (!(c >= 0 && c <= 255)) throw new Error(`palette: scheme '${s.id}' accent rgb out of range`);
  }
  if (s.glow !== undefined) {
    if (!Array.isArray(s.glow) || s.glow.length !== 3) throw new Error(`palette: scheme '${s.id}' glow must be an rgb triple`);
    for (const c of s.glow) if (!(c >= 0 && c <= 255)) throw new Error(`palette: scheme '${s.id}' glow rgb out of range`);
  }
}
