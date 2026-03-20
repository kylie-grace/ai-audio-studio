"""Studio worker agent for a remote macOS workstation."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI

from config import load_settings
from runner import StudioWorkerRunner

_client: httpx.AsyncClient | None = None
_runner: asyncio.Task | None = None
_settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client, _runner
    _client = httpx.AsyncClient(timeout=30.0)
    worker = StudioWorkerRunner(_client, _settings)
    _runner = asyncio.create_task(worker.run_forever())
    yield
    if _runner is not None:
        _runner.cancel()
        with suppress(asyncio.CancelledError):
            await _runner
    if _client is not None:
        await _client.aclose()


app = FastAPI(title="Studio Worker", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "worker_slug": _settings.worker_slug,
        "capabilities": _settings.capabilities,
        "project_state_url": _settings.project_state_url,
    }
