"""ReaScript adapter."""

from __future__ import annotations

import asyncio
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, HealthCheckResult, RenderedArtifact
from adapters.base import prepare_execution_workspace, run_subprocess


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

    def render(self, payload: dict) -> RenderedArtifact:
        script_path = Path(payload["script_path"])
        return RenderedArtifact(path=str(script_path), kind="reascript", payload=payload)

    async def health_check(self, payload: dict) -> HealthCheckResult:
        reaper_binary_path = str(payload.get("reaper_binary_path") or "").strip()
        if not reaper_binary_path or not Path(reaper_binary_path).exists():
            return HealthCheckResult(connected=False, detail="REAPER binary path is not configured.")
        if str(payload.get("worker_platform") or "").lower() == "macos":
            result = await run_subprocess(
                [
                    "osascript",
                    "-e",
                    'tell application "System Events" to return exists process "REAPER"',
                ],
                timeout_seconds=float(payload.get("timeout_seconds", 10.0)),
            )
            connected = result.returncode == 0 and result.stdout.strip().lower() == "true"
            detail = "REAPER process detected." if connected else "REAPER process not detected."
            return HealthCheckResult(connected=connected, detail=detail)
        return HealthCheckResult(connected=True, detail="REAPER binary is configured.")

    async def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        workspace = prepare_execution_workspace(Path(payload["session_path"]), Path(rendered.path), "reascript", payload)
        cancel_marker = Path(payload["cancel_marker_path"]) if payload.get("cancel_marker_path") else None
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="reascript-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="reascript-working-session"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="reascript-working-script"),
        ]
        if payload.get("dry_run"):
            log_path = workspace["run_dir"] / "reascript-execution.log"
            log_path.write_text("Dry-run ReaScript execution completed.\n", encoding="utf-8")
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
        if cancel_marker and cancel_marker.exists():
            raise RuntimeError("Execution cancelled by operator before REAPER dispatch")
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        timeout_seconds = float(payload.get("timeout_seconds", 30.0))
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds
        while process.returncode is None:
            if cancel_marker and cancel_marker.exists():
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5)
                except TimeoutError:
                    process.kill()
                    await process.wait()
                raise RuntimeError("Execution cancelled by operator during REAPER dispatch")
            if loop.time() >= deadline:
                process.kill()
                await process.wait()
                raise RuntimeError(f"REAPER execution timed out after {timeout_seconds:.1f}s")
            await asyncio.sleep(0.25)
        stdout, stderr = await process.communicate()
        completion_marker = payload.get("completion_marker_path")
        marker_timeout_seconds = float(payload.get("marker_timeout_seconds", 10))
        if completion_marker:
            marker_path = Path(completion_marker)
            marker_deadline = loop.time() + marker_timeout_seconds
            while loop.time() < marker_deadline:
                if cancel_marker and cancel_marker.exists():
                    raise RuntimeError("Execution cancelled by operator while waiting for REAPER completion marker")
                if marker_path.exists():
                    break
                await asyncio.sleep(0.25)
            else:
                raise RuntimeError(f"REAPER script did not produce completion marker: {marker_path}")
        log_path = workspace["run_dir"] / "reascript-execution.log"
        log_path.write_text(
            f"command: {' '.join(command)}\n"
            f"returncode: {process.returncode}\n"
            f"stdout:\n{stdout.decode('utf-8', errors='ignore')}\n"
            f"stderr:\n{stderr.decode('utf-8', errors='ignore')}\n",
            encoding="utf-8",
        )
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="reascript-execution-log"))
        if process.returncode != 0:
            raise RuntimeError(f"REAPER command failed with exit code {process.returncode}")
        return ExecutionResult(
            status="complete",
            message="ReaScript execution dispatched to REAPER",
            payload={**workspace["manifest"], "dry_run": False, "dispatch_command": command, "completion_marker_path": completion_marker},
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
