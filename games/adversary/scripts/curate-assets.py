#!/usr/bin/env python3
"""Curate purchased Willibab / Monsteretrope assets into assets/art/.
Crops/scales to side-scooter-friendly sizes, preserves transparency, writes MANIFEST.json.
Run from repo root: python3 scripts/curate-assets.py"""

import argparse
import hashlib
import json
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC_LIBRARY = Path("/Users/rayweiss/Desktop/Dev Work/pixel-art-library/extracted")
OUT = ROOT / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)
TOOLS_OUT = ROOT / "tools" / "out"
TOOLS_OUT.mkdir(parents=True, exist_ok=True)

# Palette-conform toggle.  KEEP OFF for shipped assets — raw pack colours are the default.
CONFORM_PALETTE = False


def pack_root(*parts):
    return SRC_LIBRARY.joinpath(*parts)


def _iter_pixels(img):
    """Yield (r, g, b, a) tuples for every pixel without deprecated getdata()."""
    pixels = img.load()
    for y in range(img.height):
        for x in range(img.width):
            yield pixels[x, y]


def conform_to_palette(img, palette_rgb_list):
    """Map every non-transparent pixel to the nearest Euclidean RGB palette colour."""
    palette = [tuple(c) for c in palette_rgb_list]
    if not palette:
        return img.copy()
    data = []
    for r, g, b, a in _iter_pixels(img):
        if a == 0:
            data.append((r, g, b, a))
        else:
            best = min(
                palette,
                key=lambda c: (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2,
            )
            data.append((*best, a))
    out = Image.new("RGBA", img.size)
    out.putdata(data)
    return out


def extract_project_palette(max_colors=48):
    """Build a project-specific palette from curated outputs and Enemy_Galore sources."""
    colors = []
    if OUT.exists():
        for p in OUT.glob("*.png"):
            try:
                with Image.open(p) as img:
                    img = img.convert("RGBA")
                    colors.extend((r, g, b) for r, g, b, a in _iter_pixels(img) if a > 0)
            except Exception:
                pass
    for pack in ["Enemy_Galore_I", "Enemy_Galore_II", "Enemy_Galore_IV"]:
        base = SRC_LIBRARY / pack
        if not base.exists():
            continue
        for p in base.rglob("*.png"):
            try:
                with Image.open(p) as img:
                    img = img.convert("RGBA")
                    colors.extend((r, g, b) for r, g, b, a in _iter_pixels(img) if a > 0)
            except Exception:
                pass
    return [list(c) for c, _ in Counter(colors).most_common(max_colors)]


def process(src, out_name, *, size=None, crop=None, scale_filter=Image.NEAREST,
            outline=None, integer_reduction=None, preserve_existing=False):
    img = Image.open(src).convert("RGBA")
    if crop:
        img = img.crop(crop)
    if size:
        if integer_reduction:
            if img.width != size[0] * integer_reduction or img.height != size[1] * integer_reduction:
                raise ValueError(
                    f"{src}: {img.size} is not an exact {integer_reduction}x reduction to {size}"
                )
            # Match scripts/proof-hero-candidates.mjs exactly: sample the top-left pixel of every
            # integer factor block (source coordinates x*factor, y*factor), with no interpolation.
            reduced = Image.new("RGBA", size)
            reduced.putdata([
                img.getpixel((x * integer_reduction, y * integer_reduction))
                for y in range(size[1]) for x in range(size[0])
            ])
            img = reduced
        else:
            img = img.resize(size, scale_filter)
    if outline:
        # Targeted readability treatment: dilate the alpha mask by one pixel, then place the
        # untouched purchased sprite over the pale rim. Expanding the canvas preserves every
        # original pixel and keeps the outline outside the authored silhouette.
        padded = Image.new("RGBA", (img.width + 2, img.height + 2), (0, 0, 0, 0))
        padded.alpha_composite(img, (1, 1))
        alpha = padded.getchannel("A")
        rim = alpha.filter(ImageFilter.MaxFilter(3))
        rim_only = rim.point(lambda value: 255 if value else 0)
        rim_layer = Image.new("RGBA", padded.size, outline)
        rim_layer.putalpha(rim_only)
        rim_layer.alpha_composite(padded)
        img = rim_layer
    out_path = OUT / out_name
    # These character PNGs were readability-certified in the earlier art round. The legacy crop
    # recipe remains available for a fresh checkout, but a normal curator rerun must not replace
    # the certified copy with a Pillow-version-dependent resample/compression result.
    if not (preserve_existing and out_path.exists()):
        img.save(out_path, "PNG")
    return out_path


def make_manifest():
    return {
        "attribution": "Art assets: commissioned hero paint-over plus Willibab / Monsteretrope (see each asset's license)",
        "license": "Per-asset terms in this manifest",
        "note": (
            "Operator decision 2026-08-10: Ray-certified paint-over Variant B is the protagonist. "
            "The former Willibab candidate B remains recorded under assets/art/backup/willibab-candidate-b/."
        ),
        "hero": {},
        "heroHandAnchors": {},
        "assets": []
    }


def add_asset(manifest, file, source_pack, source_file, license_, usage, fit, round_="AR1",
              license_source=None, processing=None, grid=None, bottom_inset=None):
    record = {
        "file": file,
        "sourcePack": source_pack,
        "sourceFile": source_file,
        "license": license_,
        "round": round_,
        "usage": usage,
        "fit": fit
    }
    if license_source:
        record["licenseSource"] = license_source
    if processing:
        record["processing"] = processing
    if grid:
        record["grid"] = grid
    if bottom_inset is not None:
        record["bottomInset"] = bottom_inset
    manifest["assets"].append(record)


try:
    FLIP_LEFT_RIGHT = Image.Transpose.FLIP_LEFT_RIGHT
except AttributeError:
    FLIP_LEFT_RIGHT = Image.FLIP_LEFT_RIGHT

WALKER_SKINS = {"zombie", "bones_gladiator", "zombslime"}
HOPPER_SKINS = {"slime_spiked", "bat", "rat"}

ENEMY_GALORE_ENEMIES = [
    {
        "skin": "zombie",
        "pack": "Admurin Enemy_Galore_II",
        "source_root": ("Enemy_Galore_II", "Zombie"),
        "mirror": True,
        "fit": "slow left-facing cemetery walker mirrored for right play",
        "usage": {
            "idle": "cemetery walker idle animation strip",
            "run": "cemetery walker shamble animation strip",
            "attack": "cemetery walker lunge attack strip",
            "hit": "cemetery walker damage reaction strip",
            "death": "cemetery walker death strip",
        },
        "anims": {
            "idle": {"file": "Zomb_Idle.png", "frames": 4},
            "run": {"file": "Zomb_Run.png", "frames": 8},
            "attack": {"file": "Zomb_AttackA.png", "frames": 4},
            "hit": {"file": "Zomb_Hit.png", "frames": 8},
            "death": {"file": "Zomb_Death.png", "frames": 8},
        },
    },
    {
        "skin": "slime_spiked",
        "pack": "Admurin Enemy_Galore_I",
        "source_root": ("Enemy_Galore_I", "Slime"),
        "mirror": True,
        "fit": "spiked slime hopper mirrored for right play; jump attack reads as a spring threat",
        "usage": {
            "idle": "spiked slime idle animation strip",
            "run": "spiked slime hop animation strip",
            "attack": "spiked slime jump attack strip",
            "hit": "spiked slime damage reaction strip",
            "death": "spiked slime death dissolve strip",
        },
        "anims": {
            "idle": {"file": "Slime_Spiked_Idle.png", "frames": 4},
            "run": {"file": "Slime_Spiked_Run.png", "frames": 4},
            "attack": {"file": "Slime_Spiked_Jump.png", "frames": 8},
            "hit": {"file": "Slime_Spiked_Hit.png", "frames": 4},
            "death": {"file": "Slime_Spiked_Death.png", "frames": 8},
        },
    },
    {
        "skin": "bones_gladiator",
        "pack": "Admurin Enemy_Galore_IV",
        "source_root": ("Enemy_Galore_IV", "Bones", "Bones - Gladiator"),
        "mirror": False,
        "fit": "right-facing skeletal gladiator; no mirror needed",
        "usage": {
            "idle": "skeleton gladiator idle animation strip",
            "run": "skeleton gladiator walk animation strip",
            "attack": "skeleton gladiator sword attack strip",
            "hit": "skeleton gladiator damage reaction strip",
            "death": "skeleton gladiator collapse strip",
        },
        "anims": {
            "idle": {"file": "Bones_Gladiator_Idle.png", "frames": 4},
            "run": {"file": "Bones_Gladiator_Walk.png", "frames": 8},
            "attack": {"file": "Bones_Gladiator_Attack.png", "frames": 3},
            "hit": {"file": "Bones_Gladiator_Hit.png", "frames": 3},
            "death": {"file": "Bones_Gladiator_Death.png", "frames": 12},
        },
    },
    {
        "skin": "bat",
        "pack": "Admurin Enemy_Galore_I",
        "source_root": ("Enemy_Galore_I", "Bat"),
        "mirror": True,
        "fit": "left-facing cave bat mirrored for right play; flying hopper silhouette",
        "usage": {
            "idle": "cave bat idle/fly animation strip",
            "run": "cave bat fly animation strip",
            "attack": "cave bat swoop attack strip",
            "hit": "cave bat damage reaction strip",
            "death": "cave bat death strip",
        },
        "anims": {
            "idle": {"file": "Bat_Fly.png", "frames": 4},
            "run": {"file": "Bat_Fly.png", "frames": 4},
            "attack": {"file": "Bat_Attack.png", "frames": 8},
            "hit": {"file": "Bat_Hit.png", "frames": 8},
            "death": {"file": "Bat_Death.png", "frames": 12},
        },
    },
    {
        "skin": "rat",
        "pack": "Admurin Enemy_Galore_I",
        "source_root": ("Enemy_Galore_I", "Rat"),
        "mirror": True,
        "fit": "left-facing giant rat mirrored for right play; scurrying hopper",
        "usage": {
            "idle": "giant rat idle animation strip",
            "run": "giant rat run animation strip",
            "attack": "giant rat bite attack strip",
            "hit": "giant rat damage reaction strip",
            "death": "giant rat death dissolve strip",
        },
        "anims": {
            "idle": {"file": "Rat_Idle.png", "frames": 4},
            "run": {"file": "Rat_Run.png", "frames": 8},
            "attack": {"file": "Rat_Attack.png", "frames": 8},
            "hit": {"file": "Rat_Hit.png", "frames": 8},
            "death": {"file": "Rat_Hit.png", "frames": 8},
        },
    },
    {
        "skin": "zombslime",
        "pack": "Admurin Enemy_Galore_II",
        "source_root": ("Enemy_Galore_II", "Zomblime"),
        "mirror": True,
        "fit": "left-facing zomblime mirrored for right play; toxic slime walker",
        "usage": {
            "idle": "zomblime idle animation strip",
            "run": "zomblime hop animation strip",
            "attack": "zomblime bite attack strip",
            "hit": "zomblime damage reaction strip",
            "death": "zomblime death strip",
        },
        "anims": {
            "idle": {"file": "Zomblime_Idle.png", "frames": 4},
            "run": {"file": "Zomblime_Run.png", "frames": 8},
            "attack": {"file": "Zomb_AttackA.png", "frames": 4},
            "hit": {"file": "Zomblime_Hit.png", "frames": 8},
            "death": {"file": "Zomblime_Death.png", "frames": 8},
        },
    },
]


def process_enemy_galore_enemies(manifest, compare=False):
    """Curate Admurin Enemy_Galore enemies into horizontal strip PNGs."""
    processing_note = (
        "64x64 source cell decoded; per-enemy shared union bbox across all frames; "
        "frames mirrored for left-facing source; cropped and concatenated into horizontal strip; "
        "raw pack colours (conform toggle off)"
    )
    license_text = (
        "Commercial use permitted in games; redistribution as stand-alone assets prohibited; "
        "credit optional"
    )
    palette = extract_project_palette() if (CONFORM_PALETTE or compare) else []
    compare_rows = {}

    for enemy in ENEMY_GALORE_ENEMIES:
        skin = enemy["skin"]
        pack = enemy["pack"]
        source_root = enemy["source_root"]
        mirror = enemy["mirror"]
        fit_base = enemy["fit"]

        # Decode every animation for this enemy, mirroring where required.
        frames_by_anim = {}
        all_frames = []
        anim_src_info = {}
        for anim, spec in enemy["anims"].items():
            src = pack_root(*source_root, spec["file"])
            img = Image.open(src).convert("RGBA")
            cell_w = cell_h = 64
            cols = img.width // cell_w
            rows = img.height // cell_h
            frames = spec.get("frames")
            if frames is None:
                frames = cols * rows
            anim_frames = []
            for i in range(frames):
                row = i // cols
                col = i % cols
                cell = img.crop(
                    (col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h)
                )
                if mirror:
                    cell = cell.transpose(FLIP_LEFT_RIGHT)
                anim_frames.append(cell)
            # Trim trailing fully-transparent frames so the renderer never loops into blank
            # cells (e.g. Bat_Hit / Rat_Hit have empty recovery frames at the end).
            while anim_frames and anim_frames[-1].getbbox() is None:
                anim_frames.pop()
            frames = len(anim_frames)
            frames_by_anim[anim] = anim_frames
            all_frames.extend(anim_frames)
            anim_src_info[anim] = (str(src.relative_to(SRC_LIBRARY)), frames)

        # Union bbox across all frames of this enemy.
        bboxes = [f.getbbox() for f in all_frames]
        non_empty = [b for b in bboxes if b]
        if not non_empty:
            union = (0, 0, 64, 64)
        else:
            union = (
                min(b[0] for b in non_empty),
                min(b[1] for b in non_empty),
                max(b[2] for b in non_empty),
                max(b[3] for b in non_empty),
            )
        uw, uh = union[2] - union[0], union[3] - union[1]

        # Ground-contact inset relative to the idle frame's lowest opaque row.
        idle_frames = frames_by_anim.get("idle") or frames_by_anim.get("run", [])
        idle_bbox = idle_frames[0].getbbox() if idle_frames else None
        bottom_inset = union[3] - idle_bbox[3] if idle_bbox else 0

        prefix = "enemy_walker" if skin in WALKER_SKINS else "enemy_hopper"
        compare_anim = "idle" if "idle" in frames_by_anim else "run"

        for anim, anim_frames in frames_by_anim.items():
            frames = len(anim_frames)
            strip = Image.new("RGBA", (uw * frames, uh))
            for i, f in enumerate(anim_frames):
                strip.paste(f.crop(union), (i * uw, 0))

            raw_strip = strip.copy()
            if CONFORM_PALETTE and palette:
                strip = conform_to_palette(strip, palette)

            out_name = f"{prefix}_{skin}_{anim}.png"
            strip.save(OUT / out_name, "PNG")

            src_path, measured_frames = anim_src_info[anim]
            source_file = (
                f"{src_path} [{anim}; measured {measured_frames} frame"
                f"{'s' if measured_frames != 1 else ''}]"
            )
            grid = {"cellW": cell_w, "cellH": cell_h, "frames": measured_frames}
            add_asset(
                manifest,
                out_name,
                pack,
                source_file,
                license_text,
                enemy["usage"][anim],
                fit_base,
                round_="AR2-ART-PASS",
                license_source=None,
                processing=processing_note,
                grid=grid,
                bottom_inset=bottom_inset,
            )

            if anim == compare_anim:
                compare_rows[skin] = {
                    "raw": raw_strip,
                    "conformed": conform_to_palette(raw_strip, palette) if palette else raw_strip.copy(),
                    "anim": anim,
                    "pack": pack,
                }

    return compare_rows


def render_conform_comparison(compare_rows, timestamp):
    """Render a side-by-side raw vs palette-conformed grid for the new enemies."""
    if not compare_rows:
        return None
    palette = extract_project_palette()
    margin = 8
    label_w = 150
    header_h = 24
    font = ImageFont.load_default()

    col_w = 0
    row_h = 0
    for info in compare_rows.values():
        raw = info["raw"]
        conf = conform_to_palette(raw, palette) if palette else raw.copy()
        col_w = max(col_w, max(raw.width, conf.width) + margin * 2)
        row_h = max(row_h, max(raw.height, conf.height) + margin * 2)

    canvas_w = label_w + col_w * 2
    canvas_h = header_h + row_h * len(compare_rows)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (35, 35, 40, 255))
    draw = ImageDraw.Draw(canvas)

    draw.text(
        (label_w + col_w // 2, header_h // 2),
        "RAW",
        fill=(255, 255, 255, 255),
        anchor="mm",
        font=font,
    )
    draw.text(
        (label_w + col_w + col_w // 2, header_h // 2),
        "CONFORMED",
        fill=(255, 255, 255, 255),
        anchor="mm",
        font=font,
    )

    y = header_h
    for skin, info in compare_rows.items():
        raw = info["raw"]
        conf = conform_to_palette(raw, palette) if palette else raw.copy()
        label = f"{skin} ({info['anim']})"
        draw.text(
            (4, y + row_h // 2),
            label,
            fill=(255, 255, 255, 255),
            anchor="lm",
            font=font,
        )
        raw_x = label_w + (col_w - raw.width) // 2
        raw_y = y + (row_h - raw.height) // 2
        canvas.paste(raw, (raw_x, raw_y), raw)
        conf_x = label_w + col_w + (col_w - conf.width) // 2
        conf_y = y + (row_h - conf.height) // 2
        canvas.paste(conf, (conf_x, conf_y), conf)
        y += row_h

    out_path = TOOLS_OUT / f"conform-compare-{timestamp}.png"
    canvas.save(out_path, "PNG")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Curate adversary-game art assets.")
    parser.add_argument(
        "--compare-conform",
        action="store_true",
        help="Render a side-by-side raw vs palette-conformed comparison image.",
    )
    args = parser.parse_args()

    manifest = make_manifest()

    # --- Recorded backup: AR2e/AR3 Willibab candidate B. Never loaded by the game. ---
    player_src = pack_root(
        "My_Character_Creator_Pack", "My_Character_Creator_Pack", "Examples", "hero9.png"
    )
    player_license = (
        "Personal and commercial projects permitted; editing/combining and exported character "
        "sheets permitted; credit appreciated but not required"
    )
    player_license_source = (
        "My_Character_Creator_Pack/My_Character_Creator_Pack/readme.txt "
        "[TERMS OF USE: commercial use + editing/combining + exported sheets permitted]"
    )
    player_processing = (
        "72x72 source cell cropped on integer bounds; exact 1/4 top-left integer-lattice reduction "
        "to 18x18 (same sampler as the AR2d candidate strip); transparency preserved; no generation"
    )
    # RPG Maker MZ side-view layout. hero9's nominal walk and swing groups contain duplicate cells,
    # and the body sheet expects a separate RPG Maker weapon overlay. AR3B therefore uses two
    # distinct evade cells for the run, a raised-hand skill cell for wind-up, and the two native
    # thrust body poses for release/extension. The renderer attaches its code-drawn blade at the
    # measured per-frame hand anchors above. Source cells face left and mirror for right-facing play.
    player_frames = [
        ("player_walk_0.png", "walk frame 0", 0, 0, "AR2E"),
        ("player_walk_1.png", "walk frame 1", 0, 1, "AR2E"),
        ("player_walk_2.png", "walk frame 2", 0, 2, "AR2E"),
        ("player_run_0.png", "evade/dash run frame 0", 1, 6, "AR3B"),
        ("player_run_1.png", "evade/dash run frame 1", 1, 7, "AR3B"),
        ("player_idle_0.png", "idle/wait frame 0", 0, 3, "AR2E"),
        ("player.png", "idle/wait frame 1 (canonical still)", 0, 4, "AR2E"),
        ("player_idle_2.png", "idle/wait frame 2", 0, 5, "AR2E"),
        ("player_attack_0.png", "skill/coiled wind-up frame", 3, 0, "AR3B"),
        ("player_attack_1.png", "thrust/lunge frame 0", 2, 0, "AR3B"),
        ("player_attack_2.png", "thrust/lunge frame 1", 2, 1, "AR3B"),
        ("player_hurt.png", "damage/hurt frame", 1, 4, "AR3A"),
    ]
    backup_dir = OUT / "backup" / "willibab-candidate-b"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for out_name, motion, row, col, round_ in player_frames:
        crop = (col * 72, row * 72, (col + 1) * 72, (row + 1) * 72)
        backup_name = f"backup/willibab-candidate-b/{out_name}"
        backup_path = backup_dir / out_name
        img = Image.open(player_src).convert("RGBA").crop(crop)
        reduced = Image.new("RGBA", (18, 18))
        reduced.putdata([
            img.getpixel((x * 4, y * 4))
            for y in range(18) for x in range(18)
        ])
        reduced.save(backup_path, "PNG")
        add_asset(
            manifest, backup_name, "My_Character_Creator_Pack",
            str(player_src.relative_to(SRC_LIBRARY)) + f" [{motion}; row{row}/col{col}]",
            player_license, f"recorded backup protagonist {motion}",
            "Former candidate B red/orange shield fighter; retained byte-for-byte as the operator-requested backup; not loaded at runtime",
            round_=f"{round_}-BACKUP", license_source=player_license_source,
            processing=player_processing,
        )
        manifest["assets"][-1]["runtime"] = False

    # --- Ray-certified protagonist paint-over. All headgear variants remain one-constant loadable. ---
    geometry_path = ROOT / "tools" / "derived" / "rig-geometry.json"
    geometry = json.loads(geometry_path.read_text(encoding="utf-8"))
    headgear_options = ["bareheaded", "hooded", "helmed"]
    default_headgear = "bareheaded"  # OPERATOR PICK: Variant B, docs/hero-draft/NOTES.md
    hero_license = (
        "Purchased human-made base; commercial use and modification authorized by Ray's "
        "2026-08-10 operator ruling; authored commissioned-class paint-over"
    )
    hero_license_source = "docs/hero-draft/PROVENANCE.md"
    hero_strips = {}
    hero_hand_anchors = {
        "coordinateSpace": "canonical-left strip-frame pixels; derived from frontArm/blade class masks",
        "source": "tools/derived/rig-geometry.json",
    }
    for variant in headgear_options:
        for anim, sheet in geometry["sheets"].items():
            src = TOOLS_OUT / variant / f"{anim}.png"
            out_name = f"player_{variant}_{anim}.png"
            shutil.copyfile(src, OUT / out_name)
            img = Image.open(src).convert("RGBA")
            frame_w = sheet["frameW"]
            frame_h = sheet["frameH"]
            frame_anchors = []
            for index in range(sheet["frameCount"]):
                frame = img.crop((index * frame_w, 0, (index + 1) * frame_w, frame_h))
                bbox = frame.getbbox()
                if not bbox:
                    raise ValueError(f"{src}: empty frame {index}")
                frame_anchors.append({"x": frame_w / 2, "y": bbox[3] - 1})
            grid = {
                "cellW": frame_w,
                "cellH": frame_h,
                "frames": sheet["frameCount"],
                "frameAnchors": frame_anchors,
            }
            add_asset(
                manifest, out_name, "2D-Pixel-Art-Character-Template paint-over",
                f"tools/out/{variant}/{anim}.png [{sheet['verb']}; canonical left]",
                hero_license, f"protagonist {sheet['verb']} strip ({variant})",
                "Ray-certified Variant B silhouette/timing paint-over; nearest-neighbour strip; feet-rooted; canonical left and mirrored only for right-facing play",
                round_="HERO-INTEGRATION", license_source=hero_license_source,
                processing="Certified paint-over pipeline output copied without resampling; see tools/README.md",
                grid=grid,
            )
            manifest["assets"][-1]["sha256"] = hashlib.sha256((OUT / out_name).read_bytes()).hexdigest()
            if variant == default_headgear:
                hero_strips[anim] = {
                    "asset": out_name.removesuffix(".png"),
                    "verb": sheet["verb"],
                    "frameW": frame_w,
                    "frameH": frame_h,
                    "frames": sheet["frameCount"],
                    "loops": sheet["loops"],
                    "frameAnchors": frame_anchors,
                    "rigFeet": [
                        {"x": frame["content"]["feetX"], "y": frame["content"]["feetY"]}
                        for frame in sheet["frames"]
                    ],
                }
                weapon_frames = {
                    str(frame["index"]): frame["anchors"]
                    for frame in sheet["frames"] if frame.get("anchors")
                }
                if weapon_frames:
                    hero_hand_anchors[anim] = weapon_frames

    manifest["hero"] = {
        "defaultHeadgear": default_headgear,
        "headgearOptions": headgear_options,
        "variant": "B",
        "canonicalFacing": geometry["canonicalFacing"],
        "geometrySource": "tools/derived/rig-geometry.json",
        "stripCount": len(hero_strips),
        "frameCount": sum(strip["frames"] for strip in hero_strips.values()),
        "facingAudit": {
            "rawDashTrailOffset": -7.95,
            "rawSourceFacing": "right",
            "normalisedDashTrailOffset": 7.95,
            "normalisedTrailSide": "right",
            "rule": "trail streams backward from a canonical-left hero",
        },
        "strips": hero_strips,
    }
    manifest["heroHandAnchors"] = hero_hand_anchors

    # Replace legacy player_* payloads with certified Variant B frames while preserving their old
    # filenames for downstream tooling. Runtime animation uses the full strips above.
    legacy_aliases = {
        "player_walk_0.png": ("walk", 0), "player_walk_1.png": ("walk", 1), "player_walk_2.png": ("walk", 2),
        "player_run_0.png": ("run", 0), "player_run_1.png": ("run", 1),
        "player_idle_0.png": ("idle", 0), "player.png": ("idle", 1), "player_idle_2.png": ("idle", 2),
        "player_attack_0.png": ("katana_combo", 0), "player_attack_1.png": ("katana_combo", 1),
        "player_attack_2.png": ("katana_combo", 4), "player_hurt.png": ("hurt", 1),
    }
    for out_name, (anim, index) in legacy_aliases.items():
        sheet = geometry["sheets"][anim]
        src = Image.open(TOOLS_OUT / default_headgear / f"{anim}.png").convert("RGBA")
        frame_w, frame_h = sheet["frameW"], sheet["frameH"]
        frame = src.crop((index * frame_w, 0, (index + 1) * frame_w, frame_h))
        frame.save(OUT / out_name, "PNG")
        add_asset(
            manifest, out_name, "2D-Pixel-Art-Character-Template paint-over",
            f"tools/out/{default_headgear}/{anim}.png [frame {index}]", hero_license,
            f"certified protagonist compatibility frame: {anim} {index}",
            "Compatibility alias for proof and fallback tooling; the live renderer uses the full certified strip",
            round_="HERO-INTEGRATION", license_source=hero_license_source,
            processing="Lossless frame crop from certified strip; no resampling",
        )

    # --- Enemies ---
    walker_src = pack_root("Retro_8bit_Monster_Pack", "Retro_8bit_Monster_Pack", "Normal Size", "Style 1", "Undead_Minion_2.png")
    process(walker_src, "enemy_walker.png", size=(27, 24), preserve_existing=True)
    add_asset(manifest, "enemy_walker.png",
              "Retro_8bit_Monster_Pack",
              str(walker_src.relative_to(SRC_LIBRARY)),
              "CC BY",
              "walker enemy sprite",
              "shambling undead reads as a side-view ground threat")

    hopper_src = pack_root("Retro_8bit_Monster_Pack", "Retro_8bit_Monster_Pack", "Normal Size", "Style 1", "Demon_Onimp_2.png")
    process(hopper_src, "enemy_hopper.png", size=(22, 22), outline=(230, 220, 191, 255),
            preserve_existing=True)
    add_asset(manifest, "enemy_hopper.png",
              "Retro_8bit_Monster_Pack",
              str(hopper_src.relative_to(SRC_LIBRARY)),
              "CC BY",
              "hopper enemy sprite",
              "compact horned imp fits the small springer role; AR2 adds a 1px pale-bone outer rim for dark-ground contrast")

    boss_src = pack_root("Retro_8bit_Monster_Pack", "Retro_8bit_Monster_Pack", "Normal Size", "Style 1", "Demon_Titan.png")
    process(boss_src, "boss.png", size=(69, 56), preserve_existing=True)
    add_asset(manifest, "boss.png",
              "Retro_8bit_Monster_Pack",
              str(boss_src.relative_to(SRC_LIBRARY)),
              "CC BY",
              "boss sprite",
              "large sword-wielding demon titan reads as a stage-ending boss")

    # --- Weapon icons (HUD/menu) ---
    weapon_icons = [
        ("BLADE_01.png", "icon_blade.png", "short blade / sword icon"),
        ("SPEAR_01.png", "icon_spear.png", "spear icon"),
        ("AXE_01.png", "icon_axe.png", "axe icon"),
        ("MACE_01.png", "icon_mace.png", "mace icon"),
    ]
    for src_name, out_name, usage in weapon_icons:
        # Use the Weapon_Pack bundled under Simple-8-bit-Sideview-Battlers so the verified pack readme applies.
        src = pack_root(
            "Simple-8-bit-Sideview-Battlers",
            "Simple 8-bit Sideview Battlers",
            "Simple 8-bit Sideview Battlers",
            "Style 1", "Weapon_Pack", "weapons", src_name
        )
        # The sheet shows two weapon copies side-by-side in a 432x96 canvas.
        # Crop the left half, trim transparent margins, then scale.
        img = Image.open(src).convert("RGBA")
        left = img.crop((0, 0, img.width // 2, img.height))
        bbox = left.getbbox()
        if bbox:
            left = left.crop(bbox)
        # Preserve aspect ratio and fit within 24x16.
        left.thumbnail((24, 16), Image.NEAREST)
        out_path = OUT / out_name
        left.save(out_path, "PNG")
        add_asset(manifest, out_name,
                  "Simple-8-bit-Sideview-Battlers (Weapon_Pack subset)",
                  str(src.relative_to(SRC_LIBRARY)) + " [left half, trimmed]",
                  "CC BY",
                  usage,
                  "small diagonal weapon reads clearly as a HUD icon")

    # --- Retro Icons (HUD indicators) ---
    # Iconset.png is 512x1408 = 16 cols x 44 rows of 32x32 cells.
    icon_src = pack_root("Willibab-s-Retro-Icons", "Willibab's Retro Icons", "Willibab's Retro Icons", "Iconset.png")
    icon_cells = [
        ("icon_heart.png", (6, 2), "HP/heart indicator"),
        ("icon_coin.png", (10, 3), "gold/coin indicator"),
        ("icon_sword.png", (5, 6), "weapon indicator"),
    ]
    for out_name, (col, row), usage in icon_cells:
        x, y = col * 32, row * 32
        process(icon_src, out_name, crop=(x, y, x + 32, y + 32), size=(10, 10))
        add_asset(manifest, out_name,
                  "Willibab-s-Retro-Icons",
                  str(icon_src.relative_to(SRC_LIBRARY)) + f" [cell col{col}/row{row}]",
                  "CC BY",
                  usage,
                  "small recognizable retro icon for HUD")

    # --- AR2 environment: side-view-safe texture and sparse period dressing ---
    # The source packs are RPG tilesets, so only isolated 16px masonry faces and vertically-reading
    # props are legal fits for this side-scroller. No top-down floors, roofs, or map furniture ship.
    dungeon_a4 = pack_root(
        "WILLIBAB_DUNGEON", "WILLIBAB_DUNGEON", "1x", "tilesets", "D_A4_01.png"
    )
    castle_a4 = pack_root(
        "WILLIBAB_CASTLE", "WILLIBAB_CASTLE", "1x", "Tileset", "CASTLE_A4.png"
    )
    castle_c = pack_root(
        "WILLIBAB_CASTLE", "WILLIBAB_CASTLE", "1x", "Tileset", "Castle_C.png"
    )

    environment_assets = [
        (
            dungeon_a4, "env_tile_cemetery.png", (80, 48, 96, 64),
            "WILLIBAB_DUNGEON", "cemetery platform-face stone block",
            "neutral clustered stone face reads correctly in side view; moss cap is added by the renderer"
        ),
        (
            dungeon_a4, "env_tile_crypt.png", (32, 48, 48, 64),
            "WILLIBAB_DUNGEON", "crypt platform-face masonry",
            "clean grey brick face separates solid crypt geometry from the local backdrop"
        ),
        (
            castle_a4, "env_tile_keep.png", (0, 208, 16, 224),
            "WILLIBAB_CASTLE", "keep platform-face masonry",
            "chunky castle brick face reads as a vertical side-view wall without top-down cues"
        ),
        (
            castle_c, "env_prop_banner.png", (240, 0, 256, 32),
            "WILLIBAB_CASTLE", "sparse keep banner dressing",
            "vertical hanging banner reads cleanly against a side-view wall"
        ),
        (
            dungeon_a4, "env_prop_gargoyle.png", (224, 48, 240, 80),
            "WILLIBAB_DUNGEON", "sparse crypt wall relief",
            "framed stone relief reads as recessed period architecture, not traversable geometry"
        ),
    ]
    for src, out_name, crop, pack, usage, fit in environment_assets:
        process(src, out_name, crop=crop)
        add_asset(
            manifest, out_name, pack,
            str(src.relative_to(SRC_LIBRARY)) + f" [crop {crop}]",
            "CC BY", usage, fit, round_="AR2"
        )

    # --- AR2-ART-PASS: Admurin Enemy_Galore animated enemy strips ---
    compare_rows = process_enemy_galore_enemies(manifest, compare=args.compare_conform)

    manifest_path = OUT / "MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Generate the runtime assets module (base64 data URIs, no runtime fs dependency).
    assets_js = ROOT / "src" / "render" / "assets.js"
    assets_js_lines = [
        "// assets.js — AUTO-GENERATED by scripts/curate-assets.py",
        "// Curated Willibab / Monsteretrope art embedded as base64 data URIs; see MANIFEST.json.",
        "// In headless environments (tests) the Image constructor is absent, so getAsset returns null",
        "// and the renderer falls back to the existing code-drawn sprites.",
        "",
        "const ASSET_DEFS = {",
    ]
    import base64 as b64mod
    for asset in manifest["assets"]:
        if asset.get("runtime") is False:
            continue
        file = asset["file"]
        aid = file.replace(".png", "")
        data = (OUT / file).read_bytes()
        b64 = b64mod.b64encode(data).decode("ascii")
        img = Image.open(OUT / file)
        w, h = img.size
        if "bottomInset" in asset:
            bottom_inset = asset["bottomInset"]
        else:
            bbox = img.getbbox()
            bottom_inset = h - bbox[3] if bbox else 0
        extras = f"bottomInset: {bottom_inset}"
        grid = asset.get("grid")
        if grid and grid.get("frames", 1) > 1:
            frames = grid["frames"]
            frame_width = w // frames
            extras += f", frames: {frames}, frameWidth: {frame_width}"
            if grid.get("frameAnchors"):
                anchors = json.dumps(grid["frameAnchors"], separators=(",", ":"))
                extras += f", frameAnchors: {anchors}"
        assets_js_lines.append(
            f"  '{aid}': {{ src: 'data:image/png;base64,{b64}', width: {w}, height: {h}, "
            f"{extras} }},"
        )
    assets_js_lines.append("};")
    assets_js_lines.append("")
    anchors_json = json.dumps(manifest["heroHandAnchors"], separators=(",", ":"))
    assets_js_lines.append(f"export const HERO_HAND_ANCHORS = Object.freeze({anchors_json});")
    hero_json = json.dumps(manifest["hero"], separators=(",", ":"))
    assets_js_lines.append(f"export const HERO_RIG = Object.freeze({hero_json});")
    assets_js_lines.append("// Single runtime headgear switch. All three certified strip sets are embedded above.")
    assets_js_lines.append(f"export const PLAYER_HEADGEAR = '{default_headgear}';")
    assets_js_lines.append("export const PLAYER_HEADGEAR_OPTIONS = Object.freeze(HERO_RIG.headgearOptions);")
    assets_js_lines.append("export function playerStripAssetId(animation, headgear = PLAYER_HEADGEAR) {")
    assets_js_lines.append("  if (!PLAYER_HEADGEAR_OPTIONS.includes(headgear)) throw new Error(`unknown player headgear '${headgear}'`);")
    assets_js_lines.append("  return `player_${headgear}_${animation}`;")
    assets_js_lines.append("}")
    assets_js_lines.append("")
    assets_js_lines.append("let LOADED = null;")
    assets_js_lines.append("")
    assets_js_lines.extend([
        "/** Load (or re-load) images. Resolves when all browser Image objects are decoded.",
        " *  In a headless/test environment this is a no-op and getAsset returns null. */",
        "export function loadAssets() {",
        "  if (LOADED) return LOADED;",
        "  if (typeof Image === 'undefined') {",
        "    LOADED = Promise.resolve();",
        "    return LOADED;",
        "  }",
        "  const promises = [];",
        "  for (const def of Object.values(ASSET_DEFS)) {",
        "    const img = new Image();",
        "    img.src = def.src;",
        "    def.image = img;",
        "    promises.push(new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }));",
        "  }",
        "  LOADED = Promise.all(promises);",
        "  return LOADED;",
        "}",
    ])
    assets_js_lines.append("")
    assets_js_lines.extend([
        "/** Return an asset definition (src, width, height, image) or null if unavailable.",
        " *  Returns null in headless tests where Image does not exist. */",
        "export function getAsset(id) {",
        "  const def = ASSET_DEFS[id];",
        "  if (!def) return null;",
        "  if (typeof Image === 'undefined') return null;",
        "  return def;",
        "}",
    ])
    assets_js_lines.append("")
    assets_js_lines.extend([
        "/** True if the asset image is loaded and ready to draw. */",
        "export function assetReady(id) {",
        "  const def = ASSET_DEFS[id];",
        "  return !!def && !!def.image && def.image.complete && def.image.naturalWidth > 0;",
        "}",
        "",
        "/** Top-left Y that places a visual's last opaque row immediately above feetY. */",
        "export function groundedVisualY(feetY, visual) {",
        "  const height = visual?.height ?? visual?.h ?? 0;",
        "  const bottomInset = visual?.bottomInset ?? 0;",
        "  return feetY - height + bottomInset;",
        "}",
        "",
        "/** Pixel-row distance from a rendered visual's opaque bottom to its standing surface. */",
        "export function groundContactGap(feetY, drawY, visual) {",
        "  const height = visual?.height ?? visual?.h ?? 0;",
        "  const bottomInset = visual?.bottomInset ?? 0;",
        "  const opaqueBottom = drawY + height - bottomInset - 1;",
        "  return feetY - opaqueBottom;",
        "}",
        "",
        "/** Draw a small curated icon by asset id at screen (x,y). Returns true if drawn. */",
        "export function drawIcon(ctx, id, x, y) {",
        "  const asset = id && ASSET_DEFS[id];",
        "  if (!asset) return false;",
        "  if (typeof Image === 'undefined') return false;",
        "  if (!asset.image || !asset.image.complete || asset.image.naturalWidth <= 0) return false;",
        "  ctx.drawImage(asset.image, Math.round(x), Math.round(y));",
        "  return true;",
        "}",
        "",
        "/** Map a weapon id to a curated HUD icon asset id (null if none fits). */",
        "export function weaponIconFor(weaponId) {",
        "  if (weaponId === 'long-spear') return 'icon_spear';",
        "  if (weaponId === 'heavy-club') return 'icon_mace';",
        "  if (weaponId === 'ranged-sidearm') return null; // no curated ranged icon; keep text",
        "  if (weaponId && weaponId.startsWith('unique-')) return 'icon_blade';",
        "  if (weaponId === 'bare-hands') return null;",
        "  // short-blade, long-blade, short-dagger and any other blade default to the blade icon.",
        "  return 'icon_blade';",
        "}",
    ])
    assets_js.write_text("\n".join(assets_js_lines), encoding="utf-8")

    if args.compare_conform:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        compare_path = render_conform_comparison(compare_rows, timestamp)
        if compare_path:
            print(f"conform comparison written to {compare_path}")

    print(f"curated {len(manifest['assets'])} assets to {OUT}")
    print(f"manifest written to {manifest_path}")
    print(f"runtime module written to {assets_js}")


if __name__ == "__main__":
    main()
