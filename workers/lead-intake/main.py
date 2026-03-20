"""lead-intake worker."""

from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from scorer import score_fit, score_urgency

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="lead-intake", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


class LeadIntakeBody(BaseModel):
    source: str
    raw_text: str = Field(min_length=1)
    form_fields: dict = {}
    received_at: str | None = None


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


def normalize_lead(raw_text: str, form_fields: dict) -> dict:
    text = f"{raw_text}\n{json.dumps(form_fields)}".lower()
    service_requested = "other"
    if "mix+master" in text or ("mix" in text and "master" in text):
        service_requested = "mix+master"
    elif "master" in text:
        service_requested = "master"
    elif "mix" in text:
        service_requested = "mix"
    elif "session" in text:
        service_requested = "session"
    artist_name = form_fields.get("artist_name") or form_fields.get("name")
    if not artist_name:
        match = re.search(r"(artist|band|project)\s*[:\-]\s*([^\n,]+)", raw_text, re.IGNORECASE)
        artist_name = match.group(2).strip() if match else "Unknown Artist"
    budget_signal = "unknown"
    if re.search(r"\$?(8\d\d|9\d\d|\d{4,})", text) or "label" in text:
        budget_signal = "high"
    elif re.search(r"\$?(2\d\d|3\d\d|4\d\d|5\d\d|6\d\d|7\d\d)", text):
        budget_signal = "medium"
    elif "cheap" in text or "tight budget" in text or "student" in text:
        budget_signal = "low"
    urgency = "normal"
    if "asap" in text or "urgent" in text or "tomorrow" in text:
        urgency = "high"
    elif "whenever" in text or "no rush" in text:
        urgency = "low"
    timeline = form_fields.get("timeline")
    if not timeline:
        match = re.search(r"(by [^.\n]+|next week|next month|asap|tomorrow)", raw_text, re.IGNORECASE)
        timeline = match.group(1) if match else None
    references = []
    for marker in ("like ", "similar to ", "reference "):
        if marker in text:
            snippet = raw_text.lower().split(marker, 1)[1].split("\n", 1)[0]
            references.extend(part.strip(" .") for part in snippet.split(",")[:3] if part.strip())
            break
    return {
        "artist_name": artist_name,
        "service_requested": service_requested,
        "timeline": timeline,
        "budget_signal": budget_signal,
        "deliverables": form_fields.get("deliverables", []),
        "references": references,
        "urgency": urgency,
    }


def draft_reply(normalized: dict) -> str:
    artist = normalized["artist_name"]
    service = normalized["service_requested"]
    timeline = normalized.get("timeline") or "your target timeline"
    questions = []
    if not normalized.get("references"):
        questions.append("If you have one or two reference tracks, send those over.")
    if normalized.get("deliverables") == []:
        questions.append("Let me know the final deliverables you need.")
    follow_up = " ".join(questions[:2])
    return (
        f"Thanks for reaching out about {service} work for {artist}.\n\n"
        f"I’ve noted {timeline} as the working timeline and I can review the project details before confirming scope. "
        f"I usually reply to booking questions within one business day.\n\n"
        f"{follow_up}".strip()
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhook/lead-intake", status_code=201)
async def webhook_lead_intake(body: LeadIntakeBody):
    pool = await get_pool()
    normalized = normalize_lead(body.raw_text, body.form_fields)
    fit_score = score_fit(normalized)
    urgency_score = score_urgency(normalized)
    reply = draft_reply(normalized)
    artist_name = normalized["artist_name"]
    slug = slugify(artist_name)
    existing = await pool.fetchrow("SELECT * FROM projects WHERE slug=$1", slug)
    if existing is None:
        project = await pool.fetchrow(
            """INSERT INTO projects
               (slug, client_name, client_email, service_type, budget_signal, timeline, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               RETURNING *""",
            slug,
            artist_name,
            body.form_fields.get("email"),
            normalized["service_requested"],
            normalized["budget_signal"],
            normalized["timeline"],
            body.raw_text[:500],
        )
    else:
        project = existing
    lead = await pool.fetchrow(
        """INSERT INTO leads
           (project_id, source, raw_input, normalized, fit_score, urgency_score, draft_reply)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
           RETURNING *""",
        project["id"],
        body.source,
        body.raw_text,
        json.dumps(normalized),
        fit_score,
        urgency_score,
        reply,
    )
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'lead-intake','draft-lead-reply','webhook',$2::jsonb,'awaiting-approval',true,'worker:lead-intake')
           RETURNING *""",
        project["id"],
        json.dumps({"lead_id": str(lead["id"]), "source": body.source}),
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1,$2,'worker:lead-intake','intake',2,$3::jsonb)""",
        job["id"],
        project["id"],
        json.dumps({"fit_score": fit_score, "urgency_score": urgency_score}),
    )
    return {
        "job_id": str(job["id"]),
        "lead_id": str(lead["id"]),
        "project_id": str(project["id"]),
        "normalized": normalized,
        "fit_score": fit_score,
        "urgency_score": urgency_score,
        "draft_reply": reply,
        "status": "awaiting-approval",
    }
