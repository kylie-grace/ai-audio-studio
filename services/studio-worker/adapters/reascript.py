"""ReaScript adapter scaffold."""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, RenderedArtifact
from adapters.base import prepare_execution_workspace


class ReaScriptAdapter:
    def capability(self) -> str:
        return "execute-reascript"

    def validate_environment(self, payload: dict) -> None:
        script_path = Path(payload["script_path"])
        session_path = Path(payload["session_path"])
        if not session_path.exists():
            raise FileNotFoundError(f"Session path not found: {session_path}")
        if not script_path.exists():
            raise FileNotFoundError(f"ReaScript script not found: {script_path}")
        reaper_binary_path = payload.get("reaper_binary_path")
        if not payload.get("dry_run") and not reaper_binary_path:
            raise FileNotFoundError("REAPER binary path not configured for live ReaScript execution")
        if reaper_binary_path and not Path(reaper_binary_path).exists():
            raise FileNotFoundError(f"REAPER binary path not found: {reaper_binary_path}")

    def render(self, payload: dict) -> RenderedArtifact | None:
        script_path = Path(payload["script_path"])
        return RenderedArtifact(path=str(script_path), kind="reascript", payload=payload)

    def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        workspace = prepare_execution_workspace(Path(payload["session_path"]), Path(rendered.path), "reascript", payload)
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="reascript-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="reascript-working-session"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="reascript-working-script"),
        ]
        if payload.get("dry_run"):
            log_path = workspace["run_dir"] / "reascript-execution.log"
            log_path.write_text("Dry-run ReaScript execution completed.\n")
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="reascript-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run ReaScript execution completed",
                payload={**workspace["manifest"], "dry_run": True},
                artifacts=artifacts,
            )
        command = [
            str(payload["reaper_binary_path"]),
            "-nonewinst",
            "-nosplash",
            "-noactivate",
            str(workspace["session_copy"]),
            str(workspace["script_copy"]),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, check=False, timeout=30)
        completion_marker = payload.get("completion_marker_path")
        marker_timeout_seconds = float(payload.get("marker_timeout_seconds", 10))
        if completion_marker:
            marker_path = Path(completion_marker)
            deadline = time.time() + marker_timeout_seconds
            while time.time() < deadline:
                if marker_path.exists():
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError(f"REAPER script did not produce completion marker: {marker_path}")
        log_path = workspace["run_dir"] / "reascript-execution.log"
        log_path.write_text(
            f"command: {' '.join(command)}\n"
            f"returncode: {completed.returncode}\n"
            f"stdout:\n{completed.stdout}\n"
            f"stderr:\n{completed.stderr}\n"
        )
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="reascript-execution-log"))
        if completed.returncode != 0:
            raise RuntimeError(f"REAPER command failed with exit code {completed.returncode}")
        return ExecutionResult(
            status="complete",
            message="ReaScript execution dispatched to REAPER",
            payload={**workspace["manifest"], "dry_run": False, "dispatch_command": command, "completion_marker_path": completion_marker},
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
