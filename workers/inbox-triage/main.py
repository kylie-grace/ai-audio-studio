"""inbox-triage worker."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="inbox-triage", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def load_module_settings(pool: asyncpg.Pool) -> dict:
    row = await pool.fetchrow("SELECT module_settings FROM workspace_settings WHERE singleton = TRUE")
    if row is None or not row["module_settings"]:
        return {}
    value = row["module_settings"]
    return json.loads(value) if isinstance(value, str) else dict(value)


class InboxBody(BaseModel):
    thread_id: str
    message_id: str
    subject: str
    from_: str = Field(alias="from")
    body_text: str
    labels: list[str] = []
    received_at: str | None = None


def classify_message(subject: str, body_text: str) -> tuple[str, str]:
    text = f"{subject}\n{body_text}".lower()
    if any(token in text for token in ("invoice", "payment", "paid")):
        return "payment", "high"
    if any(token in text for token in ("revise", "revision", "change the mix")):
        return "revision-request", "high"
    if any(token in text for token in ("book", "schedule", "availability", "session")):
        return "scheduling", "normal"
    if any(token in text for token in ("mix", "master", "quote", "budget")):
        return "lead", "normal"
    if any(token in text for token in ("unsubscribe", "newsletter", "promo")):
        return "noise", "low"
    return "admin", "normal"


def draft_response(message_type: str, subject: str) -> str:
    if message_type == "noise":
        return "No action needed. This message can remain in review without a reply."
    return f"Draft reply for '{subject}': review the message context and respond after approval."


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("inbox_triage", {})
    pending_drafts = await pool.fetchval("SELECT COUNT(*) FROM inbox_drafts WHERE status='pending-review'")
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='inbox-triage' AND status='awaiting-approval'")
    return {
        "status": "ok",
        "module": "inbox-triage",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_review": pending_drafts,
        "pending_approvals": pending_jobs,
    }


@app.post("/webhook/inbox-triage", status_code=201)
async def webhook_inbox_triage(body: InboxBody):
    pool = await get_pool()
    existing = await pool.fetchrow(
        "SELECT * FROM inbox_drafts WHERE source_thread=$1 AND status='pending-review'",
        body.thread_id,
    )
    if existing is not None:
        return {"status": "duplicate-skipped", "draft_id": str(existing["id"])}

    message_type, urgency = classify_message(body.subject, body.body_text)
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ('inbox-triage','draft-inbox-reply','webhook',$1::jsonb,'awaiting-approval',true,'worker:inbox-triage')
           RETURNING *""",
        json.dumps(
            {
                "thread_id": body.thread_id,
                "message_id": body.message_id,
                "subject": body.subject,
                "from": body.from_,
                "body_text": body.body_text,
                "labels": body.labels,
                "received_at": body.received_at,
            }
        ),
    )
    draft = await pool.fetchrow(
        """INSERT INTO inbox_drafts
           (job_id, source_thread, message_type, draft_body, draft_subject, classification, urgency, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending-review')
           RETURNING *""",
        job["id"],
        body.thread_id,
        message_type,
        draft_response(message_type, body.subject),
        f"Re: {body.subject}",
        f"deterministic classification: {message_type}",
        urgency,
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, actor, action, tier, payload)
           VALUES ($1,'worker:inbox-triage','triage',2,$2::jsonb)""",
        job["id"],
        json.dumps({"message_type": message_type, "urgency": urgency}),
    )
    return {"job_id": str(job["id"]), "draft": dict(draft), "status": "pending-review"}
