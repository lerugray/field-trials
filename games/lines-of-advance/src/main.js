// main.js: application bootstrap for the LINES OF ADVANCE v1 release candidate.

import {
  createState,
  resetToTestPreset,
  resetToCommsDrill,
  resetToCommCut,
  serializeState,
  parseState,
  findPiece,
  selectPiece,
  clearSelection,
  coordFromXY,
  xyFromCoord,
  BOARD_COLS,
  BOARD_ROWS,
  isFighter,
  isRelay
} from './state.js';
import { makeBoard, nextSupplyCoverageMode } from './board.js';
import { makeWalkthrough } from './walkthrough.js';
import { makeHelp } from './help.js';
import { makeInputHandlers } from './input.js';
import { createDebugLog, copyOrDownloadDebugLog } from './debuglog.js';
import { AudioEngine, isReducedMotion } from './audio.js';
import { getLegalMoves } from './movement.js';
import { computeCommunications } from './comms.js';
import {
  initTurnState,
  tryTurnMove,
  applyCombat,
  applyArsenalCapture,
  applyRetreat,
  endTurn,
  undo,
  restart,
  isInRetreatPhase,
  currentPendingRetreat,
  canDeclareAttack,
  movesRemaining,
  computeCombatPreview,
  agreeDraw,
  concede
} from './turn.js';
import { isArsenal, arsenalSide, activeArsenalsForSide } from './terrain.js';
import {
  ENGINE_SEED,
  ENGINE_TIME_BUDGET_MS,
  HINT_TIME_BUDGET_MS,
  applyAction,
  evaluatePosition,
  formatPrincipalVariation,
  positionKey,
  searchBestAction
} from './engine.js';
import { APP_VERSION, BUILD_STAMP, validateReleaseHooks } from './release-config.js';
import { CLASS_TO_CODE } from './notation.js';

const SAVE_KEY = 'loa-m4';
const SETTINGS_KEY = 'loa-settings-v1';
const PIECE_STYLES = Object.freeze(['default', 'nato', 'chess']);
const ENGINE_SIDES = Object.freeze(['None', 'North', 'South']);
const PRESET_LABELS = Object.freeze({
  standard: 'Standard',
  test: 'Standard',
  'comms-drill': 'Comms Audit',
  'comm-cut': 'Cut Demo'
});

function presetLabel(preset) {
  return PRESET_LABELS[preset] || preset;
}

function isGameInProgress(state) {
  if (state.gameOver) return false;
  return state.moveCount > 0
    || state.turnNumber > 1
    || state.hasAttacked
    || (state.movedThisTurn && state.movedThisTurn.length > 0)
    || (state.retreatedThisTurn && state.retreatedThisTurn.length > 0)
    || (state.pendingRetreats && state.pendingRetreats.length > 0);
}

function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key === 'htmlFor') el.setAttribute('for', val);
    else if (key === 'checked' || key === 'disabled') el[key] = Boolean(val);
    else el.setAttribute(key, val);
  }
  for (const child of children) el.appendChild(child);
  return el;
}

function buildHeader() {
  const sandboxPill = createElement('span', {
    className: 'sandbox-pill',
    textContent: 'MANUAL MODE: ENGINE PAUSED'
  });
  const turnPill = createElement('span', { className: 'turn-pill', textContent: 'North to move' });
  const zoomOutBtn = createElement('button', {
    className: 'zoom-button',
    type: 'button',
    title: 'Zoom out',
    'aria-label': 'Zoom out',
    textContent: '−'
  });
  const zoomLevel = createElement('span', { className: 'zoom-level', textContent: '100%' });
  const zoomInBtn = createElement('button', {
    className: 'zoom-button',
    type: 'button',
    title: 'Zoom in',
    'aria-label': 'Zoom in',
    textContent: '+'
  });
  const fitBtn = createElement('button', {
    className: 'zoom-fit',
    type: 'button',
    title: 'Fit the whole board',
    textContent: 'Fit'
  });
  const coverageBtn = createElement('button', {
    className: 'header-coverage',
    type: 'button',
    title: 'Cycle supply coverage (C)',
    'aria-keyshortcuts': 'C',
    textContent: 'Supply: Off'
  });
  const helpBtn = createElement('button', {
    className: 'header-help',
    type: 'button',
    textContent: 'Help'
  });
  const zoomControls = createElement('div', {
    className: 'zoom-controls',
    role: 'group',
    'aria-label': 'Board zoom'
  }, [zoomOutBtn, zoomLevel, zoomInBtn, fitBtn]);
  const header = createElement('header', {}, [
    createElement('h1', { textContent: 'LINES OF ADVANCE' }),
    createElement('div', { className: 'header-pills' }, [
      zoomControls,
      coverageBtn,
      helpBtn,
      sandboxPill,
      turnPill,
      createElement('span', { className: 'rules-pill', textContent: 'rules: 92.7% verified' })
    ])
  ]);
  return { header, sandboxPill, turnPill, zoomOutBtn, zoomLevel, zoomInBtn, fitBtn, coverageBtn, helpBtn };
}

function panelSection(title, children, className = '') {
  return createElement('section', { className: `panel-section ${className}`.trim() }, [
    createElement('h2', { textContent: title }),
    ...children
  ]);
}

function buildPanel(app, audio, getState) {
  const selectedCard = createElement('div', { className: 'card empty', textContent: 'No unit selected.' });
  const combatCard = createElement('div', { className: 'card empty', textContent: 'Select an enemy unit to inspect combat.' });
  const auditCard = createElement('div', { className: 'card empty', textContent: 'Select a unit to see its supply audit.' });
  const moveCount = createElement('div', { className: 'card', 'data-walkthrough-target': 'turn' });
  const logCard = createElement('div', { className: 'card log-card', textContent: 'Move log empty.' });
  const engineCard = createElement('div', { className: 'card engine-card' });
  const sessionStatus = createElement('div', {
    className: 'session-status',
    role: 'status',
    'aria-live': 'polite',
    textContent: 'Ready.'
  });
  const fileInput = createElement('input', {
    type: 'file',
    className: 'file-input',
    accept: '.json,.txt,.loa'
  });

  const resetBtn = createElement('button', { textContent: 'Opening' });
  const drillBtn = createElement('button', { textContent: 'Comms Audit' });
  const cutBtn = createElement('button', { textContent: 'Cut Demo' });
  const saveBtn = createElement('button', { textContent: 'Save File' });
  const loadBtn = createElement('button', { textContent: 'Load File…' });
  const localSaveBtn = createElement('button', { textContent: 'Store Local' });
  const localLoadBtn = createElement('button', { textContent: 'Recall Local' });
  const endTurnBtn = createElement('button', { className: 'primary', textContent: 'End Turn' });
  const undoBtn = createElement('button', { textContent: 'Undo' });
  const restartBtn = createElement('button', { textContent: 'Restart' });
  const concedeBtn = createElement('button', { textContent: 'Concede' });
  const drawBtn = createElement('button', { textContent: 'Agree Draw' });
  const walkthroughBtn = createElement('button', { textContent: 'Walkthrough' });
  const hintBtn = createElement('button', { textContent: 'Hint' });
  const debugLogBtn = createElement('button', { textContent: 'Copy debug log' });

  function confirmLiveGame(message) {
    return !isGameInProgress(getState()) || window.confirm(message);
  }

  resetBtn.addEventListener('click', () => {
    if (!confirmLiveGame('Start a new Opening setup? The current game will be lost.')) return;
    audio.playReset();
    app.reset();
  });
  drillBtn.addEventListener('click', () => {
    if (!confirmLiveGame('Load the Comms Audit scenario? The current game will be lost.')) return;
    audio.playReset();
    app.resetCommsDrill();
  });
  cutBtn.addEventListener('click', () => {
    if (!confirmLiveGame('Load the Cut Demo scenario? The current game will be lost.')) return;
    audio.playReset();
    app.resetCommCut();
  });
  saveBtn.addEventListener('click', () => app.saveToFile());
  loadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    // Clear immediately in this scope (fileInput is local here). Clearing inside
    // loadFromFile used to throw ReferenceError and left the value set, so
    // re-picking the same filename fired no change event (D1). The File object
    // is already captured above, so the read still proceeds.
    fileInput.value = '';
    await app.loadFromFile(file);
  });
  localSaveBtn.addEventListener('click', () => app.saveLocal());
  localLoadBtn.addEventListener('click', () => app.loadLocal());
  endTurnBtn.addEventListener('click', () => app.endTurn());
  undoBtn.addEventListener('click', () => app.undo());
  restartBtn.addEventListener('click', () => {
    if (!confirmLiveGame('Restart the current scenario? The current game will be lost.')) return;
    app.restart();
  });
  concedeBtn.addEventListener('click', () => {
    if (window.confirm('Concede for the side to move?')) app.concede();
  });
  drawBtn.addEventListener('click', () => {
    if (window.confirm('Have both players agreed to a draw?')) app.agreeDraw();
  });
  walkthroughBtn.addEventListener('click', () => app.startWalkthrough());
  hintBtn.addEventListener('click', () => app.hint());
  debugLogBtn.addEventListener('click', () => app.copyDebugLog());

  const engineSelect = createSelect('Opponent', [
    ['None', 'Hotseat'],
    ['North', 'Engine: North'],
    ['South', 'Engine: South']
  ], 'None', (value) => app.setEngineSide(value));
  const pieceStyleSelect = createSelect('Pieces', [
    ['default', 'Default'],
    ['nato', 'NATO counters'],
    ['chess', 'Chess-like']
  ], 'default', (value) => app.setPieceStyle(value));

  const sandboxToggle = createToggle('Manual mode (pause engine)', false, (v) => app.setSandbox(v));
  const commsToggle = createToggle('Show all supply lines', false, (v) => app.setShowAllComms(v));
  const sfxToggle = createToggle('Sound effects', true, (v) => audio.setSfx(v));
  const musicToggle = createToggle('Analysis music', false, (v) => audio.toggleMusic(v));
  const reducedToggle = createToggle('Reduced effects', isReducedMotion(), (v) => audio.setReducedEffects(v));

  const panel = createElement('aside', { className: 'panel', 'aria-label': 'Game controls and analysis' }, [
    panelSection('Selected Unit', [selectedCard]),
    panelSection('Combat Inspection', [combatCard]),
    panelSection('Supply Audit', [auditCard]),
    panelSection('Turn', [
      moveCount,
      createElement('div', { className: 'button-row' }, [endTurnBtn, undoBtn]),
      createElement('div', { className: 'button-row' }, [concedeBtn, drawBtn]),
      createElement('div', { className: 'button-row single' }, [restartBtn])
    ]),
    panelSection('Engine', [
      engineCard,
      createElement('div', { className: 'button-row single' }, [hintBtn])
    ]),
    panelSection('Move Log', [logCard]),
    panelSection('Session', [
      engineSelect,
      createElement('div', { className: 'button-row' }, [resetBtn, drillBtn]),
      createElement('div', { className: 'button-row' }, [cutBtn, saveBtn]),
      createElement('div', { className: 'button-row' }, [loadBtn, localSaveBtn]),
      createElement('div', { className: 'button-row' }, [localLoadBtn, walkthroughBtn]),
      sessionStatus
    ]),
    panelSection('Settings', [
      pieceStyleSelect,
      sandboxToggle,
      commsToggle,
      sfxToggle,
      musicToggle,
      reducedToggle,
      createElement('div', { className: 'button-row single' }, [debugLogBtn])
    ]),
    fileInput
  ]);

  return {
    panel,
    selectedCard,
    combatCard,
    moveCount,
    auditCard,
    logCard,
    engineCard,
    sessionStatus,
    controls: {
      sandboxToggle,
      commsToggle,
      sfxToggle,
      musicToggle,
      reducedToggle,
      engineSelect,
      pieceStyleSelect,
      hintBtn,
      concedeBtn,
      drawBtn,
      debugLogBtn
    }
  };
}

function createSelect(label, options, initial, onChange) {
  const select = createElement('select', { 'aria-label': label });
  for (const [value, textContent] of options) {
    const option = createElement('option', { value, textContent });
    if (value === initial) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  return createElement('label', { className: 'select-control' }, [
    createElement('span', { className: 'toggle-label', textContent: label }),
    select
  ]);
}

function createToggle(label, initial, onChange) {
  const id = `toggle-${Math.random().toString(36).slice(2)}`;
  const input = createElement('input', {
    type: 'checkbox',
    id,
    checked: initial
  });
  input.addEventListener('change', () => onChange(input.checked));
  const wrap = createElement('label', { className: 'toggle', htmlFor: id }, [
    input,
    createElement('span', { className: 'toggle-label', textContent: label })
  ]);
  return wrap;
}

function renderSelectedCard(card, state, comms) {
  if (state.gameOver) {
    card.className = 'card';
    card.innerHTML = '';
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: 'Result' }),
      createElement('span', { className: 'value', textContent: state.gameOver.winner ? `${state.gameOver.winner} wins` : 'Draw' })
    ]));
    card.appendChild(createElement('div', { className: 'audit-detail', textContent: state.gameOver.reason }));
    return;
  }
  if (isInRetreatPhase(state)) {
    const retreat = currentPendingRetreat(state);
    const p = retreat ? findPiece(state, retreat.id) : null;
    card.className = 'card';
    card.innerHTML = '';
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: 'Retreat required' }),
      createElement('span', { className: 'value', textContent: p ? `${p.cls} ${coordFromXY(p.x, p.y)}` : 'None' })
    ]));
    card.appendChild(createElement('div', { className: 'audit-detail', textContent: 'Choose an adjacent unoccupied square as the first move of this turn.' }));
    return;
  }
  if (!state.selectedId) {
    card.className = 'card empty';
    card.textContent = 'No unit selected.';
    return;
  }
  const p = findPiece(state, state.selectedId);
  if (!p) {
    card.className = 'card empty';
    card.textContent = 'No unit selected.';
    return;
  }
  card.className = 'card';
  card.innerHTML = '';

  const audit = comms.status.get(p.id);
  const legalCount = state.sandbox ? 0 : getLegalMoves(state, p.id, { comms }).length;

  const rows = [
    ['Side', p.side],
    ['Class', p.cls],
    ['Position', coordFromXY(p.x, p.y)],
    ['Attack', p.stats.attack],
    ['Defense', p.stats.defense + (audit && audit.status === 'isolated' ? ' (offline)' : '')],
    ['Range', p.stats.range],
    ['Movement', p.stats.movement],
    ['Supply', audit ? (audit.status === 'in-communication' ? 'in communication' : 'isolated') : 'unknown'],
    ['Legal moves', state.sandbox ? 'sandbox' : String(legalCount)]
  ];
  for (const [label, value] of rows) {
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: label }),
      createElement('span', { className: 'value', textContent: value })
    ]));
  }
}

function renderCombatCard(card, state) {
  if (state.gameOver || isInRetreatPhase(state)) {
    card.className = 'card empty';
    card.textContent = 'Select an enemy unit to inspect combat.';
    return;
  }
  if (!state.selectedId) {
    card.className = 'card empty';
    card.textContent = 'Select a friendly unit, then an enemy unit or arsenal.';
    return;
  }
  const selected = findPiece(state, state.selectedId);
  if (!selected || selected.side !== state.turn || state.hasAttacked) {
    card.className = 'card empty';
    card.textContent = state.hasAttacked ? 'Attack already declared this turn.' : 'Select a friendly unit.';
    return;
  }

  // Arsenal capture preview.
  if (isArsenal(selected.x, selected.y) && arsenalSide(selected.x, selected.y) !== selected.side
      && (state.movedThisTurn || []).includes(selected.id)
      && !(state.retreatedThisTurn || []).includes(selected.id)) {
    card.className = 'card';
    card.innerHTML = '';
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: 'Action' }),
      createElement('span', { className: 'value', textContent: 'Capture arsenal' })
    ]));
    card.appendChild(createElement('div', { className: 'audit-detail', textContent: `Click the arsenal at ${coordFromXY(selected.x, selected.y)} to capture it as this turn's attack.` }));
    return;
  }

  // Find a hovered/considered enemy unit. Prefer state.combatPreview if set.
  let preview = state.combatPreview;
  if (!preview) {
    // No preview; show hint.
    card.className = 'card empty';
    card.textContent = 'Click an enemy unit in range to inspect the deterministic result.';
    return;
  }

  if (preview.error) {
    card.className = 'card empty';
    card.textContent = preview.error;
    return;
  }

  card.className = 'card';
  card.innerHTML = '';
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Target' }),
    createElement('span', { className: 'value', textContent: `${preview.targetCls} ${preview.targetCoord}` })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Attack' }),
    createElement('span', { className: 'value', textContent: String(preview.totalAttack) })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Defense' }),
    createElement('span', { className: 'value', textContent: String(preview.totalDefense) })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Margin' }),
    createElement('span', { className: 'value', textContent: String(preview.margin) })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Result' }),
    createElement('span', { className: 'value', textContent: preview.result })
  ]));

  const attackers = createElement('div', { className: 'audit-detail', textContent: 'Attackers:' });
  for (const a of preview.attackBreakdown) {
    if (a.value === 0) continue;
    attackers.appendChild(createElement('div', { className: 'audit-detail', textContent: `${a.cls} ${a.coord}: ${a.value}${a.charging ? ' (charging)' : ''}` }));
  }
  card.appendChild(attackers);

  const defenders = createElement('div', { className: 'audit-detail', textContent: 'Defenders:' });
  for (const d of preview.defenseBreakdown) {
    if (d.value === 0) continue;
    defenders.appendChild(createElement('div', { className: 'audit-detail', textContent: `${d.cls} ${d.coord}: ${d.value}${d.terrain ? ` (+${d.terrain} terrain)` : ''}` }));
  }
  card.appendChild(defenders);
}

function renderAuditCard(card, state, comms) {
  if (!state.selectedId) {
    card.className = 'card empty';
    card.textContent = 'Select a unit to see its supply audit.';
    return;
  }
  const p = findPiece(state, state.selectedId);
  if (!p) {
    card.className = 'card empty';
    card.textContent = 'Select a unit to see its supply audit.';
    return;
  }
  const audit = comms.status.get(p.id);
  card.className = 'card';
  card.innerHTML = '';

  if (!audit) {
    card.textContent = 'No supply data.';
    return;
  }

  if (audit.status === 'in-communication') {
    const source = audit.sourceArsenal ? `Arsenal ${audit.sourceArsenal}` : 'Unknown source';
    const relays = audit.relayChain && audit.relayChain.length
      ? `Relay chain: ${audit.relayChain.join(' → ')}`
      : 'Direct line';
    const via = audit.via ? `Via adjacent unit ${audit.via}.` : '';
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: 'Status' }),
      createElement('span', { className: 'value in-comm', textContent: 'In communication' })
    ]));
    card.appendChild(createElement('div', { className: 'audit-detail', textContent: source }));
    card.appendChild(createElement('div', { className: 'audit-detail', textContent: relays }));
    if (via) card.appendChild(createElement('div', { className: 'audit-detail', textContent: via }));
  } else {
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: 'Status' }),
      createElement('span', { className: 'value isolated', textContent: 'Isolated' })
    ]));
    card.appendChild(createElement('div', { className: 'audit-detail', textContent: audit.reason || 'No route to an arsenal.' }));
    if (audit.cut) {
      card.appendChild(createElement('div', { className: 'audit-detail cut', textContent: `Cut at ${audit.cut}` }));
    }
  }
}

function renderMoveCount(card, state) {
  card.innerHTML = '';
  if (state.gameOver) {
    const result = state.gameOver.winner
      ? `${state.gameOver.winner} wins · ${state.gameOver.reason}`
      : `Draw · ${state.gameOver.reason}`;
    card.appendChild(createElement('div', { className: 'row' }, [
      createElement('span', { className: 'label', textContent: 'Game over' }),
      createElement('span', { className: 'value', textContent: result })
    ]));
    return;
  }
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Turn' }),
    createElement('span', { className: 'value', textContent: `${state.turnNumber} · ${state.turn}` })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Moves left' }),
    createElement('span', { className: 'value', textContent: isInRetreatPhase(state)
      ? 'retreat first'
      : (state.hasAttacked ? 'closed by attack' : String(movesRemaining(state))) })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Attack' }),
    createElement('span', { className: 'value', textContent: state.hasAttacked ? 'declared' : 'available' })
  ]));
  card.appendChild(createElement('div', { className: 'row' }, [
    createElement('span', { className: 'label', textContent: 'Preset' }),
    createElement('span', { className: 'value', textContent: presetLabel(state.preset) })
  ]));
}

function renderLog(card, state) {
  if (!state.log || state.log.length === 0) {
    card.className = 'card log-card empty';
    card.textContent = 'Move log empty.';
    return;
  }
  card.className = 'card log-card';
  card.innerHTML = '';
  for (const entry of state.log.slice(-12)) {
    const lines = [];
    if (entry.moves && entry.moves.length) {
      const moveText = entry.moves.map(m => `${CLASS_TO_CODE[m.cls]} ${m.from}-${m.to}`).join(', ');
      lines.push(`${entry.turn}.${entry.side === 'North' ? 'N' : 'S'}: ${moveText}`);
    }
    if (entry.attack) {
      if (entry.attack.type === 'arsenal-capture') {
        lines.push(`  capture ${entry.attack.coord}`);
      } else {
        lines.push(`  attack ${entry.attack.targetCoord} ${entry.attack.result} (${entry.attack.totalAttack} vs ${entry.attack.totalDefense})`);
      }
    }
    if (entry.events) {
      for (const ev of entry.events) {
        if (ev.type === 'destroyed') lines.push(`  destroyed ${ev.coord}`);
        if (ev.type === 'retreat-pending') lines.push(`  retreat pending ${ev.coord}`);
        if (ev.type === 'retreat') lines.push(`  retreated to ${ev.to}`);
        if (ev.type === 'retreat-failed') lines.push(`  retreat failed, destroyed`);
        if (ev.type === 'arsenal-captured') lines.push(`  arsenal captured ${ev.coord}`);
      }
    }
    if (lines.length === 0) lines.push(`${entry.turn}.${entry.side === 'North' ? 'N' : 'S'}: no action`);
    const block = createElement('div', { className: 'log-entry', textContent: lines.join('\n') });
    card.appendChild(block);
  }
}

function renderEngineCard(card, state, analysis, thinking) {
  const evaluation = evaluatePosition(state);
  const northShare = Math.max(5, Math.min(95,
    50 + Math.tanh(evaluation.score / 800) * 45));
  const signed = evaluation.score === 0
    ? '0.00'
    : `${evaluation.score > 0 ? '+' : '−'}${(Math.abs(evaluation.score) / 100).toFixed(2)}`;
  card.innerHTML = '';
  card.appendChild(createElement('div', { className: 'eval-labels' }, [
    createElement('span', { textContent: 'South' }),
    createElement('span', { className: 'eval-score', textContent: `${signed} N` }),
    createElement('span', { textContent: 'North' })
  ]));
  const track = createElement('div', {
    className: 'eval-track',
    role: 'meter',
    'aria-label': 'Position evaluation, positive favors North',
    'aria-valuemin': '-100000',
    'aria-valuemax': '100000',
    'aria-valuenow': String(evaluation.score)
  });
  const fill = createElement('div', { className: 'eval-fill' });
  fill.style.width = `${northShare}%`;
  track.appendChild(fill);
  card.appendChild(track);

  if (thinking) {
    card.appendChild(createElement('div', { className: 'engine-status', textContent: 'Searching…' }));
    return;
  }
  if (!analysis) {
    card.appendChild(createElement('div', {
      className: 'engine-status',
      textContent: `Ready · ${ENGINE_TIME_BUDGET_MS} ms work budget`
    }));
    return;
  }
  card.appendChild(createElement('div', { className: 'engine-stats' }, [
    createElement('span', { textContent: `depth ${analysis.depth}` }),
    createElement('span', { textContent: `${analysis.nodes} nodes` }),
    createElement('span', { textContent: `${Math.round(analysis.elapsedMs)} ms` })
  ]));
  card.appendChild(createElement('div', {
    className: 'engine-pv',
    textContent: analysis.pvText || 'No line.'
  }));
}

function readPreferences(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePreferences(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      pieceStyle: settings.pieceStyle,
      engineSide: settings.engineSide
    }));
  } catch {
    // file:// storage can be unavailable; the live selection still applies.
  }
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function resolveStorage(scope) {
  try {
    const storage = scope.localStorage;
    const probe = '__loa_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return { storage, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}

function phaseLabel(state) {
  if (state.gameOver) return 'game-over';
  if (isInRetreatPhase(state)) return 'retreat';
  return state.hasAttacked ? 'post-attack' : 'movement';
}

function compactAction(action, state) {
  if (!action) return null;
  if (action.type === 'move' || action.type === 'retreat') {
    const piece = findPiece(state, action.pieceId);
    return {
      kind: action.type,
      pieceId: action.pieceId,
      from: piece ? coordFromXY(piece.x, piece.y) : null,
      to: coordFromXY(action.x, action.y)
    };
  }
  if (action.type === 'attack') {
    const target = findPiece(state, action.targetId);
    return {
      kind: 'attack',
      targetId: action.targetId,
      to: target ? coordFromXY(target.x, target.y) : null
    };
  }
  if (action.type === 'arsenal') {
    return { kind: 'arsenal-capture', to: coordFromXY(action.x, action.y) };
  }
  return { kind: 'end-turn' };
}

function compactCombat(result) {
  if (!result) return null;
  return {
    attackerIds: (result.attackBreakdown || []).map(item => item.id),
    defenderId: result.targetId,
    supportingDefenderIds: (result.defenseBreakdown || []).slice(1).map(item => item.id),
    odds: `${result.totalAttack}:${result.totalDefense}`,
    attackStrength: result.totalAttack,
    defenseStrength: result.totalDefense,
    margin: result.margin,
    resultApplied: result.result
  };
}

function pieceLayoutKey(state) {
  return state.pieces.map(piece => `${piece.id}:${piece.x},${piece.y}`).sort().join('|');
}

function communicationStates(state, comms = computeCommunications(state)) {
  const result = new Map();
  for (const piece of state.pieces) result.set(piece.id, comms.status.get(piece.id)?.status || 'unknown');
  return result;
}

function init() {
  validateReleaseHooks();
  const root = document.getElementById('app');
  root.innerHTML = '';

  const {
    header,
    sandboxPill,
    turnPill,
    zoomOutBtn,
    zoomLevel,
    zoomInBtn,
    fitBtn,
    coverageBtn,
    helpBtn
  } = buildHeader();
  const boardWrap = createElement('div', { className: 'board-wrap' });
  root.appendChild(header);
  root.appendChild(boardWrap);

  let state = initTurnState(resetToTestPreset(createState()));
  const storageAccess = resolveStorage(window);
  const storage = storageAccess.storage;
  const preferences = readPreferences(storage);
  if (PIECE_STYLES.includes(preferences.pieceStyle)) state.settings.pieceStyle = preferences.pieceStyle;
  if (ENGINE_SIDES.includes(preferences.engineSide)) state.settings.engineSide = preferences.engineSide;
  const storageMode = storageAccess.persistent
    ? 'localStorage'
    : (window.location?.protocol === 'file:' ? 'file-memory-fallback' : 'memory-fallback');
  const debugLog = createDebugLog({
    version: APP_VERSION,
    buildStamp: BUILD_STAMP,
    userAgent: window.navigator?.userAgent || '',
    storageMode,
    storage: storageAccess.persistent ? storage : null,
    scope: window
  });
  debugLog.record('session-start', {
    version: APP_VERSION,
    buildStamp: BUILD_STAMP,
    userAgent: window.navigator?.userAgent || '',
    storageMode,
    variant: state.rulesetId,
    scenario: state.preset,
    pieceStyle: state.settings.pieceStyle,
    opponent: state.settings.engineSide
  });
  const audio = new AudioEngine();
  let walkthrough = null;
  let engineAnalysis = null;
  let engineThinking = false;
  let engineTimer = null;
  let supplyCoverageMode = 'off';
  let derivedState = null;
  let derivedComms = null;
  let observedState = state;
  let observedLayout = pieceLayoutKey(state);
  let observedComms;

  function communicationsFor(current) {
    if (derivedState !== current) {
      derivedState = current;
      derivedComms = computeCommunications(current);
    }
    return derivedComms;
  }

  try {
    observedComms = communicationStates(state, communicationsFor(state));
  } catch (error) {
    observedComms = new Map();
    debugLog.recordError(error, { seam: 'communication-observer', phase: 'initial' });
  }

  function observeStateChange(next, comms) {
    try {
      const fromPhase = phaseLabel(observedState);
      const toPhase = phaseLabel(next);
      if (observedState.turn !== next.turn || observedState.turnNumber !== next.turnNumber
          || fromPhase !== toPhase) {
        debugLog.record('transition', {
          from: { turn: observedState.turn, number: observedState.turnNumber, phase: fromPhase },
          to: { turn: next.turn, number: next.turnNumber, phase: toPhase }
        });
      }
      if (!observedState.gameOver && next.gameOver) {
        debugLog.record('victory', {
          winner: next.gameOver.winner,
          reason: next.gameOver.reason
        });
      }
      const nextLayout = pieceLayoutKey(next);
      if (nextLayout !== observedLayout) {
        const nextComms = communicationStates(next, comms);
        for (const piece of next.pieces) {
          const before = observedComms.get(piece.id);
          const after = nextComms.get(piece.id);
          if (before === after || !before) continue;
          if (after === 'isolated' || before === 'isolated') {
            debugLog.record('communication', {
              pieceId: piece.id,
              change: after === 'isolated' ? 'entered-isolation' : 'left-isolation'
            });
          }
        }
        observedLayout = nextLayout;
        observedComms = nextComms;
      }
      observedState = next;
    } catch (error) {
      debugLog.recordError(error, { seam: 'communication-observer', phase: 'update' });
      observedState = next;
    }
  }

  function commit() {
    const comms = communicationsFor(state);
    observeStateChange(state, comms);
    sandboxPill.style.display = state.sandbox ? 'inline-block' : 'none';
    turnPill.textContent = state.gameOver
      ? (state.gameOver.winner ? `${state.gameOver.winner} wins` : 'Draw')
      : `${state.turnNumber} · ${state.turn} to move`;
    const coverageLabel = supplyCoverageMode === 'my'
      ? 'Mine'
      : (supplyCoverageMode === 'enemy' ? 'Enemy' : 'Off');
    coverageBtn.textContent = `Supply: ${coverageLabel}`;
    coverageBtn.dataset.mode = supplyCoverageMode;
    coverageBtn.setAttribute('aria-label', `Supply coverage: ${coverageLabel}. Press C to cycle.`);
    boardApi.update(state, comms, { supplyCoverageMode });
    renderSelectedCard(selectedCard, state, comms);
    renderCombatCard(combatCard, state);
    renderAuditCard(auditCard, state, comms);
    renderMoveCount(moveCount, state);
    renderLog(logCard, state);
    renderEngineCard(engineCard, state, engineAnalysis, engineThinking);
    controls.hintBtn.disabled = isEngineTurn() || engineThinking || Boolean(state.gameOver);
    controls.concedeBtn.disabled = isEngineTurn() || Boolean(state.gameOver);
    controls.drawBtn.disabled = state.settings.engineSide !== 'None' || Boolean(state.gameOver);
    controls.engineSelect.querySelector('select').value = state.settings.engineSide;
    controls.pieceStyleSelect.querySelector('select').value = state.settings.pieceStyle;
    scheduleEngine();
  }

  function isEngineTurn() {
    return !state.sandbox && !state.gameOver && state.settings.engineSide === state.turn;
  }

  function scheduleEngine() {
    if (!isEngineTurn() || engineThinking || engineTimer !== null) return;
    engineThinking = true;
    renderEngineCard(engineCard, state, engineAnalysis, true);
    const expectedKey = positionKey(state);
    engineTimer = setTimeout(() => {
      // try/finally: a throw anywhere in here must never strand engineThinking,
      // or the engine goes permanently silent with no visible error (file://).
      try {
        engineTimer = null;
        if (!isEngineTurn() || positionKey(state) !== expectedKey) {
          return;
        }
        const searchState = state;
        const result = debugLog.guard('engine-entry', { purpose: 'turn', side: state.turn },
          () => searchBestAction(state, {
            seed: ENGINE_SEED,
            timeBudgetMs: ENGINE_TIME_BUDGET_MS,
            turnAware: true,
            maxActionsPerTurn: Infinity,
            searchTurnMoveLimit: 1
          }));
        debugLog.record('engine-turn', {
          purpose: 'turn',
          side: searchState.turn,
          turn: searchState.turnNumber,
          depth: result.depth,
          nodes: result.nodes,
          elapsedMs: Math.round(result.elapsedMs),
          score: result.score,
          chosenMove: compactAction(result.action, searchState)
        });
        if (!isEngineTurn() || positionKey(state) !== expectedKey || !result.action) {
          return;
        }
        result.pvText = formatPrincipalVariation(state, result.pv);
        engineAnalysis = result;
        const actionType = result.action.type;
        state = clearSelection(debugLog.guard('turn-resolution', {
          kind: actionType,
          source: 'engine'
        }, () => applyAction(state, result.action, {
          recordHistory: true,
          onCombat(combat) {
            debugLog.record('combat', compactCombat(combat));
          }
        })));
        if (actionType === 'move' || actionType === 'retreat') audio.playMove();
        if (actionType === 'attack' || actionType === 'arsenal') audio.playCapture();
      } finally {
        engineThinking = false;
        commit();
      }
    }, 60);
  }

  const api = {
    reset() {
      state = initTurnState(resetToTestPreset(state));
      debugLog.record('restart', { scenario: state.preset, source: 'scenario-control' });
      setSessionStatus('Opening loaded.');
      commit();
    },
    resetCommsDrill() {
      state = initTurnState(resetToCommsDrill(state));
      debugLog.record('restart', { scenario: state.preset, source: 'scenario-control' });
      setSessionStatus('Comms Audit loaded.');
      commit();
    },
    resetCommCut() {
      state = initTurnState(resetToCommCut(state));
      debugLog.record('restart', { scenario: state.preset, source: 'scenario-control' });
      setSessionStatus('Cut Demo loaded.');
      commit();
    },
    saveToFile() {
      const blob = new Blob([serializeState(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loa-v1-${presetLabel(state.preset)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      debugLog.record('save', { kind: 'file', scenario: state.preset, outcome: 'prepared' });
      setSessionStatus('Save file prepared.');
    },
    loadFromFile(file) {
      if (!file) return Promise.resolve({ ok: false, reason: 'no-file' });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            state = parseState(e.target.result);
            syncSettingsFromState();
            debugLog.record('load', { kind: 'file', scenario: state.preset, outcome: 'loaded' });
            setSessionStatus('Save file loaded.');
            commit();
            resolve({ ok: true });
          } catch (err) {
            debugLog.recordError(err, { seam: 'load-file' });
            debugLog.record('load', { kind: 'file', outcome: 'failed' });
            setSessionStatus(`Load failed: ${err.message}`);
            resolve({ ok: false, error: err });
          }
        };
        reader.onerror = () => {
          const error = reader.error || new Error('File read failed');
          debugLog.recordError(error, { seam: 'load-file-read' });
          debugLog.record('load', { kind: 'file', outcome: 'failed' });
          setSessionStatus('Load failed: file could not be read.');
          resolve({ ok: false, error });
        };
        reader.readAsText(file);
      });
    },
    saveLocal() {
      try {
        storage.setItem(SAVE_KEY, serializeState(state));
        debugLog.record('save', {
          kind: 'local',
          storageMode,
          scenario: state.preset,
          outcome: 'stored'
        });
        setSessionStatus(storageAccess.persistent
          ? 'Local save stored.'
          : 'Save held until this page closes.');
      } catch (error) {
        debugLog.recordError(error, { seam: 'save-local' });
        debugLog.record('save', { kind: 'local', storageMode, outcome: 'failed' });
        setSessionStatus('Local storage is unavailable.');
      }
    },
    loadLocal() {
      try {
        const raw = storage.getItem(SAVE_KEY);
        if (!raw) {
          debugLog.record('load', { kind: 'local', storageMode, outcome: 'missing' });
          setSessionStatus('No local save found.');
          return;
        }
        state = parseState(raw);
        syncSettingsFromState();
        debugLog.record('load', {
          kind: 'local',
          storageMode,
          scenario: state.preset,
          outcome: 'loaded'
        });
        setSessionStatus('Local save recalled.');
        commit();
      } catch (err) {
        debugLog.recordError(err, { seam: 'load-local' });
        debugLog.record('load', { kind: 'local', storageMode, outcome: 'failed' });
        setSessionStatus(`Recall failed: ${err.message}`);
      }
    },
    setSandbox(value) {
      state = { ...state, sandbox: value };
      commit();
    },
    setShowAllComms(value) {
      state = { ...state, showAllComms: value };
      commit();
    },
    cycleSupplyCoverage() {
      supplyCoverageMode = nextSupplyCoverageMode(supplyCoverageMode);
      setSessionStatus(supplyCoverageMode === 'off'
        ? 'Supply coverage hidden.'
        : `${supplyCoverageMode === 'my' ? 'My' : 'Enemy'} supply coverage shown.`);
      commit();
    },
    endTurn() {
      if (state.gameOver || isEngineTurn()) return;
      state = debugLog.guard('turn-resolution', { kind: 'end-turn', source: 'player' },
        () => endTurn(state));
      commit();
    },
    undo() {
      const before = state;
      state = debugLog.guard('turn-resolution', { kind: 'undo', source: 'player' },
        () => undo(state));
      debugLog.record('undo', { applied: state !== before });
      commit();
    },
    restart() {
      state = debugLog.guard('turn-resolution', { kind: 'restart', source: 'player' },
        () => restart(state, 'North'));
      debugLog.record('restart', { scenario: state.preset, source: 'restart-control' });
      commit();
    },
    concede() {
      if (state.gameOver || isEngineTurn()) return;
      const side = state.turn;
      state = concede(state, side);
      debugLog.record('concede', { side, winner: state.gameOver.winner });
      setSessionStatus(`${side} conceded.`);
      commit();
    },
    agreeDraw() {
      if (state.gameOver || state.settings.engineSide !== 'None') return;
      state = agreeDraw(state);
      debugLog.record('draw', { reason: state.gameOver.reason });
      setSessionStatus('Draw agreed.');
      commit();
    },
    startWalkthrough() {
      if (walkthrough) walkthrough.start(true);
    },
    setEngineSide(value) {
      if (!ENGINE_SIDES.includes(value)) return;
      state = { ...state, settings: { ...state.settings, engineSide: value } };
      debugLog.record('session-selection', { name: 'opponent', value });
      engineAnalysis = null;
      writePreferences(storage, state.settings);
      commit();
    },
    setPieceStyle(value) {
      if (!PIECE_STYLES.includes(value)) return;
      state = { ...state, settings: { ...state.settings, pieceStyle: value } };
      debugLog.record('session-selection', { name: 'piece-style', value });
      writePreferences(storage, state.settings);
      commit();
    },
    hint() {
      if (engineThinking || isEngineTurn() || state.gameOver) return;
      engineThinking = true;
      renderEngineCard(engineCard, state, engineAnalysis, true);
      const expectedKey = positionKey(state);
      setTimeout(() => {
        // try/finally mirrors scheduleEngine: engineThinking must never strand.
        try {
          const searchState = state;
          const result = debugLog.guard('engine-entry', { purpose: 'hint', side: state.turn },
            () => searchBestAction(state, {
              seed: ENGINE_SEED,
              timeBudgetMs: HINT_TIME_BUDGET_MS,
              turnAware: true,
              maxActionsPerTurn: Infinity,
              searchTurnMoveLimit: 1
            }));
          debugLog.record('engine-turn', {
            purpose: 'hint',
            side: searchState.turn,
            turn: searchState.turnNumber,
            depth: result.depth,
            nodes: result.nodes,
            elapsedMs: Math.round(result.elapsedMs),
            score: result.score,
            chosenMove: compactAction(result.action, searchState)
          });
          if (positionKey(state) === expectedKey && result.action) {
            result.pvText = formatPrincipalVariation(state, result.pv);
            engineAnalysis = result;
          }
        } finally {
          engineThinking = false;
          commit();
        }
      }, 30);
    },
    async copyDebugLog() {
      const outcome = await copyOrDownloadDebugLog(debugLog, window);
      if (outcome === 'copied') setSessionStatus('Debug log copied.');
      else if (outcome === 'downloaded') setSessionStatus('Debug log downloaded.');
      else setSessionStatus('Debug log is unavailable.');
    }
  };

  const boardApi = makeBoard(boardWrap);
  zoomOutBtn.addEventListener('click', () => boardApi.setZoom(boardApi.getZoom() - 0.25));
  zoomInBtn.addEventListener('click', () => boardApi.setZoom(boardApi.getZoom() + 0.25));
  fitBtn.addEventListener('click', () => boardApi.fit());
  coverageBtn.addEventListener('click', () => api.cycleSupplyCoverage());
  boardApi.onZoomChange((zoom) => {
    zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutBtn.disabled = zoom <= 1;
    zoomInBtn.disabled = zoom >= 2.5;
  });
  const { panel, selectedCard, combatCard, moveCount, auditCard, logCard, engineCard, sessionStatus, controls } = buildPanel(api, audio, () => state);
  root.appendChild(panel);
  const help = makeHelp();
  helpBtn.addEventListener('click', () => {
    debugLog.record('help-open', {});
    help.open();
  });
  document.addEventListener('keydown', (evt) => {
    if (evt.defaultPrevented || evt.repeat || evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (evt.key.toLowerCase() !== 'c' || help.dialog.open) return;
    if (evt.target instanceof Element
        && evt.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    evt.preventDefault();
    api.cycleSupplyCoverage();
  });

  function setSessionStatus(message) {
    sessionStatus.textContent = message;
  }

  function syncSettingsFromState() {
    audio.setSfx(state.settings.sfx);
    audio.toggleMusic(state.settings.music);
    audio.setReducedEffects(state.settings.reducedEffects);
    controls.sandboxToggle.querySelector('input').checked = state.sandbox;
    controls.commsToggle.querySelector('input').checked = state.showAllComms;
    controls.sfxToggle.querySelector('input').checked = state.settings.sfx;
    controls.musicToggle.querySelector('input').checked = state.settings.music;
    controls.reducedToggle.querySelector('input').checked = state.settings.reducedEffects;
    controls.engineSelect.querySelector('select').value = ENGINE_SIDES.includes(state.settings.engineSide)
      ? state.settings.engineSide : 'None';
    controls.pieceStyleSelect.querySelector('select').value = PIECE_STYLES.includes(state.settings.pieceStyle)
      ? state.settings.pieceStyle : 'default';
    controls.hintBtn.disabled = isEngineTurn() || engineThinking || Boolean(state.gameOver);
    controls.concedeBtn.disabled = isEngineTurn() || Boolean(state.gameOver);
    controls.drawBtn.disabled = state.settings.engineSide !== 'None' || Boolean(state.gameOver);
  }

  // Combat preview: when the selected friendly unit changes or an enemy is hovered,
  // compute and store a preview for the first attackable enemy under the cursor.
  // The actual attack is committed by clicking the enemy unit (handled in input.js).
  boardApi.svg.addEventListener('pointermove', (evt) => {
    if (state.gameOver || state.hasAttacked || isInRetreatPhase(state) || !state.selectedId) return;
    const target = evt.target.closest('[data-coord]');
    if (!target) {
      if (state.combatPreview) {
        state = { ...state, combatPreview: null };
        commit();
      }
      return;
    }
    const coord = target.getAttribute('data-coord');
    const sq = xyFromCoord(coord);
    if (!sq) return;
    const enemy = state.pieces.find(p => p.x === sq.x && p.y === sq.y && p.side !== state.turn);
    if (!enemy) {
      if (state.combatPreview) {
        state = { ...state, combatPreview: null };
        commit();
      }
      return;
    }
    const preview = computeCombatPreview(state, enemy.id);
    if (!preview || preview.error) {
      if (state.combatPreview) {
        state = { ...state, combatPreview: null };
        commit();
      }
      return;
    }
    state = { ...state, combatPreview: preview };
    commit();
  });

  const input = makeInputHandlers(boardApi, () => state, (next) => {
    state = next;
    commit();
  }, audio, {
    guard: debugLog.guard,
    order(data) {
      debugLog.record('player-order', data);
    },
    combat(result) {
      debugLog.record('combat', compactCombat(result));
    }
  });

  function selectWalkthroughPiece(predicate) {
    const piece = state.pieces.find(predicate);
    if (!piece || state.selectedId === piece.id) return piece;
    state = selectPiece(state, piece.id);
    commit();
    return piece;
  }

  walkthrough = makeWalkthrough({
    storage,
    onStep(step, index) {
      debugLog.record('walkthrough-step', { id: step.id, number: index + 1 });
    },
    onEnter(step) {
      if (step.id === 'pieces') {
        selectWalkthroughPiece(p => p.side === state.turn && isFighter(p.cls));
      } else if (step.id === 'communication') {
        selectWalkthroughPiece(p => p.side === state.turn && isRelay(p.cls));
      } else if (state.selectedId) {
        state = clearSelection(state);
        commit();
      }
    },
    resolveAnchor(step) {
      if (step.id === 'pieces') {
        const piece = state.pieces.find(p => p.side === state.turn && isFighter(p.cls));
        return piece ? boardApi.svg.querySelector(`[data-id="${piece.id}"]`) : boardApi.svg;
      }
      if (step.id === 'communication') {
        const relay = state.pieces.find(p => p.side === state.turn && isRelay(p.cls));
        return relay ? boardApi.svg.querySelector(`[data-id="${relay.id}"]`) : boardApi.svg;
      }
      if (step.id === 'turn') return document.querySelector('[data-walkthrough-target="turn"]');
      if (step.id === 'victory') {
        const enemySide = state.turn === 'North' ? 'South' : 'North';
        const arsenal = activeArsenalsForSide(enemySide)[0];
        const coord = coordFromXY(arsenal.x, arsenal.y);
        return boardApi.svg.querySelector(`[data-coord="${coord}"]`);
      }
      return boardApi.svg;
    },
    onExit() {
      if (!state.selectedId) return;
      state = clearSelection(state);
      commit();
    }
  });

  syncSettingsFromState();
  commit();
  walkthrough.start();
}

export {
  init,
  readPreferences,
  writePreferences,
  resolveStorage,
  renderSelectedCard,
  renderLog,
  PIECE_STYLES,
  ENGINE_SIDES
};
