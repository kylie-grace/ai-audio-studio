"""Runtime configuration for the studio worker."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass
import json
from urllib.error import URLError
from urllib.request import urlopen


@dataclass(frozen=True)
class Settings:
    project_state_url: str
    worker_slug: str
    worker_display_name: str
    worker_platform: str
    worker_api_base_url: str | None
    poll_interval_seconds: float
    capabilities: list[str]
    shared_projects_path: str
    delivery_path: str
    path_translation_json: str
    dry_run_daw: bool
    worker_api_token: str | None


def _workspace_settings_url() -> str | None:
    explicit = os.environ.get("WORKSPACE_SETTINGS_URL", "").strip()
    if explicit:
        return explicit
    crm_api_url = os.environ.get("CRM_API_URL", "").rstrip("/")
    if crm_api_url:
        return f"{crm_api_url}/workspace-settings"
    return None


def load_workspace_settings() -> dict:
    url = _workspace_settings_url()
    if not url:
        return {}
    try:
        with urlopen(url, timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, URLError, ValueError, json.JSONDecodeError):
        return {}


def _first_present(*values: str | None) -> str | None:
    for value in values:
        if value is None:
            continue
        text = value.strip()
        if text:
            return text
    return None


def _csv_or_default(env_name: str, default_csv: str) -> list[str]:
    raw = os.environ.get(env_name, default_csv)
    return [item.strip() for item in raw.split(",") if item.strip()]


def load_settings() -> Settings:
    workspace = load_workspace_settings()
    shared_paths = workspace.get("shared_paths") or {}
    worker_config = workspace.get("worker") or {}
    studio_name = str(workspace.get("studio_name") or "").strip()

    return Settings(
        project_state_url=os.environ["PROJECT_STATE_URL"].rstrip("/"),
        worker_slug=_first_present(os.environ.get("WORKER_SLUG"), worker_config.get("worker_slug"), socket.gethostname().lower())
        or socket.gethostname().lower(),
        worker_display_name=_first_present(
            os.environ.get("WORKER_DISPLAY_NAME"),
            f"{studio_name} Worker" if studio_name else None,
            "Studio Worker",
        )
        or "Studio Worker",
        worker_platform=os.environ.get("WORKER_PLATFORM", "macos"),
        worker_api_base_url=_first_present(os.environ.get("WORKER_API_BASE_URL"), worker_config.get("worker_api_base_url")),
        poll_interval_seconds=float(os.environ.get("POLL_INTERVAL_SECONDS", "5")),
        capabilities=_csv_or_default("WORKER_CAPABILITIES", "session-prep,revision-parser,delivery-packager"),
        shared_projects_path=_first_present(os.environ.get("SHARED_PROJECTS_PATH"), shared_paths.get("projects"), "/data/projects")
        or "/data/projects",
        delivery_path=_first_present(os.environ.get("DELIVERY_PATH"), shared_paths.get("deliveries"), "/data/deliveries")
        or "/data/deliveries",
        path_translation_json=os.environ.get("PATH_TRANSLATION_JSON", "{}"),
        dry_run_daw=os.environ.get("STUDIO_WORKER_DRY_RUN_DAW", "false").lower() in {"1", "true", "yes", "on"},
        worker_api_token=os.environ.get("WORKER_API_TOKEN"),
    )
