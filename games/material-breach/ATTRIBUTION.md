# ATTRIBUTION — MATERIAL BREACH

**This file ships inside the built artifact**, not only in the repo (collection contract v0, item 9).
Every borrowed asset has a row here before it is used.

## Credit line (the short form, for a credits screen or a store page)

> Cast pixel art by **Willibab / Monsteretrope**, used under **CC BY 4.0**, recoloured.
> Type from the **Not Jam Font Pack** by **Not Jam**, CC0 1.0.

## Art

**Facility:** code-drawn (original work, no third-party source). The architectural cutaway, its
lighting, grain, dither and every ramp in the palette are original to this project.

**Cast:** licensed pixel-pack art, copied into `assets/cast/source/` unmodified and adapted for
rendering as described below.

| Asset | Source pack | Creator | Licence | Attribution required | Used for |
|---|---|---|---|---|---|
| `assets/cast/source/CIV_9_1.png` (char 3) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | the drudge: the worker caste, at the excavation face |
| `assets/cast/source/CIV_12_1.png` (char 1) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | the clerk: Records |
| `assets/cast/source/CIV_7_1.png` (char 1) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | the artificer: Fabrication |
| `assets/cast/source/MIL_1_1.png` (char 0) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | the warden: Holding |
| `assets/cast/source/MIL_3_1.png` (char 0) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | a raiding party member |
| `assets/cast/source/MIL_2_1.png` (char 0) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | a raiding party member |
| `assets/cast/source/MAG_1_1.png` (char 5) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | an escalation officer, cowled |
| `assets/cast/source/CIV_6_1.png` (char 1) | NPC Pack — Human Empires | Willibab / Monsteretrope | CC BY 4.0 | **Yes** | an escalation officer, the inspector |

**Licence note.** The NPC Pack ships no readme of its own. It arrived in the Willibab /
Monsteretrope collection, whose licence is CC BY, verified in the readmes of sibling packs from the
same purchase (`WILLIBAB_OVERWORLD` and `Retro_8bit_Monster_Pack`, both: *"Created by Willibab /
Monsteretrope. License: CC BY"*). Credit is given here regardless of which reading applies, which
satisfies CC BY and costs nothing if the terms turn out to be looser.

**Adaptation.** CC BY permits remixing and adapting. Each figure is quantised at copy-in into
per-pixel ramp-step offsets (`scripts/prepare-cast.mjs` produces `src/cast-data.js`) so that it
selects its colours from this game's curated palette at the light level of the tile it stands on.
The originals are preserved unmodified in `assets/cast/source/` as the provenance record.

## Type

Two faces from the **Not Jam Font Pack** (Not Jam), **CC0 1.0**. Both are embedded in the built
artifact as base64 `@font-face` rules, because `dist/index.html` boots from a `file://`
double-click with no server and no network. The pack's own `Licence.txt` is copied to
`assets/fonts/LICENCE-NotJamFontPack-CC0.txt` **and its full text is appended to this file inside
the build**, so the licence travels with the artifact.

| Asset | Family | Creator | Licence | Attribution required | Used for |
|---|---|---|---|---|---|
| `assets/fonts/NotJamSlabSerif11.ttf` | Not Jam Slab Serif 11 | Not Jam | CC0 1.0 | No (given anyway) | display: panel titles, section headings, the drawing's title block |
| `assets/fonts/NotJamSerif11.ttf` | Not Jam Serif 11 | Not Jam | CC0 1.0 | No (given anyway) | body: every ledger row, every figure, every notice, every annotation |

**Why these two.** MATERIAL BREACH is a game made of documents, and the document is a pre-printed
institutional form: the slab is the part printed at the stationer's before anything happened, and
the serif is everything entered onto the form afterwards. Both are cut at 11px and nothing is drawn
off their design size, so every glyph lands on whole pixels at every integer window scale.

CC0 waives the attribution requirement. The rows are here anyway, because a build that ships a
creator's work without naming them is worse than a build that names them unnecessarily.

## Music and audio

Code-composed WebAudio via the House Band kit. **No audio files of any kind.** Built at M7b.

**Score and sound effects: Abel Aeolian**, per the standing credit convention for Claude-composed
music. Two tracks (the lobby bed and the closing cue) and five effects, all synthesised at runtime
from oscillators and a seeded noise buffer. Nothing is sampled, streamed, fetched or bundled as
audio data; the score is source code, and `dist/index.html` carries no audio asset of any kind.

**The band kit** (`src/band.js`, `src/prng.js`) is ported from Ray's own `house-band` repository,
the canonical register-neutral kit shared across the fleet. First-party, so no third-party licence
attaches. The port removed the kit's `setInterval` scheduler driver, so this game's pacing law
binds the audio layer with no exemption; nothing else in it was altered.

Provenance consequence: the music is code-generated, and therefore **paid-eligible** under
`art-provenance-gates-commercial-release`. No generative-audio service was used at any point.

## Banned

**LLM-image-generated art, in any quantity, for any purpose.** No asset in this project was
generated by an image model. The facility is code-drawn; the cast is licensed pack art.
