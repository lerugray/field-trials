// The branching route map — M5's marquee screen. Code-drawn on a 2D canvas over a
// dimmed backdrop (no images), it shows the whole run at a glance: ranks left to
// right, nodes as sector cards, branches as lines, your position, the medals of
// levels already flown, and — at a debrief — the forward choices you can commit to.
//
// Accessibility law: every state carries a SHAPE, never color alone. Threat is a
// row of pips (count, not hue). A reward hint is a labelled glyph. A gated branch
// shows a lock icon and a "needs a medal" note. The current selection is a thick
// bracket. Reachable by keyboard (Up/Down between choices, Enter to commit) and by
// mouse (click a lit card). Browser-only.

const MONO = 'ui-monospace,Menlo,Consolas,monospace';
const SHADOW = 'rgba(0,0,0,0.6)';
const INK = '#cfe6e2';
const DIM = '#5f7681';
const HILITE = '#ffd24a';       // the choosable / selected accent (warm)
const LOCK = '#c06a5c';         // gated branch accent
const THREAT_COL = '#ff8a5c';
const MEDAL_COL = { gold: '#ffd24a', silver: '#cfd6dd', bronze: '#d3894a', none: '#5f7681' };

export function createRouteMap() {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:30', 'display:none',
    'background:rgba(6,10,16,0.86)',
  ].join(';');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  root.appendChild(canvas);
  document.body.appendChild(root);
  const ctx = canvas.getContext('2d');

  let vw = 0, vh = 0, dpr = 1;
  let open = false;
  let model = null;   // { route, currentId, flown, choices, onChoose, title, subtitle }
  let sel = 0;        // index into the unlocked-choice list
  let rects = [];     // { id, x, y, w, h, node, choosable, locked } for hit-testing

  function resize(w, h, ratio) {
    vw = w; vh = h; dpr = ratio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (open) draw();
  }

  // The choices the player may actually pick right now (unlocked branch targets).
  function openChoices() {
    return model && model.choices ? model.choices.filter((c) => !c.locked) : [];
  }

  function layout() {
    rects = [];
    const r = model.route;
    const padX = 90, padTop = 130, padBot = 96;
    const cols = r.levels;
    const cw = 158, ch = 62;
    const colGap = cols > 1 ? (vw - padX * 2 - cw) / (cols - 1) : 0;
    const areaH = vh - padTop - padBot;
    for (let rk = 0; rk < cols; rk++) {
      const nodes = r.ranks[rk];
      const cx = padX + colGap * rk;
      const rowGap = nodes.length > 1 ? areaH / (nodes.length) : 0;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const cy = nodes.length === 1
          ? padTop + areaH / 2 - ch / 2
          : padTop + rowGap * (i + 0.5) - ch / 2;
        const choice = model.choices && model.choices.find((c) => c.node.id === node.id);
        rects.push({
          id: node.id, x: cx, y: cy, w: cw, h: ch, node,
          choosable: !!choice, locked: choice ? choice.locked : false,
        });
      }
    }
  }

  function rectOf(id) { return rects.find((r) => r.id === id); }

  // small helpers ----------------------------------------------------------------
  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function threatPips(x, y, n) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < n ? THREAT_COL : 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + i * 9, y, 6, 6);
    }
  }

  // a tiny shape per reward hint (shape carries meaning, color is accent)
  function hintGlyph(x, y, hint) {
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (hint === 'supplies') {          // a plus (aid)
      ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + 8); ctx.moveTo(x, y + 4); ctx.lineTo(x + 8, y + 4); ctx.stroke();
    } else if (hint === 'salvage') {    // a diamond (loot)
      ctx.moveTo(x + 4, y); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x + 4, y + 8); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.stroke();
    } else if (hint === 'quiet') {      // a wave/tilde-ish calm mark
      ctx.moveTo(x, y + 5); ctx.quadraticCurveTo(x + 2, y + 1, x + 4, y + 4); ctx.quadraticCurveTo(x + 6, y + 7, x + 8, y + 3); ctx.stroke();
    } else {                            // contested: crossed slashes
      ctx.moveTo(x, y); ctx.lineTo(x + 8, y + 8); ctx.moveTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.stroke();
    }
  }

  function lockGlyph(x, y) {
    ctx.strokeStyle = LOCK; ctx.lineWidth = 1.8;
    ctx.strokeRect(x, y + 4, 9, 7);                       // body
    ctx.beginPath(); ctx.arc(x + 4.5, y + 4, 3, Math.PI, 0); ctx.stroke(); // shackle
  }

  function medalChip(x, y, medal) {
    ctx.fillStyle = MEDAL_COL[medal] || DIM;
    ctx.beginPath(); ctx.arc(x + 5, y + 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SHADOW; ctx.font = `700 8px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(medal.charAt(0).toUpperCase(), x + 5, y + 5.5);
  }

  function selectionBracket(x, y, w, h) {
    ctx.strokeStyle = HILITE; ctx.lineWidth = 3;
    const L = 14, o = 5;
    const cs = [[x - o, y - o, 1, 1], [x + w + o, y - o, -1, 1], [x + w + o, y + h + o, -1, -1], [x - o, y + h + o, 1, -1]];
    for (const [cx, cy, sx, sy] of cs) {
      ctx.beginPath(); ctx.moveTo(cx, cy + sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * L, cy); ctx.stroke();
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (!model) return;
    layout();
    const r = model.route;
    const opens = openChoices();
    const selId = opens.length ? opens[Math.min(sel, opens.length - 1)].node.id : null;

    // title + subtitle
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = SHADOW; ctx.fillText(model.title, vw / 2 + 1, 52 + 1);
    ctx.fillStyle = HILITE; ctx.fillText(model.title, vw / 2, 52);
    if (model.subtitle) {
      ctx.font = `500 14px ${MONO}`;
      ctx.fillStyle = INK; ctx.fillText(model.subtitle, vw / 2, 78);
    }

    // edges first (under the cards)
    for (const rc of rects) {
      const from = rc.node;
      for (const tid of from.branches || []) {
        const tr = rectOf(tid);
        if (!tr) continue;
        const lit = model.currentId === from.id; // branches leaving the current node
        ctx.strokeStyle = lit ? 'rgba(255,210,74,0.55)' : 'rgba(140,165,175,0.22)';
        ctx.lineWidth = lit ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(rc.x + rc.w, rc.y + rc.h / 2);
        const mx = (rc.x + rc.w + tr.x) / 2;
        ctx.bezierCurveTo(mx, rc.y + rc.h / 2, mx, tr.y + tr.h / 2, tr.x, tr.y + tr.h / 2);
        ctx.stroke();
      }
    }

    // node cards
    for (const rc of rects) {
      const isCurrent = rc.id === model.currentId;
      const flownMedal = model.flown ? model.flown[rc.id] : undefined;
      const isSel = rc.id === selId;
      const dim = !rc.choosable && !isCurrent && flownMedal === undefined;

      roundRect(rc.x, rc.y, rc.w, rc.h, 8);
      ctx.fillStyle = isCurrent ? 'rgba(30,52,44,0.96)' : 'rgba(14,20,28,0.94)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rc.locked ? LOCK
        : rc.choosable ? HILITE
        : isCurrent ? '#4fd0c0'
        : flownMedal !== undefined ? (MEDAL_COL[flownMedal] || DIM)
        : 'rgba(120,140,150,0.35)';
      ctx.stroke();
      ctx.globalAlpha = dim ? 0.5 : 1;

      // sector name
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = SHADOW; ctx.fillText(rc.node.sectorName, rc.x + 12.6, rc.y + 22.6);
      ctx.fillStyle = isCurrent ? '#bfe9e2' : INK; ctx.fillText(rc.node.sectorName, rc.x + 12, rc.y + 22);

      // threat pips + label
      threatPips(rc.x + 12, rc.y + 34, rc.node.threat);
      ctx.font = `500 10px ${MONO}`; ctx.fillStyle = DIM;
      ctx.fillText('THREAT', rc.x + 46, rc.y + 40);

      // reward hint (glyph + word)
      hintGlyph(rc.x + 12, rc.y + 46, rc.node.hint);
      ctx.font = `500 10px ${MONO}`; ctx.fillStyle = INK;
      ctx.fillText(rc.node.hint, rc.x + 26, rc.y + 54);

      // corner state: flown medal, current marker, or lock
      if (flownMedal !== undefined) medalChip(rc.x + rc.w - 16, rc.y + 8, flownMedal);
      else if (isCurrent) {
        ctx.font = `700 9px ${MONO}`; ctx.fillStyle = '#4fd0c0'; ctx.textAlign = 'right';
        ctx.fillText('HERE', rc.x + rc.w - 10, rc.y + 16);
      }
      if (rc.locked) lockGlyph(rc.x + rc.w - 18, rc.y + rc.h - 18);
      ctx.globalAlpha = 1;

      if (isSel) selectionBracket(rc.x, rc.y, rc.w, rc.h);
    }

    // footer hint
    ctx.textAlign = 'center'; ctx.font = `500 12px ${MONO}`; ctx.fillStyle = DIM;
    const foot = opens.length
      ? 'Up/Down choose a heading   Enter commit' + (model.choices.some((c) => c.locked) ? '   (locked routes need a medal)' : '')
      : model.footer || 'Enter to launch';
    ctx.fillText(foot, vw / 2, vh - 40);
  }

  function commit() {
    const opens = openChoices();
    if (!opens.length) { if (model.onLaunch) model.onLaunch(); return; }
    const pick = opens[Math.min(sel, opens.length - 1)];
    if (model.onChoose) model.onChoose(pick.node.id);
  }

  function handleKey(code) {
    if (!open) return false;
    const opens = openChoices();
    if (code === 'ArrowUp' || code === 'KeyW') { sel = (sel - 1 + Math.max(1, opens.length)) % Math.max(1, opens.length); draw(); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { sel = (sel + 1) % Math.max(1, opens.length); draw(); return true; }
    if (code === 'Enter' || code === 'Space') { commit(); return true; }
    return false;
  }

  root.addEventListener('mousedown', (e) => {
    if (!open) return;
    const x = e.clientX, y = e.clientY;
    for (const rc of rects) {
      if (x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h) {
        if (rc.choosable && !rc.locked) {
          const opens = openChoices();
          sel = Math.max(0, opens.findIndex((c) => c.node.id === rc.id));
          commit();
        }
        return;
      }
    }
  });

  return {
    el: root,
    resize,
    isOpen: () => open,
    handleKey,
    // Show the map. `opts` = { route, currentId, flown(id->medal), choices, title,
    //   subtitle, footer, onChoose(id), onLaunch() }.
    show(opts) {
      model = opts; sel = 0; open = true;
      root.style.display = 'block';
      draw();
    },
    hide() { open = false; root.style.display = 'none'; },
    redraw: draw,
  };
}
