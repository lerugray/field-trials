# MATERIAL BREACH — builder hard rules

**NAME RATIFIED (Ray, 2026-08-17): the game ships as MATERIAL BREACH.** The DILAPIDATIONS /
CONDEMNED PREMISES alternates are retired — do not resurface them. All collateral (title
screen, OG card, shelf row, store copy) builds on this name.

**Read this before writing any code.** This file and `CLAUDE.md` are identical by policy; kimi and
codex lanes read AGENTS.md, Claude lanes read CLAUDE.md. If you edit one, mirror it to the other in
the same commit.

**Reading order at the start of every run:**
`DESIGN-SEED.md` → the newest `docs/DIRECTIONS-*.md` (**operator directives; they outrank
DESIGN-SEED**) → `PROGRESS.md` → `git log --oneline -20`.

---

## Hard rules

**1. ART LAW.** The facility is **code-drawn** (architectural cutaway, VACUUM SEALED technique
stack, DESIGN-SEED §4.4 and §4.5). The cast is **licensed pack art** from
`~/Desktop/Dev Work/pixel-art-library/extracted/` and `~/Desktop/Dev Work/asset-library/`, copied
in with a manifest and a credit line. **LLM-image-generated art is banned outright** and would
close the paid door. Every borrowed asset gets an `ATTRIBUTION.md` row, and ATTRIBUTION ships
inside the built artifact. **Placeholder art is a defect, not a stage**: a placeholder that
survives its own milestone is a BLOCKER.

**2. VOICE LAW.** All player-facing text is institutional-defensive: an organisation documenting
its own losses to limit its liability (DESIGN-SEED §4.1, with exemplar lines; write to that bar).
Prose deflects, instruments are exact; every flavour string ships a plain numeric neighbour. No
outcome is ever narrated as a victory. **No em-dashes in player-facing text, ever.** Banned:
epic-fantasy earnestness, snark, memes, winking at the player, grimdark relish, exposition dumps,
any joke that knows it is a joke.

**3. THE PACING LAW IS STRUCTURAL.** The player advances the clock; the clock never advances on the
player. No wall-clock input reaches game logic. No timer mutates state. The sim advances only
inside `commitCycle()`. RAF draws presentation only. **Any real-time pressure is a defect**, and a
standing test asserts this. Do not "temporarily" add a timer.

**4. DETERMINISM.** Seeded named RNG streams only. `Math.random` is banned in game logic and a
standing test greps for it. The raid resolver replays exactly from a seed.

**5. NO SCOPE-JUMPING PAST THE STOP LINE.** Build the current milestone to completion, in order.
**Stop at M8.** Everything past M8 is operator-directed. **M7a is a HARD STOP for Ray's eyes**:
produce the art PoC, commit dated proof screenshots, and stop. Proceeding to M7b without Ray's
verdict is a hard rule violation, not an efficiency.

**6. CHECKPOINT-COMMIT AND PUSH AT EVERY GREEN STATE.** Small commits, never batched.
**Never revert, reset, or re-apply your own committed work.** Committed work is final; build
forward only. If the suite breaks, fix forward from the last commit. Never `git reset` your own
history. A lane has previously destroyed five hours of work by deciding to redo it "more
carefully"; that is the specific failure this rule exists to prevent.

**7. OBEY THE STOP FILE.** If a file named `STOP` exists in the repo root, do not start work, and
if it appears mid-run, finish the current increment, commit, push, and exit.

**8. BATTERY GREEN AT EVERY COMMIT.** `node --test`. Tests are behavioural and speak the game's own
vocabulary (cycles, works orders, grievances, notices, payday), not the engine's internals. The
standing gates in DESIGN-SEED §8 are tests in the battery from the milestone named, and they are
re-run at every milestone after.

**9. RATIFY-NOTES CONVENTION.** Every run appends a `## For the operator to ratify` block to
`PROGRESS.md`: the decisions you made that Ray may want to overturn, one line each, plainly worded
for a non-programmer. Silence is not consent. An unlisted decision is an unratified one. Design-axis
calls (purpose, feel, aesthetic) are **Ray's**; structural and technical calls are yours to make and
to list.

**10. PROOF OR IT DID NOT CLOSE.** Every milestone commits dated proof screenshots to
`docs/proofs/<YYYY-MM-DD>-M<n>/` and updates `PROGRESS.md` with what was built, what was verified,
and the before/after battery counts.

**11. NEVER STAGE FOR RAY WITHOUT THE SOAK.** Gate 8 (player-path soak plus acceptance battery on
the built single-file artifact) runs before anything is shown to the operator. Findings classified
BLOCKER / DEFECT / FRICTION.

**12. DO NOT TOUCH ANYTHING OUTSIDE THIS REPO.** No edits to sibling repos, no edits to
`generalstaff-private`, no global config changes.

---

## Build and verify

```
node --test                 # the battery
node scripts/build-singlefile.mjs   # -> dist/index.html, zero external fetches
```

`dist/index.html` must boot from a `file://` double-click with no server and no network. That
artifact is the only thing Ray reviews.

## Provenance line (collection contract v0, item 9)

**Art:** code-drawn (facility) + licensed pixel-art packs with attribution (cast). No generated
imagery. **Music:** code-composed WebAudio (House Band), no audio files. **Paid-eligible.**
