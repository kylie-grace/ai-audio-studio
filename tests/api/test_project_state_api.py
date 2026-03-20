"""API-level tests for the project-state service using a fake async pool."""

from __future__ import annotations

from datetime import datetime, timezone
import os
import sys
from typing import Any

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("asyncpg")

from fastapi.testclient import TestClient

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/project-state")
sys.path.insert(0, SERVICE_ROOT)

from src import main  # type: ignore  # noqa: E402
from src.routers import approval, audit, jobs, projects  # type: ignore  # noqa: E402


class FakeRow(dict):
    """Match asyncpg row behavior closely enough for dict(row)."""


class FakePool:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.projects: dict[str, FakeRow] = {}
        self.jobs: dict[str, FakeRow] = {
            "job-awaiting": FakeRow(
                id="job-awaiting",
                project_id="project-1",
                module="lead-intake",
                action="draft",
                trigger_type="webhook",
                trigger_payload=None,
                status="awaiting-approval",
                priority="normal",
                approval_required=True,
                approved_by=None,
                approved_at=None,
                artifacts=[],
                error_message=None,
                retry_count=0,
                max_retries=3,
                requested_by="system",
                created_at=now,
                updated_at=now,
            )
        }
        self.audit_log: list[FakeRow] = []

    async def fetchval(self, query: str, value: str) -> int:
        if "SELECT COUNT(*) FROM projects" in query:
            prefix = value.rstrip("%")
            return sum(1 for row in self.projects.values() if str(row["slug"]).startswith(prefix))
        raise AssertionError(f"Unhandled fetchval query: {query}")

    async def fetchrow(self, query: str, *args: Any) -> FakeRow | None:
        now = datetime.now(timezone.utc)
        if "INSERT INTO projects" in query:
            project_id = f"project-{len(self.projects) + 1}"
            row = FakeRow(
                id=project_id,
                slug=args[0],
                client_name=args[1],
                client_email=args[2],
                service_type=args[3],
                budget_signal=args[4],
                timeline=args[5],
                notes=args[6],
                effort_level=2,
                status="lead",
                created_at=now,
                updated_at=now,
            )
            self.projects[project_id] = row
            return row
        if "SELECT * FROM projects WHERE id=$1 OR slug=$1" in query:
            key = args[0]
            return self.projects.get(key) or next(
                (row for row in self.projects.values() if row["slug"] == key),
                None,
            )
        if "SELECT * FROM jobs WHERE id = $1" in query or "SELECT * FROM jobs WHERE id=$1" in query:
            return self.jobs.get(args[0])
        if "INSERT INTO audit_log" in query and "RETURNING id, created_at" in query:
            entry = FakeRow(id=len(self.audit_log) + 1, created_at=now)
            self.audit_log.append(entry)
            return entry
        raise AssertionError(f"Unhandled fetchrow query: {query}")

    async def fetch(self, query: str, *args: Any) -> list[FakeRow]:
        if "SELECT * FROM jobs WHERE status = 'awaiting-approval'" in query:
            return [row for row in self.jobs.values() if row["status"] == "awaiting-approval"]
        if "SELECT * FROM audit_log" in query:
            return list(self.audit_log)
        raise AssertionError(f"Unhandled fetch query: {query}")

    async def execute(self, query: str, *args: Any) -> str:
        if "UPDATE projects SET status=$1" in query:
            project = self.projects.get(args[1])
            if not project:
                return "UPDATE 0"
            project["status"] = args[0]
            return "UPDATE 1"
        if "UPDATE jobs SET status='approved'" in query:
            job = self.jobs[args[2]]
            job["status"] = "approved"
            job["approved_by"] = args[0]
            job["approved_at"] = args[1]
            return "UPDATE 1"
        if "UPDATE jobs SET status='rejected'" in query:
            job = self.jobs[args[1]]
            job["status"] = "rejected"
            job["error_message"] = args[0]
            return "UPDATE 1"
        if "INSERT INTO audit_log" in query:
            self.audit_log.append(
                FakeRow(
                    job_id=args[0] if args else None,
                    project_id=args[1] if len(args) > 2 else None,
                    actor=args[2] if len(args) > 2 else args[1],
                    action="audit",
                    tier=3,
                    payload=args[3] if len(args) > 3 else None,
                    created_at=datetime.now(timezone.utc),
                )
            )
            return "INSERT 0 1"
        raise AssertionError(f"Unhandled execute query: {query}")


def _install_fake_pool(pool: FakePool) -> None:
    async def get_pool() -> FakePool:
        return pool

    projects.get_pool = get_pool
    approval.get_pool = get_pool
    audit.get_pool = get_pool
    jobs.get_pool = get_pool


def test_mutating_requests_require_actor_header():
    client = TestClient(main.app)
    response = client.post("/projects/", json={"client_name": "Artist", "service_type": "mix"})
    assert response.status_code == 400
    assert "X-Actor header" in response.json()["detail"]


def test_create_and_fetch_project_by_slug():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)

    create = client.post(
        "/projects/",
        headers={"X-Actor": "owner"},
        json={"client_name": "Artist Name", "service_type": "mix"},
    )
    assert create.status_code == 201
    created = create.json()
    assert created["slug"] == "artist-name"

    fetch = client.get(f"/projects/{created['slug']}")
    assert fetch.status_code == 200
    assert fetch.json()["client_name"] == "Artist Name"


def test_approval_requires_authorized_actor():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/approval-queue/job-awaiting/approve",
        headers={"X-Actor": "guest"},
    )
    assert response.status_code == 403
    assert "authorized actors list" in response.json()["detail"]


def test_approval_succeeds_for_authorized_actor_and_updates_job():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/approval-queue/job-awaiting/approve",
        headers={"X-Actor": "owner"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert pool.jobs["job-awaiting"]["approved_by"] == "owner"


def test_direct_audit_write_requires_internal_caller():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/audit-log/",
        headers={"X-Actor": "owner"},
        json={"actor": "owner", "action": "manual", "tier": 3},
    )
    assert response.status_code == 403


def test_internal_audit_write_is_allowed():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/audit-log/",
        headers={"X-Internal-Caller": "openclaw"},
        json={"actor": "system:openclaw", "action": "manual", "tier": 3},
    )
    assert response.status_code == 201
    assert response.json()["id"] == 1
