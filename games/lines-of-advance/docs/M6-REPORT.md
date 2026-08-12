# M6 Report: Polish, Packaging, Register Gate, and v1 Release Candidate

Date: 2026-08-08  
Branch: main  
Package version: `1.0.0-rc.1`  
Status: release-candidate implementation complete; operator `file://` play acceptance remains the external gate

## Delivered polish

- Rebuilt the side panel as compact, consistently spaced sections. Cards, controls, and status text now share one spacing rhythm.
- Added visible `:focus-visible` treatment for buttons, selects, toggles, and the board. The board has an accessible name and keyboard focus target.
- Standardized hover, active, disabled, and reduced-motion behavior.
- Clarified the evaluation bar with a fixed center mark. The label and accessible meter remain explicitly North-relative.
- Kept the full field fitted by default. At 900 CSS pixels and below, the board and controls stack; the control panel becomes two columns. The stated v1 minimum is 720 CSS pixels wide. Below 720 pixels the layout becomes a best-effort single column and is not an acceptance target.
- Added inline Session feedback for opening loads, file save/load, and local save/recall. File load can repeat the same file. Download links are attached for the click and then removed.
- Added a page-lifetime storage fallback when a `file://` privacy policy denies local storage. The UI says when that fallback is in use.
- Removed external audio probes. Effects and the optional analysis tone are procedural, so the delivered HTML has no missing audio dependency.

## Help and register gate

The new Help dialog covers objective, turn order, movement, supply, combat, board marks, engine and hints, sessions and saves, display options, and controls. Every rules-bearing section cites row ranges in `docs/RULES-LEDGER.md`.

Engine copy is deliberately narrow: the engine is described as shallow, game-specific alpha-beta search over legal actions. The interface continues to show the real North-relative evaluator score, atomic-action depth, node count, elapsed time, and principal line. It makes no top-tier chess-engine or general playing-strength claim.

The player-facing prose sweep fixed four em-dash sites, removed the loose settings paragraph, made save/load errors local to their surface, and read every remaining UI sentence against the terse operational register. [The dated Hammerstein pass](HAMMERSTEIN-PROSE-PASS.md) records the gate.

## Packaging

`dist/index.html` is the only file in `dist/`. It contains one inline script and inline CSS. The package verifier rejects external scripts, stylesheets, images, CSS URLs, asset paths, and fetches. The deliverable includes:

- first-launch walkthrough and replay control;
- hotseat, Engine North, and Engine South sessions;
- legal play, communication audit, combat, victory, undo, restart, and move log;
- live evaluation, hint search, nodes, depth, elapsed time, and principal line;
- Default, NATO counters, and Chess-like render styles;
- JSON file save/load and browser-profile local save/recall;
- procedural sound and reduced-effects controls;
- the full Help dialog.

Save format v4 now tags positions with `rulesetId: "base-v1"`. Versions 2 and 3 still load as `base-v1`. Any unknown ruleset is rejected rather than silently interpreted under base rules.

### Cold `file://` verification

The static cold-package check passed: one file, inline parse success, no external dependency, and every required surface present. A fresh-profile automated runtime capture could not be completed in this managed macOS lane. Chromium aborts at Mach-port rendezvous with `Permission denied (1100)`. The installed Playwright Firefox bundle is absent, and system Firefox is not compatible with Playwright's control protocol. No browser screenshot or interactive runtime result is claimed.

This matches the memo's acceptance split: the operator's double-click play remains the final check. The operator should open `dist/index.html` in a fresh profile, complete or skip and replay the walkthrough, play hotseat and engine turns, switch both certified piece styles, read Help, and round-trip one file and one local save.

## Dormant post-v1 hooks

`src/release-config.js` names three seams:

| Hook | Post-v1 target | v1 state |
|---|---|---|
| `combatResolver` | CRT dice-odds combat | disabled, null implementation |
| `displayRenderer` | 1981 display skin | disabled, null implementation |
| `informationReferee` | fog-referee mode | disabled, null implementation |

Startup validation fails if any of these hooks is enabled or implemented in the v1 configuration. There is no variant selector, hidden toggle, rules behavior, render behavior, or fog behavior in the v1 UI. The already certified NATO-counter and Chess-like piece styles remain render-only M5 options and are not rules variants.

## IP and no-copy review

The current source, metadata, dist, 21 historical PNG proofs, and two M5 SVG proof sheets were re-reviewed under `docs/IP-CHECKLIST.md`.

| # | Result | M6 finding |
|---:|:---:|---|
| 1 | PASS | Player surface, title, and metadata use LINES OF ADVANCE only. |
| 2 | PASS | Help, walkthrough, logs, tooltips, and audits use new wording. Manual comparison found no copied sentence or distinctive source phrasing. |
| 3 | PASS | Board and marks are CSS and SVG-in-code. Dist contains no image element, image URL, texture, or scan. |
| 4 | PASS | Historical surnames and source branding are absent from source, dist, metadata, and proofs. |
| 5 | PASS | Attribution is absent from the game surface and metadata. Internal policy documents quote the attribution rule; `docs/ATTRIBUTION.md` is the only attribution statement. |
| 6 | PASS | Player prose passed the Hammerstein read and mechanical gate. |
| 7 | PASS | Coordinate move notation and combat log phrasing are functional project notation, not source examples or notation. |
| 8 | PASS | No banned authority, completeness, or authenticity word appears in the player package. |
| 9 | PASS | The word `faithful` is absent from the player package. The surface states `rules: 92.7% verified`. |
| 10 | PASS | Dist uses system and system-monospace font stacks. No font or other external asset is bundled or fetched. |
| 11 | PASS | Package name, filename, title, description, and dist name do not trade on historical branding. |
| 12 | PASS | All committed proof images show the project's code-drawn board and neutral title. M6 added no screenshot because browser capture was unavailable. |
| 13 | PASS | Unit values, classes, and presets remain neutral game-state information. |
| 14 | PASS | The three queued variants are unavailable and off by construction in v1. |

Verdict: PASS. No copied art, copied prose, name-trading, or player-facing attribution was found. The documentation-only historical attribution boundary remains intact.

## Verification

Final command: `npm run check`

```text
npm test             106/106 pass
npm run test:selfplay depth 2: 20 wins; depth 1: 0; draws: 0
npm run build         success
npm run test:dist     single-file package pass
npm run test:prose    18-file gate pass
git diff --check      clean
```

Browser launch constraints are stated above. They are a verification limitation, not a substituted pass.

## Assumptions and handoff

1. The supported release width floor is 720 CSS pixels. Narrower layouts are best effort.
2. Browser downloads still require the browser's normal permission and destination behavior.
3. When local storage is denied, Store Local persists only until the page closes; Save File remains the durable path.
4. Historical proof captures remain milestone evidence and were not overwritten.
5. Future multiplayer and rating scope remains documentation-only. M6 introduces no server, account, network, rating, or matchmaking dependency.
6. Checkpoint commits could not be written because `.git` is read-only in this lane (`.git/index.lock: Operation not permitted`). The worktree was not staged after that failure. No push was attempted.
