from pathlib import Path
import os
import sys
from types import SimpleNamespace
from unittest.mock import patch

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from tasks.daw_exec import execute_reascript, execute_soundflow  # type: ignore  # noqa: E402


def test_execute_soundflow_dry_run_writes_log(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.soundflow"
    script.write_text("demo")
    settings = SimpleNamespace(dry_run_daw=True)
    result = execute_soundflow({"session_path": str(session), "script_path": str(script)}, settings)
    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is True
    artifact_kinds = {artifact["kind"] for artifact in result["artifacts"]}
    assert {"execution-manifest", "session-copy", "script-copy", "execution-log"} <= artifact_kinds
    assert Path(result["payload"]["working_session_path"]).exists()
    assert Path(result["payload"]["working_script_path"]).exists()


def test_execute_reascript_dry_run_writes_log(tmp_path: Path):
    session = tmp_path / "session.rpp"
    session.write_text("demo")
    script = tmp_path / "macro.lua"
    script.write_text("demo")
    settings = SimpleNamespace(dry_run_daw=True)
    result = execute_reascript({"session_path": str(session), "script_path": str(script)}, settings)
    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is True
    artifact_kinds = {artifact["kind"] for artifact in result["artifacts"]}
    assert {"execution-manifest", "session-copy", "script-copy", "execution-log"} <= artifact_kinds
    assert Path(result["payload"]["working_session_path"]).exists()
    assert Path(result["payload"]["working_script_path"]).exists()


def test_execute_reascript_live_dispatches_reaper_command(tmp_path: Path):
    session = tmp_path / "session.rpp"
    session.write_text("demo")
    script = tmp_path / "macro.lua"
    script.write_text("demo")
    reaper = tmp_path / "REAPER"
    reaper.write_text("binary")
    settings = SimpleNamespace(dry_run_daw=False, reaper_binary_path=str(reaper))

    with patch("adapters.reascript.subprocess.run") as mock_run:
        mock_run.return_value = SimpleNamespace(returncode=0, stdout="ok", stderr="")
        result = execute_reascript({"session_path": str(session), "script_path": str(script)}, settings)

    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is False
    assert result["payload"]["dispatch_command"][0] == str(reaper)
    assert Path(result["payload"]["working_session_path"]).exists()
