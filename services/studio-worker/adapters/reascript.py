"""ReaScript adapter scaffold."""

from __future__ import annotations

from pathlib import Path

from adapter_contracts import ArtifactRef, ExecutionResult, RenderedArtifact


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

    def render(self, payload: dict) -> RenderedArtifact | None:
        script_path = Path(payload["script_path"])
        return RenderedArtifact(path=str(script_path), kind="reascript", payload=payload)

    def execute(self, payload: dict) -> ExecutionResult:
        self.validate_environment(payload)
        rendered = self.render(payload)
        raise NotImplementedError(
            f"ReaScript execution is scaffolded but not enabled yet for {rendered.path}"
        )

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]:
        return list(result.artifacts)
