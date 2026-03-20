"""OpenClaw Orchestrator — policy-enforced routing to workers."""
from fastapi import FastAPI
from .policy import check_permission, BLOCKLIST  # noqa: F401

app = FastAPI(title="OpenClaw Orchestrator")


@app.get("/health")
async def health():
    return {"status": "ok", "policy": "strict"}

# TODO Task 001: implement job routing and worker dispatch
# TODO Task 080: full policy enforcement middleware
