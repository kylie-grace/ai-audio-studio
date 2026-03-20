"""
Pipeline policy — controls which modules are permitted at each effort level.

Effort levels:
  1 = Import Only      (session-prep)
  2 = Import + QC      (+ audio-qc)         [default]
  3 = Import + QC + Mix Plan  (+ mix-planner)
  4 = Full Pipeline    (+ revision-parser, delivery-packager)
"""

LEVEL_PERMITTED_MODULES: dict[int, set[str]] = {
    1: {"session-prep"},
    2: {"session-prep", "audio-qc"},
    3: {"session-prep", "audio-qc", "mix-planner"},
    4: {"session-prep", "audio-qc", "mix-planner", "revision-parser", "delivery-packager"},
}

# Modules that are never gated by effort level (always permitted)
UNGATED_MODULES = {"lead-intake", "inbox-triage", "social-drafting"}


def is_module_permitted(module: str, effort_level: int) -> bool:
    """
    Return True if the given module is permitted at the given effort level.
    Raises ValueError if effort_level is out of range.
    """
    if module in UNGATED_MODULES:
        return True
    if effort_level not in LEVEL_PERMITTED_MODULES:
        raise ValueError(f"Invalid effort_level: {effort_level}. Must be 1–4.")
    permitted = set()
    for level in range(1, effort_level + 1):
        permitted |= LEVEL_PERMITTED_MODULES[level]
    return module in permitted


def permitted_modules(effort_level: int) -> set[str]:
    """Return the full set of permitted modules for a given effort level."""
    if effort_level not in LEVEL_PERMITTED_MODULES:
        raise ValueError(f"Invalid effort_level: {effort_level}. Must be 1–4.")
    permitted = set(UNGATED_MODULES)
    for level in range(1, effort_level + 1):
        permitted |= LEVEL_PERMITTED_MODULES[level]
    return permitted
