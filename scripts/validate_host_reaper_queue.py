#!/usr/bin/env python3
"""Validate queued ReaScript execution through project-state and a host-native worker."""

from __future__ import annotations

import argparse
import json
import tempfile
import time
import urllib.request
from pathlib import Path


def request_json(url: str, *, method: str = "GET", payload: dict | None = None, headers: dict[str, str] | None = None) -> dict | list:
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-state-url", default="http://127.0.0.1:8080")
    parser.add_argument("--worker-slug", default="host-reaper-worker")
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()

    base = Path(tempfile.mkdtemp(prefix="ai-audio-studio-reaper-queue-"))
    session = base / "queue-demo.rpp"
    script = base / "queue-task.lua"
    marker = base / "queue-marker.json"

    session.write_text('<REAPER_PROJECT 0.1 "6.0/x64" 0 0 0\n  TEMPO 120 4 4\n>\n')
    script.write_text(
        f"""local marker_path = [[{marker}]]
local handle = io.open(marker_path, "w")
if handle then
  handle:write('{{"status":"ok","source":"validate-host-reaper-queue"}}')
  handle:close()
end
reaper.ShowConsoleMsg("validate_host_reaper_queue executed\\n")
"""
    )

    task = request_json(
        f"{args.project_state_url}/workers/tasks",
        method="POST",
        payload={
            "task_type": "execute-reascript",
            "worker_slug": args.worker_slug,
            "required_capability": "execute-reascript",
            "priority": "high",
            "payload": {
                "session_path": str(session),
                "script_path": str(script),
                "completion_marker_path": str(marker),
                "marker_timeout_seconds": 10,
            },
        },
        headers={"Content-Type": "application/json", "X-Actor": "owner"},
    )
    task_id = task["id"]

    deadline = time.time() + args.timeout
    while time.time() < deadline:
        time.sleep(0.5)
        tasks = request_json(
            f"{args.project_state_url}/workers/tasks/list",
            headers={"X-Actor": "owner"},
        )
        match = next((item for item in tasks if item["id"] == task_id), None)
        if match and match["status"] in {"complete", "failed"}:
            print(
                json.dumps(
                    {
                        "task": match,
                        "marker_exists": marker.exists(),
                        "marker_path": str(marker),
                        "marker": json.loads(marker.read_text()) if marker.exists() else None,
                    },
                    indent=2,
                )
            )
            return 0 if match["status"] == "complete" and marker.exists() else 1

    print(
        json.dumps(
            {
                "status": "timeout",
                "task_id": task_id,
                "marker_exists": marker.exists(),
                "marker_path": str(marker),
            },
            indent=2,
        )
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
