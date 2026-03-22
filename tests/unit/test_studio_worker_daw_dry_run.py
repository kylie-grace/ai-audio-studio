from pathlib import Path
import os
import sys
from types import SimpleNamespace
from unittest.mock import patch

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from tasks.daw_exec import execute_reascript, execute_soundflow, execute_wavelab  # type: ignore  # noqa: E402


def test_execute_soundflow_dry_run_writes_log(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.soundflow"
    script.write_text("demo")
    settings = SimpleNamespace(dry_run_daw=True, worker_platform="macos", soundflow_cli_path=None, protools_app_path=None, reaper_binary_path=None, wavelab_app_path=None)
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
    settings = SimpleNamespace(dry_run_daw=True, worker_platform="macos", soundflow_cli_path=None, protools_app_path=None, reaper_binary_path=None, wavelab_app_path=None)
    result = execute_reascript({"session_path": str(session), "script_path": str(script)}, settings)
    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is True
    artifact_kinds = {artifact["kind"] for artifact in result["artifacts"]}
    assert {"execution-manifest", "session-copy", "script-copy", "execution-log"} <= artifact_kinds
    assert Path(result["payload"]["working_session_path"]).exists()
    assert Path(result["payload"]["working_script_path"]).exists()


def test_execute_wavelab_dry_run_writes_log(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("demo")
    settings = SimpleNamespace(dry_run_daw=True, worker_platform="macos", soundflow_cli_path=None, protools_app_path=None, reaper_binary_path=None, wavelab_app_path=None)
    result = execute_wavelab({"session_path": str(source), "action": "open_file"}, settings)
    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is True
    artifact_kinds = {artifact["kind"] for artifact in result["artifacts"]}
    assert {"execution-manifest", "session-copy", "script-copy", "execution-log"} <= artifact_kinds


def test_execute_reascript_live_dispatches_reaper_command(tmp_path: Path):
    session = tmp_path / "session.rpp"
    session.write_text("demo")
    script = tmp_path / "macro.lua"
    script.write_text("demo")
    reaper = tmp_path / "REAPER"
    reaper.write_text("binary")
    marker = tmp_path / "done.json"
    marker.write_text("{}")
    settings = SimpleNamespace(
        dry_run_daw=False,
        reaper_binary_path=str(reaper),
        worker_platform="macos",
        soundflow_cli_path=None,
        protools_app_path=None,
        wavelab_app_path=None,
    )

    class FakeProcess:
        def __init__(self) -> None:
            self.returncode = 0

        async def communicate(self):
            return (b"ok", b"")

        async def wait(self):
            return 0

    async def fake_create_subprocess_exec(*args, **kwargs):
        return FakeProcess()

    with patch("adapters.reascript.asyncio.create_subprocess_exec", side_effect=fake_create_subprocess_exec) as mock_popen:
        result = execute_reascript(
            {
                "session_path": str(session),
                "script_path": str(script),
                "completion_marker_path": str(marker),
            },
            settings,
        )

    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is False
    assert result["payload"]["dispatch_command"][0] == str(reaper)
    assert Path(result["payload"]["working_session_path"]).exists()
    assert mock_popen.call_count == 1
