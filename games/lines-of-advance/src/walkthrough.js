// walkthrough.js: quiet first-launch guidance anchored to the live board.

const WALKTHROUGH_KEY = 'loa-walkthrough-v1';

const WALKTHROUGH_STEPS = Object.freeze([
  Object.freeze({
    id: 'pieces',
    label: 'Pieces',
    text: 'I, C, A, and R mark infantry, cavalry, artillery, and relays. Select a piece to inspect its values.'
  }),
  Object.freeze({
    id: 'communication',
    label: 'Communication',
    text: 'Supply is lines, not neighbors: arsenals radiate straight lines, relays re-aim them, and a fighter is connected when it stands on a line or chains to one through adjacent friendly fighters. A red slash marks an isolated fighter: it cannot move or fight, and enemies may destroy it at will.'
  }),
  Object.freeze({
    id: 'coverage',
    label: 'Coverage',
    text: 'The rules allow a move into isolation, so check before you commit: the Supply button (or C) tints every covered square. If a destination is untinted, the unit will arrive cut off.'
  }),
  Object.freeze({
    id: 'turn',
    label: 'Turn',
    text: 'Move up to five pieces, then make up to one attack. End Turn hands play to the other side. Pick your opponent in Session: Hotseat passes the turn to a second player, Engine hands it to the machine.'
  }),
  Object.freeze({
    id: 'victory',
    label: 'Victory',
    text: 'Win by removing every enemy fighting unit or occupying both enemy arsenals.'
  })
]);

function shouldAutoStart(storage) {
  try {
    return storage.getItem(WALKTHROUGH_KEY) === null;
  } catch {
    return true;
  }
}

function rememberWalkthrough(storage, outcome) {
  try {
    storage.setItem(WALKTHROUGH_KEY, outcome);
  } catch {
    // file:// privacy settings may deny persistence; the walkthrough still works.
  }
}

function makeButton(label, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function makeWalkthrough({ storage, resolveAnchor, onEnter, onExit, onStep }) {
  let card = null;
  let anchor = null;
  let index = 0;

  function clearAnchor() {
    if (anchor) anchor.classList.remove('walkthrough-anchor');
    anchor = null;
  }

  function close(outcome) {
    if (!card) return;
    rememberWalkthrough(storage, outcome);
    clearAnchor();
    card.remove();
    card = null;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', positionCard, true);
    window.removeEventListener('resize', positionCard);
    if (onExit) onExit();
  }

  function positionCard() {
    if (!card || !anchor) return;
    const target = anchor.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const gap = 12;
    const edge = 12;
    let left = target.left + target.width / 2 - box.width / 2;
    left = Math.max(edge, Math.min(window.innerWidth - box.width - edge, left));
    let top = target.bottom + gap;
    if (top + box.height > window.innerHeight - edge) top = target.top - box.height - gap;
    top = Math.max(edge, Math.min(window.innerHeight - box.height - edge, top));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function showStep(nextIndex) {
    index = Math.max(0, Math.min(WALKTHROUGH_STEPS.length - 1, nextIndex));
    const step = WALKTHROUGH_STEPS[index];
    clearAnchor();
    if (onEnter) onEnter(step);
    if (onStep) onStep(step, index);

    card.innerHTML = '';
    const meta = document.createElement('div');
    meta.className = 'walkthrough-meta';
    meta.textContent = `${index + 1} / ${WALKTHROUGH_STEPS.length} · ${step.label}`;
    const copy = document.createElement('p');
    copy.textContent = step.text;
    const actions = document.createElement('div');
    actions.className = 'walkthrough-actions';
    const skip = makeButton('Skip', 'walkthrough-skip');
    skip.addEventListener('click', () => close('skipped'));
    actions.appendChild(skip);
    if (index > 0) {
      const back = makeButton('Back');
      back.addEventListener('click', () => showStep(index - 1));
      actions.appendChild(back);
    }
    const next = makeButton(index === WALKTHROUGH_STEPS.length - 1 ? 'Done' : 'Next', 'primary');
    next.addEventListener('click', () => {
      if (index === WALKTHROUGH_STEPS.length - 1) close('completed');
      else showStep(index + 1);
    });
    actions.appendChild(next);
    card.append(meta, copy, actions);

    requestAnimationFrame(() => {
      if (!card) return;
      anchor = resolveAnchor(step);
      if (anchor) anchor.classList.add('walkthrough-anchor');
      positionCard();
    });
  }

  function onKeyDown(evt) {
    if (evt.key === 'Escape') close('skipped');
  }

  function start(force = false) {
    if (card || (!force && !shouldAutoStart(storage))) return false;
    card = document.createElement('section');
    card.className = 'walkthrough-card';
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(card);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', positionCard, true);
    window.addEventListener('resize', positionCard);
    showStep(0);
    return true;
  }

  return { start, close };
}

export {
  WALKTHROUGH_KEY,
  WALKTHROUGH_STEPS,
  shouldAutoStart,
  rememberWalkthrough,
  makeWalkthrough
};
