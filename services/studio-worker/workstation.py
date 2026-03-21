"""Workstation discovery and DAW capability reporting."""

from __future__ import annotations

import os
import platform
import shutil
import socket
from pathlib import Path
from typing import Iterable


PLUGIN_ROOTS = {
    "au": [
        Path("/Library/Audio/Plug-Ins/Components"),
        Path.home() / "Library/Audio/Plug-Ins/Components",
    ],
    "vst3": [
        Path("/Library/Audio/Plug-Ins/VST3"),
        Path.home() / "Library/Audio/Plug-Ins/VST3",
    ],
    "vst": [
        Path("/Library/Audio/Plug-Ins/VST"),
        Path.home() / "Library/Audio/Plug-Ins/VST",
    ],
    "aax": [
        Path("/Library/Application Support/Avid/Audio/Plug-Ins"),
    ],
}

PLUGIN_SUFFIXES = {
    "au": ".component",
    "vst3": ".vst3",
    "vst": ".vst",
    "aax": ".aaxplugin",
}


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


def _plugin_vendor(name: str) -> str | None:
    if " - " in name:
        return name.split(" - ", 1)[0].strip() or None
    if "_" in name:
        return name.split("_", 1)[0].strip() or None
    return None


def _iter_plugin_paths(root: Path, suffix: str) -> Iterable[Path]:
    if not root.exists() or not root.is_dir():
        return []
    entries = sorted(root.iterdir(), key=lambda item: item.name.lower())
    return [entry for entry in entries if entry.name.lower().endswith(suffix)]


def scan_plugin_inventory(limit_per_format: int = 150) -> dict:
    plugins: list[dict] = []
    counts_by_format: dict[str, int] = {}
    roots_summary: list[dict] = []

    for plugin_format, roots in PLUGIN_ROOTS.items():
        suffix = PLUGIN_SUFFIXES[plugin_format]
        counts_by_format[plugin_format] = 0
        for root in roots:
            discovered_here = 0
            for path in _iter_plugin_paths(root, suffix):
                name = path.name[: -len(suffix)] if path.name.lower().endswith(suffix) else path.stem
                stats = path.stat()
                plugins.append(
                    {
                        "name": name,
                        "plugin_format": plugin_format,
                        "vendor": _plugin_vendor(name),
                        "path": str(path),
                        "file_name": path.name,
                        "installed": True,
                        "source_root": str(root),
                        "size_bytes": stats.st_size,
                        "modified_at": int(stats.st_mtime),
                    }
                )
                discovered_here += 1
                counts_by_format[plugin_format] += 1
                if counts_by_format[plugin_format] >= limit_per_format:
                    break
            roots_summary.append(
                {
                    "format": plugin_format,
                    "root": str(root),
                    "exists": root.exists(),
                    "count": discovered_here,
                }
            )

    plugins.sort(key=lambda item: (item["plugin_format"], item["name"].lower()))
    sample_names = [plugin["name"] for plugin in plugins[:8]]
    return {
        "plugins": plugins,
        "summary": {
            "count": len(plugins),
            "counts_by_format": counts_by_format,
            "sample_names": sample_names,
        },
        "roots": roots_summary,
    }


def detect_workstation_profile(settings) -> dict:
    reaper_binary = settings.reaper_binary_path or _which(["reaper", "REAPER", "/Applications/REAPER.app/Contents/MacOS/REAPER"])
    soundflow_cli = settings.soundflow_cli_path or _which(["sf", "soundflow"])
    protools_app = settings.protools_app_path
    plugin_inventory = scan_plugin_inventory()

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
        "plugins": plugin_inventory,
        "blockers": blockers,
        "ready": not blockers or blockers == ["dry-run-enabled"],
    }


def validate_workstation_setup(settings) -> dict:
    profile = detect_workstation_profile(settings)
    checks: list[dict] = [
        {
            "slug": "shared-projects-path",
            "label": "Shared projects path",
            "status": "ready" if Path(profile["shared_projects_path"]).exists() else "needs-attention",
            "detail": profile["shared_projects_path"],
        },
        {
            "slug": "delivery-path",
            "label": "Delivery path",
            "status": "ready" if Path(profile["delivery_path"]).exists() else "needs-attention",
            "detail": profile["delivery_path"],
        },
        {
            "slug": "reaper-readiness",
            "label": "Reaper readiness",
            "status": "ready" if any(daw["slug"] == "reaper" and daw["automation_ready"] for daw in profile["daws"]) else "watch",
            "detail": next((daw["notes"] for daw in profile["daws"] if daw["slug"] == "reaper"), "Reaper not configured."),
        },
        {
            "slug": "protools-readiness",
            "label": "Pro Tools readiness",
            "status": "ready" if any(daw["slug"] == "protools" and daw["automation_ready"] for daw in profile["daws"]) else "watch",
            "detail": next((daw["notes"] for daw in profile["daws"] if daw["slug"] == "protools"), "Pro Tools not configured."),
        },
        {
            "slug": "plugin-inventory",
            "label": "Plugin inventory",
            "status": "ready" if (profile.get("plugins", {}).get("summary", {}).get("count", 0) > 0) else "watch",
            "detail": f"{profile.get('plugins', {}).get('summary', {}).get('count', 0)} plugins discovered",
        },
    ]
    if profile["dry_run_daw"]:
        checks.append(
            {
                "slug": "dry-run-mode",
                "label": "Dry-run mode",
                "status": "watch",
                "detail": "DAW execution is still in dry-run mode.",
            }
        )
    return {
        "status": "ok",
        "ready": profile["ready"],
        "host": profile["host"],
        "platform": profile["platform"],
        "blockers": profile["blockers"],
        "checks": checks,
        "recommended_next_step": next(
            (check["label"] for check in checks if check["status"] != "ready"),
            "Workstation is ready for operator-reviewed execution.",
        ),
    }
