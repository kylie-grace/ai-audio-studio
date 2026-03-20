"""Pure tests for services that consume persisted workspace settings."""

from __future__ import annotations

import importlib.util
import os
import sys
import types

ROOT = os.path.join(os.path.dirname(__file__), "../..")


class FakeFastAPI:
    def __init__(self, *args, **kwargs):
        pass

    def get(self, *args, **kwargs):
        def decorator(func):
            return func

        return decorator

    def post(self, *args, **kwargs):
        def decorator(func):
            return func

        return decorator


def load_module(name: str, relative_path: str, extra_sys_path: str | None = None):
    fake_asyncpg = types.SimpleNamespace(Pool=object, create_pool=lambda *args, **kwargs: None)
    fake_fastapi = types.SimpleNamespace(FastAPI=FakeFastAPI, HTTPException=Exception)
    fake_pydantic = types.SimpleNamespace(BaseModel=object, Field=lambda *args, **kwargs: None)
    sys.modules.setdefault("asyncpg", fake_asyncpg)
    sys.modules.setdefault("fastapi", fake_fastapi)
    sys.modules.setdefault("pydantic", fake_pydantic)
    if extra_sys_path:
        sys.path.insert(0, extra_sys_path)
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relative_path))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if extra_sys_path:
        sys.path.pop(0)
    return module


lead_main = load_module("lead_intake_main", "workers/lead-intake/main.py", os.path.join(ROOT, "workers/lead-intake"))
content_main = load_module("content_pipeline_main", "services/content-pipeline/src/main.py")


def test_lead_reply_uses_workspace_studio_name_and_style():
    reply = lead_main.draft_reply_with_context(
        {
            "artist_name": "Night Bloom",
            "service_requested": "mix",
            "timeline": "next week",
            "deliverables": [],
            "references": [],
        },
        studio_name="AI Audio Studio",
        style_summary="Keep the tone concise and grounded.",
    )

    assert "AI Audio Studio" in reply
    assert "concise and grounded" in reply


def test_content_caption_uses_workspace_context():
    caption, hashtags, short = content_main.generate_caption_with_context(
        "A new vocal chain breakdown is ready.",
        "instagram",
        "content-brief",
        studio_name="AI Audio Studio",
        style_summary="Direct, clear, no hype.",
    )

    assert "AI Audio Studio" in caption
    assert "Direct, clear, no hype." in caption
    assert hashtags
    assert short
