from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


RULES_PATH = Path(__file__).resolve().parents[2] / "services" / "openclaw-orchestrator" / "src" / "rules.py"
SPEC = spec_from_file_location("openclaw_rules", RULES_PATH)
MODULE = module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

default_orchestration_rules = MODULE.default_orchestration_rules
default_rule_packs = MODULE.default_rule_packs


def test_default_rule_packs_cover_core_operator_flows():
    packs = default_rule_packs("style-123")

    assert {pack["slug"] for pack in packs} == {
        "lead-intake-defaults",
        "inbox-defaults",
        "content-defaults",
        "session-defaults",
    }
    assert all(pack["rule_count"] >= 3 for pack in packs)
    assert all(rule["style_profile_id"] == "style-123" for pack in packs for rule in pack["rules"])


def test_default_orchestration_rules_expand_all_seeded_rules():
    rules = default_orchestration_rules()

    assert len(rules) >= 12
    assert {rule["target_module"] for rule in rules} >= {
        "lead-intake",
        "inbox-triage",
        "social-drafting",
        "session-prep",
        "revision-parser",
        "delivery-packager",
    }
