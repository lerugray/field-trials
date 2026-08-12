// Original, concise help for the v1 player surface.

const HELP_SECTIONS = Object.freeze([
  Object.freeze({
    title: 'Objective',
    body: 'Win by removing every enemy fighting unit or by occupying both enemy arsenals. Repeated or stalled games are drawn.',
    citation: 'Victory and draw rules, rows 75 to 79'
  }),
  Object.freeze({
    title: 'Ending a game',
    body: 'Threefold repetition and 80 completed side turns without destruction, forced retreat, or a newly captured arsenal end automatically as draws. In hotseat, use Agree Draw after both players agree. The side to move may Concede.',
    citation: 'Agreed draws use row 79; repetition and no-progress are explicit app adjudications'
  }),
  Object.freeze({
    title: 'Turn',
    body: 'Move up to five different units. You may then declare one attack. An attack closes movement for the turn. Resolve a pending retreat first.',
    citation: 'Rules ledger rows 31 to 35 and 43 to 46'
  }),
  Object.freeze({
    title: 'Movement',
    body: 'Select a unit to show legal destinations. Fighters need supply. Mountains block movement. A moving unit cannot pass through an occupied square.',
    citation: 'Rules ledger rows 23 to 30 and 63'
  }),
  Object.freeze({
    title: 'Supply',
    body: 'Blue lines trace supply from an arsenal, through relays, or through an adjacent supplied fighter. Enemy fighters can cut a line. A red slash marks an isolated fighter.',
    citation: 'Rules ledger rows 55 to 64 and 72 to 74'
  }),
  Object.freeze({
    title: 'Supply coverage',
    body: 'Use Supply beside the view controls, or press C, to cycle through no tint, my coverage, and enemy coverage. Teal marks squares reached by my arsenal and relay lines; amber marks the enemy lines. A selected unit route remains visible above the tint.',
    citation: 'Rules ledger rows 57 to 61'
  }),
  Object.freeze({
    title: 'Combat',
    body: 'Select a friendly unit, then point to an enemy in range. The inspection card shows every contributing value before you commit. Combat is deterministic.',
    citation: 'Rules ledger rows 36 to 54'
  }),
  Object.freeze({
    title: 'Board marks',
    body: 'Dots show legal moves. Rings show attack targets. Diamonds are arsenals. Outlined squares are forts. Gray peaks are mountains. Small gray diamonds are passes.',
    citation: 'Rules ledger rows 8 to 12'
  }),
  Object.freeze({
    title: 'Engine and hints',
    body: 'The shallow game-specific engine searches legal actions with alpha-beta search. Depth counts completed side turns. To fit the displayed work budget, each searched turn considers one further move before the reply; live turns still allow all five moves. Nodes, elapsed time, and the principal line are shown.',
    citation: 'Not presented as a top-tier chess engine'
  }),
  Object.freeze({
    title: 'Sessions and saves',
    body: 'Choose hotseat or assign the engine to one side. Opening uses a fixed convenience deployment with North first. Comms Audit and Cut Demo are teaching positions. Save File downloads JSON. Store Local keeps one save in this browser profile.',
    citation: 'Save format v4; older v2 and v3 saves remain readable'
  }),
  Object.freeze({
    title: 'Display and controls',
    body: 'Click or drag to move. Arrow keys move a selected unit one square when legal. Manual mode pauses the selected engine but keeps normal turn legality. Fit restores the full-board view. Wheel or pinch zooms. Piece styles change marks only.',
    citation: 'Supported down to 720 CSS pixels wide'
  })
]);

function makeHelp() {
  const dialog = document.createElement('dialog');
  dialog.className = 'help-dialog';
  dialog.setAttribute('aria-labelledby', 'help-title');

  const shell = document.createElement('div');
  shell.className = 'help-shell';
  const header = document.createElement('header');
  header.className = 'help-header';
  const heading = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'help-eyebrow';
  eyebrow.textContent = 'Rules and controls';
  const title = document.createElement('h2');
  title.id = 'help-title';
  title.textContent = 'Help';
  heading.append(eyebrow, title);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'help-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => close());
  header.append(heading, closeButton);

  const grid = document.createElement('div');
  grid.className = 'help-grid';
  for (const section of HELP_SECTIONS) {
    const item = document.createElement('section');
    item.className = 'help-section';
    const itemTitle = document.createElement('h3');
    itemTitle.textContent = section.title;
    const body = document.createElement('p');
    body.textContent = section.body;
    const citation = document.createElement('p');
    citation.className = 'help-citation';
    citation.textContent = section.citation;
    item.append(itemTitle, body, citation);
    grid.appendChild(item);
  }

  const footer = document.createElement('footer');
  footer.className = 'help-footer';
  footer.textContent = 'The relevant rule references are inlined above. Interface wording and graphics are original to Lines of Advance.';
  shell.append(header, grid, footer);
  dialog.appendChild(shell);
  document.body.appendChild(dialog);

  function open() {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    closeButton.focus();
  }

  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  return { dialog, open, close };
}

export { HELP_SECTIONS, makeHelp };
