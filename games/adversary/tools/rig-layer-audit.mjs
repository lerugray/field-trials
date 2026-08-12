// rig-layer-audit.mjs — derive the rig's colour -> body-part map from its OWN Aseprite layers.
//
// The rig sheets encode body parts as flat identifier colours, but the mapping of colour to
// part is documented nowhere in the pack, and guessing it from hue families gets it wrong:
// a hue reading looks at the green blob on a right-facing torso and calls it the BACK arm,
// while the pack's own layer stack says green is the FRONT arm. Near-vs-far limb depth is
// exactly what the shading pass needs, so the pack's names are the ground truth.
//
// This drives tools/rig-layer-audit.lua in ONE headless Aseprite invocation (`-b --script`)
// and reduces its per-layer colour census to a committed map, tools/rig-color-map.json.
// The extractor then runs pure-node against the flattened PNGs using that committed map —
// Aseprite is needed to REGENERATE the map, never to use it.
//
//   node tools/rig-layer-audit.mjs            # rewrite tools/rig-color-map.json
//   node tools/rig-layer-audit.mjs --check    # verify the committed map still matches
//
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SHEETS, RIG_ROOT, PART_ORDER, TOOLS_DIR } from './rig-manifest.mjs';

const ASEPRITE = '/Users/rayweiss/Library/Application Support/Steam/steamapps/common/'
  + 'Aseprite/Aseprite.app/Contents/MacOS/aseprite';

const MAP_PATH = join(TOOLS_DIR, 'rig-color-map.json');
const REQ_PATH = join(TOOLS_DIR, '.rig-audit-request.json');
const RAW_PATH = join(TOOLS_DIR, '.rig-audit-raw.json');
const LUA_PATH = join(TOOLS_DIR, 'rig-layer-audit.lua');

// The rig's own layer names, normalised onto our part vocabulary. The pack is wildly
// inconsistent — "Back arm" vs "Front Arm" vs "Back Hand" (the run sheet calls its arms
// hands), "Slashies" vs "slashies", "Sword/Sheathe" on one katana sheet and nothing on the
// other — so match case-insensitively against this table and shout about anything unseen.
const LAYER_TO_PART = {
  'back leg': 'backLeg',
  'back arm': 'backArm',
  'back hand': 'backArm',
  torso: 'torso',
  'front leg': 'frontLeg',
  'front arm': 'frontArm',
  'front hand': 'frontArm',
  head: 'head',
  'sword/sheathe': 'weapon',
  katana: 'weapon',
  sword: 'weapon',
  weapon: 'weapon',
  slashies: 'fx',
  'slashies 2': 'fx',
  'damage indicator': 'fx',
  dust: 'fx',
  trail: 'fx',
  fx: 'fx',
  effects: 'fx',
};

// Layers carrying no part information: empty backgrounds, and the two sheets whose sources
// were flattened before shipping (dash = "Layer 1", walk = "Layer 2"). Flattened sheets get
// segmented purely by the colour map derived from the sheets that DID keep their layers.
const IGNORED_LAYERS = new Set(['bg', 'gif bg', 'layer 1', 'layer 2', 'background']);

function runAseprite() {
  writeFileSync(REQ_PATH, JSON.stringify({
    root: RIG_ROOT,
    sheets: SHEETS.map((s) => ({ id: s.id, aseprite: s.aseprite })),
  }));
  if (existsSync(RAW_PATH)) rmSync(RAW_PATH);
  // -b is mandatory: without it this opens the Aseprite GUI.
  execFileSync(ASEPRITE, ['-b', '--script', LUA_PATH], { stdio: 'inherit' });
  if (!existsSync(RAW_PATH)) throw new Error('aseprite produced no audit output');
  const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8'));
  rmSync(REQ_PATH, { force: true });
  rmSync(RAW_PATH, { force: true });
  return raw;
}

function main() {
  const check = process.argv.includes('--check');
  const raw = runAseprite();

  const votes = new Map(); // colour -> part -> pixels
  const unknownLayers = new Set();
  const layerOrder = {};

  for (const sheet of raw.sheets) {
    if (sheet.missing) {
      console.warn(`! missing aseprite source for ${sheet.id}`);
      continue;
    }
    layerOrder[sheet.id] = sheet.order;
    for (const layer of sheet.layers) {
      const key = layer.name.toLowerCase();
      if (IGNORED_LAYERS.has(key)) continue;
      const part = LAYER_TO_PART[key];
      if (!part) {
        unknownLayers.add(layer.name);
        continue;
      }
      for (const [color, n] of Object.entries(layer.colors || {})) {
        if (!votes.has(color)) votes.set(color, new Map());
        const m = votes.get(color);
        m.set(part, (m.get(part) || 0) + n);
      }
    }
  }

  // Resolve each colour to the part whose layers contain it most, and record the margin so
  // an ambiguous identifier colour cannot hide behind a plurality win. The pink family is
  // genuinely ambiguous (blade and slash arc share colours on the katana sheets) — the
  // extractor separates those geometrically rather than by colour.
  const colors = {};
  const ambiguous = [];
  for (const [color, m] of votes) {
    const ranked = [...m].sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((s, [, v]) => s + v, 0);
    colors[color] = ranked[0][0];
    if (ranked[0][1] / total < 0.95) {
      ambiguous.push({ color, share: +(ranked[0][1] / total).toFixed(3), ranked });
    }
  }

  const payload = {
    _comment: 'DERIVED by tools/rig-layer-audit.mjs (via rig-layer-audit.lua) from the rig '
      + "pack's own Aseprite layer names. Do not hand-edit; regenerate. Maps a rig "
      + 'identifier colour -> body part.',
    generated: new Date().toISOString().slice(0, 10),
    partOrder: PART_ORDER,
    unknownLayers: [...unknownLayers].sort(),
    layerOrder,
    ambiguous: ambiguous.sort((a, b) => a.share - b.share),
    colors: Object.fromEntries(Object.entries(colors).sort()),
  };

  if (check) {
    if (!existsSync(MAP_PATH)) {
      console.error('FAIL: no committed map to check against');
      process.exit(2);
    }
    const have = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
    if (JSON.stringify(have.colors) !== JSON.stringify(payload.colors)) {
      console.error('FAIL: committed colour map differs from a fresh audit');
      process.exit(2);
    }
    console.log(`OK: committed map matches audit (${Object.keys(payload.colors).length} colours)`);
    return;
  }

  writeFileSync(MAP_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${MAP_PATH}: ${Object.keys(colors).length} colours`);
  if (unknownLayers.size) console.log('unmapped layer names:', [...unknownLayers].join(', '));
  for (const a of ambiguous) console.log('  ambiguous', a.color, a.share, JSON.stringify(a.ranked));
}

main();
