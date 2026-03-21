"""Pure tests for worker config hydration from workspace settings."""

from __future__ import annotations

import importlib.util
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")

SPEC = importlib.util.spec_from_file_location("studio_worker_config", os.path.join(SERVICE_ROOT, "config.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

load_settings = MODULE.load_settings


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_worker_settings_use_workspace_defaults(monkeypatch):
    monkeypatch.setenv("PROJECT_STATE_URL", "http://project-state:8080")
    monkeypatch.setenv("CRM_API_URL", "http://crm-api:8090")
    monkeypatch.delenv("WORKER_SLUG", raising=False)
    monkeypatch.delenv("WORKER_DISPLAY_NAME", raising=False)
    monkeypatch.delenv("WORKER_API_BASE_URL", raising=False)
    monkeypatch.delenv("SHARED_PROJECTS_PATH", raising=False)
    monkeypatch.delenv("DELIVERY_PATH", raising=False)
    monkeypatch.setattr(
        MODULE,
        "urlopen",
        lambda url, timeout=2: FakeResponse(
            {
                "studio_name": "AI Audio Studio",
                "shared_paths": {
                    "projects": "/Volumes/StudioShare/projects",
                    "deliveries": "/Volumes/StudioShare/deliveries",
                },
                "worker": {
                    "worker_slug": "studio-mac",
                    "worker_api_base_url": "http://studio-mac.local:8190",
                    "display_name": "Studio Mac",
                    "default_daw": "protools",
                    "supported_daws": ["protools", "reaper"],
                    "adapter_capabilities": ["execute-soundflow", "execute-reascript"],
                },
            }
        ),
    )

    settings = load_settings()

    assert settings.worker_slug == "studio-mac"
    assert settings.worker_display_name == "Studio Mac"
    assert settings.worker_api_base_url == "http://studio-mac.local:8190"
    assert settings.shared_projects_path == "/Volumes/StudioShare/projects"
    assert settings.delivery_path == "/Volumes/StudioShare/deliveries"
    assert settings.workstation_profile["default_daw"] == "protools"
    assert settings.workstation_profile["supported_daws"] == ["protools", "reaper"]


def test_env_overrides_workspace_defaults(monkeypatch):
    monkeypatch.setenv("PROJECT_STATE_URL", "http://project-state:8080")
    monkeypatch.setenv("WORKSPACE_SETTINGS_URL", "http://crm-api:8090/workspace-settings")
    monkeypatch.setenv("WORKER_SLUG", "explicit-worker")
    monkeypatch.setenv("WORKER_DISPLAY_NAME", "Explicit Worker")
    monkeypatch.setenv("WORKER_API_BASE_URL", "http://127.0.0.1:8190")
    monkeypatch.setenv("SHARED_PROJECTS_PATH", "/tmp/projects")
    monkeypatch.setenv("DELIVERY_PATH", "/tmp/deliveries")
    monkeypatch.setattr(
        MODULE,
        "urlopen",
        lambda url, timeout=2: FakeResponse(
            {
                "studio_name": "AI Audio Studio",
                "shared_paths": {
                    "projects": "/Volumes/StudioShare/projects",
                    "deliveries": "/Volumes/StudioShare/deliveries",
                },
                "worker": {
                    "worker_slug": "studio-mac",
                    "worker_api_base_url": "http://studio-mac.local:8190",
                    "display_name": "Studio Mac",
                    "default_daw": "protools",
                    "supported_daws": ["protools", "reaper"],
                    "adapter_capabilities": ["execute-soundflow", "execute-reascript"],
                },
            }
        ),
    )

    settings = load_settings()

    assert settings.worker_slug == "explicit-worker"
    assert settings.worker_display_name == "Explicit Worker"
    assert settings.worker_api_base_url == "http://127.0.0.1:8190"
    assert settings.shared_projects_path == "/tmp/projects"
    assert settings.delivery_path == "/tmp/deliveries"
    assert settings.workstation_profile["default_daw"] == "protools"
