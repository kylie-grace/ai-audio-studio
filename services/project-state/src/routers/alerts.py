"""Operational alert summary endpoints for the operator dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from ..db import get_pool

router = APIRouter()


@router.get("/summary")
async def alert_summary():
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    approvals_waiting = await pool.fetchval(
        "SELECT COUNT(*) FROM jobs WHERE status = 'awaiting-approval'"
    )
    failed_worker_tasks = await pool.fetchval(
        "SELECT COUNT(*) FROM worker_tasks WHERE status = 'failed'"
    )
    claimed_worker_tasks = await pool.fetchval(
        "SELECT COUNT(*) FROM worker_tasks WHERE status = 'claimed'"
    )
    expired_leases = await pool.fetchval(
        "SELECT COUNT(*) FROM worker_tasks WHERE status = 'claimed' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1",
        now,
    )
    workers = await pool.fetch(
        "SELECT slug, display_name, status, last_seen_at, capabilities FROM worker_nodes WHERE status <> 'retired' ORDER BY slug ASC"
    )

    stale_cutoff = now - timedelta(minutes=5)
    stale_workers = [
        {
            "slug": row["slug"],
            "display_name": row["display_name"],
            "status": row["status"],
            "last_seen_at": row["last_seen_at"].isoformat() if row["last_seen_at"] else None,
        }
        for row in workers
        if row["last_seen_at"] is None or row["last_seen_at"] < stale_cutoff
    ]
    worker_index = {row["slug"]: row for row in workers}
    capable_workers: dict[str, list[str]] = {}
    for row in workers:
        capabilities = row["capabilities"]
        if isinstance(capabilities, str):
            try:
                import json

                capabilities = json.loads(capabilities)
            except Exception:  # pragma: no cover - defensive decode
                capabilities = []
        for capability in capabilities or []:
            capable_workers.setdefault(str(capability), []).append(row["slug"])

    queued_tasks = await pool.fetch(
        """SELECT id, worker_slug, task_type, required_capability, created_at
           FROM worker_tasks
           WHERE status='queued'
           ORDER BY created_at ASC""",
    )
    queue_cutoff = now - timedelta(minutes=5)
    unserviceable_tasks = []
    pinned_missing_worker_tasks = []
    for row in queued_tasks:
        if row["created_at"] >= queue_cutoff:
            continue
        if row["worker_slug"]:
            worker = worker_index.get(row["worker_slug"])
            if worker is None or worker["last_seen_at"] is None or worker["last_seen_at"] < stale_cutoff:
                pinned_missing_worker_tasks.append(
                    {
                        "task_id": str(row["id"]),
                        "worker_slug": row["worker_slug"],
                        "task_type": row["task_type"],
                    }
                )
            continue
        required_capability = row["required_capability"]
        if required_capability and not capable_workers.get(required_capability):
            unserviceable_tasks.append(
                {
                    "task_id": str(row["id"]),
                    "required_capability": required_capability,
                    "task_type": row["task_type"],
                }
            )

    active_alerts: list[dict] = []
    if approvals_waiting >= 5:
        active_alerts.append(
            {
                "slug": "approval-backlog",
                "severity": "warn",
                "detail": f"{approvals_waiting} jobs are waiting for approval.",
            }
        )
    if failed_worker_tasks > 0:
        active_alerts.append(
            {
                "slug": "worker-failure",
                "severity": "bad",
                "detail": f"{failed_worker_tasks} worker task(s) are currently failed.",
            }
        )
    if stale_workers:
        active_alerts.append(
            {
                "slug": "stale-worker",
                "severity": "warn",
                "detail": f"{len(stale_workers)} worker node(s) have stale heartbeats.",
            }
        )
    if expired_leases > 0:
        active_alerts.append(
            {
                "slug": "expired-worker-lease",
                "severity": "bad",
                "detail": f"{expired_leases} claimed worker task(s) have expired leases and may need release or requeue.",
            }
        )
    if unserviceable_tasks:
        active_alerts.append(
            {
                "slug": "unserviceable-worker-task",
                "severity": "bad",
                "detail": f"{len(unserviceable_tasks)} queued worker task(s) have no registered worker with the required capability.",
            }
        )
    if pinned_missing_worker_tasks:
        active_alerts.append(
            {
                "slug": "missing-target-worker",
                "severity": "bad",
                "detail": f"{len(pinned_missing_worker_tasks)} queued worker task(s) are pinned to missing or stale workers.",
            }
        )

    return {
        "approvals_waiting": approvals_waiting,
        "failed_worker_tasks": failed_worker_tasks,
        "claimed_worker_tasks": claimed_worker_tasks,
        "expired_worker_leases": expired_leases,
        "unserviceable_worker_tasks": unserviceable_tasks,
        "missing_target_worker_tasks": pinned_missing_worker_tasks,
        "stale_workers": stale_workers,
        "active_alerts": active_alerts,
    }
