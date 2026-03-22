"""SoundFlow adapter for Pro Tools automation."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, HealthCheckResult, RenderedArtifact
from adapters.base import prepare_execution_workspace


class SoundFlowAdapter:
    def capability(self) -> str:
        return "execute-soundflow"

    def validate_environment(self, payload: dict) -> None:
        session_path = Path(payload["session_path"])
        script_path = Path(payload["script_path"])
        if not session_path.exists():
            raise FileNotFoundError(f"Session path not found: {session_path}")
        if not script_path.exists():
            raise FileNotFoundError(f"SoundFlow script not found: {script_path}")
        if payload.get("dry_run"):
            return
        cli_path = str(payload.get("soundflow_cli_path") or "").strip()
        if not cli_path or not Path(cli_path).exists():
            raise FileNotFoundError("SOUNDFLOW_CLI_PATH is required for live SoundFlow execution")

    def render(self, payload: dict) -> RenderedArtifact:
        script_path = Path(payload["script_path"])
        raw = script_path.read_text(encoding="utf-8")
        try:
          manifest = json.loads(raw)
        except json.JSONDecodeError:
          return RenderedArtifact(path=str(script_path), kind="soundflow-script", payload={**payload, "steps": []})
        js_path = script_path.with_suffix(".sf.js")
        js_path.write_text(
            "// AI Audio Studio generated SoundFlow script\n"
            f"console.log({json.dumps(json.dumps(manifest))});\n",
            encoding="utf-8",
        )
        return RenderedArtifact(path=str(js_path), kind="soundflow-script", payload={**payload, "steps": manifest.get("steps", [])})

    async def health_check(self, payload: dict) -> HealthCheckResult:
        cli_path = str(payload.get("soundflow_cli_path") or "").strip()
        if not cli_path or not Path(cli_path).exists():
            return HealthCheckResult(connected=False, detail="SoundFlow CLI path is not configured.")
        process = await asyncio.create_subprocess_exec(
            cli_path,
            "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=float(payload.get("timeout_seconds", 10.0)),
        )
        if (process.returncode or 0) != 0:
            return HealthCheckResult(connected=False, detail=stderr.decode("utf-8", errors="ignore"))
        return HealthCheckResult(connected=True, detail=stdout.decode("utf-8", errors="ignore").strip() or "SoundFlow CLI available.")

    async def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        workspace = prepare_execution_workspace(Path(payload["session_path"]), Path(rendered.path), "soundflow", payload)
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="soundflow-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="soundflow-working-session"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="soundflow-working-script"),
        ]
        log_path = workspace["run_dir"] / "soundflow-execution.log"

        if payload.get("dry_run"):
            log_path.write_text("Dry-run SoundFlow execution completed.\n", encoding="utf-8")
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run SoundFlow execution completed",
                payload={**workspace["manifest"], "dry_run": True},
                artifacts=artifacts,
            )

        cli_path = str(payload.get("soundflow_cli_path") or "").strip()
        command = [cli_path, "--run-script", str(workspace["script_copy"])]
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=float(payload.get("timeout_seconds", 30.0)),
        )
        stdout_text = stdout.decode("utf-8", errors="ignore")
        stderr_text = stderr.decode("utf-8", errors="ignore")
        log_path.write_text(
            f"command: {' '.join(command)}\nreturncode: {process.returncode or 0}\nstdout:\n{stdout_text}\nstderr:\n{stderr_text}\n",
            encoding="utf-8",
        )
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-execution-log"))
        if (process.returncode or 0) != 0:
            raise RuntimeError(f"SoundFlow CLI failed (exit {process.returncode or 0}): {stderr_text}")
        try:
            parsed = json.loads(stdout_text)
        except json.JSONDecodeError:
            parsed = {"stdout": stdout_text.strip()}
        return ExecutionResult(
            status="complete",
            message="SoundFlow execution completed",
            payload={**workspace["manifest"], "dry_run": False, "result": parsed},
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
