# Field Trials

[![suites](https://github.com/lerugray/field-trials/actions/workflows/ci.yml/badge.svg)](https://github.com/lerugray/field-trials/actions/workflows/ci.yml)

Nine browser games. Each one is a complete, self-contained HTML file with no network
calls, nothing fetched at runtime, and no third-party sprites or tilesets — every visual
asset is drawn by the game's own code. Each ships its own test suite and the adversarial
audit that was run against it before release.

They were built by LLM builders working under written direction from a human designer.
That is the point of this repository: not that the games exist, but that there is a
method here, and the method is documented, gated, and inspectable.

| Game | Register | Tests | Pre-release audit | Play |
|---|---|---|---|---|
| [SHOELEATHER](games/shoeleather) | 1970s inverted TV mystery — you watch the murder, then you prove it | 373 | **FIX-FIRST** — 18 findings, one ship-blocker | [play](https://lerugray.github.io/field-trials/shoeleather/) |
| [THE JACQUARD INDEX](games/jacquard-index) | Nonograms that never ask you to guess, in a defunct mill's pattern library | 252 | **FIX-FIRST** — 8 findings; 7 fixed, 1 named omission | [play](https://lerugray.github.io/field-trials/jacquard-index/) |
| [ALKAHEST](games/alkahest) | A match-panel machine on an alchemist's bench; the register is the physics | 215 | **FIX-FIRST** — 6 findings; 4 fixed, 1 disclosed unfixed | [play](https://lerugray.github.io/field-trials/alkahest/) |
| [CHAPEL PERILOUS](games/chapel-perilous) | First-person grid dungeon crawler in Illuminatus! conspiracy static | 605 | Five-role studio audit; the build contract itself was refuted before it was built | [play](https://lerugray.github.io/chp-preview/) |
| [INNSMOUTH 2000](games/innsmouth-2000) | The 1993 city-builder format, Lovecraftian — five gods are the disasters menu | 417 | **Defects found** — 1 blocker, 3 defects, 3 friction, each with a repro | [play](https://i2-preview.pages.dev/) |
| [STRAY SQUADRON](games/stray-squadron) | SNES-era rail shooter rebuilt as a roguelite, with a permanent flight log | 497 | Genre audit: **no silent gaps**. Independent finishedness audit: **NEEDS-A-ROUND** | [play](https://ss-preview.pages.dev/) |
| [ODDSEEDZ](games/oddseedz) | Cozy monster-ranching toy, 70 species, no death anywhere in it | 305 | **NEEDS-A-ROUND**, followed by a documented fix round | [play](https://lerugray.github.io/field-trials/oddseedz/) |
| [LINES OF ADVANCE](games/lines-of-advance) | Supply lines and massed attacks — Debord's Kriegspiel, modernised, with an engine that fights | 156 | **Release audit** — every finding verified landed, 156/156 independent re-run | [play](https://lerugray.github.io/field-trials/lines-of-advance/) |
| [CAPRIOLE](games/capriole) | First-person hop-and-bop roguelite: a clockwork goat ascends islands a 1995 PlayStation dreamed | 188 | **Spawn-safety sweep** — 8,000 cases, zero death loops | [play](https://lerugray.github.io/field-trials/capriole/) |
| [ADVERSARY](games/adversary) | Six-stage action-RPG with a Souls death loop | 300 | **FIX-FIRST**, followed by two documented fix rounds | pulled 2026-08-12 — in the shop |

3,008 tests across the nine on the shelf; ADVERSARY's 300 keep running in CI while it is
in the shop. Every suite runs with `npm test` and needs nothing but Node.

ADVERSARY was pulled from the shelf on 2026-08-12 after play caught what its gates had
missed. That is the method working, not failing: the shelf only carries what survives it,
and the game returns through the full release gate or not at all.

---

## The method

Each game is built the same way. The shape matters more than any individual game.

**1. A design seed, written first.** Every game begins with a `DESIGN-SEED.md` — a
founding contract naming the *specific* reference work rather than a genre, the clean-room
law governing it (characterise and rebuild the mechanics; never copy assets, names, or
trade dress), the register laws the art and prose answer to, the non-negotiables, and a
milestone list with an explicit stop line. The builder is not asked what to make. It is
given a contract and held to it. Nine of the ten seeds are published here verbatim;
Stray Squadron's is withheld because it carries personal biographical material, and its
game directory says so.

**2. Bounded autonomous build sessions.** A builder runs against that contract
unattended, for a fixed span, on an always-on machine — then stops, whether or not it is
finished. Work lands in milestones. Nothing merges on the builder's own say-so.

**3. The operator steers in writing, between sessions.** Direction arrives as documents:
what to build next, which calls are ratified, which are refused, what the register
demands. Design-axis decisions — taste, feel, what the game *is* — are never delegated to
the builder; they come back to the designer as explicit questions and are answered in
writing before the next session starts.

**4. An adversarial audit gates release.** Before a game is published, a *different*
model audits it read-only and hostile: it boots the built artifact — not the source — in a
real headless browser, drives it with real mouse and keyboard input, and attacks the
design's own claims. The audit document ships with the game, verdict included, and the
verdicts here are not flattering. One found that a detective game's central puzzle could
be brute-forced in 3,635 attempts, falsifying the seed's own stated defence. One refuted
the build contract before a line of it was built. Findings are then fixed, or deliberately
not fixed and *disclosed*.

**5. Verification is objective, and green tests are not the bar.** The standing rule
across these projects is that a passing suite is necessary and not sufficient — unit tests
stay green while the UI never calls the code they cover. So the gates are built to see
what a suite cannot:

- **Real-input browser batteries.** Probes drive the actual canvas with real pointer and
  key events, because a test that calls `engine.select()` never exercises the seam between
  the mouse and the game.
- **Sabotage probes.** Does doing nothing lose? (Alkahest: null input loses 40/40 bouts.)
  Does mashing win? (Random mash at 4–20 Hz and superhuman 60 Hz: zero run completions.)
  Can the puzzle be brute-forced? (Shoeleather: yes, and that became the ship-blocker.)
- **Independent re-implementation of the game's own claims.** The Jacquard Index promises
  every card is solvable by deduction alone; that promise is checked by a second,
  separately written solver that shares no code with the game's.
- **Build-contract tests.** Each game bundles to one file with a hand-rolled bundler, and
  a wrong bundle is silent — the unit suite runs the real modules, not the artifact. So
  the bundler's contract is itself a test, in the games where a silent-drop bug has
  actually happened.
- **Deterministic proof frames.** Art changes ship dated, seeded frames rendered from the
  same buffer the browser blits, so a visual claim can be looked at rather than asserted.

**6. Nothing ships on a claim nobody checked.** The pattern that produced every rule
above is the same one: something was reported done, and was not. The audits in this
repository exist because that kept happening.

---

## Built by LLMs, directed by a human

These games were written by large language models. Ray Weiss did not write the game code.
Saying so plainly is the honest framing, and hiding it would make the portfolio worth
less, not more — the interesting claim is not "a person wrote 2,964 tests", it is "this
process produces games that survive a hostile audit."

**What the human did:**

- **The design seeds.** Every `DESIGN-SEED.md` in this repository is the designer's
  contract — the concept, the choice of a specific reference work over a genre, the
  clean-room laws, the register laws, the non-negotiables, the stop line.
- **The register and taste calls.** What the game feels like, what it looks like, what its
  prose sounds like. These were never delegated. Where a builder or an audit surfaced a
  design-axis question, it was routed back and answered.
- **The gates.** Which audit findings get fixed, which get disclosed and shipped unfixed,
  which are refused. What counts as finished. When a game gets published.
- **The playtests.** The operator plays the build and the observations become the next
  round's direction.

**What the models did:** the implementation, the test suites, the probes and gates, the
audits of each other's work.

**What is not claimed:** that this is unsupervised, that no human judgment was involved,
or that the audits are clean. They are not — read them.

---

## Repository layout

```
games/<game>/
  src/          the game
  test/         its suite (co-located with src/ in shoeleather)
  scripts/      build, probes, gates
  DESIGN-SEED.md   the founding contract
  README.md        what it is, how to run it, how to test it
  docs/            the audits, the reference studies, one representative figure
```

Build outputs (`dist/`) are not committed — CI rebuilds them.

The working documents of the build method itself — the builder's hard-rules file, the
running progress log, the dated operator direction documents, the per-lane reports — are
not published here. The design seeds and the audits are, verbatim, which means they
occasionally cite a document that is not in this repository. They have been left as
written rather than tidied.

## CI

`.github/workflows/ci.yml` has two jobs:

- **suites** — runs on every push and pull request. A matrix over the ten game
  directories on Node LTS, no browser, no third-party dependencies. This is the required
  gate and it is meant to stay fast and green.
- **browser** — weekly and on manual dispatch only. Installs Chromium, builds each game's
  single-file artifact, and runs its real-browser probes and soaks. It is deliberately
  kept off the push path so that a browser download failure can never redden a source
  change.

## Licensing

Code is MIT (see [LICENSE](LICENSE)). Assets shipped alongside it carry their own terms,
documented in the game directory that contains them: the Atkinson Hyperlegible fonts in
The Jacquard Index are under the SIL Open Font License 1.1; the music tracks in
Innsmouth 2000, Stray Squadron and Oddseedz are operator-supplied and credited to the
pseudonym **Abel Aeolian** — those are AI-rendered from prompts written to each game's
register, and are the one music exemption to the everything-is-code-generated rule these
projects otherwise hold to; and ADVERSARY's curated protagonist/enemy frames are from
Ray's pixel-art library (Willibab collection, CC BY, attribution in credits); and
Capriole vendors the three.js renderer inline (MIT) and composes its score entirely in
code — no audio files at all. Every other
asset in every game is generated by that game's own code.
