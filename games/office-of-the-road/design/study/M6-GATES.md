# M6 GATES — Full art pass: idiom + pixel gates, opus-looker checklist, CVD re-run

DESIGN-SEED M6: *Willibab integration across map/UI/town/battle; idiom gates + pixel
gates; opus looker with checklist on every surface; colorblind sim re-run on the
final palette.* All art is licensed-pack only (hard rule #1); a missing sheet is a
loud marker, never a code-drawn stand-in; provenance for every sheet the build
touches is recorded in `materials/ASSET-MANIFEST.md` and ships in `ATTRIBUTION.md`.

## Licensed art in the build (all CC BY unless noted)

| Surface / role | Pack | Sheet | Grid | Bound by |
|---|---|---|---|---|
| Sideview battlers (combat) | Simple 8-bit Sideview Battlers | `sv_actors/*` (9 sheets) | 144×144 [confirmed] | `art.js` JOB_BATTLER / ENEMY_BATTLERS (M2) |
| Tarot hand + omens + draft | GuttyKreum Pixel Tarot (commercial) | 22 arcana + back | whole (57×79) | `art.js` TAROT_KEYS (M3) |
| UI instruments (gold/supplies/mandate/arm/guard) | Willibab's Retro Icons | `Iconset.png` | 32×32 [confirmed] | `art.js` ICON (M6 inc1) |
| Map terrain (the road) | Willibab Overworld | `OW_A2.png` | 16×16 [confirmed] | `art.js` TERRAIN_TILE (M6 inc2) |

## GATE 5 — art idiom + pixel grid (`node scripts/gates.mjs`)

`src/artgate.js` reads each sheet's real dimensions (from the PNG IHDR) and asserts
every bound cell is grid-aligned AND in-bounds AND the sheet is a clean multiple of
its frame edge (a *confirmed* grid). Also asserted at moderate cost in
`test/artgate.test.js`.

```
iconset 512×1408 @32 · overworld 256×256 @16 · battler 1296×864 @144
checked 11 bindings (icons + terrain tiles + battler frame)
-> ALL GRID-ALIGNED & IN-BOUNDS
```

**Pixel gate.** Tiles are drawn at NATIVE 16px (repeated + clipped) and battlers at
their native 144px — integer, nearest-neighbour (`imageSmoothingEnabled = false`),
no stretch. Icons are downscaled to 9–11px (nearest-neighbour) for the compact HUD
— a clean pixel-art downscale, still grid-sliced at the source. The whole 320×200
virtual canvas is nearest-neighbour up-scaled by `fit()`, so every pixel stays crisp.

## GATE 3 (re-run) — legibility contrast + CVD over the ART surfaces

The WCAG contrast gate (body ≥4.5, edge ≥3) is unchanged and GREEN (the palette did
not move at M6). The colour-vision-deficiency simulation was RE-RUN over the new art
surfaces:

- `proofs/march-cvd-{deuter,protan,tritan}-m6-*.png` — the tiled road. Terrain stays
  distinguishable by luminance AND the text label chip (a non-colour channel — the
  instrument names the ground), so segments never rely on hue alone.
- `proofs/shop-cvd-deuter-m6-*.png` — the quartermaster with sword/shield slot icons
  and the gold orb; all legible.

## Opus-looker checklist — per surface

Asked at every surface: (a) art present & licensed (no placeholder); (b) sliced on
the native pixel grid; (c) body ≥4.5 / edge ≥3 contrast; (d) a non-colour channel
for every state distinction; (e) no clipped text at 1280×800. `✓` pass · `n/a` no
pack art on that surface by design (schematic instrument).

| Surface | pack art | pixel-grid | contrast | non-colour ch. | no clip |
|---|---|---|---|---|---|
| Combat (battlers, HP bars, floats, hand) | ✓ sv_actors + tarot | ✓ 144/whole | ✓ | ✓ glyph+bar+word | ✓ |
| March (road tiles, mandate, party, ledger) | ✓ overworld + icons | ✓ 16/32 | ✓ | ✓ label chip + numerals | ✓ |
| Camp / Town (frames, actions, valve) | ✓ battler thumbs | ✓ 144 | ✓ | ✓ stamp warn + focus ring | ✓ |
| Quartermaster (slot icons, stock, stores) | ✓ icons | ✓ 32 | ✓ | ✓ arm/guard icon + name | ✓ |
| Route board (branch cards) | n/a (schematic) | n/a | ✓ | ✓ colour + `[safety]` bracket | ✓ |
| Deck review / draft (tarot) | ✓ tarot | ✓ whole | ✓ | ✓ window word + outline | ✓ |
| Filed report / defeat (certs, ledger) | n/a (prose) | n/a | ✓ | ✓ tone colour + label | ✓ |
| Docket / Intake / Orientation | n/a (form) | n/a | ✓ | ✓ `[x]` boxes + focus ring | ✓ |

## Ratify notes (for the operator)

- **Overworld terrain binds to solid A2 ground sub-tiles** (grass/chalk/sand/rock/
  water), not full autotiling — correct for a terrain *band*, and idiom-safe (the
  top-left block sub-tile fills uniformly). *Lean: keep; full autotile borders are
  only warranted if the map becomes a walkable field.*
- **Icons downscale to ~10px** in the HUD. Clean nearest-neighbour, but a purist
  pixel gate prefers integer scales. *Lean: acceptable for UI chrome; a 16px HUD
  band could show them 1:1 if the operator wants.*
- **Town has no dedicated tiled SCENE yet** — the quartermaster is an instrument
  surface (icons + panels), not a walkable town render. The Willibab TOWN tileset is
  staged and inventoried. *Lean: a tiled town vignette is a worthwhile M6+ polish
  item; flagged for operator ratification rather than assumed in-scope.*
- **Enemies still draw from the sv_actor grid (flipped)**, not the Monster Pack
  (per the M2 ratify note). *Lean: the Monster Pack can enrich the bestiary later.*
