# M2 proof checklist — 2026-08-14

M2 is **the dungeon grid**: carving, claiming, gold seams, and departments with size-driven quality
curves, all driven by the pointer. The proof is the green battery plus the five dated screenshots in
this folder, captured from the built `dist/index.html` at `file://` with a real mouse
(`scripts/capture-proof-m2.mjs`).

Battery at close: **63 pass / 0 fail** (Gate 2 real-mouse-event test included, not skipped). Build:
`dist/index.html`, zero external fetches.

## LOOK checklist (fold 21), scored against the shots

| # | M2 mechanic / law | Expected | Shot | Verdict |
|---|---|---|---|---|
| 1 | Floors read as CARVED, not placed (KEEP #1) | The facility can only grow outward from claimed ground; a click on rock beside claimed ground carves it, and rock elsewhere refuses. | 02, 03 | PASS: the carved cells extend from the footprint arms; a click off claimed ground is refused in-register. |
| 2 | Unexcavated rock is concealed (fold 1) | Rock reads as uniform hatch; only carved-and-surveyed cells read as floor. | 01, 03 | PASS: the map is hatch except the surveyed footprint and what has been carved. |
| 3 | Departments are AREAS with size-driven quality (KEEP #2) | A department shows a tint and letter; its outline weight reads its size; the ledger lists size and quality; a Treasury's tiles raise the gold ceiling. | 04 | PASS: two Treasury tiles labelled T, "treasury 2 tiles quality 0.33", ceiling risen 500 -> 700. |
| 4 | The pointer drives it (Gate 2) | A real mouse click carves a cell and designates a department; the tool button and hover highlight make the action legible before it lands. | 02, 04 | PASS: real clicks carved and designated; the tool reads "Dept: Treasury". |

## Shots

- `01-admin-grid.png` — the filled desk (Gate 6): cutaway, ledger, action bar with the Tool button.
- `02-excavation-queued.png` — real mouse clicks raised excavation works orders (ghost outlines).
- `03-carved-and-claimed.png` — after signing over, the cells are carved and claimed floor.
- `04-department-designated.png` — a Treasury designated; quality shown; the ceiling rose to 700.
- `05-after-action.png` — the after-action report following the department cycle.

## Gates standing green at M2

Gate 1 (pacing), Gate 2 (real mouse events, non-negotiable), Gate 3 (degenerate probe), Gate 4
(action-legibility), Gate 6 (screen-fill >= 95%), Gate 7 (loud failures), plus the raid-variance and
flavour-pairing gates. Gate 5 (legibility floor, measured) is M6.
