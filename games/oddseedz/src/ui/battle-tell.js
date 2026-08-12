const TELL_CLASSES = new Set(['tell-clear', 'tell-shaded', 'tell-oblique']);

export function battleTellView(intent, over) {
  if (over || !intent?.tell) {
    return { hidden: true, className: 'battle-tell', text: '' };
  }
  const presentationClass = TELL_CLASSES.has(intent.tell.presentationClass)
    ? intent.tell.presentationClass
    : 'tell-clear';
  return {
    hidden: false,
    className: `battle-tell ${presentationClass}`,
    text: intent.tell.text || '',
  };
}
