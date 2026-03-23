import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from runner import StudioWorkerRunner  # type: ignore  # noqa: E402


class DummyClient:
    def __init__(self, task_statuses=None):
        self.task_statuses = list(task_statuses or [])

    async def post(self, *args, **kwargs):
        return None

    async def get(self, *args, **kwargs):
        if not self.task_statuses:
            raise AssertionError("unexpected get call")
        status = self.task_statuses.pop(0)
        return SimpleNamespace(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {"id": "task-1", "status": status},
        )


def build_settings():
    return SimpleNamespace(
        worker_slug="demo-worker",
        worker_display_name="Demo Worker",
        worker_platform="macos",
        worker_api_base_url=None,
        project_state_url="http://project-state:8080",
        capabilities=["session-prep"],
        shared_projects_path="/tmp/projects",
        delivery_path="/tmp/deliveries",
        dry_run_daw=True,
        reaper_binary_path=None,
        protools_app_path=None,
        soundflow_cli_path=None,
        wavelab_app_path=None,
        workstation_profile={"display_name": "Demo Worker"},
        worker_api_token=None,
        poll_interval_seconds=0.01,
    )


def test_runtime_state_tracks_drain_and_current_task():
    runner = StudioWorkerRunner(DummyClient(), build_settings())

    before = runner.runtime_state()
    after_drain = runner.request_drain()
    after_resume = runner.clear_drain()

    assert before["drain_requested"] is False
    assert after_drain["drain_requested"] is True
    assert after_resume["drain_requested"] is False


def test_run_forever_does_not_claim_tasks_while_draining(monkeypatch):
    runner = StudioWorkerRunner(DummyClient(), build_settings())
    events: list[str] = []

    async def fake_register_worker():
        events.append("register")

    async def fake_heartbeat(status: str = "idle"):
        events.append(f"heartbeat:{status}")
        if status == "draining":
            raise asyncio.CancelledError

    async def fake_claim_next_task():
        events.append("claim")
        return None

    monkeypatch.setattr(runner, "register_worker", fake_register_worker)
    monkeypatch.setattr(runner, "heartbeat", fake_heartbeat)
    monkeypatch.setattr(runner, "claim_next_task", fake_claim_next_task)
    runner.request_drain()

    try:
        asyncio.run(runner.run_forever())
    except asyncio.CancelledError:
        pass

    assert "register" in events
    assert "heartbeat:draining" in events
    assert "claim" not in events


def test_wait_for_confirmation_returns_when_task_is_approved():
    runner = StudioWorkerRunner(DummyClient(["awaiting-approval", "approved"]), build_settings())

    approved_task = asyncio.run(runner.wait_for_confirmation("task-1"))

    assert approved_task is not None
    assert approved_task["status"] == "approved"


def test_wait_for_confirmation_stops_when_task_is_cancelled():
    runner = StudioWorkerRunner(DummyClient(["awaiting-approval", "cancelled"]), build_settings())

    approved_task = asyncio.run(runner.wait_for_confirmation("task-1"))

    assert approved_task is None
