"""API tests for the studio-worker daw-status endpoint."""

from __future__ import annotations

import asyncio
import importlib
import os
import sys

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)
os.environ.setdefault("PROJECT_STATE_URL", "http://project-state:8080")
os.environ.setdefault("SHARED_PROJECTS_PATH", "/tmp/ai-audio-studio-projects")
os.environ.setdefault("DELIVERY_PATH", "/tmp/ai-audio-studio-deliveries")
main = importlib.import_module("main")  # type: ignore  # noqa: E402


class FakeAdapter:
    def __init__(self, connected: bool = True, raises: bool = False) -> None:
        self.connected = connected
        self.raises = raises

    async def health_check(self, payload: dict):
        if self.raises:
            raise RuntimeError("offline")
        return type("HealthResult", (), {"connected": self.connected})()


@pytest.fixture(autouse=True)
def reset_cache(monkeypatch):
    monkeypatch.setattr(main, "_daw_status_cache", {"expires_at": None, "data": None, "last_seen": {}})


@pytest.fixture()
def client():
    return TestClient(main.app)


def test_returns_all_three_daw_keys(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "list_daw_adapters",
        lambda: {"reaper": FakeAdapter(True), "protools": FakeAdapter(False), "wavelab": FakeAdapter(False)},
    )
    response = client.get("/daw-status")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload.keys()) == {"reaper", "protools", "wavelab"}


def test_connected_true_when_health_check_returns_true(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "list_daw_adapters",
        lambda: {"reaper": FakeAdapter(True), "protools": FakeAdapter(False), "wavelab": FakeAdapter(False)},
    )
    response = client.get("/daw-status")
    assert response.json()["reaper"]["connected"] is True


def test_connected_false_when_health_check_raises_or_returns_false(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "list_daw_adapters",
        lambda: {"reaper": FakeAdapter(False), "protools": FakeAdapter(raises=True), "wavelab": FakeAdapter(False)},
    )
    response = client.get("/daw-status")
    payload = response.json()
    assert payload["reaper"]["connected"] is False
    assert payload["protools"]["connected"] is False


def test_last_seen_iso8601_when_connected_and_null_when_not(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "list_daw_adapters",
        lambda: {"reaper": FakeAdapter(True), "protools": FakeAdapter(False), "wavelab": FakeAdapter(False)},
    )
    response = client.get("/daw-status")
    payload = response.json()
    assert "T" in payload["reaper"]["last_seen"]
    assert payload["protools"]["last_seen"] is None
    assert payload["wavelab"]["last_seen"] is None


def test_daw_status_cache_is_reused(client, monkeypatch):
    calls = {"count": 0}

    class CountingAdapter(FakeAdapter):
        async def health_check(self, payload: dict):
            calls["count"] += 1
            return await super().health_check(payload)

    monkeypatch.setattr(
        main,
        "list_daw_adapters",
        lambda: {"reaper": CountingAdapter(True), "protools": CountingAdapter(False), "wavelab": CountingAdapter(False)},
    )
    client.get("/daw-status")
    client.get("/daw-status")
    assert calls["count"] == 3
