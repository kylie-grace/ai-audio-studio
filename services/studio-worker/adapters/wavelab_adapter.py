"""WaveLab adapter for mastering automation."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, HealthCheckResult, RenderedArtifact
from adapters.base import prepare_execution_workspace

logger = logging.getLogger(__name__)


def _script_for_action(action: str, params: dict) -> str:
    if action == "open_file":
        target = str(params.get("path") or params.get("session_path") or "").replace('"', '\\"')
        return f'tell application "WaveLab Pro" to open POSIX file "{target}"'
    if action == "apply_master_section":
        preset = str(params.get("preset") or params.get("master_section_preset") or "Default").replace('"', '\\"')
        return "\n".join([
            'tell application "WaveLab Pro" to activate',
            "delay 0.5",
            'tell application "System Events"',
            '    tell process "WaveLab Pro"',
            "        try",
            f'            click menu item "{preset}" of menu "Master Section Presets" of menu item "Master Section Presets" of menu "Processors" of menu bar 1',
            "        on error",
            f'            -- Fallback: preset "{preset}" not found in Processors > Master Section Presets',
            "            key code 35 using {command down, shift down}",
            "        end try",
            "    end tell",
            "end tell",
        ])
    if action == "render_to_file":
        target = str(params.get("output_path") or params.get("render_path") or "").replace('"', '\\"')
        return "\n".join([
            'tell application "WaveLab Pro" to activate',
            "delay 0.5",
            'tell application "System Events"',
            '    tell process "WaveLab Pro"',
            "        try",
            '            click menu item "Render Audio File..." of menu "Render" of menu item "Render" of menu "File" of menu bar 1',
            "            delay 1.0",
            f'            set value of text field 1 of window 1 to "{target}"',
            "            key code 36",
            "        on error",
            "            -- Fallback: render dialog automation failed, manual render required",
            "            key code 15 using {command down, shift down}",
            "        end try",
            "    end tell",
            "end tell",
        ])
    if action == "close_project":
        return 'tell application "WaveLab Pro" to close front document saving no'
    raise ValueError(f"Unsupported WaveLab action: {action}")


class WaveLabAdapter:
    def capability(self) -> str:
        return "execute-wavelab"

    def validate_environment(self, payload: dict) -> None:
        source_path = payload.get("session_path") or payload.get("file_path") or (payload.get("params") or {}).get("path")
        if source_path and not Path(source_path).exists():
            raise FileNotFoundError(f"WaveLab source path not found: {source_path}")
        if payload.get("dry_run"):
            return
        app_path = str(payload.get("wavelab_app_path") or "").strip()
        if not app_path or not Path(app_path).exists():
            raise FileNotFoundError("WAVELAB_APP_PATH is required for live WaveLab execution")

    def render(self, payload: dict) -> RenderedArtifact:
        action = str(payload.get("action") or "open_file")
        params = dict(payload.get("params") or {})
        source_path = Path(payload.get("session_path") or payload.get("file_path") or params.get("path"))
        script_path = Path(payload.get("script_path") or source_path.with_suffix(".wavelab.applescript"))
        script_path.write_text(_script_for_action(action, {**payload, **params}), encoding="utf-8")
        return RenderedArtifact(path=str(script_path), kind="wavelab-applescript", payload={**payload, "action": action, "params": params})

    async def health_check(self, payload: dict) -> HealthCheckResult:
        app_path = str(payload.get("wavelab_app_path") or "").strip()
        if not app_path or not Path(app_path).exists():
            return HealthCheckResult(connected=False, detail="WaveLab app path is not configured.")
        process = await asyncio.create_subprocess_exec(
            "osascript",
            "-e",
            'tell application "WaveLab Pro" to get version',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=float(payload.get("timeout_seconds", 10.0)),
        )
        if (process.returncode or 0) != 0:
            return HealthCheckResult(connected=False, detail=stderr.decode("utf-8", errors="ignore"))
        return HealthCheckResult(connected=True, detail=stdout.decode("utf-8", errors="ignore").strip() or "WaveLab available.")

    async def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        source_path = Path(payload.get("session_path") or payload.get("file_path") or (payload.get("params") or {}).get("path"))
        workspace = prepare_execution_workspace(source_path, Path(rendered.path), "wavelab", payload)
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="wavelab-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="wavelab-working-source"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="wavelab-working-script"),
        ]
        log_path = workspace["run_dir"] / "wavelab-execution.log"

        if payload.get("dry_run"):
            logger.info("WaveLab dry-run action: %s", rendered.payload["action"])
            log_path.write_text("Dry-run WaveLab execution completed.\n", encoding="utf-8")
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="wavelab-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run WaveLab execution completed",
                payload={**workspace["manifest"], "dry_run": True, "action": rendered.payload["action"]},
                artifacts=artifacts,
            )

        logger.info("WaveLab action: %s", rendered.payload["action"])
        command = ["osascript", str(workspace["script_copy"])]
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
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="wavelab-execution-log"))
        if (process.returncode or 0) != 0:
            raise RuntimeError(f"WaveLab AppleScript failed with exit code {process.returncode or 0}: {stderr_text}")
        return ExecutionResult(
            status="complete",
            message=f"WaveLab action executed: {rendered.payload['action']}",
            payload={**workspace["manifest"], "dry_run": False, "action": rendered.payload["action"], "params": rendered.payload["params"]},
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
