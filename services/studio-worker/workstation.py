"""Workstation discovery and DAW capability reporting."""

from __future__ import annotations

import os
import platform
import shutil
import socket
from pathlib import Path


def _which(candidates: list[str]) -> str | None:
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def _path_exists(path: str | None) -> bool:
    return bool(path and Path(path).exists())


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def detect_workstation_profile(settings) -> dict:
    reaper_binary = settings.reaper_binary_path or _which(["reaper", "REAPER", "/Applications/REAPER.app/Contents/MacOS/REAPER"])
    soundflow_cli = settings.soundflow_cli_path or _which(["sf", "soundflow"])
    protools_app = settings.protools_app_path

    reaper_installed = _path_exists(reaper_binary)
    protools_installed = _path_exists(protools_app)
    soundflow_installed = _path_exists(soundflow_cli) or _env_flag("SOUNDFLOW_INSTALLED")

    permissions = {
        "accessibility_expected": bool(soundflow_installed or protools_installed),
        "automation_expected": bool(reaper_installed or protools_installed),
        "manual_confirmation_required": True,
    }

    daws = [
        {
            "slug": "reaper",
            "installed": reaper_installed,
            "binary_path": reaper_binary,
            "automation_ready": reaper_installed,
            "execution_mode": "native-script" if reaper_installed else "unavailable",
            "notes": "ReaScript-first execution path." if reaper_installed else "Install Reaper or set REAPER_BINARY_PATH.",
        },
        {
            "slug": "protools",
            "installed": protools_installed,
            "binary_path": protools_app,
            "automation_ready": protools_installed and soundflow_installed,
            "execution_mode": "soundflow-bridge" if protools_installed and soundflow_installed else "scaffold-only",
            "notes": (
                "SoundFlow bridge available."
                if protools_installed and soundflow_installed
                else "Requires Pro Tools plus SoundFlow bootstrap."
            ),
        },
    ]

    capabilities = {
        "session_manifest": True,
        "mix_plan_preview": True,
        "listening_report_preview": True,
        "reascript_rendering": reaper_installed,
        "reascript_execution": reaper_installed and not settings.dry_run_daw,
        "soundflow_rendering": True,
        "soundflow_execution": protools_installed and soundflow_installed and not settings.dry_run_daw,
    }

    blockers: list[str] = []
    if not reaper_installed:
        blockers.append("reaper-not-detected")
    if protools_installed and not soundflow_installed:
        blockers.append("soundflow-not-detected")
    if settings.dry_run_daw:
        blockers.append("dry-run-enabled")

    return {
        "host": socket.gethostname(),
        "platform": settings.worker_platform,
        "os_version": platform.platform(),
        "deployment_mode": "single-machine-friendly" if not settings.worker_api_base_url else "worker-node",
        "dry_run_daw": settings.dry_run_daw,
        "shared_projects_path": settings.shared_projects_path,
        "delivery_path": settings.delivery_path,
        "daws": daws,
        "capabilities": capabilities,
        "permissions": permissions,
        "blockers": blockers,
        "ready": not blockers or blockers == ["dry-run-enabled"],
    }
