"""mix-planner worker — session-aware mix planning with LLM."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import ollama_client as llm

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="mix-planner", lifespan=lifespan)


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


class MixPlanBody(BaseModel):
    project_id: str
    notes: str | None = None
    stems: list[str] = []
    genre: str | None = None
    client_notes: str | None = None


# ---------------------------------------------------------------------------
# LLM mix planning
# ---------------------------------------------------------------------------

_MIX_PLAN_PROMPT = """\
You are a professional mix engineer planning a mixing session.

Project: {client_name} — {service_type}
Session stems/tracks: {stems}
Genre/style notes: {genre}
Client notes: {client_notes}
Engineer notes: {engineer_notes}
Studio style guidance: {style_summary}

Create a practical mix session plan. Be specific — reference actual track names from the stems list.

Return JSON only:
{{
  "phases": [
    {{
      "name": "phase name",
      "description": "what this phase accomplishes",
      "actions": ["specific action 1", "specific action 2"],
      "estimated_time": "30-45 min"
    }}
  ],
  "priorities": ["key thing to focus on 1", "key thing 2"],
  "risk_flags": ["potential issue 1"],
  "reference_approach": "how to use reference tracks in this session",
  "delivery_targets": ["file format and spec 1"]
}}

Use 3-5 phases. Keep actions specific to the actual tracks listed.
"""


async def build_mix_plan_llm(
    project: dict,
    stems: list[str],
    notes: str | None,
    genre: str | None,
    client_notes: str | None,
    style_summary: str,
) -> dict | None:
    """Try LLM-based mix plan. Returns None on failure."""
    stems_list = "\n".join(f"  - {s}" for s in stems) if stems else "  (no stems listed — check session folder)"
    prompt = _MIX_PLAN_PROMPT.format(
        client_name=project.get("client_name", "Unknown Client"),
        service_type=project.get("service_type", "mix"),
        stems=stems_list,
        genre=genre or project.get("notes", "not specified"),
        client_notes=client_notes or project.get("notes", "none"),
        engineer_notes=notes or "none",
        style_summary=style_summary or "professional, transparent, punchy",
    )
    result = await llm.generate_json(prompt, model=llm.PLANNER_MODEL, timeout=90.0)
    if isinstance(result, dict) and "phases" in result:
        return result
    return None


def build_mix_plan_deterministic(
    project: dict,
    stems: list[str],
    notes: str | None,
) -> dict:
    """Fallback template-based mix plan with stem names injected."""
    focus_tracks = stems[:4] if stems else ["vocals", "drums", "bass", "guitar"]
    return {
        "phases": [
            {
                "name": "Gain Staging",
                "description": "Set healthy levels before any processing",
                "actions": [f"Set gain for {t}" for t in focus_tracks[:4]] + ["Set master fader to unity"],
                "estimated_time": "15-20 min",
            },
            {
                "name": "Static Balance",
                "description": "Build a rough fader balance without processing",
                "actions": [f"Balance {t} to relationship" for t in focus_tracks] + ["Check mono compatibility"],
                "estimated_time": "30-45 min",
            },
            {
                "name": "Corrective Processing",
                "description": "EQ and dynamics to fix problems before creative choices",
                "actions": ["High-pass unnecessary lows", "Identify and notch resonances", "Control dynamics where needed"],
                "estimated_time": "45-60 min",
            },
            {
                "name": "Print Review",
                "description": "Bounce reference and compare",
                "actions": ["Bounce to reference path", "Compare against reference track", "Note revision points"],
                "estimated_time": "15 min",
            },
        ],
        "priorities": ["gain staging", "low-end translation"],
        "risk_flags": [],
        "reference_approach": "A/B against reference at matched loudness throughout",
        "delivery_targets": ["WAV 24-bit 48kHz", "MP3 320kbps reference"],
        "notes": notes or "No additional notes supplied",
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("mix_planner", {})
    pending_jobs = await pool.fetchval("SELECT COUNT(*) FROM jobs WHERE module='mix-planner' AND status='awaiting-approval'")
    plan_count = await pool.fetchval("SELECT COUNT(*) FROM mix_plans")
    ollama_ready = await llm.is_available(llm.PLANNER_MODEL)
    return {
        "status": "ok",
        "module": "mix-planner",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "plan_count": plan_count,
        "llm_ready": ollama_ready,
        "llm_model": llm.PLANNER_MODEL,
    }


@app.post("/mix-plan", status_code=201)
async def mix_plan(body: MixPlanBody):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    _studio_name, style_summary = await load_workspace_context(pool)

    plan = await build_mix_plan_llm(
        dict(project),
        body.stems,
        body.notes,
        body.genre,
        body.client_notes,
        style_summary,
    ) or build_mix_plan_deterministic(dict(project), body.stems, body.notes)

    trigger_payload = {
        "stems": body.stems,
        "genre": body.genre,
        "notes": body.notes,
        "client_notes": body.client_notes,
        "plan_preview": {
            "phase_count": len(plan.get("phases", [])),
            "priorities": plan.get("priorities", []),
            "risk_flags": plan.get("risk_flags", []),
        },
    }

    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'mix-planner','draft-mix-plan','operator',$2::jsonb,'awaiting-approval',true,'worker:mix-planner')
           RETURNING *""",
        body.project_id,
        json.dumps(trigger_payload),
    )
    row = await pool.fetchrow(
        """INSERT INTO mix_plans
           (project_id, job_id, plan_json, status)
           VALUES ($1,$2,$3::jsonb,'draft')
           RETURNING *""",
        body.project_id,
        job["id"],
        json.dumps(plan),
    )
    return {"job_id": str(job["id"]), "mix_plan_id": str(row["id"]), "plan": plan}
