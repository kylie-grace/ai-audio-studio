"""Path and payload helpers for the studio worker."""

from __future__ import annotations

import json
import re
from pathlib import Path

WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:[\\/]")


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


def _platform_is_windows(platform_name: str | None) -> bool:
    return str(platform_name or "").strip().lower().startswith("windows")


def _path_is_windows_like(raw_path: str) -> bool:
    return bool(WINDOWS_DRIVE_RE.match(raw_path)) or raw_path.startswith("\\\\")


def _canonicalize(raw_path: str) -> str:
    text = str(raw_path).strip()
    if not text:
        return text
    text = text.replace("\\", "/")
    while "//" in text and not text.startswith("//"):
        text = text.replace("//", "/")
    if len(text) > 1 and text.endswith("/"):
        text = text.rstrip("/")
    return text


def _casefold_for_compare(raw_path: str) -> str:
    return _canonicalize(raw_path).casefold()


def _render_path(raw_path: str, windows_like: bool) -> str:
    canonical = _canonicalize(raw_path)
    return canonical.replace("/", "\\") if windows_like else canonical


def translate_path(raw_path: str, path_translation_json: str, platform_name: str | None = None) -> Path:
    translated_path = str(raw_path)
    raw_compare = _casefold_for_compare(translated_path)

    for source_prefix, target_prefix in path_mappings(path_translation_json).items():
        source_compare = _casefold_for_compare(source_prefix)
        if raw_compare == source_compare or raw_compare.startswith(source_compare + "/"):
            remainder = _canonicalize(translated_path)[len(_canonicalize(source_prefix)) :].lstrip("/")
            target_windows = _platform_is_windows(platform_name) or _path_is_windows_like(target_prefix)
            translated_path = target_prefix
            if remainder:
                translated_path = f"{_canonicalize(target_prefix)}/{remainder}"
            return Path(_render_path(translated_path, target_windows))

    output_windows = _platform_is_windows(platform_name) or _path_is_windows_like(translated_path)
    return Path(_render_path(translated_path, output_windows))
