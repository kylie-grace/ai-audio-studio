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

RULE_PACKS = MODULE.RULE_PACKS
STARTER_PACKS = MODULE.STARTER_PACKS
default_rule_packs = MODULE.default_rule_packs
default_orchestration_rules = MODULE.default_orchestration_rules
matches_conditions = MODULE.matches_conditions
starter_pack_application = MODULE.starter_pack_application
starter_pack_by_slug = MODULE.starter_pack_by_slug
starter_packs = MODULE.starter_packs


def test_default_rules_cover_email_and_content_workflows():
    rules = default_orchestration_rules("profile-1")
    slugs = {rule["slug"] for rule in rules}

    assert {
        "lead-intake-email",
        "lead-intake-form",
        "inbox-triage-client",
        "content-social-instagram",
    }.issubset(slugs)

    content_rule = next(rule for rule in rules if rule["slug"] == "content-social-instagram")
    assert content_rule["target_module"] == "social-drafting"
    assert content_rule["style_profile_id"] == "profile-1"


def test_default_rule_conditions_are_matchable():
    flattened_rules = tuple(rule for pack in RULE_PACKS for rule in pack["rules"])

    content_rule = next(rule for rule in flattened_rules if rule["slug"] == "content-social-instagram")
    assert matches_conditions(content_rule["conditions"], {"platform": "instagram"})
    assert not matches_conditions(content_rule["conditions"], {"platform": "facebook"})

    inbox_rule = next(rule for rule in flattened_rules if rule["slug"] == "inbox-triage-client")
    assert matches_conditions(inbox_rule["conditions"], {"label": "NeedsReply"})
    assert not matches_conditions(inbox_rule["conditions"], {"label": "Archive"})


def test_starter_packs_cover_full_default_surface():
    default_packs = default_rule_packs("profile-1")
    starter = starter_packs("profile-1")
    flattened_rules = tuple(rule for pack in RULE_PACKS for rule in pack["rules"])

    assert len(default_packs) == len(RULE_PACKS)
    assert len(starter) == len(STARTER_PACKS)

    full_pack = next(pack for pack in starter if pack["slug"] == "full-studio-brain")
    assert len(full_pack["rules"]) == len(flattened_rules)
    assert "email" in full_pack["alert_channels"]

    baseline = next(pack for pack in starter if pack["slug"] == "operator-baseline")
    assert any(rule["slug"] == "revision-parse-protools" for rule in baseline["rules"])


def test_starter_pack_lookup_and_application_plan():
    pack = starter_pack_by_slug("operator-baseline", "profile-1")
    assert pack is not None
    assert pack["slug"] == "operator-baseline"

    application = starter_pack_application("operator-baseline", exclusive=True, style_profile_id="profile-1")
    assert "lead-intake-email" in application["enabled_rule_slugs"]
    assert "content-social-instagram" in application["disabled_rule_slugs"]
    assert application["exclusive"] is True


def test_nonexclusive_pack_application_keeps_other_default_rules_enabled():
    application = starter_pack_application("content-engine", exclusive=False, style_profile_id="profile-1")
    assert "content-social-instagram" in application["enabled_rule_slugs"]
    assert application["disabled_rule_slugs"] == []
