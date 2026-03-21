"""Session manifest helpers for DAW-side planning."""

from __future__ import annotations

import re
from pathlib import Path


SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".flac", ".mp3"}
SESSION_EXTENSIONS = {".rpp", ".ptx", ".ptf", ".logicx"}


def _session_type_for_path(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".rpp":
        return "reaper"
    if suffix in {".ptx", ".ptf"}:
        return "protools"
    if suffix == ".logicx":
        return "logic"
    return "generic"


def _parse_rpp(path: Path) -> dict:
    text = path.read_text(errors="ignore")
    track_names: list[str] = []
    markers: list[dict] = []
    tempos: list[float] = []

    for match in re.finditer(r'^\s*NAME\s+"([^"]+)"', text, re.MULTILINE):
        track_names.append(match.group(1))

    for match in re.finditer(r'^\s*MARKER\s+(\d+)\s+([-\d.]+)\s+"([^"]+)"', text, re.MULTILINE):
        markers.append(
            {
                "index": int(match.group(1)),
                "position": float(match.group(2)),
                "name": match.group(3),
            }
        )

    for match in re.finditer(r'^\s*TEMPO\s+([-\d.]+)', text, re.MULTILINE):
        try:
            tempos.append(float(match.group(1)))
        except ValueError:
            continue

    return {
        "session_type": "reaper",
        "track_count": len(track_names),
        "track_names": track_names[:24],
        "marker_count": len(markers),
        "markers": markers[:12],
        "tempo_candidates": tempos[:8],
        "introspection_confidence": 0.92 if track_names else 0.65,
    }


def _inspect_session_files(session_files: list[dict]) -> dict:
    primary_session = next(
        (
            Path(item["path"])
            for item in session_files
            if Path(item["path"]).suffix.lower() in SESSION_EXTENSIONS
        ),
        None,
    )
    if primary_session is None:
        return {
            "session_type": "generic",
            "track_count": 0,
            "track_names": [],
            "marker_count": 0,
            "markers": [],
            "tempo_candidates": [],
            "introspection_confidence": 0.35 if session_files else 0.0,
            "primary_session_file": None,
        }

    details = {
        "session_type": _session_type_for_path(primary_session),
        "track_count": 0,
        "track_names": [],
        "marker_count": 0,
        "markers": [],
        "tempo_candidates": [],
        "introspection_confidence": 0.55,
        "primary_session_file": str(primary_session),
    }
    if primary_session.suffix.lower() == ".rpp":
        details.update(_parse_rpp(primary_session))
        details["primary_session_file"] = str(primary_session)
    return details


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
            session_files.append({"name": session_path.name, "path": str(session_path), "type": _session_type_for_path(session_path)})
        else:
            for item in sorted(session_path.iterdir()):
                if item.is_file():
                    session_files.append({"name": item.name, "path": str(item), "type": _session_type_for_path(item)})

    session_details = _inspect_session_files(session_files)
    confidence = 0.0
    if stems:
        confidence += 0.35
    if references:
        confidence += 0.1
    confidence += min(session_details["introspection_confidence"], 0.55)
    confidence = round(min(confidence, 0.99), 2)

    return {
        "project_root": str(project_root),
        "stems_dir": str(stems_dir),
        "session_path": str(session_path),
        "reference_count": len(references),
        "stem_count": len(stems),
        "stems": stems,
        "references": references,
        "session_files": session_files,
        "session_details": session_details,
        "readiness": {
            "has_stems": bool(stems),
            "has_session_files": bool(session_files),
            "ready_for_planning": bool(stems or session_files),
            "confidence_score": confidence,
        },
    }
