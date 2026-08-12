# M1 STUDY — the reference, characterized clean-room

This document characterizes the FORMAT of the 1993 Maxis dimetric city-builder (the
reference named in DESIGN-SEED.md) so INNSMOUTH 2000 can transpose its feel without
copying anything. It is written from general knowledge of the genre and of dimetric
pixel rendering, not by inspecting or decompiling any reference binary. No sprite, tile,
palette byte, or font is copied. The trademarked title string appears nowhere in this
repo, this file included. Where a number is a design choice rather than an observed fact,
it is marked **(our lock)**.

The purpose is empirical characterization *before art*: fix the geometry, palette, chrome,
and menu conventions here, then build everything downstream to this bar.

---

## 1. Dimetric tile geometry

The reference is not true isometric (which uses 30 degree axes and a 1.732:1 tile). It uses
the cheaper, sharper **2:1 dimetric** projection that dominated 1990s pixel city-builders,
because a 2:1 diamond tiles cleanly on integer pixel boundaries and lets a straight tile
edge be drawn as a perfect 2-pixels-across-per-1-pixel-down stair-step with no anti-aliasing.

### 1.1 The ground diamond (our lock)

- Base tile footprint on screen: **64 wide x 32 tall**, a 2:1 diamond. This is the master
  ratio; every art asset is authored against it.
- The four corners of tile `(0,0)` relative to the tile's screen anchor (top corner):
  - top    `(32, 0)`
  - right  `(64, 16)`
  - bottom `(32, 32)`
  - left   `(0, 16)`
- A tile's screen position is a pure function of its grid coordinate `(col, row)`; see the
  geometry module (`src/geometry.js`). The mapping is:
  - `screenX = (col - row) * (TILE_W / 2)`
  - `screenY = (col + row) * (TILE_H / 2)`
  - i.e. moving +1 in `col` goes down-right; +1 in `row` goes down-left. This is the genre-
    standard "diamond" walk and makes `row` the depth axis for painter's-order draw.

### 1.2 Height and the wall band

The reference gives terrain elevation and multi-storey buildings by stacking the diamond and
drawing a vertical "wall band" below the top face. We adopt:

- **Elevation step: 16 px** vertical per terrain level **(our lock)** — half the tile's screen
  height, the reference's convention, so a one-level cliff reads as a clean diamond-plus-wall.
- A building of visual height `h` levels draws its top diamond raised `h * 16` px and fills the
  wall band beneath with the building's side shading (two side faces, lit and shadowed, from
  the fixed palette). Sea-level water tiles have zero wall band.

### 1.3 Draw order

Painter's algorithm by depth: iterate tiles in order of increasing `(col + row)`, and within a
constant sum by increasing `row`. Taller objects on a tile draw after the ground of tiles
behind them. Camera cull to the visible diamond before drawing.

### 1.4 Zoom

The reference exposes a small set of discrete zoom levels, not free zoom. We lock **three
levels (our lock)**: `1x` (the authoring size, a 64x32 world tile shown 1:1), `2x` (128x64,
close), `0.5x` (32x16, overview). The geometry module holds tiles at the 64x32 base in world
coordinates; the camera multiplies world pixels by the zoom factor to reach the screen. Scale
factors are powers of two only, so tiles stay pixel-crisp with nearest-neighbor sampling. No
fractional zoom, ever.

---

## 2. Palette and dither conventions

### 2.1 Size and character

The reference is an 8-bit (256-colour) title, but any single scene reads from a much smaller
working set: a handful of terrain ramps plus UI chrome greys. The look is **flat indexed
colour with ordered dithering** between adjacent ramp steps to fake gradients the 256-colour
budget could not spend on true gradients. No smooth alpha gradients, no 24-bit blends.

### 2.2 Our fixed palette (the aesthetic lock)

Innsmouth is the reference's palette "sea-rotted": brine greens, weathered clapboard browns,
fog greys, cold slate roofs, gold lamplit windows. One fixed palette, authored here as hex,
never sampled from any reference image. Each material is a **4-step ramp** (shadow, base,
light, highlight) so the dimetric wall bands and dithers have a consistent light model.

| Material            | shadow    | base      | light     | highlight |
|---------------------|-----------|-----------|-----------|-----------|
| Deep water (brine)  | `#1b3a3a` | `#245150` | `#356b64` | `#4d8378` |
| Shallow / river     | `#356b64` | `#4d8378` | `#6a9c8b` | `#89b6a1` |
| Wet sand / beach    | `#6b6145` | `#8a7d59` | `#a89a70` | `#c3b489` |
| Grass / marsh       | `#3a4a2a` | `#4f6338` | `#6c8049` | `#8a9c5e` |
| Bare earth / dirt   | `#4a3b2c` | `#63503b` | `#7e6a4f` | `#9a8567` |
| Rock / hill         | `#3f4148` | `#565963` | `#6f7480` | `#8b909d` |
| Clapboard wall      | `#5a4636` | `#77604a` | `#8f7458` | `#a98d6d` |
| Slate roof          | `#33363f` | `#454956` | `#585d6d` | `#6d7385` |
| Lamplit window/gold | `#7a5a1e` | `#b8892f` | `#e0b64c` | `#f4d67a` |

UI chrome greys (the OS-window look, section 3), authored as a separate ramp:

| Chrome role   | value     |
|---------------|-----------|
| Window face   | `#b8b4a8` |
| Bevel light   | `#e6e2d6` |
| Bevel shadow  | `#6f6c63` |
| Deep frame    | `#454339` |
| Title bar     | `#3a4a5a` |
| Title text    | `#e8e4d6` |
| Ink / body    | `#2a2823` |

Dithering rule: between two ramp steps, use a 2x2 or 4x4 ordered (Bayer) threshold pattern in
INDEX space, never an alpha blend. A dither is a checker of two solid palette entries.

### 2.3 Outlines

Ground tiles are drawn without a hard black outline (edges read from the ramp light model);
placed objects (buildings, roads, wharves) get a 1 px **deep-frame** (`#454339`) silhouette
edge on their shadowed side only, the reference's way of seating an object on the ground.

---

## 3. UI chrome inventory

The reference's UI is a **beveled OS-window** look: raised grey panels with a light top-left
bevel and a dark bottom-right bevel, a coloured title bar, chunky bitmap-font labels, and
tool buttons drawn as recessed/pressed icon wells. We transpose this whole register; nothing
flat or modern is allowed in a player surface (aesthetic law).

Inventory of surfaces to build across the milestones:

1. **Toolbar** — a vertical or docked strip of icon buttons (bulldoze, road, power line, the
   zone tools, query, and later the disasters menu). Buttons are square wells; the active tool
   reads as pressed-in. Built in this chrome register from M2 day one.
2. **Status strip** — a thin bar showing the date, treasury, population, and the current god-
   favor at a glance. Bitmap-font, ink-on-parchment or ink-on-chrome.
3. **Query window** — a small draggable beveled window that appears when the query tool taps a
   tile: shows the tile/building identity, class of resident, services, dread contribution.
4. **Budget window** — a beveled dialog with tax sliders per resident class, expense lines, and
   a projected balance (M4).
5. **Disasters menu** — a menu (the reference's homage) listing each god's wrath as a summonable
   entry, for deliberate triggering and as the test hook (M6).
6. **The Innsmouth Courier** — a full-screen serif broadsheet newspaper overlay (M7), headlines
   generated from real sim events; a dry New England register sliding into cosmic dread.
7. **Advisor** — the Old Priest, a portrait-plus-text advisory popup counseling appeasement.

Chrome construction rule (our lock): every window = deep-frame 1 px border, then window-face
fill, then a 2 px bevel (light top+left, shadow bottom+right), title bar in title-bar blue with
title text, an optional recessed content well (bevel inverted) for lists and canvases.

Typography: player surfaces use a chunky bitmap-style face rendered pixel-crisp, never a smooth
modern webfont. Numbers are tabular. No em-dashes in player text (plain English, period register).

---

## 4. Disaster / menu conventions

The reference ships a disasters menu that lets the player summon each disaster deliberately, as
spectacle and as a sandbox tool. We keep exactly this, and it doubles as our automated test hook:
every wrath must be triggerable by a function call with a seed, producing a deterministic result
the test battery can assert on.

Conventions transposed:

- **Menu of named disasters.** Each entry names a god and its wrath (Dagon: Flood Tide; Cthulhu:
  the Awakening; Shub-Niggurath: the Greening; Nyarlathotep: Fires and Riots; Yog-Sothoth: the
  Rift). Selecting one fires that wrath immediately at current intensity.
- **Spreading / stepwise disasters.** Reference disasters (fire, flood, monster) propagate tile
  by tile over sim ticks rather than resolving instantly, so the player watches them crawl. Our
  wraths inherit this: the Greening devours block by block, fire/riot spreads along streets, the
  flood tide advances up the shore, the Rift scrambles a district's tiles, the Awakening is the
  rare city-wide catastrophe. All are seeded and deterministic.
- **Favor as the difference from the reference.** Where the reference disaster is pure random
  event or player whim, ours also fires from a neglected FAVOR track at a threshold; appeasement
  paths (shrines, ordinances, the Containment Wing) delay or prevent. That favor layer is the
  game (streamline law: the depth saved by cutting pipes/subways/airports goes here).

---

## 5. Streamline scope (what the substrate must and must not support)

IN (the substrate is built to carry these): dimetric tile grid, roads, power lines, zones,
budget, ordinances, disasters, query, newspaper. OUT (never networked): water pipes, subways,
airports, seaports-as-networks (wharves are buildings), arcologies, neighbor deals.

The M1 substrate therefore provides: a tile grid with per-tile terrain + a slot for a placed
object; the dimetric projection and its inverse (screen->tile) for tools; discrete camera
pan/zoom; and seeded coastal map generation (a real shoreline, a river mouth, hills) because
Innsmouth is a coast town and every later system (Deep Ones need waterfront, wharves need shore)
depends on the coast existing from the first tile.

---

## 6. The failing test (asked at every art commit)

"Could this pass as a 1994 Maxis screenshot? Does it look cheap?" Answered honestly in the commit
message of any art-bearing increment. Banned: flat modern UI, vector minimalism, smooth gradients,
modern fonts in player surfaces. A bare placeholder rect may exist mid-increment but never closes
a milestone.
