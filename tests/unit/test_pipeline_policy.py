"""Unit tests for engineer effort level / pipeline policy gating."""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from services.project_state.src.pipeline_policy import is_module_permitted, permitted_modules


class TestEffortLevels:
    def test_level_1_only_session_prep(self):
        assert is_module_permitted("session-prep", 1) is True
        assert is_module_permitted("audio-qc", 1) is False
        assert is_module_permitted("mix-planner", 1) is False

    def test_level_2_adds_audio_qc(self):
        assert is_module_permitted("session-prep", 2) is True
        assert is_module_permitted("audio-qc", 2) is True
        assert is_module_permitted("mix-planner", 2) is False

    def test_level_3_adds_mix_planner(self):
        assert is_module_permitted("mix-planner", 3) is True
        assert is_module_permitted("revision-parser", 3) is False

    def test_level_4_permits_all_audio_modules(self):
        assert is_module_permitted("revision-parser", 4) is True
        assert is_module_permitted("delivery-packager", 4) is True

    def test_ungated_modules_always_permitted(self):
        for module in ("lead-intake", "inbox-triage", "social-drafting"):
            assert is_module_permitted(module, 1) is True

    def test_invalid_level_raises(self):
        with pytest.raises(ValueError, match="Invalid effort_level"):
            is_module_permitted("audio-qc", 5)

    def test_permitted_modules_level_2(self):
        mods = permitted_modules(2)
        assert "session-prep" in mods
        assert "audio-qc" in mods
        assert "mix-planner" not in mods
        assert "lead-intake" in mods  # ungated

    def test_unknown_module_not_permitted(self):
        assert is_module_permitted("some-future-module", 4) is False
