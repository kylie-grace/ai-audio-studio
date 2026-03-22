"""Shared adapter data structures for studio worker execution."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(slots=True)
class ArtifactRef:
    path: str
    kind: str
    label: str | None = None


@dataclass(slots=True)
class RenderedArtifact:
    path: str
    kind: str
    payload: dict = field(default_factory=dict)


@dataclass(slots=True)
class ExecutionResult:
    status: str
    message: str | None = None
    payload: dict = field(default_factory=dict)
    artifacts: list[ArtifactRef] = field(default_factory=list)


@dataclass(slots=True)
class HealthCheckResult:
    connected: bool
    detail: str | None = None


class ExecutionAdapter(Protocol):
    def capability(self) -> str: ...

    def validate_environment(self, payload: dict) -> None: ...

    def render(self, payload: dict) -> RenderedArtifact | None: ...

    async def health_check(self, payload: dict) -> HealthCheckResult: ...

    async def execute(self, payload: dict) -> ExecutionResult: ...

    def collect_artifacts(self, payload: dict, result: ExecutionResult) -> list[ArtifactRef]: ...
