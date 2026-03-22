"""Approval-gated DAW execution task entry points."""

from __future__ import annotations

import asyncio
from dataclasses import asdict

from adapters.registry import get_adapter_for_task_type


def _task_payload(task_type: str, payload: dict, settings) -> dict:
    base = {
        **payload,
        "dry_run": settings.dry_run_daw,
        "worker_platform": getattr(settings, "worker_platform", "macos"),
        "reaper_binary_path": getattr(settings, "reaper_binary_path", None),
        "protools_app_path": getattr(settings, "protools_app_path", None),
        "soundflow_cli_path": getattr(settings, "soundflow_cli_path", None),
        "wavelab_app_path": getattr(settings, "wavelab_app_path", None),
    }
    if task_type == "execute-wavelab" and "action" not in base:
        base["action"] = "open_file"
    return base


def _execute_task(task_type: str, payload: dict, settings) -> dict:
    adapter = get_adapter_for_task_type(task_type)
    result = asyncio.run(adapter.execute(_task_payload(task_type, payload, settings)))
    return asdict(result)


def execute_soundflow(payload: dict, settings) -> dict:
    return _execute_task("execute-soundflow", payload, settings)


def execute_reascript(payload: dict, settings) -> dict:
    return _execute_task("execute-reascript", payload, settings)


def execute_wavelab(payload: dict, settings) -> dict:
    return _execute_task("execute-wavelab", payload, settings)
