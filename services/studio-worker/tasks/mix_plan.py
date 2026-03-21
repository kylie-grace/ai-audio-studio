"""Preview-only mix planning helpers."""

from __future__ import annotations


def build_mix_plan(payload: dict) -> dict:
    session_manifest = payload.get("session_manifest") or {}
    priorities = payload.get("priorities") or ["vocals", "drums", "low-end translation"]
    references = payload.get("references") or []
    client_notes = payload.get("client_notes") or ""
    genre = payload.get("genre") or "general"

    phases = [
        {
            "slug": "prep",
            "title": "Session prep and routing",
            "actions": [
                "Validate stem inventory",
                "Group tracks by role",
                "Create mix buses and review markers",
            ],
        },
        {
            "slug": "static-balance",
            "title": "Static balance pass",
            "actions": [
                "Establish anchor balance for lead elements",
                f"Prioritize {', '.join(priorities[:3])}",
                "Set broad gain staging targets before automation",
            ],
        },
        {
            "slug": "corrective",
            "title": "Corrective shaping",
            "actions": [
                "Address masking or low-end buildup",
                "Check vocal clarity against references",
                "Flag issues that need manual engineering judgment",
            ],
        },
        {
            "slug": "print-review",
            "title": "Render and listening review",
            "actions": [
                "Render candidate mix",
                "Run objective QC and comparison pass",
                "Summarize recommended next moves",
            ],
        },
    ]

    return {
        "status": "preview",
        "genre": genre,
        "reference_count": len(references),
        "session_summary": {
            "stem_count": session_manifest.get("stem_count", 0),
            "reference_count": session_manifest.get("reference_count", 0),
            "ready_for_planning": session_manifest.get("readiness", {}).get("ready_for_planning", False),
        },
        "priorities": priorities,
        "client_notes": client_notes,
        "phases": phases,
        "risk_summary": [
            "Keep destructive automation behind approval.",
            "Prefer session copy or working version before execution.",
            "Escalate plugin-specific choices for manual review.",
        ],
    }
