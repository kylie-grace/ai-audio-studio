"""API-level tests for CRM workspace settings using a fake async pool."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
import sys
from typing import Any

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("asyncpg")

from fastapi.testclient import TestClient

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/crm-api")
sys.path.insert(0, SERVICE_ROOT)

from src import main  # type: ignore  # noqa: E402


class FakeRow(dict):
    """Match asyncpg row behavior closely enough for dict(row)."""


class FakePool:
    def __init__(self, workspace_row: FakeRow | None, style_profile_count: int) -> None:
        self.workspace_row = workspace_row
        self.style_profile_count = style_profile_count

    async def fetchrow(self, query: str, *args: Any):
        if "SELECT * FROM workspace_settings WHERE singleton = TRUE" in query:
            return self.workspace_row
        raise AssertionError(f"Unhandled fetchrow query: {query}")

    async def fetchval(self, query: str, *args: Any):
        if "SELECT COUNT(*) FROM style_profiles WHERE scope='studio'" in query:
            return self.style_profile_count
        raise AssertionError(f"Unhandled fetchval query: {query}")


@pytest.fixture()
def client():
    app = main.app
    original_get_pool = main.get_pool
    yield app, original_get_pool
    main.get_pool = original_get_pool


def test_get_workspace_settings_returns_defaults_when_row_missing(client):
    app, _ = client

    async def fake_get_pool():
        return FakePool(workspace_row=None, style_profile_count=0)

    main.get_pool = fake_get_pool

    with TestClient(app) as test_client:
        response = test_client.get("/workspace-settings")

    assert response.status_code == 200
    payload = response.json()
    assert payload["deployment_mode"] == "single_machine"
    assert payload["style_seed"]["name"]
    assert payload["worker"]["enabled"] is False


def test_get_workspace_settings_status_returns_serialized_status(client):
    app, _ = client
    now = datetime(2026, 3, 20, 20, 45, tzinfo=timezone.utc)
    workspace_row = FakeRow(
        studio_name="North Loop",
        deployment_mode="control_plane_plus_worker",
        public_base_url="https://studio-brain.local",
        https_mode="caddy_internal",
        operator_name="owner",
        shared_paths=json.dumps(
            {
                "projects": "/Volumes/StudioShare/projects",
                "deliveries": "/Volumes/StudioShare/deliveries",
                "draft_queue": "/Volumes/StudioShare/draft-queue",
                "approval_queue": "/Volumes/StudioShare/approval-queue",
                "incoming_stems": "/Volumes/StudioShare/incoming-stems",
            }
        ),
        style_seed=json.dumps(
            {
                "name": "Default Studio Tone",
                "raw_text": "Warm, direct, professional.",
                "source_paths": [],
            }
        ),
        alert_destinations=json.dumps(
            {
                "email_to": ["ops@example.test"],
                "webhook_url": "https://hooks.example.test/studio",
            }
        ),
        integrations=json.dumps(
            {
                "n8n": True,
                "gmail_readonly": True,
                "gmail_send": False,
                "instagram": False,
                "facebook": False,
            }
        ),
        worker_config=json.dumps(
            {
                "enabled": True,
                "worker_slug": "studio-mac",
                "worker_api_base_url": "http://studio-mac.local:8190",
            }
        ),
        onboarding_complete=True,
        created_at=now,
        updated_at=now,
    )

    async def fake_get_pool():
        return FakePool(workspace_row=workspace_row, style_profile_count=3)

    main.get_pool = fake_get_pool

    with TestClient(app) as test_client:
        response = test_client.get("/workspace-settings/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["onboarding_complete"] is True
    assert payload["onboarding_required"] is False
    assert payload["style_profile_count"] == 3
    assert payload["readiness_summary"]["ready_count"] >= 4
    assert any(check["slug"] == "worker-posture" and check["status"] == "ready" for check in payload["readiness_checks"])
    assert payload["settings"]["worker"]["worker_slug"] == "studio-mac"
    assert payload["settings"]["alert_destinations"]["email_to"] == ["ops@example.test"]
