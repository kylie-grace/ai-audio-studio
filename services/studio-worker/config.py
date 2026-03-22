"""Runtime configuration for the studio worker."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass
import json
import platform
import tempfile
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from urllib.parse import urlparse


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


class StartupValidationError(RuntimeError):
    """Raised when the studio worker cannot safely start."""


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


def _valid_http_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _is_loopback_or_blank(value: str | None) -> bool:
    if not value:
        return True
    parsed = urlparse(value)
    host = (parsed.hostname or "").strip().lower()
    return host in {"", "localhost", "127.0.0.1", "::1", "project-state"}


def _path_access_report(path_text: str) -> dict:
    path = Path(path_text)
    report = {
        "path": path_text,
        "exists": path.exists(),
        "readable": False,
        "writable": False,
        "write_tested": False,
        "detail": path_text,
    }
    if not path.exists():
        report["detail"] = f"{path_text} does not exist"
        return report
    report["readable"] = os.access(path, os.R_OK)
    report["writable"] = os.access(path, os.W_OK)
    if path.is_dir() and report["writable"]:
        try:
            with tempfile.NamedTemporaryFile(prefix=".studio-worker-check-", dir=path, delete=False) as handle:
                handle.write(b"ok\n")
                temp_path = Path(handle.name)
            temp_path.unlink()
            report["write_tested"] = True
        except OSError as exc:
            report["writable"] = False
            report["detail"] = f"{path_text} is not writable: {exc}"
            return report
    report["detail"] = f"{path_text} readable={report['readable']} writable={report['writable']}"
    return report


def validate_startup(settings: Settings) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []
    worker_slug = str(getattr(settings, "worker_slug", "") or "").strip()
    project_state_url = str(getattr(settings, "project_state_url", "") or "").strip()
    worker_api_base_url = str(getattr(settings, "worker_api_base_url", "") or "").strip()
    capabilities = list(getattr(settings, "capabilities", []) or [])
    dry_run_daw = bool(getattr(settings, "dry_run_daw", False))
    worker_platform = str(getattr(settings, "worker_platform", "") or "")
    reaper_binary_path = getattr(settings, "reaper_binary_path", None)
    protools_app_path = getattr(settings, "protools_app_path", None)
    soundflow_cli_path = getattr(settings, "soundflow_cli_path", None)
    wavelab_app_path = getattr(settings, "wavelab_app_path", None)

    if not worker_slug:
        errors.append("WORKER_SLUG must not be empty")
    if not _valid_http_url(project_state_url):
        errors.append(f"PROJECT_STATE_URL is invalid: {project_state_url}")
    if not worker_api_base_url:
        if not _is_loopback_or_blank(project_state_url):
            errors.append("WORKER_API_BASE_URL must be set to the worker machine's reachable LAN URL for remote worker deployments.")
        else:
            warnings.append("WORKER_API_BASE_URL is blank; split deployments should set it explicitly.")
    elif not _valid_http_url(worker_api_base_url):
        errors.append(f"WORKER_API_BASE_URL is invalid: {worker_api_base_url}")

    shared_paths = dict(load_workspace_settings().get("shared_paths") or {})
    for key, path in shared_paths.items():
        if path and not os.path.exists(path):
            warnings.append(f"Shared path '{key}' not found at {path} — verify NFS/SMB mount is active")

    for slug, path_text in {
        "shared-projects": settings.shared_projects_path,
        "deliveries": settings.delivery_path,
    }.items():
        report = _path_access_report(path_text)
        checks.append({"slug": slug, **report})
        if not report["exists"] or not report["readable"] or not report["writable"]:
            errors.append(f"{slug} path is not fully accessible: {report['detail']}")

    if "execute-reascript" in capabilities:
        if dry_run_daw:
            warnings.append("Reaper execution is configured in dry-run mode.")
        elif not reaper_binary_path or not Path(reaper_binary_path).exists():
            errors.append("execute-reascript requires a valid REAPER_BINARY_PATH when dry-run is disabled.")

    if "execute-soundflow" in capabilities:
        if dry_run_daw:
            warnings.append("SoundFlow execution is configured in dry-run mode.")
        else:
            if worker_platform != "macos":
                warnings.append("SoundFlow execution is primarily validated on macOS.")
            if not protools_app_path or not Path(protools_app_path).exists():
                errors.append("execute-soundflow requires a valid PROTOOLS_APP_PATH when dry-run is disabled.")
            if not soundflow_cli_path or not Path(soundflow_cli_path).exists():
                errors.append("execute-soundflow requires a valid SOUNDFLOW_CLI_PATH when dry-run is disabled.")

    if wavelab_app_path and not Path(wavelab_app_path).exists():
        warnings.append(f"WAVELAB_APP_PATH is set but not found: {wavelab_app_path}")

    return {
        "ready": not errors,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
    }


def assert_startup_ready(settings: Settings) -> dict:
    validation = validate_startup(settings)
    if validation["errors"]:
        raise StartupValidationError("; ".join(validation["errors"]))
    return validation


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
