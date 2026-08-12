// The run's framing screens — the briefing (Cuckoo sends you off) and the results
// summary (medals, score, Cuckoo's sign-off). DOM overlays in the charm register,
// warm and plainly laid out, code-drawn like everything else. Browser-only.
//
// Cuckoo is REPRESENTED here by name, voice, and his RECOGNIZABLE beagle portrait —
// the same mandate-compliant likeness the hub draws (src/gfx/portraits.js). Through
// M12 the briefing header used an abstract command emblem because the M6 portrait had
// not shipped yet; M13 (certification) caught the two-faces mismatch and routes the
// header through the real portrait so Cuckoo has ONE face everywhere (the abstract
// command emblem that stood in until then is retired). The words are Cuckoo's (blessed).

import { MEDAL_STYLE } from '../run/medals.js';
import { portraitCanvas } from '../gfx/portraits.js';

// Cuckoo's portrait key — the briefing speaker is always Squadron Command (Cuckoo).
const CUCKOO_KEY = 'cuckoo';

const MONO = 'ui-monospace,Menlo,Consolas,monospace';

function panel() {
  const p = document.createElement('div');
  p.style.cssText = [
    'max-width:560px', 'width:calc(100% - 48px)',
    'background:rgba(12,18,26,0.97)', 'border:1px solid #24405a',
    'border-radius:12px', 'padding:26px 30px',
    'box-shadow:0 10px 48px rgba(0,0,0,0.6)', 'pointer-events:auto',
    `font:15px/1.6 ${MONO}`, 'color:#cfe6e2',
  ].join(';');
  return p;
}

function scrim() {
  const s = document.createElement('div');
  s.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:32', 'display:none',
    'align-items:center', 'justify-content:center',
    'background:rgba(6,10,16,0.9)',
  ].join(';');
  document.body.appendChild(s);
  return s;
}

export function createScreens() {
  const brief = scrim();
  const results = scrim();
  const loadout = scrim();
  let onGo = null, onRetry = null, onPick = null, onHangar = null;
  let loadoutChoices = [], loadoutSel = 0;

  // --- briefing --------------------------------------------------------------
  function showBriefing(briefing, go) {
    onGo = go;
    brief.innerHTML = '';
    const p = panel();

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:16px';
    // M13 B2: Cuckoo's real beagle portrait (one face everywhere), framed like the hub.
    const pf = document.createElement('div');
    pf.style.cssText = 'flex:0 0 auto;border-radius:8px;overflow:hidden;background:#0d1620;border:1px solid #24405a';
    pf.appendChild(portraitCanvas(CUCKOO_KEY, 58));
    head.appendChild(pf);
    const nm = document.createElement('div');
    nm.innerHTML =
      '<div style="color:#ffd24a;letter-spacing:2px;font-weight:700">MISSION BRIEFING</div>' +
      '<div style="color:#bfe9e2;font-size:16px;font-weight:700;margin-top:2px">' + briefing.speaker + '</div>' +
      '<div style="color:#6f8a92;font-size:11px">Squadron Command</div>';
    head.appendChild(nm);
    p.appendChild(head);

    for (const line of briefing.lines) {
      const l = document.createElement('div');
      l.textContent = line;
      l.style.cssText = 'margin:10px 0;color:#dfeeea';
      p.appendChild(l);
    }

    const btn = document.createElement('div');
    btn.textContent = 'LAUNCH  ▸';
    btn.style.cssText =
      'margin-top:20px;text-align:center;padding:11px;border-radius:8px;' +
      'background:rgba(255,210,74,0.14);border:1px solid #ffd24a;color:#ffd24a;' +
      'font-weight:700;letter-spacing:2px;cursor:pointer';
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); if (onGo) onGo(); });
    p.appendChild(btn);

    const hint = document.createElement('div');
    hint.textContent = 'Enter to launch';
    hint.style.cssText = 'margin-top:10px;text-align:center;color:#6f8a92;font-size:11px';
    p.appendChild(hint);

    brief.appendChild(p);
    brief.style.display = 'flex';
  }

  // --- results ---------------------------------------------------------------
  // summary from runflow.summary(); signoff = cuckooSignoff(summary); levelNames maps
  // a node id -> its sector name (for the per-level list).
  function showResults(summary, signoff, levelNames, retry, hangar) {
    onRetry = retry;    // primary: fly a fresh sortie right now (S8 — honest "fly again")
    onHangar = hangar;  // secondary: head to the hangar (home base)
    results.innerHTML = '';
    const p = panel();
    const won = summary.victory;

    const title = document.createElement('div');
    title.textContent = won ? 'RUN COMPLETE' : 'RUN ENDED';
    title.style.cssText =
      'text-align:center;letter-spacing:3px;font-weight:700;font-size:22px;' +
      'color:' + (won ? '#7fe0a8' : '#ff8a6f');
    p.appendChild(title);

    // run medal, big
    const ms = MEDAL_STYLE[summary.runMedal] || MEDAL_STYLE.none;
    const medal = document.createElement('div');
    medal.style.cssText = 'text-align:center;margin:14px 0 6px';
    medal.innerHTML =
      '<div style="font-size:13px;color:#6f8a92;letter-spacing:2px">RUN MEDAL</div>' +
      '<div style="font-size:30px;font-weight:700;letter-spacing:3px;color:' + ms.color + '">' + ms.label + '</div>';
    p.appendChild(medal);

    // totals
    const tot = document.createElement('div');
    tot.style.cssText = 'display:flex;justify-content:center;gap:34px;margin:12px 0 4px;text-align:center';
    tot.innerHTML =
      '<div><div style="font-size:24px;font-weight:700;color:#cfe6e2">' + String(summary.totalScore).padStart(6, '0') + '</div><div style="font-size:11px;color:#6f8a92">SCORE</div></div>' +
      '<div><div style="font-size:24px;font-weight:700;color:#cfe6e2">' + summary.totalKills + '</div><div style="font-size:11px;color:#6f8a92">DOWN</div></div>' +
      '<div><div style="font-size:24px;font-weight:700;color:#cfe6e2">' + summary.levelsFlown + '/' + summary.routeLevels + '</div><div style="font-size:11px;color:#6f8a92">SECTORS</div></div>';
    p.appendChild(tot);

    // per-level medals
    const list = document.createElement('div');
    list.style.cssText = 'margin:14px 0;border-top:1px solid #22384a;padding-top:10px';
    summary.levels.forEach((lv, i) => {
      const s = MEDAL_STYLE[lv.medal] || MEDAL_STYLE.none;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:3px 2px;font-size:13px';
      const name = (levelNames && levelNames[lv.id]) || ('Sector ' + (i + 1));
      row.innerHTML =
        '<span style="color:#9fb4bb">' + (i + 1) + '.  ' + name + '</span>' +
        '<span style="color:' + s.color + ';font-weight:700">' + s.label + '  ·  ' + lv.score + '</span>';
      list.appendChild(row);
    });
    p.appendChild(list);

    // Wings — who came home (M7). Always warm: a lost wing is "did not make it back",
    // never a rebuke, and they fly again next run.
    if (summary.wingsRostered > 0) {
      const wings = document.createElement('div');
      wings.style.cssText = 'margin:6px 0 2px;font-size:13px';
      const home = summary.wingsHome, tot = summary.wingsRostered;
      const col = summary.wingsLost > 0 ? '#e0b06f' : '#7fe0a8';
      let txt = '<span style="color:#9fb4bb">WINGS HOME</span> ' +
        '<span style="color:' + col + ';font-weight:700">' + home + ' / ' + tot + '</span>';
      if (summary.wingsLost > 0) {
        const names = summary.lostWings.map((w) => w.name).join(', ');
        txt += '<div style="color:#9fb4bb;font-size:12px;margin-top:3px">Did not make it back: ' + names + '. They fly again next run.</div>';
      }
      wings.innerHTML = txt;
      p.appendChild(wings);
    }

    // Cuckoo's sign-off
    const sign = document.createElement('div');
    sign.style.cssText = 'margin:12px 0;color:#dfeeea;font-style:normal';
    sign.innerHTML =
      '<span style="color:#ffd24a;font-weight:700">' + signoff.speaker + ':</span> ' + signoff.line;
    p.appendChild(sign);

    // S8: an immediate FLY AGAIN (a fresh sortie now) as the primary action; the hangar
    // is the quiet secondary. Previously "press R to fly again" routed to the hangar —
    // dishonest. Both are shape+text buttons (accessibility law), mouse + keys + pad.
    const flyBtn = document.createElement('div');
    flyBtn.textContent = 'FLY AGAIN  ▸';
    flyBtn.style.cssText =
      'margin-top:16px;text-align:center;padding:11px;border-radius:8px;' +
      'background:rgba(127,224,168,0.14);border:1px solid #7fe0a8;color:#7fe0a8;' +
      'font-weight:700;letter-spacing:2px;cursor:pointer';
    flyBtn.addEventListener('mousedown', (e) => { e.preventDefault(); if (onRetry) onRetry(); });
    p.appendChild(flyBtn);

    const hangarBtn = document.createElement('div');
    hangarBtn.textContent = 'To the hangar';
    hangarBtn.style.cssText =
      'margin-top:8px;text-align:center;padding:7px;color:#9fb4bb;font-size:13px;cursor:pointer';
    hangarBtn.addEventListener('mousedown', (e) => { e.preventDefault(); if (onHangar) onHangar(); });
    p.appendChild(hangarBtn);

    const hint = document.createElement('div');
    hint.textContent = 'R or Enter to fly again · H for the hangar';
    hint.style.cssText = 'margin-top:10px;text-align:center;color:#6f8a92;font-size:12px';
    p.appendChild(hint);

    results.appendChild(p);
    results.style.display = 'flex';
  }

  // --- mid-run loadout choice (M7) -------------------------------------------
  // The boon-pick beat at a branch point: pick ONE option for the rest of the run.
  // `choices` are boon objects from loadout.js (id/name/blurb, maybe instant). A
  // single choice, warm and plainly laid out; keyboard + mouse + pad.
  function renderLoadout() {
    loadout.innerHTML = '';
    const p = panel();

    const head = document.createElement('div');
    head.style.cssText = 'margin-bottom:6px';
    head.innerHTML =
      '<div style="color:#ffd24a;letter-spacing:2px;font-weight:700">FIELD LOADOUT</div>' +
      '<div style="color:#9fb4bb;font-size:12px;margin-top:3px">Pick one for the rest of the run. Kirby packed a few in the bay.</div>';
    p.appendChild(head);

    loadoutChoices.forEach((b, i) => {
      const sel = i === loadoutSel;
      const card = document.createElement('div');
      card.style.cssText = [
        'margin:10px 0', 'padding:11px 13px', 'border-radius:9px',
        'background:' + (sel ? 'rgba(255,210,74,0.12)' : 'rgba(255,255,255,0.03)'),
        'border:1px solid ' + (sel ? '#ffd24a' : '#26404f'),
        'cursor:pointer',
      ].join(';');
      const tag = b.instant ? 'NOW' : 'RUN';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="color:' + (sel ? '#ffd24a' : '#cfe6e2') + ';font-weight:700">' + (sel ? '▸ ' : '') + b.name + '</span>' +
        '<span style="color:#6f8a92;font-size:10px;letter-spacing:1px">' + tag + '</span></div>' +
        '<div style="color:#9fb4bb;font-size:12px;margin-top:3px">' + b.blurb + '</div>';
      card.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
      card.addEventListener('mouseenter', () => { loadoutSel = i; renderLoadout(); });
      p.appendChild(card);
    });

    const hint = document.createElement('div');
    hint.textContent = 'arrows to choose, Enter to take it';
    hint.style.cssText = 'margin-top:12px;text-align:center;color:#6f8a92;font-size:11px';
    p.appendChild(hint);

    loadout.appendChild(p);
  }

  function pick(i) {
    const b = loadoutChoices[i];
    if (!b || !onPick) return;
    const cb = onPick;
    onPick = null;
    loadout.style.display = 'none';
    cb(b.id);
  }

  function showLoadout(choices, cb) {
    loadoutChoices = choices || [];
    loadoutSel = 0;
    onPick = cb;
    if (!loadoutChoices.length) { // nothing to offer (pool exhausted) -> skip cleanly
      onPick = null;
      if (cb) cb(null);
      return;
    }
    renderLoadout();
    loadout.style.display = 'flex';
  }

  function hide() {
    brief.style.display = 'none';
    results.style.display = 'none';
    loadout.style.display = 'none';
  }

  return {
    showBriefing,
    showResults,
    showLoadout,
    hide,
    briefingOpen: () => brief.style.display !== 'none',
    resultsOpen: () => results.style.display !== 'none',
    loadoutOpen: () => loadout.style.display !== 'none',
    fireBriefing() { if (onGo) onGo(); },
    fireRetry() { if (onRetry) onRetry(); },
    fireHangar() { if (onHangar) onHangar(); },
    fireLoadout() { if (loadoutOpenNow()) pick(loadoutSel); },
    moveLoadout(dir) {
      if (!loadoutOpenNow() || !loadoutChoices.length) return;
      loadoutSel = (loadoutSel + dir + loadoutChoices.length) % loadoutChoices.length;
      renderLoadout();
    },
    handleLoadoutKey(code) {
      if (!loadoutOpenNow()) return false;
      if (code === 'ArrowUp' || code === 'KeyW') { this.moveLoadout(-1); return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { this.moveLoadout(1); return true; }
      if (code === 'Enter' || code === 'Space') { pick(loadoutSel); return true; }
      const m = /^Digit([1-9])$/.exec(code);
      if (m) { const n = +m[1] - 1; if (n < loadoutChoices.length) pick(n); return true; }
      return false;
    },
  };

  function loadoutOpenNow() { return loadout.style.display !== 'none'; }
}
