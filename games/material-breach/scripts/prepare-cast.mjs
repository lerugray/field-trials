// prepare-cast.mjs — turn the licensed cast sheets in assets/cast/source/ into src/cast-data.js.
//
// WHY THIS EXISTS, AND WHY THE OUTPUT IS NOT A PNG.
//
// DESIGN-SEED §4.5 item 4 says everything in the game draws from one curated palette in named
// ramps, and item 2 says light is expressed by WHICH STEP of a ramp a pixel selects. A borrowed
// sprite pasted in at its own colours would break both: it would be a bright decal sitting on top
// of a lit drawing, unaffected by the lamps around it.
//
// So each sprite is converted, once, at copy-in, into per-pixel RAMP INDICES plus an alpha mask.
// At render time the figure selects its steps from its role's ramp at the light level of the tile
// it is standing on, exactly like the stone around it. The cast is lit by the scene rather than
// pasted over it.
//
// The licensed originals stay in assets/cast/source/ unmodified as the provenance record. This
// derivation is a permitted adaptation: the packs are CC BY, which explicitly allows remixing and
// adapting, and attribution is given in ATTRIBUTION.md and ships inside the built artifact.
//
// Zero dependencies: PNG decode uses node:zlib. Run:  node scripts/prepare-cast.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'assets', 'cast', 'source');

// ---- a minimal PNG reader (8-bit RGBA, the format every source sheet uses) ---------------------

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let i = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`unsupported PNG: depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bpp && prev ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      cur[x] = v & 255;
    }
  }
  return { width, height, data: out };
}

// ---- the sheet grid ----------------------------------------------------------------------------
//
// These are RPG-Maker-format character sheets: 4 characters across by 2 down, and each character
// is a 3-column by 4-row block (columns are the walk frames, rows are the facings: down, left,
// right, up). Slicing one of these on a naive uniform grid is a known way to ship head-top slices,
// so the grid is derived from the sheet's own dimensions and the result is eyeballed on a contact
// sheet before anything is committed.
const CHARS_X = 4;
const CHARS_Y = 2;
const COLS = 3; // walk frames
const ROWS = 4; // facings
const FACE_RIGHT = 2; // row index of the right-facing walk

function frame(png, charIndex, col, row) {
  const fw = Math.floor(png.width / (CHARS_X * COLS));
  const fh = Math.floor(png.height / (CHARS_Y * ROWS));
  const cy = Math.floor(charIndex / CHARS_X);
  const cx = charIndex % CHARS_X;
  const ox = (cx * COLS + col) * fw;
  const oy = (cy * ROWS + row) * fh;
  const px = [];
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const o = ((oy + y) * png.width + (ox + x)) * 4;
      px.push([png.data[o], png.data[o + 1], png.data[o + 2], png.data[o + 3]]);
    }
  }
  return { w: fw, h: fh, px };
}

// ---- the cast ----------------------------------------------------------------------------------
//
// Who is who. Each entry names the source sheet, which character on it, and the role whose ramp
// the figure will select its steps from at render time (palette.js CAST_RAMP).
const CAST = [
  // The staff you employ: drawn from the facility's own materials, because they belong to it.
  { id: 'drudge', sheet: 'CIV_9_1', char: 3, note: 'bare-headed labourer in a plain smock' },
  { id: 'clerk', sheet: 'CIV_12_1', char: 1, note: 'wide-brimmed hat and long coat, a functionary' },
  { id: 'artificer', sheet: 'CIV_7_1', char: 1, note: 'flat cap and apron, workshop hands' },
  { id: 'warden', sheet: 'MIL_1_1', char: 0, note: 'helmeted, in-house, posted to Holding' },
  // The incident: human authority, never monsters (DESIGN-SEED §4.4).
  { id: 'raider', sheet: 'MIL_3_1', char: 0, note: 'helmeted, spear at the carry' },
  { id: 'raiderB', sheet: 'MIL_2_1', char: 0, note: 'helmeted, second party member' },
  // The escalation: bureaucrats carrying instruments, not fighters.
  { id: 'officer', sheet: 'MAG_1_1', char: 5, note: 'cowled robe, no visible rank' },
  // CIV_8_1 was tried here first and rejected on the contact sheet: its wide brim and heavy coat
  // collapse into horizontal banding once quantised into a single ramp. CIV_6_1's cap-and-coat
  // silhouette survives the quantisation and stays distinct from both the clerk's wide brim and
  // the cowl.
  { id: 'officerB', sheet: 'CIV_6_1', char: 1, note: 'cap and coat, the inspector' },
];

// The number of ramp steps a figure is quantised into. Ramps are 6 to 7 steps; a figure that used
// the whole ramp would blow out against a dim room, so it takes the lower part of the range and
// the room's light shifts it up.
const FIGURE_STEPS = 5;

// Luminance, for ranking a sprite's own colours into ramp steps.
function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Convert a frame to a compact string: one character per pixel. '.' is transparent, '0'..'4' are
// ramp-step offsets from the figure's darkest. Per-sprite normalisation keeps the outline at 0 and
// the highlight at the top, so the figure's own modelling survives the palette change.
function encode(fr) {
  let min = Infinity;
  let max = -Infinity;
  for (const [r, g, b, a] of fr.px) {
    if (a < 128) continue;
    const L = lum(r, g, b);
    if (L < min) min = L;
    if (L > max) max = L;
  }
  const span = max - min || 1;
  let out = '';
  for (const [r, g, b, a] of fr.px) {
    if (a < 128) {
      out += '.';
      continue;
    }
    const t = (lum(r, g, b) - min) / span;
    const idx = Math.min(FIGURE_STEPS - 1, Math.max(0, Math.round(t * (FIGURE_STEPS - 1))));
    out += String(idx);
  }
  return out;
}

function main() {
  const entries = [];
  for (const c of CAST) {
    const png = decodePng(readFileSync(join(SOURCE, `${c.sheet}.png`)));
    // Two frames: the standing idle (middle column) and one step (first column). The renderer
    // mirrors horizontally for the other facing, so a left-facing figure needs no extra data.
    const idle = frame(png, c.char, 1, FACE_RIGHT);
    const stepFrame = frame(png, c.char, 0, FACE_RIGHT);
    if (idle.px.every((p) => p[3] < 128)) throw new Error(`cast '${c.id}': ${c.sheet} char ${c.char} is empty`);
    entries.push({ id: c.id, w: idle.w, h: idle.h, note: c.note, sheet: c.sheet, char: c.char, frames: [encode(idle), encode(stepFrame)] });
    process.stdout.write(`  ${c.id.padEnd(10)} ${c.sheet} char ${c.char}  ${idle.w}x${idle.h}\n`);
  }

  const body = entries
    .map(
      (e) =>
        `  ${e.id}: {\n` +
        `    w: ${e.w}, h: ${e.h},\n` +
        `    source: '${e.sheet}.png char ${e.char}', note: '${e.note}',\n` +
        `    frames: [\n${e.frames.map((f) => `      '${f}',`).join('\n')}\n    ],\n` +
        `  },`,
    )
    .join('\n');

  const out = `// cast-data.js — GENERATED by scripts/prepare-cast.mjs. Do not hand-edit; re-run the script.
//
// The cast, as per-pixel RAMP-STEP OFFSETS rather than colours. '.' is transparent; '0'..'${FIGURE_STEPS - 1}' are
// offsets from the figure's darkest step. The renderer adds the light level of the tile the figure
// stands on and selects from that role's ramp (palette.js CAST_RAMP), so the cast is lit by the
// scene rather than pasted over it (DESIGN-SEED §4.5 items 2 and 4).
//
// Derived from licensed pack art. Originals: assets/cast/source/. Provenance and the credit line:
// ATTRIBUTION.md, which ships inside the built artifact. Frame 0 is the standing idle, frame 1 is
// one step; both face right, and the renderer mirrors for the other facing.

export const FIGURE_STEPS = ${FIGURE_STEPS};

export const CAST_DATA = Object.freeze({
${body}
});
`;
  writeFileSync(join(ROOT, 'src', 'cast-data.js'), out, 'utf8');
  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  process.stdout.write(`wrote src/cast-data.js (${entries.length} figures, ${kb} KB)\n`);
}

main();
