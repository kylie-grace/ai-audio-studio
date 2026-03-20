from pathlib import Path
import os
import sys
from types import SimpleNamespace

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
    assert Path(result["artifacts"][0]["path"]).exists()


def test_execute_reascript_dry_run_writes_log(tmp_path: Path):
    session = tmp_path / "session.rpp"
    session.write_text("demo")
    script = tmp_path / "macro.lua"
    script.write_text("demo")
    settings = SimpleNamespace(dry_run_daw=True)
    result = execute_reascript({"session_path": str(session), "script_path": str(script)}, settings)
    assert result["status"] == "complete"
    assert result["payload"]["dry_run"] is True
    assert Path(result["artifacts"][0]["path"]).exists()
