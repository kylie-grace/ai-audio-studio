"""Pure tests for default studio tone helpers."""

from __future__ import annotations

import importlib.util
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/crm-api")

SPEC = importlib.util.spec_from_file_location("crm_style_profiles", os.path.join(SERVICE_ROOT, "src/style_profiles.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

DEFAULT_STYLE_PROFILE_TEXT = MODULE.DEFAULT_STYLE_PROFILE_TEXT
extract_guidance = MODULE.extract_guidance
serialize_style_profile = MODULE.serialize_style_profile


def test_extract_guidance_distills_style_context():
    guidance = extract_guidance(DEFAULT_STYLE_PROFILE_TEXT)

    assert guidance["summary"]
    assert "clear timelines" in guidance["preferred_phrases"] or "timelines" in guidance["preferred_phrases"]
    assert guidance["tone_markers"]


def test_serialize_style_profile_decodes_jsonb_fields():
    row = {
        "id": "style-1",
        "file_paths": '["/tmp/reference.txt"]',
        "extracted_guidance": '{"summary":"concise"}',
    }

    serialized = serialize_style_profile(row)

    assert serialized["file_paths"] == ["/tmp/reference.txt"]
    assert serialized["extracted_guidance"] == {"summary": "concise"}
