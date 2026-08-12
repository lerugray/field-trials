# Design seed — grounded in the Cyclopean II recon (2026-08-01)

Reference facts (from format recon of the demo; structure only, clean-room):
- Overworld = a literal coordinate grid of chunked tile maps streamed around the party
  (master map + `region_x_y` chunks). Top-down 2D, party as one icon.
- Cities = separate denser 2D areas, their own mode (19 named cities in the reference).
- Dungeons = assembled from MODULAR SEGMENT PREFABS with directional connector variants
  (N/S/E/W templates, end-caps) — a tile-kit, not hand-built monoliths.
- First-person dungeon view = grid-locked movement, 90° turns, turn-based encounters.
- Combat = streamlined turn-based; approach options beyond fighting (talk/stealth/flee).
- Party = randomized strangers who ally (reference calls them Dreamers; ours are TBD by
  the operator's register pass — placeholder: Initiates).
- Look = ONE hue at a time: monochrome palette schemes selectable in options; CRT shader
  on top. UI framed as old-school CRPG panels.

## The one aesthetic law (operator, 2026-08-02)
The visual vibe carries 60-70% of this game. The medium is ancient; the build must be
pleasant to look at while streamlined — and the prose register alone should make even
the log charming in itself. Every surface decision answers to this first.

## Our stack (decided)
- Single-page browser app, ES modules, no bundler, no dependencies. Boots from file://.
- Canvas 2D for overworld/city/UI; first-person dungeon renderer as flat-shaded grid
  projection (classic wireframe/fill — perfect for monochrome; WebGL not required for M1).
- All art drawn by code at boot into offscreen canvases (tiles, sprites, panels, font ok
  to use a bitmap-style code-drawn font). Palettes = code tables; CRT = CSS/canvas filter
  pass (M4).
- Node test suite (node --test) over the engine modules (map streaming, movement, dungeon
  assembly from segments, combat resolution, save/load) — headless, deterministic, seeded.
- Data-driven content: world chunks, city layouts, dungeon segment kits, encounters,
  register strings all in JSON under data/.

## Milestones (build order; each ends battery-green + committed + pushed)
- M1 WALK: overworld chunk grid renders + party moves + collision; enter/exit a dungeon
  site; first-person grid crawl of a generated tile-kit dungeon; return to overworld.
- M2 FIGHT: streamlined turn combat (party vs encounter; fight/talk/flee), death/rest;
  encounters placed by data.
- M3 CITY: city mode with enterable buildings + placeholder services (talk hooks).
- M4 VIBE: palette selector (≥4 single-hue schemes), CRT pass, title screen, save/load.
- M5 VISUAL REGISTER (operator-directed 2026-08-02, post first-boot review): authored-quality
  code-drawn tile art + bestiary busts + bigger default scale, gallery-first — full spec in
  docs/DIRECTIONS-2026-08-02-VISUAL-REGISTER.md (that file is the milestone's contract).
- M6 INTERFACE (operator-directed 2026-08-02): polished/streamlined menus + UI/UX across
  every mode — contract in docs/DIRECTIONS-2026-08-02-INTERFACE-JOURNAL.md.
- M7 JOURNAL (operator-directed 2026-08-02): player-writable journal with seeded
  corruption + ghost entries (CLIFTON-adjacent) — same contract file.
- M8 WORLD CHARACTER (operator-directed 2026-08-02, post M6/M7 review): art bar raised
  (Cyclopean-studied color + digital character), overprint fixes, visible wanderers +
  dungeon enemies with sneak, town variety — contract in
  docs/DIRECTIONS-2026-08-02-WORLD-CHARACTER.md.
- M9 BIOMES (operator-directed 2026-08-02): guaranteed areas/biomes every run — distinct
  monsters/NPCs/events/registers per biome, bestiary expansion authorized — contract in
  docs/DIRECTIONS-2026-08-02-BIOMES.md (absorbs the banked fixed-landmarks item).
Stop at M9. Everything further is operator-directed.

## Register hooks (structure now, prose later)
data/register/*.json holds ALL player-facing strings, every entry prefixed [SEED] until
the operator's voice pass. Direction for placeholder drafting: Illuminatus! trilogy /
Robert Anton Wilson / Discordiana — conspiracy-as-architecture, jokes that might be
warnings, numerology (23s, 5s), bureaucracies of the hidden order. Never explain the
joke; the form stays deadpan old-school CRPG.
