"""Content Pipeline — social media draft generation with LLM captions."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from .ollama_client import PLANNER_MODEL, generate_json, is_available
except ImportError:  # pragma: no cover - supports direct module loading in tests
    from ollama_client import PLANNER_MODEL, generate_json, is_available

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
    result = await generate_json(prompt, model=PLANNER_MODEL, timeout=45.0)
    if not isinstance(result, dict):
        return None
    caption = result.get("caption", "")
    hashtags = result.get("hashtags", [])
    short = result.get("short", caption[:147] + "..." if len(caption) > 150 else caption)
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
    settings = await pool.fetchrow("SELECT studio_name FROM workspace_settings WHERE singleton = TRUE")
    style_profile = await pool.fetchrow(
        "SELECT extracted_guidance FROM style_profiles WHERE scope='studio' ORDER BY created_at ASC LIMIT 1"
    )
    guidance = json.loads(style_profile["extracted_guidance"]) if style_profile and style_profile["extracted_guidance"] else {}
    return (
        settings["studio_name"] if settings and settings["studio_name"] else "the studio",
        guidance.get("summary", ""),
    )


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
        if not Path(asset_path).exists():
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
