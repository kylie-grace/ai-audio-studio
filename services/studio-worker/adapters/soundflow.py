"""SoundFlow adapter — executes Pro Tools revision scripts via SoundFlow or osascript."""

from __future__ import annotations

import json
import subprocess
import textwrap
import time
from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, RenderedArtifact
from adapters.base import prepare_execution_workspace


def _steps_to_js(steps: list[dict], session_path: str | None) -> str:
    """Convert revision steps JSON to a SoundFlow-compatible JavaScript string.

    SoundFlow JS environment: actions are expressed as calls to the
    ``sf.app.proTools`` namespace.  Volume/fader changes use
    ``setTrackVolume``, pan uses ``setTrackPan``, mute toggles use
    ``setTrackMute``, and unknown steps are logged as console warnings so
    the script never hard-fails mid-run.
    """
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
                step_lines.append(
                    f"  // Step {idx + 1} (comment — no numeric value): {step.get('comment', '')}"
                )

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

    return textwrap.dedent(f"""\
        // AI Audio Studio — generated SoundFlow revision script
        // Session: {session_path or "(unknown)"}

        async function main() {{
          const sessionPath = {session_json};
          console.log('AI Audio Studio revision script starting, session: ' + sessionPath);

        {steps_body}

          console.log('AI Audio Studio revision script complete.');
        }}

        main().catch(err => {{
          console.error('AI Audio Studio revision script failed: ' + err);
          throw err;
        }});
    """)


def _osascript_fallback(steps: list[dict], session_path: str | None) -> str:
    """Build an osascript (AppleScript) snippet as a last-resort fallback.

    This only handles the simplest case: ensuring Pro Tools is frontmost and
    logging each step as a notification.  Real fader moves require SoundFlow.
    """
    lines = [
        'tell application "Pro Tools" to activate',
        'delay 0.5',
    ]
    for step in steps:
        msg = step.get("comment") or f"{step.get('action')} {step.get('track')}"
        safe = msg.replace('"', "'")
        lines.append(f'display notification "{safe}" with title "AI Audio Studio"')
        lines.append("delay 0.2")
    return "\n".join(lines)


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

    def render(self, payload: dict) -> RenderedArtifact:
        """Re-render the stored JSON manifest as executable SoundFlow JS."""
        script_path = Path(payload["script_path"])
        raw = script_path.read_text()
        try:
            manifest = json.loads(raw)
        except json.JSONDecodeError:
            # Backward-compatible path for legacy tests or plain script payloads.
            return RenderedArtifact(path=str(script_path), kind="soundflow-script", payload={**payload, "steps": []})
        steps = manifest.get("steps", [])
        session_path = manifest.get("metadata", {}).get("session_path") or payload.get("session_path")
        js_source = _steps_to_js(steps, session_path)
        js_path = script_path.with_suffix(".sf.js")
        js_path.write_text(js_source)
        return RenderedArtifact(path=str(js_path), kind="soundflow-script", payload={**payload, "steps": steps})

    def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        cancel_marker = Path(payload["cancel_marker_path"]) if payload.get("cancel_marker_path") else None
        workspace = prepare_execution_workspace(
            Path(payload["session_path"]), Path(rendered.path), "soundflow", payload
        )
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="soundflow-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="soundflow-working-session"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="soundflow-working-script"),
        ]
        log_path = workspace["run_dir"] / "soundflow-execution.log"

        if payload.get("dry_run"):
            log_path.write_text(
                f"Dry-run SoundFlow execution completed.\n"
                f"steps: {len(rendered.payload.get('steps', []))}\n"
            )
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run SoundFlow execution completed",
                payload={**workspace["manifest"], "dry_run": True},
                artifacts=artifacts,
            )

        # --- Live execution ---
        soundflow_cli = payload.get("soundflow_cli_path", "")
        js_path = Path(workspace["script_copy"])
        dispatch_method: str
        log_lines: list[str] = []

        if soundflow_cli and Path(soundflow_cli).exists():
            # SoundFlow CLI: SoundFlow --run-script <path>
            dispatch_method = "soundflow-cli"
            command = [soundflow_cli, "--run-script", str(js_path)]
            if cancel_marker and cancel_marker.exists():
                raise RuntimeError("Execution cancelled by operator before SoundFlow dispatch")
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            while process.poll() is None:
                if cancel_marker and cancel_marker.exists():
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError("Execution cancelled by operator during SoundFlow dispatch")
                time.sleep(0.25)
            stdout, stderr = process.communicate()
            log_lines = [
                f"method: {dispatch_method}",
                f"command: {' '.join(command)}",
                f"returncode: {process.returncode}",
                f"stdout:\n{stdout}",
                f"stderr:\n{stderr}",
            ]
            if process.returncode != 0:
                raise RuntimeError(
                    f"SoundFlow CLI failed (exit {process.returncode}): {stderr[:300]}"
                )
        else:
            # Fallback: osascript — bring Pro Tools forward, notify per step
            dispatch_method = "osascript-fallback"
            steps = rendered.payload.get("steps", [])
            ascript = _osascript_fallback(steps, payload.get("session_path"))
            ascript_path = workspace["run_dir"] / "soundflow-fallback.applescript"
            ascript_path.write_text(ascript)
            command = ["osascript", str(ascript_path)]
            if cancel_marker and cancel_marker.exists():
                raise RuntimeError("Execution cancelled by operator before osascript dispatch")
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            while process.poll() is None:
                if cancel_marker and cancel_marker.exists():
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RuntimeError("Execution cancelled by operator during osascript dispatch")
                time.sleep(0.25)
            stdout, stderr = process.communicate()
            log_lines = [
                f"method: {dispatch_method}",
                f"command: {' '.join(command)}",
                f"returncode: {process.returncode}",
                f"stdout:\n{stdout}",
                f"stderr:\n{stderr}",
                f"\nNote: SoundFlow CLI not found at '{soundflow_cli}'. "
                f"Install SoundFlow and set SOUNDFLOW_CLI_PATH for full Pro Tools fader automation.",
            ]
            artifacts.append(ArtifactRef(path=str(ascript_path), kind="applescript", label="soundflow-applescript-fallback"))
            if process.returncode != 0:
                raise RuntimeError(
                    f"osascript fallback failed (exit {process.returncode}): {stderr[:300]}"
                )

        log_path.write_text("\n".join(log_lines))
        artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-execution-log"))

        return ExecutionResult(
            status="complete",
            message=f"SoundFlow execution dispatched via {dispatch_method}",
            payload={
                **workspace["manifest"],
                "dry_run": False,
                "dispatch_method": dispatch_method,
                "steps_count": len(rendered.payload.get("steps", [])),
            },
            artifacts=artifacts,
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
