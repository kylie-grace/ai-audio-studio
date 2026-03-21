from pathlib import Path
import os
import sys
from types import SimpleNamespace

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from workstation import detect_workstation_profile  # type: ignore  # noqa: E402
import workstation as workstation_module  # type: ignore  # noqa: E402
from tasks.execution_plan import build_execution_plan  # type: ignore  # noqa: E402
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


def test_detect_workstation_profile_scans_plugin_inventory(tmp_path: Path):
    au_root = tmp_path / "Components"
    vst3_root = tmp_path / "VST3"
    au_root.mkdir()
    vst3_root.mkdir()
    (au_root / "DemoVendor - VocalStrip.component").write_text("plugin")
    (vst3_root / "WideStage.vst3").write_text("plugin")

    original_roots = workstation_module.PLUGIN_ROOTS
    workstation_module.PLUGIN_ROOTS = {
        "au": [au_root],
        "vst3": [vst3_root],
        "vst": [],
        "aax": [],
    }
    try:
        settings = SimpleNamespace(
            reaper_binary_path=None,
            protools_app_path=None,
            soundflow_cli_path=None,
            dry_run_daw=True,
            worker_platform="macos",
            worker_api_base_url=None,
            shared_projects_path=str(tmp_path / "projects"),
            delivery_path=str(tmp_path / "deliveries"),
        )
        profile = detect_workstation_profile(settings)
    finally:
        workstation_module.PLUGIN_ROOTS = original_roots

    assert profile["plugins"]["summary"]["count"] == 2
    assert profile["plugins"]["summary"]["counts_by_format"]["au"] == 1
    assert profile["plugins"]["summary"]["counts_by_format"]["vst3"] == 1
    assert any(plugin["name"] == "DemoVendor - VocalStrip" for plugin in profile["plugins"]["plugins"])


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


def test_build_session_manifest_parses_reaper_tracks(tmp_path: Path):
    project_root = tmp_path / "demo"
    session_dir = project_root / "session"
    session_dir.mkdir(parents=True)
    (session_dir / "demo.rpp").write_text(
        '<REAPER_PROJECT 0.1 "6.0/x64" 0 0 0\n'
        '  TEMPO 120 4 4\n'
        '  <TRACK\n'
        '    NAME "Lead Vox"\n'
        '  >\n'
        '  <TRACK\n'
        '    NAME "Drum Bus"\n'
        '  >\n'
        '  MARKER 1 12.5 "Verse"\n'
    )

    manifest = build_session_manifest({"project_root": str(project_root)})

    assert manifest["session_details"]["session_type"] == "reaper"
    assert manifest["session_details"]["track_count"] == 2
    assert "Lead Vox" in manifest["session_details"]["track_names"]
    assert manifest["readiness"]["confidence_score"] > 0.5


def test_build_mix_plan_returns_preview_phases():
    plan = build_mix_plan(
        {
            "workstation": {"plugins": {"summary": {"count": 0, "counts_by_format": {"au": 0, "vst3": 0, "vst": 0, "aax": 0}}}},
            "session_manifest": {"stem_count": 12, "reference_count": 1, "readiness": {"ready_for_planning": True}},
        }
    )

    assert plan["status"] == "preview"
    assert len(plan["phases"]) >= 3
    assert plan["session_summary"]["ready_for_planning"] is True
    assert any(warning["slug"] == "empty-plugin-inventory" for warning in plan["dependency_warnings"])


def test_build_listening_report_returns_preview_checks():
    report = build_listening_report(
        {
            "target": "client-review",
            "references": ["ref-a.wav"],
            "issues": ["clip-risk"],
            "qc_summary": {"target": "streaming", "hard_fail_count": 1, "warning_count": 2},
            "reference_summary": {"lufs_delta": -0.8, "true_peak_delta": -0.2, "alignment": "close"},
        }
    )

    assert report["status"] == "preview"
    assert report["reference_count"] == 1
    assert any(check["slug"] == "known-issues" for check in report["checks"])
    assert report["summary"]["qc_hard_fail_count"] == 1


def test_build_execution_plan_reports_blockers():
    plan = build_execution_plan(
        {
            "workstation": {
                "dry_run_daw": True,
                "blockers": ["dry-run-enabled"],
                "plugins": {"summary": {"count": 0, "counts_by_format": {"au": 0, "vst3": 0, "vst": 0, "aax": 0}}},
            },
            "session_manifest": {"stem_count": 12, "session_details": {"track_count": 16}, "readiness": {"ready_for_planning": True}},
            "mix_plan": {"phases": [{"slug": "static", "title": "Static", "actions": []}]},
            "render_plan": {"profiles": [{"slug": "review"}], "profile_count": 1},
            "listening_report": {"next_actions": ["Listen"]},
        }
    )

    assert plan["status"] == "preview"
    assert plan["ready_for_operator_review"] is True
    assert len(plan["phases"]) == 5
    assert any(warning["slug"] == "empty-plugin-inventory" for warning in plan["dependency_warnings"])
