# PUBLIC-RELEASE GATE RECORD — MATERIAL BREACH

**Run 2026-08-18 by the shipping session, at HEAD `b37cb7f`.** Gate:
`generalstaff-private/docs/internal/PUBLIC-RELEASE-GATE-2026-08-12.md`.
Baseline: `docs/verification/release-gate-2026-08-15/RECORD.md` (steps 1-7 at an earlier HEAD).

## VERDICT: **GATE FAILS AT STEP 7.** Do not publish.

One verified BLOCKER (B1) plus a verified regression of a fix the 08-15 record reports as
closed. Steps 1-6 pass. Everything below was run fresh at this HEAD; nothing is carried over
from the 08-15 record.

| Step | Verdict | Evidence |
|---|---|---|
| 1 Battery | **PASS** — 197 tests, 197 pass, 0 fail, 0 skipped (17.3s) | `step1-battery/battery-197.txt` |
| 2 Cold boot | **PASS** — fresh profile per viewport, `file://`, 5 viewports; real menu (start/options/provenance); 0 page errors; 20s idle advanced nothing | `step2-coldboot/` |
| 3 End states | **PASS** — condemned terminal, `rubric.finished=true`, restart clean, save/resume byte-exact, corrupt save does not throw, `quit()` clean | `step3-endstates/step3-endstate.json` |
| 4 Motion | **PASS** — party faces its direction of travel; trail accumulates; `strength N` label unclipped; 0 page errors | `step4-motion/frames/` |
| 5 Score | **PASS** — 4 distinct 8-bar sections; written chord sounds in 100% of bars; 89.2% of aligned event slots differ across passes | `src/score.js`, `docs/listen/2026-08-17-humanize/` |
| 6 Provenance | **PASS** (artifact) / **doc defects** — provenance ships in-artifact and is exemplary; three stale docs listed below | `step2-coldboot/walk-03-provenance.png` |
| 7 QA sweep | **FAIL** — 1 BLOCKER (B1), 1 verified regression (Q1), 3 defects | this file + `step7-qa/` |
| 8 Deploy verify | NOT RUN — prepared only; see `STEP-8-PLAN.md` |
| 9 Ray | PENDING |

---

## Step 1 — Certification battery

`node --test` at `b37cb7f`: **tests 197 / pass 197 / fail 0 / cancelled 0 / skipped 0 / todo 0**.
Up from 188 at the 08-15 record; the 9 new tests arrived with the performance-pass
(`test/band-performance.test.js`, `test/score.test.js`).

## Step 2 — Cold boot as a stranger

Fresh browser context per viewport (no carried storage), shipped `dist/index.html` over
`file://`. Title screen carries a real menu: **Take up the post [Enter] / Options [O] /
Provenance [P]**.

| Viewport | Canvas fill | Read |
|---|---|---|
| 900x600 | 84.4% | aspect letterbox (16:9 buffer in a 3:2 window) — correct, not a defect |
| 1280x720 | 100.0% | full |
| 1440x900 | 90.0% | aspect letterbox |
| 1920x1080 | 100.0% | full |
| 2560x1440 | 100.0% | full |

Legibility holds at 900x600 (the prior B2 blocker class): body copy and all three menu labels
read cleanly. **0 page errors, 0 console errors** at every viewport. Pacing law on the shipped
artifact: 20s idle at the desk left the cycle unchanged.

Minor, for Ray: the title prints **`version 0.0.0`** (from `package.json`). A public release
showing `0.0.0` reads as unshipped.

Controller support: **exempt** — mouse-first management game, per the gate's standing-standard
carve-out. Exemption recorded here as required.

## Step 3 — End-state coverage

Driven end-to-end through the real UI against the shipped artifact.

- Terminal reached by play: **condemned at cycle 8**, cornerstone 0/100, closed surface reached.
- `rubric.finished = true` — the closing report was filed. `mastered`/`secret` correctly false
  with stated reasons.
- Anti-triumph (seed §139) holds: *"The closing report is filed. No commendation attaches to the
  outcome."* Every flavour line carries a numeric neighbour.
- **Restart:** `newtenure` → clean tenure, cycle 1, treasury 400, cornerstone 100.
- **Save/resume:** autosave 35,148 bytes under `material-breach:save`; after reload the title
  offers to resume; resumed state matched exactly (cycle 2, treasury 412, cornerstone 100).
- **Corrupt save:** handled without throwing; falls back to title. (But see Q1 — it does so
  *silently*, which is the regression.)
- `__GAME.quit()`: clean teardown, no throw.

**Open seed gap, carried from 08-15 and still unratified:** restart/quit semantics are not
stated in `DESIGN-SEED.md`. Per the gate's own wording ("If the seed doesn't state the rule,
that's the defect"), this needs Ray's ruling ratified into the seed.

## Step 4 — Motion looker

Re-ran the committed 08-15 harness (`capture-motion.mjs`) against the current build: 13 bursts,
frame-exact off consecutive `requestAnimationFrame` callbacks, **page errors: none**. Sequences
read by eye at 5-6x nearest-neighbour (`frames/S1-incident-replay-6_10-sheet.png`).

- Raider party travels leftward toward the Cornerstone across frames 6→10; **both figures face
  left, the direction they travel.** No moonwalk. The 08-15 latent `flip:true` hardcode fix
  (facing derived from travel) holds.
- Trail dots accumulate behind the party; cursor advances monotonically; no pop, tear or flicker.
- `strength 2 → 1 → 1 → 0` renders **fully inside the panel** — the 08-15 D1 clip defect stays fixed.
- Cornerstone pulse animates smoothly in both healthy and stressed states.

Cast figures are the licensed Willibab pack art recoloured into the palette, matching the
certified provenance.

## Step 5 — Score (re-run against the POST-performance-pass score)

Gate-relevant because `86cc7ed`/`cf70729`/`18278ea` changed the performance layer after 08-15.

- **Four distinct 8-bar sections:** A THE LOBBY (Fmaj7 Dm7 Gm7 C7), B THE CORRIDOR, C THE
  MEZZANINE (chromatic bass G→C), D THE HOLD (half the harmonic rhythm). Distinct roots per
  section 4/6/8/4, ten overall. Closing cue adds three more sections in parallel minor.
- `verify-harmony.mjs`: the written chord is the sounding chord in **100% of bars** (32/32, 32/32, 12/12).
- **Arrangement variation across passes** (the law's explicit requirement): 89.2% of aligned
  event slots differ (only 71/660 identical); walking bass 56/112 notes differ; vibraphone 32/46
  land on a different step. In the rendered WAV, pass 2 vs pass 1 differ in 99.97% of samples.
- **Between sections:** comp band spreads 4.19 dB, brush band 5.07 dB; section D drops to 0 comp
  hits. Textural contrast, not a level trick (broadband RMS spread only 0.15 dB).
- **No hard-rule violation:** all timing draws from `hash2(step, lane, seed)` — seeded, no
  wall-clock. Zero executable `setInterval/setTimeout/Date.now/performance.now/Math.random` in
  `src/` (every grep hit is a comment). Authored FORM/CHORDS/SECTIONS byte-untouched.
- Tests: `score.test.js` + `band-performance.test.js` = 29 pass / 0 fail.

Non-blocking: the authored per-pass octave lift `snap(v[tone] + (alt ? 12 : 0), G4, A5)` changes
**0 of 46** melody notes — the snap window re-wraps every one. Dead variation; the comment claims
an effect that never fires. The law still holds via the timing shift.

Ray's ear has not passed on the post-performance-pass set. Listen set:
`docs/listen/2026-08-17-humanize/`.

## Step 6 — Provenance + collateral

**In-artifact provenance is exemplary** and ships inside `dist/index.html`: facility code-drawn
("No image was generated by a model"); cast = NPC Pack Human Empires by Willibab/Monsteretrope,
CC BY 4.0, recoloured with originals preserved; type = Not Jam Font Pack, CC0 1.0; score =
**Abel Aeolian**, code-composed WebAudio, no audio file ships; standing line "No
LLM-image-generated art appears in this game, in any form." Paid-eligible under
`art-provenance-gates-commercial-release.md`. No em-dashes in player-facing copy.

Doc defects (not player-visible, but they misinform the next lane):

- **`DESIGN-SEED.md:8` and `:348`** still read *"Name status: provisional pending Ray. Alternates
  ranked: DILAPIDATIONS, CONDEMNED PREMISES."* Ray ratified on 08-17. Supersession-means-deletion.
- **`README.md` status block is stale** — claims "M6 closed 2026-08-14 … 98 tests" and "Next:
  M7a", at a HEAD that is post-M8 with 197 tests.
- **No OG/social meta in `dist/index.html`** — only `charset` and `viewport`. Step 8 requires OG
  meta wired and resolving, so this must be added before publish.

## Step 7 — Studio QA sweep — **FAIL**

Findings verdict-gated against the source; two of the sweep's claims were rejected on inspection.

### BLOCKER

**B1 — a malformed save permanently bricks the game, silently. VERIFIED.**
`tryResume()` dereferences `res.facility.cycle.number` inside a log line, unguarded.
`persistence.load()` validates `v` and `facility` but not shape, so one deref defeats the whole
defensive layer, and `boot()` has no try/catch.

Repro: set `localStorage['material-breach:save'] = '{"v":1,"facility":{"status":"active"}}'`, reload.
Measured: `window.__GAME` never exists; page error *"Cannot read properties of undefined (reading
'number')"*; canvas never drawn; **a second reload does not recover** — only devtools
`localStorage.clear()` does. Evidence: `step7-qa/verify-B1-malformed-save.png`.

Not reachable from normal play; fires on any save-schema drift that keeps `SAVE_VERSION = 1`.
Fix is small: optional-chain the log line, validate shape in `load()`, and wrap `boot()` with a
visible boot-failure surface.

### Q1 — the "loud corrupt-save notice" does not render. VERIFIED REGRESSION.

Commit `f71d7e9` ("Release fix round B5: loud corrupt-save notice on title") and the 08-15 record
report this MAJOR as fixed. It is not fixed in the shipped build.

Measured: with a corrupt save present, the title screenshot is **byte-identical** to the clean
title (`Buffer.compare === 0`), for both unparseable JSON and a wrong-version save. The boot
wiring is correct — `tryResume` returns a reason and `boot.js:71` sets `view.saveNotice` — but
`render.js:630` gates the draw on `y + SIZE.body <= copyFloor` (`copyFloor = 198`), and the
charter copy has already consumed that space, so the notice is silently dropped every time.

The battery is green over this because `test/corrupt-save.test.js` tests the two halves
separately — that `tryResume` returns a reason, and that `render` draws the notice *when
`saveNotice` is set by hand* — and never the boot→render path at real layout. Classic UI↔logic
seam.

Second-order: the reason string is raw parser output — *"Expected property name or '}' in JSON at
position 1 (line 1 column 2)"*. Were it to render, that is a VOICE LAW violation. The notice needs
an in-register string, not the exception message.

### DEFECT

- **Q2 — the title is unreachable once you take up the post.** Pause offers
  `resume / mute / exportlog / provenance` and adds `quit` **only when `window.__SHELL` exists**
  (`layout.js:69`). Served standalone on field-trials there is no shell, so a player cannot return
  to the title or abandon a tenure without reloading the page. Verified in source and by play.
- **Q3 — works orders cannot be withdrawn; the refund exists only in code.** `cancelOrder()`
  (full refund) and `actCancelOrder()` are implemented and ship in `dist` (5 refs), with **zero
  callers** from `input.js`, `layout.js`, `boot.js` or `render.js`. `F` is an instant irreversible
  50g. Either wire it or tombstone it — dead code reading as a feature.
- **Q4 — the closing report is a one-exit surface.** Esc, X, O, P, M are all inert there; the only
  control ("Begin a new tenure") destroys the record being read.

### FRICTION

Enter-Enter double-tap defeats the two-confirm guard · Esc on the orientation memo loses it
permanently · pan keys leak behind pause and checklist · `Z` is a live unlabelled Enter alias ·
a finished tenure cannot be paused or muted · tool ring is forward-only.

### Rejected on inspection (verdict-gated, not relayed as defects)

- **"A-key collision spends gold on the camera key" — FALSE POSITIVE.** `input.js:99-101`
  documents and implements the precedence deliberately: *"a letter that names an active button
  fires the button; otherwise WASD pans."* Reproduction attempt: with a surveyor instrument
  standing, pressing `A` moved treasury 392 → 392, **delta 0**. The residual concern is a design
  question for Ray (a player who has learned A = pan may spend gold with one unconfirmed press),
  not a code defect.
- **"The incident replay violates the pacing law" — REJECTED as a law violation, kept as
  friction.** The replay auto-dismisses on RAF frame count, which changes `overlay` only.
  Game state is untouched: 20s idle (this run) and 35s idle (sweep) both produced an empty state
  diff. Presentation, which the law explicitly permits. It does mean the replay cannot be dwelled
  on indefinitely, and being frame-count-driven it runs at half speed on a 30Hz display.

### Repo soak

`node scripts/soak-m8.mjs`: **BLOCKER 0 / DEFECT 0 / FRICTION 1**, PASSED — the friction being
that no Licensing Inspector arrived in 30 cycles, so the secret tier was never exercised
end-to-end.

### Console

Zero page errors and zero console errors across every viewport in normal play. Errors appear
only under injected corrupt saves.

---

## NAME COLLATERAL AUDIT — PASS on every player-visible and public-facing surface

Ray ratified MATERIAL BREACH on 2026-08-17 (`b37cb7f`). Surfaces checked:

| Surface | Carries | Verdict |
|---|---|---|
| Title screen (rendered, verified by eye) | `MATERIAL BREACH` | PASS |
| Page `<title>` in `dist/index.html` | `<title>MATERIAL BREACH</title>` | PASS |
| `GAME_NAME` constant (`dist:172`) | `'MATERIAL BREACH'` | PASS |
| In-artifact ATTRIBUTION header | `# ATTRIBUTION — MATERIAL BREACH` | PASS |
| Debug-log export header | `MATERIAL BREACH debug log:` | PASS |
| `README.md` hero | `# MATERIAL BREACH` | PASS |
| `package.json` name/description | `material-breach` / `MATERIAL BREACH — …` | PASS |
| `CLAUDE.md` / `AGENTS.md` name-lock marker | present, mirrored (files differ only in their own self-reference line, by policy) | PASS |
| OG / store card | **does not exist yet** | see below |
| itch draft text | none in repo | n/a |

**No retired alternate name appears on any player-visible or public-facing surface.** The five
`dilapidation` hits in `dist/index.html` are all the in-game *instrument* — "schedule of
dilapidations", the first rung of the escalation ladder, ratified in `DESIGN-SEED.md` §M5 — plus
two source comments and one palette comment ("the condemned edge"). These are correct game
vocabulary, not the retired title, and must **not** be scrubbed.

Stale references remain only in internal docs, listed under step 6: `DESIGN-SEED.md:8`/`:348`
(still says the name is provisional), plus historical mentions in `PROGRESS.md`,
`LANE-REPORT-*.md`, `docs/handoffs/`, and the 08-15 `RECORD.md` — those are dated history and
may stand.

**OG/store collateral does not exist.** When it is made, per the cast-reference addendum it must
be drawn from the SHIPPED assets and cast-verified by path against
`~/Desktop/Dev Work/pixel-art-library/extracted/` (Willibab NPC Pack Human Empires) as recoloured
in this repo — not from any parallel sprite source. Nothing to audit today.

---

## DELTA SINCE THE 08-15 DOSSIER (HEAD `917c147` → `b37cb7f`)

| Commit | Gate-relevant? | Why |
|---|---|---|
| `e57cca8` viewport scaling without cropping UI text | **YES — step 2** | touches `src/boot.js` rescale + `test/fill-probe.test.js`; re-measured at 5 viewports, passes |
| `86cc7ed` House Band performance-pass into the kit | **YES — step 5** | `src/band.js` +156; re-verified deterministic, no timer |
| `cf70729` wire the score into the performance-pass | **YES — step 5** | `src/score.js` +33; authored notes confirmed untouched |
| `18278ea` render the 2026-08-17 listen set | **YES — step 5 evidence** | new listen set + `dist` rebuild |
| `c48f56e` bank found-at-harvest gate evidence | no | docs only; banks 08-15 dossier files |
| `b37cb7f` NAME RATIFIED | **YES — step 6 / name audit** | `CLAUDE.md` + `AGENTS.md` markers |

No commit in this delta touched game logic (`model/sim/cycle/raid/ladder/actions/view/input`), so
B1, Q2, Q3 and Q4 are **pre-existing**, not regressions from the delta. Q1 is a regression against
the 08-15 record's *claim*, not against its code — the notice never rendered.

---

## WHAT MUST REACH RAY (step 9)

1. **B1** — the brick. Small fix, unrecoverable when it fires.
2. **Q1** — a fix recorded as closed on 08-15 that does not reach the player, plus the raw
   parser string that would leak if it did.
3. **Q2/Q3/Q4** — no way back to the title; a refund that exists only in code; a report whose
   only exit destroys it. Q3 in particular is a design-axis call.
4. **The restart/quit seed gap**, still unratified since 08-15.
5. **`version 0.0.0`** on the title of a shipping game.
6. **Ray's ear on the post-performance-pass score** — the 08-17 listen set has not been heard.
7. **Step 8 is a NEW public surface** — see `STEP-8-PLAN.md`.
