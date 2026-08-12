// Debug + input-debug overlay. DESIGN-SEED requires a LIVE input-debug overlay
// (axes, buttons, deadzone) from M1 — this is that surface, plus a small engine
// readout (fps, resolution, seed, triangle count, GL renderer). It is a
// permanent dev tool, not placeholder UI: legible, monospace, translucent,
// toggleable. Browser-only (builds DOM). Not shipped game HUD — that arrives M2.

// Small helper: a labeled row whose value we update each frame.
function row(parent, label) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;justify-content:space-between;gap:16px;white-space:pre';
  const k = document.createElement('span');
  k.textContent = label;
  k.style.opacity = '0.6';
  const v = document.createElement('span');
  v.style.color = '#cfe';
  el.appendChild(k);
  el.appendChild(v);
  parent.appendChild(el);
  return v;
}

// A horizontal bar in [-1,1] for an analog axis, centered.
function axisBar(parent, label) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin:1px 0';
  const k = document.createElement('span');
  k.textContent = label;
  k.style.cssText = 'opacity:0.6;width:34px';
  const track = document.createElement('div');
  track.style.cssText =
    'position:relative;flex:1;height:8px;background:#0b1420;border:1px solid #23384d';
  const mid = document.createElement('div');
  mid.style.cssText =
    'position:absolute;left:50%;top:0;bottom:0;width:1px;background:#37506b';
  const fill = document.createElement('div');
  fill.style.cssText =
    'position:absolute;top:0;bottom:0;left:50%;width:0;background:#4fd0c0';
  const num = document.createElement('span');
  num.style.cssText = 'width:52px;text-align:right;color:#cfe';
  track.appendChild(mid);
  track.appendChild(fill);
  wrap.appendChild(k);
  wrap.appendChild(track);
  wrap.appendChild(num);
  parent.appendChild(wrap);
  return (val) => {
    const v = Math.max(-1, Math.min(1, val || 0));
    // fill from center outward
    if (v >= 0) {
      fill.style.left = '50%';
      fill.style.width = 50 * v + '%';
    } else {
      fill.style.left = 50 + 50 * v + '%';
      fill.style.width = -50 * v + '%';
    }
    num.textContent = v.toFixed(3);
  };
}

function panel(title, corner) {
  const p = document.createElement('div');
  p.style.cssText = [
    'position:fixed',
    corner,
    'font:12px/1.45 ui-monospace,Menlo,Consolas,monospace',
    'color:#9fb4c8',
    'background:rgba(8,14,22,0.82)',
    'border:1px solid #1d3247',
    'border-radius:6px',
    'padding:8px 10px',
    'min-width:236px',
    'z-index:10',
    'pointer-events:none',
    'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
  ].join(';');
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText =
    'color:#f0a24a;letter-spacing:1px;margin-bottom:5px;font-weight:bold';
  p.appendChild(h);
  return p;
}

export function createOverlay() {
  const engine = panel('SUBSTRATE', 'top:10px;left:10px');
  const rFps = row(engine, 'fps');
  const rRes = row(engine, 'resolution');
  const rSeed = row(engine, 'seed');
  const rTris = row(engine, 'triangles');
  const rGl = row(engine, 'renderer');
  const rSpeed = row(engine, 'speed');
  const rRail = row(engine, 'rail s');
  const rMeter = row(engine, 'meter');
  // Where the ship sits in its steering frame. The input-debug surface showed what the
  // sticks were doing but never where the ship ended up, which made a steering
  // complaint ("the plane snaps back to the middle") impossible to check without
  // guessing at pixels. Now it is one readable number per axis.
  const rOff = row(engine, 'frame off');

  // Bottom-RIGHT so it never sits on top of the bottom-left Hull readout (M13 B1).
  const input = panel('INPUT  (F310 target)', 'bottom:10px;right:10px');
  const rPad = row(input, 'gamepad');
  const rMap = row(input, 'mapping');
  const rDz = row(input, 'deadzone');
  const bLx = axisBar(input, 'L.x');
  const bLy = axisBar(input, 'L.y');
  const bRx = axisBar(input, 'R.x');
  const bRy = axisBar(input, 'R.y');
  const rBtns = row(input, 'buttons');
  const rKeys = row(input, 'keys');

  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:5px;opacity:0.45';
  hint.textContent = '~ toggles overlay';
  input.appendChild(hint);

  document.body.appendChild(engine);
  document.body.appendChild(input);

  // M13 B1: the dev overlay is HIDDEN by default for every visitor. It is opt-in
  // via ?debug (boot) and the ~/F1 toggle below — it must never ship on to a player.
  let visible = false;
  engine.style.display = 'none';
  input.style.display = 'none';
  const onKey = (e) => {
    if (e.code === 'Backquote' || e.code === 'F1') {
      visible = !visible;
      engine.style.display = visible ? 'block' : 'none';
      input.style.display = visible ? 'block' : 'none';
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    update(s) {
      rFps.textContent = s.fps != null ? s.fps.toFixed(0) : '—';
      rRes.textContent = s.width + ' x ' + s.height + ' @' + (s.dpr || 1) + 'x';
      rSeed.textContent = String(s.seed);
      rTris.textContent = String(s.triangles);
      rGl.textContent = s.glRenderer || 'webgl2';
      if (s.flight) {
        rSpeed.textContent = s.flight.speed.toFixed(1) + '  (' + s.flight.mode + ')';
        rRail.textContent = s.flight.s.toFixed(1);
        rMeter.textContent = (s.flight.meter * 100).toFixed(0) + '%';
        rOff.textContent = 'x ' + s.flight.offX.toFixed(2) + '   y ' + s.flight.offY.toFixed(2);
      }

      const gp = s.gamepad;
      if (gp) {
        rPad.textContent = gp.id.length > 26 ? gp.id.slice(0, 26) + '…' : gp.id;
        rMap.textContent = gp.mapping;
        rDz.textContent = gp.deadzone.toFixed(2);
        bLx(gp.left[0]); bLy(gp.left[1]); bRx(gp.right[0]); bRy(gp.right[1]);
        const pressed = gp.buttons
          .map((b, i) => (b.pressed ? i : -1))
          .filter((i) => i >= 0);
        rBtns.textContent = pressed.length ? pressed.join(' ') : '—';
      } else {
        rPad.textContent = 'none connected';
        rMap.textContent = '—';
        rDz.textContent = (s.deadzone || 0).toFixed(2);
        bLx(0); bLy(0); bRx(0); bRy(0);
        rBtns.textContent = '—';
      }
      rKeys.textContent = s.keys && s.keys.length ? s.keys.join(' ') : '—';
    },
    // Force the dev overlays hidden (e.g. a clean HUD proof capture). The ~/F1
    // toggle still works from whatever state this leaves.
    setVisible(v) {
      visible = v;
      engine.style.display = v ? 'block' : 'none';
      input.style.display = v ? 'block' : 'none';
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      engine.remove();
      input.remove();
    },
  };
}
