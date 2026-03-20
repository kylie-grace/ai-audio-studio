"""Filesystem-backed session preparation task."""

from __future__ import annotations

import json
import shutil

from paths import slugify, translate_path


def execute_prepare_session(payload: dict, settings) -> dict:
    source_dir = translate_path(payload["source_dir"], settings.path_translation_json)
    project_slug = payload.get("project_slug") or slugify(payload.get("client_name", source_dir.name))
    shared_root = translate_path(payload.get("shared_projects_path", settings.shared_projects_path), settings.path_translation_json)
    project_root = shared_root / project_slug
    stems_dir = project_root / "stems"
    session_dir = project_root / "session"
    deliveries_dir = project_root / "deliveries"
    for path in (stems_dir, session_dir, deliveries_dir):
        path.mkdir(parents=True, exist_ok=True)
    stems: list[dict] = []
    issues: list[dict] = []
    for file_path in sorted(source_dir.iterdir()):
        if not file_path.is_file():
            continue
        target = stems_dir / file_path.name
        if file_path.suffix.lower() not in {".wav", ".aiff", ".aif"}:
            issues.append({"stem": file_path.name, "severity": "ERROR", "message": "Unsupported format"})
            continue
        shutil.copy2(file_path, target)
        stems.append({"name": file_path.name, "path": str(target), "valid": True})
    report_path = session_dir / "prep-report.json"
    report_path.write_text(json.dumps({"stems": stems, "issues": issues}, indent=2))
    return {
        "project_slug": project_slug,
        "stems": stems,
        "issues": issues,
        "prep_report_path": str(report_path),
    }
