"""API-level tests for the OpenClaw status surface using a fake async pool."""

from __future__ import annotations

import os
import sys
import importlib
from typing import Any

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("asyncpg")

from fastapi.testclient import TestClient

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/openclaw-orchestrator")
sys.path.insert(0, SERVICE_ROOT)
for module_name in [name for name in list(sys.modules) if name == "src" or name.startswith("src.")]:
    sys.modules.pop(module_name, None)
main = importlib.import_module("src.main")  # type: ignore  # noqa: E402


class FakePool:
    async def fetchval(self, query: str, *args: Any) -> int:
        if "SELECT COUNT(*) FROM orchestration_rules WHERE enabled = TRUE" in query:
            return 7
        if "SELECT COUNT(*) FROM orchestration_rules" in query:
            return 12
        raise AssertionError(f"Unhandled fetchval query: {query}")


def test_status_returns_rule_and_playbook_inventory(monkeypatch):
    fake_pool = FakePool()

    async def fake_get_pool():
        return fake_pool

    monkeypatch.setattr(main, "get_pool", fake_get_pool)
    client = TestClient(main.app)

    response = client.get("/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["enabled_rules"] == 7
    assert payload["total_rules"] == 12
    assert payload["starter_pack_count"] >= 1
    assert payload["playbook_count"] >= 1
    assert "policy" in payload
