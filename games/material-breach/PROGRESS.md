# PROGRESS — MATERIAL BREACH

Append-only build log. Newest entry at the top. Every run adds an entry and a
`## For the operator to ratify` block, per AGENTS.md hard rule 9.

---

## 2026-08-19 — Q3 hotfix: the Withdraw verb

Release-gate finding Q3 (2026-08-18 dossier): `cancelOrder()`/`actCancelOrder()` were implemented
and shipped (full refund, 5 refs in `dist`) but had zero callers from `input.js`, `layout.js`,
`boot.js` or `render.js` — a spent order could never be taken back on the live path. Wired.

Changed:

- `src/actions.js` — `lastQueuedOrder(facility)`: the order a single Withdraw control acts on
  (most recently raised, still `status: 'queued'`). Pure query, no change to `cancelOrder`'s
  contract.
- `src/view.js` — `actCancelOrder` now sets `sfx`/logs like every sibling action (it never had
  either, being unreachable); added `actWithdrawLast(view)`, the action-bar entry point.
- `src/layout.js` — the ADMIN action bar grows a `withdraw` control (key `C`) whenever an order
  raised this cycle is still queued, same conditional-visibility idiom as Fabricate/Answer. Label
  is a bare `Withdraw` — an amount-carrying label ("Withdraw NNg") clipped its own `[C]` hint off
  a 105px slot, measured on the built artifact and caught before shipping, not assumed.
- `src/input.js` — `case 'withdraw'` dispatches to `actWithdrawLast`.
- `test/withdraw-order.test.js` (new, 3 tests) — the PLAYER PATH: `dispatch(view, 'withdraw')`
  through the real input dispatcher and `computeButtons()` as the renderer sees it, not
  `cancelOrder()` called directly. Covers: control appears/refunds/retires; LIFO order when two
  are queued; control cannot reach an order once signed into progress.
- `scripts/capture-withdraw-verb.mjs` (new) + `docs/look-withdraw-20260819/` — real-mouse-driven
  boot of the built `dist/index.html` (no synthetic dispatch), queued/refunded frames plus an
  action-bar zoom, looker-verified legible over the crisp-text/CRT carve-out.

No confirmation dialog added: the game's own precedent is that every ADMIN action (Fortify,
Repair, Fabricate, even abandoning a whole tenure from the title/pause) fires on a single click
with a read-back note; withdrawing a still-queued order is strictly less destructive than any of
those (fully reversible — requeue and pay again), so it gets the same single-click treatment, not
an invented confirm step.

Battery: **205 -> 208 pass / 0 fail**.

## For the operator to ratify

None — this executes the examiner's Q3 finding as written ("either wire it or tombstone it") and
your ruling to wire it.

---

## 2026-08-18 — Text/CRT layering fix

Player-facing text now renders on a display-resolution `#text` canvas composited above the
640x360 pixel-art `#screen` buffer, matching Popinjay's carve-out. The CRT/pixelated register
remains on the facility, ledger paper, desk, and buttons; only the words are crisp.

Changed:

- `src/render.js` — added `beginTextLayer` / `takeTextLayer` / `paintTextLayer`, text-command
  queue with clip-stack mirroring, and overlay-aware flushing so desk text under a dimmed overlay
  does not read crisp on top of a darkened scene.
- `src/boot.js` — creates/resizes the `#text` canvas and paints the text layer each RAF frame.
- `scripts/build-singlefile.mjs` — emits the `#text` canvas and CSS in the shipped artifact.
- `test/opening-masthead.test.js` — corrupt-save notice contrast now composites the two canvases
  at display resolution.
- `docs/look-crtfix-20260818/` — before/after frames of the title/charter and admin desk.
- `docs/LANE-REPORT-CRTFIX-2026-08-18.md` — full lane report.

Battery: **205 pass / 0 fail**. Boot→render verified on the built `dist/index.html` via
Playwright. No push.

## For the operator to ratify

None — this executes the operator's stated intent (text legibility outranks CRT authenticity on
player-facing words; CRT stays everywhere else).

---

## 2026-08-17 — House Band performance-pass wired onto the ratified score

The House Band Performance-Pass API (deterministic humanize + pad/drone release tails) is now
live on this game's existing score. Authored notes, patterns, form, voicings and arrangement were
not changed. The kit was **grafted**, not wholesale-synced: this port's RAF-driven `tick()` (no
`setInterval`, no `start()`/`stop()`) stays, because replacing the kit with upstream HEAD would
reintroduce a timer and break Gate 1.

Playback opts in at `createScoredBand` via `SCORE_PERFORMANCE`, including the listen harness. The
kit still treats omitted `performance` as exactly neutral.

Declared knobs:

- timing `[0, 8]` ms one-sided late
- velocity `[-0.05, 0.05]`
- swing `0.05`
- pad `releaseTail` `0.55` s (score-level `0.35`; drone extra `0`)
- bass / kick / snare / hat timing and swing neutralized

Battery: **188 -> 197 pass / 0 fail**. New tests: `test/band-performance.test.js` (5) and four
PERFORMANCE/DETERMINISM/PURITY cases in `test/score.test.js`. No existing test was weakened or
deleted.

Fresh listen set (renders completed; ear is the remaining gate):

- `docs/listen/2026-08-17-humanize/01-the-lobby-two-full-cycles.mp3`
- `docs/listen/2026-08-17-humanize/02-the-lobby-souring-across-a-tenure.mp3`
- `docs/listen/2026-08-17-humanize/03-the-lobby-during-an-incident.mp3`
- `docs/listen/2026-08-17-humanize/04-tenure-closed.mp3`
- `docs/listen/2026-08-17-humanize/05-the-desk-sound-effects.mp3`

Harmony re-measured from those renders: 32/32, 32/32, 12/12 written-chord bars, roots still moving.
Nothing was pushed.

### For the operator to ratify

1. **The humanize amounts above.** Timing, velocity, swing and pad-tail extras are builder
   defaults for this lobby register. Overturn any of them by naming a different number.
2. **The walking bass and the desk stay on the grid.** Only pad, piano, vibraphone, lead and
   related voices lean. If the whole band should breathe, say so.
3. **No before/after pair in the new folder.** The 2026-08-14-M7b set remains the pre-humanize
   render of the same authored material.
4. **The kit was grafted rather than replaced with house-band HEAD.** The pacing-law timer deletion
   is the local extension that made a wholesale sync the wrong port.

---

## 2026-08-15 — Release fill correction: readable UI edges retained

The release-round cover scaler cropped readable native-buffer edges at 1280x800 and 1440x900.
`src/boot.js` now uses exact fractional contain-fit scaling: the 640x360 picture keeps its aspect,
fills the constrained viewport axis, and never relies on page overflow to discard UI.

`test/fill-probe.test.js` still pixel-measures the shipped single-file build for fill and effective
body size. Its fill assertion now measures the aspect-preserving constrained axis, and the same
browser probe projects the actual Ledger, Legend plate, and section-header rectangles through the
presented canvas box. All four edges are asserted inside the viewport at 1280x800, 1440x900, and
2560x1440.

The single-file artifact was rebuilt and verified from `file://`. Battery: **188 -> 188 pass / 0
fail**. The focused shipped-build probe is **2 pass / 0 fail**.

### For the operator to ratify

1. **Contain-fit was selected.** At viewports narrower than 16:9, the full readable picture is
   retained with vertical desk-colour margins; the width remains filled at 100%.

---

## 2026-08-15 — Release fix round (coldboot + step4 motion blockers)

Executed `docs/handoffs/RELEASE-FIX-ROUND-2026-08-15.md` to closure. Source verdicts are under
`docs/verification/release-gate-2026-08-15/`; new proof captures are in
`docs/proofs/2026-08-15-release-fixround/`.

Changes landed:

- **B1/B2** — best-fit cover scaling in `src/boot.js` (fractional scale allowed, quarter-integer snap,
  `image-rendering: pixelated`). The 900×600 playfield now covers 100% of the limiting dimension
  instead of ~60%; body copy renders at 18.3px effective there.
- **B3** — the after-action report is now clipped and scrollable (`view.reportScroll` / Page keys /
  wheel over the ledger). Every line of a late-cycle report is reachable, not silently dropped.
- **B4** — provenance opened from pause now returns to pause via `view.overlayReturnTo`.
- **B5** — a malformed `material-breach:save` surfaces a loud in-register notice on the title instead
  of silently booting fresh.
- **Minors** — orientation/checklist buttons fit inside the overlay sheet; `ORIENTATION` lines are
  pre-wrapped so `wrap()` does not re-break them; Esc acts as a Back/X alias on options/provenance.
- **D1** — the replay strength label is clamped/mirrored by measured width so it never runs off the
  section panel on right-edge entry.
- **Latent moonwalk** — raider `flip` is derived from the raid's travel direction, honouring the
  cast-data "face right" convention.

Battery: **174 -> 188 pass / 0 fail**. The new tests are:
`test/fill-probe.test.js`, `test/aar-scroll.test.js`, `test/shell-provenance-return.test.js`,
`test/corrupt-save.test.js`, `test/replay-label.test.js`, `test/raider-flip.test.js`.

The single-file artifact was rebuilt. Fill probe measurements:

| viewport | box | limiting fill | effective body px |
|---|---|---|---|
| 900×600 | 900×600 | 100% | 18.33 |
| 1280×800 | 1280×800 | 100% | 24.44 |
| 1440×812 | 1440×810 | 99.75% | 24.75 |
| 1440×900 | 1440×900 | 100% | 27.50 |
| 1920×1080 | 1920×1080 | 100% | 33.00 |
| 2560×1440 | 2560×1440 | 100% | 44.00 |

Nothing was pushed.

### For the operator to ratify

1. **Cover scaling was chosen over letterbox fit.** The canvas fills the viewport and overhangs are
   clipped by `overflow:hidden`; some buffer edges are off-screen on extreme aspect ratios, but the
   six battery viewports all exceed the 90% limiting-dimension floor.
2. **Report scroll uses Page keys and mouse wheel over the ledger.** Arrow keys remain bound to cutaway
   pan; this keeps the control surface unchanged for existing players.
3. **Esc is now a Back/X alias on options/provenance/error/checklist.** Pause behaviour is unchanged.
4. **The corrupt-save notice appears on the title sheet in `C.stampInk`.** It is not a modal overlay;
   the player can still start a fresh tenure immediately.

---

## 2026-08-14 — M8 escalation retune round 3; **LADDER DEFECT CLOSED** (Codex retune lane, Mac)

Round 3 retuned affordability and timing together under the operator's full numeric and cadence
authority. The exact round-2 five-seed policy was first reconstructed as a repeatable harness; it
reproduced 21/24/23/24/24 cycles, the same Surveyor/Auditor reach, the same four-cycle gaps, zero
answers, and the documented 2g to 26g Surveyor holdings. That matching baseline established that the
new measurements use the dossier's policy rather than a more generous substitute.

The retained retune is committed locally at `31f844d`. Every signed-over incident now files one
finding and a breach adds one more, so a breaching incident still contributes the round-1 total of
two. The first officer requires eight findings; later officers require five; and a five-cycle
service-to-service floor preserves the plateau when pressure fills early. Answer costs are
**9/12/15g**. The ratified answered-instruments softening semantics from `04435d8` are unchanged.
Raid damage remains 3 condition per uncovered threat point and a lapsed schedule remains a
10-condition loss.

The exact five seeds now close in 21/22/23/22/24 cycles and all five produce the same first-rung
shape: Surveyor cycle 8, Auditor cycle 13, Inspector cycle 18, with measured gaps of 5 and 5. Every
seed answers the Surveyor, Auditor and Inspector; seed e answers a second Inspector as well. First
Surveyor holdings are 9g to 26g against the 9g cost. Auditor holdings at first open are 15g to 17g
against 12g. Inspector holdings begin at 5g to 8g and reach 16g to 17g on the following ADMIN phase,
where every seed files the 15g answer within deadline. The natural 21-to-24-cycle arc did not need
to be lengthened.

Standing tier-reachability and answer-engagement regressions now drive the dossier's five seeds and
competent policy. Battery: **172 -> 174 pass / 0 fail**. The single-file artifact was rebuilt and
the Gate 8 browser soak rerun: **0 BLOCKER, 0 DEFECT, 1 FRICTION**, with no page or console errors,
100% frame fill, pacing unchanged under three seconds of real time, and a clean teardown. Full data
is appended to `docs/proofs/2026-08-14-M8/M8-ACCEPTANCE-DOSSIER.md`; the soak frames and findings are
in `docs/proofs/2026-08-14-M8/retune3-soak/`. Nothing was pushed.

### For the operator to ratify

1. **Onset now counts the incident file, not only structural breach.** This is why the first
   Surveyor can arrive at cycle 8 while a competent facility is still holding the perimeter. The
   ladder remains cycle-driven: an unsigned desk accrues nothing.
2. **The service cadence is explicitly floored at five cycles.** Findings may accumulate sooner,
   but the next officer cannot erase the measured local-dominance plateau by arriving early.
3. **The 9/12/15g price curve is measured against the spending policy, not starting gold.** The
   Surveyor and Auditor clear immediately in all five runs; the Inspector clears one ADMIN phase
   after opening in all five, within deadline. These values are comparable to one 15g excavation
   order and preserve a real choice without making filing unreachable.
4. **No tenure extension was used.** The accepted three-rung shape fits inside the existing natural
   arc, so the round-1 damage and ignored-schedule loss values stay in force.

## 2026-08-14 — M8 escalation retune round 2; **BLOCKED AFTER RATIFIED SEMANTIC FIX** (Codex retune lane, Mac)

The operator ratified the prior lane's proposal for the comeback lever. `runLadder()` now advances
`ladder.onTimeStreak` only when an instrument was answered during that cycle; quiet cycles never
soften the rung, an expiry resets the count, and the third timely answered instrument lowers the
rung. The filing action stamps `cycleAnswered` so the report phase counts each answer exactly once.
This isolated behavior is committed locally at `04435d8`. Battery: **171 -> 172 pass / 0 fail**.
Nothing was pushed.

The exact prior competent policy was rerun for seeds a-e with its 120-cycle ceiling and five-order
excavation bound. Results were 21/24/23/24/24 cycles. The highest rungs were
Surveyor/Auditor/Surveyor/Auditor/Auditor, and zero instruments were answered in every run. The
Inspector appeared in zero of five seeds. In the three runs reaching the Auditor, it arrived four
cycles after the Surveyor because the first instrument lapsed, not after the required five-to-six
cycle plateau.

The round-1 numbers remain unchanged because the result undershot rather than overshot. Surveyor
answer attempts found only 2g to 26g against the 30g cost, and the tenures closed before a third rung
could arrive. Full evidence is in `docs/proofs/2026-08-14-M8/RETUNE2-BLOCKED.md`, with the honest
round-2 table also appended to the acceptance dossier.

Per the operator's stop condition, I did not add a tier-reachability regression for a condition the
sim still fails and did not claim the dossier defect closed.

### For the operator to ratify

1. **The ratified semantic change is implemented and mechanically pinned.** Each notice now retains
   the cycle on which it was answered so `runLadder()` can distinguish a timely filing from a quiet
   cycle. This is persistence-compatible with older notices, whose missing stamp simply does not
   count.
2. **Another numeric or economic direction is required to close reachability.** The retained
   30/60/100g costs and damage values still produce no timely answers and no Inspector under the
   fixed competent policy. I stopped rather than choosing a second retune without authority.

---

## 2026-08-14 — M8 escalation retune attempted; **BLOCKED ON LADDER SHAPE** (Codex retune lane, Mac)

The operator unpaused this post-M8 lane and authorised the acceptance dossier's retune proposal as
the starting point. I committed that numeric starting point locally at `457e043`: answer costs
60/120/200g -> **30/60/100g**, breach pressure +1 -> **+2**, raid damage per uncovered threat point
6 -> **3**, and the lapsed-schedule Cornerstone hit 20 -> **10**. Battery remained **171 pass / 0
fail**. Nothing was pushed.

The same five seeds and 120-cycle ceiling still reached only the Royal Surveyor under the dossier's
stated competent policy. After values were 21/24/23/24/24 cycles for seeds a/b/c/d/e; zero
instruments were answered in every run. The Guild Auditor and Licensing Inspector remained absent.

The retune is wrong-shaped because the current comeback lever automatically lowers the rung after
three non-expiry cycles, while the proposal asks for an officer every five to six cycles. The rung
therefore softens before the next intended dispatch. Raising pressure enough to beat that timer
bunches the officers into consecutive cycles and removes the binding local-dominance plateau. A
damage-cap experiment also regressed the standing degenerate-strategy deadlines and was not
retained. Full evidence and the exact conflict are in
`docs/proofs/2026-08-14-M8/RETUNE-BLOCKED.md`.

Per the operator's stop condition, I did not improvise a semantic rewrite, did not claim the dossier
defect closed, and did not add a reachability regression that the retained sim cannot pass.

### For the operator to ratify

1. **The ladder needs a semantic decision before this lane can close.** My smallest coherent option
   is to count timely answered instruments toward the three-step softening lever, instead of counting
   any three cycles without an expiry. That permits the requested five-to-six-cycle plateaus without
   erasing rung progress. I did not implement it because the instruction said to stop if the proposed
   retune proved wrong-shaped.
2. **The numeric starting point remains committed and green, but does not close the defect.** The
   orchestrator should not present `457e043` as the completed retune.

---

## 2026-08-14 — M8 CLOSED: the gates, the ship shell, the rubric. **THE LADDER DEFECT NEEDS RAY.** (opus builder, Mac)

**Milestone M8 — the gates — complete. This is the last milestone the seed defines; per hard rule 5
the build stops here and everything further is operator-directed.** Battery: 140 -> **171 pass /
0 fail**. Committed across three increments.

### The headline finding, which is Ray's call

**Two of the three escalation rungs never arrive, so two of the three completion tiers are
unreachable in play.** Measured across five seeds with a competent headless player, 120-cycle
ceiling: every run ended at cycle 20-26 having reached the **Royal Surveyor and no further**, with
**zero instruments ever answered**. The Guild Auditor and the Licensing Inspector never appear.

So `mastered` (hold past the first Inspector) and `secret` (withdraw a condemnation order) cannot be
earned; the tax lien, the condemnation order, the second officer and the insolvency-by-seizure path
are all dead content; and it contradicts the ratified directive that the ladder must allow local
dominance plateaus, because the player never out-builds anything.

Diagnosis from the numbers: pressure accrues about fast enough for ONE officer in a 22-cycle tenure;
answering costs 60g against a treasury that sits near 30g, so instruments lapse rather than being
answered; and the lapse shortens the tenure further. **Not fixed here**, because tenure length and
difficulty are Ray's purpose-and-feel axis and the correction needed is far beyond the +/-50% retune
the DIRECTIONS skeleton delegates to me. Full detail and a concrete recommendation in the dossier.

### Built

- **The ship shell.** The game opened straight into a running facility with a memo over it. It now
  opens on a **title**, drawn as a charter of appointment, with **options** and **provenance** beside
  it, and offers to resume a saved tenure rather than skipping the shell.
- **Provenance a player can actually read.** ATTRIBUTION has shipped inside the artifact since M1 as
  an HTML comment: present, and invisible to anyone playing. The cast pack is CC BY, and attribution
  under CC BY is a condition of use. The credits name the cast pack, its author and licence, the
  fonts and theirs, the score's credit, and the standing ban on generated art. A **drift guard**
  asserts every load-bearing fact also appears in ATTRIBUTION.md.
- **The three-tier rubric** (§7) defined, computed and tested, with the completion hook now reporting
  which tiers a tenure reached. Each tier is tested earned AND withheld.
- **KEEP #6, which was missing.** Fabrication was a designatable department that attracted artificers
  and had no mechanical effect at all. Now a production order gated on a standing workshop, two
  cycles of lead, producing a discrete work in a register, yield scaled by workshop quality.
- **Gate 8**, the soak, on the shipped artifact: **0 BLOCKER, 0 DEFECT, 1 FRICTION.**

### Five defects fixed, none of which the battery could see

The credits ran off the edge of the sheet into the ledger and were truncated before the
art-provenance statement (the guard test passed because it asserted a **guessed** 84-character
column; the real column measures 69). The title copy was hard-wrapped and then wrapped again, leaving
orphans, with its last paragraph under the controls — and once reflowed, the wrap floor silently
dropped the pitch's final sentence, the one that states the pacing law to a first-time player. The
Back control hung off the bottom of the paper. And a closed tenure was carried into the shell on
reload, so taking up the post would have entered an already-condemned facility.

Every one was found by rendering the surface and looking at it.

**Proof:** `docs/proofs/2026-08-14-M8/` — the shell frames, the soak findings, and the
**M8-ACCEPTANCE-DOSSIER**, which carries the genre-completeness audit against all ten KEEP items,
the QoL audit, the standing-gate table and the classified findings.

### For the operator to ratify

1. **THE LADDER DEFECT IS THE ONE THING THAT NEEDS YOU.** Two thirds of the game's defining mechanic
   never fires and two of three completion tiers cannot be earned. My recommendation, for you to
   accept or reject: lower the answer costs so the first instrument is affordable, raise pressure
   accrual so an officer arrives every 5-6 cycles, and soften the Cornerstone's loss rate so a
   competent facility reaches the Inspector around cycle 30-40.
2. **KEEP #6 was built at M8 rather than surfaced and left.** I judged a department that a player can
   designate, that attracts staff, and that does nothing to be a defect rather than a missing
   feature. If you would rather traps and doors worked differently, the shape is one file.
3. **The secret tier's officer-casualty clause is vacuous today**, because officers are not raid
   participants. It is written, tested and pinned rather than dropped from a ratified rubric.
4. **The game now opens on a title screen.** It is a change to the first thing anybody sees.
5. **Two FRICTION items left unfixed**, listed rather than silently accepted: an incident replay
   cannot be replayed once dismissed, and the orientation packet cannot be re-read after it is
   dismissed.
6. **A correction to the record:** the previous commit message said the battery went to 162; it went
   to 163. The count here (171) is the one that has been verified.

---

## 2026-08-14 — RAY'S EAR VERDICT: the score is RATIFIED. **M7b IS FULLY CLOSED.** (opus builder, Mac)

No build work in this entry. It closes the one gate M7b could not close itself.

> **Ray, verbatim: "MB tracks sound good, ship it to M8 or whatever is next - sounds great."**

**The score is RATIFIED as shipped in the listen set** (`docs/listen/2026-08-14-M7b/`): the
four-section lobby bed at 66 BPM, the closing cue in the parallel minor, the curdle as a live
parameter, the fluorescent pedal and the desk's own percussion. No retune was asked for.
DESIGN-SEED §10's "a score milestone ships a listen set for Ray's ear; it is not closed by the
builder" is satisfied. The builder is not to revisit the score's register, tempo, sourness curve or
instrument balance without Ray's word.

**M7b is therefore fully closed on all three axes:** art direction (ratified at r3, before the
milestone began), cast (ratified human; the seed's monster packs tombstoned as dead for cast
purposes), and score (ratified now, by ear, as shipped).

Battery unchanged at **140 pass / 0 fail**; no source touched.

**Next: M8, the last milestone the seed defines.** Per hard rule 5 the build stops there and
everything past it is operator-directed.

### For the operator to ratify

1. **I am reading "ship it to M8" as clearing the whole M7b ratify list, not only the score.** The
   other six items were the souring tracking the facility's standing condition rather than only
   raids, the bed playing under document overlays, the fixed fluorescent pedal that never follows
   the harmony, the overlay backdrop's new darkening, the desk's visible grain, and a set of
   structural notes. You saw and heard the result and said ship it, so they stand as built. If any
   was something you meant to come back to, say so and it is a small change.

---

## 2026-08-14 — M7b CLOSED: the full art pass and the score. **THE SCORE STOPPED FOR RAY'S EAR.** (opus builder, Mac)

**Milestone M7b — the full art pass plus the score — complete.** Battery: 111 -> **140 pass / 0
fail**. Committed across four increments. The art half is finished and verified. **The score half
is not closed by this run and cannot be**: DESIGN-SEED §10 says a score milestone ships a listen
set for Ray's ear and is not closed by the builder, so the listen set is the deliverable and Ray's
verdict is the gate.

### The listen set — the thing that needs Ray

**`docs/listen/2026-08-14-M7b/`** — five files, about twelve minutes, two full form cycles per
context, normalised to -16 LUFS, with **`WHAT-TO-LISTEN-FOR.md`** naming every section and its
harmony. Rendered through the game's own modules in a real browser's WebAudio, so it is the game's
sound and not a re-recording of something adjacent to it.

### The score

Register per §10: **lobby music for a building under siege.** Four sections, eight bars each, 66
BPM, about 1:58 a cycle:

- **A THE LOBBY** `Fmaj7 Dm7 Gm7 C7`, twice. The pleasant one.
- **B THE CORRIDOR** `Bbmaj7 Bbm6 Fmaj7 D7 | Gm7 C7 Am7 D7`. The major-to-minor-fourth sigh.
- **C THE MEZZANINE** a chromatic descending bass, G Gb F E Eb D Db C, landing on the dominant.
- **D THE HOLD** half the harmonic rhythm of everything else; the fluorescent pedal exposed.

Plus a closing cue in the parallel minor, three sections. Seven distinct sections across the two
tracks. Every section's roots move; every boundary cadences; per-pass variation (voicing, comping
placement, bass approach direction, stamp placement) means no two consecutive passes are identical.

**The curdle is a live parameter, not a second track**, per §10's "curdles rather than changes
genre". Every chord carries a sweet and a sour voicing and alters from the top down, so the same
band at the same tempo over the same roots goes wrong by degrees. It is driven by the facility's
standing condition rather than only by raids, so the lobby insists everything is fine slightly less
convincingly each cycle.

**Real harmonic movement was measured, not claimed.** A sibling game failed Ray's ear the same day
for being one chord with texture changes, and a builder cannot hear its own output.
`scripts/verify-harmony.mjs` extracts a chroma profile from every bar of the rendered audio and
matches it against the written chord and all eleven transpositions: **100% of bars in all three
renders**, root motion in 84% of bar changes over 10 distinct roots. The fully-curdled render keeps
root motion **identical** to the sweet one, which is §10's law measured rather than asserted.

### The art pass

The three surfaces M7a left outside the VACUUM SEALED stack are now inside it. **Nothing Ray
ratified at r3 was touched**, and the bottom status strip he declined a change to is untouched.

- **The desk is a material**, not a `fillRect`: pressed fibre board, grain, sideways fibre, and one
  lamp in screen coordinates shared with the sheet. Item 5 was true of each panel and false of the
  screen they shared.
- **The controls are objects**: composed with a bevel, a shadow, a dome, grain and dither. The
  bevel light is confined to the edges so the field under each label stays where the palette says.
- **The overlay backdrop was a live §4.5 item 2 violation** (`rgba(6,6,8,0.82)` painted over lit
  art) and is now a ramp-step selection: every pixel resolved to the ramp it is, and a lower step
  of that same ramp chosen.

### The bus and the desk's own sounds

Collection-contract **item 6 is closed structurally**: there is no AudioContext until a real gesture
reaches `unlock()`, so "no pre-gesture autoplay" is a state the game cannot leave rather than a
policy it follows, and one master gain carries the band and every effect so `mute(bool)` is one
assignment. SFX in register: **stamp, drawer, structural, pen, refused**, wired through a
presentation-only outbox on the view. A breach's structural failure fires at the END of the replay,
when the damage is on the sheet, not when the cycle is signed.

### Three defects found by verifying rather than by testing

1. **The chromatic descent was not descending.** The chroma analysis scored THE MEZZANINE at 100% —
   every pitch class in every bar exactly right — while the bass fell G, Gb, F, E and then leapt an
   octave UP to carry on "descending", because each root was snapped independently into a fixed
   one-octave window. Pitch-class correctness is not melodic correctness. Fixed by choosing every
   bar's octave ahead of time, voice-led. A second test then caught a further 8-semitone leap in the
   closing cue caused by a bass ceiling set below the note the line wanted.
2. **Gate 5 regressed, and the re-measurement caught it.** The composed desk reaches ink[2], and the
   incident-replay label drawn on it fell to **4.41:1**, under the floor. Fixed at the ground — the
   header band is now held quiet, where the same label measures **5.16:1** — rather than by relaxing
   the gate.
3. **The proof set was mislabelled.** The first capture took the pause and controls frames after the
   tenure had closed, so one showed TENURE CLOSED under a pause caption and the other showed a
   single button. Both images were fine, which is why it would have survived review.

**Verified:** all standing gates green; Gate 5 **re-measured** (18 pairings, worst 5.16:1, minimum
text 11px); harmony measured from the audio; and `scripts/probe-audio.mjs` taps the shipped
artifact's audio destination in a real browser and confirms silence and no context before any
gesture, rms 0.058 after one real click, rms 0.0000000 muted, the cycle not advancing while the
music plays, and a clean teardown on `quit()`.

**Proof:** `docs/proofs/2026-08-14-M7b/` — nine dated real-browser frames on the same seed and drive
as the ratified r3 set, the re-measured Gate 5 report, and a scored LOOK checklist.

### For the operator to ratify

1. **THE SCORE IS YOURS AND IT IS THE ONE THING HERE I CANNOT SCORE.** Play the listen set. I can
   prove the harmony moves, that the curdle keeps its roots, and that the game makes the sound; I
   cannot tell you whether it is pleasant, whether the deadpan lands, or whether it would irritate at
   minute twenty. Tempo, sourness depth and rate, the balance of any instrument, how often the
   typewriter fires, and which sections carry which voices are all single numbers in `src/score.js`.
   Say it in whatever words you like and it is a retune, not a rewrite.
2. **The music sours across a whole tenure, not just during raids.** §10 only asked the raid section
   to curdle. I made sourness track the facility's standing condition — Cornerstone damage, unanswered
   instruments, a grieving crew, an overdrawn treasury — because the register's joke is a lobby
   insisting everything is fine. If you want it to sour only during incidents, that is one line.
3. **The lobby bed plays under the pause surface, the checklist and the orientation packet.** They
   are documents laid on the desk, not another room, so the music does not cut. Only a closed tenure
   changes the track.
4. **A fixed low F drones under every chord and never moves to accommodate any of them.** It is the
   fluorescent hum, and it deliberately rubs against the chords furthest from F. If it reads as a
   wrong note rather than as a building, it should follow the harmony instead.
5. **The overlay backdrop changed how it darkens.** It used to be a grey wash; it is now each pixel
   stepped down its own ramp, so the manila behind a document stays manila and only gets darker. It
   is a visible change to a surface you have seen, listed for that reason.
6. **The desk now has visible texture.** It was flat black. If the grain reads as noise rather than
   as board, it is one number.
7. **Structural calls, listed for visibility, not for debate:** the port deleted the band kit's
   timer driver rather than exempting audio from the pacing law, so the scheduler rides the existing
   draw loop and no timer token exists outside `boot.js`; `state()` gained a read-only `audio`
   status for the Gate harness; the sound outbox lives on the view alongside `lastActionNote`, which
   keeps `audio.js` out of `view.js` and `input.js` entirely; and the raid track is not a separate
   track because an incident replay lasts about two seconds and crossfading a piece of music for two
   seconds is a stutter, not a cue.

---

## 2026-08-14 — RAY'S VERDICT: M7a RATIFIED, the human cast RATIFIED, M7b cleared (opus builder, Mac)

No build work in this entry. It records the operator's decision so that the record, and not a
session's memory, is what later lanes read.

> **Ray, verbatim: "MB is good for M7b, keep the human cast."**

**1. The M7a art direction is RATIFIED as it stands at r3.** The VACUUM SEALED render, the desk as
one picture, the manila sheet with the ledger in ink, the typeset ledger with its reserved report
zone, the Not Jam Slab Serif 11 / Serif 11 pairing, and the legend and title strips printed on
manila. M7b builds on that staging; it does not revisit it. The type-register law (design codex
2.101) is **closed** for this game on the argument recorded in the r2 entry below.

**The bottom status strip stays as it is.** Ray was offered a change to it and declined.

**2. THE HUMAN CAST IS RATIFIED, and the register question the M7a entry raised is now answered.**
The game's register is officially **drab-versus-armed**, not monster-versus-human. The facility's
own people are institutional personnel drawn from its materials; the raiders arrive lit
differently and armed. This closes ratify item 1 of the M7a CLOSED entry below, which asked the
question and said plainly that the answer was Ray's.

**3. The seed's monster packs are SUPERSEDED AS CAST, and marked dead in the repo.**
`DESIGN-SEED.md` §4.4 names `Dark-Fantasy-Enemies`, `Mythic-Monsters-I`/`II` and `Enemy_Galore_*`
as staff cast sources. That text is struck. Those packs are not the cast source for this game and
must not be introduced into it in any role, and they are separately disqualified on technique
(64x64 native against a 14-26px cell means downscaling pixel art, which breaks §4.5 item 1). The
whole cast is one pack, one scale, one idiom, one licence. Recorded so that no later lane reads
the seed's monster language and builds monsters from it: per `supersession-means-deletion`, a
superseded decision that leaves its old text readable will eventually be acted on.

Landed as `docs/DIRECTIONS-2026-08-14-m7b-cast-and-art-ratified.md`, which also carries the M7b
score bar: House Band conventions, the Song-Structure Law at the sharpened bar, and a new binding
requirement for **real harmonic movement** (moving roots and cadences, not one chord with texture
changes) after a sibling game failed Ray's ear on exactly that the same day.

Battery unchanged at **111 pass / 0 fail**; no source touched.

### For the operator to ratify

1. **The monster packs are now marked dead for cast purposes, not merely unused.** If you ever want
   a monstrous element in this game, it needs your word to reopen: the tombstone is deliberately
   written to stop a future lane from doing it on its own initiative.

---

## 2026-08-14 — M7a r3: the legend zone, made legible. **STOPS FOR RAY'S M7b GO CALL.** (opus builder, Mac)

Ray on r2: *"MB looks nice now"* — direction accepted, with one nit: *"the center log text underneath
the map may need to be something else to be a little more legible."* Presentation only; battery
**111 pass / 0 fail**; nothing else touched.

**The fix: the title block and the status strip are now PRINTED ON MANILA, like the ledger.** They
were a light bone serif on near-black. That cleared the contrast floor at 8.6:1 and was still the
hardest text on the screen, because a thin light letterform sits directly on the section's own hatch
and grain and the texture competes with the glyph at every stroke. **A contrast ratio measures two
flat colours; it cannot see a busy ground.** Ink on paper quiets the ground, matches the ledger's
polarity so the eye stops flipping between light-on-dark and dark-on-light inside one picture, and
is what the object actually is: a drawing's title block is a printed panel on the sheet, not a
caption floating over the drawing.

Also: the title block grew from 27px to 38px so its two lines have real leading instead of being set
solid; the legend's terms are separated by middots rather than full stops, because it is a key and
not a sentence; and the action-bar buttons moved up 3px to give the status strip its own band.

**Proof:** `docs/proofs/2026-08-14-M7a-r3/01-legend-and-status-strips-on-manila.png`.

### For the operator to ratify

1. **The two strips changed polarity**, so the desk is now light-on-dark only in the section's
   header. If you preferred the legend dark and recessive, that is the trade: it was recessive
   because it was hard to read.
2. **Gate 5 needed no new measurement.** The strips use ink on paper, a pairing already in the
   measured list at 8.59:1, replacing the 8.60:1 flat-colour figure that was hiding the real
   problem.

---

## 2026-08-14 — M7a r2: REVISE ROUND on the PoC. **THE BUILD STOPS AGAIN FOR RAY.** (opus builder, Mac)

Ray's verdict on r1: *"decent so far but a little crowded/small, log could be better formatted,
otherwise decent, better fonts could be used too, some in that font pack would be appropriate."*
A revise round, not M7b clearance. Battery: 110 -> **111 pass / 0 fail** (Gate 2 now runs here).
Render layer only: no simulation or engine behaviour changed, and **the cast is untouched**, because
the staff-species question is still Ray's open item.

**1. Crowded and small.** The section camera now FRAMES the built facility (`layout.sectionFocus`)
rather than drawing the whole 24x16 grid at a fixed 14px cell. The cell floats between 14 and 26px;
in these proofs it sits at 22px, so the building and its cast are more than half again their r1
size, and the field of dark rock that made a small facility read as crowded and lost at the same
time is gone. The gutter between drawing and sheet went from 4px to 6px, the sheet gained a real
13px margin, and the action bar distributes width by weight so the tool button carries its full
label. **A defect this exposed and fixed:** during an incident the camera also frames the raiders'
approach, because the first r2 captures showed a raider sliced in half by the panel edge as he
walked in from off-sheet.

**2. The log.** The ledger is typeset instead of printed out: a slab heading over a double rule,
label/value rows with leader dots and right-aligned figures, a STANDING block when an officer is in
attendance, and an AFTER-ACTION REPORT zone with its own heading whose space is **reserved**. The
statement now yields to the report rather than pushing it off the bottom of the sheet, which is the
right way round, because the report is the game. Leading, rules and section spacing are one scale in
`type.js`. The pre-commit checklist and the closing report are set the same way.

**3. Fonts.** **Not Jam Slab Serif 11** (display) and **Not Jam Serif 11** (body), CC0, from the Not
Jam Font Pack, embedded as base64 `@font-face` so a `file://` double-click needs no network. The
licence text now ships appended to ATTRIBUTION inside the artifact, and a missing licence file fails
the build rather than shipping quietly.

> **The register argument, in one sentence:** the sheet is a pre-printed institutional form, so the
> type is a pair rather than a face, a letterpress slab for the headings that were printed at the
> stationer's before anything happened and a book serif for everything entered onto the form
> afterwards by whoever was on shift.

Rejected on the record: the pack's four monospaces are all full-width (one em per glyph), giving 34
columns in the ledger, too few to carry the report's prose; `Mono Old Peculiar` also renders R
nearly identically to B at 11px, which the LEGIBILITY LAW does not allow in a document;
`Old Style 11` was the runner-up and lost on its old-style figures, which are handsome and wrong for
a game whose instruments must never be misread.

The **type-register law** (DIRECTIONS addendum, design codex 2.101) landed at the harvest boundary
while this round was in flight and binds the pick. Both its checks are met: right class for the
register (jobbing/bureau printed-document, not a game-UI or terminal face) and distinctive within
the class (a pair with a stated division of labour, replacing the platform `Courier New` that was
the habitual default). The addendum names M7b as the milestone that picks; Ray's r2 instruction
moved it here, so the argument is stated now for his verdict with the art.

**Gate 5 re-measured:** minimum text size RISES from 8px to 11px, because both faces are cut at 11px
and nothing is drawn off their design size. Worst drawn contrast pairing is unchanged at 5.19:1
against the 4.5:1 floor (the palette did not change). Gate 6 still clears 95% despite the wider
gutter. **Gate 2 now reads the live camera from the running game**: recomputing a fixed geometry in
the harness would have clicked a different cell than the one under the player's cursor, so the gate
would have been testing a fiction.

**Proof:** `docs/proofs/2026-08-14-M7a-r2/` — the same seven surfaces, same seed, same drive, plus a
scored r2 LOOK checklist.

### For the operator to ratify (r2 additions; r1's list below still stands)

1. **The camera pulls back during an incident.** Showing a raiding party's whole approach means
   framing rock outside the facility, so the section zooms out for the replay and returns after it.
   It is deliberate, and it is the only way to watch an incident without figures walking in from off
   the edge, but it is a visible camera move and you may not want one.
2. **The ledger drops rows when the sheet is full.** Six figures are always shown (treasury,
   defence, posts, amenities, morale, Cornerstone) and a served instrument always gets its block;
   departments, the floor census, open posts, claims backlog and detention are drawn only while
   there is room above the reserved report zone. Every droppable row is a figure the drawing or a
   hover already tells you. If you would rather always see all of them, the report zone shrinks
   instead, and that is your call.
3. **Type is 11px everywhere, up from 8-10px.** Bigger and more legible, but it fits fewer words per
   line, which is why the intel memo moved off the ledger and into the pre-commit checklist, where
   it was already printed.
4. **The floor census moved from the drawing's legend to the ledger** ("On the floors: 7 staff,
   0 raiders, 1 officer"). It is a figure, and figures belong on the sheet; it also declutters the
   title block. Structural, listed for visibility.

---

## 2026-08-14 — M7a CLOSED: the ART PoC. **THE BUILD STOPS HERE FOR RAY'S VERDICT.** (opus builder, Mac)

**Milestone M7a — the art proof of concept — complete.** Battery: 98 -> **110 pass / 0 fail**.
Committed across four increments. **M7b has not been started and will not be until Ray gives an
art-direction verdict** (hard rule 5). The score, the SFX and the audio bus are all M7b and are
untouched.

### What it looks like now

The screen is one picture: a drawing board with an architectural section of the facility on the
left and a sheet of aged manila on the right with the ledger written on it in ink. Overlays are
documents laid on the desk rather than dialog boxes. Everything on screen draws from one curated
palette.

**Built:**

- **`src/palette.js`** — the curated palette as ten named ramps that run dark to light (rock,
  stone, plaster, paper, ink, brass, rust, verdigris, stamp, bone), plus every colour the game
  draws named as a step of one of them. A test fails the build if any colour is off-palette or any
  ramp stops running dark to light.
- **`src/noise.js`** — the 8x8 Bayer ordered dither, a seeded value-noise/fbm lattice (never
  `Math.random`; the determinism law binds render source too), and light as a scalar that selects a
  ramp step rather than a gradient painted over finished art.
- **`src/scene.js`** — the section, composed pixel by pixel at native resolution. Materials pick a
  ramp, light picks the step, fbm gives the surface its grain, and the structure is CUT INTO the
  light: chamber back walls stay low on their ramp while the floor slabs, ceilings and wall cuts
  are the bright lines. That is the difference between a section drawing and a tile map. Rock is
  hatched, stratified in beds and darkens with depth, so the building sits in ground. Each
  department is a lamp whose intensity is its quality, which makes DIRECTIONS fold 7 ("quality
  reads as ramp-step density") literally true. Composition is cached against a scene signature, so
  the animation frame stays a draw and the pacing law is untouched.
- **The cast, copied in under CC BY.** Eight figures from **NPC Pack — Human Empires (Willibab /
  Monsteretrope, CC BY 4.0)**: drudge, clerk, artificer, warden, two raiders, two escalation
  officers. Originals unmodified at `assets/cast/source/`, one `ATTRIBUTION.md` row each, and
  ATTRIBUTION ships inside `dist/index.html`. **No placeholder art survives this milestone.**
- **`scripts/prepare-cast.mjs`** — decodes the sheets with `node:zlib` (zero dependencies), slices
  them on the real RPG-Maker character grid, and writes `src/cast-data.js` as per-pixel RAMP-STEP
  OFFSETS rather than colours. A figure therefore selects its steps at the light level of the tile
  it stands on: the cast is lit by the scene instead of pasted over it.
- **`scripts/capture-proof-m7a.mjs`** — drives the shipped `file://` artifact in a real browser
  with real mouse and real keys, carving a facility and signing cycles until there are five
  departments, a crew at posts, a served instrument and an incident replay. The scene in the proof
  is earned, not staged.

**Verified:** all standing gates re-run green, and Gate 5 was **re-measured** rather than inherited,
because the art pass replaced every colour on screen. Worst drawn text pairing is now 5.19:1
against a 4.5:1 floor, and the gate now measures the pairings the renderer actually draws
(`TEXT_PAIRS`) instead of a guessed matrix, which is stricter: the old form could not see
ink-on-paper at all, because before this pass there was no paper.

**Proof:** `docs/proofs/2026-08-14-M7a/` — seven dated real-browser frames, the re-measured
legibility report, and a scored LOOK checklist.

### Five defects the battery could not see, found by looking at the captures

Every one of these passed 110 green tests. They were caught by rendering the frames and looking at
them, which is the whole reason the LOOK checklist exists.

1. The cast rendered as **featureless blobs**: figures were lifted by the full lighting range,
   which pushed all four of their steps into the top of their ramp and flattened the modelling.
2. The cast **disappeared into pale rooms**. A clerk drawn from the paper ramp, standing in a
   Records department drawn from the paper ramp, is invisible.
3. **The pre-commit checklist's own confirm buttons were drawn UNDER the overlay sheet.** The
   player could not see "Sign the cycle over" at the moment of being asked to sign the cycle over.
4. **Text ran off three separate panels**: report lines past the bottom of the paper, the section
   legend past the cutaway edge, and the tool button's label across its neighbour.
5. **The incident replay's skip button covered the title block**, hiding the legend beneath it.

### For the operator to ratify

1. **THE STAFF CAST IS HUMAN, NOT MONSTROUS. This is the one big design-axis call in this
   milestone and it is yours.** DESIGN-SEED §4.4 named the monster packs for the staff. Those packs
   are on the machine and I measured them: `Enemy_Galore_*` and `Mythic-Monsters-I`/`II` are 64x64
   at native scale, and the cutaway's cell is **14px**. Fitting them means downscaling pixel art,
   which destroys it and breaks §4.5 item 1 outright. `NPC Pack — Human Empires` is 16x20 native,
   which stands on a 14px cell the way a scale figure stands in a real section drawing. So the
   whole cast is one pack, one scale, one idiom, one licence.
   **The consequence is a register change.** The staff now read as institutional personnel rather
   than as monsters, and the contrast that carries the joke shifts from monster-versus-human to
   **drab-versus-armed**: the building's own people are drawn from its materials, and the raiders
   arrive lit differently. My honest view is that this is the funnier and more coherent register
   for a game about a dungeon that files incident reports, but it is your call, not mine. If you
   want monstrous staff the routes are a larger cutaway cell (a layout change) or a 16px monster
   pack (an acquisition). Recorded in full at `docs/ASSET-MANIFEST.md` §4.1.
2. **The ledger became a sheet of aged paper with dark ink on it.** M6's ledger was a dark panel
   with light text. Making it paper is what turns two widgets into one picture of a desk, and it
   suits a game made of documents, but it is a large visual change and it is a taste call.
3. **Single-letter department tags were removed.** The cutaway used to stamp T / R / F / H / Q / C
   on department cells. That is exactly the "sigil a first-session player would have to ask about"
   the LEGIBILITY LAW forbids, so departments now read from their outline, their ramp and the named
   ledger row, and hovering any cell prints a plain-language read. If you want the letters back,
   they would need a legend that names each one.
4. **The cast is recoloured into the game's ramps, not shown in its original colours.** §4.5 item 4
   requires one palette, and a bright orange-haired villager pasted onto a lit section is a decal.
   CC BY permits adaptation and the originals are preserved. It does mean the packs' own colour
   identity is gone, which is a real loss if you liked it.
5. **Six escalation officers were sketched, two shipped.** Rungs 1 and 3 send a cowled figure, rung
   2 sends a coated inspector. A third distinct silhouette per rung is easy in M7b if you want the
   Auditor visually separate from the Inspector.
6. **Structural calls, listed for visibility, not for debate:** the section gained a header strip
   and a title block (a section drawing has one, and it guarantees the legend's contrast whatever
   the drawing behind it is doing); figure light gain is deliberately smaller than wall light gain,
   because a figure has four steps of modelling and a wall has seven; the per-pixel composition is
   cached against a scene signature so the render loop stays cheap; and the boot smoke test's stub
   canvas gained a real `createImageData`, since the renderer now hands the canvas a pixel buffer.

---

## 2026-08-14 — M7a REACHED: HARD STOP FOR RAY + asset BLOCKER (opus builder)

> **SUPERSEDED the same day by the M7a CLOSED entry above.** The blocker below was real but
> LOCAL: that run was on home-PC, where the licensed libraries do not exist. They are present on
> the Mac, the PoC was built there, and the cast is copied in with attribution. Nothing in this
> entry is still outstanding. Kept for the record, not for action.

**The autonomous build has reached its correct terminus.** M0 through M6 are complete, green
(98 tests), committed and pushed, with dated real-browser proofs at each milestone. The next
milestone, **M7a, is a HARD STOP for the operator's eyes** (hard rule 5), and it is additionally
**BLOCKED** by a missing dependency. I am stopping here rather than violate a hard rule.

**Why the builder stops and does not produce the M7a PoC autonomously:**

1. **M7a is a mandated stop-for-Ray gate.** Hard rule 5: "M7a is a HARD STOP for Ray's eyes: produce
   the art PoC, commit dated proof screenshots, and stop. Proceeding to M7b without Ray's verdict is
   a hard rule violation." The art direction is a design-axis call, which is Ray's (hard rule 9).
2. **The cast figures cannot be sourced.** Hard rule 1 (ART LAW) requires the cast to be **licensed
   pack art** copied in from `~/Desktop/Dev Work/pixel-art-library/extracted/` and
   `~/Desktop/Dev Work/asset-library/`. **Both directories are absent on this machine** (the whole
   `~/Desktop/Dev Work` tree does not exist here). A broad search found none of the named packs.
3. **The two escape hatches are both forbidden.** LLM-image-generated art is **banned outright**
   (hard rule 1, would close the paid door). Placeholder art that survives its milestone is a
   **BLOCKER** (hard rule 1). So there is no hard-rule-compliant way to place the cast for the PoC
   without the asset libraries.
4. Hard rule 12 forbids touching anything outside this repo, and the assets are outside it and
   absent regardless.

**What is ready for M7a the moment the blocker clears:** the facility is code-drawn and does not
depend on the packs; the §4.5 VACUUM SEALED technique stack (native-res software rendering,
lighting-as-compositing, dither + fbm, a single curated palette in named ramps, scenes composed as
single pictures) can be built against the current legible cutaway. `ASSET-MANIFEST.md` names the
intended packs and roles; `ATTRIBUTION.md` is scaffolded to receive the rows.

### For the operator to decide (M7a cannot proceed without this)

1. **Make the licensed asset libraries available on this machine** (restore
   `~/Desktop/Dev Work/pixel-art-library/extracted/` and `~/Desktop/Dev Work/asset-library/`, or
   point the builder at their location), so the cast figures can be copied in with a manifest and
   attribution. Until then M7a's "cast figures placed" requirement cannot be met.
2. **Ray's art-direction verdict is required at M7a regardless of the assets.** The VACUUM SEALED
   facility render and the chosen palette/lighting are yours to ratify before M7b. Say the word and
   the builder produces the facility-layer PoC (code-drawn only, no cast) for your eyes as a first
   look, or waits for the assets to do the full scene.

**No M7a code was written and nothing was staged; the build stands green at M6.** Proceeding to
produce or fake the PoC, generate art, or ship placeholder cast would each violate a hard rule.

---

## 2026-08-14 — M6 CLOSED (opus builder, continuing per operator goal-loop)

**Milestone M6 — the register + interface pass — complete.** Battery: 91 -> **98 pass / 0 fail**.
Committed and pushed across two increments.

**Built:**

- **The register pass** (`test/register.test.js`): a mechanical lint over every player-facing string
  (all report lines across varied tenures, the orientation packet, officer/instrument/tool labels,
  and every action-bar and overlay button label) for em-dashes, exclamation marks, curly quotes,
  empty prose, and the numeric-neighbour law. Fixed two curly apostrophes and the debug-log export
  em-dash. The "darkly funny / in-voice" half stays human-judged at the LOOK.
- **Gate 5, measured** (`test/gate5-legibility.test.js`, `docs/proofs/2026-08-14-M6/GATE5-*`):
  minimum text size 8px in the native buffer (floor held); WCAG contrast measured for every readable
  colour on every panel it sits on and asserted >= 4.5:1; dwell unbounded (the untimed admin phase).
  The one change: **secondary text lifted from #7a7a8c (4.27:1) to #8a8a9a (5.29:1)** to clear the
  floor.
- **Interface confirmation**: Gate 4 re-confirmed (every outcome-altering change surfaces in the
  ledger/report and is tested); the desk reads cleanly at the measured contrast.

**Verified:** Gates 1-7 all standing (Gate 5 now measured), plus the register lint and every prior
standing gate. **Proof:** `docs/proofs/2026-08-14-M6/` holds the measured legibility report, a scored
LOOK checklist, and representative screenshots of the polished desk. Before: 91 pass. After: 98 pass.

### For the operator to ratify

1. **The register lint is mechanical only.** It enforces the bright-line rules (no em-dash /
   exclamation / curly quote, numeric neighbour present). Whether the prose is *darkly funny* and
   sufficiently deadpan is your ear, at the LOOK; the lint cannot judge it.
2. **Secondary text colour was lifted** (#7a7a8c -> #8a8a9a) purely to clear the WCAG 4.5:1 floor.
   If you preferred the dimmer prose for mood, say so; it was a measured legibility call.
3. **M7a is the next milestone and a HARD STOP for your eyes.** Per hard rule 5, the builder produces
   the art PoC (one fully-rendered cutaway scene under the VACUUM SEALED stack with cast figures),
   commits dated proof screenshots, and STOPS for your verdict before any further art work.

---

## 2026-08-14 — M5 CLOSED (opus builder, continuing per operator goal-loop)

**Milestone M5 — capital, consequences, and the bureaucratic ladder — complete.** Battery: 78 ->
**91 pass / 0 fail**. This is the game's defining mechanic. Committed and pushed across four
increments.

**Built:**

- **The escalation ladder as paperwork** (`src/ladder.js`): a Royal Surveyor, then a Guild Auditor,
  then a Licensing Inspector serve a schedule of dilapidations / tax lien / condemnation order, each
  with a deadline stamped on the notice (fold 10), answered administratively for gold. Escalation
  advances on unresolved findings and missed deadlines, never on elapsed time (fold 13). Three clean
  cycles soften the rung one step (the comeback lever / local dominance plateau). **Killing the
  officer never withdraws the notice** (fold 17b, tested).
- **Damage and repair** (`actions.queueRepair`): a breaching raid lowers the Cornerstone; a repair
  works order restores its condition over a lead time.
- **Detention -> conversion** (KEEP #9): repelled raiders are captured into Holding (one free
  founding cell, fold 14; more from a Holding department) and convert into working staff over cycles.
- **Insolvency, made reachable and thematic**: payday and orders can never overspend, so the treasury
  could never go negative; an ignored **tax lien now seizes funds into the red**, which is the one
  path to insolvency. Each instrument's lapse consequence fits it (dilapidations -> structure,
  lien -> funds, condemnation -> terminal).
- **The closing score** (`model.scoreOf`, Ray-ratified: tenure + solvency, no win screen) filed at
  termination. The **claims backlog** (carved ground awaiting claim) is reported and shown.
- **The ladder UI**: the ledger shows the standing officer, served instruments with cycles-remaining
  stamps and answer costs, and detention; a contextual Answer button joins the action-bar row.
- **Fixed a key conflict**: a letter naming an active button now fires the button before the WASD pan
  claims it, so A = Answer is not eaten by pan-left.

**Verified:** all standing gates plus fold 17b (officer/notice), fold 17a (report-consequence), and
fold 19 (cross-state save/load: rung x solvency x reload preserves deadlines/rung/score). **Proof:**
`docs/proofs/2026-08-14-M5/` holds two dated screenshots (instrument served with its deadline stamp;
instrument answered administratively) and a scored LOOK checklist. Before: 78 pass. After: 91 pass.

### For the operator to ratify

1. **Insolvency is reached only through an ignored tax lien.** Ordinary play cannot drive the
   treasury negative (payday pays only what it can afford; orders are affordability-gated), so
   without the lien seizure insolvency would be unreachable despite your ratification that a run ends
   at insolvency. The lien seizure (120g, can go negative) is the mechanism. Retunable; the shape
   (insolvency is reachable and ties to the Auditor) is the fix.
2. **Escalation numbers (retunable):** an officer is dispatched at 3 accrued findings; deadlines
   4/4/3 cycles (Surveyor/Auditor/Inspector); answer costs 60/120/200g; a lapsed schedule costs 20
   Cornerstone condition; three clean cycles soften the rung.
3. **The "secret" completion is wired** (answering a condemnation order marks it withdrawn and sets
   `ladder.condemnationWithdrawn`); the three-tier rubric is verified at M8, not here.

---

## 2026-08-14 — M4 CLOSED + LEGIBILITY LAW applied (opus builder, continuing per operator goal-loop)

**Milestone M4 — the raid resolver and the after-action report — complete.** Battery: 70 ->
**78 pass / 0 fail**. Committed and pushed across four increments. Mid-milestone, merged the
operator's DIRECTIONS addendum **THE LEGIBILITY LAW** and applied it.

**Built:**

- **The raid resolver as a party with an approach** (`src/raid.js`): a party (size, objective,
  credentials) enters at a section edge and approaches the Cornerstone along a Bresenham path;
  the engagement auto-resolves deterministically; a step-log records attrition per step. The tuned
  threat/defence outcome is preserved, so Gate 3 and raid-variance are unchanged. Credentialed
  officers (the bureaucratic ladder) arrive at M5; the shape is here.
- **The per-cycle intel memo** (fold 2): `intelMemo` previews the coming raid vaguely (a size
  range), deterministically matching what the sign-over resolves; wired into the pre-commit
  checklist and the ADMIN ledger.
- **The watchable, skippable raid replay** (fold 4): after signing over, the party head crosses the
  section toward the Cornerstone along the step-log, with a trail and a strength readout. RAF
  advances the replay cursor only, never the sim; it auto-dismisses after a dwell and is skippable.
- **The after-action report as a designed artifact** (fold 8/9): ledger-first, each line an exact
  numeric with in-voice prose beneath and a cited cause. `consequences.test.js` proves every line
  kind drives a real state change (fold 17a: a line with no consequence is a defect).
- **THE LEGIBILITY LAW** (operator addendum, binding): every cutaway cell reads in plain language on
  hover; a persistent legend names the grammar; the ledger names each department letter; a
  mechanical lint asserts every after-action number is labelled and every cell has a plain read.

**Verified:** Gates 1/2/3/4/6/7 plus raid-variance, flavour-pairing, the legibility-law lint and the
report-consequence law stand green. **Proof:** `docs/proofs/2026-08-14-M4/` holds three dated
screenshots (intel memo + legend + hover label; the raid replay as movement; the designed report)
and a scored LOOK checklist. Before: 70 pass. After: 78 pass.

### For the operator to ratify

1. **The raid replay auto-dismisses after a short dwell** rather than requiring a click every cycle,
   to keep a 20-cycle tenure from becoming click-heavy. It remains skippable and does not advance
   the sim (presentation only). If you would rather the player always click to continue, say so.
2. **Credentials are stubbed false at M4.** The party carries an `objective` ('loot') and a
   `credentials` flag; the credentialed officers and their served instruments are M5. Flagged so the
   party model reads as intentionally incomplete, not missing.
3. **The LEGIBILITY LAW was applied to the existing M2-M4 UI immediately** on merging the addendum,
   rather than deferred to the M6 interface pass, because the addendum says it binds from founding.
   The M6 pass will still measure the legibility floor (Gate 5) with numbers.

---

## 2026-08-14 — M3 CLOSED (opus builder, continuing per operator goal-loop)

**Milestone M3 — staff — complete.** Battery: 63 -> **70 pass / 0 fail**. Committed and pushed
across three increments.

**Built:**

- **Rooms attract applicants** (`src/staff.js`, KEEP #3): productive departments open posts by size
  (Records -> clerk, Fabrication -> artificer, Holding -> warden, Excavation -> drudge); Quarters
  house and Commissary feeds; applicants report on their own up to open posts and free beds. Never a
  roster pick, and never a hire button. Proven: two clerks reported to a two-tile Records.
- **Needs, morale, separations** (`staff.runNeeds`): food and rest decay each cycle; amenities
  replenish worst-first up to capacity; morale follows needs, deferred pay and archetype
  temperament; low morale files grievances and, at the floor, separates staff by resignation or
  defection. The skeleton-crew floor holds the count from collapsing to zero (fold 11).
- **Archetype identity** (fold 3, `ARCHETYPE_TRAITS`): clerks and artificers are wage-sensitive and
  hazard-averse; drudges and wardens are inured. Defectors strengthen later raids (they leave with
  the section drawing), tying the staff model back into the raid.
- **The staff ledger**: crew standing/grieving, amenities housed/fed with over-capacity flagged,
  average morale, open posts and defectors, so the whole caste is legible (Gate 4).

**Verified:** the degenerate probe still holds (a facility that designates no departments attracts no
staff and still falls to the Cornerstone). `staff.test.js` proves attraction and the housing cap;
`needs.test.js` proves neglect drives grievances and separations, the archetype-temperament
difference, and the defector-strengthens-the-raid tie. **Proof:** `docs/proofs/2026-08-14-M3/` holds
three real-mouse screenshots and a scored LOOK checklist. Before: 63 pass. After: 70 pass.

### For the operator to ratify

1. **M3 numeric choices (retunable, shapes are law):** one post per 2 department tiles; 2 beds per
   Quarters tile and 2 covers per Commissary tile over a base of 4 each (the inherited crew is
   housed and fed on the founding footprint); need decay 14/cycle, replenish 22; morale grievance
   threshold 30, separation floor 15; applicant chance 0.6 per open, housed post per cycle.
2. **Defection is modelled as a raid-threat increment**, not a raider added to the resolver. When
   the M4 raid resolver lands, a defector should become an actual party member with the layout
   known; for M3 it is a threat bonus so the consequence is real and legible now. Flagged as a
   structural placeholder to revisit at M4.
3. **Separation consolidated onto morale**, removing M1's payday-only quit roll. Deferred pay still
   drives separation, now through its morale penalty (heavier for wage-sensitive archetypes). One
   place governs who leaves. Structural call.

---

## 2026-08-14 — M2 CLOSED (opus builder, continuing per operator goal-loop)

**Milestone M2 — the dungeon grid — complete.** Battery: 48 -> **63 pass / 0 fail** (the Gate 2
real-mouse-event test runs, not skipped). Committed and pushed across five increments.

**Built:**

- **Excavation from rock** (`src/grid.js`, `actions.queueExcavate`): a cell is carved only if it
  touches claimed ground (CARVED, not placed, KEEP #1). An excavate works order has a lead time; on
  completion the cell is excavated, surveyed and becomes claimable floor. A gold seam is revealed.
- **Territory claiming and spread**: claimed ground spreads one ring per cycle into carved floor
  (KEEP #7). Claimed, worked gold seams pay receipts and lapse the founding stipend (fold 11).
- **Departments with size-driven quality** (`src/rooms.js`, `actions.designate`): a room is a
  contiguous run of claimed floor designated to one of seven departments; `computeRooms` groups them
  with size and `roomQuality`; a Treasury's tiles set the gold ceiling (KEEP #2 made mechanical).
- **Pointer input for the grid**: a shared cutaway geometry (`layout.cutawayGeometry`/`cellAtPoint`)
  so render and input agree; a grid-click tool (excavate / designate a department / clear) cycled by
  button or `T`; hover highlights legal targets; queued cells show a ghost outline.
- **Cutaway visual grammar** (fold 7): department tint and letter tag, outline weight reads room
  size; the ledger lists departments with size and quality; the desk panels fill ~97% of the buffer.

**Verified:** Gate 2 (Playwright real mouse click against the built `dist/index.html` queues an
excavation), Gate 4 (action-legibility: a queued order is visible immediately; every outcome-altering
event emits an after-action line), and Gate 6 (screen-fill >= 95%, geometric) now stand green,
alongside Gates 1/3/7 and the raid-variance and flavour-pairing gates. **Proof:**
`docs/proofs/2026-08-14-M2/` holds five dated screenshots captured with a real mouse plus a scored
LOOK checklist. Before: 48 pass. After: 63 pass.

### For the operator to ratify

1. **M2 numeric choices (retunable, shapes are law):** excavate order costs 15g on a 1-cycle lead;
   claim spreads 1 ring/cycle; a worked gold seam pays 8g/cycle and lapses the stipend; gold-seam
   rate 6% of rock. These make excavation a real economic lever without a win condition existing yet.
2. **Departments beyond Treasury have no mechanical effect until M3.** Records/Fabrication/Holding/
   Quarters/Commissary can be designated and are drawn with size-driven quality, but their effects
   (staff attraction, research, detention, needs) land with the staff and raid milestones. The
   Treasury's capacity effect is wired now because it is KEEP #2's clearest expression.
3. **The grid-click tool model** (one tool selects what a click does) is a structural UX call. The
   alternative was separate modes per action; the single cycling tool keeps the desk pointer-first
   and uncluttered. Retunable at the M6 interface pass.

---

## 2026-08-14 — M1 CLOSED (opus builder)

**Milestone M1 — the cycle spine — complete.** Battery: 26 -> **48 pass / 0 fail**. The loop is
playable-if-ugly end to end on placeholder content, and the built `dist/index.html` boots from a
`file://` double-click with zero external fetches. Committed and pushed at every green state across
four increments.

**Built:**

- **The sim, end to end** (`src/sim.js`, wired into `commitCycle`): ADMIN -> COMMIT (stipend income,
  works orders tick down and complete) -> RAID (threat vs defence, cycle-1 scripted orientation
  raid, fold 5) -> REPORT (payday every 3 cycles, grievances at 2 missed, quit rolls at 3 respecting
  the skeleton-crew floor, the loss check). Every report line pairs an exact numeric half with an
  in-voice prose half (fold 20), no em-dashes, no exclamation marks, no outcome narrated as a win.
- **The operator's levers** (`src/actions.js`): raise / cancel a fortification works order during
  the untimed ADMIN phase. These edit the plan; they never advance the sim.
- **Loud-failure debug log** (`src/debuglog.js`): bounded, exportable, and `surface()` records-then-
  rethrows so nothing is swallowed (Gate 7).
- **Namespaced persistence** (`src/persistence.js`): save / load / clear under `material-breach:`
  keys, surviving storage being unavailable or hostile without throwing into game logic (item 2).
- **The presentation layer** (`layout`, `render`, `input`, `view`, `boot`): the code-drawn
  architectural cutaway (surveyed cells only, fold 1) with the Cornerstone's rising pulse (fold 4),
  the ledger with the after-action report, the action bar. Pointer-primary with a full keyboard
  mirror; `Esc` always reaches the pause surface; integer/letterbox 640x360 scaling (item 8).
- **The single-file build** (`scripts/build-singlefile.mjs`): a small module-registry bundler ->
  `dist/index.html`, ATTRIBUTION shipped in-build, zero external fetches (item 1).
- **Collection-contract items 1,2,3,4,5,7,8 wired**: single-file artifact; namespaced persistence;
  `window.__GAME` host surface with a clean `quit()`; quit-to-shell slot shown only when a shell
  exists; the input baseline; the `window.__SHELL.report` completion hook; the fixed buffer.
- **The orientation packet** (fold 5) and the **pre-commit checklist** (fold 6, the second confirm).

**Verified:** Gate 1 (pacing) and the determinism gate now scan the presentation source too; Gate 3
(zero input falls by cycle 7, fortify spam by 15) and Gate 7 (loud failures) stand green; the raid-
variance gate (fold 16) and the flavour-pairing gate (fold 20) stand green. A boot smoke test builds
from HEAD, runs the bundle in a stubbed DOM, and asserts the `__GAME` API plus one render frame.
**Proof:** `docs/proofs/2026-08-14-M1/` holds seven dated screenshots captured from the `file://`
artifact with real keyboard and a real mouse click, plus a scored LOOK checklist. Before: 26 pass.
After: 48 pass.

### For the operator to ratify

1. **M1 placeholder content is deliberately thin and will be replaced.** The economy is: an inherited
   4-post night shift, a single fortification lever, a threat that climbs each cycle, and two loss
   states (condemnation, insolvency). Excavation (M2), the real staff model (M3), the raid resolver
   (M4) and the ladder (M5) replace almost all of it. What is permanent is the SHAPE, not the
   numbers. Flagged so the short, harsh M1 tenure is read as scaffolding, not as the intended feel.
2. **Placeholder tuning (retunable, shapes are law):** threat = 6 + 2×(cycle-1); Cornerstone loss =
   6 per undefended point; fortify = +2 defence for 50g on a 1-cycle lead; inherited crew = 4. These
   make zero input fall by ~cycle 7 and single-order spam by ~cycle 15 (Gate 3). Adjust with logged
   reasoning; I logged the reasoning above.
3. **A read-only `window.__GAME.state()` accessor** was added for the proof and future Gate-2
   harnesses. It only reads a snapshot (status, cycle, Cornerstone, overlay); it is not a control
   surface. Structural call.
4. **Playwright is used only as a dev/proof tool**, resolved from the npx cache via `PW_PATH`, never
   a runtime dependency of the game. The build and the game remain zero-dependency.

---

## 2026-08-14 — M0 CLOSED (opus builder)

**Milestone M0 — architecture + reference study — complete.** Battery: 0 -> **26 pass / 0 fail**
(`node --test`). Committed and pushed at every green state across five increments.

**Built:**

- **Test infrastructure + seeded named RNG** (`src/rng.js`, `test/rng.test.js`). mulberry32 over
  an FNV-1a seed hash; named streams are independent and reproducible, so the raid resolver will
  replay exactly from a seed. `Math.random` used nowhere.
- **The data model as pure data** (`src/model.js`, `test/model.test.js`). Facility, cells (rock /
  gold / floor, with excavated / claimed / surveyed flags), rooms (seven departments), posts,
  staff (four archetypes), treasury (capacity mechanical), works orders (lead time), served
  notices (deadline stamped), the escalation ladder, detention seed, and the single loss object.
  The DIRECTIONS 2026-08-14 numeric skeleton (folds 11-15) is baked into one `CONFIG`. Founding is
  deterministic in the seed.
- **The cycle spine stub + the pacing law** (`src/cycle.js`, `test/pacing.test.js`). `commitCycle()`
  is the single, pure, seeded entry point where the sim advances; no wall-clock input, no timer, and
  a loud `CycleError` if driven out of order. Phase handlers are M0 stubs for M1+ to fill.
- **Gate 1 (pacing) + the determinism gate** standing green on the stub: they grep logic source
  (comments stripped so the scan is code, not prose) for real-time and `Math.random` tokens and
  assert the sim advances only inside `commitCycle()`.
- **The three M0 documents:** `docs/REFERENCE-STUDY.md` (clean-room documentary characterisation of
  the reference: room set, needs model, payday cadence, conversion chain, and the CUT list),
  `docs/REGISTER-SEED.md` (the voice bible, from §4.1 with cited exemplars and a report-line
  pattern), `docs/ASSET-MANIFEST.md` (pack roles, copy-in discipline, generated-art ban).
- **Proof:** `docs/proofs/2026-08-14-M0/` holds the captured green battery and a structural LOOK
  checklist (M0 has no rendering surface; the visual LOOK checklists begin at M2).

**Verified:** all four standing structural laws required at M0 are asserted, not asserted-by-comment
(Gate 1 pacing; determinism / no `Math.random`; deterministic founding; loud failure on
out-of-order cycle). Before: no battery. After: 26 pass / 0 fail.

### For the operator to ratify

1. **The loss-object name: "the Cornerstone."** DESIGN-SEED requires the single loss object to be
   named in M0, in register. I chose the Cornerstone: it bears the founding charter, so when
   raiders reach it the wall and the contract are breached as one filed event, which is the
   double meaning the game is named for. This is a **register / design-axis call, which is yours.**
   If you want a different name (the Muniment, the Deed, the Freehold Stone were the runners-up),
   say so before M4, where the raid walks toward it and the string surfaces to the player.
2. **A founding-charter treasury base capacity of 500 gold.** The systems skeleton sets the
   starting treasury to 400 but ties treasury capacity to Treasury-room tiles (× 100), and at
   founding there are zero such tiles, so the 400 would have nowhere to sit. I added a base
   capacity of 500 ("the founding charter's bonded capacity") on top of the per-tile amount. This
   is a **new number not in the DIRECTIONS skeleton**; it is a structural fix, listed for
   visibility. Retunable.
3. **Native grid set to 24 × 16 cells** (inside the 640 × 360 buffer at an 8px cell this leaves
   ledger margin). Structural call, retunable when the cutaway is drawn at M2.
4. **Quality curve is linear to 6 tiles, then `1 + sqrt(tiles - 6) × 0.1`.** This is one concrete
   realisation of the "sub-linear past 6 tiles" LAW (fold 12); the coefficient is a provisional
   number I picked so a doubled room stays under 1.5× effectiveness. Retunable; the shape is the law,
   the coefficient is mine.

---

## 2026-08-14 — FOUNDED (orchestrator, no build work)

Repo founded. No game code yet. Current milestone: **M0** (architecture + reference study).

Landed: `DESIGN-SEED.md` (design law, KEEP/CUT inventory, pacing law, register laws, standing
gates, M0-M8 ladder with the M8 stop line), `AGENTS.md` + `CLAUDE.md` mirror (builder hard rules),
`GOAL.md`, `scripts/night-run.sh` (opus lane), `scripts/night-run-kimi.sh` (kimi lane, with the
mandatory read-only diff watchdog and zombie report), `ATTRIBUTION.md` scaffold, directory
scaffold.

Battery: none yet (M0 stands it up).

### For the operator to ratify

1. **The name.** MATERIAL BREACH is provisional. The double meaning is the pitch: a wall breached
   and a contract breached, filed as the same event. Alternates ranked: DILAPIDATIONS (a real
   surveying term for the schedule of disrepair a surveyor serves, which ties directly to the
   first rung of the escalation ladder), CONDEMNED PREMISES.
2. **Q2 is still open: a win, or only a tenure?** The seed implements the brief's lean, tenure
   with a solvency score, and marks it RATIFY-PENDING. If Ray wants a victory condition instead,
   say so before M5, because the failure states and the scoring are built there.
3. **Native buffer set to 640x360**, larger than the teardown's 384x216, because at an 8px cell it
   gives an 80-column ledger and this game is made of documents. Structural call, listed for
   visibility.
4. **Score register named**: "lobby music for a building under siege" (the brief's own institutional
light music, plus a fluorescent-hum drone pedal and typewriter/date-stamp percussion from the
desk). Not built until M7b; the listen set is Ray's ear, not the builder's.

---

## For the operator to ratify

1. Corrupt saves now always display a single institutional notice line, never raw error text.
2. The title screen layout was adjusted so the corrupt-save notice can still be drawn.
3. In standalone play (no host shell), the pause surface now offers a Back control to the title.
4. The closing report surface can now be dismissed back to pause without destroying the filed record.
5. The single-file build now includes Open Graph and Twitter meta tags, pointing `og:image` to `og-card.png`.
6. `version 0.0.0` was left unchanged pending confirmation of the shipped-sibling convention.
