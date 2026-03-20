"""Read the n8n bootstrap status artifact for operator-facing APIs."""

from __future__ import annotations

import json
import os
from pathlib import Path


def bootstrap_status() -> dict:
    status_path = Path(os.environ.get("N8N_BOOTSTRAP_STATUS_PATH", "/data/bootstrap/status.json"))
    if not status_path.exists():
        return {
            "status": "pending",
            "workflow_count": 0,
            "detail": "No n8n bootstrap status file exists yet.",
        }

    data = json.loads(status_path.read_text())
    data.setdefault("status", "unknown")
    data.setdefault("workflow_count", 0)
    return data
