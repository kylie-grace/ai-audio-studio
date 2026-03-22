# Master Plan

## Product direction

`ai-audio-studio` is being built as a full studio operating system:
- one operator-facing control room
- one operator chat / concierge layer inside that control room
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

Current truth:
- `macos` is the validated worker runtime path today
- `windows` support is scaffolded in path translation and workstation validation, but still needs a real workstation validation pass
- `Wavelab` detection is scaffolded; live adapter/runtime validation is still pending

## Remaining execution order

1. Persist richer listening/render review records beyond preview-only objects.
2. Keep expanding project review packets and candidate-centric operator actions.
3. Add stronger stop/cancel/recovery behavior for DAW execution.
4. Harden SoundFlow/Pro Tools execution and preview flows.
5. Add Wavelab discovery and mastering scaffolding.
6. Finish Windows worker runtime validation and mount/path runbooks on a real workstation.
7. Finish Gmail/social communications and novice-safe automation packs.
8. Refresh docs, cut over fully, and run final validation.

Newly surfaced implementation gaps:
- listening and render review are still mostly preview-time objects rather than persisted review records
- Windows worker support now has explicit path translation and validation scaffolding, but still needs live workstation validation and runtime adapter proof
- workstation setup now includes validation plus a dry-run planning smoke, but the remaining gap is DAW-specific live smoke coverage for Pro Tools/SoundFlow and WaveLab

## Definition of done

The system is complete when:
- onboarding captures host posture, worker posture, context, alerts, integrations, and DAW setup without manual env editing beyond secrets
- the control room includes a context-aware concierge that can reason over shared paths, projects, alerts, artifacts, and setup posture and route novices to safe actions
- the concierge is honest about runtime mode, using live Ollama-backed responses when possible and explicit fallback guidance otherwise
- plugin/dependency risk is visible before execution
- approved DAW tasks run safely with recoverable artifacts and operator controls
- artifacts, renders, QC, listening, and delivery history are visible from the control room
- Reaper is proven live
- Pro Tools/SoundFlow is operator-safe and validated
- Wavelab posture is explicit and supported where viable
- remote worker architecture is documented for both Mac and Windows
- final operator docs match reality
