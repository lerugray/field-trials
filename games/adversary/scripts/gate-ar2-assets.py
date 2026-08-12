#!/usr/bin/env python3
"""Image measurements for the AR2 gate driver. Reads JSON on stdin and writes JSON on stdout."""

import json
import sys
from pathlib import Path
from PIL import Image


def relative_luminance(rgb):
    channels = [value / 255 for value in rgb]
    linear = [
        value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
        for value in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def parse_hex(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def luminance_range(path, wash=None, wash_alpha=0):
    image = Image.open(path).convert("RGBA")
    wash_rgb = parse_hex(wash) if wash else None
    values = []
    for red, green, blue, alpha in image.getdata():
        if alpha == 0:
            continue
        if wash_rgb:
            red = round(red * (1 - wash_alpha) + wash_rgb[0] * wash_alpha)
            green = round(green * (1 - wash_alpha) + wash_rgb[1] * wash_alpha)
            blue = round(blue * (1 - wash_alpha) + wash_rgb[2] * wash_alpha)
        values.append(relative_luminance((red, green, blue)))
    if not values:
        raise ValueError(f"no opaque pixels: {path}")
    return {
        "mean": sum(values) / len(values),
        "min": min(values),
        "max": max(values),
    }


def checkerboard_score(path):
    """Fraction of horizontal/vertical ABA triples: a direct measure of dither-like alternation."""
    image = Image.open(path).convert("RGB")
    pixels = image.load()
    hits = 0
    total = 0
    for y in range(image.height):
        for x in range(1, image.width - 1):
            total += 1
            hits += pixels[x - 1, y] == pixels[x + 1, y] and pixels[x, y] != pixels[x - 1, y]
    for x in range(image.width):
        for y in range(1, image.height - 1):
            total += 1
            hits += pixels[x, y - 1] == pixels[x, y + 1] and pixels[x, y] != pixels[x, y - 1]
    return hits / total if total else 0


def main():
    request = json.load(sys.stdin)
    root = Path(request["root"])
    response = {"tiles": {}, "enemies": {}}
    for theme, spec in request["themes"].items():
        path = root / spec["file"]
        luminance = luminance_range(path, spec["wash"], request["washAlpha"])
        response["tiles"][theme] = {
            "meanLuminance": luminance["mean"],
            "minLuminance": luminance["min"],
            "maxLuminance": luminance["max"],
            "checkerboardScore": checkerboard_score(path),
        }
    for enemy, file in request["enemies"].items():
        luminance = luminance_range(root / file)
        response["enemies"][enemy] = {
            "meanLuminance": luminance["mean"],
        }
    json.dump(response, sys.stdout)


if __name__ == "__main__":
    main()
