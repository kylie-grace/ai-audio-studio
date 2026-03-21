import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from tasks.render_plan import build_render_plan  # type: ignore  # noqa: E402


def test_build_render_plan_returns_review_and_delivery_profiles():
    plan = build_render_plan({"project_slug": "demo-project", "target": "streaming", "include_stems": True, "include_instrumental": True})

    assert plan["status"] == "preview"
    assert plan["profile_count"] == 3
    assert any(profile["slug"] == "review-mix" for profile in plan["profiles"])
    assert any(profile["slug"] == "stems" for profile in plan["profiles"])
