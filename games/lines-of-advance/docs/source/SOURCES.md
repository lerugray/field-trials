# Source ledger — Guy Debord & Alice Becker-Ho, *A Game of War* / *Le Jeu de la Guerre*

Compiled 2026-08-07 for Lines of Advance's M1 rules-verification gate
(`CLAUDE.md` rule 2). **These sources are for internal mechanical verification only.** No
text here may ever be copied, quoted at length, or closely paraphrased into any
player-facing surface — Lines of Advance's rules prose, tooltips, and UI copy are written
independently, in the project's own words, citing these files only in the (non-public)
rules ledger. See rule 1 in `CLAUDE.md`.

The operator (Ray) owns the printed Atlas Press English edition (Nicholson-Smith
translation, 2007/2008) but it is currently unlocatable in his physical library — so there
is direct ownership/license footing independent of anything below, but every source actually
saved here is also independently and openly published online with no paywall or login
required.

## Sources acquired

### 1. `debord-nicholson-smith-official-rules.md` (+ `.pdf`) — PRIMARY SOURCE

Donald Nicholson-Smith's English translation of Debord's own official rules text ("THE RULES
OF THE GAME OF WAR"), the same translation used in the Atlas Press edition. Hosted openly by
Class Wargames (classwargames.net), a UK situationist ludic-science research group
(Richard Barbrook / Fabian Tompsett) that has produced extensive scholarship on this game.
Full text extracted and saved (8pp / 579 lines); page numbers preserved inline as `[p.N]`
citation anchors. Archived Wayback copy on file as a permanence backup.

**Coverage — this is the designer's own rules text, so it is authoritative wherever it
speaks:**
- Board dimensions/terrain: **YES** — 500 squares, 25×20, two halves 10 squares deep each,
  2 arsenals + 3 forts + 1 mountain pass + 9 mountains per side, asymmetric disposition.
- Unit types+counts+stats: **YES, complete** — 9 infantry (atk4/def6), 4 cavalry
  (atk4, atk7 charging/def5), 1 foot artillery + 1 mounted artillery (atk5/def8), 2
  communications units (def1, no attack). Fort/pass defense bonuses given per unit type.
- Movement rates: **YES** — infantry/foot artillery 1sq, cavalry/mounted artillery 2sq
  (straight or diagonal, mixable), communications units 1sq (foot) / 2sq (mounted).
- Communications/supply rules: **YES, complete** — direct (arsenal line-of-sight) vs.
  indirect (unit-to-unit contiguity) communication, relay mechanics, isolation/paralysis
  effects, how lines are cut and restored, surrounded-force rules.
- Combat resolution math: **YES, complete and exact** — sum offense in range vs. sum
  defense in range; ≤0 differential = resist, +1 = forced retreat (with the retreat-fails
  = destroyed sub-rule), +2 or more = destroy.
- Victory conditions: **YES** — eliminate all fighting units, OR capture both arsenals
  (one arsenal alone is "necessary and sufficient... to fight and win" per the text, though
  both objectives independently end the game). Draw-by-mutual-agreement rule also given.
- Setup coordinates: **NO — and this is a genuine finding, not a gap in the source.** The
  text explicitly states deployment is each player's free choice within their own territory,
  "one unit per square," planned "in ignorance of the adversary's arrangements." There is no
  fixed starting position to cite, unlike chess. What IS fixed and NOT given here in
  coordinate form is the terrain layout itself (exactly which squares hold the 2 arsenals, 3
  forts, 1 pass, 9 mountains per side) — the text describes counts and behavior but not a
  square-by-square terrain map. See gap note below.

### 2. `rsg-kriegspiel-official-rules.md` — SECONDARY SOURCE (corroborating)

The Radical Software Group's own published "How to Play" documentation (7 pages) for Alex
Galloway's Mac/iOS digital re-implementation. Independently confirms nearly every number in
source #1 (unit stats, combat thresholds, fort/pass bonuses match exactly) and adds one
worked numeric combat example (30 offense vs. 24 defense at square "E5"). Flags one place
where RSG's phrasing (a third win condition, "destroy both relays + force offline") is NOT
present in Debord's own text — noted as RSG's own framing, not designer-sourced.

**Coverage:** same categories as source #1, all corroborated except setup coordinates (RSG's
site also does not publish an exact terrain map).

### 3. `classwargames-page-and-secondary-sources.md` — mixed

Bundles three items:
- The Class Wargames landing page hosting source #1 (framing text + link inventory, incl. a
  pointer to the untouched Italian-language rules PDF for a future independent cross-check).
- Wikipedia's "A Game of War" article — third independent corroboration, confirms the
  board's letter/number coordinate system (columns 1–25, rows A–T) and publication history.
  One discrepancy flagged: Wikipedia's own summary table flattens cavalry's conditional
  offense (4 normal / 7 charging) into a single "7," which the ledger must NOT cite —
  the primary source's conditional wording is correct.
- freeboardgames.org's open-source Kriegspiel implementation (github.com/iamcxds/kriegspiel).
  Fourth independent corroboration of the same numbers, PLUS a genuinely useful finding: the
  implementer's own README explicitly lists four real rules ambiguities NOT settled by any
  published text (does non-attacking presence block enemy fire lines-of-sight; does an
  out-of-supply unit block enemy communication lines; does a failed forced retreat consume a
  move; can an out-of-supply unit retreat). These four points should be marked
  VERIFY-AT-BUILD / design-decision in the ledger, not cited as sourced fact.

### 4. Visual terrain-layout evidence (images, not transcribed to text)

`rsg-kriegspiel-screenshot-terrain-layout.png` and
`rsg-kriegspiel-screenshot-opening-deployment.png` — two screenshots of the actual RSG
Mac/iOS app in play (sourced from github.com/iamcxds/kriegspiel's resource/ folder, which
credits them to Galloway's app). Show fortress/arsenal/mountain icon placements and labeled
board quadrants ("WESTERN PLAIN," "CENTRAL," etc.) with row letters visible on the image
edges. **Not transcribed to an exact coordinate table** — see gap note below.

## Sources checked and found unavailable (recorded per instructions, not skipped silently)

- **archive.org / OpenLibrary:** no scanned or lending copy of *A Game of War* (Atlas Press)
  or *Le Jeu de la Guerre* found under either title or creator search
  (`archive.org/advancedsearch.php`, `openlibrary.org/search.json` — both queried directly,
  zero results for the book itself). One unrelated item exists: an audio interview with
  Richard Barbrook titled "THE GAME OF WAR" (identifier `TheGameOfWar`, mediatype `movies`)
  — not fetched, background-interest only, not a rules source.
- **BoardGameGeek files section** (boardgamegeek.com/boardgame/27323/le-jeu-de-la-guerre):
  BGG's own page content (summary, publication history) matches what's already captured
  above; the FILES subsection (user-uploaded PDFs/scans) requires a logged-in BGG account to
  browse/download, so it was not accessed. **Pointer, not fetched:** if a session has a BGG
  login available, worth a follow-up check for a user-scanned board-layout diagram
  specifically, since that's the one gap this whole source set has.
- **Galloway, *Uncomputable: Play and Politics in the Long Digital Age*** ("Crystalline War"
  chapter, per RSG's own FAQ pointer) — an academic book, not freely available online;
  would need library/purchase access. Would likely add historical/design-rationale framing,
  not new mechanical facts (RSG's own rules pages are presumably a distillation of this
  chapter's game-mechanical content already).
- **Gallimard catalog page** (French publisher) — publisher metadata only, not a rules text;
  linked in source #3 as a pointer, not fetched in full.

## Overall verdict

**Sufficient for a ≥90%-cited rules ledger — with one named, bounded gap.**

Every mechanical category in the task brief is covered by the designer's own published rules
text (source #1), independently corroborated by three further sources (#2, Wikipedia,
iamcxds/README), across four independent documents that agree with each other on every
number that matters: board size, terrain counts, unit roster and stats, movement rates,
combat math, communications rules, and victory conditions. That is a stronger evidentiary
base than the printed book alone would give a ledger row, since the printed book is a single
source and this set is four independently-authored ones that cross-check.

**The one real gap: the exact square-by-square terrain coordinate layout** (which specific
squares hold each of the 2 arsenals, 3 forts, 1 mountain pass, and 9 mountains per side). No
source found — including the primary designer's rules text — publishes this as a coordinate
table; it exists only as a board diagram (in the printed book, and visually in the RSG app
screenshots saved here but not transcribed). This does not block the mechanics ledger, since
Lines of Advance is building **original board art** per `CLAUDE.md` rule 3 (no copied
terrain layout is required or even permitted) — but if the operator wants Lines of Advance's
terrain COUNTS to sit on a specific board geometry inspired by (not copied from) the
original's asymmetric layout, that would need either (a) the operator's paper copy, once
located, or (b) a careful from-scratch coordinate transcription off the two saved
screenshots (doable, just not done here — pixel-grid reading against pico8-emoji icons is
error-prone enough that it deserves its own verification pass rather than a rushed reading
folded into this research task).

**Recommendation:** proceed with the M1 rules ledger against sources #1–#3. Do not block on
locating the paper copy or a BGG login — the terrain-coordinate gap is narrow, named, and
irrelevant to the mechanics ledger given original board art is already required. If Ray
later locates the paper copy, it would resolve the coordinate gap and could also serve as an
independent fifth cross-check on everything else (which is already well-covered) — worth
doing for completeness, not because anything here is currently unverified.
