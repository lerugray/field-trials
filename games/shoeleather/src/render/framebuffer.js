// SHOELEATHER — native-res software framebuffer (the rasterizer boot).
//
// DESIGN-SEED stack law: native-res software rasterizer for WORLD ART at a fixed
// logical resolution, integer/nearest upscale. This is the engine-boot core: an
// RGBA byte buffer with clipped primitives and a nearest-neighbour integer upscale.
// It is pure (no canvas), so it runs under `node --test`. The browser layer copies
// the upscaled buffer into an ImageData and blits it to the canvas.
//
// The VACUUM SEALED technique stack (light-rig compositing, dither/fbm material,
// single-picture composition — CLAUDE.md rule 6) lands in M4 on top of this.

export function rgba(r, g, b, a = 255) {
  return [clampByte(r), clampByte(g), clampByte(b), clampByte(a)];
}

function clampByte(v) {
  v = Math.round(v);
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

export class Framebuffer {
  constructor(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`framebuffer dims must be positive integers, got ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x, y) {
    return (y * this.width + x) * 4;
  }

  clear(color) {
    const [r, g, b, a] = color;
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }

  // Source-over alpha blend of one pixel. Out-of-bounds is a silent no-op (clipped).
  setPixel(x, y, color) {
    x = x | 0; y = y | 0;
    if (!this.inBounds(x, y)) return;
    const [sr, sg, sb, sa] = color;
    const i = this.index(x, y);
    if (sa >= 255) {
      this.data[i] = sr; this.data[i + 1] = sg; this.data[i + 2] = sb; this.data[i + 3] = 255;
      return;
    }
    if (sa <= 0) return;
    const d = this.data;
    const dr = d[i], dg = d[i + 1], db = d[i + 2], da = d[i + 3];
    const af = sa / 255;
    const ia = 1 - af;
    const outA = sa + da * ia;
    d[i] = sr * af + dr * ia;
    d[i + 1] = sg * af + dg * ia;
    d[i + 2] = sb * af + db * ia;
    d[i + 3] = outA;
  }

  getPixel(x, y) {
    if (!this.inBounds(x, y)) return null;
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  // Filled rectangle, clipped to bounds. Opaque colors fast-path; translucent blends.
  fillRect(x, y, w, h, color) {
    let x0 = Math.max(0, x | 0);
    let y0 = Math.max(0, y | 0);
    let x1 = Math.min(this.width, (x | 0) + (w | 0));
    let y1 = Math.min(this.height, (y | 0) + (h | 0));
    if (x1 <= x0 || y1 <= y0) return;
    const opaque = color[3] >= 255;
    for (let py = y0; py < y1; py++) {
      if (opaque) {
        const [r, g, b] = color;
        let i = this.index(x0, py);
        for (let px = x0; px < x1; px++) {
          this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
          i += 4;
        }
      } else {
        for (let px = x0; px < x1; px++) this.setPixel(px, py, color);
      }
    }
  }

  // 1px rectangle outline, clipped.
  strokeRect(x, y, w, h, color) {
    this.fillRect(x, y, w, 1, color);
    this.fillRect(x, y + h - 1, w, 1, color);
    this.fillRect(x, y, 1, h, color);
    this.fillRect(x + w - 1, y, 1, h, color);
  }

  // Copy another framebuffer's pixels at (dx,dy) with source-over blending, clipped.
  blit(src, dx, dy) {
    for (let sy = 0; sy < src.height; sy++) {
      for (let sx = 0; sx < src.width; sx++) {
        const c = src.getPixel(sx, sy);
        this.setPixel(dx + sx, dy + sy, c);
      }
    }
  }

  // Nearest-neighbour integer upscale into a NEW framebuffer. This is the "integer /
  // nearest upscale" law: crisp pixels, no interpolation smear.
  upscale(factor) {
    if (!Number.isInteger(factor) || factor < 1) {
      throw new RangeError(`upscale factor must be a positive integer, got ${factor}`);
    }
    if (factor === 1) {
      const clone = new Framebuffer(this.width, this.height);
      clone.data.set(this.data);
      return clone;
    }
    const out = new Framebuffer(this.width * factor, this.height * factor);
    const od = out.data;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const si = this.index(x, y);
        const r = this.data[si], g = this.data[si + 1], b = this.data[si + 2], a = this.data[si + 3];
        for (let fy = 0; fy < factor; fy++) {
          const oy = y * factor + fy;
          let oi = (oy * out.width + x * factor) * 4;
          for (let fx = 0; fx < factor; fx++) {
            od[oi] = r; od[oi + 1] = g; od[oi + 2] = b; od[oi + 3] = a;
            oi += 4;
          }
        }
      }
    }
    return out;
  }
}
