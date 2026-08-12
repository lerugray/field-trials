# tools/ — the hero paint-over pipeline

Turns the purchased **2D Pixel Art Character Template** rig into painted ADVERSARY hero sheets.
Tooling only: nothing here is imported by `src/`, and nothing here writes into `assets/`.

The rig is a *draw-over template*, not finished art — every frame is flat colour-coded body-part
blocks with a featureless cyan disc for a head (`docs/ART-PACK-CATALOG-2026-08-09.md` §2.1). Its
value is 315 frames of professional timing with limbs already separated. This pipeline paints a
hero through those separations.

Plain node, zero dependencies. Aseprite is used only where Aseprite is genuinely required.

## Run order

```sh
node tools/rig-layer-audit.mjs          # derive the colour->part map (needs Aseprite)
node tools/rig-facing-probe.mjs         # facing from physics: trail anchor + orientation uniformity
node tools/rig-extract.mjs --report     # per-frame geometry -> tools/derived/ (committed)
node tools/paintover.mjs                # painted sheets + per-part layer sheets
node tools/hero-to-aseprite.mjs         # layered indexed masters -> docs/hero-draft/aseprite/
node tools/contact-sheets.mjs           # docs/hero-draft/CONTACT-SHEET-<date>-<variant>.png
node tools/head-check.mjs               # docs/hero-draft/HEAD-CHECK-<date>-<variant>.png
node tools/verify-paintover.mjs --aseprite
```

Steps 1 and 4 are the only ones that need Aseprite; the map and the masters are the products, so
day-to-day iteration is steps 2, 3, 5, 6 and never launches it.

## Modules

| File | Role |
|---|---|
| `png.mjs` | PNG decode/encode over `node:zlib`. Colour types 0/2/3/4/6, 1-8 bit. Encodes RGBA8. |
| `sheet.mjs` | Contact-sheet composition. Labels reuse the game's own `src/render/pixelfont.js`. |
| `rig-manifest.mjs` | Which rig sheets get painted, with **measured** frame geometry and facing. |
| `rig-facing-probe.mjs` | Facing from physics (motion trail, topple) plus cross-sheet orientation uniformity. The check that the manifest's facing values are not fiction. |
| `rig-layer-audit.{mjs,lua}` | Derives `rig-color-map.json` from the rig's own Aseprite layer names. |
| `rig-color-map.json` | **Derived — do not hand-edit.** 27 identifier colours -> body part. |
| `rig-segment.mjs` | The one segmentation path: frame -> per-part masks, tone ranks, geometry. |
| `rig-extract.mjs` | CLI over the segmenter; writes `derived/rig-geometry.json`. |
| `hero-palette.mjs` | The palette spine (Legacy Vania 19 + 2 hero tones) as named ramps. |
| `hero-parts.mjs` | **The authored art**: materials and head/feature drawing per variant. |
| `paintover.mjs` | The compositor: assign -> shade -> resolve -> outline. |
| `hero-to-aseprite.{mjs,lua}` | Layered indexed `.aseprite` masters for hand-polish. |
| `contact-sheets.mjs` | The operator-facing deliverable. |
| `head-check.mjs` | Three-frame head-vs-body proof strip per variant (idle F0, run F3, slash F3 at 8x). |
| `verify-paintover.mjs` + `aseprite-audit.lua` | Objective checks; exits 2 on failure. |

## How the paint works

The rig frame already contains a hand-drawn silhouette for every pose, so the compositor paints
**inside each part's mask** rather than stamping rotated limb sprites. At ~30px a limb is 3-6
pixels across and nearest-neighbour rotation of a 4px forearm produces gravel, not a rotated
forearm. Keeping the mask keeps all 89 authored silhouettes and spends the effort on material
and feature instead.

Two things make that more than a recolour:

**Tone rank.** Each rig part is drawn in 2-4 identifier tones — base, shade, sometimes a mid or
highlight. That is the original animator's shading, encoded in the identifier palette. Ranking a
part's tones by luma gives a normalised position that maps onto the hero's own ramp, so the paint
inherits 315 frames of shading decisions instead of inventing light per frame.

**Rotation-aware feature frames.** Head features are placed in a local basis whose "up" is the
vector from the torso centroid to the head centroid, and whose "forward" is that turned a quarter
turn (which resolves to canonical-left when upright). Faces therefore rotate correctly through the
air-spin tumble, and features clip to the mask, so a frame showing a sliver of skull gets a sliver
rather than an overdrawn face.

Passes, in order: **assign** (ramp + integer index per pixel; features locked) -> **contact
shadow** (a farther part drops a step along a seam with a nearer one) -> **shade** (top-lit rim,
one step up the pixel's *own* ramp) -> **resolve** -> **outline** (1px ink, body silhouette only;
slash arcs are not outlined because outlining a glow makes it read as a solid object).

## Conventions worth not re-deriving

- **Canonical facing is LEFT; every source sheet faces RIGHT; so ALL ELEVEN are mirrored.** This
  value has been wrong twice, both times in the data and never in the pipeline. First from the
  catalog's §2.4 table (right about the base sets, wrong about the katana pair, so the katana pair
  went unmirrored and wore its face on the back of its head). Then from a toe-direction measure
  that is *inverted* on this rig, which stripped the mirroring off the nine correct sheets and made
  all eleven wrong. **Anchor facing to physics, never anatomy**: the dash trail streams backward,
  the death animation topples forward. `rig-facing-probe.mjs` measures both plus cross-sheet
  orientation uniformity, and `verify-paintover.mjs` fails the build on any disagreement — including
  on the final normalised frames.
- **Anchor by feet, not canvas centre.** The wide canvases (80x64 katana) are weapon-arc headroom.
- **The outline grows the silhouette 1px**, so ~30px standing height paints as ~32px. The 48px
  canvas has the room and the feet anchor is unchanged.
- **`Player Death 64x64.png` is 48x48 with 10 frames.** Its filename lies; the pixels and the
  `.aseprite` agree.
- **Only verbs the game HAS are in the manifest.** Crouch, slide, wall-cling, climb, push/pull,
  gunplay and roll are deliberately absent — an animation existing is not authority to add a
  mechanic, and Roll is explicitly contradicted by DESIGN-SEED's "a step, not roll spam".

## Aseprite

Always headless, always batched:

```sh
"/Users/rayweiss/Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite" -b --script tools/<script>.lua
```

`-b` is mandatory; never invoke the `.app` bundle and never `open` it. Batch everything into ONE
invocation — the binary bounces the macOS Dock on each launch even in batch mode, and the first
version of the layer audit fired ~80 launches (one per layer) to do what one script now does.

Lua gotchas, inherited from `snesos/tools/grids-to-aseprite.lua` and all still live: `json` is a
built-in global (do not require it); Aseprite numbers are floats and `Image:putPixel` with a float
index **silently corrupts** the pixel, so every index goes through `math.tointeger`; palette index
0 is the transparent slot and its RGB must never be matched against.

## Node gotcha

The repo path contains a space (`Dev Work`), so `import.meta.url` is percent-encoded and the usual
`import.meta.url === \`file://${process.argv[1]}\`` main-guard **silently never matches** — the
script runs and does nothing. Use `pathToFileURL(process.argv[1]).href`.

## Where output goes

| Path | Tracked? | What |
|---|---|---|
| `tools/derived/rig-geometry.json` | yes | The extraction record — evidence about the rig, independent of any paint decision. |
| `tools/out/<variant>/` | no (gitignored) | Painted sheets and per-part layer PNGs. Regenerable: `node tools/paintover.mjs`. |
| `docs/hero-draft/CONTACT-SHEET-*.png` | yes | The operator-facing deliverable. |
| `docs/hero-draft/aseprite/` | yes | Layered indexed masters for hand-polish. |

## Verification

`verify-paintover.mjs` is the gate, and it checks things looking at a contact sheet cannot:

1. **Coverage** — painted body pixels equal the rig's opaque pixels exactly, per part and per
   frame. A part that silently failed to stamp fails the build.
2. **No rig colours** — zero pixels of any of the 27 rig identifier colours survive into output.
   One leak means a pixel was copied rather than repainted.
3. **Palette** — every output colour is in the declared palette, which is what makes the
   "12-colour sprite" claim on the contact sheet checkable rather than asserted.
4. **Masters** — the `.aseprite` files exist with the right frame counts, are layered rather than
   flattened, and are indexed.
5. **Facing** — three conditions: the raw dash trail anchor agrees with the declared facing; every
   sheet shares one orientation signature; and on the FINAL normalised frames the trail streams
   backward relative to canonical facing. The third is the head-vs-body invariant, and it is the
   one that matters: it compares output against a fact about the source pixels, so unlike a
   head-to-head consistency check it cannot pass while every head is uniformly backwards. Two
   generations of this bug survived because nothing tested that.

Green checks are not a substitute for looking. Several real defects passed every automated check and
were caught only by rendering the frames and reading them: boots blown out to white, a tunic that
read as bare skin, a head that lost every feature on five dash frames — and, twice, a hero mirrored
against his own face. `head-check.mjs` exists so that last class takes one glance to spot.
