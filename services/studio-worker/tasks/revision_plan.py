"""Revision planning task that produces approval-gated script artifacts."""

from __future__ import annotations

import json
import re

from paths import translate_path


def parse_changes(raw_notes: str) -> list[dict]:
    changes = []
    for sentence in re.split(r"[.\n]+", raw_notes):
        text = sentence.strip()
        if not text:
            continue
        lower = text.lower()
        element = next((item for item in ("vocals", "kick", "bass", "snare", "synth", "pads", "drums") if item in lower), "mix")
        parameter = "other"
        if "quiet" in lower or "loud" in lower or "level" in lower:
            parameter = "level"
        elif "eq" in lower or "muddy" in lower or "bright" in lower:
            parameter = "eq"
        elif "reverb" in lower:
            parameter = "reverb"
        elif "width" in lower or "wide" in lower:
            parameter = "stereo_width"
        direction = "adjust"
        if any(token in lower for token in ("up", "more", "raise", "louder")):
            direction = "up"
        elif any(token in lower for token in ("down", "less", "lower", "quieter")):
            direction = "down"
        confidence = 0.9 if parameter != "other" and element != "mix" else 0.55
        changes.append(
            {
                "element": element,
                "section": "full track",
                "parameter": parameter,
                "direction": direction,
                "value": None,
                "value_range": ["+1dB", "+3dB"] if direction == "up" else ["-3dB", "-1dB"],
                "confidence": confidence,
                "human_readable": text,
                "requires_clarification": confidence < 0.65,
            }
        )
    return changes


def generate_revision_artifacts(payload: dict, settings) -> dict:
    project_slug = payload["project_slug"]
    shared_root = translate_path(payload.get("shared_projects_path", settings.shared_projects_path), settings.path_translation_json)
    session_dir = shared_root / project_slug / "session"
    session_dir.mkdir(parents=True, exist_ok=True)
    changes = parse_changes(payload["raw_notes"])
    script_path = session_dir / f"{payload['daw']}_revision_script.json"
    script_path.write_text(json.dumps(changes, indent=2))
    return {"changes": changes, "script_path": str(script_path)}
