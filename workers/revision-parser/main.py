"""revision-parser worker — parses engineer revision notes into DAW actions."""

from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import ollama_client as llm
from reascript_lib import build_reascript

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="revision-parser", lifespan=lifespan)


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


class ParseRevisionsBody(BaseModel):
    project_id: str
    raw_notes: str = Field(min_length=1)
    daw: str
    session_path: str
    execution_mode: str = "local"
    worker_slug: str | None = None


# ---------------------------------------------------------------------------
# Parsing: LLM-first with deterministic fallback
# ---------------------------------------------------------------------------

_PARSE_PROMPT = """\
You are a professional mix engineer parsing revision notes from a client or engineer.

Session tracks available (use these names when referencing elements):
{track_list}

Revision notes to parse:
{raw_notes}

For each distinct change requested, identify:
- element: the track name to change (use the actual track names above when possible) or "mix" for overall
- parameter: one of level, eq, reverb, compression, stereo_width, send_level, other
- direction: up (louder/brighter/more), down (quieter/darker/less), or adjust
- value_db: numeric dB amount if mentioned (e.g. "+2" for "+2 dB"), or null
- confidence: 0.0-1.0 (0.9 = clear instruction, 0.5 = ambiguous, 0.3 = very unclear)
- human_readable: a short description of what this change does

Return a JSON array only, no explanation:
[{{"element": "...", "parameter": "...", "direction": "...", "value_db": null, "confidence": 0.85, "human_readable": "..."}}]
"""


async def parse_changes_llm(
    raw_notes: str,
    session_tracks: list[str] | None = None,
) -> list[dict] | None:
    """Attempt LLM-based parsing. Returns None if Ollama unavailable or parse fails."""
    track_list = "\n".join(f"  - {t}" for t in (session_tracks or [])) or "  (no track names available)"
    prompt = _PARSE_PROMPT.format(track_list=track_list, raw_notes=raw_notes)
    result = await llm.generate_json(prompt, model=llm.PLANNER_MODEL, timeout=60.0)
    if isinstance(result, list) and result:
        return result
    return None


def parse_changes_deterministic(raw_notes: str) -> list[dict]:
    """Keyword-based fallback parser. Always succeeds."""
    changes = []
    for sentence in re.split(r"[.\n]+", raw_notes):
        text = sentence.strip()
        if not text:
            continue
        lower = text.lower()
        element = next(
            (item for item in ("vocals", "kick", "bass", "snare", "synth", "pads", "drums", "guitar", "piano")
             if item in lower),
            "mix",
        )
        parameter = "other"
        if any(t in lower for t in ("quiet", "loud", "level", "volume", "db", "gain")):
            parameter = "level"
        elif any(t in lower for t in ("eq", "muddy", "bright", "dark", "thin", "boxy", "honky", "air", "mud")):
            parameter = "eq"
        elif any(t in lower for t in ("reverb", "room", "space", "tail", "washy")):
            parameter = "reverb"
        elif any(t in lower for t in ("compress", "compression", "squash", "pumping", "transient")):
            parameter = "compression"
        elif any(t in lower for t in ("width", "wide", "narrow", "stereo")):
            parameter = "stereo_width"
        elif any(t in lower for t in ("send", "bus", "parallel")):
            parameter = "send_level"

        direction = "adjust"
        if any(t in lower for t in ("up", "more", "raise", "louder", "brighter", "bigger", "add more", "push")):
            direction = "up"
        elif any(t in lower for t in ("down", "less", "lower", "quieter", "pull back", "reduce", "cut", "dial back")):
            direction = "down"

        confidence = 0.85 if parameter != "other" and element != "mix" else 0.5
        changes.append(
            {
                "element": element,
                "section": "full track",
                "parameter": parameter,
                "direction": direction,
                "value_db": None,
                "confidence": confidence,
                "human_readable": text,
                "requires_clarification": confidence < 0.65,
            }
        )
    return changes


async def parse_changes(raw_notes: str, session_tracks: list[str] | None = None) -> list[dict]:
    """Parse revision notes: try LLM first, fall back to deterministic."""
    result = await parse_changes_llm(raw_notes, session_tracks)
    if result is not None:
        # Normalize: ensure requires_clarification is set
        for c in result:
            c.setdefault("requires_clarification", c.get("confidence", 0.5) < 0.65)
            c.setdefault("section", "full track")
            c.setdefault("value_db", None)
        return result
    return parse_changes_deterministic(raw_notes)


# ---------------------------------------------------------------------------
# SoundFlow script generator (stub — real Pro Tools commands need SoundFlow installed)
# ---------------------------------------------------------------------------

def _soundflow_body(changes: list[dict], session_path: str | None) -> str:
    script = {
        "metadata": {
            "generated_by": "ai-audio-studio",
            "session_path": session_path,
            "change_count": len(changes),
            "note": "SoundFlow execution requires the ai-audio-studio SoundFlow package installed",
        },
        "steps": [
            {
                "action": "setFader" if c.get("parameter") == "level" else "comment",
                "track": c.get("element", ""),
                "direction": c.get("direction", "adjust"),
                "value_db": c.get("value_db"),
                "comment": c.get("human_readable", ""),
            }
            for c in changes
        ],
    }
    return json.dumps(script, indent=2) + "\n"


# ---------------------------------------------------------------------------
# Artifact writer
# ---------------------------------------------------------------------------

def write_revision_artifacts(
    session_dir: Path,
    daw: str,
    changes: list[dict],
    session_path: str | None,
    session_manifest: dict | None = None,
    completion_marker_path: str | None = None,
) -> dict:
    normalized_path = session_dir / f"{daw}_revision_changes.json"
    normalized_path.write_text(json.dumps(changes, indent=2))

    if daw == "reaper":
        script_path = session_dir / "reaper_revision_script.lua"
        lua_source = build_reascript(
            changes,
            session_manifest=session_manifest,
            completion_marker_path=completion_marker_path,
            session_path=session_path,
        )
        script_path.write_text(lua_source)
    else:
        script_path = session_dir / "protools_revision_script.json"
        script_path.write_text(_soundflow_body(changes, session_path))

    return {
        "changes_path": str(normalized_path),
        "script_path": str(script_path),
    }


# ---------------------------------------------------------------------------
# Session manifest loader
# ---------------------------------------------------------------------------

async def load_session_manifest(pool: asyncpg.Pool, project_id: str) -> dict | None:
    """Load the most recent session manifest for a project from the DB."""
    row = await pool.fetchrow(
        "SELECT * FROM session_manifests WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1",
        project_id,
    )
    if row is None:
        return None
    data = dict(row)
    stems = data.get("stems")
    if isinstance(stems, str):
        try:
            stems = json.loads(stems)
        except json.JSONDecodeError:
            stems = []
    data["stems"] = stems or []
    data["tracks"] = [{"name": stem.get("name", "")} for stem in data["stems"] if isinstance(stem, dict)]
    return data


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("revision_parser", {})
    pending_jobs = await pool.fetchval(
        "SELECT COUNT(*) FROM jobs WHERE module='revision-parser' AND status='awaiting-approval'"
    )
    revision_count = await pool.fetchval("SELECT COUNT(*) FROM revisions")
    ollama_ready = await llm.is_available(llm.PLANNER_MODEL)
    return {
        "status": "ok",
        "module": "revision-parser",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "pending_approvals": pending_jobs,
        "revision_count": revision_count,
        "llm_ready": ollama_ready,
        "llm_model": llm.PLANNER_MODEL,
    }


@app.post("/parse-revisions", status_code=201)
async def parse_revisions(body: ParseRevisionsBody):
    pool = await get_pool()
    project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.execution_mode == "remote":
        job = await pool.fetchrow(
            """INSERT INTO jobs
               (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
               VALUES ($1,'revision-parser','parse-revisions','operator',$2::jsonb,'pending',false,'worker:revision-parser')
               RETURNING *""",
            body.project_id,
            json.dumps({"daw": body.daw, "session_path": body.session_path, "worker_slug": body.worker_slug}),
        )
        task = await pool.fetchrow(
            """INSERT INTO worker_tasks
               (job_id, project_id, worker_slug, task_type, required_capability, payload, priority)
               VALUES ($1,$2,$3,'parse-revisions','revision-parser',$4::jsonb,'normal')
               RETURNING *""",
            job["id"],
            body.project_id,
            body.worker_slug,
            json.dumps(
                {
                    "project_id": body.project_id,
                    "project_slug": project["slug"],
                    "raw_notes": body.raw_notes,
                    "daw": body.daw,
                    "session_path": body.session_path,
                    "shared_projects_path": os.environ.get("SHARED_PROJECTS_PATH", "/data/projects"),
                }
            ),
        )
        return {"job_id": str(job["id"]), "task_id": str(task["id"]), "status": "queued-for-worker"}

    # Load session manifest for track-name-aware parsing
    session_manifest = await load_session_manifest(pool, body.project_id)
    session_tracks: list[str] | None = None
    if session_manifest:
        session_tracks = [t.get("name", "") for t in session_manifest.get("tracks", []) if t.get("name")]

    changes = await parse_changes(body.raw_notes, session_tracks)
    executable_changes = [c for c in changes if c["confidence"] >= 0.65]

    project_dir = Path(os.environ.get("SHARED_PROJECTS_PATH", "/data/projects")) / project["slug"] / "session"
    project_dir.mkdir(parents=True, exist_ok=True)

    artifact_paths = write_revision_artifacts(
        project_dir,
        body.daw,
        executable_changes,
        body.session_path,
        session_manifest=session_manifest,
    )

    # Store full payload including script preview in trigger_payload
    trigger_payload = {
        "daw": body.daw,
        "session_path": body.session_path,
        "worker_slug": body.worker_slug,
        "changes_preview": [
            {"element": c["element"], "parameter": c["parameter"],
             "direction": c["direction"], "human_readable": c["human_readable"]}
            for c in executable_changes[:10]
        ],
        "script_path": artifact_paths["script_path"],
        "total_changes": len(changes),
        "executable_changes": len(executable_changes),
    }

    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,'revision-parser','parse-revisions','operator',$2::jsonb,'awaiting-approval',true,'worker:revision-parser')
           RETURNING *""",
        body.project_id,
        json.dumps(trigger_payload),
    )
    revision = await pool.fetchrow(
        """INSERT INTO revisions
           (project_id, job_id, raw_notes, parsed_changes, soundflow_script, reascript_path, status)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,'parsed')
           RETURNING *""",
        body.project_id,
        job["id"],
        body.raw_notes,
        json.dumps(changes),
        artifact_paths["script_path"] if body.daw == "protools" else None,
        artifact_paths["script_path"] if body.daw == "reaper" else None,
    )
    return {"job_id": str(job["id"]), "revision_id": str(revision["id"]), "changes": changes}
