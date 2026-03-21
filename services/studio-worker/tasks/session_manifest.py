"""Session manifest helpers for DAW-side planning."""

from __future__ import annotations

from pathlib import Path


SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".flac", ".mp3"}


def build_session_manifest(payload: dict) -> dict:
    project_root = Path(payload["project_root"])
    stems_dir = Path(payload.get("stems_dir") or project_root / "stems")
    session_path = Path(payload.get("session_path") or project_root / "session")
    references_dir = Path(payload.get("references_dir") or project_root / "references")

    stems = []
    if stems_dir.exists():
        for item in sorted(stems_dir.iterdir()):
            if item.is_file() and item.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS:
                stems.append(
                    {
                        "name": item.name,
                        "path": str(item),
                        "extension": item.suffix.lower(),
                        "size_bytes": item.stat().st_size,
                    }
                )

    references = []
    if references_dir.exists():
        for item in sorted(references_dir.iterdir()):
            if item.is_file():
                references.append({"name": item.name, "path": str(item)})

    session_files = []
    if session_path.exists():
        if session_path.is_file():
            session_files.append({"name": session_path.name, "path": str(session_path)})
        else:
            for item in sorted(session_path.iterdir()):
                if item.is_file():
                    session_files.append({"name": item.name, "path": str(item)})

    return {
        "project_root": str(project_root),
        "stems_dir": str(stems_dir),
        "session_path": str(session_path),
        "reference_count": len(references),
        "stem_count": len(stems),
        "stems": stems,
        "references": references,
        "session_files": session_files,
        "readiness": {
            "has_stems": bool(stems),
            "has_session_files": bool(session_files),
            "ready_for_planning": bool(stems or session_files),
        },
    }
