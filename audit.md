# AI Audio Studio Audit

Date: 2026-03-20
Auditor: Codex
Scope: repository ingest, stated-behavior review, automated test execution, structural validation, gap analysis against `README.md`, `tasks/`, and `legacy/`

## Executive Summary

This repository is not fully validated and does not currently deliver most of the behavior claimed in the README, task specs, and legacy brief.

What is real today:
- A partial `project-state` service with DB-backed routers for jobs, projects, approval, and audit
- Safety helper modules for FSM transitions, policy blocklists, effort-level gating, and audio-QC threshold presets
- Docker/requirements skeletons for the service graph
- A narrow automated test suite covering only pure logic helpers

What is not real today:
- Lead intake, inbox triage, session prep, revision parsing, delivery packaging, social drafting, CRM API, content pipeline, and OpenClaw orchestration are mostly stubs
- Audio QC does not implement `/qc/run` or report endpoints
- Studio Brain UI source is missing, so the advertised dashboard cannot be built from this repo
- There are no integration tests, API tests, DB migration tests, Docker bring-up tests, or end-to-end approval-path tests

Conclusion: this repo is a strong scaffold/specification, not a fully working platform.

## Validation Performed

Commands run:
- `pytest`
- `pytest --collect-only -q`
- `python3 -m compileall services workers`
- `docker compose -f infra/docker-compose.yml config`

Results:
- `pytest`: 45/45 passed
- `pytest --collect-only -q`: only 45 tests exist, all unit-level
- `python3 -m compileall services workers`: passed, no syntax errors
- `docker compose ... config`: compose file resolves, but warns that required secrets fall back to blank values when `infra/.env` is absent

## Findings

### Critical

1. Most claimed product functionality is unimplemented.
Evidence:
- [workers/lead-intake/main.py](/Users/kpsnyder/ai-audio-studio/workers/lead-intake/main.py#L1)
- [workers/inbox-triage/main.py](/Users/kpsnyder/ai-audio-studio/workers/inbox-triage/main.py#L1)
- [workers/session-prep/main.py](/Users/kpsnyder/ai-audio-studio/workers/session-prep/main.py#L1)
- [workers/revision-parser/main.py](/Users/kpsnyder/ai-audio-studio/workers/revision-parser/main.py#L1)
- [workers/delivery-packager/main.py](/Users/kpsnyder/ai-audio-studio/workers/delivery-packager/main.py#L1)
- [workers/mix-planner/main.py](/Users/kpsnyder/ai-audio-studio/workers/mix-planner/main.py#L1)
- [workers/social-drafting/main.py](/Users/kpsnyder/ai-audio-studio/workers/social-drafting/main.py#L1)
- [services/content-pipeline/src/main.py](/Users/kpsnyder/ai-audio-studio/services/content-pipeline/src/main.py#L1)
- [services/audio-qc/src/main.py](/Users/kpsnyder/ai-audio-studio/services/audio-qc/src/main.py#L1)
- [services/crm-api/src/main.py](/Users/kpsnyder/ai-audio-studio/services/crm-api/src/main.py#L1)
- [services/openclaw-orchestrator/src/main.py](/Users/kpsnyder/ai-audio-studio/services/openclaw-orchestrator/src/main.py#L1)

Impact:
- The README’s “five core modules,” service map, and health/behavior claims substantially overstate actual capability.

2. The advertised UI/dashboard cannot be built from the repository as checked in.
Evidence:
- [apps/studio-brain-ui/package.json](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/package.json#L1) expects a Vite/TypeScript app
- `find apps/studio-brain-ui -maxdepth 3 -type f` returns only `Dockerfile`, `nginx.conf`, and `package.json`
- [apps/studio-brain-ui/Dockerfile](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/Dockerfile#L1) runs `npm ci` and `npm run build`, but there is no `src/`, `index.html`, `tsconfig.json`, or `vite.config.*`

Impact:
- `studio-brain-ui` is unlikely to build successfully, so `docker compose up -d` cannot be trusted to satisfy README acceptance criteria.

3. There is no end-to-end validation of the approval boundary, despite the repo claiming hard safety guarantees.
Evidence:
- Only test files present are:
  - [tests/approval-boundary/test_approval_gates.py](/Users/kpsnyder/ai-audio-studio/tests/approval-boundary/test_approval_gates.py#L1)
  - [tests/unit/test_audio_qc_thresholds.py](/Users/kpsnyder/ai-audio-studio/tests/unit/test_audio_qc_thresholds.py#L1)
  - [tests/unit/test_lead_scorer.py](/Users/kpsnyder/ai-audio-studio/tests/unit/test_lead_scorer.py#L1)
  - [tests/unit/test_pipeline_policy.py](/Users/kpsnyder/ai-audio-studio/tests/unit/test_pipeline_policy.py#L1)
- Missing promised tests from Task 080: `tests/integration/test_lead_to_send.py`, `tests/integration/test_inbox_triage_flow.py`, `tests/approval-boundary/test_no_bypass.py`

Impact:
- The “fails closed” claim is not validated across service boundaries.

### High

4. One of the passing tests does not exercise production code.
Evidence:
- [tests/unit/test_lead_scorer.py](/Users/kpsnyder/ai-audio-studio/tests/unit/test_lead_scorer.py#L1) defines an inline `score_fit()` and comments “Keep in sync with `workers/lead-intake/scorer.py`”
- `workers/lead-intake/scorer.py` does not exist

Impact:
- The suite reports confidence in behavior that is not implemented anywhere in the application.

5. Compose resolves with blank credentials when `.env` is missing.
Evidence:
- `docker compose -f infra/docker-compose.yml config` warned that `POSTGRES_PASSWORD` and `N8N_PASSWORD` were unset and defaulted to empty strings
- [infra/docker-compose.yml](/Users/kpsnyder/ai-audio-studio/infra/docker-compose.yml#L1) uses `${...}` interpolation without hard failure guards

Impact:
- Local startup can appear “configured” while running with unsafe defaults or broken auth assumptions.

6. The README quick-start and health verification overstate runnable status.
Evidence:
- [README.md](/Users/kpsnyder/ai-audio-studio/README.md#L1) says the full stack can be started and verified healthy
- Health endpoints exist for many services, but most services only expose `/health` and do not implement the business endpoints claimed in the same document

Impact:
- A user can get green health checks on stub services and incorrectly conclude the platform is functional.

### Medium

7. `project-state` is the only meaningful service implementation, but its behavior is only lightly validated.
Evidence:
- Implemented routers:
  - [services/project-state/src/routers/jobs.py](/Users/kpsnyder/ai-audio-studio/services/project-state/src/routers/jobs.py#L1)
  - [services/project-state/src/routers/projects.py](/Users/kpsnyder/ai-audio-studio/services/project-state/src/routers/projects.py#L1)
  - [services/project-state/src/routers/approval.py](/Users/kpsnyder/ai-audio-studio/services/project-state/src/routers/approval.py#L1)
  - [services/project-state/src/routers/audit.py](/Users/kpsnyder/ai-audio-studio/services/project-state/src/routers/audit.py#L1)
- No tests currently hit these HTTP routes, the middleware, or the database schema end to end

Impact:
- Important behavior may fail in real execution even though helper-level tests pass.

8. Some documented assets and workflows are missing entirely.
Evidence:
- `services/n8n/workflows/` is absent, despite multiple task files referencing workflow JSONs
- `workers/approved-send/` is absent
- `apps/dashboard/` is absent
- `docs/runbooks/incident-response.md` is absent

Impact:
- Several claimed operational and safety workflows do not exist in-repo.

## Stated Behavior vs Actual Status

| Area | Claimed | Actual |
|---|---|---|
| Lead intake | Normalize, score, draft, CRM write, queue | Stub health app only |
| Inbox triage | Gmail readonly classification and drafting | Stub health app only |
| Social/content pipeline | `/draft-social`, multi-platform drafts | Health app only, endpoint missing |
| Session prep | File validation, organization, prep report | Stub health app only |
| Audio QC | `/qc/run`, report generation, delivery blocking | Health app only, thresholds module exists |
| Revision parser | Parse notes, generate scripts, queue | Stub health app only |
| Delivery packager | QC-gated delivery assembly | Stub health app only |
| CRM API | Leads and projects endpoints | Health app only |
| OpenClaw | Worker dispatch with policy enforcement | Health app plus pure policy helper only |
| Studio Brain UI | Internal approval queue dashboard | Source missing, likely non-buildable |
| Safety testing | Boundary + end-to-end enforcement | Helper unit tests only |

## Proposed Changes

### 1. Correct the repo contract immediately

Update [README.md](/Users/kpsnyder/ai-audio-studio/README.md#L1) to state clearly that this is a scaffold/prototype. Remove or qualify claims that the full stack is operational until:
- the UI builds
- worker endpoints exist
- integration tests pass
- compose startup is verified in CI

Also add a capability matrix:
- `implemented`
- `partial`
- `stub`

### 2. Make tests reflect reality

Replace spec-only or inline-copy tests with production-import tests.

Required changes:
- Create `workers/lead-intake/scorer.py` and import it in tests
- Add API tests for `project-state` routes using a real temporary Postgres instance
- Add negative tests for approval/rejection auth and audit restrictions
- Add route tests for all non-stub services as they are implemented

Minimum new test layers:
- Unit
- API/integration
- Compose/stack smoke

### 3. Implement CI-grade stack validation

Add an automated validation target that runs:
1. `pytest`
2. service import/syntax checks
3. `docker compose config`
4. docker build for every image
5. ephemeral stack smoke test with health checks
6. API smoke tests for required endpoints

This should become a single command, for example:
```bash
make audit
```
or
```bash
./scripts/validate_stack.sh
```

### 4. Finish the UI or remove it from compose for now

Choose one:
- Implement the missing Vite app files in `apps/studio-brain-ui`
- Or remove `studio-brain-ui` from the documented “working stack” until the source exists

At minimum, add:
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `tsconfig.json`
- `vite.config.ts`

### 5. Prioritize implementation by safety chokepoints

Recommended order:
1. `project-state` route and DB integration tests
2. `crm-api` real endpoints
3. `lead-intake` real webhook + deterministic scorer
4. `approved-send` worker with independent approval re-checks
5. `inbox-triage`
6. `audio-qc`
7. `session-prep`
8. `revision-parser`
9. `content-pipeline`
10. `openclaw` orchestration
11. UI/dashboard

Reason:
- This order validates the core “human approval before action” guarantee before building more automation around it.

### 6. Harden configuration

Change compose/env handling so missing secrets fail early instead of defaulting to empty strings.

Examples:
- `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}`
- `${N8N_PASSWORD:?N8N_PASSWORD is required}`

Also add a preflight script that checks:
- required env vars
- Docker availability
- shared volume mount presence
- port collisions

### 7. Add missing operational assets referenced by docs/tasks

Create or remove references to:
- `services/n8n/workflows/*.json`
- `workers/approved-send/*`
- `apps/dashboard/*`
- `docs/runbooks/incident-response.md`

Right now the task files function more like a roadmap than an implemented repository contract.

## Recommended Definition of “Validated”

Do not treat this project as validated until all of the following are true:
- Full compose stack builds from a clean clone
- Every documented service endpoint exists and is exercised by tests
- Approval boundary is tested across actual services, not only helper functions
- UI/dashboard builds and displays live queue/state
- No placeholder/stub modules remain in the main service graph
- CI reproduces the validation on every change

## Remediation Progress Since Initial Audit

Implemented after the initial audit:
- DB-backed worker registry and remote task queue in `project-state`
- Mac mini to studio Mac execution model via `infra/docker-compose.worker.yml`
- `crm-api` style-profile ingestion for pasted text and file-backed references
- `openclaw` rule registry and trigger-based dispatch contracts
- configurable LAN exposure via `BIND_HOST`

Still outstanding before this can be called production-ready:
- a full live dashboard rather than a thin shell
- end-to-end tests for style profiles, orchestration rules, and worker claims
- richer OpenClaw execution paths for email/content modules
- studio-worker coverage for DAW automation and audio QC

Recent additions:
- `crm-api` now seeds a default studio tone profile at startup
- `openclaw` now seeds practical email/content orchestration rules at startup
- pure helper modules exist for seed definitions so rule coverage can be tested without the Docker stack
- unit coverage now asserts the default email/content rule set and style profile helpers

## Bottom Line

The repository is well-structured and the safety intent is strong, but the implementation is substantially incomplete. The current test suite proves only that a few helper modules behave as expected. It does not prove that the platform, as described in the README and legacy brief, actually works.

## Remediation Executed In This Pass

Implemented:
- Added a real production scorer module at [workers/lead-intake/scorer.py](/Users/kpsnyder/ai-audio-studio/workers/lead-intake/scorer.py)
- Replaced the inline-copy scorer test so [tests/unit/test_lead_scorer.py](/Users/kpsnyder/ai-audio-studio/tests/unit/test_lead_scorer.py) imports production logic
- Added API-level `project-state` tests at [tests/api/test_project_state_api.py](/Users/kpsnyder/ai-audio-studio/tests/api/test_project_state_api.py)
- Added headless validation scripts:
  - [scripts/validate_stack.sh](/Users/kpsnyder/ai-audio-studio/scripts/validate_stack.sh)
  - [scripts/preflight_env.sh](/Users/kpsnyder/ai-audio-studio/scripts/preflight_env.sh)
- Hardened compose credentials in [infra/docker-compose.yml](/Users/kpsnyder/ai-audio-studio/infra/docker-compose.yml) so required passwords no longer silently default to blank values
- Made `apps/studio-brain-ui` source-complete enough for a real Vite build path:
  - [index.html](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/index.html)
  - [App.tsx](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/src/App.tsx)
  - [main.tsx](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/src/main.tsx)
  - [styles.css](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/src/styles.css)
  - [tsconfig.json](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/tsconfig.json)
  - [vite.config.ts](/Users/kpsnyder/ai-audio-studio/apps/studio-brain-ui/vite.config.ts)
- Updated [README.md](/Users/kpsnyder/ai-audio-studio/README.md) to describe the scaffold honestly and document headless validation

Executed after remediation:
- `pytest` → 45 passed, 1 skipped
- `bash scripts/validate_stack.sh infra/env.example` → passed

Current limitation:
- The new API tests are dependency-aware and skip on hosts that do not have `fastapi` and `asyncpg` installed in the active Python environment. They will run in a proper service/dev environment, but the host used for this audit only supported the pure-logic test subset.
