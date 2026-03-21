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
        "spectral_tilt_db": report.get("spectral_tilt_db"),
        "low_end_ratio": report.get("low_end_ratio"),
        "stereo_width": report.get("stereo_width"),
    }


def compare_reports(candidate: dict, reference: dict) -> dict:
    lufs_delta = round(float(candidate.get("lufs_integrated", 0.0)) - float(reference.get("lufs_integrated", 0.0)), 2)
    true_peak_delta = round(float(candidate.get("true_peak_dbfs", 0.0)) - float(reference.get("true_peak_dbfs", 0.0)), 2)
    low_end_delta = round(float(candidate.get("low_end_ratio", 0.0)) - float(reference.get("low_end_ratio", 0.0)), 4)
    stereo_width_delta = round(float(candidate.get("stereo_width", 0.0)) - float(reference.get("stereo_width", 0.0)), 3)
    spectral_tilt_delta = round(float(candidate.get("spectral_tilt_db", 0.0)) - float(reference.get("spectral_tilt_db", 0.0)), 2)
    if (
        abs(lufs_delta) <= 1.0
        and abs(true_peak_delta) <= 1.0
        and abs(low_end_delta) <= 0.08
        and abs(stereo_width_delta) <= 0.2
        and abs(spectral_tilt_delta) <= 3.0
    ):
        alignment = "close"
    elif (
        abs(lufs_delta) <= 2.5
        and abs(true_peak_delta) <= 2.0
        and abs(low_end_delta) <= 0.16
        and abs(stereo_width_delta) <= 0.35
        and abs(spectral_tilt_delta) <= 6.0
    ):
        alignment = "watch"
    else:
        alignment = "far"

    focus_flags = []
    if abs(low_end_delta) > 0.08:
        focus_flags.append("low-end-balance")
    if abs(stereo_width_delta) > 0.2:
        focus_flags.append("stereo-image")
    if abs(spectral_tilt_delta) > 3.0:
        focus_flags.append("spectral-balance")

    return {
        "lufs_delta": lufs_delta,
        "true_peak_delta": true_peak_delta,
        "low_end_delta": low_end_delta,
        "stereo_width_delta": stereo_width_delta,
        "spectral_tilt_delta": spectral_tilt_delta,
        "alignment": alignment,
        "focus_flags": focus_flags,
    }
