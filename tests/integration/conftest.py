import importlib.util
import sys
from pathlib import Path

import asyncpg
import fastapi
import pydantic
import pytest
from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, relative_path: str):
    path = ROOT / relative_path
    module_dir = str(path.parent)
    if module_dir not in sys.path:
        sys.path.insert(0, module_dir)
    sys.modules["asyncpg"] = asyncpg
    sys.modules["fastapi"] = fastapi
    sys.modules["pydantic"] = pydantic
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def session_prep_module():
    return load_module("session_prep_integration", "workers/session-prep/main.py")


@pytest.fixture
def revision_parser_module():
    return load_module("revision_parser_integration", "workers/revision-parser/main.py")


@pytest.fixture
def delivery_packager_module():
    return load_module("delivery_packager_integration", "workers/delivery-packager/main.py")


@pytest.fixture
async def async_client_factory():
    clients: list[AsyncClient] = []

    async def factory(app):
        client = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
        clients.append(client)
        return client

    yield factory

    for client in clients:
        await client.aclose()
