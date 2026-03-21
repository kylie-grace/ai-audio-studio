"""Base adapter helpers for DAW and filesystem execution."""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionAdapter, ExecutionResult, RenderedArtifact


def prepare_execution_workspace(session_path: Path, script_path: Path, adapter_slug: str, payload: dict) -> dict:
    run_root = session_path.parent / ".ai-audio-studio" / "runs"
    run_root.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir = run_root / f"{adapter_slug}-{timestamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    session_copy = run_dir / session_path.name
    script_copy = run_dir / script_path.name
    shutil.copy2(session_path, session_copy)
    shutil.copy2(script_path, script_copy)

    manifest = {
        "adapter": adapter_slug,
        "created_at": timestamp,
        "dry_run": bool(payload.get("dry_run")),
        "original_session_path": str(session_path),
        "working_session_path": str(session_copy),
        "original_script_path": str(script_path),
        "working_script_path": str(script_copy),
    }
    manifest_path = run_dir / "execution-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    return {
        "run_dir": run_dir,
        "session_copy": session_copy,
        "script_copy": script_copy,
        "manifest_path": manifest_path,
        "manifest": manifest,
    }


__all__ = [
    "ArtifactRef",
    "ExecutionAdapter",
    "ExecutionResult",
    "RenderedArtifact",
    "prepare_execution_workspace",
]
