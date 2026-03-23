"""lead-intake worker."""

from __future__ import annotations

import json
import os
import re
import time
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import ollama_client as llm
from scorer import score_fit, score_urgency

try:
    from services.shared import llm_client
except ImportError:
    class _FallbackLLMClient:
        @staticmethod
        async def generate(model: str, prompt: str, timeout: float = 120.0) -> str:
            return await llm.generate(prompt, model=model, timeout=timeout)

    llm_client = _FallbackLLMClient()

_pool: asyncpg.Pool | None = None
_workspace_settings_cache: dict = {}
_workspace_settings_cache_ts: float = 0.0
WORKSPACE_SETTINGS_CACHE_TTL = 60.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5, statement_cache_size=0)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="lead-intake", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def _get_workspace_settings(pool) -> dict:
    global _workspace_settings_cache, _workspace_settings_cache_ts
    if time.monotonic() - _workspace_settings_cache_ts < WORKSPACE_SETTINGS_CACHE_TTL:
        return _workspace_settings_cache
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    _workspace_settings_cache = dict(row) if row else {}
    _workspace_settings_cache_ts = time.monotonic()
    return _workspace_settings_cache


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


_LEAD_REPLY_PROMPT = """\
You are writing a reply email on behalf of {studio_name}, a professional recording studio.
Studio voice/style: {style_summary}

A new potential client has reached out:
- Artist/Project name: {artist_name}
- Service requested: {service_requested}
- Timeline: {timeline}
- Budget signal: {budget_signal}
- Urgency: {urgency}
- References mentioned: {references}

Write a warm, professional reply (3-4 sentences max). Sound like a real studio owner, not an AI.
Do NOT include Subject or greeting — just the email body text.
Sign off as {studio_name}.
Ask for reference tracks if none were mentioned.
"""


async def draft_reply_llm(normalized: dict, studio_name: str, style_summary: str) -> str | None:
    """Try LLM-generated personalized reply. Returns None on failure."""
    prompt = _LEAD_REPLY_PROMPT.format(
        studio_name=studio_name or "the studio",
        style_summary=style_summary or "professional, warm, direct",
        artist_name=normalized.get("artist_name", "the artist"),
        service_requested=normalized.get("service_requested", "mixing/mastering"),
        timeline=normalized.get("timeline") or "no timeline specified",
        budget_signal=normalized.get("budget_signal", "unknown"),
        urgency=normalized.get("urgency", "normal"),
        references=", ".join(normalized.get("references", [])) or "none mentioned",
    )
    result = await llm_client.generate(llm.PLANNER_MODEL, prompt, 45.0)
    return result.strip() if result and result.strip() else None


def draft_reply(normalized: dict) -> str:
    return draft_reply_with_context(normalized, studio_name="the studio", style_summary="")


def draft_reply_with_context(normalized: dict, studio_name: str, style_summary: str) -> str:
    artist = normalized["artist_name"]
    service = normalized["service_requested"]
    timeline = normalized.get("timeline") or "your target timeline"
    questions = []
    if not normalized.get("references"):
        questions.append("If you have one or two reference tracks, send those over.")
    if normalized.get("deliverables") == []:
        questions.append("Let me know the final deliverables you need.")
    follow_up = " ".join(questions[:2])
    studio_line = studio_name.strip() if studio_name.strip() else "the studio"
    style_line = f" Tone note: {style_summary.strip()}" if style_summary.strip() else ""
    return (
        f"Thanks for reaching out to {studio_line} about {service} work for {artist}.\n\n"
        f"I’ve noted {timeline} as the working timeline and I can review the project details before confirming scope. "
        f"I usually reply to booking questions within one business day.{style_line}\n\n"
        f"{follow_up}".strip()
    )


async def load_workspace_context(pool: asyncpg.Pool) -> tuple[str, str]:
    settings = await _get_workspace_settings(pool)
    style_profile = await pool.fetchrow(
        "SELECT extracted_guidance FROM style_profiles WHERE scope='studio' ORDER BY created_at ASC LIMIT 1"
    )
    guidance = json.loads(style_profile["extracted_guidance"]) if style_profile and style_profile["extracted_guidance"] else {}
    return (
        settings["studio_name"] if settings and settings.get("studio_name") else "the studio",
        guidance.get("summary", ""),
    )


async def load_module_settings(pool: asyncpg.Pool) -> dict:
    row = await _get_workspace_settings(pool)
    if not row or not row.get("module_settings"):
        return {}
    value = row["module_settings"]
    return json.loads(value) if isinstance(value, str) else dict(value)


async def require_module_enabled(pool: asyncpg.Pool, module_key: str) -> dict:
    module_settings = (await load_module_settings(pool)).get(module_key, {})
    if not module_settings.get("enabled", True):
        raise HTTPException(status_code=423, detail=f"{module_key} disabled in workspace settings")
    return module_settings


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("lead_intake", {})
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='lead-intake' AND status='awaiting-approval'")
    lead_count = await pool.fetchval("SELECT COUNT(*) FROM leads")
    ollama_ready = await llm.is_available(llm.PLANNER_MODEL)
    return {
        "status": "ok",
        "module": "lead-intake",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "lead_count": lead_count,
        "llm_ready": ollama_ready,
        "llm_model": llm.PLANNER_MODEL,
    }


@app.post("/webhook/lead-intake", status_code=201)
async def webhook_lead_intake(body: LeadIntakeBody):
    pool = await get_pool()
    await require_module_enabled(pool, "lead_intake")
    normalized = normalize_lead(body.raw_text, body.form_fields)
    fit_score = score_fit(normalized)
    urgency_score = score_urgency(normalized)
    studio_name, style_summary = await load_workspace_context(pool)
    reply = await draft_reply_llm(normalized, studio_name, style_summary) or draft_reply_with_context(
        normalized, studio_name=studio_name, style_summary=style_summary
    )
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
        json.dumps(
            {
                "lead_id": str(lead["id"]),
                "source": body.source,
                "artist_name": normalized["artist_name"],
                "service_requested": normalized["service_requested"],
                "budget_signal": normalized.get("budget_signal"),
                "urgency": normalized.get("urgency"),
                "fit_score": fit_score,
                "draft_reply_preview": reply[:300],
            }
        ),
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
