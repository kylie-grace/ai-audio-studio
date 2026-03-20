"""Unit tests for lead intake scorer — deterministic, no LLM, no DB."""
import pytest


def score_fit(normalized: dict) -> int:
    """Inline copy of scorer for testing isolation. Keep in sync with workers/lead-intake/scorer.py."""
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


class TestFitScoring:
    def test_baseline_unknown_lead(self):
        assert score_fit({"service_requested": "other", "budget_signal": "unknown"}) == 50

    def test_mix_request_adds_points(self):
        score = score_fit({"service_requested": "mix", "budget_signal": "unknown"})
        assert score == 70

    def test_high_budget_adds_points(self):
        score = score_fit({"service_requested": "mix", "budget_signal": "high", "timeline": "next month"})
        assert score == 95

    def test_references_adds_points(self):
        score = score_fit({
            "service_requested": "master",
            "budget_signal": "medium",
            "timeline": "ASAP",
            "references": ["Frank Ocean"]
        })
        assert score == 100

    def test_score_caps_at_100(self):
        score = score_fit({
            "service_requested": "mix+master",
            "budget_signal": "high",
            "timeline": "two weeks",
            "references": ["Kendrick Lamar", "SZA"]
        })
        assert score == 100

    def test_missing_fields_dont_crash(self):
        assert score_fit({}) == 50
