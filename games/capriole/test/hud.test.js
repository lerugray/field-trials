import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hudPath = resolve(__dirname, '../src/render/hud.js');
const hud = readFileSync(hudPath, 'utf8');

describe('M5 HUD pass — structural checks', () => {
  it('replaces the ticket emoji with a code-drawn ticket glyph', () => {
    assert(!hud.includes('🎟'), 'hud.js must not contain the ticket emoji');
    assert(hud.includes('ticket-glyph'), 'ticket-glyph class must exist');
    assert(hud.includes('drawTicketGlyph'), 'drawTicketGlyph helper must exist');
    assert(hud.includes('paintTicketGlyphs'), 'paintTicketGlyphs must be called after the meta screen is dressed');
  });

  it('adds a scroll fade to the meta shop list', () => {
    assert(hud.includes('#cap-screen .shop::after'), 'shop pseudo-element fade must exist');
    assert(hud.includes('linear-gradient(to bottom, transparent, var(--ink2))'), 'fade must resolve to the sheet background');
  });

  it('raises the arrival-card plate opacity for contrast', () => {
    const matches = [...hud.matchAll(/toneCss\(pal\.skyTop,\s*-0\.80,\s*(0\.\d+)\)/g)];
    assert(matches.length >= 2, 'both top bar and card plate tones must be present');
    for (const m of matches) {
      assert(parseFloat(m[1]) >= 0.75, `plate alpha ${m[1]} must be >= 0.75`);
    }
  });

  it('coats HUD widgets in palette variables', () => {
    assert(hud.includes('--hp-fill'), 'HP pip fill must be palette-driven');
    assert(hud.includes('--pod-color'), 'pod count colour must be palette-driven');
    assert(hud.includes('--jump-on'), 'jump-chain colour must be palette-driven');
    assert(hud.includes('--fw-color'), 'firework colour must be palette-driven');
    assert(hud.includes('--boss-fill'), 'boss bar colour must be palette-driven');
  });
});
