from pathlib import Path
import os
import sys
from types import SimpleNamespace

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from workstation import detect_workstation_profile  # type: ignore  # noqa: E402
from tasks.session_manifest import build_session_manifest  # type: ignore  # noqa: E402
from tasks.mix_plan import build_mix_plan  # type: ignore  # noqa: E402
from tasks.listening_report import build_listening_report  # type: ignore  # noqa: E402


def test_detect_workstation_profile_reports_reaper_readiness(tmp_path: Path):
    reaper = tmp_path / "REAPER"
    reaper.write_text("binary")
    settings = SimpleNamespace(
        reaper_binary_path=str(reaper),
        protools_app_path=None,
        soundflow_cli_path=None,
        dry_run_daw=True,
        worker_platform="macos",
        worker_api_base_url=None,
        shared_projects_path=str(tmp_path / "projects"),
        delivery_path=str(tmp_path / "deliveries"),
    )

    profile = detect_workstation_profile(settings)

    assert profile["dry_run_daw"] is True
    assert any(daw["slug"] == "reaper" and daw["installed"] for daw in profile["daws"])
    assert profile["capabilities"]["session_manifest"] is True


def test_build_session_manifest_lists_stems_and_references(tmp_path: Path):
    project_root = tmp_path / "demo"
    stems_dir = project_root / "stems"
    refs_dir = project_root / "references"
    stems_dir.mkdir(parents=True)
    refs_dir.mkdir(parents=True)
    (stems_dir / "kick.wav").write_text("audio")
    (refs_dir / "ref.txt").write_text("notes")

    manifest = build_session_manifest({"project_root": str(project_root)})

    assert manifest["stem_count"] == 1
    assert manifest["reference_count"] == 1
    assert manifest["readiness"]["has_stems"] is True


def test_build_mix_plan_returns_preview_phases():
    plan = build_mix_plan({"session_manifest": {"stem_count": 12, "reference_count": 1, "readiness": {"ready_for_planning": True}}})

    assert plan["status"] == "preview"
    assert len(plan["phases"]) >= 3
    assert plan["session_summary"]["ready_for_planning"] is True


def test_build_listening_report_returns_preview_checks():
    report = build_listening_report({"target": "client-review", "references": ["ref-a.wav"], "issues": ["clip-risk"]})

    assert report["status"] == "preview"
    assert report["reference_count"] == 1
    assert any(check["slug"] == "known-issues" for check in report["checks"])
