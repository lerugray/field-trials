#!/usr/bin/env python3
"""Sheet-format study for purchased pixel-art packs.

Never assume a sheet's frame grid. This tool derives the cell size EMPIRICALLY from the
pixels: it tests every plausible (cellW, cellH) that divides the image, and rejects any
candidate where opaque content crosses a cell seam (i.e. a sprite would be sliced). The
surviving candidate with the largest cell that still yields a plausible frame count wins.

Findings from this tool are what go into assets/art/MANIFEST.json — not the pack blurb.

Usage:
  python3 tools/pack-sheet-study.py <png> [<png> ...]
  python3 tools/pack-sheet-study.py --dir <directory>   # every .png beneath it
"""

import json
import sys
from pathlib import Path

from PIL import Image

# Cell sizes worth testing. Packs in this library use power-of-two cells plus a few
# hand-sized ones (Admurin's Death reaper is 88x80, which divides neither dimension evenly
# as a power of two) — so test every divisor in a sane range rather than a fixed list.
MIN_CELL = 8
MAX_CELL = 256


def divisors(n, lo=MIN_CELL, hi=MAX_CELL):
    return [d for d in range(lo, min(hi, n) + 1) if n % d == 0]


def alpha_grid(img):
    """Return (width, height, list-of-rows of bool opacity)."""
    a = img.convert("RGBA").getchannel("A")
    w, h = a.size
    px = a.load()
    return w, h, [[px[x, y] > 0 for x in range(w)] for y in range(h)]


def seam_violations(w, h, opaque, cw, ch):
    """Count opaque pixels that straddle a cell seam. A correct grid has zero (or near-zero):
    authored frames are padded inside their cell, so content never runs across a boundary."""
    v = 0
    for x in range(cw, w, cw):          # vertical seams
        for y in range(h):
            if opaque[y][x - 1] and opaque[y][x]:
                v += 1
    for y in range(ch, h, ch):          # horizontal seams
        for x in range(w):
            if opaque[y - 1][x] and opaque[y][x]:
                v += 1
    return v


def cell_bboxes(w, h, opaque, cw, ch):
    out = []
    for cy in range(h // ch):
        for cx in range(w // cw):
            x0, y0, x1, y1 = cw, ch, -1, -1
            for y in range(ch):
                row = opaque[cy * ch + y]
                for x in range(cw):
                    if row[cx * cw + x]:
                        if x < x0: x0 = x
                        if x > x1: x1 = x
                        if y < y0: y0 = y
                        if y > y1: y1 = y
            if x1 < 0:
                out.append(None)
            else:
                out.append({"col": cx, "row": cy, "x": x0, "y": y0,
                            "w": x1 - x0 + 1, "h": y1 - y0 + 1})
    return out


def study(path):
    img = Image.open(path)
    w, h, opaque = alpha_grid(img)
    candidates = []
    for cw in divisors(w):
        for ch in divisors(h):
            # Frames are close to square in every pack here; reject wild aspect ratios early.
            if not (0.4 <= cw / ch <= 2.5):
                continue
            n = (w // cw) * (h // ch)
            if n < 1 or n > 64:
                continue
            v = seam_violations(w, h, opaque, cw, ch)
            boxes = cell_bboxes(w, h, opaque, cw, ch)
            filled = [b for b in boxes if b]
            if not filled:
                continue
            # A correct grid puts each frame's content wholly inside its cell, at a
            # consistent scale. Penalise grids whose per-cell content varies wildly.
            widths = [b["w"] for b in filled]
            heights = [b["h"] for b in filled]
            spread = (max(widths) - min(widths)) + (max(heights) - min(heights))
            # Empty cells are only legitimate as a TRAILING run (an animation whose frame
            # count doesn't fill the last row). A hole in the middle means the grid is wrong.
            last_filled = max((i for i, b in enumerate(boxes) if b), default=-1)
            interior_holes = sum(1 for b in boxes[:last_filled + 1] if b is None)
            candidates.append({
                "cellW": cw, "cellH": ch, "cols": w // cw, "rows": h // ch,
                "frames": last_filled + 1, "gridCells": n,
                "seamViolations": v, "filledCells": len(filled),
                "interiorHoles": interior_holes, "contentSpread": spread,
                "maxContentW": max(widths), "maxContentH": max(heights),
            })
    clean = [c for c in candidates if c["seamViolations"] == 0 and c["interiorHoles"] == 0]
    # The true grid is the FINEST partition that never slices a sprite and leaves no interior
    # hole. A coarser grid (up to 1x1) is always seam-clean and therefore never informative;
    # a finer one would cut through contiguous sprite pixels. Ties break toward uniform frames.
    clean.sort(key=lambda c: (c["cellW"] * c["cellH"], c["contentSpread"]))
    best = clean[0] if clean else None
    return {
        "file": str(path),
        "imageSize": [w, h],
        "best": best,
        "cleanCandidates": clean[:6],
        "note": None if best else "NO CLEAN GRID — inspect by hand before use",
    }


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    files = []
    if args[0] == "--dir":
        files = sorted(Path(args[1]).rglob("*.png"))
    else:
        files = [Path(a) for a in args]
    results = [study(f) for f in files]
    for r in results:
        b = r["best"]
        label = (f"{b['cellW']}x{b['cellH']} cells · {b['cols']}x{b['rows']} grid · "
                 f"{b['frames']} frames · content up to {b['maxContentW']}x{b['maxContentH']}"
                 if b else r["note"])
        print(f"{Path(r['file']).name:46s} {r['imageSize'][0]:4d}x{r['imageSize'][1]:<4d}  {label}")
    out = Path("tools/out/pack-sheet-study.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
