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
        "SELECT slug, display_name, status, last_seen_at FROM worker_nodes WHERE status <> 'retired' ORDER BY slug ASC"
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

    return {
        "approvals_waiting": approvals_waiting,
        "failed_worker_tasks": failed_worker_tasks,
        "claimed_worker_tasks": claimed_worker_tasks,
        "expired_worker_leases": expired_leases,
        "stale_workers": stale_workers,
        "active_alerts": active_alerts,
    }
