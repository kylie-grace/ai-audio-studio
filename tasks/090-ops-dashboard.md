# Task 090 — Operations Dashboard

## Purpose and Scope
Build a lightweight, always-visible operations dashboard that shows the real-time
state of all services, the approval queue, active jobs, and recent audit events.
Should be runnable as a standalone Docker container alongside the main stack —
engineers glance at it to know what the system is doing without digging into logs.

## Dependencies
- Task 001 complete (stack running)
- Task 040 complete (project-state API available)

## Design Options

### Option A: Terminal dashboard (recommended for v1)
A `textual`-based Python TUI that `docker compose up` makes available in a terminal.
Zero setup — runs in the same stack. Real-time polling via project-state API.

```
docker compose -f infra/docker-compose.yml run --rm dashboard
```

### Option B: Web dashboard (extend Studio Brain UI)
Add a `/dashboard` route to `apps/studio-brain-ui` with live-polling panels.
Lower friction (browser), higher build cost.

**Recommendation:** Build Option A for v1 (fast, reliable, no JS build step).
Option B can be the approval queue UI that Task 040 describes.

## Files to Create or Modify

### Option A (Terminal TUI)
- `apps/dashboard/main.py` — textual TUI app
- `apps/dashboard/panels/services.py` — service health panel (poll each `/health`)
- `apps/dashboard/panels/queue.py` — approval queue panel (poll `/approval-queue`)
- `apps/dashboard/panels/jobs.py` — recent jobs panel (poll `/jobs?limit=20`)
- `apps/dashboard/panels/audit.py` — recent audit events (poll `/audit-log?limit=20`)
- `apps/dashboard/requirements.txt` — textual, httpx, asyncio
- `apps/dashboard/Dockerfile`
- `infra/docker-compose.yml` — add dashboard service (profile: tools)

## Dashboard Layout (TUI)

```
┌─ AI Audio Studio ─────────────────────────────────── 2026-03-20 14:32 ─┐
│                                                                          │
│  SERVICES                          APPROVAL QUEUE (3 pending)           │
│  ─────────                         ─────────────────────────            │
│  ● project-state  healthy           [lead] Artist X draft reply         │
│  ● crm-api        healthy           [inbox] Scheduling reply - J. Smith  │
│  ● openclaw       healthy           [social] IG caption - Project Alpha  │
│  ● audio-qc       healthy                                               │
│  ● ollama         healthy          RECENT JOBS                          │
│  ● n8n            healthy          ───────────                          │
│  ✗ lead-intake    unhealthy        ✓ session-prep  artist-y  complete   │
│                                    ● audio-qc      artist-y  in-progress│
│  AUDIT LOG (last 5)                ○ lead-intake   artist-z  pending    │
│  ──────────────                                                         │
│  14:31  human:owner  approve  job:abc123                                │
│  14:28  worker:lead-intake  create  job:def456                          │
│  14:15  system  status:complete  job:ghi789                             │
└──────────────────────────────────────────────────────────────────────────┘
[r] refresh  [q] quit  [a] open approval queue  [j] job detail
```

## docker-compose addition

```yaml
  dashboard:
    build:
      context: ../apps/dashboard
      dockerfile: Dockerfile
    environment:
      PROJECT_STATE_URL: http://project-state:8080
      CRM_API_URL: http://crm-api:8090
      OPENCLAW_URL: http://openclaw:8100
      REFRESH_INTERVAL_S: "5"
    networks: [studio-net]
    profiles: [tools]   # opt-in: docker compose --profile tools up dashboard
    depends_on:
      - project-state
    stdin_open: true
    tty: true
```

## Acceptance Tests
1. `docker compose --profile tools run --rm dashboard` launches TUI
2. Service health panel shows correct status within 5 seconds
3. Approval queue count matches `GET /approval-queue` response
4. Unhealthy service shows ✗ indicator within one refresh cycle
5. Keyboard shortcuts work: `q` exits, `r` force-refreshes
6. Dashboard handles project-state being temporarily down gracefully (shows error, does not crash)

## Definition of Done
Engineers can see at a glance: which services are up, what's in the queue,
and what jobs ran recently — without touching logs or APIs directly.
