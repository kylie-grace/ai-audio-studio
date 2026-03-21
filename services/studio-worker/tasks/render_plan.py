"""Render plan preview helpers for candidate bounces and exports."""

from __future__ import annotations


def build_render_plan(payload: dict) -> dict:
    target = payload.get("target") or "review"
    include_stems = bool(payload.get("include_stems", True))
    include_instrumental = bool(payload.get("include_instrumental", True))
    project_slug = payload.get("project_slug") or "session"
    sample_rate = payload.get("sample_rate") or 48000
    bit_depth = payload.get("bit_depth") or 24

    profiles = [
        {
            "slug": "review-mix",
            "label": "Review Mix",
            "filename": f"{project_slug}_review_mix.wav",
            "target": target,
            "sample_rate": sample_rate,
            "bit_depth": bit_depth,
            "notes": "Primary candidate bounce for operator review and listening analysis.",
        }
    ]

    if include_instrumental:
        profiles.append(
            {
                "slug": "instrumental",
                "label": "Instrumental",
                "filename": f"{project_slug}_instrumental.wav",
                "target": target,
                "sample_rate": sample_rate,
                "bit_depth": bit_depth,
                "notes": "Instrumental print for alternate review and content reuse.",
            }
        )

    if include_stems:
        profiles.append(
            {
                "slug": "stems",
                "label": "Stem Print Set",
                "filename": f"{project_slug}_stems.zip",
                "target": "delivery",
                "sample_rate": sample_rate,
                "bit_depth": bit_depth,
                "notes": "Grouped stem delivery package with QC and manifest follow-up.",
            }
        )

    return {
        "status": "preview",
        "target": target,
        "profile_count": len(profiles),
        "profiles": profiles,
        "follow_up": [
            "Run audio QC on each candidate full-mix bounce.",
            "Attach listening report findings before client-facing approval.",
            "Keep outward delivery approval-gated.",
        ],
    }
