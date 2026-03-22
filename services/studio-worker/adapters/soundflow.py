"""SoundFlow adapter — executes Pro Tools revision scripts via SoundFlow or osascript."""

from __future__ import annotations

import asyncio
import json
import textwrap
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, HealthCheckResult, RenderedArtifact
from adapters.base import prepare_execution_workspace, run_subprocess


def _steps_to_js(steps: list[dict], session_path: str | None) -> str:
    step_lines: list[str] = []
    for idx, step in enumerate(steps):
        action = step.get("action", "comment")
        track = json.dumps(str(step.get("track", "")))
        comment = json.dumps(str(step.get("comment", "")))

        if action == "setFader":
            value_db = step.get("value_db")
            direction = step.get("direction", "adjust")
            if value_db is not None:
                step_lines.append(
                    f"  // Step {idx + 1}: {step.get('comment', '')}\n"
                    f"  await sf.app.proTools.setTrackVolume({{ trackName: {track}, volumeDb: {float(value_db)} }});"
                )
            elif direction in ("up", "increase"):
                step_lines.append(
                    f"  // Step {idx + 1}: {step.get('comment', '')}\n"
                    f"  await sf.app.proTools.nudgeTrackVolumeUp({{ trackName: {track} }});"
                )
            elif direction in ("down", "decrease"):
                step_lines.append(
                    f"  // Step {idx + 1}: {step.get('comment', '')}\n"
                    f"  await sf.app.proTools.nudgeTrackVolumeDown({{ trackName: {track} }});"
                )
            else:
                step_lines.append(f"  // Step {idx + 1} (comment — no numeric value): {step.get('comment', '')}")
        elif action == "setPan":
            value = step.get("value", 0)
            step_lines.append(
                f"  // Step {idx + 1}: {step.get('comment', '')}\n"
                f"  await sf.app.proTools.setTrackPan({{ trackName: {track}, panValue: {float(value)} }});"
            )
        elif action == "mute":
            muted = str(step.get("muted", True)).lower()
            step_lines.append(
                f"  // Step {idx + 1}: {step.get('comment', '')}\n"
                f"  await sf.app.proTools.setTrackMute({{ trackName: {track}, muted: {muted} }});"
            )
        elif action == "comment":
            step_lines.append(f"  // {step.get('comment', 'no-op')}")
        else:
            step_lines.append(
                f"  console.warn('Unrecognised action: {action} on track ' + {track} + ' — ' + {comment});"
            )

    steps_body = "\n".join(step_lines) or "  // No executable steps"
    session_json = json.dumps(session_path or "")

    return textwrap.dedent(
        f"""\
        // AI Audio Studio — generated SoundFlow revision script
        // Session: {session_path or "(unknown)"}

        async function main() {{
          const sessionPath = {session_json};
          console.log('AI Audio Studio revision script starting, session: ' + sessionPath);

        {steps_body}

          console.log(JSON.stringify({{ ok: true, sessionPath, stepsCount: {len(steps)} }}));
        }}

        main().catch(err => {{
          console.error('AI Audio Studio revision script failed: ' + err);
          throw err;
        }});
        """
    )


def _osascript_fallback(steps: list[dict], session_path: str | None) -> str:
    lines = [
        'tell application "Pro Tools" to activate',
        "delay 0.5",
    ]
    for step in steps:
        msg = step.get("comment") or f"{step.get('action')} {step.get('track')}"
        safe = str(msg).replace('"', "'")
        lines.append(f'display notification "{safe}" with title "AI Audio Studio"')
        lines.append("delay 0.2")
    if session_path:
        safe_session = str(session_path).replace('"', "'")
        lines.append(f'display notification "Session: {safe_session}" with title "AI Audio Studio"')
    return "\n".join(lines)


async def _run_command_with_cancel(
    command: list[str],
    *,
    cancel_marker: Path | None,
    timeout_seconds: float,
) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
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
            raise RuntimeError("Execution cancelled by operator during SoundFlow dispatch")
        if loop.time() >= deadline:
            process.kill()
            await process.wait()
            raise RuntimeError(f"SoundFlow execution timed out after {timeout_seconds:.1f}s")
        await asyncio.sleep(0.25)
    stdout, stderr = await process.communicate()
    return (
        process.returncode or 0,
        stdout.decode("utf-8", errors="ignore"),
        stderr.decode("utf-8", errors="ignore"),
    )


class SoundFlowAdapter:
    def capability(self) -> str:
        return "execute-soundflow"

    def validate_environment(self, payload: dict) -> None:
        script_path = Path(payload["script_path"])
        session_path = Path(payload["session_path"])
        if not session_path.exists():
            raise FileNotFoundError(f"Session path not found: {session_path}")
        if not script_path.exists():
            raise FileNotFoundError(f"SoundFlow script not found: {script_path}")
        if not payload.get("dry_run"):
            protools_app_path = payload.get("protools_app_path")
            soundflow_cli_path = payload.get("soundflow_cli_path")
            if not protools_app_path or not Path(protools_app_path).exists():
                raise FileNotFoundError("PROTOOLS_APP_PATH is required for live SoundFlow execution")
            if not soundflow_cli_path or not Path(soundflow_cli_path).exists():
                raise FileNotFoundError("SOUNDFLOW_CLI_PATH is required for live SoundFlow execution")

    def render(self, payload: dict) -> RenderedArtifact:
        script_path = Path(payload["script_path"])
        raw = script_path.read_text()
        try:
            manifest = json.loads(raw)
        except json.JSONDecodeError:
            return RenderedArtifact(path=str(script_path), kind="soundflow-script", payload={**payload, "steps": []})
        steps = manifest.get("steps", [])
        session_path = manifest.get("metadata", {}).get("session_path") or payload.get("session_path")
        js_source = _steps_to_js(steps, session_path)
        js_path = script_path.with_suffix(".sf.js")
        js_path.write_text(js_source)
        return RenderedArtifact(path=str(js_path), kind="soundflow-script", payload={**payload, "steps": steps})

    async def health_check(self, payload: dict) -> HealthCheckResult:
        protools_app_path = str(payload.get("protools_app_path") or "").strip()
        soundflow_cli_path = str(payload.get("soundflow_cli_path") or "").strip()
        if not protools_app_path or not Path(protools_app_path).exists():
            return HealthCheckResult(connected=False, detail="Pro Tools app path is not configured.")
        if not soundflow_cli_path or not Path(soundflow_cli_path).exists():
            return HealthCheckResult(connected=False, detail="SoundFlow CLI path is not configured.")
        app_name = Path(protools_app_path).stem
        result = await run_subprocess(
            [
                "osascript",
                "-e",
                f'tell application "System Events" to return exists process "{app_name}"',
            ],
            timeout_seconds=float(payload.get("timeout_seconds", 10.0)),
        )
        connected = result.returncode == 0 and result.stdout.strip().lower() == "true"
        detail = "Pro Tools process detected." if connected else "Pro Tools process not detected."
        return HealthCheckResult(connected=connected, detail=detail)

    async def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        cancel_marker = Path(payload["cancel_marker_path"]) if payload.get("cancel_marker_path") else None
        workspace = prepare_execution_workspace(Path(payload["session_path"]), Path(rendered.path), "soundflow", payload)
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="soundflow-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="soundflow-working-session"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="soundflow-working-script"),
        ]
        log_path = workspace["run_dir"] / "soundflow-execution.log"

        if payload.get("dry_run"):
            log_path.write_text(
                f"Dry-run SoundFlow execution completed.\nsteps: {len(rendered.payload.get('steps', []))}\n",
                encoding="utf-8",
            )
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run SoundFlow execution completed",
                payload={**workspace["manifest"], "dry_run": True},
                artifacts=artifacts,
            )

        dispatch_method: str
        log_lines: list[str] = []
        timeout_seconds = float(payload.get("timeout_seconds", 30.0))
        soundflow_cli = str(payload.get("soundflow_cli_path") or "")
        js_path = Path(workspace["script_copy"])

        if cancel_marker and cancel_marker.exists():
            raise RuntimeError("Execution cancelled by operator before SoundFlow dispatch")

        if soundflow_cli and Path(soundflow_cli).exists():
            dispatch_method = "soundflow-cli"
            command = [soundflow_cli, "--run-script", str(js_path)]
            returncode, stdout, stderr = await _run_command_with_cancel(
                command,
                cancel_marker=cancel_marker,
                timeout_seconds=timeout_seconds,
            )
            log_lines = [
                f"method: {dispatch_method}",
                f"command: {' '.join(command)}",
                f"returncode: {returncode}",
                f"stdout:\n{stdout}",
                f"stderr:\n{stderr}",
            ]
            if returncode != 0:
                raise RuntimeError(f"SoundFlow CLI failed (exit {returncode}): {stderr[:300]}")
            parsed_payload = {"stdout": stdout.strip()}
            try:
                parsed_payload = json.loads(stdout)
            except json.JSONDecodeError:
                pass
        else:
            dispatch_method = "osascript-fallback"
            steps = rendered.payload.get("steps", [])
            ascript = _osascript_fallback(steps, payload.get("session_path"))
            ascript_path = workspace["run_dir"] / "soundflow-fallback.applescript"
            ascript_path.write_text(ascript, encoding="utf-8")
            command = ["osascript", str(ascript_path)]
            returncode, stdout, stderr = await _run_command_with_cancel(
                command,
                cancel_marker=cancel_marker,
                timeout_seconds=timeout_seconds,
            )
            log_lines = [
                f"method: {dispatch_method}",
                f"command: {' '.join(command)}",
                f"returncode: {returncode}",
                f"stdout:\n{stdout}",
                f"stderr:\n{stderr}",
                f"\nNote: SoundFlow CLI not found at '{soundflow_cli}'. Install SoundFlow for full Pro Tools automation.",
            ]
            artifacts.append(ArtifactRef(path=str(ascript_path), kind="applescript", label="soundflow-applescript-fallback"))
            if returncode != 0:
                raise RuntimeError(f"osascript fallback failed (exit {returncode}): {stderr[:300]}")
            parsed_payload = {"stdout": stdout.strip()}

        log_path.write_text("\n".join(log_lines), encoding="utf-8")
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-execution-log"))

        return ExecutionResult(
            status="complete",
            message=f"SoundFlow execution dispatched via {dispatch_method}",
            payload={
                **workspace["manifest"],
                "dry_run": False,
                "dispatch_method": dispatch_method,
                "steps_count": len(rendered.payload.get("steps", [])),
                "adapter_output": parsed_payload,
            },
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
