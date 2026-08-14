# ASSET MANIFEST — THE OFFICE OF THE ROAD

Built at M0, **before any rendering code exists** (DESIGN-SEED art law). Every licensed sheet
we may draw from is inventoried here: pack, path, sheet dimensions, grid/frame where derivable,
licence, and attribution line. Provenance for every sheet a build *touches* is recorded here
and re-stated in `/ATTRIBUTION.md`, which ships with every build.

**Art law (CLAUDE.md #1):** licensed packs ONLY. No generated images, no external downloads,
no code-drawn stand-ins for pack art. A placeholder is a defect. Dimensions below are read
directly from the PNG IHDR headers (`materials/art-packs/**`), not estimated.

**Grid confidence.** Where a sheet's native RPG-Maker layout divides cleanly, the frame grid
is stated as **[confirmed]**. Where the native layout is not cleanly divisible from headers
alone, it is marked **[confirm at integration]** — exact frame slicing is settled when the
first renderer for that surface is written (M1+), which is the correct time to bind it. M0's
job is the inventory; grid-binding rendering code is out of M0 scope.

**Canonical scale.** Packs shipping multiple scales (1×/3×, 200%/300%, Normal/200%/300%) — the
build uses the **native/1× (smallest) tier** and scales up in-engine (nearest-neighbour, to
preserve the pixel grid). The larger pre-scaled tiers are kept as reference, not shipped.

---

## §Tilesets — Willibab / Monsteretrope retro-FF collection (CC BY)

Attribution line: **"Willibab / Monsteretrope"**. Licence: **CC BY** (per each pack's
`Readme.txt`). Retro tiles; native 1× tile edge = **16 px** (256 / 16 = 16 tiles per 256-row);
3× tier = 48 px/tile. Use the 1× tier.

| Pack | Path (under materials/art-packs/) | Sheet(s) | Sheet dims (1× / 3×) | Grid |
|---|---|---|---|---|
| Overworld | `WILLIBAB_OVERWORLD/.../Tileset 1x` + `/Tileset` | 8 sheets (A1/A2/B… volcanic + variants) | 256×256 & 256×192 (1×); 768×768 & 768×576 (3×) | 16×16 & 16×12 tiles @16px **[confirmed on square sheets]** |

**Provenance [M6 inc2 — TOUCHED]:** `Tileset 1x/OW_A2.png` (256×256 @16px, grid **[confirmed]**)
is inlined whole by `scripts/build.js` and tiled 1:1 at native 16px by `src/main.js:tileFill`
(clipped, repeated, nearest-neighbour — no stretch; idiom/pixel gate). The 5 road terrains bind
to solid A2 ground sub-tiles via `TERRAIN_TILE` in `src/art.js`: toll-wood grass `(0,0)`,
chalk-flat `(0,3)`, the-cutting sand `(0,6)`, marker-stones rock `(0,9)`, fen water `(8,0)`.
| Town | `WILLIBAB_TOWN/.../Tileset` (+ `TOWN INTERIORS`) | 9 tileset sheets + 3 interior/example | 256–1536 wide; `TOWNS_ALL` 1536×1632; interiors 320–960 | A/B/C RM tilesets @16px **[confirm at integration]** |

**Provenance [M6 inc4 — TOUCHED]:** `Tileset/TOWNS_ALL_1x.png` (**512×544 @16px, grid
[confirmed]** — both dims divide 16) is inlined whole by `scripts/build.js` and tiled 1:1 by
`src/main.js:tileFillCell`. The quartermaster (a town surface) is floored with the grey
round-cobblestone street tile `(0,18)` via `TOWN_TILE` in `src/art.js` — native 16px, tiled +
clipped, nearest-neighbour. Verified by GATE 5 (idiom) + a colour-blind pass.
| Castle | `WILLIBAB_CASTLE/.../1x/Tileset` (+ `Character`) | 6 tileset + 2 character (`!CHEST`,`!LIGHT`) | 256×256 (tiles), 256×1088 (A5 col); char 192×128 | @16px **[confirmed on square]**; char sheet **[confirm]** |
| Dungeon | `WILLIBAB_DUNGEON/.../1x/tilesets` (+ `characters`) | 17 tileset + 4 character (`!D_CHEST`,`!D_DOORS`,`!D_LIGHT`…) | 256×256 & 256×192; char 192×128 | @16px **[confirmed on square]**; char **[confirm]** |

Character sheets prefixed `!` are RPG-Maker "no-shadow" object/door/chest animation sheets.

## §Tilesets/UI — Willibab's Retro Icons (CC BY)

| Pack | Path | Sheet | Dims | Grid |
|---|---|---|---|---|
| Retro Icons | `Willibab-s-Retro-Icons/.../Iconset.png` | 1 iconset | 512×1408 | 32×32 icons → 16 cols × 44 rows **[confirm at integration]** |

Attribution: **"Willibab / Monsteretrope"**, CC BY. UI/inventory/tooltip iconography source.

**Provenance [M6 inc1 — TOUCHED]:** `Iconset.png` is inlined whole by `scripts/build.js`
(base64) and sliced 1:1 on its native **32×32, 16-col grid [confirmed at integration]** by
`src/main.js:drawIcon` via the `ICON` map in `src/art.js`. Cells in use (col,row, 0-based):
gold `(3,9)`, supplies bag `(14,7)`, mandate scroll `(4,8)`, arm/sword `(2,5)`, guard/shield
`(0,7)`. Rendered nearest-neighbour, no stretching (idiom/pixel gate). More cells bind as
further surfaces adopt icons.

## §Battlers — Simple 8-bit Sideview Battlers (CC BY) — PRIMARY combat art

Licence: **CC BY** — `Readme.txt`: *"Credit Willibab or Monsteretrope somewhere. No reselling.
You can edit."* Attribution: **"Willibab / Monsteretrope"**. This is the seed's named sideview
battle pack (proven in Ashen Liturgy). Two style variants (Style 1 / Style 2); pick one per
build for consistency.

| Sheet class | Path (Style 1 & 2) | Count | Dims | Grid |
|---|---|---|---|---|
| **sv_actors** (sideview battlers) | `.../sv_actors/*.png` | 51 (S1) / 51 (S2) | **1296×864** | **9 cols × 6 rows @ 144×144 [confirmed]** (1296/9=144, 864/6=144) |
| character walk sheets | `.../characters/CHAR_*.png` | 7 (S1) / 7 (S2) | 576×504 | RM MV walk sheet **[confirm at integration]** |
| bonus | `.../Style 1/Bonus` | 2 | 576×504, 144×144 | single-battler @144 + walk sheet |
| weapons (SV) | `.../Weapon_Pack/weapons/*.png` | 76 (S1) / 80 (S2) | 432×96 | weapon-animation strip **[confirm at integration]** |

Battler archetypes present (art frames only — NOT job names): Arcanist, Battlemage, Ghoul,
Hedge Knight, Magus, Mystic, Reaper, Shaman, Skald, Sorceror, Sultan, Templar, Vizier,
Warden, Witch (× BLUE/GREEN/etc. palette variants). The 144×144 confirmed grid makes these the
canonical party + enemy battler source for M2's sideview auto-resolver.

## §Enemies — Retro 8-bit Monster Pack (CC BY)

Licence: **CC BY** — `Readme.txt`: *"Created by Willibab. CC BY … credit must be given."*
Attribution: **"Willibab"**. **Not a fixed-grid sheet** — one PNG per monster, at the monster's
native size (variable, e.g. 53×53, 51×51, up to 89×72 at Normal Size); `_2`/`_3` suffixes are
animation frames of the same creature. Three scale tiers (Normal / 200% / 300%) × two styles ×
244 files each. Use **Normal Size / one style**. `NES_COLOR_PALETTE.png` (54×117) is a
reference swatch, not a game asset. These are per-image sprites — no slicing grid; each file is
drawn whole. Plentiful bestiary for M2+ encounters.

## §Faces — Willi HFP (heroes) & Willi MFP (monsters) (CC BY)

Licence: **CC BY** — both `Readme.txt`: *"credit me and we're good."* Attribution: **"Willibab"**.

| Pack | Path | Sheets | Dims (1×/2×/3×) | Frame |
|---|---|---|---|---|
| Humanoid Faces | `Willi_HFP/.../Humanoid_Faces_{1x,2x,3x}.png` | 3 (scale tiers) | 816×384 / 1632×768 / 2448×1152 | 15 faces, per-readme sizes 36/108/144 px **[confirm at integration]** |
| Monster Faces | `Willi_MFP/.../Monster_Faces_{1x,2x,3x}.png` | 3 (scale tiers) | 864×384 / 1728×768 | 15 faces, 36/108/144 px **[confirm]** |

Face/portrait source for NPC and party dockets (dialogue, camp, report surfaces).

## §NPCs — NPC Pack: Human Empires (CC BY, Willibab)

Attribution: **"Willibab / Monsteretrope"**, CC BY (Willibab retro-FF collection). Path:
`NPC-Pack---Human-Empires/NPC Pack - Human Empires/`. 47 NPC sheets × 2 styles × 2 scales
(1× ≈ 192×160; 3× RPGMakerMVMZ 576×512). RPG-Maker MV/MZ character (walk) sheets;
`CIV_*`, plus civic/empire types. Frame grid **[confirm at integration]** (mixed 192×160 /
192×128 / 192×170 in Style 1). Town-population + mandate-giver NPC source (M4).

## §Weapons — Weapon Pack (CC BY, Willibab)

Attribution: **"Willibab"**, CC BY. Path: `Weapon_Pack/Weapon_Pack/weapons/*.png` — 76 weapon
strips at **432×96** (AXE/SWORD/etc.). Weapon-animation sheets (RM MV/MZ; a plugin drives them
in RM — we slice directly). Grid **[confirm at integration]**. Note: the same weapon strips
also ship inside the Sideview Battlers pack (§Battlers) — prefer that copy for battle-scene
consistency; this standalone pack is the superset reference.

## §Tarot — FULL Pixel Tarot Deck (itch.io purchase — GuttyKreum) — the DECK

Path: `Pixel-Tarot/`. Licence: **itch.io commercial purchase by Ray Weiss; commercial use
confirmed by the seller (cleared 2026-06-10)**. The pack ships no license/credits file of its
own beyond the vendored `TAROT-LICENSE.txt` note; the seller's itch.io page is the source of
record. Attribution: **"Pixel Tarot — GuttyKreum (itch.io)"**.

- **23 PNGs, all 57×79 px, used unmodified**: the 22 major-arcana card faces + `back_of_card.png`.
  Faces: the_fool, magician, priestess, empress, emperor, hierophant, the_lovers, chariot,
  strength, the_hermit, wheel_of_fortune, justice, hanged_man, death, temperance, the_devil,
  the_tower, the_star, the_moon, the_sun, judgement, the_world.
- Individual card images (not a grid sheet) — each drawn whole. This is the M3 tarot layer's art.
- **Provenance caveat:** `TAROT-LICENSE.txt` was vendored from a prior project and its
  "Used by:" lines reference that project's file paths (`data/events.json`,
  `scripts/events/tarot_deck.gd`) — those are NOT this repo. Our tarot wiring is authored
  fresh at M3. The *licence* and *file inventory* in that note are the parts that carry over.
- **PAID-release caveat (DESIGN-SEED art law):** confirm multi-title licence scope with the
  seller before any *paid* release. Fine for the free build as-is.

## §Character composition — My Character Creator Pack (Willibab art + RonnyG tool) — ⚠ RESTRICTED LICENCE

Path: `My_Character_Creator_Pack/`. **This pack's terms are NOT CC BY and are more restrictive
than every other pack here.** Per `readme.txt`:

- ✅ May use in personal & commercial projects; may edit/combine parts for our own work; may use
  **exported/combined** character sheets in the game.
- ❌ **May NOT resell, redistribute, repost, or share the original files** (modified or not);
  may NOT use the files to make an asset pack / character generator.
- Credit: appreciated, not required. Assets: **Willibab**. Creator tool: **RonnyG**.

Sheet facts: 648×432 sheets, **9×6 grid @ 72×72 [confirmed, per readme]**; parts across
body/outfit/hair/hat/accessory/bonus1-4 (≈290 part PNGs) + 15 example heroes.

**Builder ruling (flag for operator):** because a single-file web build *inlines* its art, and
this pack forbids redistributing the original part files, using raw creator *parts* in a
shipped build risks redistributing them. **Safe path:** if used at all, use only **flattened,
exported composite** character sheets (permitted), never the raw part library, and record the
export in provenance. **Default lean: do NOT depend on this pack** — the CC-BY Sideview
Battlers (§Battlers) and NPC pack (§NPCs) cover the party/NPC need cleanly. Recorded here for
completeness; **left out of the build unless the operator opts in.**

---

## Licence summary

| Licence | Packs | Ships in build | Attribution required |
|---|---|---|---|
| **CC BY** | Willibab Overworld/Town/Castle/Dungeon, Retro Icons, Sideview Battlers, Monster Pack, HFP/MFP Faces, NPC Human Empires, Weapon Pack | Yes | Yes — every build (`/ATTRIBUTION.md`) |
| **itch commercial purchase** | Pixel Tarot (GuttyKreum) | Yes (free build; reconfirm scope before paid) | Yes — credit GuttyKreum |
| **Restricted (no redistribution of originals)** | My Character Creator Pack (Willibab/RonnyG) | **No** (composites-only if opted in) | Credit appreciated |

## Attribution lines (canonical — copied verbatim into /ATTRIBUTION.md)

- **Willibab / Monsteretrope** — tilesets (overworld, town, castle, dungeon), retro icons,
  sideview battlers, NPC pack, faces (HFP/MFP), monster pack, weapon pack. Licence: CC BY.
- **GuttyKreum** — FULL Pixel Tarot Deck (itch.io). Licence: commercial purchase, use confirmed.
- **RonnyG** — HTML character-creator tool (My Character Creator Pack). *(Tool credit; pack
  not shipped by default — see §Character composition.)*

## Provenance log (sheets a build TOUCHES — updated as rendering code lands)

Every sheet the build actually draws is listed here: pack, sheet, first-touched milestone,
how used, any edit.

| First touched | Pack / licence | Sheet | Used as | Edit |
|---|---|---|---|---|
| **M2** (inc3) | Sideview Battlers — Willibab/Monsteretrope, CC BY | `Style 1/sv_actors/HEDGE_KNIGHT_BROWN.png` | Bailiff battler | none — frame (0,0) 144×144 sliced at runtime, drawn unmodified |
| **M2** (inc3) | " | `Style 1/sv_actors/MYSTIC_GREEN.png` | Chirurgeon battler | none — frame (0,0) sliced |
| **M2** (inc3) | " | `Style 1/sv_actors/WARDEN_GREEN.png` | Surveyor battler | none — frame (0,0) sliced |
| **M2** (inc3) | " | `Style 1/sv_actors/SHAMAN_BROWN.png` | Almoner battler | none — frame (0,0) sliced |
| **M2** (inc3) | " | `Style 1/sv_actors/ARCANIST_BLUE.png` | Notary battler | none — frame (0,0) sliced |
| **M2** (inc3) | " | `Style 1/sv_actors/TEMPLAR_BLUE.png` | Sumpter battler | none — frame (0,0) sliced |
| **M2** (inc3) | " | `Style 1/sv_actors/GHOUL_GREEN.png` | road foe battler | none — sliced, drawn h-flipped |
| **M2** (inc3) | " | `Style 1/sv_actors/REAPER_DARK.png` | road foe battler | none — sliced, drawn h-flipped |
| **M2** (inc3) | " | `Style 1/sv_actors/SORCEROR_RED.png` | road foe battler | none — sliced, drawn h-flipped |

Mapping lives in `src/art.js`; `scripts/build.js` base64-inlines these nine sheets into the
single-file build (art law: licensed packs only, boots from file:// with zero fetches). Full
battle animation (walk/attack motion frames) and tileset/town/tarot art wire in later
milestones (M3 tarot, M6 full art pass).
