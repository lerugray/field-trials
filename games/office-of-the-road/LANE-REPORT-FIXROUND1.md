# OOR fix round 1 — lane report

Date: 2026-08-11  
Scope: the pre-release audit's FIX-FIRST list, in priority order  
Artifact: `dist/office-of-the-road.html`

## Result

All six requested fix groups landed. The Node suite grew from **157/157** to **166/166** and is green. The single-file distribution was rebuilt at **721.4 KB / 29 modules**. `ATTRIBUTION.md` was not changed, and no audio files, generated art, network dependencies, band-kit API changes, pushes, or out-of-repo writes were introduced.

Browser verification used Playwright Chromium over `file://` with:

```text
--single-process --no-zygote --disable-gpu --disable-software-rasterizer
```

The authoritative browser measurements are in `docs/proofs/fixround-20260811/measurements-verified-20260811.json`. The `*-verified-20260811.png` files in that directory are the final title/intake, draft, march, combat, shop, route, and credits captures. Earlier dated captures were retained because the proof rule forbids overwriting.

## 1. Text rasterization (OR-1)

All game-layer text now goes through `src/pixel-font.js`, a proportional 5×7 bitmap face with an integer 2× heading size. Lit cells are drawn only as integer `fillRect` runs. The game layer and rebuilt distribution contain no `fillText`, `strokeText`, or `measureText` calls.

| probe at body size | before | after |
|---|---:|---:|
| ink pixels | — | 208 |
| solid/full-luminance ink | 0 px / 0% | **208 px / 100%** |
| antialiased partial share | **100%** | **0%** |
| distinct partial glyph levels | 124 | 0 |

Regression: `test/pixel-font.test.js` renders a probe into an offscreen pixel buffer, asserts at least 90% full-luminance ink, asserts zero partial pixels, checks the integer heading expansion, and rejects canvas font-rendering calls in the game layer. The same probe was rerun in Chromium against an actual offscreen canvas; it measured 208/208 solid pixels.

## 2. Score variation (OR-3)

The band-kit core API is unchanged. Variation is composed in `src/score.js` using the existing `n`, `bar`, `params`, and `rand(salt)` hooks. March and combat now carry four full bars; town, office, and report alternate phrases and use seed-stable ornaments. Combat reads live intensity through `band.setParams()` from the current fight state.

| track | before (steps/bars/notes) | after (steps/bars/notes) | bars 1–2 bytes/hash | bars 3–4 bytes/hash | same seed exact? |
|---|---:|---:|---|---|---|
| office | 32 / 2 / 4 | 64 / 4 / 10 | 258 / `1de588ad09a251b0` | 211 / `707af8edb1967c8d` | yes |
| march | 32 / 2 / 25 | 64 / 4 / 48 | 1351 / `bff10a80e131c4b6` | 1308 / `7468f9869e0c5db3` | yes |
| town | 32 / 2 / 22 | 64 / 4 / 45 | 1133 / `dc00fd956357352d` | 1116 / `a5386c76b6eb2e90` | yes |
| combat | 16 / 1 / 40 | 64 / 4 / 152 | 4410 / `97a068d2ed3c9d00` | 4092 / `f3c0afaa215fac03` | yes |
| report | 32 / 2 / 7 | 64 / 4 / 16 | 521 / `cb703e0f003b6439` | 443 / `2dd4e0cd095dd7e7` | yes |

All five before-sections were byte-identical indefinitely. After the fix, every bars-1–2 hash differs from its bars-3–4 hash, while every same-seed rerender is byte-identical. `test/score.test.js` now enforces both properties and verifies that combat intensity parameters alter scheduled event bytes.

## 3. Control-band collision (OR-2)

`src/layout.js` owns the layout rule: the march/combat control band begins at `y=182`, the bitmap body row is 7 px high, and content is clamped to `y<=175`. Draft art/labels and hand state rows were reflowed so complete names fit above that boundary.

| audited text | before occluded | after bbox | after occluded |
|---|---:|---|---:|
| `Hanged Man` | 30% | `Hanged` 58,167,35×7 + `Man` 58,174,17×7 | **0%** |
| `Emperor` | 29% | 100,167,41×7 | **0%** |
| `score: march (M)` | 31% | 234,175,82×7 (ends exactly at y=182) | **0%** |

The browser probe swept docket, intake, march, combat, draft, camp, deck, shop, route, defeat, and credits: **331 text bboxes, 0 content/control intersections, 0 out-of-bounds bboxes**. This also caught and removed small ownership leaks outside the two reported examples (hand-state rows, SPEED legend, card/shop labels).

## 4. Shop bottom band

The transparent cobble mortar now has a warm base fill, the source tile is filtered into the UI register, and a warm low-saturation wash ties the entire strip together.

| shop band | before | after |
|---|---:|---:|
| mean saturation | 0.000 | **0.118** |
| p95 saturation | — | **0.148** |
| mean luminance | 159 | **44.73** |

The after-band is now near the audited UI reference (mean saturation 0.13 / luminance 41) instead of four times brighter and wholly grey.

## 5. Route-table tile register

Only the route-table terrain draws receive the desaturation/darkening/sepia filter; source assets and bindings remain intact.

| route tiles | before | after |
|---|---:|---:|
| mean saturation | 0.59–0.94 | **0.149** |
| p95 saturation | 1.000 | **0.361** |
| mean luminance | 101–127 | **65.05** |

The terrain remains distinguishable under its labels without competing with the warm-ink UI.

## 6. Cosmetics

- The four active camp jobs now show complete descriptions with no sentence truncation. Their measured widths are Bailiff 208 px, Chirurgeon 238 px, Surveyor 172 px, and Sumpter 212 px inside a 250 px owned row. The two cycle-in jobs were shortened to complete fitting sentences as well.
- Combat floats now start at or below `y=35`; the masthead/subtitle region ends at `y=33`. Before, enemy floats spawned around `y=28` on the subtitle.
- Credits render the separate player-facing `src/credits.js` copy. It retains Willibab / Monsteretrope + CC BY and URL, GuttyKreum, RonnyG, and score attribution, while rendering zero `CLAUDE.md`, `DESIGN-SEED`, asset-manifest, source-path, or hard-rule references. The complete legal inventory still ships inline from unchanged `ATTRIBUTION.md`.
- Dense fixed labels and prose were reflowed for the wider bitmap metrics; the 11-state sweep found no clipped text.

## Scaling and framing

The amended integer-scale rule remains satisfied:

| viewport | integer scale | canvas | fill x/y | letterbox |
|---|---:|---:|---:|---:|
| 1280×800 | 4× | 1280×800 | 100% / 100% | 0,0 |
| 1440×900 | 4× | 1280×800 | 88.89% / 88.89% | centered at 80,50 |

Both axes meet the >=85% rule and all glyphs remain on integer raster cells.

## Verification commands

```text
node --test
/opt/homebrew/opt/python@3.14/bin/python3.14 scripts/fixround-proof.py
node scripts/build.js
```

Final results: **166 tests, 166 pass, 0 fail**; seven verified screenshots; zero page errors in the captures; rebuilt `dist/office-of-the-road.html`.

## For the operator to ratify

- The proof named `title` captures the Orientation Intake, which is the fresh-file opening/title surface; this build has no separate non-interactive title screen. Lean: keep this as the release title proof.
- The four-bar Famicom-consort forms and deterministic ornaments satisfy the score law without new voices. Lean: retain unless a later music-direction pass calls for melodic edits.
- The Pixel Tarot multi-title licence reconfirmation remains the existing gate before a paid release; this round did not alter that gate.
