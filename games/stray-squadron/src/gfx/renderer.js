// WebGL2 renderer for the flat-shaded substrate. Compiles the programs, owns a small
// set of GL objects, and draws meshes with the depth buffer doing the sorting (hard
// rule 3 — leaning on gl.DEPTH_TEST is the whole reason for WebGL over a JS rasterizer).
// Browser-only; not part of the headless suite.
//
// ART MIGRATION 2026-08-10 — the r4 facet-painter register.
// The approved direction (docs/art-poc/approval-record/) was prototyped as a canvas2d
// painter at a native 640x360. It is adopted here as a DISCIPLINE inside this pipeline
// rather than ported wholesale: the world is now rendered into a native-resolution
// offscreen target and presented with a whole-number NEAREST upscale, which is what
// actually produces the chunky facet read. Everything else the PoC did with per-polygon
// canvas work — per-class ambient, cool sky fill, banded fog, facet rims, the banded sky
// — is expressed in the shaders instead.
//
// Native size is chosen so the upscale is EXACTLY an integer and the frame still fills
// the viewport (no letterbox), which keeps the HUD and the mouse-aim mapping untouched:
//   scale  = round(framebufferHeight / 380), clamped to 1..8
//   native = ceil(framebufferSize / scale)
// At 1280x800 that is 640x400 at 2x; at 1920x1080 and 2560x1440 it is exactly 640x360.
//
// M13 hygiene + resilience (retained):
//  - S5: makeMeshHandle keeps its GL buffers and the source mesh; replacing a key
//    deletes the old VAO + buffers, and the per-frame uniform Float32Arrays are
//    preallocated once.
//  - B3: rebuild() recompiles the programs, re-fetches uniform locations, restores GL
//    state, and rebuilds every mesh handle from its stored source — so a lost-and-
//    restored WebGL context comes back with all current meshes intact.

import {
  VERT_SRC, FRAG_SRC,
  PRESENT_VERT_SRC, PRESENT_FRAG_SRC,
  SKY_VERT_SRC, SKY_FRAG_SRC,
} from './shaders.js';
import { normalMatrix3 } from '../math/mat4.js';
import {
  AMBIENT, TAG_AMBIENT, FILL_DIR, FILL_COLOR, FILL_STRENGTH, FOG_BANDS, SKY_BANDS,
} from './shading.js';

// The native buffer's target height. 380 rather than 360 so the common laptop heights
// (800, 900) round to a 2x scale and land at 400/450 native rather than dropping to a
// 3x scale and a coarser 267/300.
const NATIVE_TARGET_H = 380;
export const MAX_NATIVE_SCALE = 8;

// Presentation treatment. Both are native-space effects, so they hold their apparent
// size at every upscale.
export const PRESENT = { vignette: 0.50, scanline: 0.055 };

// Per-class facet rim. The hero's rim is INK (dark): a light outline against the lit
// canyon floor was costing the hero its silhouette contrast in the PoC, which is one of
// the three refuter residuals this migration had to fix.
const EDGE = {
  craft: { color: [0.024, 0.035, 0.059], alpha: 0.46 },
  enemy: { color: [0.98, 0.50, 0.21], alpha: 0.34 },
  boss: { color: [0.72, 0.75, 0.81], alpha: 0.15 },
  structure: { color: [0.38, 0.53, 0.60], alpha: 0.32 },
  scenery: { color: [0.65, 0.79, 0.82], alpha: 0.22 },
  terrain: { color: [0.024, 0.035, 0.059], alpha: 0.13 },
  relief: { color: [0.024, 0.035, 0.059], alpha: 0.10 },
};

export function nativeSize(fbWidth, fbHeight) {
  const scale = Math.max(1, Math.min(MAX_NATIVE_SCALE, Math.round(fbHeight / NATIVE_TARGET_H)));
  return {
    scale,
    width: Math.max(1, Math.ceil(fbWidth / scale)),
    height: Math.max(1, Math.ceil(fbHeight / scale)),
  };
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader compile failed: ' + log);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('program link failed: ' + log);
  }
  return p;
}

// Upload one built mesh into its own VAO + buffers. Keeps the buffer list so the handle
// can be deleted cleanly on replacement (S5 — no orphaned GPU buffers).
function makeMeshHandle(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const buffers = [];
  const attrib = (loc, data, size) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    buffers.push(buf);
  };
  attrib(0, mesh.positions, 3);
  attrib(1, mesh.normals, 3);
  attrib(2, mesh.colors, 3);

  gl.bindVertexArray(null);
  return { vao, buffers, vertexCount: mesh.triCount * 3, mesh };
}

function deleteMeshHandle(gl, h) {
  if (!h) return;
  if (h.vao) gl.deleteVertexArray(h.vao);
  if (h.buffers) for (const b of h.buffers) gl.deleteBuffer(b);
}

export function createRenderer(gl) {
  const handles = new Map();      // key -> { vao, buffers, vertexCount, mesh }
  let program, loc;
  let skyProgram, skyLoc;
  let presentProgram, presentLoc;
  let emptyVao;

  // The native-resolution offscreen target.
  let fbo = null, colorTex = null, depthBuf = null;
  let nativeW = 0, nativeH = 0, nativeScale = 1;
  let fbW = 0, fbH = 0;

  // Preallocated per-frame uniform scratch (S5 — no fresh Float32Array per call).
  const uProj = new Float32Array(16);
  const uView = new Float32Array(16);
  const uModel = new Float32Array(16);
  const uNormal = new Float32Array(9);
  const uLight = new Float32Array(3);
  const uFogColor = new Float32Array(3);
  const uVec3 = new Float32Array(3);

  let frameNear = 0, frameFar = 1, curNear = NaN, curFar = NaN;
  function setFogRange(near, far) {
    if (near === curNear && far === curFar) return;
    curNear = near; curFar = far;
    gl.uniform1f(loc.fogNear, near);
    gl.uniform1f(loc.fogFar, far);
  }

  // The per-class state (ambient + rim) only changes when the class does. Both setters
  // touch edgeAlpha, so both have to account for the other's current state: a
  // tag change during a run of emissive draws (player bolt -> enemy bolt, which is the
  // real draw order) would otherwise restore the rim on something emissive.
  let curTag = null;
  let curEmissive = -1;
  function edgeAlphaFor(tag) {
    return curEmissive === 1 ? 0 : (EDGE[tag] || EDGE.scenery).alpha;
  }
  function setTag(tag) {
    if (tag === curTag) return;
    curTag = tag;
    const amb = TAG_AMBIENT[tag] != null ? TAG_AMBIENT[tag] : AMBIENT;
    const edge = EDGE[tag] || EDGE.scenery;
    gl.uniform1f(loc.ambient, amb);
    uVec3.set(edge.color);
    gl.uniform3fv(loc.edgeColor, uVec3);
    gl.uniform1f(loc.edgeAlpha, edgeAlphaFor(tag));
  }

  function setEmissive(on) {
    const v = on ? 1 : 0;
    if (v === curEmissive) return;
    curEmissive = v;
    gl.uniform1f(loc.emissive, v);
    // An emissive object has no form to read, so a rim would only ring it.
    gl.uniform1f(loc.edgeAlpha, edgeAlphaFor(curTag));
  }

  function buildPrograms() {
    program = link(gl, VERT_SRC, FRAG_SRC);
    const u = (name) => gl.getUniformLocation(program, name);
    loc = {
      proj: u('uProj'), view: u('uView'), model: u('uModel'),
      normalMat: u('uNormalMat'), lightDir: u('uLightDir'), ambient: u('uAmbient'),
      fillDir: u('uFillDir'), fillColor: u('uFillColor'), fillStrength: u('uFillStrength'),
      emissive: u('uEmissive'),
      fogColor: u('uFogColor'), fogNear: u('uFogNear'), fogFar: u('uFogFar'),
      fogBands: u('uFogBands'), edgeColor: u('uEdgeColor'), edgeAlpha: u('uEdgeAlpha'),
    };

    skyProgram = link(gl, SKY_VERT_SRC, SKY_FRAG_SRC);
    const s = (name) => gl.getUniformLocation(skyProgram, name);
    skyLoc = {
      right: s('uRight'), up: s('uUp'), forward: s('uForward'),
      tanHalf: s('uTanHalf'), aspect: s('uAspect'),
      top: s('uSkyTop'), mid: s('uSkyMid'), horizon: s('uSkyHorizon'),
      glow: s('uGlow'), bands: s('uBands'), stars: s('uStars'),
    };

    presentProgram = link(gl, PRESENT_VERT_SRC, PRESENT_FRAG_SRC);
    const p = (name) => gl.getUniformLocation(presentProgram, name);
    presentLoc = {
      scene: p('uScene'), native: p('uNative'),
      vignette: p('uVignette'), scanline: p('uScanline'),
    };

    if (emptyVao) gl.deleteVertexArray(emptyVao);
    emptyVao = gl.createVertexArray();   // the fullscreen passes need a bound VAO

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  function deleteTarget() {
    if (fbo) gl.deleteFramebuffer(fbo);
    if (colorTex) gl.deleteTexture(colorTex);
    if (depthBuf) gl.deleteRenderbuffer(depthBuf);
    fbo = colorTex = depthBuf = null;
  }

  function buildTarget(w, h) {
    deleteTarget();
    nativeW = w; nativeH = h;

    colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // NEAREST is the whole point: the upscale must not smear the facets.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    depthBuf = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuf);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuf);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('native render target incomplete: 0x' + status.toString(16));
    }
  }

  buildPrograms();

  return {
    // Register a built mesh under a key; re-registering replaces it (and frees the old
    // GPU objects — S5).
    upload(key, mesh) {
      deleteMeshHandle(gl, handles.get(key));
      handles.set(key, makeMeshHandle(gl, mesh));
    },

    // `w`/`h` are the DRAWING BUFFER size (canvas.width/height). The native target is
    // derived from them so the presented upscale is a whole number.
    resize(w, h) {
      fbW = Math.max(1, w); fbH = Math.max(1, h);
      const n = nativeSize(fbW, fbH);
      nativeScale = n.scale;
      if (n.width !== nativeW || n.height !== nativeH || !fbo) buildTarget(n.width, n.height);
    },

    // What the world is actually being painted at, and at what whole-number upscale.
    nativeInfo() {
      return { width: nativeW, height: nativeH, scale: nativeScale, fbWidth: fbW, fbHeight: fbH };
    },

    // Bind the native target and paint the banded sky into it. This replaces the old
    // flat clear-to-fog-color: the approved frames read their silhouettes against a
    // graded sky and a warm horizon lip, and a flat fill cannot do that.
    beginSky({ view, sky, tanHalf, reducedStars }) {
      if (!fbo) return;   // a lost context between rebuild() and resize()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, nativeW, nativeH);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // The view matrix's upper 3x3 rows are the camera basis in world space.
      const right = [view[0], view[4], view[8]];
      const up = [view[1], view[5], view[9]];
      const fwd = [-view[2], -view[6], -view[10]];

      gl.useProgram(skyProgram);
      gl.bindVertexArray(emptyVao);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);

      uVec3.set(right); gl.uniform3fv(skyLoc.right, uVec3);
      uVec3.set(up); gl.uniform3fv(skyLoc.up, uVec3);
      uVec3.set(fwd); gl.uniform3fv(skyLoc.forward, uVec3);
      gl.uniform1f(skyLoc.tanHalf, tanHalf);
      gl.uniform1f(skyLoc.aspect, nativeW / Math.max(1, nativeH));
      uVec3.set(sky.top); gl.uniform3fv(skyLoc.top, uVec3);
      uVec3.set(sky.mid); gl.uniform3fv(skyLoc.mid, uVec3);
      uVec3.set(sky.horizon); gl.uniform3fv(skyLoc.horizon, uVec3);
      uVec3.set(sky.glow); gl.uniform3fv(skyLoc.glow, uVec3);
      gl.uniform1f(skyLoc.bands, SKY_BANDS);
      gl.uniform1f(skyLoc.stars, reducedStars ? 0 : (sky.stars != null ? sky.stars : 1));

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.bindVertexArray(null);
    },

    // Set the per-frame globals for the world pass. Call after beginSky.
    beginFrame({ proj, view, lightDir, ambient, fog }) {
      if (!fbo) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, nativeW, nativeH);
      gl.useProgram(program);
      uProj.set(proj); uView.set(view);
      uLight.set(lightDir); uFogColor.set(fog.color);
      gl.uniformMatrix4fv(loc.proj, false, uProj);
      gl.uniformMatrix4fv(loc.view, false, uView);
      gl.uniform3fv(loc.lightDir, uLight);
      gl.uniform3fv(loc.fogColor, uFogColor);
      gl.uniform1f(loc.fogBands, FOG_BANDS);
      uVec3.set(FILL_DIR); gl.uniform3fv(loc.fillDir, uVec3);
      uVec3.set(FILL_COLOR); gl.uniform3fv(loc.fillColor, uVec3);
      gl.uniform1f(loc.fillStrength, FILL_STRENGTH);
      // Force a re-upload of the per-class state: the program may have been rebuilt.
      curTag = null; curEmissive = -1;
      gl.uniform1f(loc.ambient, ambient != null ? ambient : AMBIENT);
      setTag('scenery');
      setEmissive(false);
      frameNear = fog.near; frameFar = fog.far;
      curNear = NaN; curFar = NaN;
      setFogRange(frameNear, frameFar);
    },

    // Draw a registered mesh with a model matrix.
    //   fogRange — optionally overrides the frame's haze ramp for this object alone
    //   opts     — { tag, emissive }: which class this object shades and rims as
    draw(key, model, fogRange, opts) {
      const h = handles.get(key);
      if (!h) return;
      setTag(opts && opts.tag ? opts.tag : 'scenery');
      setEmissive(!!(opts && opts.emissive));
      setFogRange(
        fogRange ? fogRange.near : frameNear,
        fogRange ? fogRange.far : frameFar,
      );
      uModel.set(model);
      uNormal.set(normalMatrix3(model));
      gl.uniformMatrix4fv(loc.model, false, uModel);
      gl.uniformMatrix3fv(loc.normalMat, false, uNormal);
      gl.bindVertexArray(h.vao);
      gl.drawArrays(gl.TRIANGLES, 0, h.vertexCount);
      gl.bindVertexArray(null);
    },

    // Scale the native buffer up to the screen with NEAREST, plus the presentation
    // treatment. Must be called once, after every draw for the frame.
    endFrame(opts) {
      if (!fbo) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, fbW, fbH);
      gl.useProgram(presentProgram);
      gl.bindVertexArray(emptyVao);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, colorTex);
      gl.uniform1i(presentLoc.scene, 0);
      gl.uniform2f(presentLoc.native, nativeW, nativeH);
      gl.uniform1f(presentLoc.vignette,
        opts && opts.vignette != null ? opts.vignette : PRESENT.vignette);
      gl.uniform1f(presentLoc.scanline,
        opts && opts.scanline != null ? opts.scanline : PRESENT.scanline);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    },

    // Read the presented native buffer back as RGBA bytes — the instrumentation path
    // (gfx/instrument.js) measures exposure on what was actually painted.
    readNative() {
      if (!fbo) return null;
      const px = new Uint8Array(nativeW * nativeH * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.readPixels(0, 0, nativeW, nativeH, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { width: nativeW, height: nativeH, pixels: px };
    },

    // B3: rebuild everything after a WebGL context is lost and restored. The old GL
    // objects are gone with the context, so recompile and re-upload from source.
    rebuild() {
      fbo = colorTex = depthBuf = null;
      nativeW = nativeH = 0;
      buildPrograms();
      const meshes = [];
      for (const [key, h] of handles) meshes.push([key, h.mesh]);
      handles.clear();
      for (const [key, mesh] of meshes) handles.set(key, makeMeshHandle(gl, mesh));
    },
  };
}
