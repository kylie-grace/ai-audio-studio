"""Unit tests for audio QC thresholds — no audio files needed."""
import importlib.util
import os
import pytest

ROOT = os.path.join(os.path.dirname(__file__), "../..")
_mod = importlib.util.spec_from_file_location(
    "thresholds",
    os.path.join(ROOT, "services/audio-qc/src/thresholds.py")
)
thresholds_module = importlib.util.module_from_spec(_mod)
_mod.loader.exec_module(thresholds_module)

get_thresholds = thresholds_module.get_thresholds
TARGETS = thresholds_module.TARGETS


class TestThresholds:
    def test_all_targets_loadable(self):
        for target in TARGETS:
            t = get_thresholds(target)
            assert t.lufs_target < 0
            assert t.true_peak_ceiling < 0
            assert 0 < t.min_correlation < 1

    def test_streaming_defaults(self):
        t = get_thresholds("streaming")
        assert t.lufs_target == -14.0
        assert t.true_peak_ceiling == -1.0

    def test_broadcast_strictest(self):
        streaming = get_thresholds("streaming")
        broadcast = get_thresholds("broadcast")
        assert broadcast.lufs_tolerance < streaming.lufs_tolerance
        assert broadcast.true_peak_ceiling < streaming.true_peak_ceiling

    def test_unknown_target_raises(self):
        with pytest.raises(ValueError, match="Unknown delivery target"):
            get_thresholds("unknown_platform")
