// Camera for INNSMOUTH 2000: discrete zoom, pan, and clamping to the map.
//
// Pure state so it is fully testable in node. The camera holds a world-space center point and
// one of three discrete zoom levels (STUDY 1.4). Screen <-> world is a scale-plus-translate
// (no rotation lives here; the diamond rotation is entirely in geometry.js), so the transform
// and its inverse are exact. The center is clamped to the map's world bounds so the player can
// never pan off into the void.

import { HALF_W, HALF_H } from './geometry.js';

// The only allowed zoom factors: 0.5x overview, 1x authoring, 2x close (STUDY 1.4).
export const ZOOM_LEVELS = [0.5, 1, 2];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// World-space bounding box of a cols x rows ground grid (elevation ignored for clamping).
export function mapWorldBounds(cols, rows) {
  // x extremes: leftmost at tile (0, rows-1), rightmost at (cols-1, 0).
  // y extremes: top at (0,0), bottom at (cols-1, rows-1).
  return {
    minX: -(rows - 1) * HALF_W,
    maxX: (cols - 1) * HALF_W,
    minY: 0,
    maxY: (cols - 1 + rows - 1) * HALF_H,
  };
}

export function makeCamera(opts = {}) {
  const mapCols = opts.mapCols || 96;
  const mapRows = opts.mapRows || 96;
  const bounds = mapWorldBounds(mapCols, mapRows);

  const cam = {
    viewportW: opts.viewportW || 1280,
    viewportH: opts.viewportH || 800,
    zoom: ZOOM_LEVELS.includes(opts.zoom) ? opts.zoom : 1,
    // Default: center on the middle of the map's world bounds.
    cx: opts.x ?? (bounds.minX + bounds.maxX) / 2,
    cy: opts.y ?? (bounds.minY + bounds.maxY) / 2,
    bounds,

    setViewport(w, h) {
      this.viewportW = w;
      this.viewportH = h;
      return this;
    },

    // Keep the center inside the map bounds.
    clampToBounds() {
      this.cx = clamp(this.cx, this.bounds.minX, this.bounds.maxX);
      this.cy = clamp(this.cy, this.bounds.minY, this.bounds.maxY);
      return this;
    },

    // Snap to a specific allowed zoom level (nearest if not exact). Center-anchored: the
    // world point under the screen center stays fixed.
    setZoom(level) {
      let best = ZOOM_LEVELS[0];
      let bestD = Infinity;
      for (const z of ZOOM_LEVELS) {
        const d = Math.abs(z - level);
        if (d < bestD) { bestD = d; best = z; }
      }
      this.zoom = best;
      return this;
    },

    zoomIn() {
      const i = ZOOM_LEVELS.indexOf(this.zoom);
      if (i < ZOOM_LEVELS.length - 1) this.zoom = ZOOM_LEVELS[i + 1];
      return this;
    },

    zoomOut() {
      const i = ZOOM_LEVELS.indexOf(this.zoom);
      if (i > 0) this.zoom = ZOOM_LEVELS[i - 1];
      return this;
    },

    // Pan by a screen-pixel delta (e.g. a mouse drag). Converted to world by the zoom factor.
    panByScreen(dxScreen, dyScreen) {
      this.cx += dxScreen / this.zoom;
      this.cy += dyScreen / this.zoom;
      return this.clampToBounds();
    },

    // Center the camera on a world point.
    panTo(worldX, worldY) {
      this.cx = worldX;
      this.cy = worldY;
      return this.clampToBounds();
    },

    // World -> screen (scale by zoom, translate so the center sits at the viewport middle).
    worldToScreen(wx, wy) {
      return {
        x: (wx - this.cx) * this.zoom + this.viewportW / 2,
        y: (wy - this.cy) * this.zoom + this.viewportH / 2,
      };
    },

    // Screen -> world, the exact inverse.
    screenToWorld(sx, sy) {
      return {
        x: (sx - this.viewportW / 2) / this.zoom + this.cx,
        y: (sy - this.viewportH / 2) / this.zoom + this.cy,
      };
    },

    // The world-space rectangle currently visible, for culling via geometry.visibleTileRange.
    visibleWorldRect() {
      const halfW = this.viewportW / 2 / this.zoom;
      const halfH = this.viewportH / 2 / this.zoom;
      return {
        left: this.cx - halfW,
        top: this.cy - halfH,
        right: this.cx + halfW,
        bottom: this.cy + halfH,
      };
    },
  };

  cam.clampToBounds();
  return cam;
}
