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


def _default_adapter_capabilities() -> list[str]:
    adapters = _split_csv(os.environ.get("WORKSTATION_ADAPTER_CAPABILITIES", ""))
    if adapters:
        return adapters
    worker_caps = set(_split_csv(os.environ.get("WORKER_CAPABILITIES", "")))
    inferred: list[str] = []
    if "execute-soundflow" in worker_caps:
        inferred.append("execute-soundflow")
    if "execute-reascript" in worker_caps:
        inferred.append("execute-reascript")
    return inferred or ["execute-reascript"]


def _default_supported_daws() -> list[str]:
    daws = _split_csv(os.environ.get("WORKSTATION_SUPPORTED_DAWS", ""))
    if daws:
        return daws
    adapters = set(_default_adapter_capabilities())
    inferred: list[str] = []
    if "execute-soundflow" in adapters:
        inferred.append("protools")
    if "execute-reascript" in adapters:
        inferred.append("reaper")
    return inferred or ["reaper"]


def default_module_settings() -> dict[str, Any]:
    return {
        "lead_intake": {
            "enabled": True,
            "minimum_fit_score": 55,
            "response_sla_hours": 24,
            "auto_create_projects": True,
        },
        "inbox_triage": {
            "enabled": True,
            "ignore_noise": True,
            "high_priority_types": ["payment", "revision-request"],
        },
        "content_pipeline": {
            "enabled": True,
            "default_platforms": ["instagram", "facebook"],
            "require_assets": False,
            "approval_required": True,
        },
        "audio_qc": {
            "enabled": True,
            "default_target": "streaming",
            "hard_fail_on_clipping": True,
        },
        "session_prep": {
            "enabled": True,
            "filename_space_warning": True,
            "remote_enabled": True,
        },
        "revision_parser": {
            "enabled": True,
            "default_daw": "reaper",
            "confidence_threshold": 0.85,
        },
        "delivery_packager": {
            "enabled": True,
            "require_qc_pass": True,
            "include_manifest": True,
        },
        "mix_planner": {
            "enabled": True,
            "default_focus": ["vocals", "drums", "low-end translation"],
        },
    }


def default_workspace_settings() -> dict[str, Any]:
    operator_name = (
        _split_csv(os.environ.get("AUTHORIZED_ACTORS", ""))[:1]
        or [os.environ.get("ENGINEER_NAME", "owner").strip() or "owner"]
    )[0]
    return {
        "studio_name": os.environ.get("STUDIO_NAME", "").strip(),
        "host_machine_type": os.environ.get("HOST_MACHINE_TYPE", "other"),
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
            "display_name": os.environ.get("WORKER_DISPLAY_NAME", ""),
            "platform": os.environ.get("WORKER_PLATFORM", "macos"),
            "default_daw": os.environ.get("WORKSTATION_DEFAULT_DAW", "reaper"),
            "supported_daws": _default_supported_daws(),
            "adapter_capabilities": _default_adapter_capabilities(),
            "dry_run_daw": os.environ.get("STUDIO_WORKER_DRY_RUN_DAW", "").strip().lower() in {"1", "true", "yes", "on"},
            "reaper_binary_path": os.environ.get("REAPER_BINARY_PATH", "").strip(),
            "protools_app_path": os.environ.get("PROTOOLS_APP_PATH", "").strip(),
            "soundflow_cli_path": os.environ.get("SOUNDFLOW_CLI_PATH", "").strip(),
            "notes": os.environ.get("WORKSTATION_NOTES", "").strip(),
        },
        "module_settings": default_module_settings(),
        "onboarding_complete": False,
    }


def serialize_workspace_settings(row) -> dict[str, Any]:
    if row is None:
        return default_workspace_settings()

    raw = dict(row)

    return {
        "studio_name": raw["studio_name"],
        "host_machine_type": raw.get("host_machine_type") or "other",
        "deployment_mode": raw["deployment_mode"],
        "public_base_url": raw["public_base_url"],
        "https_mode": raw["https_mode"],
        "operator_name": raw["operator_name"],
        "shared_paths": decode_jsonb(raw["shared_paths"]),
        "style_seed": decode_jsonb(raw["style_seed"]),
        "alert_destinations": decode_jsonb(raw["alert_destinations"]),
        "integrations": decode_jsonb(raw["integrations"]),
        "worker": decode_jsonb(raw["worker_config"]),
        "module_settings": decode_jsonb(raw.get("module_settings") or "{}") or default_module_settings(),
        "onboarding_complete": raw["onboarding_complete"],
        "created_at": raw["created_at"].isoformat() if raw.get("created_at") else None,
        "updated_at": raw["updated_at"].isoformat() if raw.get("updated_at") else None,
    }


def workspace_status(settings: dict[str, Any], style_profile_count: int) -> dict[str, Any]:
    shared_paths = settings.get("shared_paths") or {}
    style_seed = settings.get("style_seed") or {}
    alert_destinations = settings.get("alert_destinations") or {}
    integrations = settings.get("integrations") or {}
    worker = settings.get("worker") or {}
    module_settings = settings.get("module_settings") or {}

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

    readiness_checks = [
        {
            "slug": "identity",
            "name": "Studio identity",
            "status": "ready" if settings.get("studio_name") and settings.get("operator_name") and settings.get("host_machine_type") else "needs-attention",
            "detail": f"Studio name, host type ({settings.get('host_machine_type') or 'unknown'}), and primary operator are captured."
            if settings.get("studio_name") and settings.get("operator_name") and settings.get("host_machine_type")
            else "Set the studio name and operator identity.",
        },
        {
            "slug": "shared-paths",
            "name": "Shared paths",
            "status": "ready"
            if shared_paths.get("projects") and shared_paths.get("deliveries") and shared_paths.get("approval_queue")
            else "needs-attention",
            "detail": "Project, delivery, and approval paths are configured."
            if shared_paths.get("projects") and shared_paths.get("deliveries") and shared_paths.get("approval_queue")
            else "Fill in the shared storage paths used by the stack.",
        },
        {
            "slug": "style-context",
            "name": "Style context",
            "status": "ready" if style_seed.get("raw_text", "").strip() and style_profile_count > 0 else "needs-attention",
            "detail": f"{style_profile_count} studio style profile(s) available."
            if style_seed.get("raw_text", "").strip() and style_profile_count > 0
            else "Provide pasted guidance or source files for the studio tone.",
        },
        {
            "slug": "network",
            "name": "Operator front door",
            "status": "ready" if settings.get("public_base_url") else "partial",
            "detail": settings.get("public_base_url") or "No explicit operator URL saved yet. LAN HTTP remains usable during bring-up.",
        },
        {
            "slug": "alerts",
            "name": "Alert destinations",
            "status": "ready"
            if alert_destinations.get("email_to") or alert_destinations.get("webhook_url")
            else "partial",
            "detail": "Email or webhook alert delivery is configured."
            if alert_destinations.get("email_to") or alert_destinations.get("webhook_url")
            else "Dashboard alerts work by default. Add email or webhook delivery for escalation.",
        },
        {
            "slug": "integrations",
            "name": "Integrations",
            "status": "ready"
            if sum(1 for enabled in integrations.values() if enabled) >= 2
            else "partial",
            "detail": f"{sum(1 for enabled in integrations.values() if enabled)} integration flag(s) enabled.",
        },
        {
            "slug": "worker-posture",
            "name": "Worker posture",
            "status": "ready"
            if settings.get("deployment_mode") == "control_plane_plus_worker" and worker.get("worker_slug") and worker.get("worker_api_base_url")
            else "optional"
            if settings.get("deployment_mode") == "single_machine"
            else "needs-attention",
            "detail": "Single-machine mode is active; a second worker Mac is optional."
            if settings.get("deployment_mode") == "single_machine"
            else "Worker slug and API URL are configured."
            if worker.get("worker_slug") and worker.get("worker_api_base_url")
            else "Worker mode is enabled but worker identity or API URL is missing.",
        },
        {
            "slug": "service-tuning",
            "name": "Module settings",
            "status": "ready"
            if module_settings and all(isinstance(value, dict) and value.get("enabled", True) for value in module_settings.values())
            else "partial",
            "detail": f"{len(module_settings)} module configuration block(s) persisted."
            if module_settings
            else "No persisted module settings found yet.",
        },
    ]
    readiness_summary = {
        "ready_count": sum(1 for check in readiness_checks if check["status"] == "ready"),
        "partial_count": sum(1 for check in readiness_checks if check["status"] == "partial"),
        "needs_attention_count": sum(1 for check in readiness_checks if check["status"] == "needs-attention"),
        "optional_count": sum(1 for check in readiness_checks if check["status"] == "optional"),
    }

    return {
        "onboarding_required": not onboarding_complete,
        "onboarding_complete": onboarding_complete,
        "missing_fields": missing_fields,
        "style_profile_count": style_profile_count,
        "readiness_checks": readiness_checks,
        "readiness_summary": readiness_summary,
    }
