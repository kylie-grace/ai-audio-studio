"""Higher-level QC review helpers for candidate vs reference analysis."""

from __future__ import annotations


def summarize_report(report: dict) -> dict:
    issues = report.get("issues") or []
    hard_fail_count = sum(1 for issue in issues if issue.get("severity") == "HARD_FAIL")
    warning_count = sum(1 for issue in issues if issue.get("severity") != "HARD_FAIL")
    return {
        "target": report.get("target", "streaming"),
        "overall_pass": bool(report.get("overall_pass")),
        "hard_fail_count": hard_fail_count,
        "warning_count": warning_count,
        "issue_slugs": [issue.get("check", "unknown") for issue in issues],
    }


def compare_reports(candidate: dict, reference: dict) -> dict:
    lufs_delta = round(float(candidate.get("lufs_integrated", 0.0)) - float(reference.get("lufs_integrated", 0.0)), 2)
    true_peak_delta = round(float(candidate.get("true_peak_dbfs", 0.0)) - float(reference.get("true_peak_dbfs", 0.0)), 2)
    if abs(lufs_delta) <= 1.0 and abs(true_peak_delta) <= 1.0:
        alignment = "close"
    elif abs(lufs_delta) <= 2.5 and abs(true_peak_delta) <= 2.0:
        alignment = "watch"
    else:
        alignment = "far"

    return {
        "lufs_delta": lufs_delta,
        "true_peak_delta": true_peak_delta,
        "alignment": alignment,
    }
