import importlib.util
import os

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/audio-qc/src")

SPEC = importlib.util.spec_from_file_location("audio_qc_review", os.path.join(SERVICE_ROOT, "review.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

summarize_report = MODULE.summarize_report
compare_reports = MODULE.compare_reports


def test_summarize_report_counts_failures_and_warnings():
    summary = summarize_report(
        {
            "target": "streaming",
            "overall_pass": False,
            "issues": [
                {"check": "true_peak", "severity": "HARD_FAIL"},
                {"check": "mono_compatibility", "severity": "WARN"},
            ],
        }
    )

    assert summary["hard_fail_count"] == 1
    assert summary["warning_count"] == 1
    assert summary["issue_slugs"] == ["true_peak", "mono_compatibility"]


def test_compare_reports_scores_alignment():
    comparison = compare_reports(
        {"lufs_integrated": -14.2, "true_peak_dbfs": -1.1},
        {"lufs_integrated": -14.0, "true_peak_dbfs": -1.0},
    )

    assert comparison["alignment"] == "close"
    assert comparison["lufs_delta"] == -0.2
