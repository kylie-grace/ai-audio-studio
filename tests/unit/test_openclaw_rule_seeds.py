"""Pure tests for OpenClaw rule seed coverage."""

from __future__ import annotations

import importlib.util
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/openclaw-orchestrator")

SPEC = importlib.util.spec_from_file_location("openclaw_rules", os.path.join(SERVICE_ROOT, "src/rules.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

DEFAULT_ORCHESTRATION_RULES = MODULE.DEFAULT_ORCHESTRATION_RULES
default_orchestration_rules = MODULE.default_orchestration_rules
matches_conditions = MODULE.matches_conditions


def test_default_rules_cover_email_and_content_workflows():
    rules = default_orchestration_rules("profile-1")
    slugs = {rule["slug"] for rule in rules}

    assert {
        "lead-intake-email",
        "inbox-triage-email",
        "content-social-draft",
    }.issubset(slugs)

    content_rule = next(rule for rule in rules if rule["slug"] == "content-social-draft")
    assert content_rule["target_module"] == "social-drafting"
    assert content_rule["style_profile_id"] == "profile-1"


def test_default_rule_conditions_are_matchable():
    content_rule = next(rule for rule in DEFAULT_ORCHESTRATION_RULES if rule["slug"] == "content-social-draft")
    assert matches_conditions(content_rule["conditions"], {"platform": "instagram"})
    assert not matches_conditions(content_rule["conditions"], {"platform": "facebook"})

    inbox_rule = next(rule for rule in DEFAULT_ORCHESTRATION_RULES if rule["slug"] == "inbox-triage-email")
    assert matches_conditions(inbox_rule["conditions"], {"label": "NeedsReply"})
    assert not matches_conditions(inbox_rule["conditions"], {"label": "Archive"})
