// Overworld terrain tile table. `shade` is a 0..6 monochrome ramp index
// (dark -> light); the palette/CRT pass (M4) maps shade -> hue. `passable`
// governs collision. Glyphs are for the headless/ASCII debug view.
export const TILES = {
  DEEP:   { id: 'DEEP',   passable: false, shade: 0, glyph: '≈' },
  WATER:  { id: 'WATER',  passable: false, shade: 1, glyph: '~' },
  SAND:   { id: 'SAND',   passable: true,  shade: 2, glyph: '.' },
  GRASS:  { id: 'GRASS',  passable: true,  shade: 3, glyph: ',' },
  FOREST: { id: 'FOREST', passable: true,  shade: 4, glyph: '♣' },
  HILL:   { id: 'HILL',   passable: true,  shade: 5, glyph: '^' },
  MOUNT:  { id: 'MOUNT',  passable: false, shade: 6, glyph: '▲' },
};

export const SHADE_LEVELS = 7; // 0..6

export function isTileId(id) {
  return Object.prototype.hasOwnProperty.call(TILES, id);
}
