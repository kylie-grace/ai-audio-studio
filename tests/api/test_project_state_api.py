"""API-level tests for the project-state service using a fake async pool."""

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
SERVICE_ROOT = os.path.join(ROOT, "services/project-state")
sys.path.insert(0, SERVICE_ROOT)

from src import main  # type: ignore  # noqa: E402
from src.routers import alerts, approval, audit, jobs, projects, workers  # type: ignore  # noqa: E402


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
            ),
            "job-revision": FakeRow(
                id="job-revision",
                project_id="project-1",
                module="revision-parser",
                action="parse-revisions",
                trigger_type="operator",
                trigger_payload=json.dumps(
                    {
                        "daw": "protools",
                        "session_path": "/Volumes/StudioShare/projects/demo/session/demo.ptx",
                        "worker_slug": "studio-mac",
                    }
                ),
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
            ),
        }
        self.revisions: dict[str, FakeRow] = {
            "revision-1": FakeRow(
                id="revision-1",
                project_id="project-1",
                job_id="job-revision",
                raw_notes="Vocal up 2 dB",
                parsed_changes=[],
                soundflow_script="/Volumes/StudioShare/projects/demo/session/protools_revision_script.txt",
                reascript_path=None,
                status="parsed",
                approved_by=None,
                approved_at=None,
                created_at=now,
            )
        }
        self.worker_tasks: list[FakeRow] = []
        self.audit_log: list[FakeRow] = []
        self.worker_nodes: list[FakeRow] = [
            FakeRow(
                id="worker-1",
                slug="fresh-worker",
                display_name="Fresh Worker",
                status="idle",
                last_seen_at=now,
            ),
            FakeRow(
                id="worker-2",
                slug="stale-worker",
                display_name="Stale Worker",
                status="idle",
                last_seen_at=now.replace(minute=max(now.minute - 10, 0)),
            ),
        ]

    async def fetchval(self, query: str, *args: Any) -> int:
        if "SELECT COUNT(*) FROM projects" in query and args:
            value = args[0]
            prefix = value.rstrip("%")
            return sum(1 for row in self.projects.values() if str(row["slug"]).startswith(prefix))
        if "SELECT COUNT(*) FROM projects" in query:
            return len(self.projects)
        if "SELECT COUNT(*) FROM jobs WHERE status = 'awaiting-approval'" in query:
            return sum(1 for row in self.jobs.values() if row["status"] == "awaiting-approval")
        if "SELECT COUNT(*) FROM jobs WHERE status='awaiting-approval'" in query:
            return sum(1 for row in self.jobs.values() if row["status"] == "awaiting-approval")
        if "SELECT COUNT(*) FROM worker_tasks WHERE status = 'failed'" in query:
            return sum(1 for row in self.worker_tasks if row.get("status") == "failed")
        if "SELECT COUNT(*) FROM worker_nodes" in query:
            return len(self.worker_nodes)
        if "SELECT COUNT(*) FROM worker_tasks WHERE status = 'claimed'" in query and "lease_expires_at" not in query:
            return sum(1 for row in self.worker_tasks if row.get("status") == "claimed")
        if "SELECT COUNT(*) FROM worker_tasks WHERE status IN ('queued','claimed')" in query:
            return sum(1 for row in self.worker_tasks if row.get("status") in {"queued", "claimed"})
        if "SELECT COUNT(*) FROM worker_tasks WHERE status = 'claimed' AND lease_expires_at IS NOT NULL" in query:
            cutoff = args[0]
            return sum(
                1
                for row in self.worker_tasks
                if row.get("status") == "claimed"
                and row.get("lease_expires_at") is not None
                and row.get("lease_expires_at") < cutoff
            )
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
        if "SELECT * FROM revisions WHERE job_id=$1" in query:
            return next((row for row in self.revisions.values() if row["job_id"] == args[0]), None)
        if "SELECT * FROM worker_tasks WHERE id=$1" in query:
            return next((row for row in self.worker_tasks if row.get("id") == args[0]), None)
        if "INSERT INTO audit_log" in query and "RETURNING id, created_at" in query:
            entry = FakeRow(id=len(self.audit_log) + 1, created_at=now)
            self.audit_log.append(entry)
            return entry
        raise AssertionError(f"Unhandled fetchrow query: {query}")

    async def fetch(self, query: str, *args: Any) -> list[FakeRow]:
        if "SELECT * FROM jobs WHERE status = 'awaiting-approval'" in query:
            return [row for row in self.jobs.values() if row["status"] == "awaiting-approval"]
        if "SELECT slug, display_name, status, last_seen_at FROM worker_nodes" in query:
            return list(self.worker_nodes)
        if "SELECT * FROM worker_nodes ORDER BY slug ASC" in query:
            return list(self.worker_nodes)
        if "SELECT * FROM worker_tasks WHERE status='failed'" in query:
            return [row for row in self.worker_tasks if row.get("status") == "failed"]
        if "SELECT * FROM worker_tasks WHERE status='claimed'" in query:
            return [row for row in self.worker_tasks if row.get("status") == "claimed"]
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
        if "UPDATE revisions" in query and "SET status='approved'" in query:
            revision = self.revisions[args[2]]
            revision["status"] = "approved"
            revision["approved_by"] = args[0]
            revision["approved_at"] = args[1]
            return "UPDATE 1"
        if "UPDATE jobs SET status='rejected'" in query:
            job = self.jobs[args[1]]
            job["status"] = "rejected"
            job["error_message"] = args[0]
            return "UPDATE 1"
        if "INSERT INTO worker_tasks" in query:
            self.worker_tasks.append(
                FakeRow(
                    id=f"task-{len(self.worker_tasks) + 1}",
                    job_id=args[0],
                    project_id=args[1],
                    worker_slug=args[2],
                    task_type=args[3],
                    required_capability=args[4],
                    payload=args[5],
                    status="queued",
                    claimed_by=None,
                    claimed_at=None,
                    lease_expires_at=None,
                    completed_at=None,
                    error_message=None,
                    result={},
                )
            )
            return "INSERT 0 1"
        if "UPDATE worker_tasks" in query and "SET status='queued'" in query and "claimed_by=NULL" in query:
            task = next(row for row in self.worker_tasks if row["id"] == args[0])
            task["status"] = "queued"
            task["claimed_by"] = None
            task["claimed_at"] = None
            task["lease_expires_at"] = None
            if "completed_at=NULL" in query:
                task["completed_at"] = None
                task["error_message"] = None
            return "UPDATE 1"
        if "UPDATE worker_nodes SET status='idle'" in query:
            worker = next((row for row in self.worker_nodes if row["slug"] == args[1]), None)
            if worker:
                worker["status"] = "idle"
                worker["last_seen_at"] = args[0]
            return "UPDATE 1"
        if "UPDATE jobs" in query and "SET status='pending'" in query:
            job = self.jobs[args[0]]
            job["status"] = "pending"
            job["error_message"] = None
            job["retry_count"] += 1
            return "UPDATE 1"
        if "UPDATE revisions" in query and "SET status='approved'" in query:
            revision = self.revisions[args[0]]
            revision["status"] = "approved"
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
    workers.get_pool = get_pool
    alerts.get_pool = get_pool
    main.app.state.pool = pool


def test_status_returns_runtime_summary_counts():
    pool = FakePool()
    pool.projects["project-1"] = FakeRow(id="project-1", slug="artist-name")
    pool.worker_tasks.append(FakeRow(id="task-1", status="queued"))
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.get("/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["project_count"] == 1
    assert payload["approvals_waiting"] == 2
    assert payload["worker_count"] == 2
    assert payload["active_worker_tasks"] == 1


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


def test_approval_requires_operator_token_when_configured():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)
    original = approval.OPERATOR_API_TOKEN
    approval.OPERATOR_API_TOKEN = "secret-token"
    try:
        response = client.post(
            "/approval-queue/job-awaiting/approve",
            headers={"X-Actor": "owner"},
        )
    finally:
        approval.OPERATOR_API_TOKEN = original

    assert response.status_code == 403
    assert "operator token" in response.json()["detail"]


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


def test_revision_approval_queues_daw_execution_task():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/approval-queue/job-revision/approve",
        headers={"X-Actor": "owner"},
    )
    assert response.status_code == 200
    assert pool.revisions["revision-1"]["status"] == "approved"
    assert len(pool.worker_tasks) == 1
    assert pool.worker_tasks[0]["task_type"] == "execute-soundflow"


def test_worker_register_requires_worker_token_when_configured():
    pool = FakePool()
    _install_fake_pool(pool)
    client = TestClient(main.app)
    original = workers.WORKER_API_TOKEN
    workers.WORKER_API_TOKEN = "worker-secret"
    try:
        response = client.post(
            "/workers/register",
            json={"slug": "studio-mac", "display_name": "Studio Mac", "capabilities": []},
        )
    finally:
        workers.WORKER_API_TOKEN = original

    assert response.status_code == 403
    assert "worker token" in response.json()["detail"]


def test_release_worker_task_requires_operator_token_when_configured():
    pool = FakePool()
    pool.worker_tasks.append(FakeRow(id="task-claimed", status="claimed", claimed_by="fresh-worker", job_id=None, project_id=None, payload={}))
    _install_fake_pool(pool)
    client = TestClient(main.app)
    original = workers.OPERATOR_API_TOKEN
    workers.OPERATOR_API_TOKEN = "operator-secret"
    try:
        response = client.post(
            "/workers/tasks/task-claimed/release",
            headers={"X-Actor": "owner"},
        )
    finally:
        workers.OPERATOR_API_TOKEN = original

    assert response.status_code == 403
    assert "operator token" in response.json()["detail"]


def test_release_claimed_worker_task_resets_task_and_worker():
    pool = FakePool()
    claimed_at = datetime.now(timezone.utc)
    pool.worker_tasks.append(
        FakeRow(
            id="task-claimed",
            status="claimed",
            claimed_by="fresh-worker",
            claimed_at=claimed_at,
            lease_expires_at=claimed_at,
            job_id=None,
            project_id=None,
            payload={},
        )
    )
    pool.worker_nodes[0]["status"] = "busy"
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/workers/tasks/task-claimed/release",
        headers={"X-Actor": "owner"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    assert pool.worker_tasks[0]["claimed_by"] is None
    assert pool.worker_nodes[0]["status"] == "idle"


def test_requeue_failed_worker_task_resets_task_job_and_revision():
    pool = FakePool()
    pool.worker_tasks.append(
        FakeRow(
            id="task-failed",
            status="failed",
            claimed_by="fresh-worker",
            completed_at=datetime.now(timezone.utc),
            error_message="boom",
            job_id="job-revision",
            project_id="project-1",
            payload=json.dumps({"revision_id": "revision-1"}),
        )
    )
    pool.jobs["job-revision"]["status"] = "failed"
    pool.jobs["job-revision"]["error_message"] = "boom"
    pool.revisions["revision-1"]["status"] = "failed"
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.post(
        "/workers/tasks/task-failed/requeue",
        headers={"X-Actor": "owner"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    assert pool.worker_tasks[0]["error_message"] is None
    assert pool.jobs["job-revision"]["status"] == "pending"
    assert pool.jobs["job-revision"]["retry_count"] == 1
    assert pool.revisions["revision-1"]["status"] == "approved"


def test_alert_summary_reports_waiting_jobs_and_stale_workers():
    pool = FakePool()
    now = datetime.now(timezone.utc)
    pool.worker_tasks.append(FakeRow(id="failed-task", status="failed"))
    pool.worker_tasks.append(FakeRow(id="claimed-task", status="claimed", lease_expires_at=now))
    pool.worker_tasks.append(FakeRow(id="expired-task", status="claimed", lease_expires_at=now.replace(year=now.year - 1)))
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.get("/alerts/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["approvals_waiting"] == 2
    assert payload["failed_worker_tasks"] == 1
    assert payload["claimed_worker_tasks"] == 2
    assert payload["expired_worker_leases"] == 1
    assert len(payload["stale_workers"]) == 1
    assert {alert["slug"] for alert in payload["active_alerts"]} == {
        "worker-failure",
        "stale-worker",
        "expired-worker-lease",
    }


def test_runtime_recovery_snapshot_groups_stale_failed_and_claimed_work():
    pool = FakePool()
    now = datetime.now(timezone.utc)
    pool.worker_tasks.append(
        FakeRow(
            id="task-failed",
            status="failed",
            created_at=now,
            completed_at=now,
            payload={},
            result={},
            error_message="boom",
        )
    )
    pool.worker_tasks.append(
        FakeRow(
            id="task-claimed",
            status="claimed",
            created_at=now,
            claimed_by="fresh-worker",
            lease_expires_at=now,
            payload={},
            result={},
        )
    )
    pool.worker_tasks.append(
        FakeRow(
            id="task-expired",
            status="claimed",
            created_at=now,
            claimed_by="fresh-worker",
            lease_expires_at=now.replace(year=now.year - 1),
            payload={},
            result={},
        )
    )
    _install_fake_pool(pool)
    client = TestClient(main.app)

    response = client.get("/workers/runtime/recovery")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["failed_task_count"] == 1
    assert payload["summary"]["claimed_task_count"] == 2
    assert payload["summary"]["expired_claim_count"] == 1
    assert payload["summary"]["stale_worker_count"] == 1
    assert payload["failed_tasks"][0]["id"] == "task-failed"
    assert any(task["lease_state"] == "expired" for task in payload["claimed_tasks"])


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
