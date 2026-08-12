// SHOELEATHER — staged confrontation data for the true ending scene.
// Uses full evidence prose and display names only; the visible runner is the same
// PrologueRunner beat engine used by the opening, so pacing stays one architecture.

function personName(caseData, id) {
  const person = caseData.suspect(id);
  if (!person) throw new Error(`ending participant "${id}" has no display name`);
  return person.name;
}

function factText(caseData, id) {
  const fact = caseData.fact(id);
  if (!fact) throw new Error(`ending fact "${id}" does not exist`);
  return fact.prose || fact.claim.key();
}

export function buildEndingScene(caseData, chain, variant = 'staged') {
  const accused = personName(caseData, chain.suspect);
  const victim = personName(caseData, chain.victim);
  const witnesses = caseData.endingWitnesses.map((id) => ({ id, name: personName(caseData, id) }));
  const statement = caseData.statement(chain.contradictedStatement);
  if (!statement) throw new Error(`ending statement "${chain.contradictedStatement}" does not exist`);

  const beats = [
    { id: 'room', action: 'Begin the confrontation', speaker: 'The lieutenant',
      prose: `${accused} faces the table. ${witnesses.map((w) => w.name).join(' and ')} ${witnesses.length === 1 ? 'waits' : 'wait'}.`, reaction: 'No one sits.' },
    { id: 'charge', action: 'Name the act', speaker: 'The lieutenant',
      prose: `${accused} killed ${victim}. ${factText(caseData, chain.means)}`, reaction: `${accused} keeps still.` },
    { id: 'coordinates', action: 'Fix the time and place', speaker: 'The lieutenant',
      prose: `${factText(caseData, chain.time)} ${factText(caseData, chain.place)}`, reaction: 'A witness looks toward the accused.' },
    { id: 'mechanism', action: 'Take apart the alibi', speaker: 'The lieutenant',
      prose: `The alibi was built this way: ${factText(caseData, chain.alibiMechanism)}`, reaction: `${accused} watches the evidence, not the room.` },
    { id: 'statement', action: 'Repeat the claim', speaker: accused,
      prose: statement.text, reaction: 'The words sound smaller the second time.' },
    { id: 'key', action: 'Turn the remembered fact', speaker: 'The lieutenant',
      prose: factText(caseData, chain.prologueFact), reaction: `${accused}'s posture changes.` },
    { id: 'corroboration', action: 'Call the corroboration', speaker: witnesses[0]?.name || 'The lieutenant',
      prose: factText(caseData, chain.corroboration), reaction: 'The account holds.' },
    { id: 'physical', action: 'Set down the physical contradiction', speaker: 'The lieutenant',
      prose: factText(caseData, chain.physicalContradiction), reaction: `${accused}'s hands give first.` },
    { id: 'break', action: variant === 'trap' ? 'Let the demonstration land' : 'Let the silence work', speaker: accused,
      prose: variant === 'trap' ? 'The demonstration leaves no second version of the hour.' : 'The composure goes. First the hands. Then the face.', reaction: 'The room has its answer.' },
    { id: 'closed', action: 'CASE CLOSED', speaker: '', prose: '', reaction: '', card: 'CASE CLOSED' },
  ];
  return {
    accused: { id: chain.suspect, name: accused },
    victim: { id: chain.victim, name: victim },
    witnesses,
    beats,
  };
}
