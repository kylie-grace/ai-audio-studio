"""Approval-gated DAW execution task entry points."""

from __future__ import annotations

from adapters.reascript import ReaScriptAdapter
from adapters.soundflow import SoundFlowAdapter


def execute_soundflow(payload: dict, settings) -> dict:
    adapter = SoundFlowAdapter()
    return adapter.execute(payload).__dict__


def execute_reascript(payload: dict, settings) -> dict:
    adapter = ReaScriptAdapter()
    return adapter.execute(payload).__dict__
