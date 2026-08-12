# Lane Report — Operator-Feedback UI Round

Date: 2026-08-08

Lane: codex, workspace-write

Status: three directives implemented; 90 tests green; single-file build regenerated

## What shipped

### 1. Fit-to-viewport board and opt-in zoom

- The board wrapper now fills only the available board cell at its default 100% fit state.
  Its complete 25×20 SVG view remains visible without board scrolling.
- Wheel/trackpad zoom, two-pointer pinch, and header − / + buttons use the same bounded model:
  100% to 250%. The Fit button returns to 100% and resets the board scroll position.
- Scrolling is introduced only after zooming in. Pointer-centered wheel zoom preserves the
  location under the pointer; button zoom preserves the viewport center.
- Pure zoom tests pin 100% as the minimum/default and verify wheel and pinch scaling and bounds.

At 1280×800 the board cell is 1000×752 before its 12px inset. The 718×578 SVG view therefore
fits at about 1.26×, producing roughly 35px board squares and 14px piece glyphs. The existing
1280×800 M4 proof also shows the same board slot and authored glyphs clearly. The fitted default
does **not** trigger the directive's unreadable-glyph warning.

### 2. Initial communication diagnosis

**Verdict: branch (a), scenario bug.** There is an important qualification: the printed rules
do not define a canonical fixed deployment or require one prescribed connected formation.
They allow each side to choose its setup. The bug was that the inherited default did not obey
the constraint those rules do state.

The settling citation is **rules-ledger row 82, Nicholson-Smith p.1**
(`docs/source/debord-nicholson-smith-official-rules.md`, §1, `[p.1]`): each side deploys freely
inside its own ten-rank territory, one unit per square. The old preset did the reverse—North
was on y=0 in South territory, while South was on y=19 in North territory. It also still used
the reduced M2 drill roster.

The correction is a deterministic convenience opening, not a claim about a historical or
official setup:

- each side now has the verified 17-unit roster (ledger rows 13–14; p.2 and pp.4–5);
- North occupies its own back rank and South occupies its own;
- the relays on the e- and u-files receive direct communication from the adjacent arsenals and
  redirect it across each occupied back rank, following ledger rows 57–61 / Nicholson-Smith
  p.4;
- every opening unit is in communication.

One test pins the full roster counts. A second test asserts that every opening piece is in its
own territory and that `computeCommunications` reports every piece in communication.

Legibility was fixed as well: the walkthrough explains the blue route, the red isolation slash,
the consequence for an isolated fighter, and the two practical reconnection paths available to
the player.

### 3. First-time walkthrough

The implemented shape is four short coachmarks:

1. **Pieces** — highlights a live fighting unit and decodes I / C / A / R, pointing the player
   to the existing selected-unit inspection.
2. **Communication** — selects a live relay so its computed blue arsenal route is visible;
   explains the isolation slash, its effect, and reconnection through a relay or an adjacent
   connected fighter.
3. **Turn** — highlights the real turn card and states the five-move / one-attack cadence plus
   the handoff.
4. **Victory** — highlights a live enemy arsenal square and states the two verified win paths.

This is intentionally closer to a lichess study hint than a product tour: no scrim, no modal
dialog, no blocked board input, one compact sentence group at a time, and a visible Skip action.
Completion and skip are stored under `loa-walkthrough-v1`; either suppresses future automatic
launches. Session → Walkthrough replays it without clearing that preference. Persistence tests
pin the first-launch, skipped, and completed states.

## Verification

```
npm test      90/90 green
npm run build successful
git diff --check clean
```

The build output is `dist/index.html` and remains self-contained and `file://` compatible.
The player-facing prose scan found none of the overclaim terms gated by the IP checklist.

A fresh automated browser capture could not be produced in this managed lane: Playwright's
Chromium process was denied its macOS Mach-port rendezvous by the sandbox before opening a page.
The failure occurred after the test suite and build succeeded and did not change repository
files. The 1280×800 readability determination above uses the exact layout/viewBox calculation
and the prior M4 proof at that viewport.

## Assumptions and boundaries

- The connected back-rank setup is a legal convenience preset. It is not canonical; p.1 gives
  players free deployment. A hidden simultaneous setup workflow was not added in this UI round.
- Zoom is intentionally enlargement-only. Fit is the floor, so a player never has to zoom to
  recover the whole board.
- Walkthrough persistence uses localStorage. If a browser denies storage for `file://`, the
  walkthrough remains usable but may appear again on the next launch.
- No proof image was overwritten or added because the browser sandbox prevented a fresh capture.
- Required checkpoint commits could not be created: this workspace permits source writes but
  mounts `.git` read-only (`index.lock: Operation not permitted`). No push was attempted.
