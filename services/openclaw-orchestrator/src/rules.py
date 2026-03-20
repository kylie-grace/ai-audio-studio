"""Pure orchestration rule helpers and default seed definitions."""

from __future__ import annotations

import json

RULE_PACKS = (
    {
        "slug": "lead-intake-defaults",
        "name": "Lead Intake Defaults",
        "description": "Routes form, email, and DM inquiries into the lead-intake draft flow.",
        "rules": (
            {
                "slug": "lead-intake-email",
                "name": "Lead Intake From Email",
                "trigger_module": "lead-source",
                "trigger_action": "new-lead",
                "target_module": "lead-intake",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"channel": ["email"]},
            },
            {
                "slug": "lead-intake-form",
                "name": "Lead Intake From Form",
                "trigger_module": "lead-source",
                "trigger_action": "new-lead",
                "target_module": "lead-intake",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"channel": ["form"]},
            },
            {
                "slug": "lead-intake-dm",
                "name": "Lead Intake From DM",
                "trigger_module": "lead-source",
                "trigger_action": "new-lead",
                "target_module": "lead-intake",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"channel": ["dm", "instagram-dm"]},
            },
        ),
    },
    {
        "slug": "inbox-defaults",
        "name": "Inbox Triage Defaults",
        "description": "Classifies client, lead, and scheduling email into the inbox drafting flow.",
        "rules": (
            {
                "slug": "inbox-triage-client",
                "name": "Inbox Triage For Client Mail",
                "trigger_module": "inbox-source",
                "trigger_action": "new-message",
                "target_module": "inbox-triage",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"label": ["Clients", "NeedsReply"]},
            },
            {
                "slug": "inbox-triage-lead",
                "name": "Inbox Triage For Lead Mail",
                "trigger_module": "inbox-source",
                "trigger_action": "new-message",
                "target_module": "inbox-triage",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"label": ["Leads"]},
            },
            {
                "slug": "inbox-triage-scheduling",
                "name": "Inbox Triage For Scheduling",
                "trigger_module": "inbox-source",
                "trigger_action": "new-message",
                "target_module": "inbox-triage",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"category": ["scheduling", "booking"]},
            },
        ),
    },
    {
        "slug": "content-defaults",
        "name": "Content Defaults",
        "description": "Turns approved content briefs into platform-specific draft requests.",
        "rules": (
            {
                "slug": "content-social-instagram",
                "name": "Content Brief To Instagram Draft",
                "trigger_module": "content-source",
                "trigger_action": "new-brief",
                "target_module": "social-drafting",
                "required_tier": 2,
                "approval_required": True,
                "enabled": True,
                "conditions": {"platform": ["instagram"]},
            },
            {
                "slug": "content-social-threads",
                "name": "Content Brief To Threads Draft",
                "trigger_module": "content-source",
                "trigger_action": "new-brief",
                "target_module": "social-drafting",
                "required_tier": 2,
                "approval_required": True,
                "enabled": True,
                "conditions": {"platform": ["threads"]},
            },
            {
                "slug": "content-social-linkedin",
                "name": "Content Brief To LinkedIn Draft",
                "trigger_module": "content-source",
                "trigger_action": "new-brief",
                "target_module": "social-drafting",
                "required_tier": 2,
                "approval_required": True,
                "enabled": True,
                "conditions": {"platform": ["linkedin"]},
            },
        ),
    },
    {
        "slug": "session-defaults",
        "name": "Session And Delivery Defaults",
        "description": "Handles stem intake, revision parsing, and QC-gated delivery packaging.",
        "rules": (
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
                "slug": "revision-parse-protools",
                "name": "Revision Notes To Pro Tools Parse Job",
                "trigger_module": "revision-source",
                "trigger_action": "notes-received",
                "target_module": "revision-parser",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"daw": ["protools"]},
            },
            {
                "slug": "revision-parse-reaper",
                "name": "Revision Notes To Reaper Parse Job",
                "trigger_module": "revision-source",
                "trigger_action": "notes-received",
                "target_module": "revision-parser",
                "required_tier": 3,
                "approval_required": True,
                "enabled": True,
                "conditions": {"daw": ["reaper"]},
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
        ),
    },
)

STARTER_PACKS = (
    {
        "slug": "operator-baseline",
        "name": "Operator Baseline",
        "description": "Prebuilt lead, inbox, session, revision, and delivery routing for a typical studio.",
        "rule_slugs": [
            "lead-intake-email",
            "lead-intake-form",
            "lead-intake-dm",
            "inbox-triage-client",
            "inbox-triage-lead",
            "inbox-triage-scheduling",
            "session-prep-import",
            "revision-parse-protools",
            "revision-parse-reaper",
            "delivery-package-qc-pass",
        ],
        "alert_channels": ["dashboard", "n8n", "webhook"],
    },
    {
        "slug": "content-engine",
        "name": "Content Engine",
        "description": "Draft-only social/content routing with studio tone guidance attached.",
        "rule_slugs": [
            "content-social-instagram",
            "content-social-threads",
            "content-social-linkedin",
        ],
        "alert_channels": ["dashboard", "webhook"],
    },
    {
        "slug": "full-studio-brain",
        "name": "Full Studio Brain",
        "description": "All default rules enabled for a single-Mac or Mac mini control-plane deployment.",
        "rule_slugs": [
            "lead-intake-email",
            "lead-intake-form",
            "lead-intake-dm",
            "inbox-triage-client",
            "inbox-triage-lead",
            "inbox-triage-scheduling",
            "content-social-instagram",
            "content-social-threads",
            "content-social-linkedin",
            "session-prep-import",
            "revision-parse-protools",
            "revision-parse-reaper",
            "delivery-package-qc-pass",
        ],
        "alert_channels": ["dashboard", "n8n", "webhook", "email"],
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
    for pack in RULE_PACKS:
        for rule in pack["rules"]:
            item = dict(rule)
            item["style_profile_id"] = style_profile_id
            rules.append(item)
    return rules


def default_rule_packs(style_profile_id: str | None = None) -> list[dict]:
    packs: list[dict] = []
    for pack in RULE_PACKS:
        serialized_rules: list[dict] = []
        for rule in pack["rules"]:
            item = dict(rule)
            item["style_profile_id"] = style_profile_id
            serialized_rules.append(item)
        packs.append(
            {
                "slug": pack["slug"],
                "name": pack["name"],
                "description": pack["description"],
                "rule_count": len(serialized_rules),
                "rules": serialized_rules,
            }
        )
    return packs


def starter_packs(style_profile_id: str | None = None) -> list[dict]:
    rules_by_slug = {rule["slug"]: rule for rule in default_orchestration_rules(style_profile_id)}
    packs: list[dict] = []
    for pack in STARTER_PACKS:
        packs.append(
            {
                **pack,
                "rules": [rules_by_slug[slug] for slug in pack["rule_slugs"] if slug in rules_by_slug],
            }
        )
    return packs
