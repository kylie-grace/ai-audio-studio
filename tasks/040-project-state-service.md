# Task 040 — Project State Service

## Purpose and Scope
Build the canonical job state service. All workers write job state here.
All approval decisions flow through here. This is the safety chokepoint:
the FSM enforces that approval-required jobs cannot complete without human
approval. This service also owns the append-only audit log.

## Dependencies
- Task 001 complete (Postgres running, schema applied)

## Files to Create or Modify
- `services/project-state/src/main.py` — FastAPI app
- `services/project-state/src/db.py` — asyncpg connection pool
- `services/project-state/src/models.py` — Pydantic models
- `services/project-state/src/fsm.py` — Job status finite state machine
- `services/project-state/src/routers/jobs.py`
- `services/project-state/src/routers/projects.py`
- `services/project-state/src/routers/approval.py`
- `services/project-state/src/routers/audit.py`
- `services/project-state/src/middleware/audit_middleware.py`
- `services/project-state/requirements.txt`
- `services/project-state/Dockerfile`
- `tests/unit/test_fsm.py`
- `tests/approval-boundary/test_approval_gates.py`

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{"status":"ok"}` |
| POST | `/jobs` | Create job, returns job envelope |
| GET | `/jobs/{job_id}` | Full job envelope |
| PUT | `/jobs/{job_id}/status` | Transition status (FSM enforced) |
| POST | `/jobs/{job_id}/artifacts` | Attach artifact reference |
| GET | `/jobs` | Filter by module, status, project_id |
| GET | `/approval-queue` | All jobs in `awaiting-approval` |
| POST | `/approval-queue/{job_id}/approve` | Human approval (records actor + timestamp) |
| POST | `/approval-queue/{job_id}/reject` | Human rejection with required reason |
| POST | `/projects` | Create project |
| GET | `/projects/{project_id}` | Full project record |
| PUT | `/projects/{project_id}/status` | Update project status |
| GET | `/audit-log` | Paginated, filterable audit entries |
| POST | `/audit-log` | Append entry (internal use only, no external auth) |

## Job Status FSM (fsm.py) — The Critical Safety Gate

```python
ALLOWED_TRANSITIONS = {
    "pending":           {"in-progress", "failed"},
    "in-progress":       {"awaiting-approval", "complete", "failed"},
    "awaiting-approval": {"approved", "rejected"},
    "approved":          {"in-progress", "complete"},
    "rejected":          set(),   # Terminal
    "complete":          set(),   # Terminal
    "failed":            {"pending"},  # Retry
}

def validate_transition(current: str, next_status: str) -> None:
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if next_status not in allowed:
        raise ValueError(
            f"Illegal transition: {current} → {next_status}. Allowed: {allowed}"
        )
```

Additional enforcement: jobs with `approval_required=True` cannot move from
`in-progress` directly to `complete`. Must pass through `awaiting-approval → approved`.

## Audit Middleware (audit_middleware.py)
Every `POST`, `PUT`, `PATCH` request auto-appends an audit entry:
- `actor`: from `X-Actor` request header (required header, 400 if missing)
- `action`: derived from method + path
- `tier`: derived from action type (reads=1, drafts=2, queues=3, executes=4)
- `payload`: request body (sensitive fields masked if needed)

## Acceptance Tests (tests/approval-boundary/test_approval_gates.py)
1. `in-progress` → `complete` blocked if `approval_required=True` → raises 409
2. `in-progress` → `awaiting-approval` → `approved` → `complete` succeeds
3. `rejected` → any status → blocked (terminal state)
4. `complete` → any status → blocked (terminal state)
5. `failed` → `pending` → allowed (retry path)
6. Approve without `X-Actor` header → HTTP 400
7. GET `/audit-log` for a job shows all state transitions in order
8. POST to `/audit-log` from non-internal caller → HTTP 403

## Definition of Done
All workers use this service exclusively for job state. No worker has its
own state store. FSM enforced on every transition. Audit trail complete
and verifiable. Approval queue populated and queryable.
