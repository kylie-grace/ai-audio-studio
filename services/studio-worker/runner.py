"""Worker runtime and task routing."""

from __future__ import annotations

import asyncio
import socket
from contextlib import suppress

import httpx

from config import Settings
from paths import decode_jsonb
from tasks.delivery_packager import execute_package_delivery
from tasks.daw_exec import execute_reascript, execute_soundflow
from tasks.revision_plan import generate_revision_artifacts
from tasks.session_prep import execute_prepare_session

TASK_TYPES = ["prepare-session", "parse-revisions", "package-delivery", "execute-soundflow", "execute-reascript"]


def headers(settings: Settings) -> dict[str, str]:
    return {"X-Actor": f"studio-worker:{settings.worker_slug}"}


class StudioWorkerRunner:
    def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None:
        self.client = client
        self.settings = settings

    async def register_worker(self) -> None:
        await self.client.post(
            f"{self.settings.project_state_url}/workers/register",
            headers=headers(self.settings),
            json={
                "slug": self.settings.worker_slug,
                "display_name": self.settings.worker_display_name,
                "platform": self.settings.worker_platform,
                "host": socket.gethostname(),
                "api_base_url": self.settings.worker_api_base_url,
                "capabilities": self.settings.capabilities,
                "watched_paths": {
                    "shared_projects": self.settings.shared_projects_path,
                    "delivery_root": self.settings.delivery_path,
                },
            },
        )

    async def heartbeat(self, status: str = "idle") -> None:
        await self.client.post(
            f"{self.settings.project_state_url}/workers/{self.settings.worker_slug}/heartbeat",
            headers=headers(self.settings),
            json={
                "status": status,
                "host": socket.gethostname(),
                "api_base_url": self.settings.worker_api_base_url,
                "capabilities": self.settings.capabilities,
                "watched_paths": {
                    "shared_projects": self.settings.shared_projects_path,
                    "delivery_root": self.settings.delivery_path,
                },
            },
        )

    def execute_task(self, task: dict) -> dict:
        payload = decode_jsonb(task["payload"]) or {}
        task_type = task["task_type"]
        if task_type == "prepare-session":
            return execute_prepare_session(payload, self.settings)
        if task_type == "parse-revisions":
            return generate_revision_artifacts(payload, self.settings)
        if task_type == "package-delivery":
            return execute_package_delivery(payload, self.settings)
        if task_type == "execute-soundflow":
            return execute_soundflow(payload, self.settings)
        if task_type == "execute-reascript":
            return execute_reascript(payload, self.settings)
        raise ValueError(f"Unsupported task type: {task_type}")

    async def claim_next_task(self) -> dict | None:
        response = await self.client.post(
            f"{self.settings.project_state_url}/workers/tasks/claim",
            headers=headers(self.settings),
            json={
                "worker_slug": self.settings.worker_slug,
                "task_types": TASK_TYPES,
                "capabilities": self.settings.capabilities,
                "lease_seconds": 300,
            },
        )
        return response.json().get("task")

    async def complete_task(self, task_id: str, result: dict) -> None:
        await self.client.post(
            f"{self.settings.project_state_url}/workers/tasks/{task_id}/complete",
            headers=headers(self.settings),
            json={"worker_slug": self.settings.worker_slug, "result": result},
        )

    async def fail_task(self, task_id: str, error_message: str) -> None:
        await self.client.post(
            f"{self.settings.project_state_url}/workers/tasks/{task_id}/fail",
            headers=headers(self.settings),
            json={"worker_slug": self.settings.worker_slug, "error_message": error_message, "result": {}},
        )

    async def run_forever(self) -> None:
        await self.register_worker()
        while True:
            try:
                await self.heartbeat("idle")
                task = await self.claim_next_task()
                if task:
                    await self.heartbeat("busy")
                    try:
                        result = self.execute_task(task)
                    except Exception as exc:
                        await self.fail_task(task["id"], str(exc))
                    else:
                        await self.complete_task(task["id"], result)
            except Exception:
                with suppress(Exception):
                    await self.heartbeat("error")
            await asyncio.sleep(self.settings.poll_interval_seconds)
