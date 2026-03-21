"""Pure style profile helpers used by CRM and OpenClaw seeds."""

from __future__ import annotations

from collections import Counter
import json
import re

DEFAULT_STYLE_PROFILE_NAME = "Default Studio Tone"
DEFAULT_STYLE_PROFILE_TEXT = (
    "Warm, direct, professional. Avoid hype. Prefer clear timelines, specific asks, "
    "and concise follow-up language."
)


def decode_jsonb(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def extract_guidance(raw_text: str) -> dict:
    lines = [line.strip(" -\t") for line in raw_text.splitlines() if line.strip()]
    sentences = [segment.strip() for segment in re.split(r"[.!?]\s+", raw_text) if segment.strip()]
    keywords = [
        word for word in re.findall(r"[a-zA-Z]{4,}", raw_text.lower())
        if word not in {"that", "with", "this", "your", "from", "have", "will", "they", "their", "about"}
    ]
    tone_markers = [line for line in lines if any(token in line.lower() for token in ("tone", "voice", "avoid", "prefer", "always", "never"))]
    return {
        "summary": " ".join(sentences[:3])[:500],
        "tone_markers": tone_markers[:10],
        "preferred_phrases": [item for item, _ in Counter(keywords).most_common(12)],
        "sample_lines": lines[:8],
    }


def serialize_style_profile(row) -> dict:
    data = dict(row)
    data["file_paths"] = decode_jsonb(data.get("file_paths"))
    data["extracted_guidance"] = decode_jsonb(data.get("extracted_guidance"))
    if data.get("created_at") and hasattr(data["created_at"], "isoformat"):
        data["created_at"] = data["created_at"].isoformat()
    if data.get("updated_at") and hasattr(data["updated_at"], "isoformat"):
        data["updated_at"] = data["updated_at"].isoformat()
    return data
