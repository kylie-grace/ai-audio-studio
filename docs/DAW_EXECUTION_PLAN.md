# DAW Execution Plan

## Purpose

This plan defines the remaining DAW-side buildout needed to turn `ai-audio-studio` from a strong control-plane MVP into a real production assistant for session prep, revision execution, auto-mix assistance, listening/QC, and export automation.

It assumes:
- no SoundFlow automation is already built
- no ReaScript automation is already built
- Pro Tools may or may not be licensed on a given day
- Reaper is available sooner than Pro Tools
- the system must support both:
  - single-machine mode on one powerful Mac
  - optional split mode where a Mac mini is the control plane and a studio Mac is the execution node

## Current State

Already built:
- approval-gated revision flow
- queueing for `execute-soundflow` and `execute-reascript`
- optional `studio-worker`
- dry-run SoundFlow and ReaScript adapters
- revision artifact generation
- control-room visibility for workers, tasks, approvals, and recovery

Not yet built:
- real SoundFlow execution
- real ReaScript execution
- DAW environment discovery
- workstation onboarding
- actual session introspection
- auto-mix planning tied to real session state
- listening loop / reference analysis / render review loop
- bounce/export automation
- DAW safety rails and rollback behavior
- plugin inventory awareness
- operator review UI for mix suggestions and listening results

## Target End State

The finished DAW system should do all of this:

1. Discover the workstation environment.
2. Detect available DAWs, versions, session paths, and automation capabilities.
3. Import stems and prepare session structure safely.
4. Read or infer session state.
5. Generate bounded mix plans from notes, session state, references, and rules.
6. Render DAW-specific execution artifacts for Pro Tools and Reaper.
7. Execute those artifacts only after explicit approval.
8. Run listening/QC passes on candidate bounces.
9. Produce actionable findings, not just pass/fail.
10. Support iterative revision loops until the operator accepts the result.
11. Package final deliverables and logs.
12. Leave a full audit trail for every DAW-side action.

## Architecture Direction

## Execution Modes

- `single_machine`
  - control room, database, automations, and DAW execution all run on one Mac
  - best for fastest early adoption
- `control_plane_plus_worker`
  - Mac mini runs orchestration
  - studio Mac runs DAW execution and heavy session access
  - best for always-on production

The worker must remain optional. The execution layer should be the same abstraction in both modes.

## Core DAW Layers

1. `workstation-discovery`
   - detects installed DAWs
   - validates automation prerequisites
   - records capability matrix

2. `session-introspection`
   - extracts track/stem/session metadata
   - validates referenced assets and routing assumptions

3. `mix-planning`
   - turns notes + context + session state into a bounded plan
   - never jumps straight to opaque “AI mix everything”

4. `daw-adapters`
   - SoundFlow adapter for Pro Tools
   - ReaScript adapter for Reaper
   - later: shared adapter contract for any future DAW

5. `render-and-listen`
   - generates work bounces
   - runs objective QC
   - runs reference-aware listening review

6. `operator-review`
   - shows proposed changes, renders, findings, and next-step actions

## Major Workstreams

## 1. Workstation Discovery

Goal:
- make the system self-aware about what DAW automation is possible on the machine

Build:
- a workstation probe service inside `studio-worker`
- capability detection for:
  - Reaper installed
  - Pro Tools installed
  - SoundFlow installed
  - SoundFlow CLI/API reachable
  - Reaper CLI or script entry available
  - shared session paths mounted
  - plugin directories readable where possible
- persisted workstation profile in CRM/workspace settings or project-state
- control-room view for workstation readiness

Outputs:
- `available_daws`
- `automation_modes`
- `installed_versions`
- `path_translation_health`
- `execution_blockers`

Acceptance criteria:
- operator can open the control room and immediately see whether Reaper automation is ready, Pro Tools automation is ready, or both are unavailable

## 2. Session Intake and Introspection

Goal:
- make the system understand the real session before trying to act on it

Build:
- project intake manifest
- stem inventory normalization
- file format validation
- sample rate / bit depth scan
- session path + related asset path model
- introspection contract:
  - track names
  - stem groups
  - session notes
  - routing assumptions
  - reference tracks
  - tempo/key markers where available

For Reaper first:
- parse `.rpp` enough to extract track/session metadata

For Pro Tools later:
- rely more on operator-supplied metadata plus SoundFlow-driven in-app inspection

Acceptance criteria:
- before any mix or revision run, the system can produce a session manifest and a confidence score for what it knows

## 3. Mix Planning Engine

Goal:
- build a real “auto-mix assistant” as a planner, not a magic black box

Build:
- structured mix objective model:
  - genre
  - client intent
  - problem list
  - priority instruments
  - vocal focus
  - translation goals
  - loudness target
  - reference tracks
- planning outputs:
  - gain staging suggestions
  - track grouping suggestions
  - corrective pass
  - tonal pass
  - dynamics pass
  - spatial pass
  - automation pass
  - print/bounce plan
- risk model:
  - what can be safely auto-executed
  - what must remain operator-reviewed

Important constraint:
- “auto mixing” should mean bounded execution plans plus iterative review, not one-shot destructive moves

Acceptance criteria:
- for a project, the system can generate a readable mix plan with explicit actions, rationale, risk, and DAW execution targets

## 4. DAW Adapter: Reaper First

Why first:
- easier automation surface
- lower licensing friction
- best path to a real end-to-end working execution loop

Build:
- Reaper workstation probe
- ReaScript template generation
- session open / save-as / safety duplicate workflow
- track locate by name or tag
- region/marker helper utilities
- bounded commands for:
  - import media
  - organize tracks
  - color / group / label
  - create buses
  - set rough gain trims
  - apply routing templates
  - write marker notes
  - prepare render regions
  - render stems / mix prints
- result capture:
  - execution log
  - output artifact paths
  - screenshots if possible

Later, after stable basics:
- envelope automation
- plugin preset application
- reference track routing
- iterative mix macro passes

Acceptance criteria:
- given an approved plan, Reaper can execute a real safe subset on a copied session and produce logs plus renders

## 5. DAW Adapter: Pro Tools via SoundFlow

Goal:
- support Pro Tools without assuming any existing SoundFlow setup

Build:
- SoundFlow bootstrap package owned by this repo
- SoundFlow command library for:
  - session open
  - save copy / duplicate session
  - locate tracks
  - import files
  - create routing scaffolds
  - create markers
  - apply simple clip gain or fader moves
  - bounce/export
- script packaging strategy:
  - generated scripts from revision/mix plans
  - reusable command modules
- workstation profile should explicitly track:
  - Pro Tools version
  - SoundFlow version
  - UI scripting readiness
  - accessibility permission status

Important constraint:
- Pro Tools automation should start with deterministic scaffolding and revision execution, not ambitious full auto-mixing

Acceptance criteria:
- operator can run approved Pro Tools actions from the queue and get bounded execution with artifacts and rollback-safe session copies

## 6. Listening and Review Loop

Goal:
- make the system capable of hearing, comparing, and reporting, not just executing

Build:
- render candidate outputs
- objective QC pass using `audio-qc`
- listening analysis layer:
  - loudness balance
  - crest / dynamics heuristics
  - clipping / intersample risk
  - spectral tilt checks
  - low-end buildup checks
  - vocal-forwardness heuristics
  - mono compatibility checks
  - left/right imbalance checks
- reference comparison:
  - user-supplied references
  - target delta summary
- listening report model:
  - critical issues
  - likely causes
  - suggested next moves
  - confidence level

Important constraint:
- this should not pretend to replace human taste
- it should function as an expert QC and comparison layer

Acceptance criteria:
- after a bounce, the system can produce a useful listening/QC report that drives the next review or revision pass

## 7. Auto-Mix Loop

Goal:
- turn planning + execution + listening into a repeatable iterative loop

Target loop:
1. ingest session and references
2. generate mix plan
3. operator approves scope
4. execute bounded DAW pass on a copy
5. render candidate
6. run objective QC + listening analysis
7. summarize findings
8. either:
   - accept
   - request another guided pass
   - escalate to manual engineer review

Auto-mix phases:
- Phase A: prep and routing automation
- Phase B: rough static mix assistance
- Phase C: QC/listen-informed revision suggestions
- Phase D: limited iterative corrective passes

Do not start with:
- blind full plugin-chain generation
- destructive mix overwrites
- autonomous final print release without operator approval

## 8. Bounce and Delivery Automation

Build:
- standard render profiles:
  - rough mix
  - client review mix
  - instrumental
  - TV mix
  - clean edit
  - stems
- manifest capture:
  - file paths
  - sample rate
  - bit depth
  - loudness
  - notes
- link to delivery packager
- approval before outward delivery remains mandatory

Acceptance criteria:
- approved sessions can produce repeatable, named, logged exports without manual file wrangling

## 9. Safety and Recovery

Must-have safeguards:
- every execution runs against a copied session or explicitly marked working version
- plan preview before execution
- per-command logs
- task lease recovery
- idempotent retries where possible
- “stop execution” control from the dashboard
- “retire workstation” and “drain queue” controls
- failure-class taxonomy:
  - missing session
  - missing script
  - missing app
  - automation permission denied
  - UI mismatch
  - plugin missing
  - render failed

## 10. Control Room Features Still Needed for DAW

Add to the dashboard:
- workstation readiness panel
- DAW capability matrix
- session manifest viewer
- mix plan viewer
- render review panel
- listening report viewer
- approval diff for proposed DAW actions
- per-task artifact browser
- execution replay / rerun controls
- plugin inventory and compatibility warnings

## Overnight Build Plan

These are the highest-value items that can be built without waiting for a real studio machine:

## Phase 1: Foundation
- add workstation profile model and API
- add DAW capability/readiness status in `studio-worker`
- add control-room workstation readiness UI
- add session manifest schema
- add mix plan schema
- add execution artifact schema
- add listening report schema

Status:
- completed for the overnight-safe path
- workstation profile, session manifest, mix plan, render plan, listening report, and execution-plan previews now exist in `studio-worker`
- the control room now shows workstation readiness, session introspection confidence, mix/render/listening posture, and execution-loop readiness

## Phase 2: Reaper-first execution path
- implement real Reaper adapter contract
- generate real ReaScript artifacts instead of dry-run-only placeholders
- add safe session-copy workflow
- add render job plumbing
- add artifact collection and result persistence

Status:
- partially completed for the overnight-safe path
- real ReaScript artifacts are now generated
- Reaper session manifests can now parse `.rpp` track names, markers, tempo candidates, and introspection confidence
- render-plan plumbing and execution-plan previews exist
- true live Reaper execution and copied-session mutation still require a real workstation validation pass

## Phase 3: Pro Tools bootstrap scaffolding
- define SoundFlow package structure in repo
- add SoundFlow command templates
- add environment validation and permission checks
- add script generation pipeline
- keep execution behind a capability flag until validated

Status:
- partially completed
- SoundFlow-oriented revision artifacts and capability gating exist
- workstation readiness now reports Pro Tools/SoundFlow posture
- live SoundFlow execution remains intentionally gated pending real workstation validation

## Phase 4: Listening/QC loop
- extend `audio-qc` outputs into richer review objects
- build reference-compare pipeline
- add listening summary generator
- add dashboard review cards for renders and findings

Status:
- materially advanced
- `audio-qc` now exposes candidate/reference compare previews
- listening previews now include QC summary and reference alignment signals
- the control room now surfaces listening summary, render review posture, and execution-loop guidance

## Phase 5: Control-room operator UX
- add session view
- add mix plan review UI
- add DAW approval preview UI
- add artifact browser
- add bounce/render status UI

Status:
- partially completed for the preview/operator path
- session view, mix/render/listening previews, workstation readiness, and execution-plan posture are now visible in the control room
- artifact browsing and real render-job status remain future work once live execution is field-validated

## Phase 6: Tests
- worker task contract tests
- adapter unit tests
- session manifest tests
- render/listening result tests
- Docker smoke coverage for worker/task flows

## What You Need To Provide Later

These are the real-world inputs I will need from you before the DAW layer can be called production-ready:

## Workstation access
- which Mac will be the first real DAW execution machine
- whether single-machine or split mode is the initial deploy target

## DAW posture
- Reaper version
- Pro Tools version
- whether SoundFlow is installed
- whether Pro Tools scripting/accessibility permissions are enabled

## Session conventions
- preferred project folder structure
- naming conventions for:
  - sessions
  - stems
  - bounces
  - revisions
  - references

## Mix standards
- what deliverable types you want by default
- your preferred loudness / print standards
- whether stems are always required
- what a “review mix” means in your studio

## Style and engineering preferences
- preferred mix priorities by genre
- preferred references or favorite benchmark records
- common revision patterns
- any do-not-touch rules

## Plugin posture
- must-have plugins
- stock-only fallback rules
- what plugin chains are safe to automate

## Recommended Execution Order

1. Build Reaper-first real execution.
2. Build workstation discovery and capability reporting.
3. Build listening/reporting and render review.
4. Build mix-plan and session-manifest UI.
5. Build SoundFlow bootstrap and deterministic Pro Tools scaffolding.
6. Validate on a real workstation.
7. Only then expand into aggressive auto-mix iteration.

## Definition of Done

The DAW roadmap is not done when scripts merely run.

It is done when:
- a fresh operator can onboard a workstation
- the system can inspect session readiness
- a mix/revision plan can be reviewed before execution
- approved actions run safely on a real DAW
- renders come back automatically
- listening/QC results are visible in the control room
- failures are recoverable from the dashboard
- the whole path leaves a trustworthy audit trail

## Hard Truth

Yes, there is still a lot left on the DAW side.

The biggest unfinished product surfaces are:
- real DAW automation
- real listening/review intelligence
- real auto-mix iteration
- workstation onboarding and safety

The control plane is now strong enough to support that work. The DAW system itself is still in scaffold-to-implementation transition.
