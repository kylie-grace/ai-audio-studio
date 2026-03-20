"""Pure orchestration rule helpers and default seed definitions."""

from __future__ import annotations

import json

DEFAULT_ORCHESTRATION_RULES = (
    {
        "slug": "lead-intake-email",
        "name": "Lead Intake From Email",
        "trigger_module": "lead-source",
        "trigger_action": "new-lead",
        "target_module": "lead-intake",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"channel": ["form", "email", "dm"]},
    },
    {
        "slug": "inbox-triage-email",
        "name": "Inbox Triage From Email",
        "trigger_module": "inbox-source",
        "trigger_action": "new-message",
        "target_module": "inbox-triage",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"label": ["NeedsReply", "Clients", "Leads"]},
    },
    {
        "slug": "content-social-draft",
        "name": "Content Brief To Social Draft",
        "trigger_module": "content-source",
        "trigger_action": "new-brief",
        "target_module": "social-drafting",
        "required_tier": 2,
        "approval_required": True,
        "enabled": True,
        "conditions": {"platform": ["instagram", "threads", "linkedin"]},
    },
    {
        "slug": "session-prep-import",
        "name": "Session Prep From Stem Import",
        "trigger_module": "session-source",
        "trigger_action": "import-stems",
        "target_module": "session-prep",
        "required_tier": 4,
        "approval_required": True,
        "enabled": True,
        "conditions": {},
    },
    {
        "slug": "revision-parse-notes",
        "name": "Revision Notes To Parse Job",
        "trigger_module": "revision-source",
        "trigger_action": "notes-received",
        "target_module": "revision-parser",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"daw": ["protools", "reaper"]},
    },
    {
        "slug": "delivery-package-qc-pass",
        "name": "QC Pass To Delivery Packaging",
        "trigger_module": "qc-source",
        "trigger_action": "qc-pass",
        "target_module": "delivery-packager",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"overall_pass": [True]},
    },
)


def decode_jsonb(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def serialize_rule(row) -> dict:
    data = dict(row)
    if "conditions" in data:
        data["conditions"] = decode_jsonb(data["conditions"])
    if "extracted_guidance" in data:
        data["extracted_guidance"] = decode_jsonb(data["extracted_guidance"])
    return data


def matches_conditions(conditions: dict, context: dict) -> bool:
    for key, expected in conditions.items():
        actual = context.get(key)
        if isinstance(expected, list):
            if actual not in expected:
                return False
        elif actual != expected:
            return False
    return True


def default_orchestration_rules(style_profile_id: str | None = None) -> list[dict]:
    rules: list[dict] = []
    for rule in DEFAULT_ORCHESTRATION_RULES:
        item = dict(rule)
        item["style_profile_id"] = style_profile_id
        rules.append(item)
    return rules
