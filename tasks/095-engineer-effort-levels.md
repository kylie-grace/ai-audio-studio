# Task 095 — Engineer Effort Levels (Project Automation Depth)

## Purpose and Scope
When an engineer imports a project (drops stems), they should be able to choose
how deeply the system automates the workflow. Not every project needs the full
pipeline — sometimes an engineer just wants stems organized and a QC report;
other times they want everything up to a mix plan ready. This feature introduces
a concept of **effort level** that gates which pipeline stages run automatically.

## Effort Levels

| Level | Name | What runs automatically |
|-------|------|------------------------|
| 1 | **Import Only** | Stems validated, folder structure created, prep report generated. Nothing else. |
| 2 | **Import + QC** | Level 1 + audio QC run on any rendered files found. Report delivered to queue. |
| 3 | **Import + QC + Mix Plan** | Level 2 + mix plan generated from stem analysis. Plan queued for approval. |
| 4 | **Full Pipeline** | Level 3 + revision parser active, delivery packager standing by. Full automation depth. |

Default: **Level 2** (safe for most projects — organize, validate, report).

## How It Works

### Setting the level
The effort level is set per-project at intake, either:
- Via n8n webhook payload: `"effort_level": 3`
- Via Studio Brain UI project creation form
- Via env var `DEFAULT_EFFORT_LEVEL` (system-wide default)

### Where it's enforced
`services/project-state/src/pipeline_policy.py` — a new module that evaluates
whether a downstream job is permitted given the project's effort level.
Workers query this before creating new downstream jobs.

### Job gating
```python
LEVEL_PERMITTED_MODULES = {
    1: {"session-prep"},
    2: {"session-prep", "audio-qc"},
    3: {"session-prep", "audio-qc", "mix-planner"},
    4: {"session-prep", "audio-qc", "mix-planner", "revision-parser", "delivery-packager"},
}

def is_module_permitted(module: str, effort_level: int) -> bool:
    permitted = set().union(*[LEVEL_PERMITTED_MODULES[l] for l in range(1, effort_level + 1)])
    return module in permitted
```

### Project schema change
Add `effort_level INTEGER NOT NULL DEFAULT 2 CHECK (effort_level BETWEEN 1 AND 4)`
to the `projects` table. Migrate via idempotent SQL addition to `infra/db/init.sql`.

## Files to Create or Modify
- `infra/db/init.sql` — add `effort_level` column to `projects`
- `services/project-state/src/pipeline_policy.py` — effort level gating logic
- `services/project-state/src/routers/projects.py` — include `effort_level` in create/update
- `services/project-state/src/routers/jobs.py` — check pipeline_policy before creating downstream job
- `workers/session-prep/main.py` — pass effort_level in job creation, check before spawning QC
- `workers/audio-qc/main.py` — check effort_level before spawning mix-planner
- `apps/studio-brain-ui/` — show effort level badge on project card; allow changing it
- `apps/dashboard/panels/jobs.py` — show effort level indicator on active projects
- `infra/env.example` — add `DEFAULT_EFFORT_LEVEL=2`
- `tasks/050-session-prep.md` — update to reference effort level

## UI Treatment (Studio Brain UI)
Project cards show a level badge: `[L1]` `[L2]` `[L3]` `[L4]`
Engineers can change the level at any time — the change takes effect on the
next incoming job for that project (does not retroactively cancel running jobs).

## Acceptance Tests
1. Create project with `effort_level=1` → session-prep runs, audio-qc does NOT trigger
2. Create project with `effort_level=2` → session-prep + audio-qc run, mix-planner does NOT
3. Create project with `effort_level=4` → all modules permitted
4. Change effort level mid-project → new jobs respect new level, existing jobs complete
5. `is_module_permitted("mix-planner", 2)` → False
6. `is_module_permitted("audio-qc", 2)` → True
7. `DEFAULT_EFFORT_LEVEL=2` applied when no level specified in intake payload

## Definition of Done
Engineers have explicit control over automation depth per project.
The system never runs a higher pipeline stage than the engineer authorized.
All existing approval gates still apply within permitted stages.
