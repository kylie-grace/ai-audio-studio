"""Worker runtime and task routing."""

from __future__ import annotations

import asyncio
import socket
from contextlib import suppress
from pathlib import Path
import tempfile

import httpx

from config import Settings
from paths import decode_jsonb
from tasks.delivery_packager import execute_package_delivery
from tasks.daw_exec import execute_reascript, execute_soundflow, execute_wavelab
from tasks.revision_plan import generate_revision_artifacts
from tasks.session_prep import execute_prepare_session
from workstation import detect_workstation_profile

TASK_TYPES = ["prepare-session", "parse-revisions", "package-delivery", "execute-soundflow", "execute-reascript", "execute-wavelab"]


def headers(settings: Settings) -> dict[str, str]:
    hdrs = {"X-Actor": f"studio-worker:{settings.worker_slug}"}
    if settings.worker_api_token:
        hdrs["X-Worker-Token"] = settings.worker_api_token
    return hdrs


class StudioWorkerRunner:
    def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None:
        self.client = client
        self.settings = settings
        self._heartbeat_count = 0
        self._drain_requested = False
        self._current_task_id: str | None = None
        self._last_status = "starting"

    def cancel_marker_path(self, task_id: str) -> Path:
        root = Path(tempfile.gettempdir()) / "ai-audio-studio"
        root.mkdir(parents=True, exist_ok=True)
        return root / f"cancel-{task_id}.marker"

    def workstation_snapshot(self) -> dict:
        detected = detect_workstation_profile(self.settings)
        return {
            "configured": self.settings.workstation_profile,
            "detected": detected,
        }

    def runtime_state(self) -> dict:
        return {
            "worker_slug": self.settings.worker_slug,
            "drain_requested": self._drain_requested,
            "current_task_id": self._current_task_id,
            "last_status": self._last_status,
        }

    def request_drain(self) -> dict:
        self._drain_requested = True
        return self.runtime_state()

    def clear_drain(self) -> dict:
        self._drain_requested = False
        return self.runtime_state()

    async def sync_plugin_inventory(self) -> None:
        snapshot = self.workstation_snapshot()
        detected = snapshot.get("detected") or {}
        plugin_inventory = detected.get("plugins") or {}
        await self.client.post(
            f"{self.settings.project_state_url}/workers/{self.settings.worker_slug}/plugins/sync",
            headers=headers(self.settings),
            json={
                "plugins": plugin_inventory.get("plugins", []),
                "summary": plugin_inventory.get("summary", {}),
            },
        )

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
                "workstation_profile": self.workstation_snapshot(),
            },
        )
        await self.sync_plugin_inventory()

    async def heartbeat(self, status: str = "idle") -> None:
        self._heartbeat_count += 1
        self._last_status = status
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
                "workstation_status": self.workstation_snapshot(),
            },
        )
        if self._heartbeat_count % 12 == 0:
            await self.sync_plugin_inventory()

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
        if task_type == "execute-wavelab":
            return execute_wavelab(payload, self.settings)
        raise ValueError(f"Unsupported task type: {task_type}")

    async def fetch_task(self, task_id: str) -> dict | None:
        response = await self.client.get(f"{self.settings.project_state_url}/workers/tasks/{task_id}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def execute_task_with_control(self, task: dict) -> tuple[dict | None, bool]:
        payload = decode_jsonb(task["payload"]) or {}
        cancel_marker = self.cancel_marker_path(task["id"])
        if cancel_marker.exists():
            cancel_marker.unlink()
        controlled_task = {**task, "payload": {**payload, "task_id": task["id"], "cancel_marker_path": str(cancel_marker)}}
        future = asyncio.create_task(asyncio.to_thread(self.execute_task, controlled_task))
        cancelled = False
        try:
            while not future.done():
                current = await self.fetch_task(task["id"])
                if current and current.get("status") == "cancelled":
                    cancel_marker.write_text("cancelled\n")
                    cancelled = True
                    await self.heartbeat("cancelling")
                await asyncio.sleep(5)
            return await future, cancelled
        finally:
            with suppress(FileNotFoundError):
                cancel_marker.unlink()

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
                if self._drain_requested:
                    await self.heartbeat("draining")
                    await asyncio.sleep(self.settings.poll_interval_seconds)
                    continue
                await self.heartbeat("idle")
                task = await self.claim_next_task()
                if task:
                    self._current_task_id = task["id"]
                    await self.heartbeat("busy")
                    try:
                        result, cancelled = await self.execute_task_with_control(task)
                    except Exception as exc:
                        current = await self.fetch_task(task["id"])
                        if current and current.get("status") == "cancelled":
                            continue
                        await self.fail_task(task["id"], str(exc))
                    else:
                        current = await self.fetch_task(task["id"])
                        if cancelled or (current and current.get("status") == "cancelled"):
                            continue
                        await self.complete_task(task["id"], result)
                    finally:
                        self._current_task_id = None
            except Exception:
                with suppress(Exception):
                    await self.heartbeat("error")
            await asyncio.sleep(self.settings.poll_interval_seconds)
