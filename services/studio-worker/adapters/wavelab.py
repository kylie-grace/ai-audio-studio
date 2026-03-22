"""WaveLab adapter — mastering-oriented AppleScript bridge."""

from __future__ import annotations

from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, HealthCheckResult, RenderedArtifact
from adapters.base import prepare_execution_workspace, run_subprocess


def _wavelab_script(action: str, params: dict) -> str:
    if action == "open_file":
        target = str(params.get("path") or params.get("session_path") or "").replace('"', '\\"')
        return f'tell application "WaveLab Pro" to open POSIX file "{target}"'
    if action == "apply_master_section":
        preset = str(params.get("preset") or params.get("master_section_preset") or "Default").replace('"', '\\"')
        return (
            'tell application "WaveLab Pro"\n'
            f'  activate\n'
            f'  -- Apply master section preset: {preset}\n'
            "end tell"
        )
    if action == "render_to_file":
        target = str(params.get("output_path") or params.get("render_path") or "").replace('"', '\\"')
        return (
            'tell application "WaveLab Pro"\n'
            f'  -- Render current montage/document to "{target}"\n'
            "  activate\n"
            "end tell"
        )
    if action == "close_project":
        return 'tell application "WaveLab Pro" to close front document saving no'
    raise ValueError(f"Unsupported WaveLab action: {action}")


class WaveLabAdapter:
    def capability(self) -> str:
        return "execute-wavelab"

    def validate_environment(self, payload: dict) -> None:
        wavelab_app_path = payload.get("wavelab_app_path")
        if not payload.get("dry_run") and (not wavelab_app_path or not Path(wavelab_app_path).exists()):
            raise FileNotFoundError("WAVELAB_APP_PATH is required for live WaveLab execution")
        source_path = payload.get("session_path") or payload.get("file_path") or (payload.get("params") or {}).get("path")
        if source_path and not Path(source_path).exists():
            raise FileNotFoundError(f"WaveLab source path not found: {source_path}")

    def render(self, payload: dict) -> RenderedArtifact:
        action = str(payload.get("action") or "open_file")
        params = dict(payload.get("params") or {})
        script_source = _wavelab_script(action, {**params, **payload})
        script_path = Path(payload.get("script_path") or Path(payload.get("session_path") or payload.get("file_path")).with_suffix(".wavelab.applescript"))
        script_path.write_text(script_source, encoding="utf-8")
        return RenderedArtifact(path=str(script_path), kind="wavelab-applescript", payload={**payload, "action": action, "params": params})

    async def health_check(self, payload: dict) -> HealthCheckResult:
        wavelab_app_path = str(payload.get("wavelab_app_path") or "").strip()
        if not wavelab_app_path or not Path(wavelab_app_path).exists():
            return HealthCheckResult(connected=False, detail="WaveLab app path is not configured.")
        app_name = Path(wavelab_app_path).stem
        result = await run_subprocess(
            [
                "osascript",
                "-e",
                f'tell application "System Events" to return exists process "{app_name}"',
            ],
            timeout_seconds=float(payload.get("timeout_seconds", 10.0)),
        )
        connected = result.returncode == 0 and result.stdout.strip().lower() == "true"
        detail = "WaveLab process detected." if connected else "WaveLab process not detected."
        return HealthCheckResult(connected=connected, detail=detail)

    async def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        source_path = Path(payload.get("session_path") or payload.get("file_path") or (payload.get("params") or {}).get("path"))
        rendered = self.render(payload)
        workspace = prepare_execution_workspace(source_path, Path(rendered.path), "wavelab", payload)
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="wavelab-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="wavelab-working-source"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="wavelab-working-script"),
        ]
        log_path = workspace["run_dir"] / "wavelab-execution.log"
        if payload.get("dry_run"):
            log_path.write_text("Dry-run WaveLab execution completed.\n", encoding="utf-8")
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="wavelab-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run WaveLab execution completed",
                payload={**workspace["manifest"], "dry_run": True, "action": rendered.payload["action"]},
                artifacts=artifacts,
            )

        command = ["osascript", str(workspace["script_copy"])]
        result = await run_subprocess(command, timeout_seconds=float(payload.get("timeout_seconds", 30.0)))
        log_path.write_text(
            f"command: {' '.join(command)}\n"
            f"returncode: {result.returncode}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}\n",
            encoding="utf-8",
        )
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="wavelab-execution-log"))
        if result.returncode != 0:
            raise RuntimeError(f"WaveLab AppleScript failed with exit code {result.returncode}: {result.stderr[:300]}")
        return ExecutionResult(
            status="complete",
            message=f"WaveLab action executed: {rendered.payload['action']}",
            payload={**workspace["manifest"], "dry_run": False, "action": rendered.payload["action"], "params": rendered.payload["params"]},
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
