#!/usr/bin/env python3
"""Render a purchased sheet as a LABELLED contact sheet so a human (or this session) can LOOK
at the decoded frames before any of them are integrated.

Two modes:
  grid   — a tileset: overlay the 16px cell grid, label every cell "c,r", upscale 6x.
  frames — a sprite sheet: decode with an explicit cell size, lay the frames out in a row,
           label each with its index and content bbox, upscale 4x.

Nothing here writes into assets/ — it only produces inspection images under tools/out/.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path("tools/out")


def upscale(img, factor):
    return img.resize((img.width * factor, img.height * factor), Image.NEAREST)


def checker(w, h, a=(28, 28, 34, 255), b=(44, 44, 52, 255), size=8):
    bg = Image.new("RGBA", (w, h), a)
    d = ImageDraw.Draw(bg)
    for y in range(0, h, size):
        for x in range(0, w, size):
            if (x // size + y // size) % 2:
                d.rectangle([x, y, x + size - 1, y + size - 1], fill=b)
    return bg


def grid_sheet(path, cell=16, factor=6):
    src = Image.open(path).convert("RGBA")
    cols, rows = src.width // cell, src.height // cell
    big = upscale(src, factor)
    canvas = checker(big.width, big.height)
    canvas.alpha_composite(big)
    d = ImageDraw.Draw(canvas)
    for c in range(cols + 1):
        d.line([(c * cell * factor, 0), (c * cell * factor, canvas.height)], fill=(255, 80, 80, 140))
    for r in range(rows + 1):
        d.line([(0, r * cell * factor), (canvas.width, r * cell * factor)], fill=(255, 80, 80, 140))
    for r in range(rows):
        for c in range(cols):
            d.text((c * cell * factor + 2, r * cell * factor + 1), f"{c},{r}", fill=(255, 240, 120, 255))
    out = OUT / f"grid-{Path(path).parent.parent.name}-{Path(path).stem}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print(f"{out}  {cols}x{rows} cells of {cell}px")
    return out


def content_bbox(img):
    return img.getchannel("A").getbbox()


def frames_sheet(paths, cell=64, factor=4, label=""):
    strips = []
    for path in paths:
        src = Image.open(path).convert("RGBA")
        cols, rows = src.width // cell, src.height // cell
        frames = []
        for r in range(rows):
            for c in range(cols):
                f = src.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell))
                if content_bbox(f):
                    frames.append(f)
        strips.append((Path(path).stem, frames))
    width = max(len(f) for _, f in strips) * cell * factor
    height = sum((cell * factor + 16) for _ in strips)
    canvas = checker(max(width, 320), height)
    d = ImageDraw.Draw(canvas)
    y = 0
    for name, frames in strips:
        d.text((3, y + 2), f"{name}  [{len(frames)} frames @ {cell}px]", fill=(255, 240, 120, 255))
        for i, f in enumerate(frames):
            big = upscale(f, factor)
            canvas.alpha_composite(big, (i * cell * factor, y + 14))
            bb = content_bbox(f)
            d.rectangle([i * cell * factor, y + 14, (i + 1) * cell * factor - 1, y + 13 + cell * factor],
                        outline=(90, 90, 110, 120))
            if bb:
                d.rectangle([i * cell * factor + bb[0] * factor, y + 14 + bb[1] * factor,
                             i * cell * factor + bb[2] * factor - 1, y + 13 + bb[3] * factor],
                            outline=(120, 255, 160, 160))
        y += cell * factor + 16
    out = OUT / f"frames-{label or Path(paths[0]).stem}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print(f"{out}")
    return out


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    mode = args[0]
    if mode == "grid":
        for p in args[1:]:
            grid_sheet(p)
    elif mode == "frames":
        label = args[1]
        frames_sheet(args[2:], label=label)
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
