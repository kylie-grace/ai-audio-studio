"""API-level tests for OpenClaw dispatch gating using a fake async pool."""

from __future__ import annotations

import importlib
import os
import sys
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
    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM orchestration_rules" in query:
            return [
                {
                    "id": "rule-1",
                    "slug": "lead-intake-rule",
                    "name": "Lead Intake Rule",
                    "trigger_module": "source",
                    "trigger_action": "new-lead",
                    "target_module": "lead_intake",
                    "required_tier": 3,
                    "approval_required": True,
                    "enabled": True,
                    "style_profile_id": None,
                    "style_profile_name": None,
                    "extracted_guidance": None,
                    "conditions": "{}",
                }
            ]
        raise AssertionError(f"Unhandled fetch query: {query}")


@pytest.fixture
def client(monkeypatch):
    fake_pool = FakePool()

    async def fake_get_pool():
        return fake_pool

    monkeypatch.setattr(main, "get_pool", fake_get_pool)
    monkeypatch.setattr(
        main,
        "load_workspace_settings",
        lambda: {"module_settings": {"lead_intake": {"enabled": False}}},
    )
    return TestClient(main.app)


def test_dispatch_with_disabled_module_returns_423(client):
    response = client.post(
        "/dispatch",
        json={
            "module": "lead_intake",
            "action": "create_job",
            "tier": 3,
            "trigger_payload": {},
            "approval_required": True,
        },
    )

    assert response.status_code == 423
    assert "detail" in response.json()


def test_dispatch_by_trigger_with_disabled_module_returns_423(client):
    response = client.post(
        "/dispatch/by-trigger",
        json={
            "trigger_module": "source",
            "trigger_action": "new-lead",
            "context": {},
        },
    )

    assert response.status_code == 423
    assert "detail" in response.json()
