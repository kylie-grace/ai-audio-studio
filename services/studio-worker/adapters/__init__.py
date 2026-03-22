"""Adapter implementations for the studio worker."""

from adapters.registry import get_adapter_for_daw, get_adapter_for_task_type, list_daw_adapters
from adapters.reascript import ReaScriptAdapter
from adapters.soundflow_adapter import SoundFlowAdapter
from adapters.wavelab_adapter import WaveLabAdapter

__all__ = [
    "ReaScriptAdapter",
    "SoundFlowAdapter",
    "WaveLabAdapter",
    "get_adapter_for_daw",
    "get_adapter_for_task_type",
    "list_daw_adapters",
]
