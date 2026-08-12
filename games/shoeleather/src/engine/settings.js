// SHOELEATHER — settings / accessibility (M7 QoL gate; art-independent).
//
// DESIGN-SEED M7 + colorblind/photosensitivity floors: text size, dyslexia-font
// alternate, reduced motion, photosensitivity toggle, text speed. These are
// ARCHITECTURE, not decoration (rule 8: text is architectural) — so the model is pure,
// validated, persisted, and node-testable; the browser applies it to the crisp text
// layer and gates any motion/film effects behind the flags.

export const FONTS = Object.freeze({ period: '"Courier New", monospace', dyslexic: '"Comic Sans MS", "Verdana", sans-serif' });

export const DEFAULT_SETTINGS = Object.freeze({
  textScale: 1.0,          // 0.8 .. 2.0 multiplier on the crisp UI text
  dyslexiaFont: false,     // swap the UI font family
  reducedMotion: false,    // suppress the checkpoint flash + any future motion
  photosensitivitySafe: true, // gate any period film effect (no flashing > 3Hz, ever)
  textSpeedCps: 40,        // characters/sec for any typed reveal (0 = instant)
});

const CLAMPS = {
  textScale: { min: 0.8, max: 2.0 },
  textSpeedCps: { min: 0, max: 200 },
};

export class Settings {
  constructor(store = null, { key = 'shoeleather:settings' } = {}) {
    this.store = store;
    this.key = key;
    this.values = { ...DEFAULT_SETTINGS };
  }

  get(k) {
    if (!(k in DEFAULT_SETTINGS)) throw new RangeError(`unknown setting "${k}"`);
    return this.values[k];
  }

  set(k, v) {
    if (!(k in DEFAULT_SETTINGS)) throw new RangeError(`unknown setting "${k}"`);
    if (typeof DEFAULT_SETTINGS[k] === 'boolean') v = !!v;
    else v = clampNum(v, CLAMPS[k]);
    this.values[k] = v;
    return v;
  }

  reset() { this.values = { ...DEFAULT_SETTINGS }; return this; }

  // Font family + a rounded percentage the browser sets on the UI root font-size.
  toCss() {
    return {
      fontFamily: this.values.dyslexiaFont ? FONTS.dyslexic : FONTS.period,
      fontScalePct: Math.round(this.values.textScale * 100),
    };
  }

  load() {
    if (!this.store) return this;
    const raw = this.store.get(this.key);
    if (!raw) return this;
    try {
      const obj = JSON.parse(raw);
      for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in obj) this.set(k, obj[k]);
    } catch (_) { /* corrupt settings fall back to defaults, never a crash */ }
    return this;
  }

  save() {
    if (this.store) this.store.set(this.key, JSON.stringify(this.values));
    return this;
  }
}

function clampNum(v, c) {
  v = Number(v);
  if (!Number.isFinite(v)) return c.min;
  if (!c) return v;
  return Math.min(c.max, Math.max(c.min, v));
}
