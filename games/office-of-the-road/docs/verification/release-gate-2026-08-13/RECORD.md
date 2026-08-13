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
8. **Deploy verification** — recorded below after publish: hash-diff of served
   index.html vs local build, play-URL boot, OG meta resolution.
9. **Ray's eyes** — pending on the live page; ship/hold is his.
