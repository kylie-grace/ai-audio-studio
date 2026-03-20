"""Starter playbook coverage for turnkey orchestration."""

from __future__ import annotations

import importlib.util
import os

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/openclaw-orchestrator")

SPEC = importlib.util.spec_from_file_location("openclaw_playbooks", os.path.join(SERVICE_ROOT, "src/playbooks.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

DEFAULT_PLAYBOOKS = MODULE.DEFAULT_PLAYBOOKS
default_playbooks = MODULE.default_playbooks


def test_default_playbooks_cover_core_operator_flows():
    playbooks = default_playbooks()
    slugs = {playbook["slug"] for playbook in playbooks}

    assert {
        "lead-intake-starter",
        "inbox-triage-starter",
        "content-brief-starter",
        "session-prep-starter",
        "revision-notes-starter",
        "qc-pass-delivery-starter",
    } == slugs


def test_each_playbook_points_to_an_n8n_starter_workflow():
    for playbook in DEFAULT_PLAYBOOKS:
        assert playbook["n8n_workflow_slug"]
        assert playbook["webhook_path"].startswith("/webhook/studio/")
        assert playbook["trigger_module"]
        assert playbook["target_module"]
