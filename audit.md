# AI Audio Studio Audit

Date: 2026-03-20
Auditor: Codex
Scope: current repository state, runtime posture, test posture, documentation contract, and product-completeness gaps

## Executive Summary

This repository is no longer just a scaffold. It now represents a strong control-plane MVP for `ai-audio-studio`:
- the Dockerized control plane runs on a single Mac
- the dashboard is live on the LAN and through the optional HTTPS edge
- `project-state`, `crm-api`, and `openclaw` are DB-backed and integrated enough to support approvals, rules, style profiles, bootstrap state, and worker task plumbing
- optional worker execution exists for local or split-machine operation

It is still not a novice-ready finished product.

The biggest remaining gap is no longer “nothing exists.” The biggest remaining gap is productization:
- onboarding/settings now have a real persisted home, persisted module tuning, and service status surfaces, but coverage is still partial and many modules still read directly from env
- the dashboard is now a much stronger control room, but it is not yet the complete operator control room
- several domain workflows still need deeper execution depth and more real-world connector coverage
- broader end-to-end runtime validation is still needed

Conclusion: the repo is now a usable operator-facing MVP foundation, but not yet a turnkey studio product.

## Current State

What is working now:
- full control-plane Docker stack with a named Compose project
- live dashboard plus LAN/HTTPS access
- DB-backed `project-state` for jobs, approvals, audit, workers, alerts, and worker tasks
- DB-backed `crm-api` for projects, leads, and style profiles
- DB-backed workspace settings bootstrap for first-run studio identity, shared paths, style seed, and worker posture
- persisted module settings for lead intake, inbox triage, content pipeline, audio QC, session prep, revision parser, delivery packaging, and mix planning
- DB-backed `openclaw` rule seeding, starter packs, playbooks, alert config, and bootstrap status
- optional `studio-worker` path for local-worker or split-worker execution
- DAW preview loop for workstation readiness, session introspection, mix plans, render plans, listening summaries, and execution-plan staging
- idempotent one-shot n8n workflow bootstrap against the running `n8n` service
- service `/status` endpoints across the major automation and production modules
- control-room service drilldowns with live status snapshots and saved tuning summaries

What is still incomplete:
- complete operator-safe settings coverage for every major service
- novice-friendly first-run setup that avoids env editing for normal product configuration beyond secrets and host wiring
- complete end-to-end automation depth for all email/content flows
- fully validated DAW execution on a real remote studio machine
- broader integration and end-to-end test coverage

## Validation Snapshot

Latest known validation in this repo state:
- `pytest -q tests/unit tests/approval-boundary`
- `python3 -m compileall services/crm-api services/project-state services/openclaw-orchestrator services/content-pipeline services/audio-qc workers services/studio-worker`
- Docker rebuild of the control-room and service stack under `infra/docker-compose.yml`
- `docker compose --env-file infra/env.example -f infra/docker-compose.yml config`
- runtime smoke checks for dashboard, proxied service status endpoints, control-plane health, and HTTPS front door

Host-environment note:
- API-level FastAPI tests in `tests/api` currently skip on this host because the active Python environment does not have `fastapi` and `asyncpg` installed. Runtime validation was therefore completed through Dockerized services and the live dashboard proxy instead.

This validation is meaningful for the MVP, but it is not yet comprehensive enough to claim production readiness.

## Highest-Signal Remaining Gaps

1. Onboarding/settings have started, but are not yet broad enough.
   Current state:
   - there is now a persisted workspace-settings surface, first-run questionnaire, service drilldowns, and persisted module tuning for eight modules
   - many module-level settings still live primarily in `infra/.env`
   Impact:
   - the product is meaningfully easier to start, but still too operator-technical to call turnkey
   - configuration ownership is still split across env, DB records, seeds, and runtime reads

2. The control plane is strong, but the control room is not yet complete.
   Current state:
   - the dashboard surfaces health, approvals, workers, rules, alerts, bootstrap state, live service status, and saved module posture
   - it still needs deeper mutation flows, more guided operator actions, and a clearer first-run path across every service
   Impact:
   - operators can see much more than before, but still cannot complete every normal setup and operations task from one UI

3. Several business flows are still MVP-depth rather than production-depth.
   Current state:
   - the rule layer, queueing, approval routing, and bounded execution plumbing are present
   - deeper connector behavior, richer drafting flows, more complete escalation handoff, and more polished domain logic still need implementation
   Impact:
   - the system demonstrates the architecture correctly, but does not yet deliver every promised workflow at full operational depth

4. DAW-side execution remains structured but not fully field-validated.
   Current state:
   - local and optional worker execution paths exist
   - dry-run-friendly DAW task handling exists
   - Reaper `.rpp` session introspection, render-plan previews, QC/reference compare previews, and execution-plan previews now exist
   - a real second-machine validation pass with production DAW tooling is still pending
   Impact:
   - the platform is architecturally ready for the worker model, but not yet fully proven against a live studio workstation

5. Test coverage still trails the runtime ambition.
   Current state:
   - unit and approval-boundary tests are in good shape for the current codebase
   - broader integration coverage is still needed for Dockerized service interactions, workflow execution, remote worker behavior, and operator flows
   Impact:
   - regressions in cross-service behavior can still slip through even while local tests remain green

## Documentation Contract

The docs should now describe the product this way:
- strong control-plane MVP
- single-machine-first deployment
- optional worker execution
- onboarding/settings still being added
- not yet novice-complete

Anything stronger than that would overstate current product completeness.

## Next Milestones

1. Extend workspace settings from onboarding into a broader persisted settings layer that more services actually consume.
2. Extend the dashboard into a fuller control room with richer settings management and deeper mutation paths.
3. Deepen OpenClaw-driven email/content automations and finish the operator-safe handoff loops.
4. Validate SoundFlow/ReaScript-style execution against a real worker machine.
5. Add broader end-to-end tests that exercise the Dockerized runtime, not just helper logic.

## Bottom Line

The repository has crossed the line from scaffold to usable MVP.

The remaining work is mostly about making it easier, safer, and more complete:
- easier for a studio owner to configure
- safer to operate without env-level footguns
- more complete across onboarding, automation depth, and DAW validation
