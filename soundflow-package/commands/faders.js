/**
 * AI Audio Studio — Pro Tools fader, pan, and mute commands.
 *
 * SoundFlow exposes the Pro Tools track object via `sf.app.proTools`.
 * All functions are async and throw on failure so the caller can decide
 * whether to abort or continue the revision script.
 */

/**
 * Find a Pro Tools track by name.  Tries exact match first, then
 * case-insensitive, then prefix match.  Throws if not found.
 *
 * @param {string} trackName
 * @returns {Promise<object>} SoundFlow track object
 */
async function findTrack(trackName) {
  const tracks = await sf.app.proTools.getTracks();
  const lower = trackName.toLowerCase();

  // Exact match
  let track = tracks.find(t => t.name === trackName);
  if (track) return track;

  // Case-insensitive
  track = tracks.find(t => t.name.toLowerCase() === lower);
  if (track) return track;

  // Prefix match (e.g. "Kick" matches "Kick Drum")
  track = tracks.find(t => t.name.toLowerCase().startsWith(lower));
  if (track) return track;

  // Substring match as last resort
  track = tracks.find(t => t.name.toLowerCase().includes(lower));
  if (track) return track;

  throw new Error(`Track not found: "${trackName}". Available tracks: ${tracks.map(t => t.name).join(', ')}`);
}

/**
 * Set a track's volume fader to a specific dB value.
 *
 * @param {{ trackName: string, volumeDb: number }} params
 */
async function setTrackVolume({ trackName, volumeDb }) {
  const track = await findTrack(trackName);
  await track.setVolume(volumeDb);
  sf.ui.show(`Set "${track.name}" volume to ${volumeDb} dB`);
}

/**
 * Nudge a track's volume fader up by 1 dB.
 *
 * @param {{ trackName: string, stepDb?: number }} params
 */
async function nudgeTrackVolumeUp({ trackName, stepDb = 1.0 }) {
  const track = await findTrack(trackName);
  const current = await track.getVolume();
  await track.setVolume(current + stepDb);
  sf.ui.show(`Nudged "${track.name}" up ${stepDb} dB (now ${current + stepDb} dB)`);
}

/**
 * Nudge a track's volume fader down by 1 dB.
 *
 * @param {{ trackName: string, stepDb?: number }} params
 */
async function nudgeTrackVolumeDown({ trackName, stepDb = 1.0 }) {
  const track = await findTrack(trackName);
  const current = await track.getVolume();
  await track.setVolume(current - stepDb);
  sf.ui.show(`Nudged "${track.name}" down ${stepDb} dB (now ${current - stepDb} dB)`);
}

/**
 * Set a track's pan position.
 *
 * @param {{ trackName: string, panValue: number }} params — panValue: -100 (hard left) to 100 (hard right)
 */
async function setTrackPan({ trackName, panValue }) {
  const track = await findTrack(trackName);
  // Pro Tools pan is -100 to +100
  const clamped = Math.max(-100, Math.min(100, panValue));
  await track.setPan(clamped);
  sf.ui.show(`Set "${track.name}" pan to ${clamped}`);
}

/**
 * Mute or unmute a track.
 *
 * @param {{ trackName: string, muted: boolean }} params
 */
async function setTrackMute({ trackName, muted }) {
  const track = await findTrack(trackName);
  await track.setMute(muted);
  sf.ui.show(`${muted ? 'Muted' : 'Unmuted'} "${track.name}"`);
}
