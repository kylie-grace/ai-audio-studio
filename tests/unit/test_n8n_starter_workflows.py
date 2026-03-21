"""Validate shipped n8n starter workflow files are present and parseable."""

from __future__ import annotations

import json
from pathlib import Path


WORKFLOW_DIR = Path(__file__).resolve().parents[2] / "infra" / "n8n" / "workflows"


def test_expected_workflow_pack_exists():
    files = sorted(path.name for path in WORKFLOW_DIR.glob("*.json"))
    assert files == [
        "alerts-runtime-digest.json",
        "content-source-new-brief.json",
        "control-room-status-digest.json",
        "inbox-source-new-message.json",
        "lead-source-new-lead.json",
        "qc-source-qc-pass.json",
        "revision-source-notes-received.json",
        "session-source-import-stems.json",
    ]


def test_workflow_files_have_minimal_n8n_shape():
    for path in WORKFLOW_DIR.glob("*.json"):
        data = json.loads(path.read_text())
        assert data["name"]
        assert data["nodes"]
        assert data["connections"] is not None
        webhook_nodes = [node for node in data["nodes"] if node["type"] == "n8n-nodes-base.webhook"]
        assert len(webhook_nodes) == 1
        webhook_path = webhook_nodes[0]["parameters"]["path"]
        assert webhook_path.startswith("studio/")
