"""Deterministic lead scoring helpers."""

from __future__ import annotations


def score_fit(normalized: dict) -> int:
    """Score lead fit deterministically without LLM usage."""
    score = 50
    if normalized.get("service_requested") in ("mix", "master", "mix+master"):
        score += 20
    if normalized.get("budget_signal") in ("medium", "high"):
        score += 15
    if normalized.get("timeline"):
        score += 10
    if normalized.get("references"):
        score += 5
    return min(score, 100)


def score_urgency(normalized: dict) -> int:
    """Map normalized urgency/timeline hints to a simple numeric score."""
    urgency = str(normalized.get("urgency", "normal")).lower()
    timeline = str(normalized.get("timeline", "")).lower()

    if urgency == "high" or "asap" in timeline or "urgent" in timeline:
        return 80
    if urgency == "low":
        return 30
    if timeline:
        return 60
    return 50
