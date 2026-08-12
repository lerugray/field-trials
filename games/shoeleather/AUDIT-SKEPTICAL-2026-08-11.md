# SHOELEATHER — skeptical pre-release audit, 2026-08-11

Headless only. Audited artifact: `dist/shoeleather.html` at HEAD `68f4376`.
**Freshness: CONFIRMED** — `node scripts/build.js` reproduces the committed dist
byte-for-byte (sha256 `602ba155…4ceb`), working tree clean.

Method: Playwright headless Chromium over `file://`, real mouse + real keyboard;
343-test suite; source read of the score composer and the accusation board.

---

## Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **SHIP-BLOCKER** | **Blind brute force wins both cases.** With all facts pinned the board's space is only **3,750** (slot sizes `[3,5,5,5,2,5]`). An exhaustive dropdown sweep reached CASE CLOSED at attempt **3,635** in Case 1 and **3,635** in Case 2, with no attempt cap, no lockout, and zero deduction. The seed's stated defence — "brute force loses to the combinatorial space plus the worsening world" — is empirically false at this size. Counter-moves fire but never close the win, exactly as the always-solvable law guarantees; the two laws are in direct tension and the always-solvable one wins. |
| 2 | **FIX-BEFORE-SHIP** | **The ending is not a scene.** Both cases render CASE CLOSED as a text block over the *previous room*, with live UI residue behind it: the dashed hotspot reticle (`TALK: The purser, at the card table`) overlapping the prose, the `Statement logged: purser` toast still up, the `swept 0/6` HUD still counting, and the bottom bar dimmed but present. Text collides with lit furniture. The seed's law is "THE ENDING IS ALWAYS A SCENE… the accusation performed as a staged confrontation"; what ships is a scrim-less overlay. This is the payoff of a brutally hard game and it reads unfinished. |
| 3 | **FIX-BEFORE-SHIP** | **Accusation-board options are truncated.** Native `<select>` clipping cuts the fact text mid-word: `The gap in the chef's own knife ra`, `"I was at the studio taping the se`, `The valet log has the chef parking`. The climax verb is picking *exactly* the right fact and the player cannot read the choices. |
| 4 | **FIX-BEFORE-SHIP** | **Raw id leaks into the climax sentence.** The board reads `They killed **partner** by …` — `partner` is an internal id rendered as the victim's name, in the one sentence the whole game exists to compose. |
| 5 | **FIX-BEFORE-SHIP** | **The score is a 22.86 s identical-forever loop.** `composeProgression(8)` is fully deterministic — no PRNG, no seeded variation, no reharmonisation; the "wow/flutter" is a pure function of `t` and `freq`, and `t` restarts at 0 each pass. 160 events, then the exact same 160 events, forever (`player.js:_scheduleFrom`). The composition itself is good; the repetition is the defect. |
| 6 | **FIX-BEFORE-SHIP** | **The pin affordance is an unlabelled `o`.** In the notebook each row carries `o` / `link` / `group`. Pinning gates the entire endgame — an unpinned board rejects every submission with "The board is not finished" — so a player who never decodes the single glyph is locked out of the accusation with no diagnosis. The notebook is billed as the core instrument; its primary verb has no label, no tooltip, no help-screen mention of the glyph. |
| 7 | COSMETIC | `swept 0/0` renders on the **title screen**, and `swept 0/6` persists through the ending. |
| 8 | COSMETIC | Bottom-bar buttons (Accuse / Save / Load / Restart) render fully lit on the title screen but are click-blocked by the title overlay. They look enabled and are not. (Verified: clicks intercepted — the guard is correct, the styling is not.) |
| 9 | COSMETIC | Human figures in world scenes are featureless dark silhouettes — plain circles for heads, no faces — against painted objects (knife rack, blinds, lamp falloff). In a game about noticing, the people are the least-observed things on screen. Operator's-eye call. |
| 10 | COSMETIC | The hint bar advertises `esc back`, which is a documented no-op at world level (`main.js:337`, "M1: back to a menu; no-op for now"). A title screen now exists for it to return to. |
| 11 | COSMETIC | ~60% of the accusation board is dead space below the sentence; the document reader shows a full-page parchment for three lines. |
| 12 | NOTE | **343/343 tests pass**; boot is clean — **zero console errors** and **zero non-`file://` network requests** across every probe (title, both prologues, world sweep, notebook, board, both endings, help, options, audio, save/load). |
| 13 | NOTE | **Point-and-click seam verified with a real mouse**, independent of the suite: a 12 px hover grid over one scene produced **1,101 hover-responsive points** and **144 distinct hotspot clicks**, with semantic cursors (`crosshair` / `help` / `e-resize` / `pointer`), facts logged, and interrogation opening from a click. The no-pixel-hunting law holds. |
| 14 | NOTE | **The soak is not a pointer test.** `runSoak` acquires evidence via `engine.enter()` / `focus.focusById()` / `engine.select()` — real browser, real DOM events for buttons and selects, but the canvas→hotspot pointer path is never exercised. Fold a mouse sweep into it. |
| 15 | NOTE | Deflection uniformity **holds**: one constant string (`That is a theory, Lieutenant. It is not a case. We are finished here.`) plus a diegetic counter-move parenthetical. No closeness gradient — design-consistent. |
| 16 | NOTE | Audio starts on gesture without throwing (160 nodes scheduled, label flips to `Music: on`). It defaults **off**, so a player may never hear the score at all. |
| 17 | NOTE | Save / Load / Restart all function; keys correctly namespaced `shoeleather:save:case-1:{auto,manual}`. Load produced no visible toast in probe — check against the rule-9 "every interaction gives visible feedback" guarantee. |
| 18 | NOTE | **Collateral gaps:** no `README.md`, no `og:image`, no favicon, no title-card asset, no store/itch copy. `<title>` and viewport meta are present; `docs/proof/` holds 23 dated frames. All art is code-drawn → paid-eligible under the standing art-provenance rule. |

---

## Null-strategy verdict — **FAILS**

Two probes:

- **Zero input.** Opening the board with nothing pinned and submitting yields
  `The board is not finished. Every slot must be filled from your pinned notes.`
  No degenerate win. **Passes.**
- **Trivial input (pin everything, grind the dropdowns).** **Wins.** 3,750 states,
  no cost per attempt, no cap, uniform feedback, guaranteed-open win path. Solved
  at try 3,635 for both cases. A human can do this in an evening; a script does it
  in seconds. The game does not play itself, but it *can be beaten without playing it.*

The cheapest structural fix is not an attempt cap (that breaks always-solvable) but
raising the cost of a wrong submission in a way the world absorbs — e.g. requiring
the chain be **staged** (the TRAP path) rather than submitted, or gating submissions
behind a scarce in-fiction resource, or making each wrong accusation retire one
candidate binding so the space shrinks *toward the player* only through evidence.
That is a design call for the operator, not a bug fix.

---

## Opinionated player read

The register is genuinely there. The prologue is 12 beats, it is interactive, it
plants the prologue-keyed reading, and `You will remember this.` is the right
amount of nudge. The notebook is the best thing in the build — typed facts,
who/type/scene filters, verbatim statements, a working search. The accusation
sentence-as-mad-lib is the correct shape for this genre. Both endings walk the
chain out loud and land the composure break. This is a real game, not a demo.

**Where a skeptical player bounces, in order:**

1. **The first sixty seconds after the prologue.** You are dropped into a dark room
   with `swept 0/6` and no stated goal. The help screen is good but it is behind a
   button nobody presses. One in-fiction line on scene entry — the lieutenant naming
   what he wants — costs nothing and buys the whole opening.
2. **The pin glyph.** They will observe twenty facts, hit Accuse, get told the board
   is unfinished, and have no idea that the `o` is the answer. This is the single
   highest-value fix on the list and it is a label.
3. **The board's truncated text.** The moment the game asks for precision it stops
   showing them the words.
4. **The ending.** They win, and the reward is a text block with a leftover reticle
   through it. The build's emotional peak is its weakest frame.

**The lead moment for a Field Trials post** is not the ending and not the art. It is
**the prologue-keyed clue** — you set the tape early *yourself*, and forty minutes
later the valet log at 7.52 means something to you that it cannot mean to anyone who
skipped the prologue. That is the game's actual thesis, it is implemented, and it is
demonstrable in two screenshots. Lead with that. Second choice: the 3,750-state
brute-force result as an honest "here is what an audit found and here is what we did
about it" — the audience for this game likes that more than a trailer.

---

## Verdict — **FIX-FIRST**

Nothing here is broken; the engine is sound, the suite is honest, the build is clean
and offline. But item 1 undermines the game's stated reason to exist, and items 2–6
are all on the critical path of a first playthrough.

**Needs the operator's hands:**

- **The brute-force ruling (item 1).** Attempt economy vs. the always-solvable law is
  a design-axis call. Claude should not pick it.
- **Item 9, the figureless people** — art-bar judgment against the ratified
  VACUUM SEALED standard; Ray's eyes, not a lane's.
- **Item 5, the loop** — whether the answer is more composed material, seeded
  variation, or a per-scene stem set is a register call.
- Every visual finding above is from a headless frame **looked at**, not a passing
  test — but the ending frames in particular should get Ray's own screen before a
  fix is scoped, per the operator-eyes gate.

Everything else (items 3, 4, 6, 7, 8, 10, 11, 17, 18) is mechanical and dispatchable.
