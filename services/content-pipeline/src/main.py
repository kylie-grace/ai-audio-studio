"""Content Pipeline — social media draft generation with LLM captions."""

from __future__ import annotations

import json
import logging
import os
import re
import time

try:
    from pythonjsonlogger import jsonlogger as _jl  # type: ignore[import]
    _h = logging.StreamHandler(); _h.setFormatter(_jl.JsonFormatter("%(asctime)s %(name)s %(levelname)s %(message)s", rename_fields={"asctime": "ts", "levelname": "level"})); logging.root.handlers = [_h]
except ImportError:
    logging.basicConfig(format="%(asctime)s %(name)s %(levelname)s %(message)s")
logging.root.setLevel(logging.INFO)
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from .ollama_client import PLANNER_MODEL, is_available
except ImportError:  # pragma: no cover - supports direct module loading in tests
    from ollama_client import PLANNER_MODEL, is_available

try:
    from services.shared import llm_client
except ImportError:  # pragma: no cover - supports service-local runtime
    try:
        from . import ollama_client as _fallback_ollama_client
    except ImportError:  # pragma: no cover - supports direct module loading in tests
        import ollama_client as _fallback_ollama_client

    class _FallbackLLMClient:
        @staticmethod
        async def generate(model: str, prompt: str, timeout: float = 120.0) -> str:
            return await _fallback_ollama_client.generate(prompt, model=model, timeout=timeout)

    llm_client = _FallbackLLMClient()

PLATFORM_LIMITS = {
    "instagram": {"max_chars": 2200, "max_tags": 18},
    "facebook": {"max_chars": 63206, "max_tags": 6},
    "threads": {"max_chars": 500, "max_tags": 4},
    "linkedin": {"max_chars": 3000, "max_tags": 6},
}

# Platform-specific hashtag pools (deterministic fallback)
_PLATFORM_TAGS = {
    "instagram": ["mixing", "mastering", "recordingstudio", "newmusic", "audioengineer", "independentartist",
                  "studiolife", "behindthescenes", "musicproduction", "sounddesign"],
    "facebook": ["mixing", "mastering", "studio", "music", "recording", "audio"],
    "threads": ["mixing", "studio", "music", "audio"],
    "linkedin": ["audio", "production", "mixing", "studio", "music", "engineering"],
}

_pool: asyncpg.Pool | None = None
_workspace_settings_cache: dict = {}
_workspace_settings_cache_ts: float = 0.0
WORKSPACE_SETTINGS_CACHE_TTL = 60.0


def _resolve_allowed_path(file_path: str) -> Path:
    allowed_base = Path(os.environ.get("SHARED_PROJECTS_PATH", "/data/projects")).resolve()
    try:
        resolved = Path(file_path).resolve()
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not resolved.is_relative_to(allowed_base):
        raise HTTPException(status_code=400, detail="File path is outside the allowed directory")
    return resolved


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="Content Pipeline", lifespan=lifespan)


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


class DraftSocialBody(BaseModel):
    project_id: str
    content_type: str
    brief: str = Field(min_length=1)
    asset_paths: list[str] = []
    platforms: list[str] = Field(min_length=1)


# ---------------------------------------------------------------------------
# LLM caption generation
# ---------------------------------------------------------------------------

_CAPTION_PROMPT = """\
You are writing a social media post for {studio_name}, a professional recording studio.

Studio voice/style: {style_summary}
Content type: {content_type}
Brief: {brief}
Platform: {platform} (character limit: {max_chars}, keep under {max_chars} characters total)

Write an authentic, engaging {platform} caption that sounds like a real studio owner posting —
not like AI-generated marketing copy. Be specific and natural.

Return JSON only:
{{"caption": "...", "hashtags": ["#tag1", "#tag2"], "short": "first 150 characters"}}

Guidelines per platform:
- instagram: conversational, 5-10 relevant hashtags, emojis ok, under 2200 chars
- facebook: warmer and longer, 3-6 hashtags, professional-personal balance
- threads: very short and punchy, under 500 chars, 2-4 hashtags
- linkedin: professional, value-focused, 3-5 industry hashtags, no slang
"""


async def generate_caption_llm(
    brief: str,
    platform: str,
    content_type: str,
    studio_name: str,
    style_summary: str,
) -> tuple[str, list[str], str] | None:
    """Try to generate a caption using Ollama. Returns None on failure."""
    limits = PLATFORM_LIMITS[platform]
    prompt = _CAPTION_PROMPT.format(
        studio_name=studio_name or "the studio",
        style_summary=style_summary or "professional, warm, authentic",
        content_type=content_type,
        brief=brief,
        platform=platform,
        max_chars=limits["max_chars"],
    )
    result = await llm_client.generate(PLANNER_MODEL, prompt, 45.0)
    text = result.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        inner = lines[1:] if len(lines) > 1 else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        parsed = json.loads(match.group()) if match else None
    if not isinstance(parsed, dict):
        return None
    caption = parsed.get("caption", "")
    hashtags = parsed.get("hashtags", [])
    short = parsed.get("short", caption[:147] + "..." if len(caption) > 150 else caption)
    if not caption:
        return None
    # Enforce character limit
    if len(caption) > limits["max_chars"]:
        caption = caption[:limits["max_chars"] - 1]
    # Enforce hashtag count
    hashtags = [h if h.startswith("#") else f"#{h}" for h in hashtags]
    hashtags = hashtags[:limits["max_tags"]]
    return caption, hashtags, short


def generate_caption_deterministic(
    brief: str,
    platform: str,
    content_type: str,
    studio_name: str,
    style_summary: str,
) -> tuple[str, list[str], str]:
    """Deterministic fallback caption generator."""
    tags = _PLATFORM_TAGS.get(platform, _PLATFORM_TAGS["instagram"])
    studio_line = studio_name.strip() if studio_name.strip() else "the studio"
    style_line = f" Tone: {style_summary.strip()}" if style_summary.strip() else ""
    caption = (
        f"{studio_line} {content_type.replace('-', ' ').title()} update: {brief.strip()} "
        f"This draft was prepared for review before anything is posted.{style_line}"
    ).strip()
    limits = PLATFORM_LIMITS[platform]
    if len(caption) > limits["max_chars"]:
        caption = caption[:limits["max_chars"] - 1]
    short = caption[:147] + "..." if len(caption) > 150 else caption
    hashtags = [f"#{t}" for t in tags[:limits["max_tags"]]]
    return caption, hashtags, short


def generate_caption_with_context(
    brief: str,
    platform: str,
    content_type: str,
    studio_name: str,
    style_summary: str,
) -> tuple[str, list[str], str]:
    """Sync compatibility wrapper used by tests and simple callers."""
    return generate_caption_deterministic(brief, platform, content_type, studio_name, style_summary)


async def generate_caption_with_context_async(
    brief: str,
    platform: str,
    content_type: str,
    studio_name: str,
    style_summary: str,
) -> tuple[str, list[str], str]:
    """Generate caption: try LLM first, fall back to deterministic."""
    result = await generate_caption_llm(brief, platform, content_type, studio_name, style_summary)
    if result is not None:
        return result
    return generate_caption_deterministic(brief, platform, content_type, studio_name, style_summary)


# ---------------------------------------------------------------------------
# Workspace context
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    studio_name, style_summary = await load_workspace_context(pool)
    module_settings = (await load_module_settings(pool)).get("content_pipeline", {})
    draft_count = await pool.fetchval("SELECT COUNT(*) FROM social_drafts")
    pending_review = await pool.fetchval("SELECT COUNT(*) FROM social_drafts WHERE status='pending-review'")
    ollama_ready = await is_available(PLANNER_MODEL)
    return {
        "status": "ok",
        "module": "content-pipeline",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "draft_count": draft_count,
        "pending_review": pending_review,
        "studio_name": studio_name,
        "style_summary": style_summary,
        "supported_platforms": sorted(PLATFORM_LIMITS.keys()),
        "llm_ready": ollama_ready,
        "llm_model": PLANNER_MODEL,
    }


@app.post("/draft-social", status_code=201)
async def draft_social(body: DraftSocialBody):
    pool = await get_pool()
    await require_module_enabled(pool, "content_pipeline")
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for asset_path in body.asset_paths:
        try:
            asset_resolved = _resolve_allowed_path(asset_path)
        except HTTPException:
            raise
        if not asset_resolved.exists():
            raise HTTPException(status_code=404, detail=f"Asset path not found: {asset_path}")

    studio_name, style_summary = await load_workspace_context(pool)

    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'social-drafting','draft-social','operator',$2::jsonb,'awaiting-approval',true,'system:content-pipeline')
           RETURNING *""",
        body.project_id,
        json.dumps(body.model_dump()),
    )

    drafts = []
    for platform in body.platforms:
        if platform not in PLATFORM_LIMITS:
            raise HTTPException(status_code=422, detail=f"Unsupported platform: {platform}")
        caption, hashtags, short = await generate_caption_with_context_async(
            body.brief,
            platform,
            body.content_type,
            studio_name=studio_name,
            style_summary=style_summary,
        )
        row = await pool.fetchrow(
            """INSERT INTO social_drafts
               (project_id, job_id, platform, caption, hashtags, asset_manifest, variant_short, status)
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'pending-review')
               RETURNING *""",
            body.project_id,
            job["id"],
            platform,
            caption,
            hashtags,
            json.dumps([{"path": path, "type": Path(path).suffix.lstrip(".") or "file"} for path in body.asset_paths]),
            short,
        )
        drafts.append(dict(row))

    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1,$2,'system:content-pipeline','draft-social',2,$3::jsonb)""",
        job["id"],
        body.project_id,
        json.dumps({"platforms": body.platforms, "content_type": body.content_type}),
    )
    return {"job_id": str(job["id"]), "status": "awaiting-approval", "drafts": drafts}
