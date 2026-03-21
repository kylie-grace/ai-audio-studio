"""Preview-only listening and QC report helpers."""

from __future__ import annotations


def build_listening_report(payload: dict) -> dict:
    target = payload.get("target") or "review-mix"
    references = payload.get("references") or []
    issues = payload.get("issues") or []
    qc_summary = payload.get("qc_summary") or {}
    reference_summary = payload.get("reference_summary") or {}

    heuristics = [
        {"slug": "vocal-forwardness", "status": "watch", "detail": "Vocal focus should be verified against the mix objective."},
        {"slug": "low-end-balance", "status": "watch", "detail": "Compare low-end buildup against references and mono fold-down."},
        {"slug": "translation", "status": "review", "detail": "Run speaker/headphone translation notes before client-facing delivery."},
    ]
    if issues:
        heuristics.insert(0, {"slug": "known-issues", "status": "attention", "detail": "; ".join(str(item) for item in issues)})
    if qc_summary:
        heuristics.append(
            {
                "slug": "objective-qc",
                "status": "attention" if qc_summary.get("hard_fail_count", 0) else "watch",
                "detail": f"{qc_summary.get('hard_fail_count', 0)} hard fail(s) · {qc_summary.get('warning_count', 0)} warning(s) against {qc_summary.get('target', 'streaming')} target.",
            }
        )
    if reference_summary:
        heuristics.append(
            {
                "slug": "reference-delta",
                "status": "watch",
                "detail": f"LUFS delta {reference_summary.get('lufs_delta', 'n/a')} · peak delta {reference_summary.get('true_peak_delta', 'n/a')}.",
            }
        )

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
        },
        "next_actions": [
            "Render a candidate bounce for objective QC.",
            "Compare against one approved reference track.",
            "Approve another bounded DAW pass or escalate to manual review.",
        ],
    }
