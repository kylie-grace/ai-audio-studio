"""Project State Service — canonical job state, approval queue, and audit log."""
from fastapi import FastAPI
from .db import lifespan
from .routers import jobs, projects, approval, audit

app = FastAPI(title="Project State Service", lifespan=lifespan)

app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(approval.router, prefix="/approval-queue", tags=["approval"])
app.include_router(audit.router, prefix="/audit-log", tags=["audit"])


@app.get("/health")
async def health():
    return {"status": "ok"}
