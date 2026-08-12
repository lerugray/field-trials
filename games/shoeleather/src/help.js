// SHOELEATHER — the controls/help content (M7 onboarding; genre table stakes).
//
// A brutally difficult game still owes the player CLARITY about its verbs and loop
// (the difficulty is the DEDUCTION, never the interface). This is the help text as
// data, so it is testable and rendered on the crisp text layer. Exhaustion Floor
// register: clipped, plain, no em dashes.

export const HELP = [
  { title: 'Looking around', lines: [
    'Move the mouse over the scene. The cursor and the label name the verb.',
    'Or use the keyboard: arrows or Tab cycle the hotspots, Enter or Space selects.',
    'No pixel-hunting. A systematic sweep finds everything. The hard part is what it MEANS.',
  ] },
  { title: 'The notebook (n)', lines: [
    'Everything you observe is logged here. Statements are logged word for word.',
    'Pin what matters using Pin (space). Group it, cross-reference it, search and filter by person or type.',
    'Case review lists only KNOWN FACTS. Nothing tells you what is important.',
  ] },
  { title: 'Interrogations', lines: [
    'Talk to a suspect to hear them out. Press a number to choose a line.',
    'Press c to challenge: pair one of their statements with a piece of your evidence.',
    'A wrong challenge hardens them and the killer covers a track. Read the portrait, not a number.',
  ] },
  { title: 'The accusation (Accuse)', lines: [
    'Open it when you can prove it. Fill every slot from your PINNED notes.',
    'A wrong accusation is turned away with one flat line, and the killer moves again.',
    'No attempt limit, no sense of how close you were. Only the exact chain closes the case.',
  ] },
  { title: 'Anytime', lines: [
    'Nothing is timed, ever. Save, Load, and Restart Case are always here.',
    'Options sets text size, a dyslexia-friendly font, reduced motion, and photosensitivity safety.',
  ] },
];

// The single-line control hint shown along the bottom of the world.
export const CONTROL_HINT = 'arrows/tab cycle   enter select   n notebook   ? help';
