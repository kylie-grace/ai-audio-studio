"""Path and payload helpers for the studio worker."""

from __future__ import annotations

import json
import re
from pathlib import Path


def decode_jsonb(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


def path_mappings(path_translation_json: str) -> dict[str, str]:
    try:
        data = json.loads(path_translation_json)
    except json.JSONDecodeError:
        return {}
    return {str(key): str(value) for key, value in data.items()}


def translate_path(raw_path: str, path_translation_json: str) -> Path:
    for source_prefix, target_prefix in path_mappings(path_translation_json).items():
        if raw_path.startswith(source_prefix):
            raw_path = raw_path.replace(source_prefix, target_prefix, 1)
            break
    return Path(raw_path)
