"""Pure helpers for workspace bootstrap settings."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

try:
    from .style_profiles import DEFAULT_STYLE_PROFILE_NAME, DEFAULT_STYLE_PROFILE_TEXT, decode_jsonb
except ImportError:  # pragma: no cover - used by direct-file unit tests
    spec = importlib.util.spec_from_file_location("crm_style_profiles", Path(__file__).with_name("style_profiles.py"))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    DEFAULT_STYLE_PROFILE_NAME = module.DEFAULT_STYLE_PROFILE_NAME
    DEFAULT_STYLE_PROFILE_TEXT = module.DEFAULT_STYLE_PROFILE_TEXT
    decode_jsonb = module.decode_jsonb


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def default_workspace_settings() -> dict[str, Any]:
    operator_name = (
        _split_csv(os.environ.get("AUTHORIZED_ACTORS", ""))[:1]
        or [os.environ.get("ENGINEER_NAME", "owner").strip() or "owner"]
    )[0]
    return {
        "studio_name": os.environ.get("STUDIO_NAME", "").strip(),
        "deployment_mode": "single_machine",
        "public_base_url": "",
        "https_mode": "local_http",
        "operator_name": operator_name,
        "shared_paths": {
            "projects": os.environ.get("SHARED_PROJECTS_PATH", ""),
            "deliveries": os.environ.get("DELIVERY_PATH", ""),
            "draft_queue": os.environ.get("DRAFT_QUEUE_PATH", ""),
            "approval_queue": os.environ.get("APPROVAL_QUEUE_PATH", ""),
            "incoming_stems": os.environ.get("WATCHED_STEMS_PATH", ""),
        },
        "style_seed": {
            "name": DEFAULT_STYLE_PROFILE_NAME,
            "raw_text": DEFAULT_STYLE_PROFILE_TEXT,
            "source_paths": [],
        },
        "alert_destinations": {
            "email_to": _split_csv(os.environ.get("ALERT_EMAIL_TO", "")),
            "webhook_url": os.environ.get("ALERT_WEBHOOK_URL", "").strip(),
        },
        "integrations": {
            "n8n": True,
            "gmail_readonly": bool(os.environ.get("GMAIL_CLIENT_ID")),
            "gmail_send": bool(os.environ.get("GMAIL_SEND_CLIENT_ID")),
            "instagram": bool(os.environ.get("INSTAGRAM_ACCESS_TOKEN")),
            "facebook": bool(os.environ.get("FACEBOOK_ACCESS_TOKEN")),
        },
        "worker": {
            "enabled": False,
            "worker_slug": os.environ.get("WORKER_SLUG", ""),
            "worker_api_base_url": os.environ.get("WORKER_API_BASE_URL", ""),
        },
        "onboarding_complete": False,
    }


def serialize_workspace_settings(row) -> dict[str, Any]:
    if row is None:
        return default_workspace_settings()

    raw = dict(row)

    return {
        "studio_name": raw["studio_name"],
        "deployment_mode": raw["deployment_mode"],
        "public_base_url": raw["public_base_url"],
        "https_mode": raw["https_mode"],
        "operator_name": raw["operator_name"],
        "shared_paths": decode_jsonb(raw["shared_paths"]),
        "style_seed": decode_jsonb(raw["style_seed"]),
        "alert_destinations": decode_jsonb(raw["alert_destinations"]),
        "integrations": decode_jsonb(raw["integrations"]),
        "worker": decode_jsonb(raw["worker_config"]),
        "onboarding_complete": raw["onboarding_complete"],
        "created_at": raw["created_at"].isoformat() if raw.get("created_at") else None,
        "updated_at": raw["updated_at"].isoformat() if raw.get("updated_at") else None,
    }


def workspace_status(settings: dict[str, Any], style_profile_count: int) -> dict[str, Any]:
    shared_paths = settings.get("shared_paths") or {}
    style_seed = settings.get("style_seed") or {}
    worker = settings.get("worker") or {}

    missing_fields: list[str] = []
    if not settings.get("studio_name") or settings["studio_name"] == "Your Studio Name":
        missing_fields.append("studio_name")
    if not settings.get("operator_name"):
        missing_fields.append("operator_name")
    if not shared_paths.get("projects"):
        missing_fields.append("shared_paths.projects")
    if not shared_paths.get("deliveries"):
        missing_fields.append("shared_paths.deliveries")
    if not shared_paths.get("approval_queue"):
        missing_fields.append("shared_paths.approval_queue")
    if not style_seed.get("raw_text", "").strip():
        missing_fields.append("style_seed.raw_text")
    if settings.get("deployment_mode") == "control_plane_plus_worker":
        if not worker.get("worker_slug"):
            missing_fields.append("worker.worker_slug")
        if not worker.get("worker_api_base_url"):
            missing_fields.append("worker.worker_api_base_url")

    onboarding_complete = bool(settings.get("onboarding_complete")) and not missing_fields

    return {
        "onboarding_required": not onboarding_complete,
        "onboarding_complete": onboarding_complete,
        "missing_fields": missing_fields,
        "style_profile_count": style_profile_count,
    }
