"""Unit tests for lead intake scorer — deterministic, no LLM, no DB."""
import importlib.util
import os

ROOT = os.path.join(os.path.dirname(__file__), "../..")
_mod = importlib.util.spec_from_file_location(
    "lead_scorer",
    os.path.join(ROOT, "workers/lead-intake/scorer.py"),
)
lead_scorer = importlib.util.module_from_spec(_mod)
_mod.loader.exec_module(lead_scorer)

score_fit = lead_scorer.score_fit


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
