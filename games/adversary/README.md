# ADVERSARY

A side-scrolling action-RPG gauntlet with a Souls death loop: six stages, left/right
path choices, XP recoverable at a single death marker, gear always kept. Original IP;
code-drawn pixel art on a dark gothic register.

**Play it:** https://lerugray.github.io/field-trials/adversary/

## Run it

`index.html` is the shipped single-file build — open it from `file://` or serve it:

```bash
open index.html
```

Rebuild from source:

```bash
npm run build          # writes dist/index.html
```

Zero runtime dependencies; the built file boots from a double-click.

## Test it

```bash
npm test               # node --test — 300 tests
```

Browser gates (require Playwright):

```bash
npm ci && npx playwright install chromium
node scripts/smoke.mjs
node scripts/gate-ar2.mjs
node scripts/proof-chrome-fx.mjs
```

## What's in here

- `src/` — sim, content, render, boot.
- `test/` — the suite, including headless campaign clears and a campaign-clear restart regression.
- `scripts/` — zero-dependency single-file build, AR2 gates, chrome-fx proofs, OG card renderer.
- `DESIGN-SEED.md` — the founding contract.
- `AUDIT-SKEPTICAL-2026-08-12.md` — adversarial pre-release audit. Verdict: **FIX-FIRST**.
- `RE-EXAM-2026-08-12.md` — narrow re-exam of the five ship-blockers after the first fix round.
  Verdict at that pass: **NOT CLEAR TO RELEASE** (fork legibility + false restart). Both were
  closed in a second fix round and rechecked against the shipped dist.

## Controls

- Arrows / WASD move · K / Space jump · J attack
- Enter menu · Esc options · ↓ rest at waypoint · H dodge

## Credits and asset licensing

Playable art is code-drawn pixel art plus curated licensed pixel-art assets from Ray's
pixel-art library (Willibab collection, CC BY; attribution required in credits; curated
copies only, with a per-asset manifest). No image generation, no ROM extraction.

## A note on references to files that are not here

The design and audit documents in this directory sometimes cite the build-session harness
— the builder's hard-rules file, the running progress log, the dated operator direction
documents, the per-lane reports. Those are working documents of the build method and are
not published in this portfolio repository, so those citations point outside it. The
documents are otherwise verbatim: they are evidence, and editing them to tidy up the
references would make them worth less.
