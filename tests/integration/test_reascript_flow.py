from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
SERVICE_ROOT = ROOT / "services" / "studio-worker"
INTEGRATION_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE_ROOT))
sys.path.insert(0, str(INTEGRATION_ROOT))

from mock_reaper import build_reascript_source, write_mock_reaper_binary  # type: ignore  # noqa: E402
from adapters.reascript import ReaScriptAdapter  # type: ignore  # noqa: E402


def test_execute_reascript_uses_mock_reaper_and_writes_completion_marker(
    tmp_path: Path,
    monkeypatch,
) -> None:
    session = tmp_path / "session.rpp"
    session.write_text("demo session")

    marker = tmp_path / "artifacts" / "reaper-complete.json"
    script = tmp_path / "macro.lua"
    script.write_text(build_reascript_source(marker))

    reaper = write_mock_reaper_binary(tmp_path / "bin" / "mock-reaper")
    settings = SimpleNamespace(dry_run_daw=False, reaper_binary_path=str(reaper))
    monkeypatch.setenv("AI_AUDIO_STUDIO_COMPLETION_MARKER", str(marker))

    adapter = ReaScriptAdapter()
    result = asyncio.run(
        adapter.execute(
            {
                "session_path": str(session),
                "script_path": str(script),
                "completion_marker_path": str(marker),
                "marker_timeout_seconds": 5,
                "dry_run": settings.dry_run_daw,
                "reaper_binary_path": settings.reaper_binary_path,
            }
        )
    )

    assert result.status == "complete"
    assert result.payload["dry_run"] is False
    assert result.payload["dispatch_command"][0] == str(reaper)
    assert result.payload["completion_marker_path"] == str(marker)

    artifact_kinds = {artifact.kind for artifact in result.artifacts}
    assert {"execution-manifest", "session-copy", "script-copy", "execution-log"} <= artifact_kinds

    assert marker.exists()
    marker_payload = json.loads(marker.read_text())
    assert marker_payload["status"] == "ok"
    assert marker_payload["source"] == "mock-reaper"
    assert marker_payload["session_path"] == result.payload["working_session_path"]
    assert marker_payload["script_path"] == result.payload["working_script_path"]
