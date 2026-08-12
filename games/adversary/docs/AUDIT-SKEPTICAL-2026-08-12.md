# ADVERSARY — skeptical pre-release audit, 2026-08-12

Headless only. Audited artifact: `dist/index.html` at HEAD `0e556e7`, opened cold over `file://`.
**Freshness: CONFIRMED** — `node scripts/build.js` reproduces the committed dist byte-for-byte
(sha256 `70bd959d…c1a9`), working tree clean.
**Suite: CONFIRMED** — `node --test` → **297 pass / 0 fail**, re-run by the auditor, not taken on report.

Method: Playwright headless Chromium over `file://`, real `keydown`/`keyup` only; six probe scripts
(cold-open, 30 s AFK, surface drive, WCAG contrast on the logical 256×240 buffer, four degenerate
strategies, flow/marker/viewport); twelve captured frames **looked at**, not inferred. Contrast is
measured against the local background actually behind the glyph pixels — no eyeballing.

Grounded first in `CLAUDE.md`, `DESIGN-SEED.md`, `PROGRESS.md`, `docs/NAMES-PENDING.md`,
`docs/QOL-AUDIT.md` and the newest `docs/DIRECTIONS-*`. **Locked decisions are not reported as
defects**: placeholder names everywhere (naming law), no music tracks (operator-supplied), no
monetization surface, purchased-pixel-art provenance, and the AR1 stop line.

---

## Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **FIX-BEFORE-SHIP** | **The game never tells you how to move, jump, or attack.** Every control-bearing string in the shipped bundle was enumerated. The persistent bottom bar reads `ENTER MENU · ESC OPTIONS · ↓ REST AT WAYPOINT` — menu, options, rest: the three things a new player needs *least* in the first ten seconds. The base verbs — arrows/WASD to walk, `K`/`Space` to jump, `J` to attack — appear in **no** player-facing text anywhere in the game. The only strings that reveal `J` and `K` at all (`hold J, then release`, `in air: ↓ + J`, `↑ + L`) live in the action menu's MOVES tab, describe *locked* advanced moves, and render invisibly (finding 3). A stranger must guess the control scheme. For a Field Trials build handed to people who have never seen it, this is the first and largest barrier. |
| 2 | **FIX-BEFORE-SHIP** | **Pause and action-menu text sits at 1.47:1 and 2.46:1 contrast.** One systemic root cause: the two darkest stone-ramp shades are used as *text* colours on a dark stone panel. `PALETTE['7']` `#3c3f4d` on the `#23242f` panel = **1.47:1**; `PALETTE['6']` `#5c6070` = **2.46:1** (and **1.67:1** in the action menu, where the panel dither is lighter). WCAG AA for normal text is 4.5:1; even the large-text floor is 3:1. Affected: every *unselected* pause option (Reduce effects / Sound / Side run / Resume), the assist explainer lines, the action-menu footer hint, the `vs equipped` label, inactive tab labels, and zero-delta `DMG`/`DEF`. **Including the pause line `↑↓ select K confirm Esc resume` — the only place in the entire game that names any control key — at 1.47:1.** DESIGN-SEED's legibility floor binds here ("every entity clears readable contrast on every ground"). The discipline plainly exists in this codebase: the bottom HUD plate was carved, gated and proofed to 13.28:1. It simply never reached the overlays. |
| 3 | **FIX-BEFORE-SHIP** | **Locked rows in the MOVE LIST are invisible.** Locked moves draw in `PALETTE['8']` `#23242f` — the *same value* as the panel fill they sit on (≈1:1). Only the one unlocked row (`DODGE STEP · DOUBLE-TAP ←/→ (OR H)`) is readable. Dimming locked entries is right; dimming them to the background colour deletes the screen's purpose. The MOVE LIST is a DESIGN-SEED M5 fold whose whole job is showing the player what they are working toward. |
| 4 | **FIX-BEFORE-SHIP** | **The ending is a dead end, and barely legible.** `CAMPAIGN CLEAR` measures **2.14:1** (dim green `#3f5a2c` on `#2c1a17`). It renders as a small text label over the frozen stage with the full gameplay HUD still up — HP bar, `LV 0`, `GLD 30`, `SHORT BLADE` — plus the progress map. Then **every key is dead**: `Escape`, `Enter`, `K`, `J`, `Space`, `H` all leave `mode === 'campaign-clear'` unchanged. No restart, no continue, no return to anything; only a page reload escapes. This is the payoff for clearing all six stages. (The sim *is* correctly halted — enemy positions are identical across 1.5 s — so this is a stopped frame, not a live one.) |
| 5 | **FIX-BEFORE-SHIP** | **`docs/QOL-AUDIT.md` marks control remapping LANDED; nothing in the game can remap anything.** `setKeyBinding` / `setPadBinding` have **zero call sites** outside their own definition. Bindings are loaded from `localStorage` and persist, but no UI reaches them, and the pause menu's five options are Assist / Reduce effects / Sound / Side run / Resume. QOL-AUDIT line 24 ("Remappable controls (keyboard + gamepad) + persistence") and line 52 ("**Every kit action individually remappable (kbd + pad)**" — a DESIGN-SEED *accessibility-floor* row) are both marked **LANDED**, and remapping is absent from that document's explicit deferred list. The M4 note had promised "M9, where key rebinding gets a UI + persistence"; M9 shipped the persistence and the tests, not the UI. The tests pass because they exercise the module the UI never calls. |
| 6 | NOTE (player) | **The first minute is repeated death with no stated controls.** Open the game, touch nothing: HP 37 → 1, **three deaths in 30 seconds** — a walker patrols directly into the spawn point. Hold `→` and nothing else for 60 s: **13 deaths**, 0 XP, never past x≈430. Contact damage is working as designed and the game is *meant* to be punishing; the issue is that this is what a stranger meets while finding 1 out for themselves. |
| 7 | NOTE (design) | **The fork asks for a decision and supplies no information.** `LEFT PATH` / `RIGHT PATH`, nothing else — while the branches differ materially (platforming vs gauntlet, different unique drops). Placeholder naming is locked to the operator, so this is a surface for Ray, not a builder fix. |
| 8 | NOTE | **No title screen** — `boot()` sets `mode = 'play'` and drops the player mid-stage instantly. Noted because it is the natural home for finding 1, but a new screen is a scope call past the AR1 stop line: the cheaper fix is a line in the chrome that already exists. |
| 9 | COSMETIC | The player starts at **`LV 0`**, not LV 1. Reads as a HUD bug at a glance; likely deliberate. |

---

## Null-strategy verdict — **PASSES**

Four degenerate strategies, each on a fresh profile with cleared storage, real input throughout:

- **Do nothing** — dies, three times in 30 s. No progress.
- **Hold `→` only** (rush past everything) — 13 deaths, **0 XP**, never cleared, boss untouched at 44/44.
- **Hold `→` + mash attack** — 3 deaths, 16 XP, 2 of 7 trash killed, stalled at x≈440, boss untouched at 44/44.
- **Dodge-spam** (`H` on repeat while advancing) — 3 deaths, no progress, i-frames are not an invulnerability button.
- **Rest-spam at the checkpoint** (x=808) — no free XP; the advertised `↓ REST` heals but did not yield a farming loop in eight cycles.

**The game cannot be beaten without playing it**, and the pits gate mindless advance behind an actual
jump. This is the axis where a lot of builds fail, and this one is clean. *(A full grind-rate probe —
the DESIGN-SEED systems-guard, still on M9's deferred list — is not closed by the above; my rest-farm
window was eight cycles, not an economy study.)*

## Verified working — the load-bearing systems

- **The Souls economy is correct, observed live, not inferred.** Earned 16 XP → death → marker drops at
  x=456 holding **exactly 16 XP** with player XP floored to the level floor → death again → marker
  `null`, forfeited. That is the DESIGN-SEED contract, executing.
- **Boot hygiene is spotless.** Cold `file://` open: **zero console errors, zero page errors, zero
  non-`file://` requests**, canvas renders 2,064 distinct colours. Genuinely offline, genuinely
  double-clickable.
- **Viewports hold.** 320×240, 1920×1080, 2560×600, 400×900 — all render, letterbox correctly, no
  horizontal overflow, no errors at any size.
- **Menus function.** Pause opens; all five options toggle (Assist correctly cascades to `xpSafe` +
  `inputAssist`); five tabs cycle; the menu genuinely **pauses play** (x and HP frozen across 2.5 s);
  autosave survives a hard reload (562 B under `adversary.run`).
- **The fork works** and is the best-composed screen in the build — real `←` + `K` sets the choice and
  returns to play, with a clear S1–S6 progress map.
- **The assist offer is genuinely good design.** After three deaths the bottom plate adds
  `STRUGGLING? ESC → ASSIST (HONEST HELP)` at full legibility, framed without condescension.

---

## Opinionated player read

There is a real game here. The Souls loop is not a veneer — losing 16 XP to a marker you can see and
walk back to, then losing it for good, lands exactly as intended within the first two minutes. The art
reads well: the knight, the shambling undead, the parallax ruin skyline and the torch-pooled ground are
cohesive and do not look cheap. The bottom HUD plate is beautifully executed. The fork screen is clean.
Enemies, pits and the boss arena are laid out so that rushing genuinely fails, which is the hard part.

**Where a stranger bounces, in order:**

1. **They do not know which key attacks.** They will press arrows, probably find `Space`, and then be
   hit by an undead while hunting for the attack button. Everything else on this list is downstream of
   that. The fix is one line of text in chrome that already exists — not a new screen.
2. **They die at the spawn point before they have done anything.** A walker reaches them in about five
   seconds. Nudging the spawn or the first patrol out of contact range buys the whole opening.
3. **They open the pause menu for help and cannot read it.** The one line naming any control renders at
   1.47:1, directly beneath a perfectly legible gold selection — so the screen *looks* fine at a glance
   and is unreadable where it matters.
4. **They beat the game and the game stops responding.** Six stages, then a dim label and dead keys.

**The lead moment for a Field Trials post** is not the ending and not the boss. It is **the death
marker**: die, watch 16 XP detach and sit there glowing where you fell, walk back for it, and lose it
permanently if you die on the way. It is implemented correctly, it is legible on screen, and it is
demonstrable in two frames. Lead with that.

---

## Verdict — **FIX-FIRST**

Nothing is broken. There are no crashes, no console errors, no network dependencies, the campaign
clears, the suite is honest, and no degenerate strategy beats the game. The engine and the economy are
sound and the null-strategy result is better than most builds achieve.

It is FIX-FIRST because this release is **Field Trials — strangers, unaccompanied**. Finding 1 means a
tester may never discover the attack button; findings 2 and 3 mean the screens they would consult for
help are below the project's own legibility floor; finding 4 means the players who finish are left on a
frozen screen that ignores every key. Findings 1–4 are all mechanical and dispatchable, and none
requires new scope past the AR1 stop line.

**Needs the operator's hands:**

- **Finding 5, the remap gap** — whether AR1 ships without a rebinding UI is Ray's call, but
  `QOL-AUDIT.md` must stop claiming an accessibility-floor row is LANDED either way. The doc is wrong
  today regardless of the scope decision.
- **Finding 7, the blind fork** — entangled with the naming law; the information a player gets at a
  branch is a design-axis choice, not a builder fix.
- **Finding 8, a title screen** — the natural home for controls, but new scope past the stop line.
- **Finding 6, spawn difficulty** — whether the first thirty seconds should be this punishing is a
  register call, not a bug.
- Every visual finding above was measured on the logical buffer **and** looked at directly, but the
  pause overlay and the ending frame in particular should reach Ray's own screen before fixes are
  scoped, per the operator-eyes gate.

*No files were modified, committed, or pushed by this audit.*
