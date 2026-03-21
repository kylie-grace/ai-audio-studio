"""Delivery packaging task."""

from __future__ import annotations

import json
import shutil

from paths import translate_path


def execute_package_delivery(payload: dict, settings) -> dict:
    project_slug = payload["project_slug"]
    delivery_root = translate_path(
        payload.get("delivery_path", settings.delivery_path),
        settings.path_translation_json,
        settings.worker_platform,
    ) / project_slug / payload.get("package_name", "delivery-package")
    delivery_root.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for file_path in payload["file_paths"]:
        source = translate_path(file_path, settings.path_translation_json, settings.worker_platform)
        if not source.exists():
            raise FileNotFoundError(f"Missing delivery file: {source}")
        target = delivery_root / source.name
        shutil.copy2(source, target)
        copied.append(str(target))
    manifest_path = delivery_root / "manifest.json"
    manifest_path.write_text(json.dumps({"files": copied}, indent=2))
    return {"delivery_path": str(delivery_root), "manifest_path": str(manifest_path), "files": copied}
