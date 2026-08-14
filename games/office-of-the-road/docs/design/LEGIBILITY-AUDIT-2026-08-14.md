# Legibility Law audit — 2026-08-14 (at HEAD af8b256)

Read-only sweep of all capture states + every render function against
docs/design/LEGIBILITY-LAW-2026-08-14.md. Feeds the game-wide fix lane.

## VIOLATIONS (token → surface → site → fix)

1. `30/120` — march masthead — main.js:1353 — bare X/Y → `pace 30/120` (pattern already correct at 1599).
2. `enc 0`/`enc ×N`/`enc #N`, `sup 40`, `esc L2`, `supp.` — masthead/route cards/ticker/docket/toll — main.js:1353,1735,582,674,1601,1738 + text-catalog.js:198,200 — abbreviations → spell in full (`encounters`/`supplies`/`escalation` already used correctly nearby).
3. `(M)`, `(E)`, `@30` — score/fault line + save indicator — main.js:1379,1375,2102-3 + text-catalog.js:346,348 — sigils → drop parentheticals; `filed at tick 30`.
4. `¤`→bare `G` (`71G`,`200G`,`20G`…) — mandate strip, shop prices/resupply/sell/detail, docket history+summary, tickers — main.js:2062,1825,1831,1849,1788,1601,1610,477,478,593,598,606,639,640; glyph map pixel-font.js:72 — the law's headline example → establish G once: masthead pairs the gold icon + number (1248-56), append "G" there so the icon teaches the unit; keep G elsewhere once established.
5. `Bai/Chi/Sur/Sum` — docket ON FILE roster — main.js:1601 — cryptic fusion → spell or drop.
6. `L4`,`L6`,`L2`,`L1`,`L9` — docket history + defeat — main.js:1610,2039 — the founding violation shape → `leg 4`, `escalation 1`.
7. `1 ok / 2 DEC / 3 ok`, bare `-` — combat hand strip — main.js:1457,1479 — `DEC` never explained → spell `decisive` (or legend once), label the empty state.
8. `Matters ×1.7` — defeat incident ledger (routed) — report.js:60 — ambiguous → `encounters ×1.7` (unrouted sibling already clean at :62).
9. `+3`,`+1` mastery — defeat certifications — main.js:2026 — bare → `+3 xp`.

## OK/borderline (passed — this is the lint allowlist)

`43/43` beside hp bars; camp's spelled `atk 19 def 7 mag 4 spd 9`; shop's `atk def mag`
header column (the shipped founding fix, superseded by option B); `pace 0/120`, `page N/M`
(word-anchored X/Y); `LEG N` (real word; soft gap on CAMP/SHOP masthead — low priority);
`sell 50%`, `pay ×0.91` (label-attached); `MANDATE 6150-C` (diegetic ID); `#3` (panel-
anchored); `tick N`/`terminus N` (labeled jargon — reading-level note only); floating
`+21`/`-16` combat numbers (colored, spatially anchored, genre-universal); `Sgt` (rank
as name). Stale-capture false positive: draft truncation (fixed at af8b256).

Count: 9 categories, ~24 token instances, ~20 sites.
