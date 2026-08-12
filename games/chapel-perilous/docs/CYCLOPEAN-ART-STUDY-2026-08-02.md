# Cyclopean II — art study (2026-08-02, for CHP M8 WORLD CHARACTER)

Operator-directed study (DIRECTIONS-2026-08-02-WORLD-CHARACTER §2). The reference
demo is installed and its loose image assets are **readable** — so no fallback was
needed. This doc CHARACTERIZES the art model; it copies/embeds/derives no asset.
CHP will match the *model* through its own palette + CRT systems, not clone hues.

Method: inventoried the install (2724 files: 717 PNG, 684 DDS, 603 MDL, 514 WMB,
134 OGG, 55 FX, plus 3 TGA / 3 PCX / 2 BMP / 1 XCF). The loose PNGs are the 2D art
layer — creatures, portraits, terrain/wall/floor/ceiling textures, overworld icons,
UI panels + buttons. Read a representative curated set visually; measured per-asset
color saturation across a 40-asset random sample.

## 1. Resolution & scale — very low native res, hard upscale

Every UI panel (`Combat_Panel`, `Char_Panel`, `Encounter_Panel`, `Bribe_Panel`, …)
is authored at **exactly 640×360** — the game composes at 640×360 (16:9) and upscales
hard. Creature/portrait sprites are 128×128; small floor tiles 64×64, most terrain
128×128. The look lives at a LOW logical resolution, magnified. This is the pixel bar:
character has to survive heavy magnification, so it is carried by texture, not by fine
detail. (CHP's frame is a 540-tall logical backing — same philosophy, one tier taller.)

## 2. Color model — THE key finding: grayscale world, sparse deliberate accents

Measured saturation over a random 40-asset sample. The result is unambiguous:

- **The world is essentially grayscale.** ~75%+ of sampled assets have average
  saturation ≈ 0: every terrain tile (`tile_crag`, `tile_rock`, `tile_cliff_face`,
  `tile_grave`, `tile_bones`, `tile_sea_inside`, `floor_2`), every dungeon
  wall/ceiling (`wall_sarkomand`, `wall_crypt`, `Vault_Door`), every creature/portrait
  (`Bat`, `Cat`, `Lurker_007`, `Pickman_2`), every overworld icon (`overworld_gladius`,
  `Boat`, `tile_tower_base`) — **pure black↔white dither**, no hue at all.
- **Color is a rare, meaningful accent**, concentrated in exactly two places:
  1. **Special world matter** — `Lake_07` reads 99% colored, a saturated **cyan**
     (water); `Jungle_railing` a saturated green (living foliage); `house_exit`,
     `Chest` carry a faint tint. Color marks *water, life, and interactables* against
     the gray stone world.
  2. **Interactive UI** — inventory/menu buttons (`Inv_Button_*`, `menu_load`,
     `UI_ZoomIn`, `obs_button_pick`) are flat vivid fills (the `Equip` button is
     magenta-pink with a hard dark outline); the brighter `_2` hover variants signal
     touchability. Color here = affordance, not decoration.
- **Even the accents are dithered**, not flat gradient fills — `Lake_07`'s cyan is a
  crosshatch ripple grid, not a smooth wash.

Net mood: near-monochrome and desaturated, so the few color hits (water cyan, UI pink,
foliage green) land HARD. This is precisely a **single-hue/grayscale base + deliberate
accent pops on meaningful elements** model — the exact fallback the directive named,
confirmed as the *actual* model. It maps cleanly onto CHP's existing 0..6 single-hue
ramp + per-scheme `accentColor`; the gap is that CHP currently spends its accent only
in the HUD and draws its world as flat shade-blocks (see §5).

## 3. Texture & dithering — where the "digital character" comes from

Everything is built from **dithering / stipple / crosshatch** at a near-1-bit depth.
Gray tones are simulated by black/white *dot density* (ordered + noisy dithering), not
by smooth ramps or flat fills. Observed habits:

- **Terrain** = fields of stipple noise at varying density with darker seams. `floor_1`
  is flagstones — each stone a patch of dithered noise, grout lines a darker stipple;
  `wall_1` is dense chaotic high-frequency stipple reading as rough rock. No flat areas.
- **Creatures, two sub-treatments:**
  - *Silhouette-stamp* (`Bat`): a solid black shape whose **edges erode into scratchy,
    broken, drybrush dither** — nothing is a clean vector edge; the silhouette
    disintegrates into stray dots at its margin.
  - *Stipple-engraving* (`Cat`): a woodcut/etching look — interior gray shading built
    entirely from stipple density, hard black accents for depth, white for highlight.
- **Objects/portraits** (`Pickman_2`) share the stipple-engraving language: small,
  silhouette-forward, dithered interior.

The character at low res comes from four things, in order of impact:
1. **Dither noise reading as material** — density = texture; the eye never sees a flat
   block, so nothing looks like a programmer placeholder.
2. **Broken / eroded / drybrush edges** — hand-cut, grungy, never clean.
3. **Hard black silhouettes** for beings (instant readability).
4. **Restraint** — the near-monochrome field makes the sparse color pop.

## 4. Portrait vs environment treatment

Both speak the same grayscale-dither language, but:
- **Beings** are *silhouette-forward*: strong black mass, readable shape at a glance,
  dithered interior shading, eroded edge. Foreground objects on transparency.
- **Environment** is *all-over texture*: no silhouette, edge-to-edge dither fields with
  seams/grout, tiled. It's a surface, not a shape.

So the same tool (dither) is deployed for *shape* on creatures and for *surface* on
terrain. CHP should keep busts silhouette-forward and give tiles all-over dither.

## 5. What CHP must change to hit this bar (the brief)

CHP already has the right bones: a 0..6 single-hue shade ramp per palette, a per-scheme
`accentColor`, a CRT pass, authored 16×16/20×20 shade matrices, silhouette busts. The
distance to the Cyclopean bar is FOUR concrete moves, each expressible in CHP's own
systems (no hue-cloning):

1. **DITHER the world (biggest lever).** CHP tiles currently draw as flat blocks of a
   single ramp index. Introduce an ordered-dither/stipple layer so each surface is
   built from *two adjacent ramp levels mixed by a dot pattern* — instant material
   texture, intermediate tones from a coarse ramp, and the "digital character" the
   operator asked for. Apply to overworld tiles, city tiles, dungeon walls/floors.
2. **Erode bust & silhouette edges.** Add edge stipple/erosion to busts and the overworld
   party/wanderer icons so nothing is clean-vector.
3. **Push accent color into the WORLD (directive §3).** Spend `accentColor` sparingly on
   *meaningful matter* — water glint on sea/lake tiles, blood in combat, gold/sigil pops,
   the chapel landmark, the party marker — dithered in, never flat. Base ramp stays
   strictly single-hue; accent is the only second colour, exactly as now, but reaching
   the scene instead of only the HUD.
4. **Coarser, higher-contrast shading.** Lean on the darkest/lightest ramp ends for
   silhouette punch; use dither to fake the middle. Avoid the flat mid-gray look.

All four keep every palette + the CRT working, honour hard rule 2 (code-generated, no
imported assets), and honour the spirit of clean-room: we characterized an *aesthetic
model* and will realize it through CHP's own deterministic draw code — we import,
embed, and derive from zero Cyclopean pixels.
