from pathlib import Path
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from tasks.revision_plan import parse_changes, write_revision_artifacts  # type: ignore  # noqa: E402


def test_write_revision_artifacts_creates_reascript_and_change_manifest(tmp_path: Path):
    changes = parse_changes("Bring vocals up and tame muddy bass.")

    result = write_revision_artifacts(tmp_path, "reaper", changes, "/tmp/demo.rpp")

    assert result["script_path"].endswith(".lua")
    assert Path(result["script_path"]).exists()
    assert Path(result["changes_path"]).exists()
    assert "ShowConsoleMsg" in Path(result["script_path"]).read_text()


def test_write_revision_artifacts_creates_soundflow_payload_for_protools(tmp_path: Path):
    changes = parse_changes("Bring vocals up.")

    result = write_revision_artifacts(tmp_path, "protools", changes, "/tmp/demo.ptx")

    assert result["script_path"].endswith(".json")
    body = Path(result["script_path"]).read_text()
    assert "\"generated_by\": \"ai-audio-studio\"" in body
    assert Path(result["changes_path"]).exists()


def test_volume_change_generates_reaper_api_call(tmp_path: Path):
    changes = [{"parameter": "volume", "value": -6, "track_index": 0, "direction": "down",
                "element": "vocals", "human_readable": "Bring vocals down 6dB"}]

    result = write_revision_artifacts(tmp_path, "reaper", changes, "/tmp/demo.rpp")

    lua = Path(result["script_path"]).read_text()
    assert "reaper.SetMediaTrackInfo_Value" in lua
    assert "TODO" not in lua


def test_pan_change_generates_reaper_api_call(tmp_path: Path):
    changes = [{"parameter": "pan", "value": -50, "track_index": 1, "direction": "adjust",
                "element": "bass", "human_readable": "Pan bass left"}]

    result = write_revision_artifacts(tmp_path, "reaper", changes, "/tmp/demo.rpp")

    lua = Path(result["script_path"]).read_text()
    assert "reaper.SetMediaTrackInfo_Value" in lua
    assert "D_PAN" in lua


def test_undo_block_present(tmp_path: Path):
    changes = parse_changes("Bring vocals up.")

    result = write_revision_artifacts(tmp_path, "reaper", changes, "/tmp/demo.rpp")

    lua = Path(result["script_path"]).read_text()
    assert "reaper.Undo_BeginBlock" in lua
