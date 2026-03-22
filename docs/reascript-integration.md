# ReaScript Integration

## Overview

AI Audio Studio’s REAPER path uses the `studio-worker` to stage a disposable working session, copy the generated `.lua` script, launch REAPER, and wait for a completion marker. The control plane never edits a live project in place.

## REAPER prerequisites

- REAPER installed on the worker Mac
- `REAPER_BINARY_PATH` set to the real executable
- shared project path mounted and readable by the worker
- write access to the worker temp and shared artifact locations

## Required `.lua` scripts

The generated scripts are project-specific, but they follow a consistent purpose:

- `revision-plan.lua`
  Applies bounded mix or revision actions generated from approved notes.
- `session-manifest-preview.lua`
  Collects session-level details for track and marker previews.
- `render-plan.lua`
  Stages render/export intent for review artifacts.

The important contract is that the generated script writes or triggers the expected completion marker so the worker can confirm execution.

## REAPER preferences

Recommended REAPER posture:

- allow script execution
- allow the worker user to launch REAPER directly
- keep project media paths stable under the mounted shared workspace

This implementation does not depend on OSC as the primary transport. The worker launches REAPER with the staged session/script pair and then waits for the completion marker file.

## Testing the connection

1. Confirm `REAPER_BINARY_PATH` points to a valid REAPER binary.
2. Run the worker dry-run smoke from the control room.
3. Run the host REAPER smoke test script if you are validating on the worker Mac directly.
4. Confirm `/api/studio-worker/daw-status` reports `reaper.connected: true` when REAPER is reachable.

## Common failures

- REAPER binary path is wrong:
  The worker will fail startup validation or report REAPER as unavailable.
- Shared session path is missing:
  The worker can start, but execution will fail when the staged session source cannot be copied.
- Completion marker never appears:
  The script may have launched but did not finish the expected marker handshake.
- Session copy opens but script path is wrong:
  Validate the generated script artifact in the project review stack.

## Approval flow walkthrough

1. A revision request enters the approval queue.
2. The operator approves it in the control room.
3. `project-state` queues an `execute-reascript` task.
4. `studio-worker` claims the task, stages a disposable working copy, and launches REAPER.
5. The generated `.lua` script runs against the staged copy.
6. The completion marker is written.
7. The worker marks the task complete and project artifacts become visible in the control room.
