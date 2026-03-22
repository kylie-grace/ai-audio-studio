"""inbox-triage worker — classifies emails and drafts replies."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import ollama_client as llm

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


async def require_module_enabled(pool: asyncpg.Pool, module_key: str) -> dict:
    module_settings = (await load_module_settings(pool)).get(module_key, {})
    if not module_settings.get("enabled", True):
        raise HTTPException(status_code=423, detail=f"{module_key} disabled in workspace settings")
    return module_settings


class InboxBody(BaseModel):
    thread_id: str
    message_id: str
    subject: str
    from_: str = Field(alias="from")
    body_text: str
    labels: list[str] = []
    received_at: str | None = None


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

_CLASSIFY_PROMPT = """\
You are triaging emails for a professional recording studio.

Email subject: {subject}
Email body: {body}

Classify this email for the studio. Return JSON only:
{{"type": "payment|revision-request|scheduling|lead|noise|admin",
  "urgency": "high|normal|low",
  "summary": "one sentence summary of what this email is about",
  "draft_hint": "brief note on how to reply or what action to take"}}

Types:
- payment: invoices, payment confirmations, payment issues
- revision-request: client asking for changes to a mix or master
- scheduling: booking requests, session times, availability
- lead: new potential client inquiring about services/pricing
- noise: newsletters, promotions, spam, unsubscribe
- admin: everything else (logistics, general questions, follow-ups)
"""


async def classify_message_llm(
    subject: str, body_text: str
) -> dict | None:
    """Try LLM classification. Returns None on failure."""
    prompt = _CLASSIFY_PROMPT.format(subject=subject, body=body_text[:1500])
    result = await llm.generate_json(prompt, model=llm.CLASSIFIER_MODEL, timeout=30.0)
    if isinstance(result, dict) and "type" in result:
        return result
    return None


def classify_message_deterministic(subject: str, body_text: str) -> tuple[str, str]:
    """Keyword-based fallback classification."""
    text = f"{subject}\n{body_text}".lower()
    if any(t in text for t in ("invoice", "payment", "paid", "receipt")):
        return "payment", "high"
    if any(t in text for t in ("revise", "revision", "change the mix", "notes on the mix", "adjust")):
        return "revision-request", "high"
    if any(t in text for t in ("book", "schedule", "availability", "session date", "come in")):
        return "scheduling", "normal"
    if any(t in text for t in ("mix", "master", "quote", "budget", "rates", "pricing", "available for")):
        return "lead", "normal"
    if any(t in text for t in ("unsubscribe", "newsletter", "promo", "deal", "offer")):
        return "noise", "low"
    return "admin", "normal"


async def classify_message(subject: str, body_text: str) -> tuple[str, str, str]:
    """Classify: returns (message_type, urgency, summary)."""
    result = await classify_message_llm(subject, body_text)
    if result:
        return (
            result.get("type", "admin"),
            result.get("urgency", "normal"),
            result.get("summary", ""),
        )
    msg_type, urgency = classify_message_deterministic(subject, body_text)
    return msg_type, urgency, ""


# ---------------------------------------------------------------------------
# Draft response
# ---------------------------------------------------------------------------

_DRAFT_PROMPT = """\
You are writing a brief draft response for the studio owner to review and send.
Studio: {studio_name}

Email received:
Subject: {subject}
From: {sender}
Body: {body}

Message type: {message_type}
Summary: {summary}

Write a short, professional draft reply (2-4 sentences max).
This is just a draft — the owner will review and edit before sending.
Do NOT include a subject line or greeting — just the body text.
Sign off naturally as {studio_name}.
"""


async def draft_response_llm(
    message_type: str,
    subject: str,
    sender: str,
    body_text: str,
    summary: str,
    studio_name: str,
) -> str | None:
    """Try LLM draft response. Returns None on failure or for noise messages."""
    if message_type == "noise":
        return None
    prompt = _DRAFT_PROMPT.format(
        studio_name=studio_name or "the studio",
        subject=subject,
        sender=sender,
        body=body_text[:1000],
        message_type=message_type,
        summary=summary or f"a {message_type} email",
    )
    result = await llm.generate(prompt, model=llm.CLASSIFIER_MODEL, timeout=30.0)
    return result.strip() if result.strip() else None


def draft_response_deterministic(message_type: str, subject: str) -> str:
    """Fallback draft response."""
    if message_type == "noise":
        return "No action needed. This message can remain in review without a reply."
    return f"Draft reply for '{subject}': review the message context and respond after approval."


async def load_workspace_context(pool: asyncpg.Pool) -> str:
    """Load studio name."""
    settings = await pool.fetchrow("SELECT studio_name FROM workspace_settings WHERE singleton = TRUE")
    return settings["studio_name"] if settings and settings["studio_name"] else "the studio"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("inbox_triage", {})
    pending_drafts = await pool.fetchval("SELECT COUNT(*) FROM inbox_drafts WHERE status='pending-review'")
    pending_jobs = await pool.fetchval(
        "SELECT COUNT(*) FROM jobs WHERE module='inbox-triage' AND status='awaiting-approval'"
    )
    ollama_ready = await llm.is_available(llm.CLASSIFIER_MODEL)
    return {
        "status": "ok",
        "module": "inbox-triage",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_review": pending_drafts,
        "pending_approvals": pending_jobs,
        "llm_ready": ollama_ready,
        "llm_model": llm.CLASSIFIER_MODEL,
    }


@app.post("/webhook/inbox-triage", status_code=201)
async def webhook_inbox_triage(body: InboxBody):
    pool = await get_pool()
    await require_module_enabled(pool, "inbox_triage")
    existing = await pool.fetchrow(
        "SELECT * FROM inbox_drafts WHERE source_thread=$1 AND status='pending-review'",
        body.thread_id,
    )
    if existing is not None:
        return {"status": "duplicate-skipped", "draft_id": str(existing["id"])}

    studio_name = await load_workspace_context(pool)
    message_type, urgency, summary = await classify_message(body.subject, body.body_text)

    draft_body = await draft_response_llm(
        message_type, body.subject, body.from_, body.body_text, summary, studio_name
    ) or draft_response_deterministic(message_type, body.subject)

    classification_note = f"llm: {message_type}" if summary else f"deterministic: {message_type}"

    trigger_payload = {
        "thread_id": body.thread_id,
        "message_id": body.message_id,
        "subject": body.subject,
        "from": body.from_,
        "body_text": body.body_text[:500],
        "labels": body.labels,
        "received_at": body.received_at,
        "message_type": message_type,
        "summary": summary,
        "draft_preview": draft_body[:300],
    }

    job = await pool.fetchrow(
        """INSERT INTO jobs
           (module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ('inbox-triage','draft-inbox-reply','webhook',$1::jsonb,'awaiting-approval',true,'worker:inbox-triage')
           RETURNING *""",
        json.dumps(trigger_payload),
    )
    draft = await pool.fetchrow(
        """INSERT INTO inbox_drafts
           (job_id, source_thread, message_type, draft_body, draft_subject, classification, urgency, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending-review')
           RETURNING *""",
        job["id"],
        body.thread_id,
        message_type,
        draft_body,
        f"Re: {body.subject}",
        classification_note,
        urgency,
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, actor, action, tier, payload)
           VALUES ($1,'worker:inbox-triage','triage',2,$2::jsonb)""",
        job["id"],
        json.dumps({"message_type": message_type, "urgency": urgency, "summary": summary}),
    )
    return {"job_id": str(job["id"]), "draft": dict(draft), "status": "pending-review"}


@app.get("/drafts/by-job/{job_id}")
async def get_draft_by_job(job_id: str):
    """Fetch the most recent inbox draft for a job — called by n8n after approval."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM inbox_drafts WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1",
        job_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="No draft found for this job")
    return dict(row)
