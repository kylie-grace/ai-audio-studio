# Master Plan

## Product direction

`ai-audio-studio` is being built as a full studio operating system:
- one operator-facing control room
- one orchestration/control-plane stack
- optional DAW execution on the same host or on remote worker nodes
- approval-gated automation for communication, production, review, and delivery

It must not be framed as Mac-mini-only.

The operator should be able to declare:
- what machine the control plane is running on
- whether that same machine also executes DAW work
- whether remote workers are expected
- whether those remote workers are `macos`, `windows`, or mixed

## Supported machine posture

Primary modes:
- `single_machine`
  - one powerful workstation runs control plane and optional DAW execution
- `control_plane_plus_worker`
  - one always-on host runs orchestration
  - one or more worker nodes execute DAW/file-heavy tasks

Planned host-machine choices:
- Mac mini
- Mac Studio
- MacBook Pro
- Windows workstation
- other / custom

Planned worker platforms:
- `macos`
- `windows`

## DAW scope

Execution targets:
- `Reaper`
  - first full live adapter target
  - best early end-to-end execution surface
- `Pro Tools + SoundFlow`
  - required for high-value editorial and revision automation
  - needs explicit bootstrap and workstation validation
- `Wavelab`
  - desired for mastering-oriented execution and export workflows
  - should begin with bounded mastering/export-safe tasks

## Remaining execution order

1. Add plugin dependency warnings to mix, revision, and execution planning.
2. Add artifact browser actions and review/download UX.
3. Add host-machine selector and worker-platform posture to onboarding/settings.
4. Add workstation setup wizard and validation flows.
5. Add stronger stop/cancel/recovery behavior for DAW execution.
6. Harden SoundFlow/Pro Tools execution and preview flows.
7. Add Wavelab discovery and mastering scaffolding.
8. Deepen QC/listening/reference review.
9. Finish project operations, delivery history, and review surfaces.
10. Finish Gmail/social communications and novice-safe automation packs.
11. Refresh docs, cut over fully, and run final validation.

Newly surfaced implementation gaps:
- artifact browser still needs true front-door download/open flows, not just copy-path actions
- Windows worker support still needs explicit path translation, mount conventions, and runtime validation

## Definition of done

The system is complete when:
- onboarding captures host posture, worker posture, context, alerts, integrations, and DAW setup without manual env editing beyond secrets
- plugin/dependency risk is visible before execution
- approved DAW tasks run safely with recoverable artifacts and operator controls
- artifacts, renders, QC, listening, and delivery history are visible from the control room
- Reaper is proven live
- Pro Tools/SoundFlow is operator-safe and validated
- Wavelab posture is explicit and supported where viable
- remote worker architecture is documented for both Mac and Windows
- final operator docs match reality
