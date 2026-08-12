#!/usr/bin/env bash
# Proof-screenshot harness (hard rule 9): render the single-file build headless at
# the three fixed viewports and write dated PNGs under docs/proofs/. Frozen pose
# (?still) + fixed seed => deterministic. Never overwrites an existing capture.
#
# Usage: scripts/proofs.sh <label> "<url-query>" [viewports]
#   label     e.g. m2-flight            -> docs/proofs/<label>-<WxH>-<date>.png
#   url-query e.g. "still=1"            (seed is appended)
#   viewports "all" (default: the three fixed) or "1280x800" for a single one
# With no args it captures the current milestone's default set (see bottom).
#
# Chromium: set CHROME=/path/to/chrome, else auto-find the Playwright cache.
# WebGL2 runs on ANGLE/SwiftShader (software; overlay fps is NOT target hardware).
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1
DATE="$(date +%Y-%m-%d)"
SEED="${SEED:-stray-m1}"
OUTDIR="docs/proofs"
mkdir -p "$OUTDIR"

if [ -z "${CHROME:-}" ]; then
  # Linux first, then the two macOS layouts Playwright uses (the Mac paths were missing,
  # so this harness could not run on the machine the art migration was done on).
  for pat in \
    "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
    "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome \
    "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing" \
    "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium
  do
    for c in $pat; do
      [ -x "$c" ] && CHROME="$c" && break 2
    done
  done
fi
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "[proofs] no chromium found; set CHROME=/path/to/chrome" >&2; exit 1
fi

node scripts/build.js || exit 1

shoot() { # label query w h
  local label="$1" query="$2" w="$3" h="$4"
  local out="$OUTDIR/${label}-${w}x${h}-${DATE}.png"
  if [ -e "$out" ]; then echo "[proofs] refusing to overwrite $out"; return 0; fi
  local url="file://$REPO/dist/stray-squadron.html?${query}&seed=${SEED}"
  timeout 90 "$CHROME" --headless=new --no-sandbox --hide-scrollbars \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --force-device-scale-factor=1 --window-size="${w},${h}" \
    --virtual-time-budget=5000 --screenshot="$out" "$url" >/dev/null 2>&1
  [ -e "$out" ] && echo "[proofs] wrote $out" || echo "[proofs] FAILED $out" >&2
}

capture_set() { # label query viewports
  local label="$1" query="$2" vp="${3:-all}"
  if [ "$vp" = "all" ]; then
    shoot "$label" "$query" 1280 800
    shoot "$label" "$query" 1440 900
    shoot "$label" "$query" 2560 1440
  else
    shoot "$label" "$query" "${vp%x*}" "${vp#*x}"
  fi
}

if [ "$#" -ge 2 ]; then
  capture_set "$1" "$2" "${3:-all}"
else
  # Default: the current milestone's set (M2 — rail flight feel + assist menu).
  capture_set m2-flight "still=1" all
  capture_set m2-assist-menu "still=1&menu=1" 1280x800
fi
echo "[proofs] done."
