# Public-release gate record — THE OFFICE OF THE ROAD — 2026-08-13

Run by the shipping session per PUBLIC-RELEASE-GATE-2026-08-12 (freeze clause exited
2026-08-13, Ray's explicit override). Ship HEAD at gate close: the commit carrying this
record. Steps in order:

1. **Battery** — suite 187/187 + gates.mjs ALL GREEN (M2+M4+M6+M7+TEXT), orchestrator-run
   at ship HEAD. (Suite grew 181→187 during the gate: +1 em-dash catalog regression,
   +5 combat-polish checks.)
2. **Cold boot as a stranger** — shipped single-file, fresh contexts. Title: real menu
   (START / HOW TO PLAY / CREDITS), display-res text, themed art band; fills-the-window
   measured 100% @1600x1000 and 1280x800, 87% integer-letterbox @1100x700. How-to and
   death report read finished and legible. Real-keys session: boot→march→pause→options
   →save→reload-continue, all verified via the __office hook with real input.
3. **End states** — death report + FILE A NEW EXPEDITION continue path (deep-linked +
   engine-tested); terminus/discharge/victory covered by 23 suite references; combat
   entered and resolved with the on-screen verbs (draft→Enter, Space run), landing at
   camp on the leg boundary.
4. **Motion looker** — consecutive-frame sequences (march + combat) judged by an
   independent looker + orchestrator eyes: march progresses cleanly, battlers coherent
   vs title reference, no flicker/corruption. Three finish defects found and FIXED
   in-gate (combat instruction truncation, ellipsized party names, score-label edge):
   capture-verified, committed a676642.
5. **Score** — V3.1 ratified by Ray's ear 2026-08-13 ("passes my approval now");
   Song-Structure compliant (3+ sections per context, minutes-long cycles).
6. **Provenance + collateral** — licensed art (Willibab/Monsteretrope CC BY, Pixel
   Tarot; ATTRIBUTION.md + in-game credits). OG card built from SHIPPED assets only
   (LANE-REPORT-COLLATERAL provenance). Player-facing em-dashes: 39 strings rewritten,
   catalog now ZERO, standing regression test added (6250d22). field-trials umbrella
   claim amended by Ray's call before vendor (code-drawn OR licensed, credited).
7. **Studio QA sweep** — independent qa-tester pass over input/menus/edge states:
   VERDICT SHIP. One claimed blocker (reload-resumes-to-combat) adjudicated FALSE
   POSITIVE by orchestrator probe (clean mid-march save resumes to march; exact-tick
   resume verified). Disclosed non-blocking blemishes, ledgered in PROGRESS:
   REST-waste blemish, victory-draft focus desync, HOLD button ignores Enter (H works),
   Space-confirm inconsistency across screens.
8. **Deploy verification** — GREEN 2026-08-13 evening: served
   /field-trials/office-of-the-road/index.html sha256-matches the local build exactly
   (two deploys, both hash-verified); og.png serves 200; og:image meta present and
   resolving in the served head; games shelf lists No. 10 (4 refs). Vendored source
   sibling + CI matrix row landed in field-trials f96d2c1.
9. **Ray's eyes** — **FAIL (2026-08-14 morning).** Verdict: not ready for release —
   UI reads bad/rushed; main menu squished together; no clear read on what's going
   on (affordance); some assets look placed incorrectly; needs an actual font; UI
   needs streamlining focused like Knights of Pen and Paper (the inspiration).
   Disposition: title stays live while a same-day KotPP-grounded UI overhaul round
   runs (fix-forward; Ray can order a delist instead). Affected gate steps re-run at
   the overhaul HEAD before this record closes. Note for the gate itself: steps 1-8
   green passed a look Ray faulted — same miss class as the 08-13 scaling + leading
   catches; "reads right at a glance" remains outside what steps 1-8 can certify.
   Ray's eyes stay the only real step 9.

## Re-run at the overhaul + legibility HEAD — 2026-08-14 (shipping session)

Per the step-9 disposition, affected steps re-run at b87b24b (+ee6e909 instrument):
- **Step 1 (battery)** — 225/225 + gates.mjs ALL GREEN (M2+M4+M6+M7+TEXT), orchestrator-run.
- **Step 2/4 class (look + fill)** — GATE 7b sharpened per codex 2.84: layout probe now sweeps
  8 viewports (1280x800 baseline, 1366x768 hostile, 1512x982 Ray's screen, 1599x999/1601x1001
  5x-boundary bracket, 1600x1000 exact-5x control, 1920x1080, 2560x1440) = 128 probes — 0 text
  collisions, 0 unowned control collisions, 0 tight interline at every size. GATE 7c legibility
  lint: 470 drawn strings, 0 violations. Fresh step-9 frames captured
  (docs/verification/step9-20260814/, 34 frames); title/shop/combat/camp verified by
  orchestrator eyes: five-band title unsquished, option-B labeled stat deltas live in the
  quartermaster, camp math spelled out, combat instruction plain.
- **Step 6 (collateral)** — OG card REBUILT at the overhaul HEAD (shipped Undead Pixel 8
  treatment + shipped cast; orchestrator eyes on the card) — the prior card carried the
  superseded pre-overhaul face.
- **Step 8 (deploy)** — GREEN: served /field-trials/office-of-the-road/index.html sha256
  = 00305072f5a3d1... matches local dist exactly; og.png 200 + hash-verified.
- **Step 9 (Ray's eyes)** — **PASS (2026-08-14, Ray verbatim: "OOR passes now, all
  set")** on the staged frames + live build at the legibility HEAD. RECORD CLOSED:
  all nine steps green at the shipped HEAD; the 08-14 morning FAIL is answered by the
  KotPP overhaul + legibility rounds this record's re-run block covers.
