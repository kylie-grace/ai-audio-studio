"""Workstation discovery and DAW capability reporting."""

from __future__ import annotations

import os
import platform
import shutil
import socket
import tempfile
from pathlib import Path
from typing import Iterable

from config import validate_startup
from tasks.execution_plan import build_execution_plan
from tasks.listening_report import build_listening_report
from tasks.mix_plan import build_mix_plan
from tasks.render_plan import build_render_plan
from tasks.session_manifest import build_session_manifest


PLUGIN_ROOTS_BY_PLATFORM = {
    "macos": {
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
    },
    "windows": {
        "au": [],
        "vst3": [
            Path(r"C:\Program Files\Common Files\VST3"),
            Path.home() / "AppData/Local/Programs/Common/VST3",
        ],
        "vst": [
            Path(r"C:\Program Files\VstPlugins"),
            Path(r"C:\Program Files\Steinberg\VstPlugins"),
            Path(r"C:\Program Files\Common Files\VST2"),
        ],
        "aax": [
            Path(r"C:\Program Files\Common Files\Avid\Audio\Plug-Ins"),
        ],
    },
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
            import logging as _logging
            _logging.getLogger(__name__).warning("Write check failed for %s: %s", path_text, exc)
            report["writable"] = False
            report["detail"] = f"{path_text} is not writable"
            return report
    report["detail"] = f"{path_text} readable={report['readable']} writable={report['writable']}"
    return report


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _normalized_platform(platform_name: str | None) -> str:
    value = str(platform_name or "").strip().lower()
    if value.startswith("win"):
        return "windows"
    if value in {"darwin", "mac", "macos", "osx"}:
        return "macos"
    return value or "macos"


def _plugin_roots(platform_name: str | None) -> dict[str, list[Path]]:
    return PLUGIN_ROOTS_BY_PLATFORM.get(_normalized_platform(platform_name), PLUGIN_ROOTS_BY_PLATFORM["macos"])


def _first_existing_path(candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


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


def scan_plugin_inventory(platform_name: str | None = None, limit_per_format: int = 150) -> dict:
    plugins: list[dict] = []
    counts_by_format: dict[str, int] = {}
    roots_summary: list[dict] = []
    plugin_roots = _plugin_roots(platform_name)

    for plugin_format, roots in plugin_roots.items():
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
    platform_name = _normalized_platform(getattr(settings, "worker_platform", "macos"))
    reaper_binary = (
        getattr(settings, "reaper_binary_path", None)
        or _which(["reaper", "REAPER"])
        or _first_existing_path(
            [
                "/Applications/REAPER.app/Contents/MacOS/REAPER",
                r"C:\Program Files\REAPER (x64)\reaper.exe",
                r"C:\Program Files\REAPER\reaper.exe",
            ]
        )
    )
    soundflow_cli = (
        getattr(settings, "soundflow_cli_path", None)
        or _which(["sf", "soundflow"])
        or _first_existing_path(["/Applications/SoundFlow.app/Contents/MacOS/SoundFlow"])
    )
    protools_app = (
        getattr(settings, "protools_app_path", None)
        or _first_existing_path(
            [
                "/Applications/Pro Tools.app",
                r"C:\Program Files\Avid\Pro Tools\ProTools.exe",
            ]
        )
    )
    wavelab_app = (
        getattr(settings, "wavelab_app_path", None)
        or _first_existing_path(
            [
                "/Applications/WaveLab.app",
                r"C:\Program Files\Steinberg\WaveLab 12\WaveLab 12.exe",
                r"C:\Program Files\Steinberg\WaveLab 11\WaveLab 11.exe",
            ]
        )
    )
    plugin_inventory = scan_plugin_inventory(platform_name=platform_name)

    reaper_installed = _path_exists(reaper_binary)
    protools_installed = _path_exists(protools_app)
    soundflow_installed = (platform_name == "macos") and (_path_exists(soundflow_cli) or _env_flag("SOUNDFLOW_INSTALLED"))
    wavelab_installed = _path_exists(wavelab_app)
    wavelab_automation_ready = wavelab_installed and _env_flag("WAVELAB_AUTOMATION_READY") and not settings.dry_run_daw

    permissions = {
        "accessibility_expected": platform_name == "macos" and bool(soundflow_installed or protools_installed),
        "automation_expected": bool(reaper_installed or protools_installed or wavelab_installed),
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
                else "Requires Pro Tools plus SoundFlow bootstrap on macOS."
            ),
        },
        {
            "slug": "wavelab",
            "installed": wavelab_installed,
            "binary_path": wavelab_app,
            "automation_ready": wavelab_automation_ready,
            "execution_mode": "mastering-bridge" if wavelab_automation_ready else "scaffold-only",
            "notes": (
                "WaveLab mastering bridge is enabled."
                if wavelab_automation_ready
                else "WaveLab detection is scaffolded; mastering automation still requires explicit runtime validation."
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
        "wavelab_rendering": wavelab_installed,
        "wavelab_execution": wavelab_automation_ready,
    }

    blockers: list[str] = []
    if not reaper_installed:
        blockers.append("reaper-not-detected")
    if protools_installed and not soundflow_installed:
        blockers.append("soundflow-not-detected")
    if settings.dry_run_daw:
        blockers.append("dry-run-enabled")
    shared_paths = {
        "projects": _path_access_report(settings.shared_projects_path),
        "deliveries": _path_access_report(settings.delivery_path),
    }
    for path_slug, path_report in shared_paths.items():
        if not path_report["exists"] or not path_report["readable"] or not path_report["writable"]:
            blockers.append(f"{path_slug}-path-not-accessible")

    return {
        "host": socket.gethostname(),
        "platform": platform_name,
        "os_version": platform.platform(),
        "deployment_mode": "single-machine-friendly" if not settings.worker_api_base_url else "worker-node",
        "dry_run_daw": settings.dry_run_daw,
        "shared_projects_path": settings.shared_projects_path,
        "delivery_path": settings.delivery_path,
        "daws": daws,
        "capabilities": capabilities,
        "permissions": permissions,
        "shared_paths": shared_paths,
        "plugins": plugin_inventory,
        "blockers": blockers,
        "ready": not [blocker for blocker in blockers if blocker != "dry-run-enabled"],
    }


def validate_workstation_setup(settings) -> dict:
    profile = detect_workstation_profile(settings)
    startup_validation = validate_startup(settings)
    checks: list[dict] = [
        {
            "slug": "shared-projects-path",
            "label": "Shared projects path",
            "status": "ready" if profile["shared_paths"]["projects"]["readable"] and profile["shared_paths"]["projects"]["writable"] else "needs-attention",
            "detail": profile["shared_paths"]["projects"]["detail"],
        },
        {
            "slug": "delivery-path",
            "label": "Delivery path",
            "status": "ready" if profile["shared_paths"]["deliveries"]["readable"] and profile["shared_paths"]["deliveries"]["writable"] else "needs-attention",
            "detail": profile["shared_paths"]["deliveries"]["detail"],
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
            "slug": "wavelab-readiness",
            "label": "WaveLab readiness",
            "status": "ready" if any(daw["slug"] == "wavelab" and daw["automation_ready"] for daw in profile["daws"]) else "watch",
            "detail": next((daw["notes"] for daw in profile["daws"] if daw["slug"] == "wavelab"), "WaveLab not configured."),
        },
        {
            "slug": "plugin-inventory",
            "label": "Plugin inventory",
            "status": "ready" if (profile.get("plugins", {}).get("summary", {}).get("count", 0) > 0) else "watch",
            "detail": f"{profile.get('plugins', {}).get('summary', {}).get('count', 0)} plugins discovered",
        },
    ]
    if profile["platform"] == "windows":
        checks.append(
            {
                "slug": "path-translation",
                "label": "Path translation",
                "status": "ready" if getattr(settings, "path_translation_json", "{}").strip() not in {"", "{}"} else "watch",
                "detail": "Set PATH_TRANSLATION_JSON when the control plane and Windows worker do not share identical paths.",
            }
        )
    if profile["dry_run_daw"]:
        checks.append(
            {
                "slug": "dry-run-mode",
                "label": "Dry-run mode",
                "status": "watch",
                "detail": "DAW execution is still in dry-run mode.",
            }
        )
    if startup_validation["warnings"]:
        checks.append(
            {
                "slug": "startup-warnings",
                "label": "Startup warnings",
                "status": "watch",
                "detail": " | ".join(startup_validation["warnings"]),
            }
        )
    return {
        "status": "ok",
        "ready": startup_validation["ready"] and profile["ready"],
        "host": profile["host"],
        "platform": profile["platform"],
        "blockers": profile["blockers"] + startup_validation["errors"],
        "checks": checks,
        "recommended_next_step": next(
            (check["label"] for check in checks if check["status"] != "ready"),
            "Workstation is ready for operator-reviewed execution.",
        ),
    }


def build_workstation_smoke_report(settings) -> dict:
    profile = detect_workstation_profile(settings)
    validation = validate_workstation_setup(settings)

    with tempfile.TemporaryDirectory(prefix="studio-worker-smoke-") as temp_root:
        project_root = Path(temp_root) / "smoke-project"
        stems_dir = project_root / "stems"
        session_dir = project_root / "session"
        references_dir = project_root / "references"
        stems_dir.mkdir(parents=True, exist_ok=True)
        session_dir.mkdir(parents=True, exist_ok=True)
        references_dir.mkdir(parents=True, exist_ok=True)

        (stems_dir / "lead_vox.wav").write_text("dry-run-audio")
        (stems_dir / "drum_bus.wav").write_text("dry-run-audio")
        (references_dir / "reference-note.txt").write_text("Trusted low-end and vocal-forward target.")
        (session_dir / "smoke-session.rpp").write_text(
            '<REAPER_PROJECT 0.1 "7.0/x64" 0 0 0\n'
            '  TEMPO 128 4 4\n'
            '  <TRACK\n'
            '    NAME "Lead Vox"\n'
            '  >\n'
            '  <TRACK\n'
            '    NAME "Drum Bus"\n'
            '  >\n'
            '  MARKER 1 8.0 "Hook"\n'
        )

        session_manifest = build_session_manifest({"project_root": str(project_root)})
        mix_plan = build_mix_plan(
            {
                "workstation": profile,
                "session_manifest": session_manifest,
                "priorities": ["vocals", "low-end translation", "impact"],
                "references": ["operator-reference"],
                "client_notes": "Smoke-run only; verify workstation planning chain.",
                "genre": "pop",
            }
        )
        render_plan = build_render_plan(
            {
                "project_slug": "smoke-project",
                "target": "internal-review",
                "include_stems": True,
                "include_instrumental": True,
            }
        )
        listening_report = build_listening_report(
            {
                "target": "review-mix",
                "references": ["operator-reference"],
                "issues": ["smoke-run only"],
                "qc_summary": {"target": "streaming", "hard_fail_count": 0, "warning_count": 1},
                "reference_summary": {"alignment": "preview", "lufs_delta": -0.4, "true_peak_delta": -0.2},
            }
        )
        execution_plan = build_execution_plan(
            {
                "workstation": profile,
                "session_manifest": session_manifest,
                "mix_plan": mix_plan,
                "render_plan": render_plan,
                "listening_report": listening_report,
            }
        )

    summary = {
        "session_ready": session_manifest.get("readiness", {}).get("ready_for_planning", False),
        "mix_phase_count": len(mix_plan.get("phases") or []),
        "render_profile_count": render_plan.get("profile_count", 0),
        "listening_issue_count": listening_report.get("summary", {}).get("issue_count", 0),
        "execution_ready_for_review": execution_plan.get("ready_for_operator_review", False),
        "warning_count": len(execution_plan.get("dependency_warnings") or []),
    }
    result = "pass" if validation["ready"] and summary["execution_ready_for_review"] else "review"

    return {
        "status": "ok",
        "result": result,
        "host": profile["host"],
        "platform": profile["platform"],
        "dry_run_daw": profile["dry_run_daw"],
        "summary": summary,
        "recommended_next_step": validation["recommended_next_step"],
        "validation": validation,
        "session_manifest": {
            "stem_count": session_manifest.get("stem_count", 0),
            "reference_count": session_manifest.get("reference_count", 0),
            "session_type": session_manifest.get("session_details", {}).get("session_type", "generic"),
            "track_count": session_manifest.get("session_details", {}).get("track_count", 0),
        },
        "mix_plan": {
            "phase_count": len(mix_plan.get("phases") or []),
            "risk_summary": mix_plan.get("risk_summary") or [],
        },
        "render_plan": {
            "profile_count": render_plan.get("profile_count", 0),
            "review_candidate_slug": render_plan.get("review_candidate_slug"),
        },
        "listening_report": {
            "next_actions": listening_report.get("next_actions") or [],
            "focus_flags": listening_report.get("summary", {}).get("focus_flags", []),
        },
        "execution_plan": {
            "blockers": execution_plan.get("blockers") or [],
            "dependency_warnings": execution_plan.get("dependency_warnings") or [],
            "recommended_next_step": execution_plan.get("recommended_next_step"),
        },
    }
