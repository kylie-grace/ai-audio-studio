"""Listening report builder — integrates real audio-qc measurements when a bounce is available."""

from __future__ import annotations

import os
from pathlib import Path


_AUDIO_QC_URL = os.environ.get("AUDIO_QC_URL", "http://audio-qc:8170")


def _severity_from_delta(delta: float, warn_threshold: float = 1.0, fail_threshold: float = 3.0) -> str:
    abs_delta = abs(delta)
    if abs_delta >= fail_threshold:
        return "attention"
    if abs_delta >= warn_threshold:
        return "watch"
    return "ok"


def _lufs_detail(lufs: float, target: float) -> str:
    delta = round(lufs - target, 1)
    if abs(delta) <= 0.5:
        return f"Integrated loudness {lufs} LUFS — within 0.5 LU of {target} LUFS target. ✓"
    direction = "above" if delta > 0 else "below"
    return f"Integrated loudness {lufs} LUFS — {abs(delta)} LU {direction} the {target} LUFS target. Adjust gain before delivery."


def _peak_detail(peak_db: float, ceiling: float = -1.0) -> str:
    if peak_db <= ceiling:
        return f"True peak {peak_db} dBTP — under {ceiling} dBTP ceiling. ✓"
    return f"True peak {peak_db} dBTP exceeds {ceiling} dBTP ceiling by {round(peak_db - ceiling, 2)} dB. Limit or reduce before delivery."


def _phase_detail(correlation: float) -> str:
    if correlation >= 0.9:
        return f"Mono correlation {correlation:.3f} — full mono compatibility. ✓"
    if correlation >= 0.7:
        return f"Mono correlation {correlation:.3f} — some phase spread; check fold-down on mono reference."
    return f"Mono correlation {correlation:.3f} — significant phase spread detected. Mono fold-down likely has comb filtering."


def _build_from_qc_report(report: dict, reference_summary: dict) -> dict:
    """Build a listening report from a real audio-qc analysis result."""
    checks = []

    # Loudness check
    lufs = report.get("lufs_integrated")
    lufs_target = report.get("lufs_target", -14.0)
    if lufs is not None:
        delta = lufs - lufs_target
        checks.append({
            "slug": "integrated-lufs",
            "status": _severity_from_delta(delta, warn_threshold=0.5, fail_threshold=2.0),
            "detail": _lufs_detail(lufs, lufs_target),
            "value": lufs,
            "target": lufs_target,
        })

    # True peak check
    true_peak = report.get("true_peak_dbfs")
    if true_peak is not None:
        checks.append({
            "slug": "true-peak",
            "status": "attention" if not report.get("true_peak_ok", True) else "ok",
            "detail": _peak_detail(true_peak),
            "value": true_peak,
        })

    # Clipping
    if report.get("clipping_detected"):
        checks.append({
            "slug": "clipping",
            "status": "attention",
            "detail": "Digital clipping detected — waveform exceeds 0 dBFS. Reduce output gain or add limiting.",
        })

    # Phase / mono
    qc_checks = report.get("checks", [])
    phase_check = next((c for c in qc_checks if c.get("check") == "mono_compatibility"), None)
    if phase_check is not None:
        corr = phase_check.get("correlation", 1.0)
        checks.append({
            "slug": "mono-compatibility",
            "status": "attention" if corr < 0.7 else "watch" if corr < 0.9 else "ok",
            "detail": _phase_detail(corr),
            "value": corr,
        })

    low_end_ratio = report.get("low_end_ratio")
    if low_end_ratio is not None:
        checks.append({
            "slug": "low-end-balance",
            "status": "attention" if low_end_ratio > 0.45 or low_end_ratio < 0.08 else "watch" if low_end_ratio > 0.36 else "ok",
            "detail": f"Low-end ratio {low_end_ratio:.3f} — compare sub/bass balance against references and mono fold-down.",
            "value": low_end_ratio,
        })

    stereo_width = report.get("stereo_width")
    if stereo_width is not None:
        checks.append({
            "slug": "stereo-image",
            "status": "attention" if stereo_width > 1.6 or stereo_width < 0.05 else "watch" if stereo_width > 1.2 else "ok",
            "detail": f"Stereo width {stereo_width:.3f} — verify center focus and edge translation.",
            "value": stereo_width,
        })

    spectral_tilt_db = report.get("spectral_tilt_db")
    if spectral_tilt_db is not None:
        checks.append({
            "slug": "spectral-balance",
            "status": "attention" if spectral_tilt_db < -18.0 or spectral_tilt_db > 6.0 else "watch" if spectral_tilt_db < -12.0 or spectral_tilt_db > 3.0 else "ok",
            "detail": f"Spectral tilt {spectral_tilt_db:+.2f} dB — check brightness and top-end balance against references.",
            "value": spectral_tilt_db,
        })

    # Duration / format info
    duration = report.get("duration_s")
    sample_rate = report.get("sample_rate")
    bit_depth = report.get("bit_depth")
    if duration is not None:
        mins, secs = divmod(int(duration), 60)
        checks.append({
            "slug": "format",
            "status": "ok",
            "detail": f"{mins}:{secs:02d} · {sample_rate} Hz · {bit_depth}-bit.",
        })

    # Reference delta overlay
    if reference_summary:
        lufs_delta = reference_summary.get("lufs_delta")
        peak_delta = reference_summary.get("true_peak_delta")
        alignment = reference_summary.get("alignment", "unscored")
        ref_parts = []
        if lufs_delta is not None:
            ref_parts.append(f"LUFS delta {lufs_delta:+.1f}")
        if peak_delta is not None:
            ref_parts.append(f"peak delta {peak_delta:+.1f}")
        low_end_delta = reference_summary.get("low_end_delta")
        stereo_width_delta = reference_summary.get("stereo_width_delta")
        spectral_tilt_delta = reference_summary.get("spectral_tilt_delta")
        if low_end_delta is not None:
            ref_parts.append(f"low-end delta {low_end_delta:+.3f}")
        if stereo_width_delta is not None:
            ref_parts.append(f"stereo delta {stereo_width_delta:+.2f}")
        if spectral_tilt_delta is not None:
            ref_parts.append(f"spectral delta {spectral_tilt_delta:+.2f} dB")
        if ref_parts:
            checks.append({
                "slug": "reference-delta",
                "status": _severity_from_delta(lufs_delta or 0, warn_threshold=1.0, fail_threshold=3.0),
                "detail": f"vs. reference: {', '.join(ref_parts)}. Alignment: {alignment}.",
            })

    hard_fails = sum(1 for c in checks if c["status"] == "attention")
    warnings = sum(1 for c in checks if c["status"] == "watch")

    next_actions: list[str] = []
    if report.get("clipping_detected"):
        next_actions.append("Fix clipping before any further processing — reduce output gain or add a limiter.")
    if not report.get("true_peak_ok", True):
        next_actions.append("Apply true peak limiting to bring peaks under the ceiling.")
    lufs_val = report.get("lufs_integrated", -99)
    if abs((lufs_val or -99) - (report.get("lufs_target") or -14)) > 2:
        next_actions.append("Adjust master gain to hit loudness target.")
    if low_end_ratio is not None and (low_end_ratio > 0.45 or low_end_ratio < 0.08):
        next_actions.append("Rebalance low-end before release and compare against a trusted reference.")
    if stereo_width is not None and (stereo_width > 1.6 or stereo_width < 0.05):
        next_actions.append("Tighten stereo image so translation stays stable on speakers and mono fold-down.")
    if not next_actions:
        next_actions.append("QC passed — ready for client review or delivery packaging.")

    return {
        "status": "measured",
        "target": report.get("target", "streaming"),
        "reference_count": 1 if reference_summary else 0,
        "checks": checks,
        "summary": {
            "issue_count": len(report.get("issues", [])),
            "qc_hard_fail_count": hard_fails,
            "qc_warning_count": warnings,
            "reference_alignment": reference_summary.get("alignment", "unscored"),
            "overall_pass": report.get("overall_pass", False),
            "focus_flags": reference_summary.get("focus_flags", []),
        },
        "next_actions": next_actions,
    }


def build_listening_report(payload: dict) -> dict:
    """Build a listening report, using real QC data if available, heuristics otherwise."""
    target = payload.get("target") or "review-mix"
    references = payload.get("references") or []
    issues = payload.get("issues") or []
    qc_summary = payload.get("qc_summary") or {}
    reference_summary = payload.get("reference_summary") or {}
    candidate_path = payload.get("candidate_path") or payload.get("file_path")
    project_id = payload.get("project_id")

    # If a real audio file path is provided and it exists, run actual analysis
    if candidate_path and Path(candidate_path).exists() and project_id:
        try:
            import httpx
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{_AUDIO_QC_URL}/qc/run",
                    json={"project_id": project_id, "file_path": candidate_path, "target": target},
                )
                if resp.status_code == 201:
                    return _build_from_qc_report(resp.json(), reference_summary)
        except Exception:
            pass  # fall through to heuristic mode

    # Heuristic / preview mode
    heuristics = [
        {"slug": "vocal-forwardness", "status": "watch", "detail": "Vocal focus should be verified against the mix objective."},
        {"slug": "low-end-balance", "status": "watch", "detail": "Compare low-end buildup against references and mono fold-down."},
        {"slug": "translation", "status": "review", "detail": "Run speaker/headphone translation notes before client-facing delivery."},
    ]
    if issues:
        heuristics.insert(0, {"slug": "known-issues", "status": "attention", "detail": "; ".join(str(item) for item in issues)})
    if qc_summary:
        hard_count = qc_summary.get("hard_fail_count", 0)
        heuristics.append({
            "slug": "objective-qc",
            "status": "attention" if hard_count else "watch",
            "detail": f"{hard_count} hard fail(s) · {qc_summary.get('warning_count', 0)} warning(s) against {qc_summary.get('target', target)} target.",
        })
    if reference_summary:
        lufs_delta = reference_summary.get("lufs_delta")
        peak_delta = reference_summary.get("true_peak_delta")
        low_end_delta = reference_summary.get("low_end_delta")
        stereo_width_delta = reference_summary.get("stereo_width_delta")
        spectral_tilt_delta = reference_summary.get("spectral_tilt_delta")
        parts = []
        if lufs_delta is not None:
            parts.append(f"LUFS delta {lufs_delta:+.1f}")
        if peak_delta is not None:
            parts.append(f"peak delta {peak_delta:+.1f}")
        if low_end_delta is not None:
            parts.append(f"low-end delta {low_end_delta:+.3f}")
        if stereo_width_delta is not None:
            parts.append(f"stereo delta {stereo_width_delta:+.2f}")
        if spectral_tilt_delta is not None:
            parts.append(f"spectral delta {spectral_tilt_delta:+.2f} dB")
        heuristics.append({
            "slug": "reference-delta",
            "status": "watch",
            "detail": f"{', '.join(parts)}." if parts else "Reference comparison pending.",
        })

    return {
        "status": "preview",
        "target": target,
        "reference_count": len(references),
        "checks": heuristics,
        "summary": {
            "issue_count": len(issues),
            "qc_hard_fail_count": qc_summary.get("hard_fail_count", 0),
            "qc_warning_count": qc_summary.get("warning_count", 0),
            "reference_alignment": reference_summary.get("alignment", "unscored"),
            "focus_flags": reference_summary.get("focus_flags", []),
        },
        "next_actions": [
            "Render a candidate bounce for objective QC.",
            "Compare against one approved reference track.",
            "Approve another bounded DAW pass or escalate to manual review.",
        ],
    }
