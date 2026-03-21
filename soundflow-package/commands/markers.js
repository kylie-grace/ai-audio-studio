/**
 * AI Audio Studio — Pro Tools marker / memory location commands.
 */

/**
 * Add a memory location at the current playhead position.
 *
 * @param {{ name: string, comment?: string }} params
 */
async function addMemoryLocation({ name, comment }) {
  await sf.app.proTools.addMemoryLocation({
    name: name,
    comment: comment || '',
    locationType: 'marker',
  });
  sf.ui.show(`Added memory location: "${name}"`);
}

/**
 * Add a selection region as a memory location.
 *
 * @param {{ name: string, start: number, end: number, comment?: string }} params
 */
async function addRegion({ name, start, end, comment }) {
  await sf.app.proTools.addMemoryLocation({
    name: name,
    comment: comment || '',
    locationType: 'selection',
    selectionStart: start,
    selectionEnd: end,
  });
  sf.ui.show(`Added region marker: "${name}"`);
}
