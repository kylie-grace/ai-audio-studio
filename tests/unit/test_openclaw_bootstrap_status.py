"""Bootstrap status helper should expose import progress cleanly."""

from __future__ import annotations

import importlib.util
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/openclaw-orchestrator")

SPEC = importlib.util.spec_from_file_location("openclaw_bootstrap_status", os.path.join(SERVICE_ROOT, "src/bootstrap_status.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

bootstrap_status = MODULE.bootstrap_status


def test_bootstrap_status_defaults_to_pending_when_file_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("N8N_BOOTSTRAP_STATUS_PATH", str(tmp_path / "missing.json"))
    status = bootstrap_status()
    assert status["status"] == "pending"
    assert status["workflow_count"] == 0


def test_bootstrap_status_reads_written_file(monkeypatch, tmp_path):
    path = tmp_path / "status.json"
    path.write_text(json.dumps({"status": "imported", "workflow_count": 6, "detail": "ok"}))
    monkeypatch.setenv("N8N_BOOTSTRAP_STATUS_PATH", str(path))
    status = bootstrap_status()
    assert status["status"] == "imported"
    assert status["workflow_count"] == 6
