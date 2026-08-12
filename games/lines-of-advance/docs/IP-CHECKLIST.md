# IP No-Copy Checklist — Lines of Advance

This checklist documents the clean-room boundary for the project. Every item is checkable by inspection, search, or the named milestone gate. It applies to all player-facing surfaces: UI copy, rules text, tooltips, move notation, board art, screenshots, metadata, and package names.

| # | Checklist item | How it will be verified | Target milestone |
|---|----------------|-------------------------|------------------|
| 1 | Product name is **LINES OF ADVANCE** on all player-facing surfaces; the original title is never used as product title, subtitle, marketing hook, window title, or metadata. | `grep`/`rg` over `src/` and `dist/index.html` for the original title and common variants; manual review of title bar and splash chrome. | M2 (in place), re-verified at M6 |
| 2 | No original rules prose is quoted or closely paraphrased in player-facing rules, tooltips, help panels, or move logs. | String-search player-facing strings against `docs/source/*.md`; run the Hammerstein no-overclaim prose pass. | M6 |
| 3 | No original board art, scans, diagrams, or historical facsimile styling is used; all visuals are code-drawn (CSS/SVG-in-code). | `grep` for image/texture/font URL references; inspect `src/` for raster assets; review proof screenshots. | M2 (in place), re-verified at M6 |
| 4 | No Debord, Becker-Ho, Situationist, or original-game branding appears on any player-facing surface. | `grep` for surnames and original branding strings across `src/` and `dist/`; screenshot inspection. | M6 |
| 5 | Attribution language ("inspired by Guy Debord's *Le Jeu de la Guerre*") appears **only** in `docs/ATTRIBUTION.md`, never in UI, About boxes, or metadata. | `grep` for attribution phrases outside `docs/ATTRIBUTION.md`. | M6 |
| 6 | Player-facing rules text, help copy, and tooltips are written in original prose using the project's register (clinical, operational, no theatrical language). | Hammerstein prose pass; read every player-facing sentence for original wording and register. | M6 |
| 7 | Move notation, coordinate labels, and combat log phrasing are original; no copied source notation or examples are used. | Compare notation against source examples in `docs/source/`; review move log output. | M4/M6 |
| 8 | No player-facing overclaim words — "official," "definitive," "complete," "authentic," "authorized," or equivalent — appear unless legally cleared and accompanied by qualifying context. | `grep` for a banned-word list in `src/` and `dist/`; prose pass. | M6 |
| 9 | The word "faithful" does not appear on any player-facing surface unless the verified ledger fraction is displayed alongside it. | `grep` for "faithful" in `src/` and `dist/`; UI inspection. | M6 |
| 10 | All fonts and vendored assets are license-clean and documented; no proprietary or unlicensed typefaces or graphics are bundled. | Review `src/styles.css` and any vendored font files; confirm OFL or system-license status. | M6 |
| 11 | Package names, file names, repository metadata, and build output names do not trade on the original title or Debord branding. | Inspect `package.json`, `dist/index.html` meta tags, and repository settings. | M6 |
| 12 | Dated proof screenshots and any public/shared captures contain no protected text, art, or branding. | Manual review of every committed `proofs/` image before it is pushed. | Every milestone |
| 13 | The contested-class data (exact unit values, counts, and setup coordinates) is rendered as neutral game-state information, not dressed in original flavor text or copied labels. | Review piece tooltips, unit roster display, and setup presets for original labels only. | M3/M4 |
| 14 | Variant hooks (CRT combat, 1981 skin, fog/referee) remain dormant and clearly labeled as post-v1 variants; no variant is presented as the base game. | UI inspection of variant toggles; confirm they are disabled or absent in v1 builds. | M6 |

## Notes

- "Player-facing" means anything a user can see without opening the repository: the built `dist/index.html`, screenshots, package metadata, and any future web-facing page.
- `docs/source/` and this `docs/IP-CHECKLIST.md` are internal documentation; they may name the reference work and quote it only for verification purposes, per `CLAUDE.md` rule 1.
- Verification results should be recorded in the relevant milestone report (M3, M4, M6) with pass/fail per item.
