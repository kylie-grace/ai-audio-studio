"""Preview-only listening and QC report helpers."""

from __future__ import annotations


def build_listening_report(payload: dict) -> dict:
    target = payload.get("target") or "review-mix"
    references = payload.get("references") or []
    issues = payload.get("issues") or []

    heuristics = [
        {"slug": "vocal-forwardness", "status": "watch", "detail": "Vocal focus should be verified against the mix objective."},
        {"slug": "low-end-balance", "status": "watch", "detail": "Compare low-end buildup against references and mono fold-down."},
        {"slug": "translation", "status": "review", "detail": "Run speaker/headphone translation notes before client-facing delivery."},
    ]
    if issues:
        heuristics.insert(0, {"slug": "known-issues", "status": "attention", "detail": "; ".join(str(item) for item in issues)})

    return {
        "status": "preview",
        "target": target,
        "reference_count": len(references),
        "checks": heuristics,
        "next_actions": [
            "Render a candidate bounce for objective QC.",
            "Compare against one approved reference track.",
            "Approve another bounded DAW pass or escalate to manual review.",
        ],
    }
