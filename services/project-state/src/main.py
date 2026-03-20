"""Project State Service — canonical job state, approval queue, audit log, and worker registry."""
from fastapi import FastAPI
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
