# SPDX-License-Identifier: AGPL-3.0-or-later
"""Project State Service — canonical job state, approval queue, audit log, and worker registry."""
from fastapi import FastAPI
import asyncpg
from .db import lifespan
from .routers import alerts, jobs, projects, approval, audit, workers
from .middleware.audit_middleware import RequireActorMiddleware

app = FastAPI(title="Project State Service", lifespan=lifespan)

app.add_middleware(RequireActorMiddleware)

app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(approval.router, prefix="/approval-queue", tags=["approval"])
app.include_router(audit.router, prefix="/audit-log", tags=["audit"])
app.include_router(workers.router, prefix="/workers", tags=["workers"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool: asyncpg.Pool = app.state.pool
    approval_count = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE status='awaiting-approval'")
    worker_count = await pool.fetchval("SELECT COUNT(*) FROM worker_nodes WHERE status <> 'retired'")
    queued_tasks = await pool.fetchval("SELECT COUNT(*) FROM worker_tasks WHERE status IN ('queued','claimed')")
    project_count = await pool.fetchval("SELECT COUNT(*) FROM projects")
    return {
        "status": "ok",
        "project_count": project_count,
        "approvals_waiting": approval_count,
        "worker_count": worker_count,
        "active_worker_tasks": queued_tasks,
    }
