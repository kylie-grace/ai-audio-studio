"""Runtime configuration for the studio worker."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    project_state_url: str
    worker_slug: str
    worker_display_name: str
    worker_platform: str
    worker_api_base_url: str | None
    poll_interval_seconds: float
    capabilities: list[str]
    shared_projects_path: str
    delivery_path: str
    path_translation_json: str
    dry_run_daw: bool
    worker_api_token: str | None


def load_settings() -> Settings:
    return Settings(
        project_state_url=os.environ["PROJECT_STATE_URL"].rstrip("/"),
        worker_slug=os.environ.get("WORKER_SLUG", socket.gethostname().lower()),
        worker_display_name=os.environ.get("WORKER_DISPLAY_NAME", "Studio Worker"),
        worker_platform=os.environ.get("WORKER_PLATFORM", "macos"),
        worker_api_base_url=os.environ.get("WORKER_API_BASE_URL"),
        poll_interval_seconds=float(os.environ.get("POLL_INTERVAL_SECONDS", "5")),
        capabilities=[
            item.strip()
            for item in os.environ.get(
                "WORKER_CAPABILITIES",
                "session-prep,revision-parser,delivery-packager",
            ).split(",")
            if item.strip()
        ],
        shared_projects_path=os.environ.get("SHARED_PROJECTS_PATH", "/data/projects"),
        delivery_path=os.environ.get("DELIVERY_PATH", "/data/deliveries"),
        path_translation_json=os.environ.get("PATH_TRANSLATION_JSON", "{}"),
        dry_run_daw=os.environ.get("STUDIO_WORKER_DRY_RUN_DAW", "false").lower() in {"1", "true", "yes", "on"},
        worker_api_token=os.environ.get("WORKER_API_TOKEN"),
    )
