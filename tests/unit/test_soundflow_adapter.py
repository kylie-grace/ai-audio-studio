import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from adapters.soundflow_adapter import SoundFlowAdapter  # type: ignore  # noqa: E402


class FakeProcess:
    def __init__(self, *, returncode: int = 0, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout.encode("utf-8"), self._stderr.encode("utf-8")


def test_execute_success_returns_parsed_json(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.json"
    script.write_text(json.dumps({"steps": []}))
    cli = tmp_path / "SoundFlow"
    cli.write_text("bin")

    with patch("adapters.soundflow_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(stdout='{"ok":true}')):
        result = asyncio.run(
            SoundFlowAdapter().execute(
                {
                    "session_path": str(session),
                    "script_path": str(script),
                    "soundflow_cli_path": str(cli),
                    "dry_run": False,
                }
            )
        )

    assert result.status == "complete"
    assert result.payload["result"] == {"ok": True}


def test_execute_non_zero_exit_raises_runtime_error(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.json"
    script.write_text(json.dumps({"steps": []}))
    cli = tmp_path / "SoundFlow"
    cli.write_text("bin")

    with patch("adapters.soundflow_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(returncode=1, stderr="bad")):
        try:
            asyncio.run(
                SoundFlowAdapter().execute(
                    {
                        "session_path": str(session),
                        "script_path": str(script),
                        "soundflow_cli_path": str(cli),
                        "dry_run": False,
                    }
                )
            )
        except RuntimeError as exc:
            assert "bad" in str(exc)
        else:
            raise AssertionError("Expected RuntimeError")


def test_execute_timeout_raises_asyncio_timeout_error(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.json"
    script.write_text(json.dumps({"steps": []}))
    cli = tmp_path / "SoundFlow"
    cli.write_text("bin")

    async def fake_wait_for(coro, timeout):
        coro.close()
        raise asyncio.TimeoutError

    with patch("adapters.soundflow_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess()), patch(
        "adapters.soundflow_adapter.asyncio.wait_for",
        side_effect=fake_wait_for,
    ):
        try:
            asyncio.run(
                SoundFlowAdapter().execute(
                    {
                        "session_path": str(session),
                        "script_path": str(script),
                        "soundflow_cli_path": str(cli),
                        "dry_run": False,
                    }
                )
            )
        except asyncio.TimeoutError:
            pass
        else:
            raise AssertionError("Expected asyncio.TimeoutError")


def test_health_check_true_when_cli_available(tmp_path: Path):
    cli = tmp_path / "SoundFlow"
    cli.write_text("bin")
    with patch("adapters.soundflow_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(stdout="1.0.0")):
        result = asyncio.run(SoundFlowAdapter().health_check({"soundflow_cli_path": str(cli)}))
    assert result.connected is True


def test_health_check_false_when_cli_absent():
    result = asyncio.run(SoundFlowAdapter().health_check({"soundflow_cli_path": "/missing/sf"}))
    assert result.connected is False


def test_execute_dry_run_writes_artifacts(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.json"
    script.write_text(json.dumps({"steps": []}))
    result = asyncio.run(
        SoundFlowAdapter().execute(
            {
                "session_path": str(session),
                "script_path": str(script),
                "dry_run": True,
            }
        )
    )
    assert result.status == "complete"
    assert any(artifact.kind == "execution-log" for artifact in result.artifacts)


def test_render_json_manifest_creates_sf_js(tmp_path: Path):
    session = tmp_path / "session.ptx"
    session.write_text("demo")
    script = tmp_path / "macro.json"
    script.write_text(json.dumps({"steps": [{"action": "comment", "comment": "hi"}], "metadata": {"session_path": str(session)}}))
    rendered = SoundFlowAdapter().render({"session_path": str(session), "script_path": str(script)})
    assert rendered.path.endswith(".sf.js")
    assert Path(rendered.path).exists()


def test_health_check_false_when_cli_returns_non_zero(tmp_path: Path):
    cli = tmp_path / "SoundFlow"
    cli.write_text("bin")
    with patch("adapters.soundflow_adapter.asyncio.create_subprocess_exec", return_value=FakeProcess(returncode=1, stderr="nope")):
        result = asyncio.run(SoundFlowAdapter().health_check({"soundflow_cli_path": str(cli)}))
    assert result.connected is False
