/**
 * AI Audio Studio — Apply Revision Plan
 *
 * Reads an AI Audio Studio revision manifest JSON file and executes each
 * step against the active Pro Tools session.
 *
 * Usage (from SoundFlow command or CLI):
 *   applyRevision({ planPath: "/path/to/protools_revision_script.json" })
 */

// eslint-disable-next-line no-undef
const faders = require('../commands/faders');
// eslint-disable-next-line no-undef
const markers = require('../commands/markers');
// eslint-disable-next-line no-undef
const session = require('../commands/session');

/**
 * Execute a single revision step.
 * Returns { step, status, error? }.
 */
async function executeStep(step, idx) {
  const action = step.action || 'comment';
  const track = step.track || '';
  const comment = step.comment || `step ${idx + 1}`;

  try {
    switch (action) {
      case 'setFader': {
        const valueDb = step.value_db;
        const direction = (step.direction || '').toLowerCase();
        if (typeof valueDb === 'number') {
          await faders.setTrackVolume({ trackName: track, volumeDb: valueDb });
        } else if (direction === 'up' || direction === 'increase') {
          await faders.nudgeTrackVolumeUp({ trackName: track });
        } else if (direction === 'down' || direction === 'decrease') {
          await faders.nudgeTrackVolumeDown({ trackName: track });
        }
        break;
      }
      case 'setPan':
        await faders.setTrackPan({ trackName: track, panValue: step.value ?? 0 });
        break;
      case 'mute':
        await faders.setTrackMute({ trackName: track, muted: step.muted !== false });
        break;
      case 'addMarker':
        await markers.addMemoryLocation({ name: comment, comment: step.comment });
        break;
      case 'addRegion':
        await markers.addRegion({ name: comment, start: step.start || 0, end: step.end || 0 });
        break;
      case 'comment':
        // Informational step — no DAW action required
        sf.ui.show(`Note: ${comment}`);
        break;
      default:
        sf.ui.show(`Warning: unknown action '${action}' — skipping step ${idx + 1}`);
    }
    return { step: idx + 1, action, track, status: 'ok' };
  } catch (err) {
    return { step: idx + 1, action, track, status: 'error', error: String(err) };
  }
}

/**
 * Apply a full revision plan from a JSON manifest file.
 *
 * @param {{ planPath: string, saveSessionCopyFirst?: boolean }} params
 */
async function applyRevision({ planPath, saveSessionCopyFirst = true }) {
  if (!planPath) throw new Error('planPath is required');

  const raw = await sf.filesystem.readFile(planPath);
  const plan = JSON.parse(raw);
  const steps = plan.steps || [];

  if (steps.length === 0) {
    sf.ui.show('Revision plan has no executable steps — nothing to do.');
    return { status: 'noop', steps_total: 0, steps_ok: 0, steps_error: 0 };
  }

  sf.ui.show(`AI Audio Studio: applying ${steps.length} revision step(s)…`);

  // Safety copy before mutating session
  if (saveSessionCopyFirst) {
    try {
      await session.saveSessionCopy({ label: 'pre-revision' });
    } catch (err) {
      sf.ui.show(`Warning: could not save session copy: ${err}`);
    }
  }

  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const result = await executeStep(steps[i], i);
    results.push(result);
    if (result.status === 'error') {
      sf.ui.show(`Step ${i + 1} failed: ${result.error}`);
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;

  sf.ui.show(`Revision complete: ${ok} step(s) applied, ${errors} error(s).`);

  return {
    status: errors === 0 ? 'complete' : 'partial',
    steps_total: steps.length,
    steps_ok: ok,
    steps_error: errors,
    results,
  };
}
