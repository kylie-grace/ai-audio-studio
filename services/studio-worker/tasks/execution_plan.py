"""Execution-plan preview helpers for the DAW automation loop."""

from __future__ import annotations

from tasks.plugin_dependencies import build_dependency_warnings


def build_execution_plan(payload: dict) -> dict:
    workstation = payload.get("workstation") or {}
    session_manifest = payload.get("session_manifest") or {}
    mix_plan = payload.get("mix_plan") or {}
    render_plan = payload.get("render_plan") or {}
    listening_report = payload.get("listening_report") or {}
    dependency_warnings = build_dependency_warnings(
        session_manifest.get("session_details", {}).get("session_type", "reaper"),
        workstation,
        priorities=mix_plan.get("priorities") or [],
    )

    blockers = list(workstation.get("blockers") or [])
    readiness = session_manifest.get("readiness") or {}
    if not readiness.get("ready_for_planning"):
        blockers.append("session-not-ready")
    if not mix_plan.get("phases"):
        blockers.append("mix-plan-missing")
    if not render_plan.get("profiles"):
        blockers.append("render-plan-missing")

    phases = [
        {
            "slug": "inspect-session",
            "title": "Inspect Session",
            "status": "ready" if readiness.get("ready_for_planning") else "attention",
            "summary": f"{session_manifest.get('stem_count', 0)} stems · {session_manifest.get('session_details', {}).get('track_count', 0)} tracks discovered",
        },
        {
            "slug": "approve-plan",
            "title": "Approve Bounded Plan",
            "status": "ready" if mix_plan.get("phases") else "attention",
            "summary": f"{len(mix_plan.get('phases') or [])} mix phases staged for operator approval",
        },
        {
            "slug": "execute-pass",
            "title": "Execute DAW Pass",
            "status": "watch" if workstation.get("dry_run_daw") else "ready",
            "summary": "Dry-run execution remains enabled." if workstation.get("dry_run_daw") else "Live execution path is eligible when the workstation is ready.",
        },
        {
            "slug": "render-review",
            "title": "Render and Review",
            "status": "ready" if render_plan.get("profiles") else "attention",
            "summary": f"{render_plan.get('profile_count', 0)} render profiles with QC/listening follow-up.",
        },
        {
            "slug": "iterate",
            "title": "Iterate or Release",
            "status": "watch",
            "summary": f"{len(listening_report.get('next_actions') or [])} follow-up actions available after listening/QC.",
        },
    ]

    return {
        "status": "preview",
        "blockers": blockers,
        "dependency_warnings": dependency_warnings,
        "ready_for_operator_review": not blockers or blockers == ["dry-run-enabled"],
        "phases": phases,
        "recommended_next_step": next(
            (phase["title"] for phase in phases if phase["status"] in {"attention", "watch"}),
            "Proceed with operator review",
        ),
    }
