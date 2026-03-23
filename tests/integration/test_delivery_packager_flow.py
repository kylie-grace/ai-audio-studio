from pathlib import Path

import pytest


class DeliveryPackagerPool:
    def __init__(self):
        self.project = {"id": "project-1", "slug": "smoke-project"}
        self.job = None

    async def fetchrow(self, query, *args):
        if "SELECT * FROM workspace_settings" in query:
            return {"module_settings": {"delivery_packager": {"enabled": True}}}
        if "SELECT * FROM projects WHERE id=$1" in query:
            return self.project
        if "SELECT * FROM qc_reports WHERE project_id=$1" in query:
            return {"overall_pass": True}
        if "INSERT INTO jobs" in query:
            self.job = {"id": "job-1"}
            return self.job
        raise AssertionError(query)

    async def execute(self, query, *args):
        return None


@pytest.mark.anyio
async def test_delivery_packager_flow(async_client_factory, delivery_packager_module, tmp_path, monkeypatch):
    shared_root = tmp_path / "projects"
    asset = shared_root / "smoke-project" / "mix.wav"
    asset.parent.mkdir(parents=True)
    asset.write_text("audio")
    monkeypatch.setenv("SHARED_PROJECTS_PATH", str(shared_root))
    monkeypatch.setenv("DELIVERY_PATH", str(tmp_path / "deliveries"))
    delivery_packager_module._pool = DeliveryPackagerPool()

    client = await async_client_factory(delivery_packager_module.app)
    response = await client.post(
        "/package-delivery",
        json={
            "project_id": "project-1",
            "file_paths": [str(asset)],
            "package_name": "client-delivery",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert Path(payload["manifest_path"]).exists()
    assert Path(payload["delivery_path"]).exists()
