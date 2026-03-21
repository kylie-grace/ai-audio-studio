"""Worker router — register remote studio nodes and manage bounded task claims."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json

from fastapi import APIRouter, HTTPException
from fastapi import Header
from pydantic import BaseModel, Field

from ..db import get_pool
from ..fsm import validate_transition

router = APIRouter()
WORKER_API_TOKEN = __import__("os").environ.get("WORKER_API_TOKEN", "")
_RAW = __import__("os").environ.get("AUTHORIZED_ACTORS", "owner")
AUTHORIZED_ACTORS: set[str] = {a.strip() for a in _RAW.split(",") if a.strip()}
OPERATOR_API_TOKEN = __import__("os").environ.get("OPERATOR_API_TOKEN", "")


def decode_jsonb(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def serialize_worker(row) -> dict:
    data = dict(row)
    data["capabilities"] = decode_jsonb(data.get("capabilities"))
    data["watched_paths"] = decode_jsonb(data.get("watched_paths"))
    data["workstation_profile"] = decode_jsonb(data.get("workstation_profile"))
    data["workstation_status"] = decode_jsonb(data.get("workstation_status"))
    return data


def serialize_worker_task(row) -> dict:
    data = dict(row)
    data["payload"] = decode_jsonb(data.get("payload"))
    data["result"] = decode_jsonb(data.get("result"))
    return data


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _serialize_runtime_worker(row) -> dict:
    return {
        "slug": row["slug"],
        "display_name": row["display_name"],
        "status": row["status"],
        "host": row.get("host"),
        "api_base_url": row.get("api_base_url"),
        "workstation_profile": decode_jsonb(row.get("workstation_profile")),
        "workstation_status": decode_jsonb(row.get("workstation_status")),
        "last_seen_at": _iso(row.get("last_seen_at")),
    }


def require_worker_token(token: str | None) -> None:
    if WORKER_API_TOKEN and token != WORKER_API_TOKEN:
        raise HTTPException(status_code=403, detail="Missing or invalid worker token.")


def require_authorized_actor(actor: str) -> None:
    if actor not in AUTHORIZED_ACTORS:
        raise HTTPException(
            status_code=403,
            detail=f"Actor '{actor}' is not in the authorized actors list. Update AUTHORIZED_ACTORS in your .env to add them.",
        )


def require_operator_token(token: str | None) -> None:
    if OPERATOR_API_TOKEN and token != OPERATOR_API_TOKEN:
        raise HTTPException(status_code=403, detail="Missing or invalid operator token.")


class RegisterWorkerBody(BaseModel):
    slug: str
    display_name: str
    platform: str = "macos"
    host: str | None = None
    api_base_url: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    watched_paths: dict[str, str] = Field(default_factory=dict)
    workstation_profile: dict = Field(default_factory=dict)


class HeartbeatBody(BaseModel):
    status: str = "idle"
    host: str | None = None
    api_base_url: str | None = None
    capabilities: list[str] | None = None
    watched_paths: dict[str, str] | None = None
    workstation_status: dict | None = None


class PluginInventoryItem(BaseModel):
    name: str
    plugin_format: str
    vendor: str | None = None
    version: str | None = None
    path: str
    file_name: str
    installed: bool = True
    source_root: str | None = None
    size_bytes: int | None = None
    modified_at: int | str | None = None


class SyncPluginInventoryBody(BaseModel):
    plugins: list[PluginInventoryItem] = Field(default_factory=list)
    summary: dict = Field(default_factory=dict)


class EnqueueWorkerTaskBody(BaseModel):
    task_type: str
    payload: dict = Field(default_factory=dict)
    job_id: str | None = None
    project_id: str | None = None
    worker_slug: str | None = None
    priority: str = "normal"
    required_capability: str | None = None


class ClaimWorkerTaskBody(BaseModel):
    worker_slug: str
    task_types: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    lease_seconds: int = Field(default=300, ge=30, le=3600)


class CompleteWorkerTaskBody(BaseModel):
    worker_slug: str
    result: dict = Field(default_factory=dict)


class FailWorkerTaskBody(BaseModel):
    worker_slug: str
    error_message: str
    result: dict = Field(default_factory=dict)


async def _append_audit(pool, task, actor: str, action: str, payload: dict | None = None) -> None:
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1, $2, $3, $4, 3, $5::jsonb)""",
        task.get("job_id"),
        task.get("project_id"),
        actor,
        action,
        json.dumps(payload or {}),
    )


@router.get("/")
async def list_workers():
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM worker_nodes WHERE status <> 'retired' ORDER BY slug ASC")
    return [serialize_worker(row) for row in rows]


@router.get("/workstations")
async def list_workstations():
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM worker_nodes WHERE status <> 'retired' ORDER BY slug ASC")
    plugin_rows = await pool.fetch(
        """SELECT worker_slug,
                  COUNT(*) AS plugin_count,
                  COALESCE(jsonb_object_agg(plugin_format, count_by_format), '{}'::jsonb) AS counts_by_format
           FROM (
               SELECT worker_slug, plugin_format, COUNT(*) AS count_by_format
               FROM workstation_plugins
               GROUP BY worker_slug, plugin_format
           ) grouped
           GROUP BY worker_slug"""
    )
    plugin_index = {
        row["worker_slug"]: {
            "plugin_count": row["plugin_count"],
            "counts_by_format": decode_jsonb(row["counts_by_format"]),
        }
        for row in plugin_rows
    }
    return [
        {
            "slug": row["slug"],
            "display_name": row["display_name"],
            "platform": row["platform"],
            "worker_status": row["status"],
            "api_base_url": row.get("api_base_url"),
            "capabilities": decode_jsonb(row.get("capabilities")),
            "workstation_profile": decode_jsonb(row.get("workstation_profile")),
            "workstation_status": decode_jsonb(row.get("workstation_status")),
            "plugin_inventory": plugin_index.get(row["slug"], {"plugin_count": 0, "counts_by_format": {}}),
            "last_seen_at": _iso(row.get("last_seen_at")),
        }
        for row in rows
    ]


@router.get("/{slug}")
async def get_worker(slug: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", slug)
    if row is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return serialize_worker(row)


@router.get("/{slug}/plugins")
async def list_worker_plugins(slug: str, limit: int = 200):
    pool = await get_pool()
    worker = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", slug)
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    rows = await pool.fetch(
        """SELECT worker_slug, plugin_format, name, vendor, version, path, file_name,
                  installed, source_root, size_bytes, modified_at, discovered_at, updated_at
           FROM workstation_plugins
           WHERE worker_slug=$1
           ORDER BY plugin_format ASC, name ASC
           LIMIT $2""",
        slug,
        limit,
    )
    counts = await pool.fetch(
        """SELECT plugin_format, COUNT(*) AS plugin_count
           FROM workstation_plugins
           WHERE worker_slug=$1
           GROUP BY plugin_format
           ORDER BY plugin_format ASC""",
        slug,
    )
    return {
        "worker_slug": slug,
        "plugin_count": len(rows),
        "counts_by_format": {row["plugin_format"]: row["plugin_count"] for row in counts},
        "plugins": [dict(row) for row in rows],
    }


@router.post("/register", status_code=201)
async def register_worker(body: RegisterWorkerBody, x_worker_token: str | None = Header(default=None)):
    require_worker_token(x_worker_token)
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO worker_nodes
           (slug, display_name, platform, host, api_base_url, status, capabilities, watched_paths, workstation_profile, last_seen_at)
           VALUES ($1,$2,$3,$4,$5,'idle',$6::jsonb,$7::jsonb,$8::jsonb,$9)
           ON CONFLICT (slug) DO UPDATE SET
             display_name=EXCLUDED.display_name,
             platform=EXCLUDED.platform,
             host=EXCLUDED.host,
             api_base_url=EXCLUDED.api_base_url,
             status='idle',
             capabilities=EXCLUDED.capabilities,
             watched_paths=EXCLUDED.watched_paths,
             workstation_profile=EXCLUDED.workstation_profile,
             last_seen_at=EXCLUDED.last_seen_at,
             updated_at=now()
           RETURNING *""",
        body.slug,
        body.display_name,
        body.platform,
        body.host,
        body.api_base_url,
        json.dumps(body.capabilities),
        json.dumps(body.watched_paths),
        json.dumps(body.workstation_profile),
        datetime.now(timezone.utc),
    )
    return serialize_worker(row)


@router.post("/{slug}/heartbeat")
async def heartbeat(slug: str, body: HeartbeatBody, x_worker_token: str | None = Header(default=None)):
    require_worker_token(x_worker_token)
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", slug)
    if row is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    capabilities = body.capabilities if body.capabilities is not None else list(row["capabilities"])
    watched_paths = body.watched_paths if body.watched_paths is not None else dict(row["watched_paths"])
    workstation_status = body.workstation_status if body.workstation_status is not None else decode_jsonb(row.get("workstation_status")) or {}
    await pool.execute(
        """UPDATE worker_nodes
           SET status=$1,
               host=COALESCE($2, host),
               api_base_url=COALESCE($3, api_base_url),
               capabilities=$4::jsonb,
               watched_paths=$5::jsonb,
               workstation_status=$6::jsonb,
               last_seen_at=$7,
               updated_at=now()
           WHERE slug=$8""",
        body.status,
        body.host,
        body.api_base_url,
        json.dumps(capabilities),
        json.dumps(watched_paths),
        json.dumps(workstation_status),
        datetime.now(timezone.utc),
        slug,
    )
    updated = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", slug)
    return serialize_worker(updated)


@router.post("/{slug}/plugins/sync")
async def sync_worker_plugins(slug: str, body: SyncPluginInventoryBody, x_worker_token: str | None = Header(default=None)):
    require_worker_token(x_worker_token)
    pool = await get_pool()
    worker = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", slug)
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM workstation_plugins WHERE worker_slug=$1", slug)
            for plugin in body.plugins:
                modified_at = plugin.modified_at
                if isinstance(modified_at, (int, float)):
                    modified_at = datetime.fromtimestamp(modified_at, tz=timezone.utc)
                await conn.execute(
                    """INSERT INTO workstation_plugins
                       (worker_slug, plugin_format, name, vendor, version, path, file_name,
                        installed, source_root, size_bytes, modified_at, discovered_at, updated_at)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())""",
                    slug,
                    plugin.plugin_format,
                    plugin.name,
                    plugin.vendor,
                    plugin.version,
                    plugin.path,
                    plugin.file_name,
                    plugin.installed,
                    plugin.source_root,
                    plugin.size_bytes,
                    modified_at,
                    datetime.now(timezone.utc),
                )

    return {
        "worker_slug": slug,
        "synced_plugin_count": len(body.plugins),
        "summary": body.summary,
    }


@router.get("/tasks/list")
async def list_worker_tasks(status: str | None = None):
    pool = await get_pool()
    if status:
        rows = await pool.fetch(
            "SELECT * FROM worker_tasks WHERE status=$1 ORDER BY created_at DESC",
            status,
        )
    else:
        rows = await pool.fetch("SELECT * FROM worker_tasks ORDER BY created_at DESC")
    return [serialize_worker_task(row) for row in rows]


@router.get("/tasks/{task_id}")
async def get_worker_task(task_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Worker task not found")
    return serialize_worker_task(row)


@router.get("/runtime/recovery")
async def runtime_recovery_snapshot():
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(minutes=5)

    workers = await pool.fetch("SELECT * FROM worker_nodes WHERE status <> 'retired' ORDER BY slug ASC")
    failed_tasks = await pool.fetch(
        "SELECT * FROM worker_tasks WHERE status='failed' ORDER BY completed_at DESC NULLS LAST, created_at DESC LIMIT 20"
    )
    claimed_tasks = await pool.fetch(
        "SELECT * FROM worker_tasks WHERE status='claimed' ORDER BY lease_expires_at ASC NULLS LAST, created_at DESC LIMIT 20"
    )

    stale_workers = [
        _serialize_runtime_worker(row)
        for row in workers
        if row.get("last_seen_at") is None or row["last_seen_at"] < stale_cutoff
    ]

    serialized_claimed = []
    expired_claim_count = 0
    for row in claimed_tasks:
        item = serialize_worker_task(row)
        lease_expires_at = row.get("lease_expires_at")
        is_expired = bool(lease_expires_at and lease_expires_at < now)
        if is_expired:
            expired_claim_count += 1
        item["lease_expires_at"] = _iso(lease_expires_at)
        item["lease_state"] = "expired" if is_expired else "active"
        serialized_claimed.append(item)

    return {
        "stale_workers": stale_workers,
        "failed_tasks": [serialize_worker_task(row) for row in failed_tasks],
        "claimed_tasks": serialized_claimed,
        "summary": {
            "failed_task_count": len(failed_tasks),
            "claimed_task_count": len(claimed_tasks),
            "expired_claim_count": expired_claim_count,
            "stale_worker_count": len(stale_workers),
        },
    }


@router.post("/{slug}/retire")
async def retire_worker(
    slug: str,
    x_actor: str = Header(...),
    x_operator_token: str | None = Header(default=None),
):
    require_authorized_actor(x_actor)
    require_operator_token(x_operator_token)
    pool = await get_pool()
    worker = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", slug)
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")

    queued_or_claimed = await pool.fetch(
        "SELECT * FROM worker_tasks WHERE worker_slug=$1 AND status IN ('queued','claimed') ORDER BY created_at ASC",
        slug,
    )
    retired_at = datetime.now(timezone.utc)

    for task in queued_or_claimed:
        await pool.execute(
            """UPDATE worker_tasks
               SET status='cancelled',
                   error_message=$1,
                   claimed_by=NULL,
                   claimed_at=NULL,
                   lease_expires_at=NULL,
                   completed_at=$2,
                   updated_at=now()
               WHERE id=$3""",
            f"Worker {slug} retired by operator {x_actor}.",
            retired_at,
            task["id"],
        )
        if task.get("job_id") is not None:
            await pool.execute(
                "UPDATE jobs SET status='failed', error_message=$1, updated_at=now() WHERE id=$2 AND status IN ('approved','in-progress','pending')",
                f"Worker {slug} retired by operator {x_actor}.",
                task["job_id"],
            )
        await _append_audit(
            pool,
            task,
            f"human:{x_actor}",
            "cancel-worker-task",
            {"task_id": str(task["id"]), "worker_slug": slug},
        )

    await pool.execute(
        """UPDATE worker_nodes
           SET status='retired',
               updated_at=now()
           WHERE slug=$1""",
        slug,
    )
    await pool.execute(
        """INSERT INTO audit_log (actor, action, tier, payload)
           VALUES ($1, 'retire-worker', 3, $2::jsonb)""",
        f"human:{x_actor}",
        json.dumps(
            {
                "worker_slug": slug,
                "cancelled_task_count": len(queued_or_claimed),
            }
        ),
    )
    return {
        "worker_slug": slug,
        "status": "retired",
        "cancelled_task_count": len(queued_or_claimed),
    }


@router.post("/tasks", status_code=201)
async def enqueue_worker_task(body: EnqueueWorkerTaskBody):
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO worker_tasks
           (job_id, project_id, worker_slug, task_type, required_capability, payload, priority)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
           RETURNING *""",
        body.job_id,
        body.project_id,
        body.worker_slug,
        body.task_type,
        body.required_capability,
        json.dumps(body.payload),
        body.priority,
    )
    return serialize_worker_task(row)


@router.post("/tasks/claim")
async def claim_worker_task(body: ClaimWorkerTaskBody, x_worker_token: str | None = Header(default=None)):
    require_worker_token(x_worker_token)
    pool = await get_pool()
    worker = await pool.fetchrow("SELECT * FROM worker_nodes WHERE slug=$1", body.worker_slug)
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    capabilities = body.capabilities or list(worker["capabilities"])
    params: list[object] = [body.worker_slug]
    conditions = ["status='queued'", "(worker_slug IS NULL OR worker_slug=$1)"]
    if capabilities:
        params.append(capabilities)
        conditions.append(f"(required_capability IS NULL OR required_capability = ANY(${len(params)}::text[]))")
    else:
        conditions.append("required_capability IS NULL")
    if body.task_types:
        params.append(body.task_types)
        conditions.append(f"task_type = ANY(${len(params)}::text[])")
    row = await pool.fetchrow(
        f"""SELECT * FROM worker_tasks
            WHERE {' AND '.join(conditions)}
            ORDER BY
              CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
              created_at ASC
            LIMIT 1""",
        *params,
    )
    if row is None:
        await pool.execute(
            "UPDATE worker_nodes SET status='idle', last_seen_at=$1, updated_at=now() WHERE slug=$2",
            datetime.now(timezone.utc),
            body.worker_slug,
        )
        return {"task": None}

    claimed_at = datetime.now(timezone.utc)
    lease_expires_at = claimed_at + timedelta(seconds=body.lease_seconds)
    await pool.execute(
        """UPDATE worker_tasks
           SET status='claimed', claimed_by=$1, claimed_at=$2, lease_expires_at=$3, updated_at=now()
           WHERE id=$4""",
        body.worker_slug,
        claimed_at,
        lease_expires_at,
        row["id"],
    )
    await pool.execute(
        "UPDATE worker_nodes SET status='busy', last_seen_at=$1, updated_at=now() WHERE slug=$2",
        claimed_at,
        body.worker_slug,
    )
    if row["job_id"] is not None:
        job = await pool.fetchrow("SELECT * FROM jobs WHERE id=$1", row["job_id"])
        if job is not None and job["status"] in {"pending", "approved"}:
            validate_transition(job["status"], "in-progress", job["approval_required"], job.get("approved_at"))
        await pool.execute(
            "UPDATE jobs SET status='in-progress', updated_at=now() WHERE id=$1 AND status IN ('pending','approved')",
            row["job_id"],
        )
    claimed = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", row["id"])
    return {"task": serialize_worker_task(claimed)}


@router.post("/tasks/{task_id}/complete")
async def complete_worker_task(task_id: str, body: CompleteWorkerTaskBody, x_worker_token: str | None = Header(default=None)):
    require_worker_token(x_worker_token)
    pool = await get_pool()
    task = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Worker task not found")
    if task["claimed_by"] != body.worker_slug:
        raise HTTPException(status_code=409, detail="Task is claimed by a different worker")
    await pool.execute(
        """UPDATE worker_tasks
           SET status='complete', result=$1::jsonb, completed_at=$2, updated_at=now()
           WHERE id=$3""",
        json.dumps(body.result),
        datetime.now(timezone.utc),
        task_id,
    )
    await pool.execute(
        "UPDATE worker_nodes SET status='idle', last_seen_at=$1, updated_at=now() WHERE slug=$2",
        datetime.now(timezone.utc),
        body.worker_slug,
    )
    if task["job_id"] is not None:
        job = await pool.fetchrow("SELECT * FROM jobs WHERE id=$1", task["job_id"])
        if job is not None:
            validate_transition(job["status"], "complete", job["approval_required"], job.get("approved_at"))
        await pool.execute(
            "UPDATE jobs SET status='complete', artifacts = artifacts || $1::jsonb, updated_at=now() WHERE id=$2",
            json.dumps([{"type": "worker-result", "worker_task_id": task_id, "result": body.result}]),
            task["job_id"],
        )
    payload = decode_jsonb(task["payload"]) or {}
    revision_id = payload.get("revision_id")
    if revision_id:
        await pool.execute(
            """UPDATE revisions
               SET status='complete'
               WHERE id=$1""",
            revision_id,
        )
    completed = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    return serialize_worker_task(completed)


@router.post("/tasks/{task_id}/fail")
async def fail_worker_task(task_id: str, body: FailWorkerTaskBody, x_worker_token: str | None = Header(default=None)):
    require_worker_token(x_worker_token)
    pool = await get_pool()
    task = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Worker task not found")
    if task["claimed_by"] != body.worker_slug:
        raise HTTPException(status_code=409, detail="Task is claimed by a different worker")
    await pool.execute(
        """UPDATE worker_tasks
           SET status='failed', error_message=$1, result=$2::jsonb, completed_at=$3, updated_at=now()
           WHERE id=$4""",
        body.error_message,
        json.dumps(body.result),
        datetime.now(timezone.utc),
        task_id,
    )
    await pool.execute(
        "UPDATE worker_nodes SET status='error', last_seen_at=$1, updated_at=now() WHERE slug=$2",
        datetime.now(timezone.utc),
        body.worker_slug,
    )
    if task["job_id"] is not None:
        job = await pool.fetchrow("SELECT * FROM jobs WHERE id=$1", task["job_id"])
        if job is not None:
            validate_transition(job["status"], "failed", job["approval_required"], job.get("approved_at"))
        await pool.execute(
            "UPDATE jobs SET status='failed', error_message=$1, updated_at=now() WHERE id=$2",
            body.error_message,
            task["job_id"],
        )
    payload = decode_jsonb(task["payload"]) or {}
    revision_id = payload.get("revision_id")
    if revision_id:
        await pool.execute(
            """UPDATE revisions
               SET status='failed'
               WHERE id=$1""",
            revision_id,
        )
    failed = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    return serialize_worker_task(failed)


@router.post("/tasks/{task_id}/release")
async def release_worker_task(
    task_id: str,
    x_actor: str = Header(...),
    x_operator_token: str | None = Header(default=None),
):
    require_authorized_actor(x_actor)
    require_operator_token(x_operator_token)
    pool = await get_pool()
    task = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Worker task not found")
    if task["status"] != "claimed":
        raise HTTPException(status_code=409, detail="Only claimed tasks can be released")

    claimed_by = task.get("claimed_by")
    await pool.execute(
        """UPDATE worker_tasks
           SET status='queued',
               claimed_by=NULL,
               claimed_at=NULL,
               lease_expires_at=NULL,
               updated_at=now()
           WHERE id=$1""",
        task_id,
    )
    if claimed_by:
        await pool.execute(
            "UPDATE worker_nodes SET status='idle', last_seen_at=$1, updated_at=now() WHERE slug=$2",
            datetime.now(timezone.utc),
            claimed_by,
        )
    await _append_audit(
        pool,
        task,
        f"human:{x_actor}",
        "release-worker-task",
        {"task_id": task_id, "claimed_by": claimed_by},
    )
    released = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    return serialize_worker_task(released)


@router.post("/tasks/{task_id}/requeue")
async def requeue_worker_task(
    task_id: str,
    x_actor: str = Header(...),
    x_operator_token: str | None = Header(default=None),
):
    require_authorized_actor(x_actor)
    require_operator_token(x_operator_token)
    pool = await get_pool()
    task = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Worker task not found")
    if task["status"] != "failed":
        raise HTTPException(status_code=409, detail="Only failed tasks can be requeued")

    await pool.execute(
        """UPDATE worker_tasks
           SET status='queued',
               claimed_by=NULL,
               claimed_at=NULL,
               lease_expires_at=NULL,
               completed_at=NULL,
               error_message=NULL,
               updated_at=now()
           WHERE id=$1""",
        task_id,
    )

    if task["job_id"] is not None:
        job = await pool.fetchrow("SELECT * FROM jobs WHERE id=$1", task["job_id"])
        if job is not None and job["status"] == "failed":
            validate_transition(
                job["status"],
                "pending",
                job["approval_required"],
                job.get("approved_at"),
                retry_count=job.get("retry_count", 0),
                max_retries=job.get("max_retries", 3),
            )
            await pool.execute(
                """UPDATE jobs
                   SET status='pending',
                       error_message=NULL,
                       retry_count=retry_count + 1,
                       updated_at=now()
                   WHERE id=$1""",
                task["job_id"],
            )

    payload = decode_jsonb(task["payload"]) or {}
    revision_id = payload.get("revision_id")
    if revision_id:
        await pool.execute(
            """UPDATE revisions
               SET status='approved'
               WHERE id=$1""",
            revision_id,
        )

    await _append_audit(
        pool,
        task,
        f"human:{x_actor}",
        "requeue-worker-task",
        {"task_id": task_id},
    )
    requeued = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    return serialize_worker_task(requeued)


@router.post("/tasks/{task_id}/cancel")
async def cancel_worker_task(
    task_id: str,
    x_actor: str = Header(...),
    x_operator_token: str | None = Header(default=None),
):
    require_authorized_actor(x_actor)
    require_operator_token(x_operator_token)
    pool = await get_pool()
    task = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Worker task not found")
    if task["status"] not in {"queued", "claimed", "failed"}:
        raise HTTPException(status_code=409, detail="Only queued, claimed, or failed tasks can be cancelled")

    cancelled_at = datetime.now(timezone.utc)
    await pool.execute(
        """UPDATE worker_tasks
           SET status='cancelled',
               error_message=$1,
               claimed_by=NULL,
               claimed_at=NULL,
               lease_expires_at=NULL,
               completed_at=$2,
               updated_at=now()
           WHERE id=$3""",
        f"Cancelled by operator {x_actor}.",
        cancelled_at,
        task_id,
    )

    if task.get("claimed_by"):
        await pool.execute(
            "UPDATE worker_nodes SET status='idle', last_seen_at=$1, updated_at=now() WHERE slug=$2",
            cancelled_at,
            task["claimed_by"],
        )

    if task["job_id"] is not None:
        await pool.execute(
            "UPDATE jobs SET status='failed', error_message=$1, updated_at=now() WHERE id=$2",
            f"Worker task {task_id} cancelled by operator {x_actor}.",
            task["job_id"],
        )

    payload = decode_jsonb(task["payload"]) or {}
    revision_id = payload.get("revision_id")
    if revision_id:
        await pool.execute("UPDATE revisions SET status='failed' WHERE id=$1", revision_id)

    await _append_audit(
        pool,
        task,
        f"human:{x_actor}",
        "cancel-worker-task",
        {"task_id": task_id},
    )
    cancelled = await pool.fetchrow("SELECT * FROM worker_tasks WHERE id=$1", task_id)
    return serialize_worker_task(cancelled)
