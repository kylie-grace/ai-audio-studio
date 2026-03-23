from pathlib import Path

import pytest


class RevisionParserPool:
    def __init__(self):
        self.project = {"id": "project-1", "slug": "smoke-project", "client_name": "Smoke Artist"}
        self.job = None
        self.revision = None

    async def fetchrow(self, query, *args):
        if "SELECT * FROM workspace_settings" in query:
            return {"module_settings": {"revision_parser": {"enabled": True}}}
        if "SELECT * FROM projects WHERE id=$1" in query:
            return self.project
        if "SELECT * FROM session_manifests WHERE project_id=$1" in query:
            return {"stems": [{"name": "Lead Vox"}, {"name": "Kick"}]}
        if "INSERT INTO jobs" in query:
            self.job = {"id": "job-1"}
            return self.job
        if "INSERT INTO revisions" in query:
            self.revision = {"id": "revision-1"}
            return self.revision
        raise AssertionError(query)


@pytest.mark.anyio
async def test_revision_parser_flow(async_client_factory, revision_parser_module, tmp_path, monkeypatch):
    async def fake_parse_changes(raw_notes, session_tracks=None):
        return [{"element": "Lead Vox", "parameter": "level", "direction": "down", "value_db": -2, "confidence": 0.9, "human_readable": raw_notes}]

    monkeypatch.setenv("SHARED_PROJECTS_PATH", str(tmp_path / "projects"))
    monkeypatch.setattr(revision_parser_module, "parse_changes", fake_parse_changes)
    revision_parser_module._pool = RevisionParserPool()

    client = await async_client_factory(revision_parser_module.app)
    response = await client.post(
        "/parse-revisions",
        json={
            "project_id": "project-1",
            "raw_notes": "Lead Vox down 2 dB.",
            "daw": "reaper",
            "session_path": str(tmp_path / "session.rpp"),
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["revision_id"] == "revision-1"
    assert payload["changes"][0]["parameter"] == "level"
    assert (tmp_path / "projects" / "smoke-project" / "session" / "reaper_revision_script.lua").exists()
