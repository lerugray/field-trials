# Lane brief — house-band Performance-Pass backport (2026-08-15)

## Goal
Back-port the house-band **Performance-Pass API** (deterministic humanize + release-tail
knobs, neutral defaults — landed in house-band 1cf5c59) into popinjay's shipped score, so
the in-game music plays with humanization live. Popinjay's current score commit is
arrangement-only: zero humanization hits.

## Reference
Clone the current kit INSIDE this workspace (local path clone, no network needed):
`git clone /home/ray/house-band.git ./.hb-ref-2026-08-15`
Read its README + the Performance-Pass API surface before touching popinjay. The kit is
register-neutral; popinjay's musical register comes from popinjay's OWN seed/docs — read
them.

## Steps
1. Locate popinjay's vendored band kit (per-game port of house-band's band.js/prng.js
   pattern) and its score module.
2. Sync the vendored kit files to current house-band HEAD (preserve any deliberate
   popinjay-local extensions — diff first, report what you found).
3. Wire Performance-Pass into the shipped build's playback. Start from the kit's neutral
   defaults; apply modest, musically-appropriate humanize/release-tail settings consistent
   with popinjay's register. DECLARE every knob value in the lane report — the operator's
   ear is the final gate, not your taste.
4. AUTHORED MATERIAL UNTOUCHED: melodies, arrangements, song structure (A/B parts) must be
   byte-level identical in intent — only performance rendering changes.
5. Suite: record the Linux baseline failure count FIRST (goldens are Mac-pinned; Linux
   phantom failures are known). Assert delta-fail = 0 vs that baseline after your changes.
6. Render a fresh dated listen set (offline render, no audio device needed) to
   `listen/2026-08-15-humanize/` — the main theme plus 2-3 representative cues, before/after
   pairs if cheap.
7. Write `LANE-REPORT.md` at repo root: what changed, kit diff summary, knob values,
   baseline vs final suite counts, listen-set inventory, anything you could not do.

## Constraints
- NO pushes. Attempt checkpoint commits at coherent states; if git refuses (sandbox holds
  .git read-only), proceed with a dirty tree — the orchestrator harvest-commits.
- If npm install is needed and the network is denied, note it in the report and run what
  is runnable; final golden verification happens Mac-side regardless.
- Do not touch anything outside the music path except the lane report.
