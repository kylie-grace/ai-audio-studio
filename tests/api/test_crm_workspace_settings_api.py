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
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        now = datetime.now(timezone.utc)
        self.projects = [
            FakeRow(
                id="project-1",
                slug="demo-artist",
                client_name="Demo Artist",
                client_email="demo@example.test",
                service_type="mix",
                status="active",
                budget_signal="mid",
                timeline="next week",
                notes="VIP",
                created_at=now,
                updated_at=now,
            )
        ]

    async def fetchrow(self, query: str, *args: Any):
        if "SELECT * FROM workspace_settings WHERE singleton = TRUE" in query:
            return self.workspace_row
        if "SELECT id FROM style_profiles WHERE name=" in query:
            return FakeRow(id="profile-1")
        if "SELECT COUNT(*) FROM leads WHERE project_id=$1" in query:
            return None
        raise AssertionError(f"Unhandled fetchrow query: {query}")

    async def fetchval(self, query: str, *args: Any):
        if "SELECT COUNT(*) FROM style_profiles WHERE scope='studio'" in query:
            return self.style_profile_count
        if "SELECT COUNT(*) FROM leads WHERE project_id=$1" in query:
            return 2 if args[0] == "project-1" else 0
        raise AssertionError(f"Unhandled fetchval query: {query}")

    async def fetch(self, query: str, *args: Any):
        if "SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC LIMIT $1" in query:
            return self.projects[: args[0]]
        raise AssertionError(f"Unhandled fetch query: {query}")

    async def execute(self, query: str, *args: Any):
        self.executed.append((query, args))
        return "UPDATE 1"


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
    assert "module_settings" in payload


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
                "display_name": "Studio Mac",
                "platform": "macos",
                "default_daw": "protools",
                "supported_daws": ["protools", "reaper"],
                "adapter_capabilities": ["execute-soundflow", "execute-reascript"],
            }
        ),
        module_settings=json.dumps(
            {
                "lead_intake": {
                    "enabled": True,
                    "minimum_fit_score": 66,
                    "response_sla_hours": 12,
                    "auto_create_projects": True,
                }
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
    assert payload["settings"]["worker"]["default_daw"] == "protools"
    assert payload["settings"]["alert_destinations"]["email_to"] == ["ops@example.test"]
    assert payload["settings"]["module_settings"]["lead_intake"]["minimum_fit_score"] == 66


def test_style_seed_rescan_updates_existing_profile(client):
    app, _ = client
    workspace_row = FakeRow(
        studio_name="North Loop",
        deployment_mode="single_machine",
        public_base_url="https://studio-brain.local",
        https_mode="https_enabled",
        operator_name="owner",
        shared_paths=json.dumps({}),
        style_seed=json.dumps(
            {
                "name": "Default Studio Tone",
                "raw_text": "Warm and direct.",
                "source_paths": [],
            }
        ),
        alert_destinations=json.dumps({}),
        integrations=json.dumps({}),
        worker_config=json.dumps({}),
        module_settings=json.dumps({}),
        onboarding_complete=True,
        created_at=datetime(2026, 3, 20, 21, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 3, 20, 21, 0, tzinfo=timezone.utc),
    )
    fake_pool = FakePool(workspace_row=workspace_row, style_profile_count=1)

    async def fake_get_pool():
        return fake_pool

    main.get_pool = fake_get_pool

    with TestClient(app) as test_client:
        response = test_client.post("/workspace-settings/style-seed/rescan")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["style_profile_name"] == "Default Studio Tone"
    assert fake_pool.executed


def test_list_projects_returns_lead_counts(client):
    app, _ = client
    fake_pool = FakePool(workspace_row=None, style_profile_count=0)

    async def fake_get_pool():
        return fake_pool

    main.get_pool = fake_get_pool

    with TestClient(app) as test_client:
        response = test_client.get("/projects")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["slug"] == "demo-artist"
    assert payload[0]["lead_count"] == 2


def test_list_workstations_returns_persisted_worker_configuration(client):
    app, _ = client
    workspace_row = FakeRow(
        studio_name="North Loop",
        deployment_mode="control_plane_plus_worker",
        public_base_url="https://studio-brain.local",
        https_mode="caddy_internal",
        operator_name="owner",
        shared_paths=json.dumps({}),
        style_seed=json.dumps({}),
        alert_destinations=json.dumps({}),
        integrations=json.dumps({}),
        worker_config=json.dumps(
            {
                "enabled": True,
                "worker_slug": "studio-mac",
                "worker_api_base_url": "http://studio-mac.local:8190",
                "display_name": "Studio Mac",
                "platform": "macos",
                "default_daw": "protools",
                "supported_daws": ["protools", "reaper"],
                "adapter_capabilities": ["execute-soundflow", "execute-reascript"],
                "notes": "Primary mix workstation",
            }
        ),
        module_settings=json.dumps({}),
        onboarding_complete=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def fake_get_pool():
        return FakePool(workspace_row=workspace_row, style_profile_count=1)

    main.get_pool = fake_get_pool

    with TestClient(app) as test_client:
        response = test_client.get("/workstations")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["slug"] == "studio-mac"
    assert payload[0]["default_daw"] == "protools"
    assert payload[0]["adapter_capabilities"] == ["execute-soundflow", "execute-reascript"]
