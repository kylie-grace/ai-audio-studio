from pathlib import Path

import pytest


class SessionPrepPool:
    def __init__(self):
        self.project = None
        self.job = None
        self.manifest = None

    async def fetchrow(self, query, *args):
        if "SELECT * FROM workspace_settings" in query:
            return {"module_settings": {"session_prep": {"enabled": True}}}
        if "SELECT * FROM projects WHERE id=$1" in query:
            return self.project
        if "INSERT INTO projects" in query:
            self.project = {"id": "project-1", "slug": args[0], "client_name": args[1]}
            return self.project
        if "INSERT INTO jobs" in query:
            self.job = {"id": "job-1"}
            return self.job
        if "INSERT INTO session_manifests" in query:
            self.manifest = {"id": "manifest-1"}
            return self.manifest
        raise AssertionError(query)


@pytest.mark.anyio
async def test_session_prep_flow(async_client_factory, session_prep_module, tmp_path, monkeypatch):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "kick.wav").write_text("audio")
    monkeypatch.setenv("SHARED_PROJECTS_PATH", str(tmp_path / "projects"))
    session_prep_module._pool = SessionPrepPool()

    client = await async_client_factory(session_prep_module.app)
    response = await client.post(
        "/prepare-session",
        json={"source_dir": str(source_dir), "client_name": "Smoke Artist"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "awaiting-approval"
    assert Path(payload["prep_report_path"]).exists()
