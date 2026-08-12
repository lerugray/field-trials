// The chase-camera rig, as pure data. Split out of main.js so anything that needs to
// reason about what the camera can actually SEE — notably the enemy-visibility floor,
// which has to convert a combat range into a distance through the haze — reads the
// same numbers main.js hands the renderer, instead of a second copy that can drift.
//
// back/up/lookLead/shipLead are rail units; fov is radians.
export const CAM = {
  back: 7,        // how far behind the ship's rail station the eye sits
  up: 2.1,        // how far above the rail the eye rides
  lookLead: 20,   // the rail station the camera aims at
  shipLead: 6,    // how far AHEAD of the camera's rail station the ship flies
  fov: Math.PI / 3,
};
