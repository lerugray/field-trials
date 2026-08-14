# LANE REPORT — Release collateral

**Lane:** release-collateral (no game-logic changes, no commits, no pushes).  
**Game status:** release-frozen pending a new public gate.  
**Goal:** make promotional collateral ready from the game's own shipped assets.

## What was delivered

| Deliverable | Location | Notes |
|---|---|---|
| 1200×630 OG card generator | `scripts/make-og.mjs` | Draws from OOR's shipped assets + palette + pixel font. |
| Generated OG card | `og.png` | 1200×630 PNG. |
| OG dimension test | `test/make-og.test.js` | Skip-if-no-playwright convention; asserts 1200×630. |
| Gameplay FIG capture tool | `scripts/capture-collateral.mjs` | Playwright-based, same deep-link params as `scripts/proof.mjs`. |
| FIG candidates | `proof/release-collateral-20260812/` | 3× 1280×800 frames: camp, route, combat. |
| Release draft roster | `docs/release-collateral-DRAFT.md` | Provisional name flagged for Ray's veto. |

## Shipped assets drawn into the OG card

The card uses only files that `scripts/build.js` inlines into the single-file build:

- **Willibab / Monsteretrope "Simple 8-bit Sideview Battlers" (CC BY)**
  - `materials/art-packs/.../sv_actors/HEDGE_KNIGHT_BROWN.png` → Bailiff party battler.
  - `materials/art-packs/.../sv_actors/MYSTIC_GREEN.png` → Chirurgeon party battler.
  - `materials/art-packs/.../sv_actors/GHOUL_GREEN.png` → road foe battler (mirrored to face the party).
- **GuttyKreum FULL Pixel Tarot Deck (commercial licence)**
  - `materials/art-packs/Pixel-Tarot/the_fool.png` → the deck instrument played by the desk.
- **Willibab / Monsteretrope Retro Icons (CC BY)**
  - `materials/art-packs/.../Iconset.png` → gold orb (cell 3,9) and provision bag (cell 14,7).
- **OOR's own register chrome**
  - `src/palette.js` — ink / paper / panel / edge / rule / dim / stamp colours.
  - `src/pixel-font.js` — 5×7 code-drawn proportional face used in-game.

No generated images, no borrowed art-law language, and no superseded or parallel sprite modules were used.

## FIG candidates captured

All three frames are deterministic real-play shots of the single-file build (`dist/office-of-the-road.html`) loaded with deep-link params:

- `camp-20260812-082744.png` — seed `20260812`, `camp=1&paused=1`.
- `route-20260812-082751.png` — seed `20260812`, `route=1&paused=1`.
- `combat-20260812-082758.png` — seed `20260812`, `ticks=40&paused=1`.

## Verification

- `npm test` passes: **174 tests, 0 failures**.
- `test/make-og.test.js` runs when Playwright is present; otherwise skips cleanly.
- No source modules under `src/` were changed; gates and logic are untouched.

## Local tooling note

Playwright was installed locally (`npm install --no-save playwright` + `npx playwright install chromium`) only to render the OG card and FIG frames. It did not modify `package.json` or `package-lock.json`, and `node_modules/` is gitignored.
