import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from adapters.wavelab_adapter import WaveLabAdapter  # type: ignore  # noqa: E402


class FakeProcess:
    def __init__(self, *, returncode: int = 0, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout.encode("utf-8"), self._stderr.encode("utf-8")


def _execute(action: str, payload: dict):
    with patch("adapters.wavelab_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(stdout="ok")):
        return asyncio.run(WaveLabAdapter().execute({**payload, "action": action}))


def test_open_file_action(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    result = _execute("open_file", {"session_path": str(source), "wavelab_app_path": str(app), "dry_run": False})
    assert result.status == "complete"


def test_apply_master_section_action(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    result = _execute("apply_master_section", {"session_path": str(source), "wavelab_app_path": str(app), "dry_run": False, "params": {"preset": "Loud"}})
    assert result.payload["action"] == "apply_master_section"


def test_render_to_file_action(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    result = _execute("render_to_file", {"session_path": str(source), "wavelab_app_path": str(app), "dry_run": False, "params": {"output_path": str(tmp_path / "out.wav")}})
    assert result.payload["action"] == "render_to_file"


def test_close_project_action(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    result = _execute("close_project", {"session_path": str(source), "wavelab_app_path": str(app), "dry_run": False})
    assert result.payload["action"] == "close_project"


def test_health_check_true(tmp_path: Path):
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    with patch("adapters.wavelab_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(stdout="12.0")):
        result = asyncio.run(WaveLabAdapter().health_check({"wavelab_app_path": str(app)}))
    assert result.connected is True


def test_health_check_false():
    result = asyncio.run(WaveLabAdapter().health_check({"wavelab_app_path": "/missing/WaveLab Pro.app"}))
    assert result.connected is False


def test_execute_non_zero_exit_raises_runtime_error(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    with patch("adapters.wavelab_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(returncode=1, stderr="bad")):
        try:
            asyncio.run(WaveLabAdapter().execute({"session_path": str(source), "wavelab_app_path": str(app), "dry_run": False, "action": "open_file"}))
        except RuntimeError as exc:
            assert "bad" in str(exc)
        else:
            raise AssertionError("Expected RuntimeError")


def test_execute_timeout_raises_asyncio_timeout_error(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    app = tmp_path / "WaveLab Pro.app"
    app.write_text("app")
    async def fake_wait_for(coro, timeout):
        coro.close()
        raise asyncio.TimeoutError

    with patch("adapters.wavelab_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess()), patch(
        "adapters.wavelab_adapter.asyncio.wait_for",
        side_effect=fake_wait_for,
    ):
        try:
            asyncio.run(WaveLabAdapter().execute({"session_path": str(source), "wavelab_app_path": str(app), "dry_run": False, "action": "open_file"}))
        except asyncio.TimeoutError:
            pass
        else:
            raise AssertionError("Expected asyncio.TimeoutError")


def test_render_creates_applescript(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    rendered = WaveLabAdapter().render({"session_path": str(source), "action": "open_file"})
    assert rendered.path.endswith(".wavelab.applescript")
    assert Path(rendered.path).exists()


def test_apply_master_section_script_contains_system_events(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    rendered = WaveLabAdapter().render({"session_path": str(source), "action": "apply_master_section", "params": {"preset": "Loud"}})
    script = Path(rendered.path).read_text(encoding="utf-8")
    assert "System Events" in script
    assert "-- Apply master section preset:" not in script


def test_render_to_file_script_contains_system_events(tmp_path: Path):
    source = tmp_path / "master.wav"
    source.write_text("audio")
    rendered = WaveLabAdapter().render({"session_path": str(source), "action": "render_to_file", "params": {"output_path": str(tmp_path / "out.wav")}})
    script = Path(rendered.path).read_text(encoding="utf-8")
    assert "System Events" in script
    assert "-- Render to" not in script
