// freshpress.js — event-driven menu input gate. A screen opened while gameplay
// keys are held must wait for those keys to be released, then require a new
// non-repeat keydown before it can activate a choice. No wall clock required.

export function createFreshPressGate() {
  let open = false;
  const blocked = new Set();
  return {
    open(heldCodes = []) {
      open = true;
      blocked.clear();
      for (const code of heldCodes) blocked.add(code);
    },
    close() {
      open = false;
      blocked.clear();
    },
    keyDown(code, repeat = false) {
      if (!open || repeat || blocked.has(code)) return false;
      blocked.add(code); // another activation needs a release + fresh press
      return true;
    },
    keyUp(code) { blocked.delete(code); },
    isBlocked(code) { return blocked.has(code); },
  };
}

export default createFreshPressGate;
