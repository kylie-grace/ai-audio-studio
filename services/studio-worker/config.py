"""Runtime configuration for the studio worker."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass
import json
import platform
from pathlib import Path
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
    reaper_binary_path: str | None
    protools_app_path: str | None
    soundflow_cli_path: str | None
    wavelab_app_path: str | None
    workstation_profile: dict


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


def _default_worker_platform() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "macos"
    if system.startswith("win"):
        return "windows"
    return system or "macos"


def _infer_supported_daws(capabilities: list[str], worker_config: dict) -> list[str]:
    configured = worker_config.get("supported_daws")
    if isinstance(configured, list) and configured:
        return [str(item).strip() for item in configured if str(item).strip()]
    explicit = os.environ.get("WORKSTATION_SUPPORTED_DAWS", "").strip()
    if explicit:
        return [item.strip() for item in explicit.split(",") if item.strip()]
    inferred: list[str] = []
    if "execute-soundflow" in capabilities:
        inferred.append("protools")
    if "execute-reascript" in capabilities:
        inferred.append("reaper")
    return inferred or ["reaper"]


def _adapter_capabilities(capabilities: list[str], worker_config: dict) -> list[str]:
    configured = worker_config.get("adapter_capabilities")
    if isinstance(configured, list) and configured:
        return [str(item).strip() for item in configured if str(item).strip()]
    explicit = os.environ.get("WORKSTATION_ADAPTER_CAPABILITIES", "").strip()
    if explicit:
        return [item.strip() for item in explicit.split(",") if item.strip()]
    return [capability for capability in capabilities if capability in {"execute-soundflow", "execute-reascript"}]


def _bool_or_default(value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def load_settings() -> Settings:
    workspace = load_workspace_settings()
    shared_paths = workspace.get("shared_paths") or {}
    worker_config = workspace.get("worker") or {}
    studio_name = str(workspace.get("studio_name") or "").strip()
    worker_platform = os.environ.get("WORKER_PLATFORM", worker_config.get("platform", _default_worker_platform()))
    capabilities = _csv_or_default("WORKER_CAPABILITIES", "session-prep,revision-parser,delivery-packager")
    worker_display_name = _first_present(
        os.environ.get("WORKER_DISPLAY_NAME"),
        worker_config.get("display_name"),
        f"{studio_name} Worker" if studio_name else None,
        "Studio Worker",
    ) or "Studio Worker"
    supported_daws = _infer_supported_daws(capabilities, worker_config)
    dry_run_daw = _bool_or_default(os.environ.get("STUDIO_WORKER_DRY_RUN_DAW"), _bool_or_default(worker_config.get("dry_run_daw"), False))
    reaper_binary_path = _first_present(
        os.environ.get("REAPER_BINARY_PATH"),
        worker_config.get("reaper_binary_path"),
        (
            "/Applications/REAPER.app/Contents/MacOS/REAPER"
            if worker_platform == "macos" and Path("/Applications/REAPER.app/Contents/MacOS/REAPER").exists()
            else None
        ),
    )
    protools_app_path = _first_present(
        os.environ.get("PROTOOLS_APP_PATH"),
        worker_config.get("protools_app_path"),
        "/Applications/Pro Tools.app" if worker_platform == "macos" and Path("/Applications/Pro Tools.app").exists() else None,
    )
    soundflow_cli_path = _first_present(
        os.environ.get("SOUNDFLOW_CLI_PATH"),
        worker_config.get("soundflow_cli_path"),
        (
            "/Applications/SoundFlow.app/Contents/MacOS/SoundFlow"
            if worker_platform == "macos" and Path("/Applications/SoundFlow.app/Contents/MacOS/SoundFlow").exists()
            else None
        ),
    )
    wavelab_app_path = _first_present(
        os.environ.get("WAVELAB_APP_PATH"),
        worker_config.get("wavelab_app_path"),
    )

    return Settings(
        project_state_url=os.environ["PROJECT_STATE_URL"].rstrip("/"),
        worker_slug=_first_present(os.environ.get("WORKER_SLUG"), worker_config.get("worker_slug"), socket.gethostname().lower())
        or socket.gethostname().lower(),
        worker_display_name=worker_display_name,
        worker_platform=worker_platform,
        worker_api_base_url=_first_present(os.environ.get("WORKER_API_BASE_URL"), worker_config.get("worker_api_base_url")),
        poll_interval_seconds=float(os.environ.get("POLL_INTERVAL_SECONDS", "5")),
        capabilities=capabilities,
        shared_projects_path=_first_present(os.environ.get("SHARED_PROJECTS_PATH"), shared_paths.get("projects"), "/data/projects")
        or "/data/projects",
        delivery_path=_first_present(os.environ.get("DELIVERY_PATH"), shared_paths.get("deliveries"), "/data/deliveries")
        or "/data/deliveries",
        path_translation_json=os.environ.get("PATH_TRANSLATION_JSON", "{}"),
        dry_run_daw=dry_run_daw,
        worker_api_token=os.environ.get("WORKER_API_TOKEN"),
        reaper_binary_path=reaper_binary_path,
        protools_app_path=protools_app_path,
        soundflow_cli_path=soundflow_cli_path,
        wavelab_app_path=wavelab_app_path,
        workstation_profile={
            "display_name": worker_display_name,
            "platform": worker_platform,
            "default_daw": _first_present(
                os.environ.get("WORKSTATION_DEFAULT_DAW"),
                worker_config.get("default_daw"),
                supported_daws[0] if supported_daws else "reaper",
            ) or "reaper",
            "supported_daws": supported_daws,
            "adapter_capabilities": _adapter_capabilities(capabilities, worker_config),
            "dry_run_daw": dry_run_daw,
            "reaper_binary_path": reaper_binary_path or "",
            "protools_app_path": protools_app_path or "",
            "soundflow_cli_path": soundflow_cli_path or "",
            "wavelab_app_path": wavelab_app_path or "",
            "notes": _first_present(os.environ.get("WORKSTATION_NOTES"), worker_config.get("notes")) or "",
        },
    )
