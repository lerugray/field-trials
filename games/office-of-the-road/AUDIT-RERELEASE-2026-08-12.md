# OOR — SKEPTICAL PRE-RELEASE RE-AUDIT, 2026-08-12

Re-audit after fix round 1, fix round 2, and the GATE 7 text-readability lane. Headless throughout
(Playwright Chromium, `file://`, real dispatched input). Artifact audited:
`dist/office-of-the-road.html`.

**Freshness confirmed:** `node scripts/build.js` at HEAD (`1d6ce37`) reproduces the committed dist
**byte-for-byte** (sha256 `ce7d8235…f868` before and after). The shipped file is current, and every
finding below is measured on it, not on source.

---

## VERDICT: FIX-FIRST

The four original audit findings I could re-verify **are genuinely fixed** — text is now two-colour
crisp, the score varies, the shop/route tints match the palette, the credits no longer leak build
paths, and the y=178/182 draft collision is gone. The machine is in good order: 171/171 tests, all
gates green, zero console errors, zero external network, integer scaling, rule 9 satisfied.

But the game **cannot go to Field Trials in this state**, for one reason that has nothing to do with
the old findings: *the fix rounds moved text around, and in five places the new positions collide.*
The worst is on the combat screen — the screen a player looks at most — where the resolver line is
painted straight through the party roster and neither is readable. GATE 7 passed all of it, because
GATE 7 measures line width, dropped words, and ink height, and has **no concept of where a line
lands on the screen**. It is a good gate that is blind on exactly the axis that broke.

Nine of these are new since 2026-08-11. Ranked list follows; the top four are the ship gate.

---

## REGRESSION HAT — did the 2026-08-11 findings actually get fixed?

| # | Original finding | Verdict | Evidence measured on the shipped dist |
|---|---|---|---|
| 1 | **OR-1 text rasterization** (6px `fillText` → 100 % antialiased) | **FIXED** (mechanism) | `fillText`/`strokeText`/`measureText` count in dist: **0**. In-game `textProbe()`: 208 ink px, **208 solid, 0 partial** (was 0 solid / 100 % partial at 6px). Every glyph is an integer `fillRect` from `src/pixel-font.js`. *Caveat — see finding 5: the replacement face has its own legibility problems.* |
| 2 | **OR-3 score is one bar forever** | **FIXED** | Independent re-derivation of `band.tick()`'s step context over 12 consecutive loops per track: every track is now **64 steps / 4 bars** (combat was 16/1); loop signatures are **not** identical — office 8, march 3, town 8, combat 7, report 8 distinct signatures per 12 loops. Combat responds to `s.params.intensity` (signature changes). Combat loop 1.71 s → **6.86 s**. |
| 3 | **OR-2 y=178 vs y=182 collision band** | **FIXED** | Draft card names now sit at y=166–180, clear of the control band at 182. Live sweep across 10 states: **0 text-vs-control-band collisions** anywhere. (A different draft collision replaced it — finding 4.) |
| 4 | **Shop cobble band greyscale / route tiles oversaturated** | **FIXED** | Shop bottom band now **meanSat 0.211 / meanLum 45.4** against shop UI 0.22 / 38.5 (was 0.00 / 159 against 0.13 / 41). Route terrain tiles **0.234 / 34.4** against route UI 0.225 / 30.4 (was 0.59–0.94 / 101–127). Both now sit inside the warm-ink palette. |
| 5 | **Credits render raw internal markdown** | **FIXED, with two residual leaks** | `PLAYER_CREDITS` ships instead of `ATTRIBUTION.md`; no `CLAUDE.md` / `ASSET-MANIFEST` references remain; pages 4 → 2, no content cut, CC BY URL + GuttyKreum + RonnyG + WebAudio lines all present and inlined in dist. Two build-time notes still reach the player — finding 9. |
| 6 | **Playthrough audit FAIL #7 — shop / multi-leg / docket breadth unverified in a browser** | **CLOSED, but not by the change that claimed it** | The fix shipped `src/playthrough.js`, a **node-level** simulation with no DOM — it cannot verify the browser path the finding was about. I closed it independently instead: the shipped in-page soak, driven in real Chromium, reaches `docket, saveRoundTrip, combatResume, draft, camp, jobChange, restAttempt, route, routeBranch, **shop, shopTxn**` and leg 4. Breadth *is* reachable in the shipped artifact. |
| 7 | **Rule 9 screen fill** | **PASSES the amended rule** | 1280×800 → scale 4, **100 % / 100 %**; 1440×900 → scale 4, **88.9 % / 88.9 %** — both integer, both ≥ 85 %. No page scrollbars at any viewport tested. |

**Integrity, re-checked:** `node --test` → **171/171**. `node scripts/gates.mjs` → M2 + M4 + M6 + M7 +
TEXT all green (435 catalog cases). Boot over `file://` across 10 states: **0 console errors, 0 page
errors, 0 external network requests**. Verb spot-check: speed by arrow, pause by Space, mute by `m`,
HOLD by `h` (freezes the tick while held, releases on keyup), export log by `e` (downloads
`office-of-the-road-debug.txt`) — all live.

---

## RANKED FINDINGS

### 1 · BLOCKER — the combat status strip is painted through the party roster

**The most-looked-at screen in the game has an unreadable band across its middle.**

`src/main.js:1092` draws the resolver line **full width** — `drawTextLines(ctx, cb.line, 12, 110,
VW - 24, 2, 7)` — 296 px wide starting at x=12. The party combatants are drawn at
`x = 156 + i*40, y = 62` (`main.js:1088`), and their name/HP rows land at y≈104–118 — *inside the
same band*. Nothing clears the strip's background in the non-draft path (the only `fillRect` clear,
`main.js:1098`, covers x114–194 / y124–132, a different row).

The comment on line 1091 says *"Full-width status above the hand (owned strip)"* and line 1097 says
*"combatant identity/HP rows end above it."* Both assert an invariant the code does not hold.

Measured (instrumented `pixelText` bboxes, one frame): **4 overlaps**, up to **7 rows deep** —
`"ROUTINE matter, filed on the road. Cards may be played."` against `"43/43"`, `"eon"`, `"or"`,
`"r"`. Visually the phrase and the HP numbers merge into scribble.

*Repro:* `dist/office-of-the-road.html?fresh=1&ticks=400&beats=6`.
*Reproduced independently in live play* (real keyboard/mouse run, seed 11) on every combat entry.
*Origin:* new — this is the GATE 7 lane's own remedy for "combat status box 108×2 dropped long
copy". The strip was widened from 108 px to 296 px to stop the truncation, straight across the
roster column.

---

### 2 · BLOCKER — the camp screen overprints its own party rows, and hides a line behind a panel

Two separate collisions on the party-management screen, both visible at a glance:

- **Stat rows.** `main.js:1323` draws `hp 43/43 atk 13 def 7 mag 4 spd 9` into a 162 px box with
  `maxLines 2` and **`lineHeight 6` against a 7-row glyph cell**. The line wraps, the trailing `9`
  lands on line 2 at the same x — directly on top of the `hp` of line 1, overlapping by one row.
  All four party rows render a corrupted first two characters. Measured: 4 overlaps.
- **Supplies line.** `main.js:1300–1305`: `detailY = 40 + introLines*7 + 1` → y=55 with a 2-line
  wrap, so line 2 lands at y=62 — exactly where the party panel `f0` is filled (`rect y=62`), and
  the panel is painted *after*. The player sees `"…rest: −6 supplies restores half of"` and never
  sees `"missing HP"`. Measured: text box `"missing HP"` intersects control `f0`.

*Repro:* `?fresh=1&paused=1&camp=1`.
*Origin:* new — the supplies overflow was "fixed" by GATE 7 giving it `maxLines 2`, which pushed
line 2 into the panel band.

---

### 3 · BLOCKER — the route screen prints two lines on top of each other

`main.js:1345` draws the intro at y=40 with `maxLines 2` (lines at 40 and 47); the
`supplies · ¤ · terminus` line follows at y=50. Line 2 of the intro and the supplies line occupy
y=50–54 together. The result is a solid unreadable smear directly under the masthead —
`"choose the road."` and `"supplies 40 · ¤ 0 ·"` superimposed — on the screen where the player makes
the game's main strategic choice.

Measured: 1 overlap, **4 rows deep**. *Repro:* `?fresh=1&paused=1&route=1`.
*Origin:* new — GATE 7 raised the route intro to `maxLines 2` to stop it overflowing; the y-stack
below it was not moved.

---

### 4 · BLOCKER (systemic) — GATE 7 scores mid-word splitting as a PASS

`wrapLinesNoEllipsis` (`src/text-wrap.js:16–28`) breaks any word wider than its container at an
arbitrary character. `scripts/text-gate.mjs` checks three things — line width ≤ maxWidth, no dropped
characters, ink x-height — and a mid-word split violates none of them. So the gate is green while
the player reads:

| Surface | Renders as |
|---|---|
| Combat enemy labels | `Toll-Cl` / `erk` · `Writ-Se` / `rver` |
| Combat party labels | `Chirurg` / `eon` · `Survey` / `or` · `Sumpte` / `r` |
| Deck review | `Strengt` / `h` · `Tempera` / `nce` (also painted over the card art above) |
| Draft offer | `Tempera`/`nce` and `Hanged`/`Man` abut with no gap → reads `TemperaHanged`; the third name runs directly into the description with zero separation (`EmperorProportion is imposed on the`) |

Every one of these second lines also collides by 1 row, because the same call sites use
`lineHeight 6` under a 7-row cell (`main.js:1323, 1369, 1438, 1464, 1499, 1618`).

This is the finding that matters most for the gate's future: **the 435-case catalog is faithful**
(I cross-checked the declared widths against the renderer — e.g. `CAMP_JOB_STATS_W = 288−126` is
exactly `main.js:1322`'s `jobTextW`), but the assertions are the wrong three. A gate that added
(a) no split inside a word, (b) `lineHeight ≥ cellHeight + 1`, and (c) no bbox intersection between
any two `pixelText` events in a frame, would have caught findings 1–4 and every row of this table.
The instrumentation already exists — `window.__office.layoutProbe()` returns exactly those boxes.

---

### 5 · HIGH — the replacement bitmap face has its own legibility defects

OR-1's blur is genuinely gone. But the 5×7 face that replaced it is not clean, and this is the
operator's named concern, so it should be judged as a player, not as a metric:

- **`g` is not distinguishable from `9` at 1×.** `Reassignment` → `Reassi9nment`, `Chirurgeon` →
  `Chirur9eon`, `[guarded]` → `[9uarded]`, `Regulation Jerki` → `Re9ulation Jerki`. In the camp and
  shop stat lines this lands next to actual digits — `mag 4 spd 9` reads as `ma9 4 spd 9`.
- **No descenders.** `g p q y j` are all drawn inside the 7-row box, so `p` reads as a small-cap
  `ᴘ` (`Expedition` → `Exᴘedition`, `proceed` → `ᴘroceed`). Word shapes flatten; long prose reads
  slower than it should.

Not a blocker on its own — uppercase and the intake screen read well — but it means "text
readability" is not finished, and the gate's `ink x-height ≥ 5px` metric cannot see any of it.

---

### 6 · HIGH — zero leading: the licence block and all wrapped prose set solid

`renderCredits` (`main.js:1284–1288`) advances `y += 7` for a 7-row face — adjacent lines *touch*.
Six call sites elsewhere use `lineHeight 6`, which *overlaps*. The visible result on the credits
screen is a dense unbroken block of attribution text, markedly harder to read than the rest of the
game — and this is the CC BY obligation surface, the one page that has to be readable for licence
reasons. Body prose elsewhere (intake, camp intro) uses 7 px spacing and reads fine, which is the
proof that a 1–2 px leading bump fixes it.

---

### 7 · HIGH — the M9 acceptance soak, the project's own STOP-LINE gate, fails on most seeds

`node scripts/soak-harness.mjs` across seeds 1–10: **4 PASS / 6 FAIL.**

```
seed  1 PASS 6/6   seed  2 FAIL 3/6  blockers: jobChange, shopTxn, routeBranch never mutated state
seed  3 FAIL 5/6   seed  4 PASS 6/6
seed  5 FAIL 5/6   seed  6 FAIL 5/6
seed  7 FAIL 3/6   seed  8 FAIL 3/6
seed  9 PASS 6/6   seed 10 PASS 6/6
```

`node scripts/soak.mjs` (the wrapper) exits **1** on seeds 2, 3 and 5. Driven against a real Chrome
binary it produced **no verdict at all** on any seed — the page title never reaches its
machine-readable state inside the virtual-time budget, and the runner reports FAIL by
non-completion. (Each such run also writes an untracked `proofs/soak-dossier-*.png`; I removed the
five mine created, so the tree is as I found it.)

**This is not a regression from the fix rounds.** I extracted `0b40eda`, `ae59556` and `6d129e0` with
`git archive` and re-ran: seeds 2 and 3 fail identically at every one. It is a **pre-existing,
seed-fragile gate that has always been run on its passing default seed**, and neither
`LANE-REPORT-FIXROUND2` nor `LANE-REPORT-TEXTGATE` ran it at all — both report only `node --test`,
`gates.mjs` and `build.js`. CLAUDE.md calls M9 the STOP LINE; something that fails 6 times in 10
should not be carried into Field Trials as green.

For balance: the underlying game is **not** unfairly lethal. A competent policy (rest, resupply,
shop, ordinary road) over 64 seeds using the game's own engine completes a mean of 6.6 legs,
median 8, **never dies before the first camp**, and 58 % survive all 8 legs. The soak failures are
its driver dying early, not the game being unplayable.

---

### 8 · MEDIUM — `¤` renders as `$`, and `≥` renders as `>`

`src/pixel-font.js` has no glyph for either, so `REPLACE` substitutes: `'¤' → '$'`, `'≥' → '>'`.

- Every currency string in the game is written `¤` and displays a **dollar sign** — `20$`, `22$`,
  `¤ 0` → `$ 0`, `ledger $200`. In a deadpan bureaucratic-fantasy register a `$` is a register
  break, and it appears on the shop, camp, route, docket and defeat screens.
- `main.js:1618` renders `discharge ≥ 24¤` as `discharge > 24$` — a **meaning change**, not just a
  glyph swap.

Both are one glyph each in the 5×7 map.

---

### 9 · MEDIUM — two build-time notes ship inside the player-facing credits

`src/credits.js:19,25`, rendered on credits page 2:

> `If derived composite character art is used: tool by RonnyG, art by Willibab.`
> `Licensing contact: Ray Weiss. Pixel Tarot licence scope will be reconfirmed before paid release.`

The first is a conditional the player cannot resolve; the second publishes an unresolved internal
legal to-do on the licence page. The old finding (raw markdown, `CLAUDE.md` references) is fixed;
these two are what is left of it.

Also cosmetic on the same screen: **"CREDITS" appears three times stacked** — masthead
`CREDITS & LICENSING — SHIPPED WITH THE FILE`, then `CREDITS · page 1/2`, then the body's own first
line `CREDITS & LICENSING`.

---

### 10 · LOW — below 640×400 CSS the integer-scale snap stops applying

`main.js:149`: `if (scale >= 2) scale = Math.floor(scale);` — under 2× the scale stays fractional.
Measured: 640×400 → 2 (integer); 620×390 → **1.9375**; 560×350 → **1.75**; 480×300 → **1.5**;
390×844 → **1.219**. At those sizes the bitmap face is resampled unevenly and glyph stems come out
different widths (verified in a render at 1.75×). Crisp but distorted — a milder cousin of the
defect OR-1's fix removed, reachable by any tester who runs the game in a small window.

---

### 11 · LOW — residuals carried forward, unchanged

- **`assets/` is still empty (0 files).** No title card, cover/og image, screenshots, or page copy.
  Every Field-Trials-facing surface outside the build is still to make.
- **`march` has only 3 distinct loop shapes in 12** — the dominant track cycles a ~27 s pattern.
  Honest improvement on "identical forever", still the thinnest track.
- **Hand and deck card art is unreadable at 30×38 / 46 px** — the tarot faces downsample to noise;
  cards are identifiable only by their (currently split) names. Flagged in the 08-11 audit as a
  NOTE; unchanged.
- **Pixel Tarot multi-title licence scope** remains the open gate before any paid release
  (`ATTRIBUTION.md` flags it itself). Art provenance is licensed-pack + code-composed, so the title
  stays paid-eligible.

---

## What to fix before Field Trials

1. **Findings 1–3** — three y-stacks. Give the combat strip its own cleared band clear of the roster
   (or narrow it back and shorten the copy), move the camp supplies line above the panel, push the
   route detail line below the intro's second row.
2. **Finding 4** — stop `wrapLinesNoEllipsis` splitting inside words (shorten the source strings, or
   widen the containers, or hyphenate deliberately), and raise the six `lineHeight 6` call sites to
   at least 8.
3. **Extend GATE 7 with the three assertions it is missing** — no intra-word split, leading ≥ cell
   height + 1, no bbox intersection between any two `pixelText` events in a frame. `layoutProbe()`
   already produces the data; this is the change that keeps round 4 from reintroducing round 3's
   defects the way round 3 reintroduced round 2's.
4. **Findings 8 and 9** — add `¤` and `≥` to the font map; cut the two builder notes from
   `PLAYER_CREDITS` and drop the duplicate heading.
5. **Finding 7** — decide what the M9 gate means. Either make it seed-robust and re-run it as part
   of every fix round, or record explicitly that it is a single-seed smoke test, so no future lane
   reads "M9 COMPLETE" as an acceptance guarantee.

Findings 5, 6, 10 and 11 are ship-with-known-gaps candidates for a *field trial* specifically —
they are visible, but they do not stop a tester playing and reporting. 1–4 do.

---

## Method

Playwright Chromium (default launch; `--single-process` SIGTRAPs on this Mac), `file://` against the
committed dist, viewport 1280×800 unless stated. Text geometry from the game's own
`ctx.__pixelTextEvents` via `window.__office.layoutProbe()` — real rendered boxes, not predictions.
Colour statistics from `getImageData` over named regions. Score variation re-derived independently
by replicating `band.tick()`'s step context rather than trusting `test/score.test.js`. Breadth driven
by real dispatched keyboard/mouse events plus the shipped in-page soak. Every visual finding was
**measured objectively and then looked at** at 1× native and at integer upscale, per
`verify-reported-visual-defects-objectively`. Historical comparisons used `git archive` into a
scratch tree; the repository was not modified, and the five `proofs/soak-dossier-*.png` files
produced by running the repo's own soak script were deleted (`git status` clean at exit).
