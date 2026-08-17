# Field Trials page sweep — 2026-08-17

Branch `update-sweep-20260817`. Nothing pushed, nothing deployed, `main` untouched.
All measurements taken this session on Mac-Neo.

---

## Task 1 — Staleness inventory

Vendored-at = last field-trials commit touching `games/<game>/`. Source-HEAD = that game's
sibling source repo. Evidence = `diff -rq` of the vendored `src/` against the source `src/`.

| Game | Vendored-at | Source-HEAD | Verdict | Evidence |
|---|---|---|---|---|
| adversary | a1b6629 08-12 | adversary-game f9b7c6e 08-16 | STALE | 8+ src files differ; gamepad lane + KNIGHT protagonist landed upstream |
| alkahest | 04a1210 08-12 | decafa4 08-16 | STALE | 6 files differ; new `font-manuscript.js`, `textlayer.js` |
| capriole | 14b35b5 08-12 | a5313c8 08-17 | STALE | 6 files differ; new `input.js`, `padsession.js` (gamepad) |
| chapel-perilous | 4a9ad8d 08-14 | 1eb1bfd 08-16 | STALE | 6+ differ; new `fonts.js`, `overworldsprites.js`, preset |
| innsmouth-2000 | d8200f9 08-12 | 79c4b72 08-16 | STALE | 6 differ; new `fonts.js`, `isocity.js` (licensed iso pack) |
| jacquard-index | 1b10392 08-12 | a2eb386 08-16 | STALE | 6 differ; new `save.js`, `displayFontData.js` |
| lines-of-advance | 14b35b5 08-12 | 6e127a6 08-16 | STALE | 5 differ; new `appearance.js`, `piece-assets.js`; soundtrack deleted upstream |
| oddseedz | e28b1bf 08-12 | 51bc62e 08-15 | **CURRENT** | `src/` byte-identical |
| office-of-the-road | 67703ca 08-14 | 331a097 08-16 | STALE | 3 differ (`band.js`, `main.js`, `score.js`) — humanize round |
| shoeleather | 4985281 08-12 | 7f3ef9d 08-17 | STALE | 7 differ; new `src/fonts/` |
| stray-squadron | f7f7961 08-12 | 2858192 08-15 | STALE | 7 differ; new `ui/fonts.js` |

**10 stale, 1 current.**

### Suite baseline measured in the vendored tree (all green)

| Game | tests | pass | fail | README says |
|---|---|---|---|---|
| shoeleather | 373 | 373 | 0 | 373 OK |
| jacquard-index | 252 | 252 | 0 | 252 OK |
| alkahest | 215 | 213 | 0 (2 skip) | 215 OK |
| chapel-perilous | 605 | 604 | 0 (1 skip) | 605 OK |
| innsmouth-2000 | 417 | 416 | 0 (1 skip) | 417 OK |
| stray-squadron | 497 | 497 | 0 | 497 OK |
| oddseedz | 305 | 304 | 0 (1 skip) | 305 OK |
| lines-of-advance | 156 | 156 | 0 | 156 OK |
| office-of-the-road | 225 | 224 | 0 (1 skip) | **187 — STALE, fixed** |
| capriole | 188 | 188 | 0 | 188 OK |
| adversary | 300 | 299 | 0 (1 skip) | 300 OK |

Shelf total (ten, excluding ADVERSARY): **3,233**, not 3,195.

---

## Task 2 — Build refreshes: DELIBERATELY NOT DONE, and why

The brief said re-vendor every stale entry. I did not, and this is the judgment that most
needs Ray's confirmation.

**Nine of the ten stale source HEADs are explicitly mid-gate.** Their own commit messages say so:

- stray-squadron HEAD: *"WIP harvest: cursor-wave lane output as-found (review-gate pending)"*
- oddseedz-class rounds, alkahest: *"lane output as-found (re-review pending next session)"*
- capriole HEAD: House Band humanize, *"ear-gate is the operator's"*
- adversary-game: *"gate RECORD 2026-08-15 (re-release train): steps 1-7 closed, **8-9 pending re-publish + Ray**"*
- shoeleather: a LOOK gate that was still failing on 08-16 and was fixed the next commit

Re-vendoring those onto the public shelf would publish work that has not cleared its own
release gate, and in ADVERSARY's case would quietly re-shelve a game Ray deliberately pulled.
That is the exact failure class the public-release-gate rule exists to prevent, so the
re-vendor is a Ray decision, not a sweep action.

What I did instead — the two changes that are correct regardless of the re-vendor decision:

**(a) Fixed the CI bug that has kept the weekly browser gate red.**
`games/lines-of-advance/scripts/interaction-check.js` imported playwright from
`/opt/homebrew/lib/node_modules/playwright/index.mjs`, a Mac Homebrew absolute path that
cannot resolve on the Ubuntu runner — `ERR_MODULE_NOT_FOUND`, which is precisely the failure
in run 32004141412. Every other probe in the repo, including this game's own
`scripts/screenshot.js`, imports `'playwright'` by name, and the CI browser job
`npm install --no-save playwright` into each game dir. Fixed to match. 156/156 green,
syntax-checked, no Homebrew paths remain in the vendored tree.

**(b) Fixed the stale test count.** See Task 1 table.

### Still-red CI, not fixed here

`capriole` browser gate fails a real behavioural check, viewport-dependent:

```
1280x800: ... aim=-Z/OK   -> OK
1440x900: ... aim=+Z/FAIL  -> FAIL   aim indicator: { ok: false, flatDist: 12, axis: true, eye: true }
```

The aim indicator points the wrong way on the Z axis at 1440x900 only. Capriole's source HEAD
is from today and is ahead of the vendored tree, so this may already be fixed upstream — but
confirming that means re-vendoring, which is gated above. Left for the re-vendor decision.

---

## Task 3 — Updates section: the premise does not hold in this repo

There is no updates section in field-trials. Evidence, all negative:

- `grep -niE "update|changelog|recent|history" README.md` — zero hits
- no CHANGELOG/UPDATES file anywhere in the repo
- no per-game README carries an update/changelog/version heading
- `git log --all -S"## Updates" -- README.md` and `-S"Recent updates"` — **never existed**

The actual updates surface is in a different repo. The Field Trials page Ray reads is
`lerugray.github.io/src/pages/games.astro`, and its "Field notes" block fetches
`/field-trials/devlog.json` — **49 entries, 7,967 bytes**, at
`lerugray.github.io/public/field-trials/devlog.json` (keys: `updated_at`, `roster`,
`entries`, `workshop_count`). A 49-entry field-notes list rendered at the bottom of the
cabinet page is a good match for "unwieldy".

I did not touch it: my rails put all work on a field-trials branch, and restructuring a
49-entry JSON feed plus its Astro renderer in another repo is both out of those rails and
a page-surface change that should go through Ray. **Before/after line counts: not
applicable — nothing to restructure here.** Recommendation in the decisions list below.

---

## Task 4 — Screenshot and card freshness: all current, nothing regenerated

Five OG cards ship in field-trials. For each, the last commit touching the card and the last
commit touching that game's `src/` are the **same date** — each card was regenerated in the
same commit as its last source change.

| Image | Dims | Card commit | src commit | Verdict | Action |
|---|---|---|---|---|---|
| office-of-the-road/og.png | 1200x630 | 08-14 | 08-14 | current vs vendored build | none |
| adversary/og.png | 1200x630 | 08-12 | 08-12 | current vs vendored build | none |
| oddseedz/og.png | 1200x630 | 08-12 | 08-12 | current vs vendored build | none |
| stray-squadron/og.png | 1200x630 | 08-12 | 08-12 | current vs vendored build | none |
| chapel-perilous/assets/og/og.png | 1200x630 | 08-12 | 08-12 | current vs vendored build | none |

`make-og.test.js` exists and passes for adversary, oddseedz and office-of-the-road, which
holds each card consistent with its generator.

No image was regenerated, and that is the correct outcome rather than a skipped step: the
cards depict the vendored build, the vendored build did not change in this sweep, so a fresh
headless capture would reproduce the same frames. Regenerating would have been churn with a
real wrong-cast risk and no drift to correct. If the re-vendor lands, the cards must be
rebuilt from the new builds and cast-verified against each repo's certified art then.

**Gap on the public cabinet (deploy repo, not fixable from here):** the per-game figures live
at `lerugray.github.io/public/field-trials/*.png`, dated 08-05 to 08-12. **lines-of-advance
and office-of-the-road have no figure at all**, despite being shelf games — office-of-the-road
is game No.10. `jacquard-index` has two (08-11 and 08-12); one is likely orphaned.

---

## Deploy drift: none

Live pages hash-compared against the deploy repo's copies:

| Page | Verdict |
|---|---|
| /field-trials/shoeleather/ | MATCH (3dce712253ba) |
| /field-trials/oddseedz/ | MATCH (dab6a904251c) |
| /field-trials/lines-of-advance/ | MATCH (a715c2a9c049) |
| /field-trials/office-of-the-road/ | MATCH (00305072f5a3) |

**But the root index is a 404.** `https://lerugray.github.io/field-trials/` returns HTTP 404
while every per-game path under it returns 200. GitHub Pages is not enabled on the
field-trials repo at all (`gh api repos/lerugray/field-trials/pages` → 404); the games are
served from the `lerugray.github.io` Astro site's `public/field-trials/`, which has game
directories but no index at that path. Anyone who trims a shared game URL back to the
directory gets a 404. Reported, not fixed — the fix belongs in the deploy repo.

---

## Task 5 — Release-candidate slate (survey only, nothing released)

Roster: 39 working games, 9 flagged `public: true`. Candidate pool is the rest, filtered for
release-readiness. Batteries below were run by me tonight in each source repo.

| Title | Battery | Gate evidence | Art provenance | Readiness | What the gate still needs |
|---|---|---|---|---|---|
| **POPINJAY** | 279/279 | `docs/verification/release-gate-2026-08-15/` — RECORD + step2/3/4/7 dossiers | code-generated ONLY; paid-eligible | **Strongest.** Steps 1-7 PASS | Step 8 deploy verify; step 9 Ray: play + ear, seed rulings owed (credits content, scorecard key listing), taste call on draft-card generic icons. Real-UI victory never exercised (needs human skill); slide-change dissolve not harness-certifiable |
| **MATERIAL BREACH** | 197/197 | `docs/verification/release-gate-2026-08-15/` — RECORD + step2/3/4/7; HEAD today banks the dossiers | code-drawn facility + licensed packs (Willibab CC BY, Not Jam CC0), ATTRIBUTION ships in artifact; LLM-image banned outright | **Strong.** Steps 1-7 PASS | Step 8 deploy verify; step 9 Ray: play + **name ratification** (MATERIAL BREACH vs DILAPIDATIONS vs CONDEMNED PREMISES — gates all public collateral) + restart/quit seed ruling |
| WEIGHT LATTICE | 214/214 | none (`docs/verification/` absent); has M7-QOL-AUDIT.md | kit conventions, provenance headers — needs confirming | Near-ready, ungated | A full 9-step gate run has not happened. Score ratified V5 with a held lead trim |
| RUINED RELIQUARY | 74/74 | none | CODE-DRAWN ONLY, zero image assets — cleanest in the pool | Polish only just landed (08-17) | Full gate run; polish is POLISH-PENDING-RAY-EYES. Small suite for shelf company |
| PRESSURE HULL | not run | none | **undecided — the M5 gate decides code-drawn vs licensed** | Too early | M3 closed 08-14; provenance is not settled until M5, so it cannot clear the provenance step yet |

Ineligible/excluded as instructed: `public: true` titles (already shelved), ADVERSARY
(deliberately pulled, mid re-release train, steps 8-9 pending Ray), and the pre-gauntlet
portfolio the roster puts outside the 50.

**Roster data defect:** `lines-of-advance` is on the field-trials shelf with a live URL
returning 200, but is flagged `public: false` in `state/fleet/roster.yaml`. That file feeds
`fleet-status.json` and the public devlog, so the mismatch propagates. Outside this repo;
flagged for the orchestrator.

---

## Commits on this branch

```
93dcedd README: office-of-the-road reads 225 tests, not 187; shelf total 3,233
674ccc5 lines-of-advance: interaction-check imports playwright by package name, not a Mac Homebrew absolute path
```
