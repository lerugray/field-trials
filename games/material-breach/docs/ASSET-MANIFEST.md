# ASSET MANIFEST — MATERIAL BREACH

**M0 deliverable: the plan of record for borrowed art.** No assets are copied in yet — M0 has no
rendering surface. This manifest fixes *which* packs serve *what*, the licence posture, and the
copy-in discipline, so that when the art milestones (M7a/M7b) draw on a pack, the row already
exists and the attribution ships with it.

**Two hard laws frame everything here (DESIGN-SEED §4.4, hard rule 1):**

1. **The facility is code-drawn.** The architectural cutaway, room boundaries, load paths, claimed
   territory, damage annotations and works-order overlays are original code-drawn art under the
   VACUUM SEALED technique stack (§4.5). No pack supplies the facility. No pack row below covers it.
2. **LLM-image-generated art is banned outright**, in any quantity, for any purpose. It would close
   the paid door for no gain. This manifest contains licensed-pack art and nothing generated.

**The cast is licensed pack art**: the staff you employ and the raiders who come for you.

---

## 1. Copy-in discipline (the rule every future row obeys)

- **Copy assets into this repo**, under `assets/` (created when the first asset lands, M7a). Never
  reference a pack across repositories at build time. The single-file build must inline everything;
  a `file://` double-click fetches nothing (DESIGN-SEED §5).
- **Every borrowed asset gets a row in `ATTRIBUTION.md`** before it is used, and `ATTRIBUTION.md`
  ships inside the built artifact (collection contract v0, item 9).
- **CC BY packs make attribution mandatory, not courtesy.** Willibab packs carry CC BY.
- **Provenance is recorded per asset**: source path, pack name, licence, whether attribution is
  required, and what it is used for.
- A placeholder that survives its own milestone is a BLOCKER (DESIGN-SEED §4.4). Placeholder art is
  a defect, not a stage.

Sources of record (on Ray's machine, copied in, never cross-referenced):
`~/Desktop/Dev Work/pixel-art-library/extracted/` and `~/Desktop/Dev Work/asset-library/`.

---

## 2. Planned pack roles (candidates confirmed on hand, DESIGN-SEED §4.4)

Nothing here is copied in yet. These are the intended assignments; the actual selection is made at
the art milestone and each drawn asset gets an `ATTRIBUTION.md` row at that time.

### Staff (the cast you employ)

| Role | Candidate pack(s) | Notes |
|---|---|---|
| Drudge (worker caste) | `Enemy_Galore_*`, `Dark-Fantasy-Enemies` | the non-combat logistics caste; read as labour, not menace |
| Clerk / Artificer / Warden | `Mythic-Monsters-I` / `II`, `Dark-Fantasy-Enemies` | archetype silhouettes distinct enough to differentiate posts |

### Raiders (the incident that comes for you)

| Role | Candidate pack(s) | Notes |
|---|---|---|
| Raiding parties (heroes) | `NPC-Pack---Human-Empires`, `Fallen-Knight`, `My_Character_Creator_Pack` | must read as human authority, not monsters |
| The escalation officers | `NPC-Pack---Human-Empires` | Surveyor / Auditor / Inspector: bureaucrats, not fighters |

### Interface and type

| Role | Candidate pack(s) | Licence flag |
|---|---|---|
| UI icons | `Willibab-s-Retro-Icons`, Kenney All-in-1 v3.6.0 | **Willibab = CC BY, attribution mandatory** |
| Ledger typography | `Not Jam Font Pack` | check licence at copy-in |

---

## 3. Audio

**Code-composed WebAudio via the House Band kit (M7b). No audio files of any kind.** There is no
audio asset row and there never will be. Composition is credited to **Abel Aeolian** per the
standing credit convention. This manifest covers art; audio provenance lives in `ATTRIBUTION.md`.

---

## 4. Current state — M7a, assets copied in

**Assets copied in: 8 sheets, all from NPC Pack — Human Empires (Willibab / Monsteretrope,
CC BY 4.0).** They live unmodified at `assets/cast/source/`. `ATTRIBUTION.md` carries a row per
sheet and ships inside the built artifact. No placeholder cast survives: every figure on screen is
licensed pack art.

| Role | Sheet | Char | Reads as |
|---|---|---|---|
| drudge | `CIV_9_1.png` | 3 | bare-headed labourer in a plain smock |
| clerk | `CIV_12_1.png` | 1 | wide-brimmed hat and long coat, a functionary |
| artificer | `CIV_7_1.png` | 1 | flat cap and apron, workshop hands |
| warden | `MIL_1_1.png` | 0 | helmeted, in-house, posted to Holding |
| raider | `MIL_3_1.png` | 0 | helmeted, spear at the carry |
| raider (2nd) | `MIL_2_1.png` | 0 | helmeted, second party member |
| officer (cowled) | `MAG_1_1.png` | 5 | cowled robe, no visible rank |
| officer (inspector) | `CIV_6_1.png` | 1 | cap and coat |

### 4.1 SUBSTITUTION, recorded: the staff cast is human, not monstrous

§2 above planned the STAFF from the monster packs (`Enemy_Galore_*`, `Dark-Fantasy-Enemies`,
`Mythic-Monsters-I`/`II`). Those packs are present on the machine and were measured. They are not
usable here, for a reason that is structural rather than aesthetic:

- The cutaway's cell is **14 px** (a 24x16 grid inside a 356x304 panel, `layout.js`).
- `Enemy_Galore_*` frames are **64x64**; `Mythic-Monsters-I`/`II` are **64x64** at 1x, larger in
  every other export; `Dark-Fantasy-Enemies` (free tier) contains one creature, a bat.
- Fitting any of those to a 14 px cell means **downscaling pixel art**, which destroys it and
  directly violates §4.5 item 1 (draw at native pixel scale, never resample).

`NPC Pack — Human Empires` at 1x is **16x20**, which stands on a 14 px cell correctly with the
slight overhang a scale figure has in a real section drawing. So the whole cast comes from one
pack, at one scale, in one idiom, under one licence and one attribution row.

**The consequence is a register change and it is Ray's call, flagged in PROGRESS.md.** The staff
now read as institutional personnel rather than as monsters: drudges, clerks, artificers and
wardens who look like people employed by a building. The raiders stay armoured humans, so the
contrast that carries the joke is no longer monster-versus-human but **drab-versus-armed**: the
facility's own people are drawn from its materials and its ramps, and the raiders arrive lit
differently, from outside the palette of the building. If Ray wants monstrous staff, the honest
routes are a larger cutaway cell (a layout change) or a 16 px monster pack (an acquisition); both
are real work and neither is a rendering tweak.

**r2 note on the cell size:** the cutaway cell is no longer fixed at 14 px. The camera frames the
built facility, so the cell now sits between 14 px and 26 px depending on how much has been carved.
That makes the 16x20 cast art fit MORE comfortably, not less, and does not reopen the monster-pack
question: those packs are 64 px native and would still need downscaling at any cell size this
buffer can hold.

### 4.2 Type, copied in at r2

**Two faces from the Not Jam Font Pack (CC0 1.0), copied to `assets/fonts/` with the pack's own
`Licence.txt`, both embedded in the build as base64 `@font-face` rules:**

| Face | File | Used for |
|---|---|---|
| Not Jam Slab Serif 11 | `NotJamSlabSerif11.ttf` | display: panel titles, section headings, title block |
| Not Jam Serif 11 | `NotJamSerif11.ttf` | body: every ledger row, figure, notice and annotation |

The pick is argued in `src/type.js` and in `ATTRIBUTION.md`: the sheet is a pre-printed
institutional form, so the type is a pair, a letterpress slab for what was printed and a book serif
for what was entered onto it. Both are cut at 11 px and nothing is drawn off their design size.

Faces considered and rejected, for the record: the pack's four monospaces are all full-width (one
em per glyph), which gives only 34 columns in the ledger and cannot carry the report's prose;
`Mono Old Peculiar` additionally renders R nearly identically to B at 11 px, which the LEGIBILITY
LAW does not allow in a document. `Old Style 11` was the closest runner-up and lost on its
old-style figures, which are handsome and wrong for a game whose instruments must never be misread.

### 4.3 Not yet drawn on

`Willibab-s-Retro-Icons` (UI icons, CC BY, verified readme) remains a candidate for M7b. It is not
copied in, so it has no attribution row and nothing stands in for it: every mark the renderer draws
is code-drawn.
