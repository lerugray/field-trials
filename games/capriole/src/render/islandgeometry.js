// islandgeometry.js — pure geometry measurements shared by the Three renderer and
// headless verification. Keeping the cap/body seam here makes the visible island
// profile testable without constructing a WebGL scene.

export function islandSurfaceProfile(isl) {
  return {
    capY: isl.topY,
    bodyTopY: isl.topY,
    depth: 10 + isl.radius * 0.26,
  };
}

export default islandSurfaceProfile;
