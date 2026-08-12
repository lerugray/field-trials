// GLSL ES 3.00 (WebGL2) shader sources for the flat-shaded substrate.
//
// This is the r4 facet-painter register (docs/art-poc/approval-record/) expressed as a
// GPU pipeline rather than a canvas2d painter. Same visual language, four terms:
//   1. KEY  — one directional light, flat per face (the base form read)
//   2. FILL — a cool sky bounce off the opposite shoulder, additive and small
//   3. FOG  — quantized into discrete bands, Bayer-dithered across each boundary
//   4. EDGE — a per-facet rim, area-gated, tinted per object class
// Still no texture sampling and no per-pixel lighting model. The numbers live in
// gfx/shading.js so the headless visibility tests audit what the GPU is actually given.
//
// The facet edge is the one genuinely new term, and the gate on it is load-bearing.
// Below roughly seven square pixels a one-pixel rim IS the whole triangle, which turns
// far-band craft into wireframe scribbles (the PoC hit this and gated it by area). The
// GPU equivalent is the barycentric derivative: a small triangle has a LARGE fwidth, so
// EDGE_MAX_FW is an area gate wearing different clothes. Barycentrics come from
// gl_VertexID rather than a fourth attribute — every mesh here is non-indexed with three
// consecutive vertices per triangle, so the corner index is free.

export const VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec3 uLightDir;   // world-space direction TO the key light (normalized)
uniform float uAmbient;   // per-class ambient floor (gfx/shading.js TAG_AMBIENT)
uniform vec3 uFillDir;    // world-space direction TO the cool fill (normalized)
uniform vec3 uFillColor;  // fill tint
uniform float uFillStrength;
uniform float uEmissive;  // 1.0 = skip lighting entirely (bolts, cores, thrusters)

out vec3 vLit;
out float vViewDist;
out vec3 vBary;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * world;
  gl_Position = uProj * viewPos;

  // Flat shading: the face normal is baked per-vertex, so per-vertex lighting is
  // already constant across the triangle.
  vec3 n = normalize(uNormalMat * aNormal);
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  float light = uAmbient + (1.0 - uAmbient) * diff;
  vec3 fill = uFillColor * (max(dot(n, normalize(uFillDir)), 0.0) * uFillStrength);
  vLit = mix(aColor * light + fill, aColor, uEmissive);

  vViewDist = -viewPos.z; // positive distance in front of the camera

  // Corner index -> barycentric, for the facet rim. Non-indexed meshes only.
  int corner = gl_VertexID % 3;
  vBary = vec3(corner == 0 ? 1.0 : 0.0, corner == 1 ? 1.0 : 0.0, corner == 2 ? 1.0 : 0.0);
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vLit;
in float vViewDist;
in vec3 vBary;

uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogBands;   // quantization steps across the ramp
uniform vec3 uEdgeColor;   // per-class facet rim tint
uniform float uEdgeAlpha;  // 0 disables the rim

out vec4 fragColor;

// Below this barycentric derivative the triangle is too small to carry a rim without
// the rim becoming the triangle. The area gate, in screen-derivative form.
const float EDGE_MAX_FW = 0.14;

// 4x4 ordered (Bayer) threshold in [0,1), for the dithered fog dissolve.
float bayer4(vec2 fragCoord) {
  int x = int(mod(fragCoord.x, 4.0));
  int y = int(mod(fragCoord.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0);
  return m[i] / 16.0;
}

void main() {
  float f = clamp((vViewDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  // Quantize into bands, then let the ordered dither carry the crossing so the far
  // edge dissolves in a cross-hatch rather than a hard step or a smooth ramp.
  float banded = floor(f * uFogBands) / uFogBands;
  float d = (bayer4(gl_FragCoord.xy) - 0.5) * (1.0 / uFogBands);
  float ff = clamp(banded + d, 0.0, 1.0);
  vec3 col = mix(vLit, uFogColor, ff);

  // Facet rim: darken (or tint) the outer sliver of each triangle. Gated on triangle
  // size so small far-band geometry stays a solid silhouette.
  if (uEdgeAlpha > 0.0) {
    vec3 fw = fwidth(vBary);
    float widest = max(max(fw.x, fw.y), fw.z);
    if (widest < EDGE_MAX_FW) {
      vec3 e = smoothstep(vec3(0.0), fw * 1.35, vBary);
      float rim = 1.0 - min(min(e.x, e.y), e.z);
      // Fade the rim out with the haze — a facet edge on a nearly-fogged face is noise.
      col = mix(col, uEdgeColor, rim * uEdgeAlpha * (1.0 - ff));
    }
  }

  fragColor = vec4(col, 1.0);
}
`;

// ---- Presentation: the native-res buffer, integer-scaled to the screen ---------------
// The whole point of the register is that the frame is PAINTED at ~640x360 and then
// scaled up by a whole number, so facets land on chunky square pixels. This pass does
// the upscale with NEAREST sampling and lays the vignette + faint scanline tooth on
// top, both of which belong to the presentation, not to the world.

export const PRESENT_VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle from gl_VertexID — no buffers needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const PRESENT_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uNative;      // native buffer size, for the scanline period
uniform float uVignette;   // 0 disables
uniform float uScanline;   // 0 disables
out vec4 fragColor;

void main() {
  vec3 col = texture(uScene, vUv).rgb;

  // Scanline tooth, one native pixel per line — reads as CRT grain at every scale
  // because it is computed in NATIVE space, not screen space.
  if (uScanline > 0.0) {
    float line = mod(floor(vUv.y * uNative.y), 2.0);
    col *= 1.0 - uScanline * line;
  }

  if (uVignette > 0.0) {
    vec2 d = vUv - vec2(0.5, 0.52);
    float r = length(vec2(d.x * 1.05, d.y));
    float v = smoothstep(0.30, 0.82, r) * uVignette;
    col = mix(col, vec3(0.004, 0.012, 0.031), v);
  }

  fragColor = vec4(col, 1.0);
}
`;

// ---- Sky: banded gradient + horizon glow + stars, drawn behind the world -------------
// Rendered as a fullscreen triangle whose view ray is rebuilt from the camera basis, so
// the horizon stays correct under any pitch and bank (the rail banks constantly). The
// band count matches the fog's, so sky and haze posterize together.

export const SKY_VERT_SRC = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 1.0, 1.0);
}
`;

export const SKY_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vNdc;

uniform vec3 uRight;      // camera basis in world space
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalf;   // tan(fov/2)
uniform float uAspect;

uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uGlow;
uniform float uBands;
uniform float uStars;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 ray = normalize(uForward
    + uRight * (vNdc.x * uTanHalf * uAspect)
    + uUp * (vNdc.y * uTanHalf));

  // Elevation drives the gradient: 0 at the horizon, 1 straight up.
  float el = clamp(ray.y, -1.0, 1.0);
  float t = clamp(el / 0.55, 0.0, 1.0);
  float q = floor(t * uBands) / uBands;   // band it like the fog
  vec3 col = q < 0.62
    ? mix(uSkyHorizon, uSkyMid, q / 0.62)
    : mix(uSkyMid, uSkyTop, (q - 0.62) / 0.38);

  // Stars thin out toward the horizon and never sit below it.
  if (uStars > 0.0 && el > 0.04) {
    vec2 cell = floor(vec2(ray.x, ray.y) * 260.0 + ray.z * 37.0);
    float s = hash21(cell);
    if (s > 0.9965) {
      float bright = (s - 0.9965) / 0.0035;
      col += vec3(0.42, 0.52, 0.55) * bright * uStars * smoothstep(0.04, 0.34, el);
    }
  }

  // Horizon glow — the warm band the approved frames read their silhouettes against.
  float glowBand = exp(-pow(max(el, -0.12) * 6.4, 2.0));
  col += uGlow * glowBand * 0.62;

  // A brighter lip hugging the horizon line itself.
  col += uGlow * exp(-pow(el * 26.0, 2.0)) * 0.30;

  fragColor = vec4(col, 1.0);
}
`;
