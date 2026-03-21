"""SoundFlow adapter scaffold."""

from __future__ import annotations

from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, RenderedArtifact
from adapters.base import prepare_execution_workspace


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

    def render(self, payload: dict) -> RenderedArtifact | None:
        script_path = Path(payload["script_path"])
        return RenderedArtifact(path=str(script_path), kind="soundflow-script", payload=payload)

    def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        workspace = prepare_execution_workspace(Path(payload["session_path"]), Path(rendered.path), "soundflow", payload)
        artifacts = [
            ArtifactRef(path=str(workspace["manifest_path"]), kind="execution-manifest", label="soundflow-execution-manifest"),
            ArtifactRef(path=str(workspace["session_copy"]), kind="session-copy", label="soundflow-working-session"),
            ArtifactRef(path=str(workspace["script_copy"]), kind="script-copy", label="soundflow-working-script"),
        ]
        if payload.get("dry_run"):
            log_path = workspace["run_dir"] / "soundflow-execution.log"
            log_path.write_text("Dry-run SoundFlow execution completed.\n")
            artifacts.append(ArtifactRef(path=str(log_path), kind="execution-log", label="soundflow-dry-run-log"))
            return ExecutionResult(
                status="complete",
                message="Dry-run SoundFlow execution completed",
                payload={**workspace["manifest"], "dry_run": True},
                artifacts=artifacts,
            )
        raise NotImplementedError(
            f"SoundFlow execution is scaffolded but not enabled yet for {rendered.path}"
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
