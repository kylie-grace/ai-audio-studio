"""Adapter registry for DAW execution and status checks."""

from __future__ import annotations

from adapters.reascript import ReaScriptAdapter
from adapters.soundflow_adapter import SoundFlowAdapter
from adapters.wavelab_adapter import WaveLabAdapter


DAW_TO_ADAPTER = {
    "reaper": ReaScriptAdapter,
    "protools": SoundFlowAdapter,
    "wavelab": WaveLabAdapter,
}

TASK_TYPE_TO_DAW = {
    "execute-reascript": "reaper",
    "execute-soundflow": "protools",
    "execute-wavelab": "wavelab",
}


def list_daw_adapters() -> dict[str, object]:
    return {daw: factory() for daw, factory in DAW_TO_ADAPTER.items()}


def get_adapter_for_daw(daw: str):
    try:
        return DAW_TO_ADAPTER[daw]()
    except KeyError as exc:
        raise ValueError(f"Unsupported DAW adapter: {daw}") from exc


def get_adapter_for_task_type(task_type: str):
    daw = TASK_TYPE_TO_DAW.get(task_type)
    if not daw:
        raise ValueError(f"Unsupported DAW task type: {task_type}")
    return get_adapter_for_daw(daw)
