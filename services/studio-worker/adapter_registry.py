"""Compatibility wrapper for DAW adapter registry."""

from adapters.registry import get_adapter_for_daw, get_adapter_for_task_type, list_daw_adapters

__all__ = ["get_adapter_for_daw", "get_adapter_for_task_type", "list_daw_adapters"]
