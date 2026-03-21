/**
 * AI Audio Studio — Pro Tools session management commands.
 */

/**
 * Save a timestamped copy of the current session to the specified directory.
 *
 * @param {{ targetDir?: string, label?: string }} params
 */
async function saveSessionCopy({ targetDir, label } = {}) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = (label || 'session').replace(/[^a-zA-Z0-9_-]/g, '_');
  const copyName = `${safeName}_${stamp}`;
  const dir = targetDir || (await sf.app.proTools.getSessionFolder());
  await sf.app.proTools.saveSessionCopy({ folder: dir, name: copyName });
  sf.ui.show(`Session copy saved: ${copyName}`);
  return copyName;
}

/**
 * Undo the last Pro Tools operation.
 */
async function undo() {
  await sf.app.proTools.undo();
  sf.ui.show('Undo applied');
}

/**
 * Save the current session.
 */
async function saveSession() {
  await sf.app.proTools.save();
  sf.ui.show('Session saved');
}
