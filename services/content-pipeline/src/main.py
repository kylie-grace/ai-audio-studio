"""Content Pipeline — social media draft generation."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

PLATFORM_LIMITS = {
    "instagram": {"max_chars": 2200, "tags": 18},
    "facebook": {"max_chars": 63206, "tags": 6},
    "threads": {"max_chars": 500, "tags": 4},
    "linkedin": {"max_chars": 3000, "tags": 6},
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


def generate_caption(brief: str, platform: str, content_type: str) -> tuple[str, list[str], str]:
    return generate_caption_with_context(brief, platform, content_type, studio_name="the studio", style_summary="")


def generate_caption_with_context(
    brief: str,
    platform: str,
    content_type: str,
    studio_name: str,
    style_summary: str,
) -> tuple[str, list[str], str]:
    tags = {
        "instagram": ["mixing", "mastering", "recordingstudio", "newmusic", "audioengineer", "independentartist"],
        "facebook": ["mixing", "mastering", "studio"],
        "threads": ["mixing", "studio", "music"],
        "linkedin": ["audio", "production", "mixing", "studio"],
    }[platform]
    studio_line = studio_name.strip() if studio_name.strip() else "the studio"
    style_line = f" Tone: {style_summary.strip()}" if style_summary.strip() else ""
    caption = (
        f"{studio_line} {content_type.replace('-', ' ').title()} update: {brief.strip()} "
        f"This draft was prepared for review before anything is posted.{style_line}"
    ).strip()
    limit = PLATFORM_LIMITS[platform]["max_chars"]
    if len(caption) > limit:
        caption = caption[: limit - 1]
    short = caption[:147] + "..." if len(caption) > 150 else caption
    hashtags = [f"#{tag}" for tag in tags[: PLATFORM_LIMITS[platform]["tags"]]]
    return caption, hashtags, short


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
    }


@app.post("/draft-social", status_code=201)
async def draft_social(body: DraftSocialBody):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for asset_path in body.asset_paths:
        if not Path(asset_path).exists():
            raise HTTPException(status_code=404, detail=f"Asset path not found: {asset_path}")

    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'social-drafting','draft-social','operator',$2::jsonb,'awaiting-approval',true,'system:content-pipeline')
           RETURNING *""",
        body.project_id,
        json.dumps(body.model_dump()),
    )

    drafts = []
    studio_name, style_summary = await load_workspace_context(pool)
    for platform in body.platforms:
        if platform not in PLATFORM_LIMITS:
            raise HTTPException(status_code=422, detail=f"Unsupported platform: {platform}")
        caption, hashtags, short = generate_caption_with_context(
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
