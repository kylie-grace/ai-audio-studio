"""API tests for studio-worker runtime surfaces."""

from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
from datetime import timedelta

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")


class FakeWorker:
    def __init__(self, client, settings) -> None:
        self.client = client
        self.settings = settings

    async def run_forever(self) -> None:
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            raise

    def request_drain(self) -> dict:
        return {"drain_requested": True, "current_task_id": None, "last_status": "draining"}

    def clear_drain(self) -> dict:
        return {"drain_requested": False, "current_task_id": None, "last_status": "idle"}

    def runtime_state(self) -> dict:
        return {"drain_requested": False, "current_task_id": None, "last_status": "idle"}


def load_main_module(tmp_path):
    os.environ["PROJECT_STATE_URL"] = "http://project-state:8080"
    os.environ["SHARED_PROJECTS_PATH"] = str(tmp_path / "projects")
    os.environ["DELIVERY_PATH"] = str(tmp_path / "deliveries")
    (tmp_path / "projects").mkdir()
    (tmp_path / "deliveries").mkdir()
    sys.path.insert(0, SERVICE_ROOT)
    module_name = "studio_worker_main_test"
    spec = importlib.util.spec_from_file_location(module_name, os.path.join(SERVICE_ROOT, "main.py"))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    module.StudioWorkerRunner = FakeWorker
    module._daw_status_cache = {"expires_at": None, "data": None, "last_seen": {}}
    return module


def test_daw_status_endpoint_uses_10_second_cache(tmp_path):
    module = load_main_module(tmp_path)
    calls = {"count": 0}

    async def fake_query():
        calls["count"] += 1
        return {
            "reaper": {"connected": True, "last_seen": "2026-03-22T12:00:00+00:00"},
            "protools": {"connected": False, "last_seen": None},
            "wavelab": {"connected": False, "last_seen": None},
        }

    module._query_daw_status = fake_query

    with TestClient(module.app) as client:
        first = client.get("/daw-status")
        second = client.get("/daw-status")
        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["reaper"]["connected"] is True
        assert calls["count"] == 1

        module._daw_status_cache["expires_at"] = module._now() - timedelta(seconds=1)
        third = client.get("/daw-status")
        assert third.status_code == 200
        assert calls["count"] == 2
