// Minimal 4x4 matrix helpers, column-major (WebGL's memory convention: a matrix
// is 16 numbers, m[0..3] is the first COLUMN, translation lives at m[12..14]).
// Our own code, zero dependencies. Matrices are plain length-16 arrays; convert
// to Float32Array only when handing to gl.uniformMatrix4fv.

export function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// out = a * b  (apply b first, then a — standard column-major composition).
export function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4 + 0];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// Compose a list of matrices left-to-right: chain(A, B, C) === A*B*C.
export function chain(...mats) {
  let out = mats[0];
  for (let i = 1; i < mats.length; i++) out = multiply(out, mats[i]);
  return out;
}

export function translation(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function scaling(x, y, z) {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

export function rotationX(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function rotationY(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function rotationZ(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Right-handed perspective projection. fovY in radians, mapping depth to the
// WebGL clip range [-1, 1]. near/far are positive distances.
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

// Right-handed view matrix looking from `eye` toward `target`, `up` roughly up.
export function lookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;

  // x = normalize(cross(up, z))
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;

  // y = cross(z, x)
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return [
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ];
}

// Transform a vec3 as a point (w = 1) and apply the perspective divide.
// Returns [x, y, z] in the matrix's output space (clip space for a projection).
export function transformPoint(m, p) {
  const x = p[0], y = p[1], z = p[2];
  const ox = m[0] * x + m[4] * y + m[8] * z + m[12];
  const oy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const oz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const ow = m[3] * x + m[7] * y + m[11] * z + m[15];
  const w = ow === 0 ? 1 : ow;
  return [ox / w, oy / w, oz / w];
}

// Build an orientation matrix whose columns are the given axes (each a vec3).
// Maps local +X->x, +Y->y, +Z->z. Used to orient the ship into the rail frame.
export function basis(x, y, z) {
  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    0, 0, 0, 1,
  ];
}

export function transpose(m) {
  return [
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ];
}

// The normal matrix for flat shading is the inverse-transpose of the upper 3x3
// of the model matrix. For our meshes (rotation + uniform scale + translation)
// the upper 3x3 is already orthogonal-up-to-scale, but we compute it honestly so
// non-uniform scale never silently breaks lighting.
//
// Neat identity: (M^-1)^T equals the cofactor matrix of M divided by det(M), so
// we compute cofactors directly and skip an explicit inverse+transpose. Returns
// a column-major 3x3 ([N00,N10,N20, N01,N11,N21, N02,N12,N22]).
export function normalMatrix3(m) {
  // Upper-left 3x3, unpacked from column-major storage into named entries.
  const M00 = m[0], M10 = m[1], M20 = m[2];
  const M01 = m[4], M11 = m[5], M21 = m[6];
  const M02 = m[8], M12 = m[9], M22 = m[10];

  // Cofactors C_ij = (-1)^(i+j) * minor_ij.
  const C00 = M11 * M22 - M12 * M21;
  const C01 = -(M10 * M22 - M12 * M20);
  const C02 = M10 * M21 - M11 * M20;
  const C10 = -(M01 * M22 - M02 * M21);
  const C11 = M00 * M22 - M02 * M20;
  const C12 = -(M00 * M21 - M01 * M20);
  const C20 = M01 * M12 - M02 * M11;
  const C21 = -(M00 * M12 - M02 * M10);
  const C22 = M00 * M11 - M01 * M10;

  const det = M00 * C00 + M01 * C01 + M02 * C02;
  if (det === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const invDet = 1 / det;

  // N = cofactor / det, stored column-major.
  return [
    C00 * invDet, C10 * invDet, C20 * invDet,
    C01 * invDet, C11 * invDet, C21 * invDet,
    C02 * invDet, C12 * invDet, C22 * invDet,
  ];
}
