"""Studio worker agent for a remote macOS workstation."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

from config import assert_startup_ready, load_settings, validate_startup
from runner import StudioWorkerRunner
from tasks.listening_report import build_listening_report
from tasks.mix_plan import build_mix_plan
from tasks.execution_plan import build_execution_plan
from tasks.render_plan import build_render_plan
from tasks.session_manifest import build_session_manifest
from workstation import build_workstation_smoke_report, detect_workstation_profile, validate_workstation_setup

_client: httpx.AsyncClient | None = None
_runner: asyncio.Task | None = None
_worker: StudioWorkerRunner | None = None
_settings = load_settings()
_startup_validation = validate_startup(_settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client, _runner, _worker
    app.state.startup_validation = assert_startup_ready(_settings)
    _client = httpx.AsyncClient(timeout=30.0)
    _worker = StudioWorkerRunner(_client, _settings)
    _runner = asyncio.create_task(_worker.run_forever())
    yield
    if _worker is not None:
        _worker.request_drain()
    if _runner is not None:
        _runner.cancel()
        with suppress(asyncio.CancelledError):
            await _runner
    if _client is not None:
        await _client.aclose()


app = FastAPI(title="Studio Worker", lifespan=lifespan)


class SessionManifestBody(BaseModel):
    project_root: str
    stems_dir: str | None = None
    session_path: str | None = None
    references_dir: str | None = None


class MixPlanPreviewBody(BaseModel):
    workstation: dict = {}
    session_manifest: dict = {}
    priorities: list[str] = []
    references: list[str] = []
    client_notes: str = ""
    genre: str = "general"


class ListeningReportPreviewBody(BaseModel):
    target: str = "review-mix"
    references: list[str] = []
    issues: list[str] = []
    qc_summary: dict = {}
    reference_summary: dict = {}


class RenderPlanPreviewBody(BaseModel):
    project_slug: str = "session"
    target: str = "review"
    include_stems: bool = True
    include_instrumental: bool = True
    sample_rate: int = 48000
    bit_depth: int = 24


class ExecutionPlanPreviewBody(BaseModel):
    workstation: dict = {}
    session_manifest: dict = {}
    mix_plan: dict = {}
    render_plan: dict = {}
    listening_report: dict = {}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "worker_slug": _settings.worker_slug,
        "capabilities": _settings.capabilities,
        "project_state_url": _settings.project_state_url,
        "configured_workstation": _settings.workstation_profile,
        "startup_validation": _startup_validation,
    }


@app.get("/status")
async def status():
    workstation = detect_workstation_profile(_settings)
    runtime = _worker.runtime_state() if _worker is not None else {"drain_requested": False, "current_task_id": None, "last_status": "booting"}
    return {
        "status": "ok",
        "worker_slug": _settings.worker_slug,
        "display_name": _settings.worker_display_name,
        "platform": _settings.worker_platform,
        "capabilities": _settings.capabilities,
        "project_state_url": _settings.project_state_url,
        "shared_projects_path": _settings.shared_projects_path,
        "delivery_path": _settings.delivery_path,
        "dry_run_daw": _settings.dry_run_daw,
        "configured_workstation": _settings.workstation_profile,
        "workstation": workstation,
        "runtime": runtime,
        "startup_validation": _startup_validation,
        "daw_ready_count": sum(1 for daw in workstation["daws"] if daw["automation_ready"]),
        "daw_detected_count": sum(1 for daw in workstation["daws"] if daw["installed"]),
        "preview_surfaces": ["session-manifest", "mix-plan", "render-plan", "listening-report", "execution-plan"],
    }


@app.get("/workstation/profile")
async def workstation_profile():
    return detect_workstation_profile(_settings)


@app.get("/workstation/plugins")
async def workstation_plugins():
    profile = detect_workstation_profile(_settings)
    return profile.get("plugins", {})


@app.get("/workstation/validate")
async def workstation_validate():
    return validate_workstation_setup(_settings)


@app.post("/workstation/dry-run-smoke")
async def workstation_dry_run_smoke():
    return build_workstation_smoke_report(_settings)


@app.get("/runtime")
async def runtime_state():
    if _worker is None:
        return {"status": "booting", "worker_slug": _settings.worker_slug, "runtime": {"drain_requested": False, "current_task_id": None, "last_status": "booting"}}
    return {"status": "ok", "worker_slug": _settings.worker_slug, "runtime": _worker.runtime_state()}


@app.post("/runtime/drain")
async def runtime_drain():
    if _worker is None:
        return {"status": "booting", "worker_slug": _settings.worker_slug, "runtime": {"drain_requested": False, "current_task_id": None, "last_status": "booting"}}
    return {"status": "ok", "worker_slug": _settings.worker_slug, "runtime": _worker.request_drain()}


@app.post("/runtime/resume")
async def runtime_resume():
    if _worker is None:
        return {"status": "booting", "worker_slug": _settings.worker_slug, "runtime": {"drain_requested": False, "current_task_id": None, "last_status": "booting"}}
    return {"status": "ok", "worker_slug": _settings.worker_slug, "runtime": _worker.clear_drain()}


@app.post("/session-manifest/preview")
async def session_manifest_preview(body: SessionManifestBody):
    return build_session_manifest(body.model_dump())


@app.post("/mix-plan/preview")
async def mix_plan_preview(body: MixPlanPreviewBody):
    return build_mix_plan(body.model_dump())


@app.post("/listening-report/preview")
async def listening_report_preview(body: ListeningReportPreviewBody):
    return build_listening_report(body.model_dump())


@app.post("/render-plan/preview")
async def render_plan_preview(body: RenderPlanPreviewBody):
    return build_render_plan(body.model_dump())


@app.post("/execution-plan/preview")
async def execution_plan_preview(body: ExecutionPlanPreviewBody):
    return build_execution_plan(body.model_dump())
