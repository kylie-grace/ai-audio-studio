"""Heuristic plugin dependency warnings for planning surfaces."""

from __future__ import annotations


def plugin_summary(workstation: dict | None) -> dict:
    plugins = (workstation or {}).get("plugins") or {}
    summary = plugins.get("summary") or {}
    counts_by_format = summary.get("counts_by_format") or {}
    return {
        "count": int(summary.get("count") or 0),
        "counts_by_format": counts_by_format,
    }


def build_dependency_warnings(
    target_daw: str,
    workstation: dict | None,
    priorities: list[str] | None = None,
    changes: list[dict] | None = None,
) -> list[dict]:
    summary = plugin_summary(workstation)
    counts_by_format = summary["counts_by_format"]
    warnings: list[dict] = []
    priorities = priorities or []
    changes = changes or []

    if target_daw == "protools" and not counts_by_format.get("aax", 0):
        warnings.append(
            {
                "slug": "missing-aax-inventory",
                "severity": "warn",
                "detail": "Pro Tools execution is planned but no AAX plugins were discovered on this workstation.",
            }
        )
    if target_daw == "reaper" and not any(counts_by_format.get(fmt, 0) for fmt in ("au", "vst3", "vst")):
        warnings.append(
            {
                "slug": "missing-reaper-plugin-formats",
                "severity": "warn",
                "detail": "Reaper execution is planned but no AU, VST3, or VST plugins were discovered.",
            }
        )
    if target_daw == "wavelab" and summary["count"] == 0:
        warnings.append(
            {
                "slug": "unknown-mastering-plugin-posture",
                "severity": "watch",
                "detail": "Wavelab/mastering automation is planned but plugin posture is still unknown on this workstation.",
            }
        )

    if summary["count"] == 0:
        warnings.append(
            {
                "slug": "empty-plugin-inventory",
                "severity": "watch",
                "detail": "No installed plugins were discovered. Planning should assume stock-tool fallback or manual engineering review.",
            }
        )

    high_touch_parameters = {"eq", "reverb", "compression", "stereo_width", "send_level"}
    if any(change.get("parameter") in high_touch_parameters for change in changes):
        warnings.append(
            {
                "slug": "plugin-specific-revision-risk",
                "severity": "watch",
                "detail": "At least one requested revision likely depends on plugin-specific choices and should stay operator-reviewed.",
            }
        )

    if any(priority in {"vocals", "low-end translation", "mastering", "translation"} for priority in priorities):
        warnings.append(
            {
                "slug": "critical-ear-pass-required",
                "severity": "watch",
                "detail": "This plan touches high-judgment mix goals. Keep a manual listening pass in the loop even if automation is available.",
            }
        )

    deduped: list[dict] = []
    seen: set[str] = set()
    for warning in warnings:
        slug = str(warning["slug"])
        if slug in seen:
            continue
        seen.add(slug)
        deduped.append(warning)
    return deduped
