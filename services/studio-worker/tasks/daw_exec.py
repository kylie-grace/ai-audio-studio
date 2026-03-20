"""Approval-gated DAW execution task entry points."""

from __future__ import annotations

from dataclasses import asdict

from adapters.reascript import ReaScriptAdapter
from adapters.soundflow import SoundFlowAdapter


def execute_soundflow(payload: dict, settings) -> dict:
    adapter = SoundFlowAdapter()
    return asdict(adapter.execute({**payload, "dry_run": settings.dry_run_daw}))


def execute_reascript(payload: dict, settings) -> dict:
    adapter = ReaScriptAdapter()
    return asdict(adapter.execute({**payload, "dry_run": settings.dry_run_daw}))
